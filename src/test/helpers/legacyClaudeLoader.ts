import * as path from 'path';
import { readFile } from 'node:fs/promises';
import { detachedPromptPrefix, isRetryDuplicatePrompt } from '../../promptDedup';
import { dayKeyInZone, formatHourLabel, hourKeyInZone, monthKeyInZone } from '../../dateKeys';
import { I18n } from '../../i18n';
import { scanUsageManifest, sortUsageFilesByEarliestTimestamp, UsageManifest } from '../../claudeUsageFiles';
import { LoadUsageDiagnostics } from '../../refreshDiagnostics';
import { BranchUsage, ClaudeUsageRecord, ContentAnalysis, ProjectGroup, ProjectUsage, UsageData } from '../../types';
import {
  analysisWindowCutoffMs,
  analyzeLine,
  ClaudeDataLoader,
  compactUsageRecord,
  finalizeAnalysis,
  newAnalysisAcc,
  recordTimestampBounds,
  tagClaudeSessionEvidence,
  validateUsageRecord,
  validationDropReason,
} from '../../dataLoader';

export class LegacyClaudeLoader extends ClaudeDataLoader {
  static async loadUsageRecords(
    dataDirectory?: string,
    options?: {
      analyzeContent?: boolean;
      windowDays?: number;
      log?: (line: string) => void;
      manifest?: UsageManifest;
    }
  ): Promise<{
    records: ClaudeUsageRecord[];
    contentAnalysis: ContentAnalysis | null;
    diagnostics: LoadUsageDiagnostics;
  }> {
    const analyzeContent = options?.analyzeContent !== false; // default true
    // How many days back the content analysis (and its prompt sample) looks.
    // Configurable via advice.promptWindowDays; defaults to 30.
    const windowDays = Math.min(365, Math.max(1, Math.round(options?.windowDays ?? 30)));
    const analysisCutoffMs = analysisWindowCutoffMs(Date.now(), windowDays);
    const log = options?.log;
    const readParseStarted = performance.now();
    let filesDiscovered = 0;
    let filesFailed = 0;
    let bytesRead = 0;
    let linesParsed = 0;
    const diagnostics = (): LoadUsageDiagnostics => ({
      filesDiscovered,
      filesFailed,
      bytesRead,
      linesParsed,
      readParseMs: performance.now() - readParseStarted,
    });
    try {
      const claudePaths = dataDirectory ? [dataDirectory] : this.getClaudePaths();
      const manifest = options?.manifest ?? await scanUsageManifest(claudePaths);
      filesDiscovered = manifest.entries.size;
      const sorted = await sortUsageFilesByEarliestTimestamp([...manifest.entries.values()]);
      bytesRead += sorted.bytesRead;
      const sortedFiles = sorted.files;
      // Usage identities are resolved after every file has been read. Claude
      // normally writes both messageId and requestId, but some transcript rows
      // omit requestId. Waiting until the full load is known lets a missing ID
      // join the sole request for that message without merging genuinely
      // distinct requests that happen to reuse a messageId.
      const usageRecordIndexes: number[] = [];
      const requestIdsByMessage = new Map<string, Set<string>>();
      let records: ClaudeUsageRecord[] = [];
      // sessionId → conversation title. Current Claude Code writes
      // `custom-title` (user-set) and `ai-title` (auto) lines; older versions
      // wrote `summary`. A custom title always wins over an AI one.
      const aiTitleBySession: Record<string, string> = Object.create(null);
      const customTitleBySession: Record<string, string> = Object.create(null);
      // Content analysis (last `windowDays` days, default 30) is optional —
      // skipped when the user disables it via claudeCodeUsage.enableContentAnalysis.
      const analysis = analyzeContent ? newAnalysisAcc(analysisCutoffMs) : null;
      // Per-refresh caches for sub-agent attribution lookups: agent type from
      // agent-*.meta.json (keyed by meta path) and workflow display name from
      // the session's workflows/scripts dir (keyed by workflow id).
      const agentTypeCache = new Map<string, string>();
      const workflowNameCache = new Map<string, string>();
      let fileIndex = 0;
      // Diagnostic counters so the "Show Diagnostic Logs" command can explain
      // how many records were seen / rejected / deduped without speculation.
      const stats = {
        files: sortedFiles.length,
        linesScanned: 0,
        parseErrors: 0,
        rejected: {} as Record<string, number>,
        replacedByDedup: 0,
        skippedByDedup: 0,
        kept: 0,
        userPrompts: 0,
        // model name → { count, totalTokens }. totalTokens lets us tell whether
        // records exist but are all zeros (proxy-placeholder only).
        // Diagnostic detail is optional and bounded, independently of the
        // number/length of labels in source logs. Never retain arbitrary paths
        // or prototype properties as model names for the output channel.
        models: new Map<string, { count: number; tokens: number }>(),
        otherModels: { count: 0, tokens: 0 },
      };

      for (const file of sortedFiles) {
        try {
          const content = await readFile(file, 'utf-8');
          bytesRead += Buffer.byteLength(content, 'utf8');
          const lines = content
            .trim()
            .split('\n')
            .filter((line) => line.trim() !== '');

          // Each .jsonl file is one Claude Code conversation/session.
          const sessionInfo = this.parseSessionInfo(file);
          // Sub-agent / workflow logs: count their usage, but never harvest
          // user prompts from them (their "user" lines are agent-framework
          // task dispatches, not something the user typed).
          const isSubagentFile = /[\\/]subagents[\\/]/.test(file);
          // Sub-agent attribution, derived from the file path — NOT from cwd:
          // worktree-isolated agents have a cwd pointing at a temporary git
          // worktree (see docs/V2.1-WORKFLOW-SPEC.md §2.2).
          let agentInfo: {
            agentId: string;
            agentType: string;
            workflowId?: string;
            workflowName?: string;
            task?: string;
          } | null = null;
          if (isSubagentFile) {
            const agentId = path.basename(file, '.jsonl');
            const agentType = await this.readAgentType(file, agentTypeCache);
            const wfMatch = file.match(/[\\/]subagents[\\/]workflows[\\/](wf_[^\\/]+)[\\/]/);
            if (wfMatch) {
              const workflowId = wfMatch[1];
              const workflowName = await this.resolveWorkflowName(file, workflowId, workflowNameCache);
              agentInfo = { agentId, agentType, workflowId, workflowName };
            } else {
              agentInfo = { agentId, agentType };
            }
          }

          // Per-session (per-file) map of prompt digest → last-counted epoch ms,
          // to drop API-error retry re-logs of the same prompt from the Messages
          // count (see promptDedup.ts).
          const recentPrompts = new Map<string, number>();
          for (const line of lines) {
            linesParsed += 1;
            stats.linesScanned += 1;
            try {
              const parsed = JSON.parse(line) as unknown;

              // Feed every line into the content analysis (not only usage records).
              if (analysis) {
                analyzeLine(parsed, analysis, isSubagentFile, sessionInfo.sessionId);
              }

              // Conversation title lines. Keep the last seen of each kind —
              // titles get refreshed as the chat evolves.
              const lineAny = parsed as Record<string, unknown>;
              if (lineAny.type === 'ai-title' && typeof lineAny.aiTitle === 'string') {
                aiTitleBySession[sessionInfo.sessionId] = lineAny.aiTitle;
              } else if (lineAny.type === 'custom-title' && typeof lineAny.customTitle === 'string') {
                customTitleBySession[sessionInfo.sessionId] = lineAny.customTitle;
              } else if (lineAny.type === 'summary' && typeof lineAny.summary === 'string') {
                // Legacy location (older Claude Code versions).
                aiTitleBySession[sessionInfo.sessionId] = lineAny.summary;
              }

              // A sub-agent log's first user message is the task that was
              // dispatched to the agent — capture it (truncated) as the
              // agent's display label for the Workflows drill-down.
              if (agentInfo && agentInfo.task === undefined) {
                const role =
                  (lineAny.message as { role?: unknown } | undefined)?.role ?? lineAny.type;
                if (role === 'user') {
                  const content = (lineAny.message as { content?: unknown } | undefined)?.content;
                  const text =
                    typeof content === 'string'
                      ? content
                      : Array.isArray(content)
                        ? content
                            .filter(
                              (b: { type?: unknown; text?: unknown }) =>
                                b?.type === 'text' && typeof b.text === 'string'
                            )
                            .map((b: { text: string }) => b.text)
                            .join(' ')
                        : '';
                  const trimmed = text.replace(/\s+/g, ' ').trim();
                  if (trimmed.length > 0) {
                    agentInfo.task = detachedPromptPrefix(trimmed, 200);
                  }
                }
              }

              // Genuine user prompts become synthetic zero-usage records so
              // "Messages" counts what the user actually typed (not API
              // calls). Excludes meta lines (command output), sidechain
              // dispatches and anything inside sub-agent logs.
              if (
                !isSubagentFile &&
                (lineAny.type === 'user' || (lineAny.message as { role?: unknown } | undefined)?.role === 'user') &&
                !lineAny.isMeta &&
                !lineAny.isSidechain &&
                typeof lineAny.timestamp === 'string'
              ) {
                const content = (lineAny.message as { content?: unknown } | undefined)?.content;
                const text =
                  typeof content === 'string'
                    ? content
                    : Array.isArray(content)
                      ? content
                          .filter((b: { type?: unknown; text?: unknown }) => b?.type === 'text' && typeof b.text === 'string')
                          .map((b: { text: string }) => b.text)
                          .join('')
                      : '';
                if (text.trim().length > 0 && !this.isSyntheticUserText(text)) {
                  // Skip API-error retry re-logs: the same prompt re-appearing
                  // within a short window is one message, not several.
                  if (isRetryDuplicatePrompt(text.trim(), Date.parse(lineAny.timestamp), recentPrompts)) {
                    continue;
                  }
                  const prompt: ClaudeUsageRecord = {
                    timestamp: lineAny.timestamp,
                    message: { usage: { input_tokens: 0, output_tokens: 0 } },
                    _isUserPrompt: true,
                    // Kept generous so the "costliest messages" panel can show
                    // the whole triggering prompt (scrollable); giant pastes are
                    // capped so a few huge prompts can't bloat memory.
                    _promptText: detachedPromptPrefix(text.trim(), 4000),
                    _sessionId: sessionInfo.sessionId,
                    _projectDirEncoded: sessionInfo.projectPath,
                  };
                  tagClaudeSessionEvidence(prompt, file);
                  const pcwd = lineAny.cwd;
                  if (typeof pcwd === 'string' && pcwd.trim() !== '') {
                    prompt._projectPath = pcwd;
                    prompt._projectName = this.lastPathSegment(pcwd);
                  } else {
                    prompt._projectPath = sessionInfo.projectPath;
                    prompt._projectName = sessionInfo.projectName;
                  }
                  const pBranch = lineAny.gitBranch;
                  prompt._gitBranch = typeof pBranch === 'string' && pBranch.trim() !== '' ? pBranch : undefined;
                  records.push(prompt);
                  stats.userPrompts += 1;
                  continue;
                }
              }

              if (!validateUsageRecord(parsed)) {
                const reason = validationDropReason(parsed);
                stats.rejected[reason] = (stats.rejected[reason] || 0) + 1;
                continue;
              }

              const data = parsed;

              // Tag the record with the session/project it came from.
              // Prefer the real working directory (`cwd`) recorded in the log line
              // over the lossy, dash-encoded folder name when it is available.
              const record = compactUsageRecord(data as ClaudeUsageRecord);
              record._sessionId = sessionInfo.sessionId;
              tagClaudeSessionEvidence(record, file);
              record._projectDirEncoded = sessionInfo.projectPath;
              const cwd = (parsed as { cwd?: unknown }).cwd;
              if (typeof cwd === 'string' && cwd.trim() !== '') {
                record._projectPath = cwd;
                record._projectName = this.lastPathSegment(cwd);
              } else {
                record._projectPath = sessionInfo.projectPath;
                record._projectName = sessionInfo.projectName;
              }
              const gitBranch = (parsed as { gitBranch?: unknown }).gitBranch;
              record._gitBranch = typeof gitBranch === 'string' && gitBranch.trim() !== '' ? gitBranch : undefined;
              // Authoritative skill/plugin attribution: Claude Code ≥2.1 stamps
              // these on the assistant usage line itself (far better than the
              // <command-name> heuristic). See ARCHITECTURE "Log-format facts".
              const attrSkill = (parsed as { attributionSkill?: unknown }).attributionSkill;
              const attrPlugin = (parsed as { attributionPlugin?: unknown }).attributionPlugin;
              record._skill = typeof attrSkill === 'string' && attrSkill.trim() !== '' ? attrSkill : undefined;
              record._plugin = typeof attrPlugin === 'string' && attrPlugin.trim() !== '' ? attrPlugin : undefined;
              // MCP attribution + reasoning effort, stamped the same way.
              const attrMcpServer = (parsed as { attributionMcpServer?: unknown }).attributionMcpServer;
              const attrMcpTool = (parsed as { attributionMcpTool?: unknown }).attributionMcpTool;
              record._mcpServer = typeof attrMcpServer === 'string' && attrMcpServer.trim() !== '' ? attrMcpServer : undefined;
              record._mcpTool = typeof attrMcpTool === 'string' && attrMcpTool.trim() !== '' ? attrMcpTool : undefined;
              const effort = (parsed as { effort?: unknown }).effort;
              record._effort = typeof effort === 'string' && effort.trim() !== '' ? effort : undefined;
              if (agentInfo) {
                record._agentId = agentInfo.agentId;
                record._agentType = agentInfo.agentType;
                record._workflowId = agentInfo.workflowId;
                record._workflowName = agentInfo.workflowName;
                record._agentTask = agentInfo.task;
              }

              records.push(record);
              usageRecordIndexes.push(records.length - 1);
              const messageId = record.message?.id;
              const requestId = record.requestId;
              if (messageId && requestId) {
                const messageKey = String(messageId);
                let requestIds = requestIdsByMessage.get(messageKey);
                if (!requestIds) {
                  requestIds = new Set<string>();
                  requestIdsByMessage.set(messageKey, requestIds);
                }
                requestIds.add(String(requestId));
              }
            } catch {
              stats.parseErrors += 1;
              // Count once in the anonymous load summary. Error objects and
              // raw lines can expose source data; per-line console RPCs can
              // also exhaust workbench/native resources on corrupt history.
            }
          }
        } catch {
          filesFailed += 1;
        }

        // Yield to the event loop every so often so a large history does not
        // block the extension host (keeps VS Code and Claude Code responsive).
        if (++fileIndex % 25 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      // One Claude response can appear as separate thinking and text rows,
      // monotonic partial/final snapshots, or a cross-file transcript clone.
      // Keep the largest complete token vector for each resolved response
      // identity. This is the established issue #18 behavior; the post-pass
      // only makes requestId omission within one message order-independent.
      const processedHashes = new Map<string, number>();
      const removedUsageIndexes = new Set<number>();
      for (const recordIndex of usageRecordIndexes) {
        const record = records[recordIndex];
        const uniqueHash = this.createUniqueHash(record, requestIdsByMessage);
        if (!uniqueHash) {
          continue;
        }
        const existingIndex = processedHashes.get(uniqueHash);
        if (existingIndex === undefined) {
          processedHashes.set(uniqueHash, recordIndex);
          continue;
        }
        if (this.tokenSum(record) > this.tokenSum(records[existingIndex])) {
          records[existingIndex] = record;
          stats.replacedByDedup += 1;
        } else {
          stats.skippedByDedup += 1;
        }
        removedUsageIndexes.add(recordIndex);
      }
      if (removedUsageIndexes.size > 0) {
        records = records.filter((_record, index) => !removedUsageIndexes.has(index));
      }
      stats.kept = usageRecordIndexes.length - removedUsageIndexes.size;
      for (const record of records) {
        if (record._isUserPrompt) {
          continue;
        }
        if (log) {
          const model = record.message?.model;
          const modelName = typeof model === 'string' && model.length <= 160 &&
            /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)?$/i.test(model)
            ? model : null;
          let detail = modelName ? stats.models.get(modelName) : undefined;
          if (!detail && modelName && stats.models.size < 12) {
            detail = { count: 0, tokens: 0 };
            stats.models.set(modelName, detail);
          }
          const bucket = detail ?? stats.otherModels;
          bucket.count += 1;
          bucket.tokens += this.tokenSum(record);
        }
      }

      // Attach harvested conversation titles (custom beats AI). A post-pass
      // because a session's title lines and its usage records can sit in
      // different files (sub-agent logs share the parent session's id).
      for (const record of records) {
        if (!record._sessionId) {
          continue;
        }
        const title = customTitleBySession[record._sessionId] || aiTitleBySession[record._sessionId];
        if (title) {
          record._sessionTitle = title;
        }
      }

      if (log) {
        const rejectedSummary = Object.entries(stats.rejected)
          .map(([reason, count]) => `${reason}=${count}`)
          .join(', ') || 'none';
        // List models sorted by kept-record count desc, with each entry's
        // total token sum. If a model shows up with N records but 0 tokens
        // it means every record for that model was a proxy zero-placeholder
        // and the real values were never written — that's the missing-Flash
        // story.
        const fmt = (n: number): string =>
          n >= 1e6 ? `${(n / 1e6).toFixed(1)}M`
          : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K`
          : `${n}`;
        const modelsSummary = [...stats.models]
          .sort(([, a], [, b]) => b.count - a.count)
          .map(([name, m]) => `${name}=${m.count}/${fmt(m.tokens)}`)
          .join(', ') || 'none';
        log(
          `loader: ${stats.files} files, ${stats.linesScanned} lines | ` +
            `kept=${stats.kept}, user-prompts=${stats.userPrompts}, ` +
            `dedup-replaced=${stats.replacedByDedup}, ` +
            `dedup-skipped=${stats.skippedByDedup}, parse-errors=${stats.parseErrors}, files-failed=${filesFailed} | ` +
            `rejected: ${rejectedSummary}`
        );
        log(`loader: models seen: ${modelsSummary}; other-models=${stats.otherModels.count}/${fmt(stats.otherModels.tokens)}`);
      }
      const contentAnalysis = analysis ? finalizeAnalysis(analysis) : null;
      if (contentAnalysis) {
        // Calibration anchors (Phase 8): exact billed token totals over the
        // analysis window (same cutoff the analyzer used), so the text-length
        // category estimates can be scaled to billing reality.
        const calibrationCutoff = analysisCutoffMs;
        let realOutputTokens = 0;
        let realInputSideTokens = 0;
        for (const r of records) {
          if (r._isUserPrompt) {
            continue;
          }
          const t = Date.parse(r.timestamp);
          if (isNaN(t) || t < calibrationCutoff) {
            continue;
          }
          const u = r.message.usage;
          realOutputTokens += u.output_tokens || 0;
          realInputSideTokens += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
        }
        if (realOutputTokens > 0 || realInputSideTokens > 0) {
          contentAnalysis.calibration = { realOutputTokens, realInputSideTokens };
        }
      }
      return { records, contentAnalysis, diagnostics: diagnostics() };
    } catch {
      filesFailed = Math.max(filesFailed, 1);
      log?.(`loader: failed, files-failed=${filesFailed}, lines=${linesParsed}`);
      return { records: [], contentAnalysis: null, diagnostics: diagnostics() };
    }
  }

  static createUniqueHash(
    data: any,
    requestIdsByMessage?: ReadonlyMap<string, ReadonlySet<string>>,
  ): string | null {
    const messageId = data.message?.id;
    let requestId = data.requestId;

    if (!messageId && !requestId) {
      return null;
    }

    if (messageId && !requestId) {
      const knownRequestIds = requestIdsByMessage?.get(String(messageId));
      if (knownRequestIds?.size === 1) {
        requestId = knownRequestIds.values().next().value;
      }
    }

    return `${messageId || 'no-msg'}-${requestId || 'no-req'}`;
  }

  static getTodayData(records: ClaudeUsageRecord[]): UsageData {
    const tz = I18n.getTimezone();
    const today = dayKeyInZone(new Date(), tz);
    const todayRecords = records.filter((record) =>
      dayKeyInZone(new Date(record.timestamp), tz) === today
    );

    return this.calculateUsageData(todayRecords);
  }

  static getThisMonthData(records: ClaudeUsageRecord[]): UsageData {
    const tz = I18n.getTimezone();
    const thisMonth = monthKeyInZone(new Date(), tz);
    const monthRecords = records.filter(
      (record) => monthKeyInZone(new Date(record.timestamp), tz) === thisMonth
    );

    return this.calculateUsageData(monthRecords);
  }

  static getDailyDataForMonth(records: ClaudeUsageRecord[]): { date: string; data: UsageData }[] {
    const tz = I18n.getTimezone();
    const thisMonth = monthKeyInZone(new Date(), tz);

    // Group records by their calendar day in the configured timezone, keeping
    // only days that belong to the current month in that same zone (so a record
    // just after local midnight on the 1st isn't filed under the previous
    // month's last day).
    const recordsByDate: Record<string, ClaudeUsageRecord[]> = {};

    records.forEach((record) => {
      const dateKey = dayKeyInZone(new Date(record.timestamp), tz);
      if (!dateKey || dateKey.slice(0, 7) !== thisMonth) {
        return;
      }
      if (!recordsByDate[dateKey]) {
        recordsByDate[dateKey] = [];
      }
      recordsByDate[dateKey].push(record);
    });

    // Calculate usage data for each day and sort by date (newest first)
    const dailyData = Object.entries(recordsByDate)
      .map(([date, dayRecords]) => ({
        date,
        data: this.calculateUsageData(dayRecords),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return dailyData;
  }

  static getAllTimeData(records: ClaudeUsageRecord[]): UsageData {
    return this.calculateUsageData(records);
  }

  /**
   * Group records by project (working directory), then group those projects by
   * their enclosing git repository — or, when a project is not inside a repo, by
   * its top-level project folder. Paths that differ only in case are merged.
   * @param records All loaded usage records
   * @param limit Maximum number of project groups to return (default 60)
   */
  static getProjectBreakdown(
    records: ClaudeUsageRecord[],
    limit: number = 60,
    mode: 'git' | 'folder' | 'flat' = 'git'
  ): ProjectGroup[] {
    // 1. Group records per project, merging paths that differ only in case.
    const recordsByKey: Record<string, ClaudeUsageRecord[]> = Object.create(null);
    const displayPathByKey: Record<string, string> = Object.create(null);

    for (const record of records) {
      const rawPath = record._projectPath || record._projectName || 'unknown';
      const key = this.normalizePath(rawPath);
      if (!recordsByKey[key]) {
        recordsByKey[key] = [];
        displayPathByKey[key] = rawPath;
      }
      recordsByKey[key].push(record);
    }

    const keys = Object.keys(recordsByKey);
    if (keys.length === 0) {
      return [];
    }

    // 2. Common root — the grouping fallback for projects not inside a git repo.
    const segmentLists = keys.map((k) => k.split('/').filter((s) => s.length > 0));
    const commonRootLen = this.commonPrefixLength(segmentLists);

    // 3. Build a project per key and assign it to a group (git repo, else folder).
    const groups: Record<
      string,
      { records: ClaudeUsageRecord[]; children: ProjectUsage[]; displayPath: string; isGitRepo: boolean }
    > = Object.create(null);
    const gitCache = new Map<string, string | null>();

    keys.forEach((key, idx) => {
      const projectRecords = recordsByKey[key];
      const originalPath = displayPathByKey[key];
      const segments = segmentLists[idx];

      let groupKey: string;
      let groupDisplayPath: string;
      let isGitRepo = false;

      if (mode === 'flat') {
        // Every working directory is its own group.
        groupKey = segments.join('/');
        groupDisplayPath = originalPath;
      } else {
        let gitRoot: string | null = null;
        if (mode === 'git') {
          gitRoot = this.resolveGitRoot(originalPath, gitCache);
        }
        if (gitRoot) {
          groupKey = this.normalizePath(gitRoot);
          groupDisplayPath = gitRoot;
          isGitRepo = true;
        } else {
          // No git repo (or 'folder' mode): top-level project folder heuristic.
          const groupLen = commonRootLen === 0 ? segments.length : Math.min(segments.length, commonRootLen + 1);
          groupKey = segments.slice(0, groupLen).join('/');
          groupDisplayPath = this.deriveGroupDisplayPath(originalPath, groupKey);
        }
      }

      const timestamps = recordTimestampBounds(projectRecords);
      const first = projectRecords[0];
      const project: ProjectUsage = {
        projectName: first._projectName || 'unknown',
        projectPath: displayPathByKey[key],
        sessionCount: new Set(projectRecords.map((r) => r._sessionId || 'unknown')).size,
        firstSeen: new Date(timestamps.first),
        lastSeen: new Date(timestamps.last),
        data: this.calculateUsageData(projectRecords),
      };

      if (!groups[groupKey]) {
        groups[groupKey] = { records: [], children: [], displayPath: groupDisplayPath, isGitRepo };
      }
      for (const record of projectRecords) groups[groupKey].records.push(record);
      groups[groupKey].children.push(project);
    });

    // 4. Aggregate each group.
    const result: ProjectGroup[] = Object.values(groups).map((g) => {
      const timestamps = recordTimestampBounds(g.records);
      const sessionCount = new Set(g.records.map((r) => r._sessionId || 'unknown')).size;
      const children = g.children.sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime());
      const pathSegments = g.displayPath.split(/[\\/]/).filter((s) => s.length > 0);
      const groupName = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : g.displayPath;

      return {
        groupName,
        groupPath: g.displayPath,
        isGitRepo: g.isGitRepo,
        projectCount: children.length,
        sessionCount,
        firstSeen: new Date(timestamps.first),
        lastSeen: new Date(timestamps.last),
        data: this.calculateUsageData(g.records),
        children,
      };
    });

    return result
      .filter((g) => g.data.messageCount > 0)
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
      .slice(0, limit);
  }

  /**
   * Newest modification time (ms) across all usage log files. Used to skip
   * pointless reloads when nothing has changed since the last load.
   */
  static async getLatestModifiedTime(dataDirectory?: string): Promise<number> {
    try {
      const roots = dataDirectory ? [dataDirectory] : this.getClaudePaths();
      const manifest = await scanUsageManifest(roots);
      let latest = 0;
      for (const entry of manifest.entries.values()) {
        latest = Math.max(latest, entry.mtimeMs);
      }
      return latest;
    } catch {
      return 0;
    }
  }

  static getDailyDataForSpecificMonth(records: ClaudeUsageRecord[], monthDateString: string): { date: string; data: UsageData }[] {
    // monthDateString is a "YYYY-MM-..." key already produced in the configured
    // zone (see getDailyDataForAllTime), so take its month directly and bucket
    // by day in the same zone — no local/UTC boundary mismatch.
    const tz = I18n.getTimezone();
    const targetMonth = monthDateString.slice(0, 7);

    // Group records by date
    const recordsByDate: Record<string, ClaudeUsageRecord[]> = {};

    records.forEach((record) => {
      const dateKey = dayKeyInZone(new Date(record.timestamp), tz);
      if (!dateKey || dateKey.slice(0, 7) !== targetMonth) {
        return;
      }
      if (!recordsByDate[dateKey]) {
        recordsByDate[dateKey] = [];
      }
      recordsByDate[dateKey].push(record);
    });

    // Convert to array and sort by date
    return Object.keys(recordsByDate)
      .sort()
      .map((dateKey) => ({
        date: dateKey,
        data: this.calculateUsageData(recordsByDate[dateKey]),
      }));
  }

  static getDailyDataForAllTime(records: ClaudeUsageRecord[]): { date: string; data: UsageData }[] {
    // Group all records by month (in the configured timezone) for all-time view
    const tz = I18n.getTimezone();
    const recordsByMonth: Record<string, ClaudeUsageRecord[]> = {};

    records.forEach((record) => {
      const monthKey = monthKeyInZone(new Date(record.timestamp), tz); // YYYY-MM
      if (!monthKey) {
        return;
      }
      if (!recordsByMonth[monthKey]) {
        recordsByMonth[monthKey] = [];
      }
      recordsByMonth[monthKey].push(record);
    });

    // Calculate usage data for each month and sort by month (newest first)
    const monthlyData = Object.entries(recordsByMonth)
      .map(([month, monthRecords]) => ({
        date: month + '-01', // Set to first day of month for date sorting
        data: this.calculateUsageData(monthRecords),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return monthlyData;
  }

  static getHourlyDataForToday(records: ClaudeUsageRecord[]): { hour: string; data: UsageData }[] {
    const tz = I18n.getTimezone();
    const today = dayKeyInZone(new Date(), tz);
    const todayRecords = records.filter((record) =>
      dayKeyInZone(new Date(record.timestamp), tz) === today
    );

    // Group records by hour
    const recordsByHour: Record<string, ClaudeUsageRecord[]> = {};

    todayRecords.forEach((record) => {
      const recordDate = new Date(record.timestamp);
      const hourKey = formatHourLabel(hourKeyInZone(recordDate, tz));
      if (!hourKey) {
        return;
      }

      if (!recordsByHour[hourKey]) {
        recordsByHour[hourKey] = [];
      }
      recordsByHour[hourKey].push(record);
    });

    // Calculate usage data for each hour and sort by hour
    const hourlyData = Object.entries(recordsByHour)
      .map(([hour, hourRecords]) => ({
        hour,
        data: this.calculateUsageData(hourRecords),
      }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    return hourlyData;
  }

  static getHourlyDataForDate(records: ClaudeUsageRecord[], dateString: string): { hour: string; data: UsageData }[] {
    const tz = I18n.getTimezone();
    const dateRecords = records.filter((record) =>
      dayKeyInZone(new Date(record.timestamp), tz) === dateString
    );

    // Group records by hour
    const recordsByHour: Record<string, ClaudeUsageRecord[]> = {};

    dateRecords.forEach((record) => {
      const recordDate = new Date(record.timestamp);
      const hourKey = formatHourLabel(hourKeyInZone(recordDate, tz));
      if (!hourKey) {
        return;
      }

      if (!recordsByHour[hourKey]) {
        recordsByHour[hourKey] = [];
      }
      recordsByHour[hourKey].push(record);
    });

    // Calculate usage data for each hour and sort by hour
    const hourlyData = Object.entries(recordsByHour)
      .map(([hour, hourRecords]) => ({
        hour,
        data: this.calculateUsageData(hourRecords),
      }))
      .sort((a, b) => a.hour.localeCompare(b.hour));

    return hourlyData;
  }

  /**
   * Group records by git branch (within each project) and aggregate usage.
   * Returns branches with billable usage, sorted by cost descending.
   * @param records All loaded usage records
   * @param limit Maximum number of branches to return (default 60)
   */
  static getBranchBreakdown(records: ClaudeUsageRecord[], limit: number = 60): BranchUsage[] {
    const byKey: Record<string, ClaudeUsageRecord[]> = {};
    for (const record of records) {
      const branch = record._gitBranch && record._gitBranch.trim() !== '' ? record._gitBranch : '-';
      const key = (record._projectName || 'unknown') + '\u0000' + branch;
      if (!byKey[key]) {
        byKey[key] = [];
      }
      byKey[key].push(record);
    }

    const result: BranchUsage[] = Object.values(byKey).map((recs) => {
      const first = recs[0];
      const branch = first._gitBranch && first._gitBranch.trim() !== '' ? first._gitBranch : '-';
      const timestamps = recordTimestampBounds(recs);
      return {
        branch,
        projectName: first._projectName || 'unknown',
        projectPath: first._projectPath || '',
        sessionCount: new Set(recs.map((r) => r._sessionId || 'unknown')).size,
        lastSeen: new Date(timestamps.last),
        data: this.calculateUsageData(recs),
      };
    });

    return result
      .filter((b) => b.data.messageCount > 0)
      .sort((a, b) => b.data.totalCost - a.data.totalCost)
      .slice(0, limit);
  }
}
