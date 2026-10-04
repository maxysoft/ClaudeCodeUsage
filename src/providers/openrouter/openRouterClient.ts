import { HttpResponse, requestViaFetch } from '../../httpClient';

export const OPEN_ROUTER_CREDITS_URL = 'https://openrouter.ai/api/v1/credits';
export const OPEN_ROUTER_REQUEST_TIMEOUT_MS = 10_000;

export interface OpenRouterCredits {
  totalCredits: number;
  totalUsage: number;
}

export type OpenRouterErrorCode =
  | 'unauthorized'
  | 'forbidden-not-management-key'
  | 'network'
  | 'malformed';

export type OpenRouterCreditsResult =
  | { ok: true; credits: OpenRouterCredits }
  | { ok: false; error: OpenRouterErrorCode };

export function mapOpenRouterCreditsResponse(
  status: number,
  body: string,
): OpenRouterCreditsResult {
  if (status === 401) return { ok: false, error: 'unauthorized' };
  if (status === 403) return { ok: false, error: 'forbidden-not-management-key' };
  if (status !== 200) return { ok: false, error: 'network' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, error: 'malformed' };
  }
  const data = (parsed as { data?: unknown } | null)?.data as
    | { total_credits?: unknown; total_usage?: unknown }
    | undefined;
  const totalCredits = Number(data?.total_credits);
  const totalUsage = Number(data?.total_usage);
  if (
    typeof data?.total_credits !== 'number' ||
    typeof data?.total_usage !== 'number' ||
    !Number.isFinite(totalCredits) ||
    !Number.isFinite(totalUsage)
  ) {
    return { ok: false, error: 'malformed' };
  }
  return { ok: true, credits: { totalCredits, totalUsage } };
}

/** Read lifetime credit totals for one OpenRouter key. Nothing about the key —
 * not its value, length, prefix or a failure message quoting it — is logged,
 * persisted or returned. */
export async function fetchOpenRouterCredits(
  apiKey: string,
  options: {
    timeoutMs?: number;
    signal?: AbortSignal;
    request?: (
      url: string,
      opts: { method?: string; headers?: Record<string, string>; timeoutMs?: number; signal?: AbortSignal },
    ) => Promise<HttpResponse>;
  } = {},
): Promise<OpenRouterCreditsResult> {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) return { ok: false, error: 'unauthorized' };
  const request = options.request ?? requestViaFetch;
  try {
    const response = await request(OPEN_ROUTER_CREDITS_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      timeoutMs: options.timeoutMs ?? OPEN_ROUTER_REQUEST_TIMEOUT_MS,
      signal: options.signal,
    });
    return mapOpenRouterCreditsResponse(response.status, response.body);
  } catch {
    return { ok: false, error: 'network' };
  }
}
