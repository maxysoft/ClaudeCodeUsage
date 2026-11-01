import { createHash } from 'node:crypto';

import type { AdviceFormat } from '../advisor';
import { stableAdvicePayloadStringify } from './payload';

const AI_INVOCATION_SCHEMA_VERSION = 1 as const;
const AI_MAX_TOKENS = 16_000;
const DEFAULT_TIMEOUT_MS = 120_000;

export type AiInvocationKind = 'advice' | 'optimizer';
export type AiInvocationDataMode =
  | 'aggregates-only'
  | 'aggregates-with-personalization'
  | 'aggregates-with-prompt-samples'
  | 'user-draft-only';

export interface PrepareAiInvocationInput {
  kind: AiInvocationKind;
  apiFormat: AdviceFormat;
  apiUrl: string;
  model: string;
  reasoningEffort?: string;
  systemPrompt: string;
  userContent: string;
  dataMode: AiInvocationDataMode;
  /** Opaque provider-index or draft revision; never a path/session/title. */
  sourceRevision: string;
  consentGeneration: number;
  createdAtEpochMs: number;
  timeoutMs?: number;
  responseSchema?: { name: string; schema: Record<string, unknown> };
}

export interface PreparedAiInvocation {
  readonly schemaVersion: typeof AI_INVOCATION_SCHEMA_VERSION;
  readonly kind: AiInvocationKind;
  readonly apiFormat: AdviceFormat;
  readonly endpoint: string;
  readonly model: string;
  readonly dataMode: AiInvocationDataMode;
  readonly sourceRevision: string;
  readonly consentGeneration: number;
  readonly createdAtEpochMs: number;
  readonly timeoutMs: number;
  readonly contentType: 'application/json';
  /** Canonical full provider HTTP body. It is never rebuilt after preparation. */
  readonly serializedBody: string;
  readonly canonicalBytes: Uint8Array;
  readonly sha256: string;
  readonly fallbackSerializedBody?: string;
  readonly fallbackCanonicalBytes?: Uint8Array;
  readonly fallbackSha256?: string;
}

export interface AiInvocationPreview {
  kind: AiInvocationKind;
  endpoint: string;
  apiFormat: AdviceFormat;
  model: string;
  dataMode: AiInvocationDataMode;
  contentType: 'application/json';
  body: string;
  utf8Bytes: number;
  sha256: string;
  fallbackBody?: string;
  fallbackUtf8Bytes?: number;
  fallbackSha256?: string;
}

export interface PreparedAiSendAuthorization {
  backend: 'api';
  apiKey: string;
  expectedSourceRevision?: string;
  expectedConsentGeneration?: number;
  signal?: AbortSignal;
}

export interface PreparedAiTransportRequest {
  endpoint: string;
  apiFormat: AdviceFormat;
  contentType: 'application/json';
  headers: Record<string, string>;
  /** Same object identity as PreparedAiInvocation.canonicalBytes. */
  canonicalBytes: Uint8Array;
  fallbackCanonicalBytes?: Uint8Array;
  timeoutMs: number;
  signal?: AbortSignal;
}

export type PreparedAiTransport<T> = (request: PreparedAiTransportRequest) => Promise<T>;

// The public SHA-256 identifies body bytes only. This private snapshot also binds
// destination/format/model and consent metadata to the original host-owned
// invocation, so changing public fields or recomputing its hash cannot reseal it.
const preparedInvocationSeals = new WeakMap<PreparedAiInvocation, PreparedAiInvocation>();

function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === 'localhost' || host === '[::1]' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function normalizeAiEndpoint(value: string, apiFormat: AdviceFormat): string {
  if (typeof value !== 'string') {
    throw new Error('AI endpoint must be an absolute HTTP(S) URL');
  }
  const configured = value.trim();
  if (!/^https?:\/\/[^/?#]+/i.test(configured) || /[\u0000-\u0020\u007f\\]/.test(configured)) {
    throw new Error('AI endpoint must be an absolute HTTP(S) URL');
  }
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    // URL parser errors can include the input, which may contain credentials.
    throw new Error('AI endpoint must be an absolute HTTP(S) URL');
  }
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) {
    throw new Error('AI endpoint must be an absolute HTTP(S) URL');
  }
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    throw new Error('AI endpoint must use HTTPS unless it is a loopback address');
  }
  // Arbitrary query/fragment values may be proxy credentials. Reject them
  // rather than leak them in the exact endpoint preview or silently strip them.
  // BYOK authorization belongs in the separately supplied API-key header.
  if (url.username || url.password || configured.includes('?') || configured.includes('#')) {
    throw new Error('AI endpoint URL must not include credentials, query parameters, or fragments');
  }
  const path = url.pathname.replace(/\/+$/, '');
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const messages = path.endsWith('/messages');
  const chatCompletions = path.endsWith('/chat/completions');
  // DeepSeek exposes an explicit Anthropic-compatible prefix. Do not reject
  // that documented route or invent it for a Chat Completions configuration.
  const deepSeekAnthropic = hostname === 'api.deepseek.com' &&
    (path === '/anthropic' || path.startsWith('/anthropic/'));
  if (
    (apiFormat === 'anthropic' && (chatCompletions ||
      (hostname === 'api.deepseek.com' && !deepSeekAnthropic) || hostname === 'api.openai.com')) ||
    (apiFormat === 'openai' && (messages || deepSeekAnthropic || hostname === 'api.anthropic.com'))
  ) {
    throw new Error('AI endpoint is incompatible with the configured API format');
  }
  // Only protocol paths are appended. Keep the configured origin and any proxy
  // prefix, including a supplied /v1, instead of guessing a different provider.
  url.pathname = apiFormat === 'anthropic'
    ? messages ? path : `${path}${path.endsWith('/v1') ? '' : '/v1'}/messages`
    : chatCompletions ? path : `${path}/chat/completions`;
  return url.toString();
}

