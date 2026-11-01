import { stat } from 'node:fs/promises';
import { parentPort } from 'node:worker_threads';

import {
  CODEX_REFRESH_BACKFILL_MAX_BYTES,
  CODEX_REFRESH_BACKFILL_MAX_FILE_PASSES,
  CODEX_REFRESH_BACKGROUND_MAX_BYTES,
  CODEX_REFRESH_BACKGROUND_MAX_FILE_PASSES,
  CODEX_REFRESH_FOREGROUND_MAX_BYTES,
  CODEX_REFRESH_FOREGROUND_MAX_FILE_PASSES,
  CodexIndexCancelledError,
  CodexIndexRecovery,
  CodexIndexV1,
  codexCoverageSettled,
  loadCodexIndex,
  saveCodexIndexAtomic,
  updateCodexIndex,
} from './codexIndex';
import { scanCodexManifest } from './codexManifest';
import {
  CodexWorkerMessage,
  CodexWorkerRequest,
  CodexWorkerWireResult,
} from './codexWorkerProtocol';
import {
  CodexIndexLeaseBusyError,
  CodexIndexLeaseCancelledError,
  acquireCodexIndexLease,
} from './codexIndexLease';
import { CodexFilePassPool } from './codexFilePassPool';
import { adoptLegacyCodexIndex } from './codexIndexStorage';
import { copyCodexUsageWindow, copyCodexUsageDelta } from './codexAchievementOrigin';
import { supportsCodexZstd, CodexZstdError } from './codexZstd';

const cancelled = new Set<string>();
let activeRequestId: string | null = null;

export interface CodexWorkerIndexCache {
  key?: string;
  index?: CodexIndexV1;
}

const indexCache: CodexWorkerIndexCache = {};

async function indexFileKey(indexPath: string): Promise<string | undefined> {
  try {
    const info = await stat(indexPath, { bigint: true });
    return `${info.dev}:${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`;
  } catch {
    return undefined;
  }
}

function needsExpeditedBackfill(
  previous: Awaited<ReturnType<typeof loadCodexIndex>>,
  manifestFiles: number,
): boolean {
  const firstNonEmptyIndex =
    manifestFiles > 0 && Object.keys(previous.files).length === 0;
  const settled = codexCoverageSettled(previous.coverage);
  return firstNonEmptyIndex || !settled.complete || !settled.allTime;
}

function post(message: CodexWorkerMessage): void {
  parentPort?.postMessage(message);
}

function safeError(
  requestId: string,
  error: unknown,
): Extract<CodexWorkerMessage, { type: 'error' }> {
  if (error instanceof CodexZstdError && error.code === 'codec-unavailable') return {
    type: 'error', requestId, error: { code: 'zstd-unsupported',
      message: 'Compressed Codex logs require a newer VS Code runtime' },
  };
  if (
    error instanceof CodexIndexCancelledError ||
    error instanceof CodexIndexLeaseCancelledError
  ) {
    return {
      type: 'error',
      requestId,
      error: { code: 'cancelled', message: 'Codex indexing was cancelled' },
    };
  }
  if (error instanceof CodexIndexLeaseBusyError) {
    return {
      type: 'error',
      requestId,
      error: {
        code: 'busy',
        message: 'Another Codex usage refresh is already running',
      },
    };
  }
  return {
    type: 'error',
    requestId,
    error: {
      code: 'refresh-failed',
      message: 'Codex usage refresh could not be completed',
    },
  };
}

export interface CodexWorkerRefreshRuntime {
  isCancelled(): boolean;
  post(message: CodexWorkerMessage): void;
  acquireCodexIndexLease: typeof acquireCodexIndexLease;
  loadCodexIndex: typeof loadCodexIndex;
  scanCodexManifest: typeof scanCodexManifest;
  updateCodexIndex: typeof updateCodexIndex;
  saveCodexIndexAtomic: typeof saveCodexIndexAtomic;
  createCodexFilePassPool?: (workerLimit?: number) => Pick<CodexFilePassPool, 'run' | 'dispose'>;
  now?: () => number;
  adoptLegacyCodexIndex?: typeof adoptLegacyCodexIndex;
  indexCache?: CodexWorkerIndexCache;
}

