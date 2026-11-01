import {
  ADVICE_CONTRACT_VERSION,
  ADVICE_ID_PATTERN,
  AdviceConditionalAction,
  AdviceExplanation,
  AdviceQualityGuardrail,
  AdviceRecommendation,
  AdviceSuccessCriterion,
  isAdviceIdentifier,
} from './contract';

export interface StructuredAdviceOutput {
  schemaVersion: typeof ADVICE_CONTRACT_VERSION;
  /** Empty is a valid "no supported recommendation" result. */
  recommendations: AdviceRecommendation[];
}

export interface StructuredAdviceReferences {
  observationIds: readonly string[];
  evidenceIds: readonly string[];
}

export type StructuredAdviceParseErrorCode =
  | 'empty-output'
  | 'output-too-large'
  | 'invalid-json'
  | 'invalid-schema'
  | 'unknown-reference';

export type StructuredAdviceParseResult =
  | { ok: true; value: StructuredAdviceOutput }
  | { ok: false; code: StructuredAdviceParseErrorCode; issues: string[] };

const MAX_RAW_CHARS = 100_000;
const MAX_RECOMMENDATIONS = 8;
const MAX_ACTIONS = 4;
const MAX_CRITERIA = 4;
const MAX_REFERENCES = 12;
const MAX_LIMITATIONS = 8;
const MIN_COMPARABLE_TASKS = 2;
const MAX_COMPARABLE_TASKS = 10_000;
const DIRECTIONS = ['increase', 'decrease', 'maintain'] as const;
const TARGET_KINDS = ['relative-change', 'absolute'] as const;

type JsonSchema = Record<string, unknown>;
type ObjectSchema = {
  type: 'object';
  properties: Record<string, JsonSchema>;
  required: string[];
  additionalProperties: false;
};

function objectSchema<T>(properties: { [K in keyof Required<T>]: JsonSchema }): ObjectSchema {
  return { type: 'object', properties, required: Object.keys(properties), additionalProperties: false };
}

const ID_SCHEMA = { type: 'string', pattern: ADVICE_ID_PATTERN.source };
const TEXT_SCHEMA = { type: 'string' };
const SCORE_SCHEMA = { type: 'number', minimum: 0, maximum: 1 };

function idListSchema(minItems: number): JsonSchema {
  return { type: 'array', items: ID_SCHEMA, minItems, maxItems: MAX_REFERENCES };
}

const EXPLANATION_SCHEMA = objectSchema<AdviceExplanation>({
  summary: TEXT_SCHEMA,
  proxyMetricObservationIds: idListSchema(0),
  limitations: { type: 'array', items: TEXT_SCHEMA, maxItems: MAX_LIMITATIONS },
});
const ACTION_SCHEMA = objectSchema<AdviceConditionalAction>({
  when: TEXT_SCHEMA,
  action: TEXT_SCHEMA,
  evidenceIds: idListSchema(1),
  stopCondition: { type: ['string', 'null'] },
});
const GUARDRAIL_SCHEMA = objectSchema<AdviceQualityGuardrail>({
  rubricId: ID_SCHEMA,
  minimumScore: SCORE_SCHEMA,
  maximumRegression: SCORE_SCHEMA,
});
const TARGET_SCHEMA = objectSchema<AdviceSuccessCriterion['target']>({
  kind: { type: 'string', enum: [...TARGET_KINDS] },
  value: { type: 'number', minimum: 0 },
});
const CRITERION_SCHEMA = objectSchema<AdviceSuccessCriterion>({
  metricObservationId: ID_SCHEMA,
  direction: { type: 'string', enum: [...DIRECTIONS] },
  target: TARGET_SCHEMA,
  minimumComparableTasks: { type: 'integer', minimum: MIN_COMPARABLE_TASKS, maximum: MAX_COMPARABLE_TASKS },
  qualityGuardrail: GUARDRAIL_SCHEMA,
});
const RECOMMENDATION_SCHEMA = objectSchema<AdviceRecommendation>({
  id: ID_SCHEMA,
  title: TEXT_SCHEMA,
  evidenceIds: idListSchema(1),
  explanation: EXPLANATION_SCHEMA,
  conditionalActions: { type: 'array', items: ACTION_SCHEMA, minItems: 1, maxItems: MAX_ACTIONS },
  successCriteria: { type: 'array', items: CRITERION_SCHEMA, minItems: 1, maxItems: MAX_CRITERIA },
});

/** Sent to providers as the structured-output schema; the parser below checks keys against it. */
export const STRUCTURED_ADVICE_JSON_SCHEMA = objectSchema<StructuredAdviceOutput>({
  schemaVersion: { type: 'integer', enum: [ADVICE_CONTRACT_VERSION] },
  recommendations: { type: 'array', items: RECOMMENDATION_SCHEMA, maxItems: MAX_RECOMMENDATIONS },
});

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasShape(value: Record<string, unknown>, schema: ObjectSchema): boolean {
  const actual = Object.keys(value);
  return (
    actual.every((key) => Object.prototype.hasOwnProperty.call(schema.properties, key)) &&
    schema.required.every((key) => actual.includes(key) || isNullable(schema.properties[key]))
  );
}

