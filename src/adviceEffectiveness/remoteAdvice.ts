import type {
  PreparedAiTransportRequest,
  PreparedAiInvocation,
} from './preparedRequest';
import { prepareAiInvocation } from './preparedRequest';
import type { PreparedAdvicePayload } from './payload';
import { previewAdvicePayload } from './payload';
import { parseStructuredAdviceOutput, STRUCTURED_ADVICE_JSON_SCHEMA } from './structuredOutput';
import type {
  StructuredAdviceOutput,
  StructuredAdviceParseErrorCode,
  StructuredAdviceReferences,
} from './structuredOutput';
import type { HttpResponse } from '../httpClient';
import { sendPreparedModelRequest } from '../advisor';

const STRUCTURED_ADVICE_SCHEMA_NAME = 'structured_advice';

export const STRUCTURED_ADVICE_EXAMPLE: StructuredAdviceOutput = {
  schemaVersion: 1,
  recommendations: [
    {
      id: 'recommendation-split-long-sessions',
      title: 'Split long sessions before context reuse grows',
      evidenceIds: ['evidence-example-cache-share'],
      explanation: {
        summary: 'Most input tokens are cache reads, which suggests very long sessions.',
        proxyMetricObservationIds: ['observation-example-cache-share'],
        limitations: ['Cache share is a proxy for session length, not proof of waste.'],
      },
      conditionalActions: [
        {
          when: 'When a session continues after its task is finished',
          action: 'Start a new session for the next unrelated task.',
          evidenceIds: ['evidence-example-cache-share'],
          stopCondition: 'Stop if task quality drops on the rubric.',
        },
      ],
      successCriteria: [
        {
          metricObservationId: 'observation-example-cache-share',
          direction: 'decrease',
          target: { kind: 'relative-change', value: 0.1 },
          minimumComparableTasks: 5,
          qualityGuardrail: {
            rubricId: 'task-quality-rubric-v1',
            minimumScore: 0.8,
            maximumRegression: 0.05,
          },
        },
      ],
    },
  ],
};

export const STRUCTURED_ADVICE_SYSTEM_PROMPT = [
  'Return exactly one JSON object that validates against this JSON Schema:',
  JSON.stringify(STRUCTURED_ADVICE_JSON_SCHEMA),
  'Example of a complete valid response:',
  JSON.stringify(STRUCTURED_ADVICE_EXAMPLE),
  'The IDs in the example are placeholders. Reference only observation and evidence IDs ' +
    'present in the user payload. Do not add Markdown fences, prose outside the JSON object, ' +
    'or unknown fields. Return an empty recommendations array when the evidence is insufficient.',
].join('\n');

function outermostJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return start >= 0 && end > start ? raw.slice(start, end + 1) : raw;
}

export interface StructuredAdviceInvocationConfig {
  apiFormat: 'anthropic' | 'openai';
  apiUrl: string;
  model: string;
  reasoningEffort?: string;
  sourceRevision: string;
  consentGeneration: number;
  createdAtEpochMs: number;
  timeoutMs?: number;
}

export interface StructuredAdviceSendOptions {
  apiKey: string;
  expectedSourceRevision?: string;
  expectedConsentGeneration?: number;
  signal?: AbortSignal;
  transport?: (request: PreparedAiTransportRequest) => Promise<HttpResponse>;
}

export type StructuredAdviceRequestResult =
  | { ok: true; value: StructuredAdviceOutput }
  | {
      ok: false;
      code: StructuredAdviceParseErrorCode | 'transport-error' | 'invalid-prepared-request';
      issues: string[];
    };

/**
 * Wrap the sealed evidence body in the provider's complete HTTP body exactly
 * once. The returned object, not the evidence-only inner payload, is what both
 * preview and transport consume.
 */
export function prepareStructuredAdviceInvocation(
  evidence: PreparedAdvicePayload,
  config: StructuredAdviceInvocationConfig,
): PreparedAiInvocation {
  // This assertion catches any mismatch between the inner evidence preview and
  // its bytes before those exact bytes are embedded in the provider body.
  previewAdvicePayload(evidence);
  return prepareAiInvocation({
    kind: 'advice',
    apiFormat: config.apiFormat,
    apiUrl: config.apiUrl,
    model: config.model,
    ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
    systemPrompt: STRUCTURED_ADVICE_SYSTEM_PROMPT,
    userContent: evidence.serializedBody,
    responseSchema: { name: STRUCTURED_ADVICE_SCHEMA_NAME, schema: STRUCTURED_ADVICE_JSON_SCHEMA },
    dataMode: evidence.dataMode,
    sourceRevision: config.sourceRevision,
    consentGeneration: config.consentGeneration,
    createdAtEpochMs: config.createdAtEpochMs,
    ...(config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs }),
  });
}

/**
 * Strict advice send boundary. Only an already-prepared advice invocation may
 * cross it. The outermost JSON object is taken from surrounding prose or
 * fences; malformed output is rejected without repair.
 */
export async function requestStructuredAdvice(
  prepared: PreparedAiInvocation,
  references: StructuredAdviceReferences,
  options: StructuredAdviceSendOptions,
): Promise<StructuredAdviceRequestResult> {
  if (prepared.kind !== 'advice' || prepared.dataMode === 'user-draft-only') {
    return {
      ok: false,
      code: 'invalid-prepared-request',
      issues: ['prepared request is not structured advice'],
    };
  }
  let raw: string;
  try {
    raw = await sendPreparedModelRequest(prepared, options.apiKey, {
      ...(options.expectedSourceRevision === undefined
        ? {}
        : { expectedSourceRevision: options.expectedSourceRevision }),
      ...(options.expectedConsentGeneration === undefined
        ? {}
        : { expectedConsentGeneration: options.expectedConsentGeneration }),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.transport ? { transport: options.transport } : {}),
    });
  } catch {
    return {
      ok: false,
      code: 'transport-error',
      issues: ['configured BYOK transport failed'],
    };
  }
  return parseStructuredAdviceOutput(outermostJsonObject(raw), references);
}