export async function runCodexWorkerRefresh(
  request: Extract<CodexWorkerRequest, { type: 'refresh' }>,
  runtime: CodexWorkerRefreshRuntime,
): Promise<void> {
  const requestedUsageWindow = copyCodexUsageWindow(request.achievementUsageWindow);
  const now = runtime.now ?? Date.now;
  try {
    const lease = await runtime.acquireCodexIndexLease(request.indexPath, {
      shouldCancel: runtime.isCancelled,
    });
    let result: CodexWorkerWireResult;
    try {
      let indexRecovery: CodexIndexRecovery | undefined;
      const metadataStarted = now();
      const manifest = await runtime.scanCodexManifest(request.codexHome, request.salt);
      // Discover, but never silently omit, compressed history on an older host.
      // This fence precedes even legacy adoption or corrupt-cache quarantine.
      if (manifest.files.some(file => file.compression === 'zstd') && !supportsCodexZstd()) {
        throw new CodexZstdError('codec-unavailable');
      }
      const cache = runtime.indexCache;
      const indexKey = cache ? await indexFileKey(request.indexPath) : undefined;
      const cached = indexKey !== undefined && cache?.key === indexKey ? cache.index : undefined;
      if (cache) Object.assign(cache, { key: undefined, index: undefined });
      const loaded = cached ??
        await runtime.loadCodexIndex(request.indexPath, request.timeZone, event => { indexRecovery = event; });
      const previous = request.legacyIndexPath && runtime.adoptLegacyCodexIndex
        ? await runtime.adoptLegacyCodexIndex(request.indexPath, request.legacyIndexPath,
          manifest, request.timeZone, runtime.isCancelled,
          { codexHome: request.codexHome, salt: request.salt }) ?? loaded
        : loaded;
      const metadataMs = now() - metadataStarted;
      const usageWindow = !indexRecovery && previous === loaded ? requestedUsageWindow : undefined;
      const parseStarted = now();
      const foreground = request.profile === 'foreground';
      const allowHistoricalBackfill = request.allowHistoricalBackfill !== false;
      const expeditedBackfill = allowHistoricalBackfill && needsExpeditedBackfill(
        previous,
        manifest.files.length,
      );
      const filePassPool = expeditedBackfill
        ? runtime.createCodexFilePassPool?.(manifest.files.some(file => file.compression === 'zstd') ? 2 : undefined)
        : undefined;
      let checkpointWrites = 0;
      let updated;
      try {
        updated = await runtime.updateCodexIndex(previous, manifest, {
          achievementUsageWindow: usageWindow,
          salt: request.salt,
          timeZone: request.timeZone,
          now,
          budget: {
            maxFilePasses: expeditedBackfill
              ? CODEX_REFRESH_BACKFILL_MAX_FILE_PASSES
              : foreground
              ? CODEX_REFRESH_FOREGROUND_MAX_FILE_PASSES
              : CODEX_REFRESH_BACKGROUND_MAX_FILE_PASSES,
            maxBytes: expeditedBackfill
              ? CODEX_REFRESH_BACKFILL_MAX_BYTES
              : foreground
              ? CODEX_REFRESH_FOREGROUND_MAX_BYTES
              : CODEX_REFRESH_BACKGROUND_MAX_BYTES,
          },
          shouldCancel: runtime.isCancelled,
          onCheckpoint: async (index) => {
            await runtime.saveCodexIndexAtomic(request.indexPath, index);
            checkpointWrites += 1;
          },
          onProgress: (progress) =>
            runtime.post({
              type: 'progress',
              requestId: request.requestId,
              progress,
            }),
          allowHistoricalBackfill,
          allowAchievementHourProof: request.allowAchievementHourProof !== false,
          ...(filePassPool ? { filePassBatch: filePassPool.run } : {}),
        });
      } finally {
        await filePassPool?.dispose();
      }
      if (runtime.isCancelled()) {
        throw new CodexIndexCancelledError();
      }
      if ((updated.indexChanged || indexRecovery) && checkpointWrites === 0) {
        await runtime.saveCodexIndexAtomic(request.indexPath, updated.index);
      }
      if (runtime.isCancelled()) {
        throw new CodexIndexCancelledError();
      }
      const { achievementUsageDelta: rawDelta, index, ...committed } = updated;
      const achievementUsageDelta = copyCodexUsageDelta(rawDelta, usageWindow);
      // Only an untouched disk load is reusable: an in-memory update can differ from its saved round trip.
      const unchanged = indexKey !== undefined && !indexRecovery && previous === loaded &&
        !updated.indexChanged && index === loaded;
      if (cache && unchanged) Object.assign(cache, { key: indexKey, index });
      result = {
        ...committed,
        ...(unchanged && request.knownIndexKey === indexKey ? {} : { index }),
        ...(unchanged ? { indexKey } : {}),
        ...(achievementUsageDelta ? { achievementUsageDelta } : {}),
        ...(indexRecovery ? { indexRecovery } : {}),
        metadataMs,
        parseMs: now() - parseStarted,
      };
    } finally {
      await lease.release();
    }
    runtime.post({
      type: 'result',
      requestId: request.requestId,
      result,
    });
  } catch (error) {
    runtime.post(safeError(request.requestId, error));
  }
}

async function runRefresh(
  request: Extract<CodexWorkerRequest, { type: 'refresh' }>,
): Promise<void> {
  if (activeRequestId) {
    post({
      type: 'error',
      requestId: request.requestId,
      error: {
        code: 'busy',
        message: 'A Codex usage refresh is already running',
      },
    });
    return;
  }
  activeRequestId = request.requestId;
  try {
    await runCodexWorkerRefresh(request, {
      isCancelled: () => cancelled.has(request.requestId),
      post,
      acquireCodexIndexLease,
      loadCodexIndex,
      scanCodexManifest,
      updateCodexIndex,
      saveCodexIndexAtomic,
      adoptLegacyCodexIndex,
      createCodexFilePassPool: workerLimit => new CodexFilePassPool(workerLimit),
      indexCache,
    });
  } finally {
    cancelled.delete(request.requestId);
    activeRequestId = null;
  }
}

parentPort?.on('message', (request: CodexWorkerRequest) => {
  if (request.type === 'cancel') {
    cancelled.add(request.requestId);
    return;
  }
  void runRefresh(request);
});