function isNullable(schema: JsonSchema): boolean {
  return Array.isArray(schema.type) && schema.type.includes('null');
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function boundedText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length > 0 && text.length <= max ? text : undefined;
}

function idArray(
  value: unknown,
  max: number,
  known: Set<string>,
  path: string,
  issues: string[],
  allowEmpty: boolean = false
): string[] | undefined {
  if (!Array.isArray(value) || value.length > max || (!allowEmpty && value.length === 0)) {
    issues.push(`${path} must be a bounded reference array`);
    return undefined;
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !isAdviceIdentifier(item) || seen.has(item)) {
      issues.push(`${path} contains an invalid or duplicate id`);
      return undefined;
    }
    if (!known.has(item)) {
      issues.push(`${path} contains an unknown reference`);
      return undefined;
    }
    seen.add(item);
    out.push(item);
  }
  return out;
}

function textArray(value: unknown, path: string, issues: string[]): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_LIMITATIONS) {
    issues.push(`${path} must be a bounded string array`);
    return undefined;
  }
  const out: string[] = [];
  for (const item of value) {
    const text = boundedText(item, 400);
    if (!text) {
      issues.push(`${path} contains invalid text`);
      return undefined;
    }
    out.push(text);
  }
  return out;
}

function parseExplanation(
  value: unknown,
  observationIds: Set<string>,
  path: string,
  issues: string[]
): AdviceExplanation | undefined {
  if (!isObject(value) || !hasShape(value, EXPLANATION_SCHEMA)) {
    issues.push(`${path} has an invalid shape`);
    return undefined;
  }
  const summary = boundedText(value.summary, 1_500);
  const proxyMetricObservationIds = idArray(
    value.proxyMetricObservationIds,
    MAX_REFERENCES,
    observationIds,
    `${path}.proxyMetricObservationIds`,
    issues,
    true
  );
  const limitations = textArray(value.limitations, `${path}.limitations`, issues);
  if (!summary || !proxyMetricObservationIds || !limitations) {
    if (!summary) issues.push(`${path}.summary is empty or too long`);
    return undefined;
  }
  if (proxyMetricObservationIds.length > 0 && limitations.length === 0) {
    issues.push(`${path} must state limitations for proxy metrics`);
    return undefined;
  }
  return { summary, proxyMetricObservationIds, limitations };
}

function parseAction(
  value: unknown,
  evidenceIds: Set<string>,
  path: string,
  issues: string[]
): AdviceConditionalAction | undefined {
  if (!isObject(value) || !hasShape(value, ACTION_SCHEMA)) {
    issues.push(`${path} has an invalid shape`);
    return undefined;
  }
  const when = boundedText(value.when, 600);
  const action = boundedText(value.action, 800);
  const references = idArray(value.evidenceIds, MAX_REFERENCES, evidenceIds, `${path}.evidenceIds`, issues);
  const stopCondition = value.stopCondition == null ? undefined : boundedText(value.stopCondition, 600);
  if (!when || !action || !references || (value.stopCondition != null && !stopCondition)) {
    issues.push(`${path} has empty or oversized text`);
    return undefined;
  }
  return stopCondition ? { when, action, evidenceIds: references, stopCondition } : { when, action, evidenceIds: references };
}

function finiteRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function parseGuardrail(value: unknown, path: string, issues: string[]): AdviceQualityGuardrail | undefined {
  if (!isObject(value) || !hasShape(value, GUARDRAIL_SCHEMA)) {
    issues.push(`${path} has an invalid shape`);
    return undefined;
  }
  if (
    typeof value.rubricId !== 'string' ||
    !isAdviceIdentifier(value.rubricId) ||
    !finiteRange(value.minimumScore, 0, 1) ||
    !finiteRange(value.maximumRegression, 0, 1)
  ) {
    issues.push(`${path} has invalid bounds or rubric id`);
    return undefined;
  }
  return {
    rubricId: value.rubricId,
    minimumScore: value.minimumScore,
    maximumRegression: value.maximumRegression,
  };
}

function parseCriterion(
  value: unknown,
  observationIds: Set<string>,
  path: string,
  issues: string[]
): AdviceSuccessCriterion | undefined {
  if (!isObject(value) || !hasShape(value, CRITERION_SCHEMA)) {
    issues.push(`${path} has an invalid shape`);
    return undefined;
  }
  if (
    typeof value.metricObservationId !== 'string' ||
    !observationIds.has(value.metricObservationId) ||
    !oneOf(value.direction, DIRECTIONS) ||
    !Number.isInteger(value.minimumComparableTasks) ||
    (value.minimumComparableTasks as number) < MIN_COMPARABLE_TASKS ||
    (value.minimumComparableTasks as number) > MAX_COMPARABLE_TASKS
  ) {
    issues.push(`${path} has an invalid metric reference, direction, or sample size`);
    return undefined;
  }
  if (!isObject(value.target) || !hasShape(value.target, TARGET_SCHEMA)) {
    issues.push(`${path}.target has an invalid shape`);
    return undefined;
  }
  if (
    !oneOf(value.target.kind, TARGET_KINDS) ||
    !finiteRange(value.target.value, 0, Number.MAX_SAFE_INTEGER)
  ) {
    issues.push(`${path}.target has an invalid kind or value`);
    return undefined;
  }
  const guardrail = parseGuardrail(value.qualityGuardrail, `${path}.qualityGuardrail`, issues);
  if (!guardrail) return undefined;
  return {
    metricObservationId: value.metricObservationId,
    direction: value.direction,
    target: { kind: value.target.kind, value: value.target.value },
    minimumComparableTasks: value.minimumComparableTasks as number,
    qualityGuardrail: guardrail,
  };
}