function requireBoundedText(value: string, label: string, maxChars: number): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const text = value.trim();
  if (text.length === 0 || text.length > maxChars) {
    throw new Error(`${label} must contain 1-${maxChars} characters`);
  }
  return value;
}

function requireOpaqueRevision(value: string): string {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(value)) {
    throw new Error('sourceRevision must be an opaque revision');
  }
  return value;
}

function requestBody(
  input: PrepareAiInvocationInput,
  model: string,
  withResponseFormat = true,
): Record<string, unknown> {
  const responseSchema = input.responseSchema;
  if (input.apiFormat === 'anthropic') {
    return {
      model,
      max_tokens: AI_MAX_TOKENS,
      system: requireBoundedText(input.systemPrompt, 'systemPrompt', 40_000),
      messages: [{ role: 'user', content: requireBoundedText(input.userContent, 'userContent', 200_000) }],
      ...(responseSchema
        ? {
            tools: [{ name: responseSchema.name, input_schema: responseSchema.schema }],
            tool_choice: { type: 'tool', name: responseSchema.name },
          }
        : {}),
    };
  }
  const body: Record<string, unknown> = {
    model,
    stream: false,
    messages: [
      { role: 'system', content: requireBoundedText(input.systemPrompt, 'systemPrompt', 40_000) },
      { role: 'user', content: requireBoundedText(input.userContent, 'userContent', 200_000) },
    ],
  };
  const reasoningEffort = input.reasoningEffort?.trim();
  if (reasoningEffort) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(reasoningEffort)) {
      throw new Error('reasoningEffort is invalid');
    }
    body.reasoning_effort = reasoningEffort;
  }
  if (responseSchema && withResponseFormat) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: responseSchema.name, strict: true, schema: responseSchema.schema },
    };
  }
  return body;
}

/** Prepare the complete provider wire body exactly once. No credential enters it. */
export function prepareAiInvocation(input: PrepareAiInvocationInput): PreparedAiInvocation {
  if (input.kind !== 'advice' && input.kind !== 'optimizer') {
    throw new Error('AI invocation kind is invalid');
  }
  if (input.apiFormat !== 'anthropic' && input.apiFormat !== 'openai') {
    throw new Error('AI invocation format is invalid');
  }
  if (!Number.isInteger(input.consentGeneration) || input.consentGeneration < 0) {
    throw new Error('consentGeneration must be a non-negative integer');
  }
  if (!Number.isFinite(input.createdAtEpochMs) || input.createdAtEpochMs < 0) {
    throw new Error('createdAtEpochMs must be finite and non-negative');
  }
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 10 * 60_000) {
    throw new Error('timeoutMs is outside the supported range');
  }
  const endpoint = normalizeAiEndpoint(input.apiUrl, input.apiFormat);
  const model = requireBoundedText(input.model, 'model', 256).trim();
  const serializedBody = stableAdvicePayloadStringify(requestBody(input, model));
  const canonicalBytes = Buffer.from(serializedBody, 'utf8');
  const sha256 = createHash('sha256').update(canonicalBytes).digest('hex');
  const fallbackSerializedBody = input.apiFormat === 'openai' && input.responseSchema
    ? stableAdvicePayloadStringify(requestBody(input, model, false))
    : undefined;
  const fallbackCanonicalBytes = fallbackSerializedBody === undefined
    ? undefined
    : Buffer.from(fallbackSerializedBody, 'utf8');
  const prepared: PreparedAiInvocation = {
    schemaVersion: AI_INVOCATION_SCHEMA_VERSION,
    kind: input.kind,
    apiFormat: input.apiFormat,
    endpoint,
    model,
    dataMode: input.dataMode,
    sourceRevision: requireOpaqueRevision(input.sourceRevision),
    consentGeneration: input.consentGeneration,
    createdAtEpochMs: input.createdAtEpochMs,
    timeoutMs,
    contentType: 'application/json',
    serializedBody,
    canonicalBytes,
    sha256,
    ...(fallbackSerializedBody === undefined || fallbackCanonicalBytes === undefined ? {} : {
      fallbackSerializedBody,
      fallbackCanonicalBytes,
      fallbackSha256: createHash('sha256').update(fallbackCanonicalBytes).digest('hex'),
    }),
  };
  preparedInvocationSeals.set(prepared, { ...prepared });
  return prepared;
}

