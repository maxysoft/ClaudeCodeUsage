# Audit record: ClaudeCodeUsage fork

Repo `maxysoft/ClaudeCodeUsage`. Current version v2.18.0, HEAD `a185731`. Rounds: 2026-10-04, 2026-10-18, 2026-10-20, 2026-11-01, 2026-11-14. This file replaces every earlier `.audit/` working file.

## Header

| Round | Scope | Baseline | Fix commits |
| --- | --- | --- | --- |
| 2026-10-04 | Review of the upstream v2.4.0 merge (v2.15.0), Opus + Fable | `51d81ed` (pre-merge backup `669c8cd`), HEAD `7f06554` | `7f06554` (week tab tests, memo, Node 26), `bcc2aac` (nine findings, v2.15.1 line); the two HIGH loader/index fixes landed before `bcc2aac` (not pinned to one commit) |
| 2026-10-18 | Whole-repo audit (14 reader slots, 5 denied) at v2.17.0, plus review of the upstream v2.5.0 merge, plus review round 1 of the fix branch (`2c07bd4`) | `29af3f7` | Builder commits (e.g. `669b17f`, `e9578c8`, `c2fbbca`, `41bc9f8`, `484c5ef`, `9974ea7`, `9568eda`) squashed into `4291292` |
| 2026-10-20 | Delta review `2c07bd4..027304d` (Opus only, Fable denied) | `2c07bd4` | `64c8f2b`, `68a51d9`, `027304d`, then the 2026-11-01 builders; squashed into `4291292` |
| 2026-11-01 | Fix round for 2026-10-20 items, review `027304d..820f0a2`, final verify at `fa5dad0`, review of the upstream v2.5.1 merge | `027304d`, merge `c5a18f4` | `f9db6ce`, `a62a602`, `5dfdd1f`, `820f0a2`, `55a2b90`, `fa5dad0`, `399c4e8`, `48566dc` squashed into `4291292`; merge F1/F2 fixed by `a185731` |
| 2026-11-14 | Webview security surface (handler 2640-3341 and sinks, `miniMarkdown.ts`) never read before, plus status of all older ids at HEAD. Audit only, no code changed | `a185731` | none |

Process: each unit read by an Opus and a Fable reader (some slots denied by the auto-mode classifier), arbitration by a fresh Opus agent, TypeSafe (Jev) for severity and fix-now, Astra for security-sensitive hunks, main verified every finding in code. Machine checks (tsc, node suite in Docker, osv-scanner) ran first. Outcomes below follow the 2026-11-14 status check (`open-items.md`) and its triage.