function parseRecommendation(
  value: unknown,
  references: { observationIds: Set<string>; evidenceIds: Set<string> },
  path: string,
  issues: string[]
): AdviceRecommendation | undefined {
  if (!isObject(value) || !hasShape(value, RECOMMENDATION_SCHEMA)) {
    issues.push(`${path} has an invalid shape`);
    return undefined;
  }
  if (typeof value.id !== 'string' || !isAdviceIdentifier(value.id)) {
    issues.push(`${path}.id is invalid`);
    return undefined;
  }
  const title = boundedText(value.title, 160);
  const evidenceIds = idArray(
    value.evidenceIds,
    MAX_REFERENCES,
    references.evidenceIds,
    `${path}.evidenceIds`,
    issues
  );
  const explanation = parseExplanation(value.explanation, references.observationIds, `${path}.explanation`, issues);
  if (!Array.isArray(value.conditionalActions) || value.conditionalActions.length < 1 || value.conditionalActions.length > MAX_ACTIONS) {
    issues.push(`${path}.conditionalActions must be a bounded non-empty array`);
    return undefined;
  }
  if (!Array.isArray(value.successCriteria) || value.successCriteria.length < 1 || value.successCriteria.length > MAX_CRITERIA) {
    issues.push(`${path}.successCriteria must be a bounded non-empty array`);
    return undefined;
  }
  const conditionalActions = value.conditionalActions.map((item, index) =>
    parseAction(item, references.evidenceIds, `${path}.conditionalActions[${index}]`, issues)
  );
  const successCriteria = value.successCriteria.map((item, index) =>
    parseCriterion(item, references.observationIds, `${path}.successCriteria[${index}]`, issues)
  );
  if (!title || !evidenceIds || !explanation || conditionalActions.some((item) => !item) || successCriteria.some((item) => !item)) {
    if (!title) issues.push(`${path}.title is empty or too long`);
    return undefined;
  }
  return {
    id: value.id,
    title,
    evidenceIds,
    explanation,
    conditionalActions: conditionalActions as AdviceConditionalAction[],
    successCriteria: successCriteria as AdviceSuccessCriterion[],
  };
}

/**
 * Strict JSON-only parser. It never strips fences, repairs output, returns a
 * partial batch, or turns malformed prose into a plausible recommendation.
 */
export function parseStructuredAdviceOutput(
  raw: string,
  knownReferences: StructuredAdviceReferences
): StructuredAdviceParseResult {
  const text = raw.trim();
  if (text.length === 0) return { ok: false, code: 'empty-output', issues: ['model output was empty'] };
  if (text.length > MAX_RAW_CHARS) {
    return { ok: false, code: 'output-too-large', issues: ['model output exceeded the size limit'] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, code: 'invalid-json', issues: ['model output was not one strict JSON value'] };
  }
  if (!isObject(parsed) || !hasShape(parsed, STRUCTURED_ADVICE_JSON_SCHEMA)) {
    return { ok: false, code: 'invalid-schema', issues: ['top-level response shape is invalid'] };
  }
  if (parsed.schemaVersion !== ADVICE_CONTRACT_VERSION || !Array.isArray(parsed.recommendations)) {
    return { ok: false, code: 'invalid-schema', issues: ['response schema version or recommendations is invalid'] };
  }
  if (parsed.recommendations.length > MAX_RECOMMENDATIONS) {
    return { ok: false, code: 'invalid-schema', issues: ['too many recommendations'] };
  }

  const observationIds = new Set(knownReferences.observationIds);
  const evidenceIds = new Set(knownReferences.evidenceIds);
  const issues: string[] = [];
  const recommendations = parsed.recommendations.map((item, index) =>
    parseRecommendation(item, { observationIds, evidenceIds }, `recommendations[${index}]`, issues)
  );
  const recommendationIds = new Set<string>();
  for (const recommendation of recommendations) {
    if (!recommendation) continue;
    if (recommendationIds.has(recommendation.id)) issues.push('recommendation ids must be unique');
    recommendationIds.add(recommendation.id);
  }
  if (issues.length > 0 || recommendations.some((item) => !item)) {
    const code: StructuredAdviceParseErrorCode = issues.some((issue) => issue.includes('unknown reference'))
      ? 'unknown-reference'
      : 'invalid-schema';
    return { ok: false, code, issues };
  }
  return {
    ok: true,
    value: {
      schemaVersion: ADVICE_CONTRACT_VERSION,
      recommendations: recommendations as AdviceRecommendation[],
    },
  };
}