export function assertPreparedAiInvocationIntegrity(prepared: PreparedAiInvocation): void {
  const sealed = preparedInvocationSeals.get(prepared);
  if (
    !sealed ||
    (Object.keys(sealed) as (keyof PreparedAiInvocation)[]).some((key) => {
      const property = Object.getOwnPropertyDescriptor(prepared, key);
      return !property || !('value' in property) || property.value !== sealed[key];
    }) ||
    prepared.schemaVersion !== AI_INVOCATION_SCHEMA_VERSION ||
    !(prepared.canonicalBytes instanceof Uint8Array) ||
    prepared.contentType !== 'application/json'
  ) {
    throw new Error('prepared AI invocation integrity check failed');
  }
  const decoded = Buffer.from(prepared.canonicalBytes).toString('utf8');
  const digest = createHash('sha256').update(prepared.canonicalBytes).digest('hex');
  if (decoded !== prepared.serializedBody || digest !== prepared.sha256) {
    throw new Error('prepared AI invocation integrity check failed');
  }
  if (prepared.fallbackCanonicalBytes) {
    const fallbackDigest = createHash('sha256').update(prepared.fallbackCanonicalBytes).digest('hex');
    if (
      Buffer.from(prepared.fallbackCanonicalBytes).toString('utf8') !== prepared.fallbackSerializedBody ||
      fallbackDigest !== prepared.fallbackSha256
    ) {
      throw new Error('prepared AI invocation integrity check failed');
    }
  }
}

export function previewAiInvocation(prepared: PreparedAiInvocation): AiInvocationPreview {
  assertPreparedAiInvocationIntegrity(prepared);
  const sealed = preparedInvocationSeals.get(prepared)!;
  return {
    kind: sealed.kind,
    endpoint: sealed.endpoint,
    apiFormat: sealed.apiFormat,
    model: sealed.model,
    dataMode: sealed.dataMode,
    contentType: sealed.contentType,
    body: Buffer.from(sealed.canonicalBytes).toString('utf8'),
    utf8Bytes: sealed.canonicalBytes.byteLength,
    sha256: sealed.sha256,
    ...(sealed.fallbackCanonicalBytes === undefined ? {} : {
      fallbackBody: Buffer.from(sealed.fallbackCanonicalBytes).toString('utf8'),
      fallbackUtf8Bytes: sealed.fallbackCanonicalBytes.byteLength,
      fallbackSha256: sealed.fallbackSha256,
    }),
  };
}

/**
 * The only send boundary. It validates current consent/source generation and
 * gives transport the original canonical byte object; it cannot reserialize.
 */
export async function sendPreparedAiInvocation<T>(
  prepared: PreparedAiInvocation,
  authorization: PreparedAiSendAuthorization,
  transport: PreparedAiTransport<T>,
): Promise<T> {
  assertPreparedAiInvocationIntegrity(prepared);
  const sealed = preparedInvocationSeals.get(prepared)!;
  if (!authorization || authorization.backend !== 'api') {
    throw new Error('Only the configured BYOK API backend may send AI requests');
  }
  const apiKey = authorization.apiKey?.trim();
  if (!apiKey) throw new Error('A user-configured API key is required');
  const { expectedSourceRevision, expectedConsentGeneration, signal } = authorization;
  if (
    (expectedSourceRevision !== undefined && expectedSourceRevision !== sealed.sourceRevision) ||
    (expectedConsentGeneration !== undefined && expectedConsentGeneration !== sealed.consentGeneration)
  ) {
    throw new Error('The prepared AI invocation is stale');
  }
  if (signal?.aborted) {
    throw new Error('The prepared AI invocation was cancelled');
  }
  // Authorization is a caller-supplied object. Recheck after reading it and use
  // only the private snapshot to prevent mutation between validation and dispatch.
  assertPreparedAiInvocationIntegrity(prepared);
  const headers: Record<string, string> = sealed.apiFormat === 'anthropic'
    ? {
        'Content-Type': sealed.contentType,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      }
    : {
        'Content-Type': sealed.contentType,
        Authorization: `Bearer ${apiKey}`,
      };
  const result = await transport({
    endpoint: sealed.endpoint,
    apiFormat: sealed.apiFormat,
    contentType: sealed.contentType,
    headers,
    canonicalBytes: sealed.canonicalBytes,
    ...(sealed.fallbackCanonicalBytes === undefined
      ? {}
      : { fallbackCanonicalBytes: sealed.fallbackCanonicalBytes }),
    timeoutMs: sealed.timeoutMs,
    ...(signal ? { signal } : {}),
  });
  // The production response parser also relies on apiFormat after awaiting the
  // transport. Detect in-flight mutation before that parser can use changed data.
  assertPreparedAiInvocationIntegrity(prepared);
  return result;
}