Ids are prefixed by round. Round-1 findings of the fix-branch review are `1018-R*` (Jev's F1-F13 numbering cannot be mapped one-to-one from the files, so they are keyed by location). `1018-A*` and `1018-B*` come from ledgers A and B. Raised-by codes in `1018-A*`/`1018-B*`: CD claude-data-opus, CX codex-fable, WV webview-a-fable, AO/AF achievements opus/fable, HO/HF host opus/fable, AdO/AdF advice opus/fable (verbatim from the ledgers; `BOTH` means both readers of the unit). Severity is the final one after arbiter and Jev; Fable-vs-Opus differences are noted in the column.

### Outcome counts

| Round | fixed | deferred | rejected-noise | won't fix | total |
| --- | --- | --- | --- | --- | --- |
| 1004 | 10 | 2 | 0 | 0 | 12 |
| 1018 | 73 | 96 | 4 | 2 | 175 |
| 1020 | 8 | 0 | 0 | 0 | 8 |
| 1101 | 8 | 4 | 1 | 0 | 13 |
| 1114 | 0 | 8 | 0 | 0 | 8 |
| all | 99 | 110 | 5 | 2 | 216 |

The 1018 count is 175: 153 ledger ids (7 HIGH, 39 MEDIUM, 107 LOW), 4 merge rows, 15 round-1 review rows and 3 builder open notes (`1018-N*`, not reader findings). The 1101 row counts the 2026-11-01 review (7) and the v2.5.1 merge review (6).

## Findings

Outcome is one of fixed, deferred, rejected-noise, won't fix. Gone (code deleted) counts as fixed. "Undecided status" means the 2026-11-14 checker could not trace the item.

| id | path:line | final severity | raised by | outcome | reason |
| --- | --- | --- | --- | --- | --- |
| 1004-1 | src/dataLoader.ts:100 (compactUsageRecord) | HIGH | Fable | fixed | compactUsageRecord dropped speed, inference_geo, output_tokens_details so fast-mode, US-geo and thinking-token features were dead at runtime; carried through now (src/dataLoader.ts:149-156). |
| 1004-2 | src/claudeIncrementalIndex.ts:1475 | HIGH | Fable | fixed | Index parser did not stamp _mcpServer/_mcpTool/_effort, so effort and MCP attribution rows never rendered; stamped now (src/claudeIncrementalIndex.ts:1733-1735). |
| 1004-3 | tests/perf/measure-dashboard-reuse.cjs:25 | HIGH | Opus | fixed | Benchmark wrote the corpus into the wrong updateData slot; slot is index 9 under the current contract and an assertion on provider.allRecords now guards it. |
| 1004-4 | src/extension.ts:4728,4875 (weekAggregate) | MEDIUM | Opus, Fable | fixed | weekAggregate returned a fresh object each poll, busting all Claude panel caches; memoised with identity-preserving equality, released on corpus replacement (bcc2aac, 7f06554). |
| 1004-5 | src/webview.ts:3573 (week panel cache) | MEDIUM | Opus | fixed | Week panel cached hourly while its countdown is per minute; bucketed per minute (bcc2aac). |
| 1004-6 | tests/ui/support/render-harness.cjs:329 | MEDIUM | Opus | fixed | Harness never passed weekResetsAt and no spec opened the week tab; fixture and week-tab specs added (7f06554, bcc2aac). |
| 1004-7 | src/dataLoader.ts:2822 (skillUses filter) | MEDIUM | Fable | fixed | All-time scope dropped every analysis skill use; filter now returns true without scopeDayKeys (src/dataLoader.ts:2340). |
| 1004-8 | src/webview.ts:13102 (restoreClaudeDrilldownDetails) | LOW | Opus | deferred | Saved week-tab drilldown can restore onto the month tab; pre-existing, not re-verified at HEAD. |
| 1004-9 | .github/workflows/publish.yml:130 (vsce version/Node) | LOW | Opus, Fable | fixed | Release and CI used different vsce/Node pairs; both now run the pinned build-tools vsce and Node 26. |
| 1004-10 | CLAUDE.md (README edition list) | LOW | Opus | fixed | Documentation list now names all nine editions. |
| 1004-11 | src/extension.ts:4657 (first publish, quota null) | LOW | Fable | deferred | Week tab shows "not available" until the next poll after first publish; pre-existing, not re-verified at HEAD. |
| 1004-12 | README.md:463, README-zh-CN.md:194 | LOW | Fable | fixed | README no longer contains the sparkles glyph (grep count 0). |
| 1018-A1 | src/webview.ts:3701 | HIGH | WV | fixed | Fork "This Week" tab ('week') missing from isDashboardTabAllowed, tabChanged (2905),... Fixed in 4291292. |
| 1018-A2 | src/claudeIncrementalIndex.ts:1523 | HIGH | CD | fixed | One unreadable JSONL blocks every Claude commit: scanCodexJsonlLines -> createReadStream... Fixed in 4291292. |
| 1018-A3 | src/weeklyValue.ts:258 | HIGH | CD | fixed | claudeWeeklyEquivalentUsage (production caller webview.ts:7852) prices via getExactModelPricing... Fixed in 4291292. |
| 1018-A4 | src/claudeIncrementalIndex.ts:2149 | MEDIUM | CD | fixed | titleForSession loops all index.files with parseSessionInfo per affected session; on cold... Fixed in 4291292. |
| 1018-A5 | src/claudeIncrementalIndex.ts:2305 | MEDIUM | CD | fixed | workflowRows call getWorkflowBreakdown only on visibleKeysByWorkflow records; workflow key derives... Fixed in 4291292. |
| 1018-A6 | src/claudeIncrementalIndex.ts:2404 | MEDIUM | CD | fixed | Workspace match is raw startsWith with no separator boundary (:2404, :2412 sessionMatchesWorkspace,... Fixed in 4291292. |
| 1018-A7 | src/pricing.ts:706 | MEDIUM | CD | fixed | Runtime LiteLLM overrides (only after user runs fetch latest pricing, extension.ts:2118) are... Fixed in 4291292. |
| 1018-A8 | src/claudeIncrementalIndex.ts:2277 | MEDIUM | CD | fixed | recomputeDerivedRows re-collects and re-prices (calculateUsageData) every record of each dirty... Fixed in 4291292. |
| 1018-A9 | src/claudeIncrementalIndex.ts:1921 | MEDIUM | CD | fixed | Each visible add/remove calls membershipKeys twice (addVisibleMembership :1929 and markDirty... Fixed in 4291292. |
| 1018-A10 | src/claudeIncrementalIndex.ts:2163 | MEDIUM | CD | fixed | refreshSessionTitle stores a spread copy of every record of a titled session in visibleRecords... Fixed in 4291292. |
| 1018-A11 | src/claudeIncrementalIndex.ts:1550 | MEDIUM | CD | fixed | analysisAllUuids.add runs for every line regardless of analyzeContent (:1551), is copied per append... Fixed in 4291292. |
| 1018-A12 | src/claudeIncrementalIndex.ts:2170 | MEDIUM | CD | fixed | cloneIndexForCommit copies files, candidatesByMessage, candidatesByDirectIdentity, visibleRecords,... Fixed in 4291292. |
| 1018-A13 | src/dataLoader.ts:1642 | MEDIUM | CD | fixed | This Week: getThisWeekData scans all records (new Date each) per refresh; weekMemo... Fixed in 4291292. |
| 1018-A14 | src/achievementHours.ts:28 | MEDIUM | AO | fixed | collectClaudeOutputHours Date.parses the whole Claude corpus; cache at webview.ts:5605-5608 keys on... Fixed in 4291292. |
| 1018-A15 | src/claudeIncrementalIndex.ts:2345 | MEDIUM | CD | fixed | buildProjectGroups creates a new gitCache per materialization (:2324) and default mode is 'git'... Fixed in 4291292. |
| 1018-A16 | src/claudeUsageFiles.ts:79 | MEDIUM | CD | fixed | io.stat without {bigint:true}; Windows NTFS file IDs (sequence<<48 / MFT index) above 2^53 lose low... Fixed in 4291292. |
| 1018-A17 | src/providers/codex/codexIndexClient.ts:78 | MEDIUM | CX | fixed | Queued foreground refresh chains `this.active.promise.then(() => this.refresh(...))` with no... Fixed in 4291292. |
| 1018-A18 | src/providers/codex/codexIndexWorker.ts:41 | MEDIUM | CX | fixed | A terminal zstd failure contribution is flagged stale-reset-required and excluded from indexedFiles... Fixed in 4291292. |
| 1018-A19 | src/providers/codex/codexIndexWorker.ts:121 | MEDIUM | CX | fixed | Fixed per-refresh cost dominated by index bookkeeping: worker terminated after every terminal reply... Fixed in 4291292. |
| 1018-A20 | src/webview.ts:6436 | MEDIUM | WV | fixed | renderLocalDataControls is never called (tsc TS6133; 1 occurrence), so the Local data and privacy... Fixed in 4291292. |
| 1018-A21 | src/achievements.ts:484 | MEDIUM | AO+AF | fixed | codexModelSignals computes ~10 fields (modelCount, efforts, familyRootCounts, effortRootCounts,... Fixed in 4291292. |
| 1018-A22 | src/achievementCalendar.ts:92 | MEDIUM | AO+AF | fixed | YYYY-MM-DD validator/ordinal written ~11 times (achievementCalendar.ts:92,... Fixed in 4291292. |
| 1018-A23 | src/achievementHistoryRegistry.ts:11 | MEDIUM | AO+AF | fixed | 140-line hand-maintained manifest duplicates catalog shapes and is checked at runtime; a maintainer... Fixed in 4291292. |
| 1018-A24 | src/achievementSnapshot.ts:1 | MEDIUM | AO(LOW)+AF(MEDIUM) | fixed | Whole 157-line module (buildAchievementEvidence, buildCommunityBenchmarkCandidate, band tables)... Fixed in 4291292. |
| 1018-A25 | src/combinedHeatmap.ts:77 | MEDIUM | AO(LOW)+AF(MEDIUM)+WV(LOW, imports) | fixed | claudeDailyPointsFromUsage, codexDailyPointsFromUsage, deduplicatePoints, mergeCombinedDailyUsage,... Fixed in 4291292. |
| 1018-A26 | src/achievementIcons.ts:145-158 | MEDIUM | AO | fixed | Partial: 12-entry LRU, localResourceRoots narrowed; sync readFileSync on miss remains (accepted partial) |
| 1018-A27 | src/dataLoader.ts:839 | MEDIUM | CD(LOW) | fixed | ClaudeDataLoader.loadUsageRecords (839-1263) has no production caller (grep: tests only), nor... Fixed in 4291292. |
| 1018-A28 | src/providers/claudeProvider.ts:11 | MEDIUM | CD(LOW) | fixed | buildClaudeProviderSnapshot (whole file), pricing.ts:833 calculateCostFromTokens and... Fixed in 4291292. |
| 1018-A29 | src/weeklyValue.ts:973 | MEDIUM | CD(LOW) | fixed | buildWeeklyValueTrend (973-1085), appendWeeklyQuotaObservations (116-144), mergeWeeklyValuePoints... Fixed in 4291292. |
| 1018-A30 | src/claudeIncrementalIndex.ts:187,198,1942 | LOW | CD(MEDIUM) | deferred | byDay/byWorkflow written per record, no non-test reader |
| 1018-A31 | src/providers/codex/codexIndexLease.ts:153,206 | LOW | CX(MEDIUM) | deferred | lease stale by age with createdAt never refreshed; long backfill reapable |
| 1018-A32 | src/webview.ts:3963 | LOW | WV(MEDIUM) | rejected-noise | Arbiter DISAGREE: getErrorContent interpolates this.error unescaped, but every production error value is a constant:... (A32 still latent at HEAD, constant callers only) |
| 1018-A33 | src/webview.ts:402,696,1031 | LOW | WV(MEDIUM)+AO(LOW, achievementConditions.ts:16) | deferred | combinedHeatmap/projectMatrix/localData locale copy still in webview.ts |
| 1018-A34 | src/achievementCollaboration.ts:70; achievementEffortStatistics.ts:142; achievem | LOW | AO(MEDIUM)+AF(LOW, achievementEffortStatistics.ts:142) | deferred | root resolver triplicated |
| 1018-A35 | src/achievementMoney.ts:145; achievementMoneyOrigin.ts:18; achievementMoneyScope | LOW | AO(MEDIUM)+AF(LOW) | deferred | SCALE and decimal parser triplicated |
| 1018-A36 | src/achievementMoney.ts:173 | LOW | AO(LOW)+AF(MEDIUM) | fixed | calculateAchievementMicroUsd, achievementMoneyEvidenceFromBuckets, mergeAchievementMoneyEvidence,... Fixed in 4291292. |
| 1018-A37 | src/heatmap.ts:51 | LOW | AO(LOW)+AF(MEDIUM) | fixed | buildMonthHeatmap, daysInMonth, HeatCell/MonthHeatmap test-only (machine-checks). ~45-55 lines. Fixed in 4291292. |
| 1018-A38 | src/achievementHours.ts:83 | LOW | AF(MEDIUM) | rejected-noise | Arbiter DISAGREE: Reader's "two years = 44k formatToParts" is wrong: input is codex.last30DaysHourlyByDay (webview.ts:5611), so... |
| 1018-A39 | src/achievementHistoryDates.ts:49 | LOW | AF(MEDIUM) | rejected-noise | Arbiter DISAGREE: claudeAchievementSessionHistory's only production call (webview.ts:4875) sits inside the explicit calibration... |
| 1018-A40 | src/dataLoader.ts:771-800 | LOW | CD | deferred | findSessionFiles matches any dir named sessionId at any depth; delete trashes all |
| 1018-A41 | src/projectUsageMatrix.ts:128 | LOW | CD | deferred | bucketScale linear findIndex per cell |
| 1018-A42 | src/claudeIncrementalIndex.ts:805 | LOW | CD | deferred | cloneFile copies full recentPrompts map, no pruning |
| 1018-A43 | src/conversationLog.ts:143 | LOW | CD | deferred | viewer splits whole transcript, no size cap |
| 1018-A44 | src/providers/codex/codexIndex.ts:3646 | LOW | CX | deferred | manifest.files.sort in place |
| 1018-A45 | src/providers/codex/codexIndex.ts:4973 | LOW | CX | deferred | loadCodexIndex readFile no size guard |
| 1018-A46 | src/codexProvider.ts:460 | LOW | CX | deferred | Undecided status at 2026-11-14: quarantine path not located |
| 1018-A47 | src/providers/codex/codexJsonlScanner.ts:54 | LOW | CX | deferred | plain jsonl createReadStream, no O_NOFOLLOW recheck |
| 1018-A48 | src/codexProvider.ts:645 | LOW | CX | deferred | Undecided status at 2026-11-14: cancelAndWait now exists; dispose lease release not traced |
| 1018-A49 | src/providers/codex/codexIndexLease.ts:73,346 | LOW | CX | deferred | Windows EPERM rename not in isPublishConflict path |
| 1018-A50 | src/providers/codex/codexManifest.ts:151 | LOW | CX | deferred | sequential lstat per file each refresh |
| 1018-A51 | src/providers/codex/codexIndexStorage.ts:13,43,81 | LOW | CX | deferred | unused/passthrough timeZone param; all-keys checkpoint adoption (unverified) |
| 1018-A52 | src/providers/codex/codexInsights.ts:193 | LOW | CX | deferred | pasteReadyConstraint test-only |
| 1018-A53 | src/codexView.ts | LOW | CX | deferred | re-export shim remains |
| 1018-A54 | src/providers/codex/codexIndex.ts:3804,3843 | LOW | CX | deferred | schema 1/2 migration types remain |
| 1018-A55 | src/codexIndex.ts | LOW | CX | fixed | no sequential/parallel duplicate loops remain |
| 1018-A56 | src/providers/codex/codexIndexLease.ts:26,149,227 | LOW | CX | deferred | legacy single-file lock shim remains |
| 1018-A57 | src/providers/codex/codexIdentity.ts:450 | LOW | CX | deferred | loadCodexSessionTitles test-only |
| 1018-A58 | src/providers/codex/codexFilePassPool.ts:270 | LOW | CX | deferred | terminate failure plumbing remains (unverified) |
| 1018-A59 | src/providers/codex/codexProvider.ts:398-399 | LOW | CX | deferred | unverified branch computes full proof snapshot then discards hours |
| 1018-A60 | src/webview.ts:3947,3969,3993,4381,4491 | LOW | WV | deferred | CSP script-src unsafe-inline on all documents |
| 1018-A61 | src/webview.ts:17292,18406,18758 | LOW | WV | deferred | bindChartTabEvents duplicate handler |
| 1018-A62 | src/webview.ts:17675,19150 | LOW | WV | deferred | syncChartBarSelection / dailyData_ write-only globals |
| 1018-A63 | src/webview.ts:17644 | LOW | WV | deferred | [DEBUG] console.log on metric switch |
| 1018-A64 | src/webview.ts:3189 | LOW | WV | deferred | redundant dynamic import of ClaudeDataLoader |
| 1018-A65 | src/webview.ts:3657 area | LOW | WV | deferred | static styles/script rebuilt and hashed per updateWebview (unverified) |
| 1018-A66 | src/dashboardRefreshClient.ts:356-367 | LOW | WV | deferred | getBoundingClientRect per candidate |
| 1018-A67 | src/webview.ts:3061 | LOW | WV | deferred | exportShareCard has no in-flight guard (unverified) |
| 1018-A68 | src/webview.ts:17847 | LOW | WV | deferred | Undecided status at 2026-11-14: client regex present; template-literal escape not traced |
| 1018-A69 | src/webview.ts | LOW | WV | deferred | Undecided status at 2026-11-14: month-detail code not located |
| 1018-A70 | src/webview.ts:1563-1573 | LOW | WV | deferred | legacy globalState grants branch remains |
| 1018-A71 | src/webview.ts:1585-1594 | LOW | WV | deferred | achievement migrations each activation |
| 1018-A72 | src/webview.ts:18438-18440 | LOW | WV | deferred | per-date chartMetrics keys never pruned |
| 1018-A73 | src/webview.ts:18972-18974 | LOW | WV | deferred | I18n strings interpolated raw into JS single-quoted literals |
| 1018-A74 | src/achievementCalendar.ts:326 | LOW | AO+AF | fixed | codexAchievementDayEvidence + validCanonicalFiles test-only; ~40 lines. Upstream-owned. Fixed in 4291292. |
| 1018-A75 | src/providers/codex/codexHourProof.ts:44 | LOW | AO+AF | deferred | addCodexOutputHour test-only copy |
| 1018-A76 | src/achievementMoneyScopes.ts:245-250 | LOW | AO | deferred | per-date signature map remains |
| 1018-A77 | src/achievementRecordStore.ts:19 | LOW | AO+AF (apiHeatmap.ts:411) | deferred | V2 constant duplicate remains |
| 1018-A78 | src/heatmapSvg.ts:137; combinedHeatmapSvg.ts:121 | LOW | AO+AF (achievementShare.ts:57) | deferred | compactNum duplicate |
| 1018-A79 | src/achievementCalendar.ts | LOW | AO | deferred | Undecided status at 2026-11-14: validators renamed; not traced |
| 1018-A80 | src/achievementEvidence.ts:8,42 | LOW | AF | deferred | Codex/Claude crossing loops duplicated |
| 1018-A81 | src/codexAchievementRevision.ts | LOW | AF | deferred | Undecided status at 2026-11-14: freeze/copy path not traced |
| 1018-A82 | src/achievementMoney.ts:126 | LOW | AF | deferred | openaiPrices merged into every book |
| 1018-A83 | src/shareCard.ts:232 | LOW | AF | deferred | range string untyped in default filename (unverified) |
| 1018-A84 | src/shareCardSvg.ts:257-262 | LOW | AF | deferred | avatarDataUri only attribute-escaped, no data:image check |
| 1018-A85 | src/providers/codex/codexAchievementOrigin.ts:138 | LOW | AF | deferred | requires dev/ino > 0 |
| 1018-A86 | src/achievementRecordStore.ts:572 | LOW | AF | deferred | Undecided status at 2026-11-14: ENOENT race not traced |
| 1018-A87 | src/achievementHistoryDates.ts:107,186 | LOW | AF | deferred | pricebook mismatch path unchanged (unreachable) |
| 1018-A88 | src/apiHeatmap.ts:176 | LOW | AF | deferred | addTotal overflow assertion unnamed |
| 1018-A89 | src/achievementCalendar.ts:63 | LOW | AF | deferred | module-load parser state for schemaVersion |
| 1018-B1 | src/quotaObservationStore.ts:825 (+append 958-967) | HIGH | HF1 | fixed | Non-ENOENT readFile error (EACCES, EMFILE, Windows EBUSY/EPERM from AV lock) yields an empty store... Fixed in 4291292. |
| 1018-B2 | src/claudeApiClient.ts:181-238 (refreshAccessToken 211-238, saveCredentials 181- | HIGH | HO1, HF2 | fixed | Extension refreshes with Claude Code's own refresh_token, keeps only access_token/expires_in (drops... Fixed in 4291292. |
| 1018-B3 | src/httpClient.ts:85-87 | HIGH | HO3, HF5, AO1, AF1 | fixed | requestViaCurl puts every header on argv: the OAuth Bearer access token on every quota fetch once... Fixed in 4291292. |
| 1018-B4 | src/adviceEffectiveness/remoteAdvice.ts:17 | HIGH | AO14 | fixed | Structured "Get AI Advice" cannot produce a usable result: the model receives only... Fixed in 4291292. |
| 1018-B5 | src/extension.ts:5002-5100 + src/claudeApiClient.ts:302 | MEDIUM | HO2, HF4 | fixed | maybeFetchUsageLimits has no in-flight guard (cache/lastUpdate change only after the response) and... Fixed in 4291292. |
| 1018-B6 | src/extension.ts:5094-5099, 3096-3142, 5292-5297 | MEDIUM | HF3 | fixed | Cold-start quota retry never fetches: first failure sets failStreak=1 and backoffUntil=now+60 s... Fixed in 4291292. |
| 1018-B7 | src/extension.ts:3914, 3956-4031 | MEDIUM | HO8, HF7 | fixed | Every panel setting outside three small sets (presentation toggles, advice.*, openrouter.apiKey,... Fixed in 4291292. |
| 1018-B8 | src/claudeApiClient.ts:161 | MEDIUM | HO5, HF8 | fixed | On Keychain-only macOS installs every quota fetch runs execFileSync('/usr/bin/security... Fixed in 4291292. |
| 1018-B9 | src/claudeApiClient.ts:185 | MEDIUM | HO4 (HF2 mentions l.185) | fixed | Keychain write passes the full credentials JSON (access + refresh token) as `security -w <json>`... Fixed in 4291292. |
| 1018-B10 | src/settings.ts:966 (catch 966-972, activation wrapper 1007-1016) | MEDIUM | HO6 | fixed | initializeSecrets loads all secret definitions in one try; any advice.apiKey migration error... Fixed in 4291292. |
| 1018-B11 | src/extension.ts:5567, 5386 (weekAggregate 5187-5215) | MEDIUM | HO9 | fixed | weekAggregate runs ClaudeDataLoader.getThisWeekData over the full records array plus... Fixed in 4291292. |
| 1018-B12 | src/claudeApiClient.ts:23,164 | MEDIUM | HO10 | won't fix | No stable account id exists in the credentials JSON or usage response, so identity stays HMAC(refresh token); re-login resets weekly history. The "verified" Claude quota identity is HMAC(salt,... |
| 1018-B13 | src/extension.ts:2774-2835 (called 2705; materializeClaudeDashboard 5221-5232) | MEDIUM | HO14, HF9 | fixed | With advice.effectiveness.enabled, every syncProviderUi (several per Claude refresh, ~5 per Codex... Fixed in 4291292. |
| 1018-B14 | src/advisor.ts:48-58 | MEDIUM | AO2, AF2 | fixed | send() retries the paid, non-idempotent model POST on any fetch throw, including the 120 s timeout... Fixed in 4291292. |
| 1018-B15 | src/adviceEffectiveness/preparedRequest.ts:104 | MEDIUM | AO3, AF3 | fixed | Endpoint normalization accepts http: for any host, so a typed `http://` endpoint sends the BYOK... Fixed in 4291292. |
| 1018-B16 | src/adviceDemoSample.ts, src/adviceSummary.ts, src/adviceEffectiveness/{legacyBr | MEDIUM | AO4-AO10, AF11-AF14, AF21 | fixed | Seven modules with zero non-test importers (grep-verified): 443+162+131+276+125+166+166 = 1469... Fixed in 4291292. |
| 1018-B17 | src/adviceEffectiveness/comparisonProduction.ts:311-314 | MEDIUM | AO15, AF18 | deferred | Guardrail still cannot fail; UI now says "Quality not measured" (8 locales); pair producer still hard-codes quality {score:1, passed:"passed"}, qualityFlags []; guardrail cannot fail |
| 1018-B18 | src/extension.ts:337 | LOW | HF6 | deferred | fingerprint salt first-writer-wins in globalState; two windows can diverge |
| 1018-B19 | src/extension.ts:3602 | LOW | HO16, HF10 | deferred | Undecided status at 2026-11-14: double merge not traced |
| 1018-B20 | src/resourceOwnership.ts:193 | LOW | HO22, HF11 | deferred | registry read only by snapshotForTests |
| 1018-B21 | src/dataContribution.ts:1-79 | LOW | HO23, HF12 | fixed | No production importer (grep-verified); no-op scaffold. 79 lines + test, below "large". Fixed in 4291292. |
| 1018-B22 | src/statusBar/quotaPace | LOW | HF13 | fixed | previousPace plumbing gone |
| 1018-B23 | src/adviceEffectiveness/versionedPersistence.ts:236,324,352,457 | LOW | AO17, AF5 | deferred | every mutation helper re-runs full parseCurrentState |
| 1018-B24 | src/httpClient.ts:47 / src/advisor.ts:51 (redirect) | LOW | AO3, AF4 | fixed | requestViaFetch uses default redirect:'follow'; undici strips Authorization but not x-api-key on... Fixed in 4291292. |
| 1018-B25 | src/settings.ts:938,956 | LOW | HO7 | deferred | empty workspace advice.apiKey plus legacy key throws legacy-secret-conflict forever |
| 1018-B26 | src/extension.ts:4546-4551 | LOW | HO11 | deferred | handleCredentialsChange keeps cache.usageLimits and redisplays it via statusBar.updateQuota |
| 1018-B27 | src/extension.ts / preparedRequest.ts | LOW | HO12 | fixed | recordClaudeQuotaObservation rejection no longer drops fresh quota (now swallowed, see F3) |
| 1018-B28 | src/extension.ts:2406,2416 | LOW | HO13, HF20 | deferred | onDidChangeConfiguration/onDidChangeWorkspaceFolders disposables not pushed to subscriptions |
| 1018-B29 | src/statusBar.ts:113 | LOW | HO15 | deferred | setProvider re-renders on every call, no unchanged early return |
| 1018-B30 | src/extension.ts:1536 | LOW | HO17 | deferred | Undecided status at 2026-11-14: codex re-derive not traced |
| 1018-B31 | src/quotaObservationStore.ts:788-799 | LOW | HO18 | deferred | one bad row makes parseStore return null, quarantining all history |
| 1018-B32 | src/extension.ts:878 | LOW | HO19 | deferred | Undecided status at 2026-11-14: clear flag ordering not traced |
| 1018-B33 | src/statusBar.ts:434,648,775 | LOW | HO20, HF17 | deferred | Undecided status at 2026-11-14: label escaped; display_name/surface not traced |
| 1018-B34 | src/extension.ts:4704 | LOW | HO21 | deferred | Undecided status at 2026-11-14: blur watcher recreate not traced |
| 1018-B35 | src/quotaObservationStore.ts:635 | LOW | HO24 | fixed | deriveQuotaResetEvents + helpers have no production caller (machine check). ~75 lines. Fixed in 4291292. |
| 1018-B36 | src/backgroundWorkState.ts:451 (+58-69, 293-295, 325-333; resourceOwnership.ts:3 | LOW | HO25, HF26 | fixed | pauseBackgroundWork / 'user' pause / 'user-pause' stop condition unreachable;... Fixed in 4291292. |
| 1018-B37 | src/localDataControls.ts:250 | LOW | HO26, HF22 | deferred | shouldClearQuotaObservation test-only |
| 1018-B38 | src/statusBar.ts:61, 379, 383, 427, 445-465, 471-475 + quotaPaceAdapters.ts:60-7 | LOW | HO27, HF14, HF15 | fixed | previousPace never supplied, adapters' continuous() always true; hasRawClaudePaceNumber duplicates... Fixed in 4291292. |
| 1018-B39 | src/claudeApiClient.ts:283-286 | LOW | HO28, HF19 | fixed | getAccessToken() has no caller; only public method returning the raw OAuth token. Delete. Fixed in 4291292. |
| 1018-B40 | src/extension.ts:673-674 | LOW | HO29 | deferred | settings?/quotaRuntime? optional fallbacks test-only |
| 1018-B41 | src/refreshPolicy.ts:167,178 | LOW | HO30, HF27 | deferred | one-caller wrappers remain |
| 1018-B42 | src/statusBar.ts:228 | LOW | HF16 | deferred | updateUsageData usageLimits param still optional/unused |
| 1018-B43 | src/quotaWindows.ts:53,58 | LOW | HF18 | deferred | QuotaCredits.limit/percent computed, unread |
| 1018-B44 | src/quotaObservationStore.ts | LOW | HF21 | fixed | Repository.state no longer present |
| 1018-B45 | src/extension.ts:451 | LOW | HF23 | deferred | 2.3.x/2.5.0 announcements unreachable on fork versions (memory rule: alias per merge) |
| 1018-B46 | src/currencyDisplay.ts:72 | LOW | HF24 | deferred | legacy 2.3.2 currency migration still present |
| 1018-B47 | src/settings.ts:72-84 | LOW | HF25 | deferred | one-shot migrations with flags still run each activation |
| 1018-B48 | src/refreshDiagnostics.ts:69-74 | LOW | HF28 | deferred | diagnostic logged once per host lifetime per key |
| 1018-B49 | src/extension.ts:1356 | LOW | HF29 | deferred | Undecided status at 2026-11-14: inline copy not traced |
| 1018-B50 | src/extension.ts:411 | LOW | HF30 | deferred | activation awaits scanCodexManifest while P5 flag unset |
| 1018-B51 | src/settings.ts:53 | LOW | HF31 | deferred | maxLength on few settings only; other webview strings unbounded |
| 1018-B52 | src/extension.ts (50 getConfiguration( calls) | LOW | HF32 | deferred | settings read inside hot closures |
| 1018-B53 | src/adviceEffectiveness/remoteAdvice.ts:161 | LOW | AO19, AF6 | deferred | catch discards HTTP status; all failures read "transport failed" |
| 1018-B54 | src/optimizerRequest.ts:58-75 | LOW | AO21, AF8 | deferred | strict parser no CRLF/dash normalisation |
| 1018-B55 | src/advisor.ts:16 | LOW | AO11, AF15 | deferred | Undecided status at 2026-11-14: unused url normalisers not traced |
| 1018-B56 | src/versionedPersistence.ts:5 | LOW | AO12, AF16 | deferred | Undecided status at 2026-11-14: unused import not traced |
| 1018-B57 | src/adviceEffectiveness/* | LOW | AO13, AF19 | deferred | guard helpers copy-pasted across modules |
| 1018-B58 | src/preparedRequest.ts:87 | LOW | AO16, AF20 | deferred | Undecided status at 2026-11-14: seal/rehash not traced |
| 1018-B59 | src/httpClient.ts:55,156 | LOW | AO20, AF7 | deferred | response body read without size cap |
| 1018-B60 | src/integration.ts:111 | LOW | AO18 | deferred | Undecided status at 2026-11-14: zero-sample consent not traced |
| 1018-B61 | src/providers/openrouter/openRouterHistory.ts | LOW | AO22 | deferred | no apiKey/fingerprint reset found; key switch books phantom spend |
| 1018-B62 | src/extension.ts / preparedRequest.ts | LOW | AF9 | fixed | preparedRequest openai path normalised; not fully checked |
| 1018-B63 | src/adviceEffectiveness/versionedPersistence.ts:457 | LOW | AF10 | deferred | one bad entry invalidates whole advice state |
| 1018-B64 | src/adviceEffectiveness/payload.ts:268-276 | LOW | AF17 | deferred | qualityFlags loop unreachable after throw |
| 1018-merge-F1 | src/extension.ts:912,941 (WHATS_NEW 2.5.0) | MEDIUM | Opus | fixed | Upstream achievements opt-out toast was keyed to literal 2.5.0; fork 2.17.0 entry and ACHIEVEMENT_ANNOUNCEMENT_VERSIONS added. |
| 1018-merge-F2 | .nvmrc:1 | LOW | Fable | fixed | .nvmrc pinned Node 24 while CI uses 26; now 26. |
| 1018-merge-S1 | .github/workflows/publish.yml (build job on workflow_dispatch) | MEDIUM | Astra | deferred | Build job runs from any branch and uploads the VSIX as artifact; TypeSafe said defer; not re-checked. |
| 1018-merge-S2 | .github/workflows/publish.yml (tag job if:) | LOW | Fable | deferred | Tag job condition does not exclude workflow_dispatch on main; TypeSafe said defer; not re-checked. |
| 1018-R1 | src/extension.ts:5062 | MEDIUM | security-opus | fixed | Expired token counted as quota failure, backoff up to 1 h; no longer counts (64c8f2b), later 60 s floor (1020-M2). |
| 1018-R2 | src/advisor.ts:147 | MEDIUM | security-opus (LOW), Astra (MEDIUM) | fixed | 400/422 paid resend sent bytes not shown in preview (Jev F2, preview-both); fallback body and SHA-256 now previewed and sealed (64c8f2b). |
| 1018-R3 | src/extension.ts:2778 | LOW | security-opus, claude-index-fable | fixed | Advice reused a render snapshot from an uncommitted index; only committed snapshots reused now (64c8f2b). |
| 1018-R4 | src/claudeApiClient.ts:160 | LOW | security-opus | fixed | Keychain read had no abort signal and could block clear/dispose; signal added (64c8f2b), refined by 1020-M1. |
| 1018-R5 | src/pricing.ts:703 (perf) | LOW | ui-codex-fable | fixed | Family inference ran on every price lookup; direct label match (1d41311, 68a51d9). |
| 1018-R6 | src/pricing.ts:703 (ordering) | LOW | ui-codex-opus | fixed | Cutover ordering priced unlisted Sonnet 5.x labels at Sonnet 5 rates; labels keep own or LiteLLM pricing (68a51d9). |
| 1018-R7 | src/providers/codex/codexIndexClient.ts:82 | LOW | ui-codex-opus, ui-codex-fable | fixed | Late-resolving cancelled pass started queued foreground refresh; guarded (64c8f2b). |
| 1018-R8 | src/providers/codex/codexIndexClient.ts:179 | LOW | ui-codex-fable | fixed | Worker exit without error event left refresh unsettled; fails active refresh, next spawns new worker (64c8f2b). |
| 1018-R9 | src/providers/codex/codexProvider.ts:347 and 4 raw coverage.complete gates | LOW | ui-codex-opus | fixed | Gates now use codexCoverageSettled (9568eda); calibration and codexIndexTrusted left fail-closed on purpose. |
| 1018-R10 | src/webview.ts:7196,7257 (per-model bucket cutover) | LOW | ui-codex-fable | rejected-noise | Bucket priced at today tier; probably the Jev F8 dropped as false positive (F-to-finding mapping not recoverable from files). |
| 1018-R11 | src/extension.ts:1349,1726 (local data copy) | LOW | ui-codex-opus | fixed | Inventory, dialogs and scope labels localized in 8 locales (Jev F10, d199665, 64c8f2b); CHANGELOG claim narrowed (1020-L2). |
| 1018-R12 | src/dashboardRefreshClient.ts:512 | LOW | ui-codex-opus | fixed | Live patch reset the quota-scope select (Jev F11, first deferred, then user said fix all); fixed in 1101 round (a62a602, 55a2b90). |
| 1018-R13 | src/webview.ts:8009,7675 (week rescans) | LOW | claude-index-fable | fixed | Weekly/week-tab rescan per changed refresh (Jev F12); 9974ea7, 820f0a2. |
| 1018-R14 | src/claudeIncrementalIndex.ts:2522 (gitRootCache) | LOW | claude-index-fable | won't fix | Module git-root cache stale for .git created inside a seen project (Jev F13 defer .28); documented ceiling, reload recovers. |
| 1018-R15 | CHANGELOG wording | LOW | main | fixed | Jev F9: changelog wording corrected. |
| 1018-N1 | src/backgroundWorkState.ts:57 | LOW | cleanup builder | deferred | BackgroundWorkBackoffPolicy left in place (cleanup Open note). |
| 1018-N2 | src/extension.ts (usageLimitTracking/language settings) | LOW | host builder | deferred | Those settings still trigger a full reload (host Open note). |
| 1018-N3 | advice structured output | LOW | advice builder | deferred | No DeepSeek fallback if forced tool_choice is rejected; stored comparison envelope unchanged. |
| 1020-M1 | src/claudeApiClient.ts:167 | MEDIUM | Opus | fixed | Window blur killed the Keychain `security` child and dismissed the prompt; caller now races the shared read, kill only on clear/dispose/profile change (4291292). |
| 1020-M2 | src/extension.ts:4998 | MEDIUM | Opus (Astra LOW) | fixed | Unavailable credentials re-ran fetch every refresh; fixed 60 s floor, streak untouched (4291292, refined by 1101-F1). |
| 1020-M3 | src/pricing.ts:675 | MEDIUM | Opus | fixed | SONNET_5_LABEL missed Vertex, Bedrock and proxy labels so cutover skipped; regex widened (4291292). |
| 1020-L1 | src/providers/codex/codexIndexClient.ts:250 | LOW | Opus | fixed | Stale exit of a replaced worker rejected the new refresh; worker identity guard (4291292). |
| 1020-L2 | src/extension.ts:1700 (CHANGELOG claim) | LOW | Opus | fixed | Dialog target prose stays English; CHANGELOG wording narrowed (Jev 0.80). |
| 1020-L3 | src/localDataControls.ts:266 | LOW | Opus | fixed | Dead localDataActionTitle and LOCAL_DATA_SOURCE_EXCLUSIONS removed (4291292). |
| 1020-X1 | src/claudeApiClient.ts:137,178 | MEDIUM | Astra | fixed | Logged raw JSON.parse message of credential JSON; logs error code/name only (4291292). |
| 1020-X2 | src/claudeApiClient.ts:197 | LOW | Astra | fixed | Cached credentials kept after logout; cleared on authoritative absence (4291292). |
| 1101-P1 | src/webview.ts:9269 getUsageAttribution per render | LOW | main (open note of 9974ea7) | fixed | Week/month/all-time attribution memoized per scope kind (820f0a2 -> 4291292). |
| 1101-R1 | tests/perf/measure-v242-money-scope.cjs | LOW | main (builder note) | fixed | Stale version name renamed to measure-money-scope.cjs. |
| 1101-O1 | tests/perf/measure-money-scope.cjs:5,135 | LOW | Opus | fixed | Rename left usage comment and assertion inconsistent; fixed by main (48566dc). |
| 1101-O2 | src/webview.ts:16222 | MEDIUM | Opus (Jev MEDIUM, fix-now .45) | fixed | Scope key provider:oldestAt drifts with 180-day retention; stable host-side keys all/provider/provider:sha256(fp) (55a2b90). |
| 1101-F1 | src/extension.ts:5001 | MEDIUM | Fable (LOW) | fixed | 60 s floor anchored to stale now; counted from fetch end (399c4e8). |
| 1101-F2 | src/webview.ts:9341 | LOW | Fable | rejected-noise | Duplicate memo shape; Jev real .23, no behaviour bug. |
| 1101-AS1 | src/claudeApiClient.ts:125 | MEDIUM | Astra (main rates LOW) | fixed | existsSync before readFile misclassifies absence; read directly, ENOENT = absence (fa5dad0). |
| 1101-merge-F1 | LOCAL-DATA.md:24, LOCAL-DATA.zh-CN.md:42 | HIGH | Fable | fixed | Docs still said expired token is refreshed and written back; corrected (a185731). |
| 1101-merge-F2 | src/claudeApiClient.ts:162 | MEDIUM | Opus, Fable, Astra (LOW) | fixed | currentQuotaIdentitySignal had no abort signal so blur/settings change waited on Keychain prompt; signal forwarded (a185731). |
| 1101-merge-F3 | src/extension.ts:5036 | MEDIUM | Fable (LOW) | deferred | recordClaudeQuotaObservation rejection swallowed with no log; still open at 2026-11-14. |
| 1101-merge-F4 | src/quotaObservationStore.ts:929 | LOW | Opus, Fable | deferred | rememberScopeLabels has no production caller (dead upstream API); still open. |
| 1101-merge-F5 | src/extension.ts:5076 | MEDIUM | Opus (LOW) | deferred | adoptSharedQuota re-reads credentials every tick on foreign fresh observation; still open. |
| 1101-merge-A1 | src/claudeApiClient.ts (loadCredentials) | LOW | Astra | deferred | Credential file read has no size limit; not triaged by Jev, not fixed. |
| 1114-X1 | src/dataLoader.ts:787 (findSessionFiles via webview.ts:3174) | HIGH (arbiter+Astra MEDIUM) | Fable (MED), Opus (LOW) | deferred | Delete trashes every projects/**/<sessionId> dir, so id memory/subagents trashes auto-memory dirs; report only. |
| 1114-X2 | src/webview.ts:3220-3250 | HIGH (arbiter+Astra MEDIUM) | Opus (MED), Fable (LOW) | deferred | updateSetting/resetSetting accept any key incl. advice.apiUrl and secrets; advice send has no host confirmation; report only. |
| 1114-X3 | src/miniMarkdown.ts:63-172 | MEDIUM | Fable | deferred | U+2028/U+2029 in fence/heading line: renderMarkdown never terminates, host OOM (proven by run); report only. |
| 1114-X4 | src/webview.ts:3145 | LOW | Fable | deferred | resumeSession cwd taken from message, not host record. |
| 1114-X5 | src/miniMarkdown.ts:40-44 | LOW | Opus, Fable | deferred | Emphasis regex rewrites inside generated href. |
| 1114-X6 | src/miniMarkdown.ts:47 | LOW | Opus, Fable | deferred | NUL placeholder collision renders "undefined" or duplicates a code span. |
| 1114-L1 | src/advisor.ts:13-37 | LOW | main (tsc strict) | deferred | normalizeOpenAiUrl/normalizeAnthropicUrl unused (same as 1018-B55). |
| 1114-L2 | src/webview.ts:154-155; src/projectUsageMatrix.ts:178,209 | LOW | main | deferred | Unused imports and ~10 production functions only tests call (unused-exports.txt). |

## Open items

Most severe first. None of these were changed on 2026-11-14 (audit only).

1. `1114-X1` HIGH (arbiter and Astra MEDIUM, Jev HIGH .54): session delete trashes every `projects/**/<sessionId>` directory. Fix: match a directory only when a sibling `<sessionId>.jsonl` exists, or require UUID shape; use `replace('{name}', () => name)`.
2. `1114-X2` HIGH (arbiter and Astra MEDIUM): `updateSetting`/`resetSetting` accept any key, including `advice.apiUrl` and secret keys, and advice send needs no host confirmation. Fix: reject secret keys, gate endpoint changes behind a host modal, wrap `settings.set`.
3. `1114-X3` MEDIUM: U+2028/U+2029 makes `renderMarkdown` loop forever and OOM the host when the conversation opens. Fix: consume one line when a paragraph loop makes no progress; add a test.
4. `1101-merge-F5` MEDIUM `src/extension.ts:5076`, `1101-merge-F3` MEDIUM `src/extension.ts:5036`, `1101-merge-F4` LOW `src/quotaObservationStore.ts:929`, `1101-merge-A1` LOW unbounded credential file read.
5. `1018-B17` MEDIUM comparison guardrail cannot fail; `1018-B26` old account quota stays shown after logout (`extension.ts:4546`); `1018-B31` one row more than a day in the future quarantines the whole quota store (`quotaObservationStore.ts:705`, current `788-799`).
6. `1018-merge-S1`, `1018-merge-S2` publish workflow build/tag conditions (TypeSafe said defer), `1018-N1..N3`.
7. LOW: `1114-X4..X6`, `1114-L1`, `1114-L2`, `1004-8`, `1004-11`, `1018-A73` (latent: no locale string contains an apostrophe today), and the remaining deferred `1018-A*`/`1018-B*` rows. About 4,500 production lines in the 2026-10-18 report were flagged removable or movable to tests; the dead-code blocks not yet deleted are in those rows (unused exports, test-only functions, locale copy in `webview.ts`, duplicated parsers, schema migrations).
8. Seventeen `1018-*` rows have undecided status (not traced at HEAD): A46, A48, A68, A69, A79, A81, A86, B19, B30, B32, B33, B34, B49, B55, B56, B58, B60.

### Coverage gaps still open

- `webview.ts` outside the message handler (2640-3341) and sink windows: only grep heuristics were applied on 2026-11-14.
- `codexView.ts`, `codexViewComponents.ts`, `i18n.ts` string tables, `webview.ts` CSS (`getStyles`): never read.
- 2026-10-18 denied readers: security-fable, claude-index-opus, refactor-opus; claude-data had only Opus, codex and webview-a only Fable. 2026-10-20 had no Fable reader. Webview-b (`webview.ts` 5799-11413, `conversationViewerHtml.ts`, `miniMarkdown.ts`, `svgEscape.ts`) got its first read on 2026-11-14 for the handler and sinks only.
- Playwright UI suite not run on 2026-10-18 or 2026-11-14; fix-round UI specs run were only week-tab and local-data-controls (11/11). Specs listed but not run: claude-settings, codex-accessibility, achievement-experience, dashboard-live-refresh.
- Asset downscale of the 11 MB achievement badges (binary assets) not done; `1018-A26` is a partial fix.

## Dependency scan history

| Date | Tool | Lockfiles | Result |
| --- | --- | --- | --- |
| 2026-10-04 | not recorded | n/a | no scan recorded in the round files |
| 2026-10-18 | osv-scanner 2.7.0 (osv-scalibr 0.5.3), image `ghcr.io/google/osv-scanner@sha256:4f3b7e2c64b9d38a5febc5a7e4a3dfef1d1362f726dea7a2ef4762b46469fcd0` | `package-lock.json` (9 packages), `.github/build-tools/package-lock.json` (196) | none |
| 2026-11-01 (fix round, `820f0a2`) | osv-scanner 2.7.0, same image | same two | 2 LOW dev-only, both in `.github/build-tools` (not shipped in the VSIX): GHSA-xcx6-jx8p-x3h5 `@azure/msal-node` 6.0.1 (CVSS 7.5) and GHSA-g3hv-75wg-m249 `minimatch` 10.2.6 (CVSS 6.9). Fixed by user commit `1f4b731` (msal-node 7.1.2 via `@azure/identity` 4.14.1; scoped `minimatch` 11.0.3 override for vsce); proof: `npm audit --audit-level=high` 0, `vsce package` and `verify-vsix.mjs` ok |
| 2026-11-01 (final, `fa5dad0`) | osv-scanner 2.7.0 | both (197 packages in build-tools) | No issues found |
| 2026-11-14 | osv-scanner v2.7.1 | both (9 and 197 packages) | No issues found |

The extension has no runtime dependencies. Supply-chain notes: see `1018-merge-S1` and `1018-merge-S2`.

## UI and test checks history

| Date | Check | Result |
| --- | --- | --- |
| 2026-10-04 | tsc, node suite (also Node 26.10.0), Playwright full suite, perf script | tsc clean, 1260 pass / 0 fail, Playwright 198 passed, `measure-dashboard-reuse.cjs` exit 0 |
| 2026-10-18 | tsc, node suite, tsc strict unused | tsc clean, 2766 tests / 2763 pass / 3 skipped; strict found 21 unused symbols and 1 missing return (`webview.ts:4809`); Playwright not run |
| 2026-10-18 (fix round) | node suite per builder | 2747 to 2783 tests, 0 fail after fixes (3 skipped); week-tab spec and local-data-controls spec added |
| 2026-10-20 | node suite, Playwright week-tab + local-data-controls | 2776 tests / 2773 pass / 0 fail / 3 skipped; Playwright 11 passed (8.6 s) |
| 2026-11-01 | baseline, final node suite, Playwright week-tab + local-data-controls | baseline 2776 / 2773; final 2785 / 2782 / 0 fail / 3 skipped; Playwright 11 passed (10.0 s, final 7.9 s) |
| 2026-11-14 | tsc, node suite in Docker `node:26@sha256:e18c3ccdf7d71619990b0e85639f506e2028a95410999cab24cc373cbd10e0ac`, tsc strict | tsc clean, 2986 tests / 2983 pass / 0 fail / 3 skipped; strict: 16 unused plus 2 missing-return (`webview.ts:5026` intentional); Playwright not run |

Astra security passes: 2026-10-18 fix round $0.268, merge-review unlisted; 2026-10-20 $0.172; 2026-11-01 $0.104 (CRED hunks), $0.050 (final look, none), $0.130 (v2.5.1 merge); 2026-11-14 $0.175.
