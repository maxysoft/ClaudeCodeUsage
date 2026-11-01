import { calculateQuotaPace, QuotaPaceObservation, QuotaPaceResult } from './quotaPace';

export const QUOTA_PACE_MAX_WINDOWS = 16;
export const QUOTA_PACE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Slot is the index in the owner's RAW normalized windows, before filtering
 * or liveQuotaWindows. It is only a display join, never an account identity.
 * Supply actual numeric percentages; normalization's fallback zero is not an
 * observation. Unknown values must be NaN/null, never synthesized zero.
 */
export interface QuotaPaceAdapterWindow {
  readonly slot: number;
  readonly kind: 'weekly_all' | 'weekly_scoped' | 'other';
  readonly usedPercent: number;
  readonly resetAt: number | null;
  readonly periodMs: number | null;
}

/** Fixed numeric/enum DTO: no account IDs, labels, paths, history or credentials.
 * The owner must establish current account/window trust from existing source
 * evidence. Neither a Codex home, file key, limitId nor label proves an account.
 * Unknown/mixed accounts and source changes without a verified new window must
 * be marked unknown/ambiguous/discontinuous. Missing evidence stays unknown.
 * At most sixteen already-materialized windows, never a log/history scan.
 */
export interface QuotaPaceAdapterSnapshot {
  readonly observedAt: number | null;
  readonly source: QuotaPaceObservation['source'];
  readonly accountWindowTrust: QuotaPaceObservation['accountWindowTrust'];
  readonly windows: readonly QuotaPaceAdapterWindow[];
}

export interface QuotaPaceAdapterInput {
  readonly enabled: boolean;
  readonly now: number;
  readonly snapshot: QuotaPaceAdapterSnapshot | null;
}

export interface QuotaPaceAdapterEntry {
  readonly slot: number;
  readonly kind: 'weekly_all' | 'weekly_scoped';
  readonly result: QuotaPaceResult;
}

function rejected(slot = 0, kind: QuotaPaceAdapterEntry['kind'] = 'weekly_all'): QuotaPaceAdapterEntry {
  return { slot, kind, result: { status: 'unavailable', reason: 'untrusted-account-window' } };
}

function bounded(snapshot: QuotaPaceAdapterSnapshot): boolean {
  return Array.isArray(snapshot.windows) && snapshot.windows.length <= QUOTA_PACE_MAX_WINDOWS &&
    snapshot.windows.every((window) => Number.isInteger(window.slot) && window.slot >= 0 && window.slot < QUOTA_PACE_MAX_WINDOWS);
}

function adapt(input: QuotaPaceAdapterInput, provider: 'claude' | 'codex'): QuotaPaceAdapterEntry[] {
  if (input.enabled !== true) return [];
  const snapshot = input.snapshot;
  if (!snapshot) return [];
  if (!bounded(snapshot)) return [rejected()];
  const windows = snapshot.windows.filter((window) => window.kind === 'weekly_all' ||
    (provider === 'claude' && window.kind === 'weekly_scoped'));
  if (provider === 'codex' && windows.length > 1) return [rejected()];
  const slots = new Set<number>();
  const duplicateSlot = snapshot.windows.some((window) => {
    if (slots.has(window.slot)) return true;
    slots.add(window.slot);
    return false;
  });
  const duplicateAccount = windows.filter((window) => window.kind === 'weekly_all').length > 1;
  return windows.map((window): QuotaPaceAdapterEntry => {
    const kind = window.kind as QuotaPaceAdapterEntry['kind'];
    if (duplicateSlot || duplicateAccount) return rejected(window.slot, kind);
        return {
      slot: window.slot,
      kind,
      result: calculateQuotaPace({
        enabled: true,
        now: input.now,
        observation: {
          observedAt: snapshot.observedAt ?? NaN,
          resetAt: window.resetAt,
          periodMs: window.periodMs,
          usedFraction: typeof window.usedPercent === 'number' ? window.usedPercent / 100 : NaN,
          source: snapshot.source,
          accountWindowTrust: snapshot.accountWindowTrust,
        },
      }),
    };
  });
}

/** Pure bounded adapters. The supplied snapshot is the latest one, even if
 * invalid/stale; never select an older 'better' sample or combine accounts.
 */
export function adaptClaudeQuotaPace(input: QuotaPaceAdapterInput): QuotaPaceAdapterEntry[] {
  return adapt(input, 'claude');
}

export function adaptCodexQuotaPace(input: QuotaPaceAdapterInput): QuotaPaceAdapterEntry[] {
  return adapt(input, 'codex');
}
