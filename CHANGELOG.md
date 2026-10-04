# Changelog

All notable changes to this fork compared to upstream
[`jack21/ClaudeCodeUsage`](https://github.com/jack21/ClaudeCodeUsage) (last
upstream merge: 2.4.0 / `298b2e1`). Format follows [Keep a Changelog](https://keepachangelog.com).

## [2.15.0] — 2026-10-04

### Added (fork-specific)

- **UI coverage for the "This Week" tab** — the tab had none: the Playwright harness never supplied the billing window's reset instant, so the reset banner, the week usage-tracking card and the entire `week-` drilldown path were unreachable from the suite. That blind spot is how several regressions reached releases with a green run. Four specs now assert the data, not the markup: the window and its charts render, week drilldown ids stay namespaced apart from the 30-day tab's for a shared date, expanding a week day opens that tab's own row and leaves the 30-day row closed, and Codex never shows the Claude-only tab.

### Changed (fork-specific)

- **CI runs on Node 26** — the release and test workflows pinned Node 20 and 22; both now use 26, verified against Node 26.10.0.

### Fixed (fork-specific)

- **Repeated polls no longer re-render every Claude panel** — the weekly aggregate was rebuilt on each publish, and the dashboard compares panel inputs by identity, so a quota-tracked workspace invalidated all seven Claude panels on every poll even when nothing changed. It is memoised on the identity of the record array it was computed from, never a deep comparison, so a replaced or cleared corpus always recomputes; the memo is released with the Claude source.

- **"This Week" data on the reused-snapshot publish path** — upstream's v2.4.0 performance work replaced the day-rollover republish with a republish on every unchanged refresh, driven by a reused dashboard snapshot. The weekly billing-window aggregate is not part of that snapshot (it exists only when the OAuth quota API reported a reset time), so it is now recomputed on that path as well, and the week aggregate and its reset instant travel with every `updateData` call — including the two new cold-failure paths upstream introduced.
- **Per-panel render cache and the "This Week" tab** — the dashboard now memoises each tab's HTML against the data it was rendered from. The week aggregate and its reset instant are part of that cache identity, so a changed billing window re-renders the tab instead of serving the previous week's HTML.
- **"Usage tracking" card outside Today** — upstream memoised the attribution behind a today-only cache. The fork's week, month and all-time cards each carry their own exact scope and are computed per scope again; only the Today card uses the memoised value.
- **Fast-mode, US-inference and thinking-token data reaching the aggregators** — upstream's new `compactUsageRecord()` rebuilds each parsed record's `usage` object and runs on both parsers before any aggregation. It kept only the token counts, so `speed`, `inference_geo` and `output_tokens_details` were discarded: fast-mode pricing, the 1.1× US-only multiplier and the exact thinking-token figure were all silently inert at runtime while every pricing test stayed green (they price raw token objects and never go through the loader). The three fields travel through compaction again, covered by a loader-path test that bills a fast-mode US request end to end.
- **MCP and reasoning-effort rows in the "Usage tracking" card** — `_mcpServer`, `_mcpTool` and `_effort` were stamped only by the legacy loader, which stopped being the runtime path when the incremental index took over. The index parser stamps them too, so those rows render again.
- **Prototype pollution via a session's skill or plugin name** — the per-session skill/plugin aggregate was the one aggregation map still built from a `{}` literal, so a session attributed to a skill literally named `__proto__` mutated `Object.prototype`. It now uses a null-prototype map like every sibling aggregate.
- **All-time skill attribution** — the heuristic skill/plugin shares on the All Time card were always empty: with no day-key set for that scope the filter compared `undefined === true` and dropped every invocation, while the record filter kept them all.
- **Dashboard reuse benchmark measured the wrong corpus** — `tests/perf/measure-dashboard-reuse.cjs` wrote its 50,000-record array into the `dataDirectory` slot, because this fork's `weekData` parameter shifts `allRecords` one position later. The benchmark reported `records: 50000` while timing a six-record fixture, and exited 0. It now writes the correct slot and asserts the provider actually received the corpus.
- **Status bar session cost during a failed refresh** — upstream's new shared cold-failure handler republished today / workspace / month totals but dropped the session segment. The session total is passed on that path too.
- **1-hour cache-write rate after a pricing refresh** — upstream rewrote the LiteLLM catalog parser with validation and a replace-then-swap build. The parser copies same-named fields only, so the LiteLLM-specific `cache_creation_input_token_cost_above_1hr` mapping is applied inside the new parser; without it a pricing refresh silently billed 1-hour cache writes at the 5-minute rate.
- **Sonnet 5 introductory pricing next to upstream's Sonnet 5.5 table** — both tiers exist as distinct pricing objects, and the 5.5 pattern is matched before the looser Sonnet 5 pattern so `sonnet-5-5` is not priced as Sonnet 5. The timestamped `getModelPricing(model, atMs)` cutover is unchanged.

### Added (merged from upstream v2.4.0)

- **Optional status-bar quota format template** — `statusBarQuotaFormat` names the quota windows, order and separators shown in the status bar, with per-segment reset styles.
- **Preview-first sharing workspace** — one presentation selector for the combined Claude + Codex activity heatmap, the Claude Share Card and the Claude-only token heatmap, with the export preview as the visual focus.
- **German and Brazilian Portuguese READMEs**, bringing documentation to all eight UI languages.

### Changed (merged from upstream v2.4.0)

- **Incremental-index performance series (#99)** — window drift, newly appended files, multi-file appends and files that leave the window no longer force a full corpus rebuild; `Intl` and date-label formatters are memoised; an unknown model is reported once per session instead of once per priced record; the full loader and the incremental index share one exact content-analysis cutoff. This fork's exact `sinceTs` attribution boundary is unaffected: it remains an instant, not a civil day.
- **Claude and Codex experience alignment** — Codex is presented as a first-class provider in current UI and documentation; historical v2.3 notes keep their Beta wording. Fork-exclusive Claude surfaces stay Claude-only.
- **Bounded diagnostics and stabilized large-history refreshes** — diagnostic output and pricing-fetch work are bounded, and a reused render snapshot keeps equivalent polls from rebuilding every hidden panel.

### Changed (fork-specific)

- Upstream's `fix: auto-recover marketplace delivery (#107)` is deliberately not adopted: its VS Code Marketplace and Open VSX publish steps, the retry/reconciliation job and the new `marketplace-recovery.yml` workflow are omitted. This fork still ships the `.vsix` as a GitHub Release asset only, and the policy tests that assert that boundary are kept in place of upstream's registry-delivery assertions.

### Upstream alignment

Aligned with `jack21/ClaudeCodeUsage` v2.4.0 (`298b2e1`).

---

## [2.14.0] — 2026-09-20

### Security (fork-specific)

- **Every GitHub Actions reference is pinned to a commit SHA** — `actions/upload-artifact` (in the release workflow), plus `actions/checkout` and `anthropics/claude-code-action` in the maintainer mention workflow, were still on mutable tags. A tag can be repointed at new code; those two workflows attach release assets and run with `contents: write`, so a retag upstream would have silently changed what executes. All six actions are now SHA-pinned at their latest release (checkout v7.0.1, setup-node v7.0.0, upload-artifact v7.0.1, action-gh-release v3.0.3, release-drafter v7.7.0, claude-code-action v1), each annotated with its version, and a new policy test fails the build if any workflow reintroduces a tag reference.

### Fixed (fork-specific)

- **"Usage tracking" card matched the wrong window on the This Week and This Month tabs** — upstream's v2.3.3 attribution refactor moved scoping to timezone day keys, which snapped the fork's exact boundary (`resets_at − 7 days`, almost always mid-day) to the start of its civil day. The card then counted up to 24 hours of usage that the tab's own headline and per-day breakdown excluded, so the two disagreed. The boundary is honoured as an exact instant again, for both records and skill invocations, and a regression test now asserts the card equals the tab total.

### Added (merged from upstream v2.3.1 – v2.3.3)

- **Project activity matrix** — a per-project view of the last 90 days showing which projects consumed the budget, on the Projects tab.
- **Combined activity heatmap and private sharing** — a Claude + Codex heatmap that can be exported locally as SVG/Markdown, or published to a repository the user names explicitly.
- **Curated display currencies** — cost figures can be shown in a selected currency instead of USD only.
- **New pricing tables** — GPT-6 Astra, Claude Fable 5.1 and AWS Bedrock in-region Claude rates, with the reduced Fable 5.1 cache-read rate.
- **Evidence-backed advice loop** — AI advice keeps versioned local evidence, seals the request preview before sending, and revocation of consent takes effect immediately.
- **Durable quota history and observed weekly allowance estimates** — quota observations are persisted so weekly windows no longer overlap or double-count.
- **Thirty-day Codex hourly drill-down** and a single-flight Codex refresh lifecycle with resumable historical indexing.

### Changed (merged from upstream v2.3.1 – v2.3.3)

- **Rolling 30-day middle tab** — the dashboard's middle timeframe is now an exact rolling 30-day range (`rolling30DayData`, `dailyDataForRolling30Days`), rendered from the materialized dashboard snapshot; the status-bar "monthly cost" segment keeps calendar-month semantics. This fork's "This Week" tab and its usage-tracking cards are unchanged and stay Claude-only.
- **Accessible tab contract** — dashboard tabs and panels render through shared `role="tablist"`/`role="tabpanel"` helpers. The fork's "This Week" tab and panel go through the same helpers.
- **Timezone-stable ranges** — usage attribution, chart date labels and rolling ranges are computed from configured-timezone day keys. The fork's boundary-anchored scopes (quota week start, first of the calendar month) map onto the same day-key window.
- **State-preserving live refresh** — expanded drill-downs survive a refresh; per-day hourly details are materialized in the Webview instead of round-tripping to the extension host.

### Fixed (fork-specific)

- **This Week data after a calendar rollover** — upstream's new cached republish path (day rollover with no changed files) now recomputes the weekly billing-window aggregate too, instead of publishing a dashboard with an empty "This Week" tab.

### Changed (fork-specific)

- The release workflow pins `@vscode/vsce` to an exact version and verifies the packaged `.vsix` (sources, tests, dotfiles, key material, runtime entry point) before attaching it to the GitHub Release. Upstream's VS Code Marketplace and Open VSX publishing steps are deliberately not adopted; this fork still ships the `.vsix` as a GitHub Release asset only.

### Upstream alignment

Aligned with `jack21/ClaudeCodeUsage` v2.3.3 (`b83e7d6`).

---

## [2.13.0] — 2026-09-06

### Added (fork-specific)

- **Tokens per tool call** — a new panel on the Content tab ranking every tool by how much context one call of it pulls in, biggest first. The existing "by tool" bars rank by total, which a frequently-used cheap tool wins; ranking per call is what makes two ways of answering the same question comparable (an MCP graph query against reading the file it summarises). Deliberately a measurement, not a savings figure: the logs record what each call returned, never what an alternative would have returned, so a "saved" number would be a guess. Figures use the same billing-calibrated scaling as the rest of the content analysis.

### Upstream alignment

Unchanged — aligned with `jack21/ClaudeCodeUsage` v2.3.0 (`eca4e43`).

---

## [2.12.0] — 2026-09-06

### Added (fork-specific)

- **Skills and plugins per session** — the Sessions table gains a sortable "Skills / plugins" column showing which skills and plugins a conversation used. The cell shows the priciest entry plus a `+N` overflow marker; hovering lists every skill and plugin with its exact spend and turn count. Figures come from the `attributionSkill` / `attributionPlugin` fields Claude Code stamps on each usage line, so they are measurements rather than estimates — sessions from logs that predate the stamping show `-`.

### Upstream alignment

Unchanged — aligned with `jack21/ClaudeCodeUsage` v2.3.0 (`eca4e43`).

---

## [2.11.0] — 2026-09-05

### Added (merged from upstream v2.3.0)

- **Codex beta provider** — the dashboard gains Claude / Codex Beta provider tabs. Codex usage is read locally from Codex session logs and shown with API-equivalent cost (unknown models stay unpriced), daily and monthly time series, recent-task status, and its own settings group; the status bar can follow either provider. Fork-exclusive Claude surfaces (the "This Week" tab, usage-tracking cards, content analysis) render on the Claude provider only.
- **Official quota thresholds** — quota display follows the official usage-threshold levels.
- **Tidier usage-credits tooltip row** — the credits line in the quota tooltip is more compact.
- **Persistent chart metrics** — chart-tab metric choices are remembered per chart (`applyChartMetric`/`restoreChartMetrics`) and restored on reopen. This fork's cross-tab hourly drill-down (the same date expanded on both This Week and This Month) stays container-scoped under the new machinery.

### Upstream alignment

This fork is aligned with `jack21/ClaudeCodeUsage` v2.3.0 (`eca4e43`) — every upstream feature through that commit is present. Fork-exclusive additions on top: "This Week" billing tab with charts and reset countdown, session cost in the status bar, usage-tracking card on every timeframe tab, effort/MCP/thinking usage details, fast-mode & US-geo billing guards, Sonnet 5 introductory-pricing boundary, `maxysoft` publisher branding, and the tag-push-only release workflow.

---

## [2.10.1] — 2026-08-02

### Changed (fork-specific)

- **Per-model weekly caps shown by default** — `showScopedWeekly` now defaults to on (upstream defaults it off), so the status bar reads e.g. `wk 4% (fable 17%)` out of the box. A cap still only appears once it has usage against it; turn it off in ⚙ Settings if unwanted.

---

## [2.10.0] — 2026-08-02

### Added (merged from upstream v2.2.2)

- **Richer quota windows** — upstream's take on the per-model weekly limits supersedes this fork's v2.9.0 implementation: a dedicated `quotaWindows.ts` normalizer reads both API generations, the status bar nests a per-model cap in the weekly figure ("wk 9% (fable 17%)"), the tooltip lists every weekly cap with its own bar, reset countdowns follow the configured format, and usage credits (spend against your cap) appear in the tooltip once used. `showOpusWeekly` becomes `showScopedWeekly` (existing choice carries over).
- **Lower multi-window energy use** — polling and file watchers suspend in unfocused VS Code windows and refresh immediately on focus.
- **Quota failure throttling** — repeated quota authentication failures back off up to one hour, retrying immediately after credentials change.
- **Usage dashboard recovery** — one oversized non-transcript `.jsonl` no longer aborts the earliest-timestamp probe and blanks the dashboard.
- **Opus 5 context window** — bare `claude-opus-5` recognised as a 1M-context model.
- Missing pt-BR / Indonesian settings translations filled in.

### Upstream alignment

This fork is aligned with `jack21/ClaudeCodeUsage` v2.2.2 (`cb4a30b`) — every upstream feature through that commit is present. Fork-exclusive additions on top: "This Week" billing tab with charts and reset countdown, session cost in the status bar, usage-tracking card on every timeframe tab, effort/MCP/thinking usage details, fast-mode & US-geo billing guards, Sonnet 5 introductory-pricing boundary, `maxysoft` publisher branding, and the tag-push-only release workflow.

---

## [2.9.0] — 2026-07-28

### Added (fork-specific)

- **Fable weekly quota window** — the OAuth usage API's modern `limits[]` array carries per-model weekly windows (`kind: "weekly_scoped"`, e.g. Fable) that the extension previously dropped. Scoped windows now appear in the status bar (`Fable 2%`) and as their own rows in the quota tooltip, with the same stale-window handling as the 5-hour/weekly figures.
- **Reasoning-effort breakdown** — records stamped with a top-level `effort` ("xhigh", "high", …) are aggregated into a cost-weighted split, shown as a section in the attribution panel and as rows in the per-timeframe "Usage tracking" card.
- **MCP server attribution** — `attributionMcpServer`/`attributionMcpTool` fields are now read; MCP servers get their own attribution-panel section and a top-server row in the "Usage tracking" card.
- **Exact thinking tokens** — newer Claude Code versions log `usage.output_tokens_details.thinking_tokens`; when present, summaries show an exact "Thinking tokens" figure (distinct from the text-length estimate used elsewhere).
- **Fast-mode pricing** — records with `speed: "fast"` bill at the official fast-mode premium (Opus 4.8 $10/$50, Opus 4.7 $30/$150; cache multipliers stack on the fast input price).
- **US inference-geo multiplier** — records with `inference_geo: "us"` bill the official 1.1× multiplier on every token category.

### Upstream alignment

Unchanged — aligned with `jack21/ClaudeCodeUsage` v2.2.1 (`ade48ab`). Fable per-token pricing was already correct ($10/$50, cache $12.50/$20/$1); no pricing change was needed for Fable.

---

## [2.8.1] — 2026-07-20

### Fixed (fork-specific)

- **Claude Sonnet 5 overcounted by 50%** — Sonnet 5 was priced at the $3/$15 Sonnet 4.x tier, but its official price is the introductory $2/$10 (cache write $2.50 5m / $4 1h, cache read $0.20) through 2026-08-31, per [Anthropic's pricing page](https://platform.claude.com/docs/en/about-claude/pricing). Pricing is now timestamp-aware: usage through 2026-08-31 bills at the introductory rate, usage from 2026-09-01 at the standard $3/$15 tier. Verified against ccusage over the full local history: every daily total now matches to the cent.
- **Pricing refresh dropped the 1-hour cache-write rate** — "Refresh Token Pricing" (LiteLLM) didn't map LiteLLM's `cache_creation_input_token_cost_above_1hr` field, so after a manual refresh all 1-hour cache writes were billed at the cheaper 5-minute rate. The field is now mapped.

---

## [2.8.0] — 2026-07-20

### Added (fork-specific)

- **Usage tracking card on every timeframe tab** — the cost-weighted attribution card from the Today tab (large context, long sessions, subagent-heavy, workflows, top skill) now also renders on This Week, This Month, and All Time. Each card is scoped to its tab's own window: the week card uses the exact billing-window start (`resets_at − 7 days`), the month card uses the calendar month, and All Time covers everything via a new `'all'` attribution scope.
- **This Week charts** — the This Week tab gains the same daily breakdown as This Month: metric switcher (cost / input / output / cache creation / cache read / messages), stacked cost chart, token-composition chart, and a per-day table with expandable hourly drill-downs. Rendered from a new `getDailyDataForWeek()` scoped to the billing window.

### Changed (fork-specific)

- **Shared daily-breakdown renderer** — the This Month tab's breakdown markup was extracted into a single `renderDailyBreakdownSection()` now used by both the Week and Month tabs, so their design stays identical by construction.

### Fixed (fork-specific)

- **Hourly drill-down cross-tab collision** — expandable per-day detail rows were looked up document-wide by date; with the same date present on both the This Week and This Month tabs, expanding a row on one tab could operate on the other tab's hidden row. Lookups are now scoped to the active tab, and the hourly-data response fills both tabs' containers.

### Upstream alignment

Unchanged from 2.7.0 — aligned with `jack21/ClaudeCodeUsage` v2.2.1 (`ade48ab`).

---

## [2.7.0] — 2026-07-19

### Added (merged from upstream v2.2.0 / v2.2.1)

- **Usage Share Card** — a configurable, shareable one-page SVG summary (range, scope, metrics, and theme pickers), exportable and publishable straight to a GitHub repo.
- **Conversation viewer** — read-only reader for a past session's prompts/answers (Markdown rendering, thinking and tool traffic behind toggles) without reloading it into the model's context.
- **Insights suite** — cache-churn bill, cache warmth by model, big one-shot turns, active-hours sparkline, and skill ROI, all opt-in and labelled as estimates.
- **Token heatmap** — GitHub-style yearly token heatmap on the All tab, plus an export-to-file and publish-to-GitHub command.
- **All-sessions view** — the Sessions tab can show every session with persisted time-range, project, and model filters.
- **Bahasa Indonesia (`id`)** — eighth UI language, with a dedicated `README-id.md` and Indonesian timezone presets (WIB / WITA / WIT).
- **Reset countdown format setting** — quota reset countdowns can render as decimal, whole-unit, or local clock/date formats.

### Fixed (merged from upstream v2.2.0 / v2.2.1)

- **Refresh performance** — refresh now scans a file manifest and diffs it against the previous one, so idle/unchanged files are skipped instead of being fully reparsed every cycle; per-refresh diagnostics are logged.
- **Refresh on window focus** — regaining window focus now reliably triggers a refresh.
- **Daily/monthly date labels** — first-of-month rows keep their daily label and monthly keys no longer shift a month backward in negative-UTC zones.
- **Timezone-aware bucketing and cache-write cost accuracy** — day/month totals bucket consistently in the configured timezone, and TTL-tagged cache writes are priced correctly.

### Changed (fork-specific)

- **Restored the "This Week" tab's data** — `getThisWeekData()` and its wiring in `extension.ts` had been dropped silently in a prior merge, so the tab always showed "not available"; both are back and covered by the existing tests.
- **`publish.yml` no longer publishes to the VS Code Marketplace or Open VSX** — reverted to this fork's own tag-push → build → package → attach-to-GitHub-Release flow, dropping the upstream release-triggered `VSCE_PAT`/`OVSX_PAT` publish steps a prior merge had reintroduced.

### Upstream alignment

This fork is aligned with `jack21/ClaudeCodeUsage` v2.2.1 (`ade48ab`) — every upstream feature through that commit is present. Fork-exclusive additions on top: "This Week" billing tab with reset countdown, session cost in the status bar, and `maxysoft` publisher branding.

---

## [2.6.0] — 2026-06-14

### Added (merged from upstream v2.1.1)

- **Claude Sonnet 5 context window fix** — `contextWindowFor()` now recognises `claude-sonnet-5` (no `-4-` segment) and shows the correct 1M window instead of falling back to 200K.
- **Brazilian Portuguese (pt-BR)** — seventh interface language.
- **Sessions: resume / copy / delete** — per-row actions plus a Current project / All filter.
- **Monthly cost in the status bar** — `statusBarMetric: 'monthly-cost'` option.
- **Quota display options** — `quotaFiveHourOnly`, `showResetInStatusBar` settings.
- **Sturdier quota** — last `/usage` result cached to disk, shown instantly on startup; 429 back-off.
- **Quota refresh on account switch** — OAuth credentials re-read on every quota fetch and the credentials file is watched, so switching accounts no longer leaves the status bar stuck on stale usage.
- **Wider dashboard** (up to 1600px) with indented sub-project rows.
- **Settings tab in the dashboard** — most settings now live in extension storage and are edited from a ⚙ Settings tab instead of VS Code's Settings UI.
- **Workflows tab** — per-run breakdown of multi-agent sessions (models, cost, cache hit rate, per-agent tasks).
- **Usage attribution panel** — cost/tokens broken down by skill, subagent, plugin, and model across day/week/month/session/project scopes.
- **Thinking token estimation** — estimated thinking-token share per session.
- **Context-window indicator** — new status bar item showing the current session's context fill (`$(layers)` icon).
- Numerous model-pricing corrections (GLM, MiniMax, MiMo, Kimi, Qwen, Hunyuan, Step families).

### Changed (fork-specific)

- **Status bar now shows three cost segments** — today's total (`$(pulse)`), this project's cost today (`$(folder)`), and the current session's cost (`$(history)`), each with its own tooltip column.
- **"Get AI Advice" icon** — inline SVG lightbulb instead of emoji, in both the header shortcut button and the advice card.
- **Restored `npm run test` script** in `package.json` for the unit tests carried over from upstream.

### Upstream alignment

This fork is aligned with `jack21/ClaudeCodeUsage` v2.1.1 (`e52634c`) — every upstream feature through that commit is present. Fork-exclusive additions on top: "This Week" billing tab with reset countdown, session cost in the status bar, and `maxysoft` publisher branding.

---

## [2.5.1] — 2026-06-14

### Fixed

- **"Get AI Advice" button icon** — replaced `✨` emoji (invisible on Linux/no-emoji-font systems) with an inline SVG lightbulb. Upstream v2.0.1 reintroduced the emoji; this restores the SVG approach from our v2.2.2 fix.

---

## [2.5.0] — 2026-06-13

### Added

- **Auto-refresh toggle** — header now includes an on/off switch for the
  dashboard auto-refresh. Mirrors `claudeCodeUsage.pauseDashboardRefresh`
  setting; toggling via the UI updates the VS Code config immediately
  (upstream `v2.0.2`).
- **File-watching setting** — new `claudeCodeUsage.fileWatching` boolean:
  when enabled the status bar refreshes within ~1.5 s of each new message;
  disable to fall back to the interval-based refresh (upstream `v2.0.1`).
- **Session title in Sessions tab** — the Sessions breakdown table now shows
  the extracted session title (`custom-title` / `ai-title` / `summary`)
  alongside the project path (upstream `v2.0.1`).
- **Stacked cost charts** — monthly and all-time daily charts now render as
  stacked bars broken down by model family (upstream `v2.0.1`).
- **DeepSeek V4 Pro pricing** — added `deepseek-v4-pro` model entry.
- **Upstream upstream/main issue templates** — four GitHub issue templates
  plus a pull-request template added to `.github/`.

### Changed

- **Upstream merge** — merged `jack21/ClaudeCodeUsage` commits `b5d69b9`
  (v2.0.1) and `fae6d4b` (v2.0.2) into our fork. All fork-exclusive
  features retained (see below).
- **Dedup logic** — session record deduplication switched from `Set` to
  `Map` keyed on `requestId`; when duplicates exist the entry with the
  higher token count is kept (upstream `v2.0.1`).
- **Quota expired-window handling** — `liveWindows()` rolls expired quota
  windows forward rather than hiding them instantly; windows older than
  2× the period are dropped completely (upstream `v2.0.1`).
- **429 cool-down** — OAuth rate-limit back-off reduced from 5 min to 60 s
  (upstream `v2.0.1`).
- **Token expiry re-read** — credentials are re-read from disk before each
  quota refresh, fixing "quota dead until restart" after a token rotation
  (upstream `v2.0.1`).

### Retained (fork-exclusive features)

- **"This Week" billing tab** — shows usage aggregated over the current
  Anthropic weekly billing window (not present in upstream).
- **Week reset countdown** — banner in "This Week" tab shows exact
  reset date/time and time remaining.
- **Session cost in status bar** — `$(history) $0.12` secondary cost
  alongside `$(pulse) $1.45` daily cost (not present in upstream).
- **publisher** — kept as `maxysoft`; upstream publisher rebrand not applied.

---

## [2.2.4] — 2026-06-13

### Added

- **Claude Fable 5 / Mythos 5 pricing** — added the top-tier `claude-fable-5`
  and `claude-mythos-5` models at their published $10 / $50 per-million
  input/output rates (5-minute cache write $12.50, cache read $1.00). The
  family-detection fallback now recognises `fable`/`mythos` model ids before
  the generic Claude branches.

### Fixed

- **Fable/Mythos cost undercount** — usage logged against a Fable or Mythos
  model previously matched no pricing family and fell back to Sonnet rates
  ($3 / $15), undercounting cost by ~3.3×. These models now resolve to the
  correct top-tier pricing.

---

## [2.2.3] — 2026-06-03

### Added

- **"This Week" reset countdown** — the "This Week" tab now shows a banner
  with the exact date/time of the next weekly billing window reset and the
  time remaining (e.g. `Resets: Mon Jun 09 at 14:22 — 5h 38m`). The banner
  is derived from the `seven_day.resets_at` field already fetched by the
  OAuth quota API; it only appears when `usageLimitTracking` is enabled.

---

## [2.2.2] — 2026-06-03

### Fixed

- **"Get AI Advice" button icon** — replaced `✨` emoji with an inline SVG
  4-pointed star. The emoji requires a system emoji font and is invisible on
  many Linux setups; inline SVG renders correctly in all platforms via the
  Chromium webview engine.

---

## [2.2.1] — 2026-06-03

### Fixed

- **Floating horizontal scrollbar** — native horizontal scrollbar on `.daily-table-container`
  elements was only reachable after scrolling past all table rows. Now hidden via
  `scrollbar-width: none` / `::-webkit-scrollbar { display: none }` and replaced by a
  `position: fixed; bottom: 0` overlay div (`#float-hscroll`) that stays visible at the
  bottom of the viewport. The floating bar syncs bidirectionally with the active table
  container; links automatically on tab switch and on hover.
- **`body { overflow-x: hidden }`** prevents the native page-level horizontal scrollbar
  from reappearing alongside the floating one.
- Reverted "Get AI Advice" button icon from inline SVG back to the original `✨` emoji,
  which renders correctly in VSCode webviews and matches the upstream design.

---

## [2.2.0] — 2026-06-03

### Added

- **`de-DE` (German) added to the `claudeCodeUsage.language` settings enum** — was
  accepted by the runtime but absent from the VS Code settings picker since 1.0.8.

### Changed

- **Publisher / author** changed from `GrowthJack` to `maxysoft`. Original extension
  credited in `description`, `contributors` array, and repository links
  (`github.com/jack21/ClaudeCodeUsage`).
- **Repository / homepage / bugs URLs** updated to `github.com/maxysoft/ClaudeCodeUsage`.
- **Webview container** `max-width` increased from `800px` → `1100px` for wider
  token-breakdown tables and charts.
- **GitHub Actions workflow** (`publish.yml`): removed VS Code Marketplace (`vsce publish`)
  and Open VSX (`ovsx publish`) auto-publish steps. Workflow now compiles, packages a
  versioned `.vsix` (`claude-code-usage-<version>.vsix`), uploads it as a build artifact,
  and attaches it to the GitHub Release on `v*` tag push. Renamed workflow to
  `Package Extension`.

---

## [2.1.0] — 2026-06-03

### Added

- **"This Week" tab** in the usage dashboard. Shows usage aggregated for the current
  Anthropic billing window, derived from the OAuth quota API's `seven_day.resets_at`
  field (`resets_at - 7 days` = billing window start). Inserted between "Today" and
  "This Month".
- `ClaudeDataLoader.getThisWeekData(records, weekStart)` — requires an explicit
  `weekStart` date; no calendar-Monday fallback.
- `thisWeek` i18n key added to all six UI languages: English ("This Week"), German
  ("Diese Woche"), 繁體中文 ("本週"), 简体中文 ("本周"), 日本語 ("今週"),
  한국어 ("이번 주").

### Changed

- When `usageLimitTracking` is disabled or the OAuth API has not returned
  `seven_day.resets_at`, the "This Week" tab shows a clear explanation:
  _"Weekly data not available. Enable `claudeCodeUsage.usageLimitTracking`."_
  — rather than silently falling back to the most recent Monday.

---

## [Unreleased]

### Added
- **Documentation in every supported UI language** — German and Brazilian
  Portuguese now have concise READMEs alongside the existing editions. The
  Marketplace README links all eight language variants; English and Chinese
  retain the fuller references. The extension description and tags identify
  its Claude/Codex token and quota use cases without presenting estimates as
  billing data.
- **`statusBarQuotaFormat`** (default empty) — name the quota windows in the
  status bar yourself when you want a different set, order or separators than
  the built-in `5h 6% · wk 1%`: `{5h.pct}`, `{wk.pct}` (or `{7d.pct}`) and
  `{model:Fable.pct}`, each also taking `.reset` and `.label`. `.reset` follows
  `resetCountdownFormat` unless it names its own style, so one bar can mix them:
  `{5h.reset:units}`, `:decimal`, `:clock` or `:at` (wall clock, `Thu 16:59`).
  Empty keeps the built-in layout, and a template supersedes
  `quotaFiveHourOnly` and `showScopedWeekly` since it names its windows itself.
  A segment whose window your account does not report is dropped along with its
  separator. The dashboard keeps this optional feature compact: a Built-in,
  5-hour-only, Weekly-only, or Custom dropdown reveals the template field only
  when Custom is selected.

### Changed
- **Codex graduates from Beta** — after the shared interaction, accessibility,
  performance, localization, package, and installed-extension gates passed,
  current UI and documentation now present Codex as a first-class provider.
  Historical v2.3 release notes retain their original Beta wording.
- **One preview-first sharing workspace** — the full-width export preview is
  now the visual focus, with controls below it and one presentation selector
  for the combined Claude + Codex activity heatmap, the legacy Claude Share
  Card, and the Claude-only token heatmap. Provider accounting and labels remain
  distinct: the combined view is activity volume, while the two legacy views
  continue to use Claude aggregates only.
- **Command and setting compatibility** — `exportShareCard`, `exportHeatmap`,
  and `publishHeatmapToGitHub` remain registered and open their matching preview
  instead of bypassing the workspace. `enableShareCard` remains the one visible
  on/off control and still defaults to `true`; retired `showHeatmap` state stays
  catalogued and clearable for one release without creating a duplicate panel.
- **Strict local-artifact boundary** — previews and local SVG/Markdown exports
  use only materialized aggregates and cannot request GitHub authentication,
  profile, avatar, or name data. Claude heatmap publication is the only sharing
  network path; it remains a separate explicit public-repository action with
  exact repository/branch/path and create-or-overwrite confirmation.
- **Codex status bar** — newly defaulted metric is today's processed tokens;
  explicit uncached/output choices remain available. The weekly indicator
  continues to show remaining capacity, not used tokens.
- **Smooth live scrolling** — during an active scroll burst, the newest
  provider-panel refresh waits for a short quiet interval before replacing
  its DOM. A 500 ms ceiling prevents continuous scrolling from starving live
  updates; the existing scroll/focus preservation and single-flight index
  boundaries remain in place.
- **Bounded sharing refreshes** — only the selected presentation is rendered;
  hidden Share Card and heatmap artifacts are not rebuilt on every refresh.
  Materialized daily aggregates are reused while their input and pricing
  identity is unchanged.
- **Shared exact content-analysis cutoff (#99)** — the full loader and
  incremental index now use one rolling-cutoff helper. The full loader captures
  it once for both content analysis and calibration, keeping those windows
  aligned even if parsing crosses an expiry boundary. Millisecond precision
  remains unchanged; existing timestamp frontiers skip body reads between
  actual expiries. The proposed hourly approximation is not applied.

### Fixed
- **AI destination mismatch** — the initial DeepSeek configuration now selects
  its matching OpenAI-compatible format. Request normalization preserves the
  configured host and proxy prefix, rejects protocol conflicts and secret-bearing
  URLs, and supports DeepSeek's explicit Anthropic-compatible prefix. Previews
  disclose endpoint, format and model alongside canonical bytes; private integrity
  seals bind destination metadata to the exact prepared request.
  Before advice activation, an existing BYOK key without an explicit format
  retains its prior Anthropic protocol. Explicit formats remain unchanged;
  new installs use the matching OpenAI-compatible default. Incompatible legacy
  endpoints require an explicit format/URL correction, never a silent host switch.
  Migration failure disables advice for that activation without losing the
  stored key or disabling usage views. Ordinary reset retains this compatibility
  default; separately confirmed clear-all also clears the non-secret enum marker.
  Obsolete VS Code configuration is ignored after the generic settings migration,
  so resetting a local override cannot resurrect an old API format.
- **Share Card preview/export mismatch** — editing range, theme, number format
  or visible sections disables export until a matching preview is accepted.
  Stale preview replies cannot enable a newer draft. Export writes that immutable
  SVG rather than recalculating a different artifact when opening the save dialog.
- **Auto-refresh pause across providers** — both Claude and Codex pages respect
  the switch while indexing and status items continue. Manual/settings updates
  remain available. Source revisions still invalidate stale advice handles while
  paused; privacy revocation is never gated by presentation pause.
- **Misleading indexing completion** — primary logs, period migration and hourly
  history use their own counters; cooldown, no-progress and user-pause states
  show recovery/wait text rather than treating primary 100% as full completion.
- **Warm refresh failures without feedback** — verified data remains displayed
  with a coalesced, anonymous inline failure/last-success indicator. Retry success
  clears it without replacing charts, scroll or focus merely to report status.
  Codex retains same-directory snapshots through temporary unavailability, but
  clears old data on a directory change. Retired asynchronous callbacks cannot
  mutate the replacement provider's state.
  Claude source changes likewise immediately revoke old usage, quota, advice
  and sharing previews even while presentation is paused; late discoveries or
  index results cannot restore a retired source or its last-success timestamp.
- **Repeated hidden-panel work** — unchanged panel HTML and Claude weekly usage
  inputs have provider-lifetime bounded caches. Data, configuration, prices,
  locale, configured calendar day and quota-reset boundaries invalidate them;
  Today's relative reset text expires by minute without recalculating history.
  Complete, unchanged Codex polls retain the verified view and insight revisions
  instead of generating false backfill progress and invalidating hidden panels.
  Production Claude poll/focus refreshes also reuse the complete time-aware
  dashboard contract; identical quota observations retain their references.
  Unchanged polls no longer invalidate accepted Share Card previews.
  Default-on Content attribution also reuses one bounded data section without
  freezing live advice or Optimizer controls; it expires at calendar/settings
  boundaries and releases retained records when the source is revoked.
- **Minute-spaced Today polling** — Today's numeric usage attribution now has
  a single-entry calendar-day cache, independent from minute-sensitive quota
  countdowns. Unchanged minute polls within an hour avoid full-history scans;
  the hourly hidden-panel refresh still computes Content attribution once.
  Record/analysis changes, configured midnight/timezone, pricing and
  source revocation still invalidate it. Coordinator and scale regressions now
  advance both Date.now() and new Date() between polls rather than testing only
  repeated refreshes at one frozen instant.
- **Cold-build interruption and price-refresh race** — display-only settings
  changes retain completed, verified same-source index work without delivering
  the retired presentation. A separate source/pricing generation rejects late
  results after price refresh, source changes, clear-all or disposal, so an
  old-priced index cannot overwrite the replacement and keep stale costs.
- **API key removed by ordinary defaults reset** — the dashboard and host exclude
  secret keys from that action. The separately confirmed clear-key command remains
  the explicit deletion route.
- **Codex directory recovery hidden after fallback** — its existing directory
  field is available on both providers' settings pages, including when Codex is
  unavailable and the dashboard falls back to Claude. No additional setting is added.
- **Unknown-model warning flood and Opus 5.5 pricing (#122, #120)** — pricing
  diagnostics are emitted once per bounded model label, with a hard limit of
  128 labels plus one suppression message per Extension Host lifetime. The
  deduplication set cannot grow without bound; oversized or non-model labels
  are neither retained nor echoed. This removes the per-record console/IPC
  amplification reported by @jordanvalnet, building on @rsyuzyov's #120.
  Opus 5.5 now has its own verified standard and cache-write/read prices,
  including the explicit Bedrock regional backend, instead of inheriting
  Opus 5 rates. Codex and weekly-value exact-price coverage still exclude
  family/default fallback rates; Claude's main cost retains its existing
  estimated fallback behavior.
- **Current exact model prices** — GPT-6.1 Sol, GPT-6 Sol, GPT-6 Luna, and
  Sonnet 5.5 now use dedicated, officially verified Standard/cache rates.
  Sol generations retain their distinct cache-read rates; Sonnet 5.5 retains
  its separate 1-hour cache-write price and explicit Bedrock regional premium.
  Unknown dated labels do not acquire fabricated exact-price coverage.
- **Malformed metadata and related refresh hazards** — non-string, oversized,
  control-character, and prototype-named model labels become a fixed unpriced
  label without dropping their valid numeric usage. Model/tool/session object
  keys cannot mutate shared prototypes. Each aggregate bucket is copied only
  once per transaction, including model-label churn, while old snapshots stay
  immutable. Failed provider UI synchronization cannot strand either refresh
  gate, stop Codex provider work, or repeatedly emit diagnostic messages;
  a failed Claude new-snapshot render does not discard its verified index.
- **Bounded background results and pricing downloads** — a slow first Codex
  file or checkpoint no longer accumulates the entire batch of later results:
  dispatch is limited to twice the worker count ahead of ordered application.
  Manual price refreshes share one request, have a 16 MiB response cap,
  16,384-entry catalog cap and 15-second absolute deadline, and replace the
  runtime catalog atomically only after validation. Failed downloads preserve
  the previous catalog. The compatibility loader reports anonymous counts
  instead of per-line/file console errors or arbitrary diagnostic labels.
- **Claude all-time drill-down cost on large histories** — month → day uses a
  materialized configured-timezone daily aggregate built by the incremental
  index, rather than rescanning retained records when a month is opened.
  Eligible recent days can continue to the existing hour detail without any
  source-log read.
- **Raw Share Card scope persisted in browser storage** — project paths and
  session identifiers now remain memory-only; only non-identifying display
  controls survive a Webview reload.
- **Large Claude transcript buffers retained in memory** — dedup now keeps
  fixed-size UTF-16-accurate digests, bounded prompt/task excerpts are detached,
  and usage-bearing assistant rows retain only the fields needed for usage
  calculations after content analysis. An opt-in 2.4 GiB synthetic corpus with
  content analysis enabled showed sampled peak RSS falling from about 3.04 GB
  to 360 MB for long user prompts; a separate long assistant-body fixture also
  stays below 350 MB. Unchanged files are not reread. This does not establish
  Windows or real-history smoothness; #99 remains open.
- **PR first-pass review that only posted boilerplate (#108–#112)** — a failed
  model request or empty answer now fails the PR workflow with a safe tier/status
  diagnostic and posts no comment; issue triage retains its explicit fallback.
  DeepSeek's cheap tier disables default thinking to preserve reply tokens, the
  escalation tier has an output cap above its thinking budget, and the default
  flash identifier tracks the current supported model. A cheap reply marked
  as needing source is never posted when escalation fails. Existing bot
  comments are not edited retroactively.
- **Full rebuild whenever a new transcript appeared (#99)** — a file that had
  just been created was treated as an unsafe mutation, so every new session
  rebuilt every contribution in the corpus. A new file is now read in full on
  its own while the established files stay untouched; ordering state is
  recomputed from metadata, and a new file carrying an already-owned UUID still
  falls back to the full rebuild. Measured on 15 real transcripts with two
  appends and one new file: 16 body reads and 3042 ms became 3 body reads and
  567 ms.
- **Full re-read when several sessions append at once (#99)** — the content
  analysis fast path required exactly one changed file, so a machine running
  more than one agent never took it: every refresh rebuilt all contributions
  from every file. Any number of pure tail appends now stays incremental.
  Appends are parsed in full-scan order and new-UUID ownership is attributed to
  the owning file, so results match the full loader. Measured on 15 real
  transcripts (34 MB) with three files appended: 15 body reads and 8.7 s became
  3 body reads and 0.6 s.
- **High CPU during indexing (#99)** — day, month and hour bucketing no longer
  constructs a fresh `Intl.DateTimeFormat` for every ingested record. The
  resolved zone and both formatters are memoised per zone, so a large local
  history is indexed without pinning a core. On a 1.4 GB history the key
  derivation went from ~1.1k to ~168k records/second (158x) with identical
  keys; invalid and empty zones still fall back exactly as before.
- **Dashboard date labels rebuilt a formatter for every row (#99)** — the same
  per-call `Intl.DateTimeFormat` construction, in the table and chart labels:
  `toLocaleDateString` built a fresh formatter for every date it rendered. The
  formatter is now memoised per locale and options, with output identical to
  `toLocaleDateString` for every UI locale; one label went from ~31 µs to ~1 µs.
- **Append fast path never ran on a history older than the window (#99)** —
  every file whose events were all older than the content-analysis window got
  fresh empty collections on each refresh, so it read as a changed payload and
  kept the fast path off for good. Such a file now keeps its empty
  contribution. On a 979-file history, 53 spurious payload rebases per refresh
  became none.
- **One-shot sharing command intent** — command-opened previews now override a
  previously saved Claude tab and presentation exactly once. A provider-local
  monotonic revision history is separate from the live intent; the Webview ACK
  consumes that intent, so reset, normal rerender, and dispose/reopen cannot
  replay an acknowledged command or reuse its revision.
- **Verified sharing reset** — the in-workspace button now uses the same
  confirmed host request → request-id client action → ACK protocol as Local Data
  controls. Browser-storage deletion failure is reported, and successful reset
  defaults survive a full reload.
- **Readable and accessible SVG previews** — the 1200×680 Share Card keeps its
  intrinsic width inside a local horizontal scroller at 360px. Deterministic
  inner-SVG geometry and contrast tests cover every normal label at 4.5:1 or
  better without excluding the artifact from the surrounding Axe scan.

## [2.3.3] — 2026-09-16

### Fixed

- **Startup with legacy workspace advice keys (#105)** — a workspace-scoped
  plaintext BYOK key or unavailable SecretStorage no longer prevents the usage
  status bar, commands, and dashboard from activating. The old key remains
  untouched and is never copied into a global secret; AI advice stays
  unconfigured until the user completes the manual migration. A localized
  warning no longer blocks extension startup.
- **Resilient release delivery** — the verified VSIX is attached to the GitHub
  Release before either registry publish begins, and VS Code Marketplace and
  Open VSX are attempted independently. Both registry uploads use pinned,
  Node-engine-compatible CLIs, bounded retries, and duplicate-safe publishing,
  so a transient timeout cannot silently block the other registry or leave the
  release without its downloadable package. Targeted retries reuse that exact
  attached VSIX; a missing legacy asset is rebuilt once from its release tag.
  A failed asset download is never mistaken for a missing asset or silently
  replaced by a rebuild.
  Release Drafter also performs a merge-complete reconciliation pass so the PR
  that triggered the main-branch push cannot be omitted by event-ordering races.
- **Smoother live Webview refreshes** — provider-panel patches now preserve
  bounded chart, table, project-matrix, heatmap, sharing, preview, and tab-strip
  horizontal positions with transient privacy-safe structural keys, alongside
  the existing document identity, focus, selection, and vertical anchor. Local
  scrolling still performs no per-frame Extension Host persistence.
- **Stable unchanged Compare refreshes** — the displayed update time now follows
  the stable rendered data snapshot. An unchanged Compare refresh remains
  byte-identical and no longer forces a complete Webview document replacement.
- **Bounded Codex project aggregation** — project previews now index sorted
  thread rows once instead of rescanning every thread for every project, and
  last-activity maxima no longer expand history into function arguments.
- **Single-flight Codex refresh lifecycle** — overlapping poll, watcher, focus,
  settings, and manual triggers now share one provider lifecycle. A burst keeps
  only the strongest pending follow-up, all callers await the same bounded
  drain, diagnostics retain the coalesced-trigger count, and disposal or local
  data clearing drops queued work instead of starting another index pass.
  Index teardown also raises a synchronous suspension fence before its first
  await, so an already queued follow-up cannot recreate the index while a clear
  or rebuild is active; on success the fence remains until the replacement
  provider is installed.
- **Quota status contract** — disabling quota tracking hides both Claude and
  Codex quota status items while preserving the all-off dashboard entry icon.
- **Claude calendar rollover** — unchanged histories now republish Today and
  the rolling 30-day snapshot at configured-timezone midnight without
  rereading JSONL bodies.
- **Bounded credentials-watcher recovery** — asynchronous failures from the
  Claude credentials-directory watcher now use the same capped exponential
  re-arm path as the provider log watchers while polling remains available. A
  temporarily absent profile directory no longer breaks that bounded chain,
  and recovery stops when quota tracking, the window, profile, or extension no
  longer owns it.
  Anonymous refresh diagnostics count unnamed quota-watcher events, and Codex
  index diagnostics now identify their trigger, watcher/debounce counts, and
  actual backfill/worker mode without paths, filenames, or account data.
- **Exact bounded Claude content analysis** — the incremental index now preserves
  the legacy full scan's global tool/Skill attribution, canonical timestamp and
  discovery ordering, 5,000-Skill boundary, response calibration, and valid
  JSON-at-EOF behavior. Safe appends replay only touched structural IDs and use
  direct UUID-owner lookups; unchanged refreshes read zero bodies even when a
  completed malformed line is present. Re-enabling analysis after a disabled
  timezone change rebuilds day-sensitive contributions before publication,
  including across DST boundaries.

## [2.3.2] — 2026-09-12

### Added
- **Project activity matrix (brought forward from the planned v2.3.3)** — the
  existing Projects page now gives Claude and Codex the same Token-only 30/90-day
  project × day heatmap and daily stacked trend. Exact tooltips and explicit
  complete/partial coverage keep the view auditable; bounded project rows,
  matrix cells, and trend series roll the long tail into **Other projects**.
  It reuses provider indexes already built during normal refresh, so opening,
  switching, or expanding the view performs no source-JSONL read and adds no
  watcher, timer, cache, worker, dependency, or network path.
- **Curated display currencies (#91)** — a single compact Settings dropdown now
  selects USD (default) or one of thirteen common display currencies. Conversion
  uses a bundled 2026-09-09 ECB-derived snapshot; rates are deterministic,
  offline, and not user-editable. Stored prices, aggregation, sorting, and
  persistence remain in USD, converted estimates carry an `≈` marker, and
  provider-native usage credits are never converted.
- **Complete chart drill-down paths** — both providers support All time month →
  day and Last 30 days day → hour expansion wherever materialized aggregates
  exist. Mouse, Enter, and Space share the same selection, disclosure, focus,
  nested-collapse, and reload-restoration behavior without reading JSONL on
  click.
- **Provider-qualified chart names** — chart regions and heatmaps expose stable,
  localized provider, scope, chart-type, and selected-metric names. Names update
  with metric switches and remain unique across Compare.

### Changed
- **Project insight schedule** — the formerly planned v2.3.3 project matrix is
  included in this v2.3.2 candidate; the later roadmap now starts after X-06
  instead of carrying a duplicate implementation phase.
- **State-preserving live refresh** — ordinary updates replace only the active
  provider panel and preserve the selected tab, drill-down chain, chart/hour
  selection, temporary Optimizer input, keyboard focus, and nearest scroll
  anchor. Structural changes and failed delivery still fall back safely to a
  complete Webview document.
- **Exact dashboard ranges** — Today remains 24 configured-zone hours and Last
  30 days remains today plus the preceding 29 calendar dates. Missing buckets
  are represented as zero without extending source aggregates.
- **Quieter hourly charts** — zero-usage hours retain their axis positions,
  table rows, click details, tooltips, and accessible values, but no longer
  repeat `0` above every empty bar. Real activity with unavailable pricing still
  displays `—`.

### Fixed
- **Resilient provider watchers** — failed Claude or Codex watchers re-arm with
  bounded exponential backoff while polling remains available; recovery and
  disposal cannot create a retry hot loop.
- **Efficient Codex title lookup** — validated file identity and stat metadata
  avoid repeatedly streaming an unchanged `session_index.jsonl`; titles remain
  memory-only and path-redacted.
- **Quota and Webview boundaries** — bounded quota compaction preserves series
  endpoints and reset boundaries, and dynamic sharing failures render as text
  instead of interpreted HTML.

## [2.3.1] — 2026-09-08

### Added
- **GPT-6 Astra and Claude Fable 5.1 pricing** — exact model IDs now use their
  current official Standard API rates and context windows: `gpt-6-astra`
  (1.05M context) and `claude-fable-5-1` / `claude-mythos-5-1` (1M context).
  Fable 5.1's model-specific cache-read rate is `$0.25 / MTok`; historical
  Fable 5 pricing remains unchanged. GPT-6 requests above 272K input receive a
  request-wide surcharge from OpenAI, but local aggregate logs cannot prove
  that per-request boundary, so the API-equivalent estimate deliberately uses
  the standard short-context rate and keeps the existing request-level-pricing
  disclaimer.
- **AWS Bedrock in-region Claude pricing (#95)** — an opt-in Claude pricing
  backend covers Opus 4.5–5, Sonnet 4.5–5, and Haiku 4.5 with separate
  5-minute/1-hour cache-write and cache-read rates. Switching backends
  invalidates cached Claude cost aggregates so unchanged local logs are
  repriced immediately. Sonnet 5 uses the standard in-region rate that applies
  after its launch promotion ended on 2026-08-31. Thanks to
  [@akapti](https://github.com/akapti) for the contribution.
- **Combined activity heatmap and private sharing** — Compare now leads with a
  Claude + Codex calendar heatmap built from the existing provider daily
  aggregates. Its preview-first share studio exports deterministic local SVG, a
  privacy-safe card, and a copyable Markdown snippet with configurable title,
  30/90-day or yearly range, and an explicit privacy preview. The default
  Academic Violet ramp follows the project-profile visual reference, quantile
  bands keep isolated peaks from flattening ordinary days, and the mapping can
  be switched locally between quantile, logarithmic, and linear modes. Four
  curated or one custom accent palette can be selected. Claude-only and
  Codex-only histories remain useful; no second log scan or statistics cache is
  introduced.
- **Durable quota observation history** — versioned, atomically written,
  bounded observations keep provider, machine-local anonymous account epoch,
  observation/reset time, used/remaining fraction, window identity, source,
  confidence, and quality flags. Window-ID changes, reset-time changes, and
  significant usage rollbacks preserve irregular and same-day reset events.
- **Observed weekly allowance estimates** — every valid observation in a
  coherent window contributes `priced used equivalent / used fraction`; robust
  aggregation weights price/log coverage, boundary quality, attribution, and
  recency. Total estimates never fall below confirmed usage, unused estimates
  never go negative, and a coherent current or completed window exposes both as
  a subscription-durability estimate. If later logs overrun a stale observation,
  the full value remains a low-confidence lower bound while unused is withheld
  instead of showing a false zero. Unattributed or approximate windows are
  labelled low confidence. Even when local Codex quota series overlap, the
  current period uses the latest real observation for a clearly labelled
  low-confidence blended total/unused estimate; ambiguous completed periods
  stay used-only.
- **Evidence-backed advice loop** — the default-off feature keeps local
  observations, evidence, recommendations, actions, local helpful/not-helpful/
  applied feedback, and guarded comparable-task results in one surface. When
  reliable comparable work is unavailable, it says that the evidence is
  insufficient instead of manufacturing an improvement claim.
- **Exact BYOK preview and explicit send** — aggregate-only is the default.
  Prompt personalization has separate consent. The complete Anthropic or
  OpenAI-compatible request body is prepared once, previewed with its byte count
  and SHA-256, and only the same canonical bytes can be sent after a second user
  click. Claude Code OAuth credentials are never used for generative requests.
- **Versioned local comparison evidence** — sanitized task pairs and frozen
  comparison-result envelopes retain only coarse provider, cohort, metric,
  quality, coverage, and version fields. Prompt text, response text, paths,
  session identifiers, and task bodies have no persistence field.
- **Bounded local advice snooze** — each recommendation can be paused for seven
  days (up to thirty days), moved out of the default summary, and shown again
  on demand or after expiry; ratings and applied feedback remain independent.
- **Thirty-day Codex hourly drill-down** — every populated date in the rolling
  30-day view can expand from the already-indexed sparse date/hour sidecar.
  Clicking a date reads zero JSONL bodies; the 31st day is evicted, and Claude
  and Codex use the configured timezone and shared `HH:00` labels.

### Changed
- **Refreshed release documentation** — all seven README editions now show the
  current Claude Today, Codex overview, collapsed weekly details, and vertical
  sharing studio. Captures use the production renderer with disclosed synthetic
  fixtures; a repeatable capture script keeps screenshot provenance explicit.
- **Shared dashboard system** — Claude and Codex now reuse the same density,
  headings, disclosure controls, chart/table framing, empty states, focus
  treatment, responsive navigation, and light/dark design tokens while keeping
  provider-specific metric labels and meanings. Dashboard figures use the VS
  Code UI font again; monospace remains limited to code and copyable snippets.
- **Preview-first sharing layout** — the combined heatmap now occupies the full
  reading width and Card settings sit directly below it. Weekly period tables
  are collapsed by default so the trend chart remains primary. The sharing
  workspace is enabled by default and one Settings toggle hides all sharing UI.
- **Concise plugin settings** — the verbose local-data inventory and destructive
  privacy-control panel no longer renders inside the dashboard. The authoritative
  inventory, retention boundaries, and clear paths remain in the repository's
  `LOCAL-DATA.md` files.
- **Aligned Codex status bar** — the main Codex item now uses configured-zone
  Today instead of Recent task. Its compact quota percentage means remaining
  allowance; the tooltip and warning colour continue to use observed utilisation
  with Claude's progress bars, thresholds, reset columns, and line wrapping.
- **Chronological month views** — Codex monthly charts and tables render
  oldest-first in every range.
- **Explicit Codex uncached composition** — the Token composition summary now
  surfaces uncached usage (uncached input + output) while retaining the
  non-overlapping uncached-input / cached-input / output stack; reasoning stays
  a disclosed subset of output.
- **System-reminder prompt filtering remains intentional** — framework reminder
  messages are excluded from user-input counts; token and cost totals are unchanged.
- **One AI request boundary** — the former Get AI Advice command and Usage
  Optimizer now enter the same preview, explicit-send, cancellation, strict
  response parsing, and local-state boundary. The optimizer still sends only
  the draft pasted by the user and keeps its copyable result format.
- **Resumable Codex historical work** — first-use and migration work records its
  progress, failure streak, next eligible time, and pause reason. Successful
  work continues without an artificial delay; failure or no progress cannot be
  hot-looped by ordinary refreshes, and restart resumes from a safe checkpoint.
- **Unified resource ownership** — timers, watchers, workers, network requests,
  and backfills expose their creator, stop conditions, and actual disposal to
  lifecycle tests. A bounded first-index exception may finish after focus loss,
  but disable, explicit cancellation, and extension disposal still stop it.
- **Safer Codex rolling totals and reset history** — recent 7/30-day views no
  longer trust an inflated or still-rebuilding period sidecar; they use the
  verified daily aggregate until the configured-zone projection catches up.
  The existing index pass also captures compact quota observations without
  polling, credentials, or a second scanner.

### Fixed
- **One-time v2.3.0 Codex token-semantics migration** — the per-file parser
  state now carries a new semantics version. Existing schema-3 indexes request
  one bounded, resumable rebuild instead of retaining pre-fix request
  attribution indefinitely; completed files survive partial checkpoints.
- **Account-aware quota confidence** — a reset boundary may remain useful for
  deterministic weekly alignment across anonymous Codex epochs, but crossing
  an account/profile fingerprint can no longer erase `account-ambiguous`.
  Current-window total and unused estimates remain available at low confidence.
- **Deterministic scroll debounce test** — continuous-scroll coverage now emits
  one synchronous gesture and advances only the fake clock, removing a race
  between animation frames and the 180 ms persistence timer.
- **Immediate advice-consent revocation** — withdrawing aggregate or prompt
  consent immediately invalidates prepared previews and cancels active advice
  requests, without waiting for local storage. New previews/sends stay blocked
  until all consent writes settle; persistence failures stay closed. Unrelated
  user-draft Optimizer requests are not cancelled. Already transmitted bytes
  cannot be recalled.
- **Claude watcher failures fall back safely** — asynchronous `fs.watch`
  errors (for example, an exhausted watch-handle limit) are now handled after
  registration, close the owned watcher cleanly, and leave normal polling
  active instead of escaping through the Extension Host.
- **Timezone-stable chart date labels** — daily and monthly usage keys no
  longer roll back a day or month when a chart metric changes or a drill-down
  renders in a Webview host/configured timezone west of UTC. Bare monthly keys
  also render as the intended month instead of `Invalid Date`.
- **Configured-zone advice snooze dates** — Advice and Optimizer now format a
  snooze expiry with the selected UI locale and configured timezone instead of
  whichever timezone happens to host the Extension process.
- **Configured-zone rolling ranges** — the Claude provider heatmap now ends on
  today in the configured timezone. Share Card 7-day, 30-day, and yearly scopes,
  plus Usage tracking and AI-advice 7-day/30-day attribution, use exact
  civil-date windows instead of fixed millisecond cutoffs. Claude and Codex
  session range filters now follow those same Today/7-day/30-day date keys.
  Claude session, project, branch, and workflow timestamps also use the
  configured timezone for their clock and Today/Yesterday/year labels.
  Activity near UTC boundaries is no longer omitted or pulled from an adjacent
  local day.
- **Complete Share studio localization** — the active Compare sharing workspace
  now carries complete German, Japanese, Korean, Brazilian Portuguese, and
  Indonesian copy instead of silently falling back to English. A repository
  coverage guard keeps all eight supported locales aligned when copy fields
  change.
- **Hardened Codex thread-title path redaction** — runtime titles now mask POSIX
  absolute paths even when a path is attached directly to a colon or other
  punctuation (for example, `3:/Users/name`), preventing local usernames and
  filesystem locations from reaching dashboard text or screenshots.
- **Claude chart drill-down reload parity** — expanded day-to-hour and
  month-to-day rows now survive a Webview reload, re-request their lazy detail
  data, and retain selected/ARIA state. Chart controls derive their drill-down
  kind from their own tab instead of whichever tab happened to be active while
  the page initialized; an intentional tab switch still clears expansions.
- **Claude rolling-range regression** — Claude's middle dashboard tab now uses
  Today plus the preceding 29 configured-zone calendar dates instead of the
  current calendar month. The Workflows summary now uses the same rolling range,
  classifies runs by their configured-zone start date, and compares against the
  matching 30-day total. The monthly-cost status-bar option remains a calendar
  month, and an empty Today view identifies the latest recent activity date.
- **Reconciled 30-day Codex statistics** — “Last 30 days” is the configured
  timezone's current calendar date plus the preceding 29 dates. The view is
  projected from verified daily aggregates, so Today ≤ Last 30 days ≤ All time,
  daily/monthly/model/effort totals reconcile, and repeated refresh/reindex does
  not accumulate duplicate thread or historical-file usage.
- **Reasoning-effort normalization** — current, legacy, nested, missing, and
  invalid structured variants are normalized without guessing from a model
  name. Non-zero unknown usage is visible with an explanation; zero-value
  unknown rows are omitted.
- **Duplicate share rows fail safely** — identical provider/date rows are
  idempotent, conflicting duplicates block export, and absent dates render as
  zero in the selected range.
- **Smooth Codex dashboard scrolling** — scroll position is persisted once
  after a gesture instead of serializing Webview state on every animation
  frame. Live first-index progress now patches its status text in place rather
  than rebuilding the complete dashboard DOM every 250 ms, so active indexing
  no longer interrupts scrolling or disclosure state.
- **Per-model API-equivalent headlines** — Codex model disclosures now follow
  Claude's visual meaning: the green value is an exact-model API-equivalent
  price with pricing-coverage help. Unknown models remain visibly unpriced, and
  effort disclosures keep their uncached-token value in neutral text.
- **OpenAI reasoning-effort requests** — OpenAI-compatible request bodies now
  send `reasoning_effort` without the unsupported top-level `thinking`
  parameter, fixing [#94](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/issues/94).
  Thanks to [@aaroncvan](https://github.com/aaroncvan) for the report and
  [@Alex668866](https://github.com/Alex668866) for the precise diagnosis.

### Privacy and packaging
- Disabled or unconsented advice adds no timer, watcher, worker, network request,
  log scan, or hidden Webview render relative to v2.3.0. There are no default or
  background AI requests.
- Combined exports contain only title, date range, daily aggregate totals,
  provider labels, and caveats—never accounts, fingerprints, projects, threads,
  paths, prompts, or log content. Local SVG/Markdown needs no account permission.
- Direct GitHub publication remains an explicit, exact-destination action. It
  requests only `public_repo`, verifies a public repository and default branch,
  previews create/overwrite, and stores owner/repository/path only after success.
  Release validation uses mocks and performs no real repository write.
- Dormant migration/experiment modules and internal v2.3.1 review documents are
  explicitly excluded from the VSIX. The human-controlled publish workflow
  stamps package metadata from the reviewed `v2.3.1` release tag.

## [2.3.0] — 2026-08-28

Upstream release merged into this fork as [2.11.0](#2110--2026-09-05); see that
entry for the fork-side summary. The heading is kept so the upstream release
order stays intact.

## [2.2.0] — 2026-07-07

### Added
- **`tokenDecimalPlaces`** (default 1, 0–2) — decimals for the *compact* token
  display (`1.2M` / `345.6K`); full integer counts are unaffected.
- **Cache-hit-rate column** in the All-time (monthly) and This-month (daily)
  breakdown tables — and in the expanded per-day / per-hour drill-downs — so the
  cache efficiency is visible per row, not just in the summary card.
- **Token heatmap on the All tab** (opt-in, `showHeatmap`, default off) — a
  GitHub-style yearly token heatmap (Claude orange) at the top of the All tab.
  Inline SVG, so the per-day hover tooltips work in the dashboard. Mainly a
  shareable view of data already shown elsewhere, hence off by default.
- **Export Token Heatmap (GitHub style)** — a command that writes a
  self-contained, GitHub-contribution-style SVG of the trailing year's token
  usage (Claude-orange scale, top-left summary, per-day tooltips, source
  watermark) to a file, with a one-click "copy Markdown embed" — for pasting
  into a GitHub profile README. Pure, unit-tested renderer (`heatmapSvg.ts`).
- **Token-composition drill-down** — clicking a month in the All-time *Token
  composition* chart expands that month's per-day composition (alongside the
  daily chart + table), so you can read the input / output / cache-write /
  cache-read split day by day, not just at the month level.
- **Share-card + heatmap foundations** — tested pure logic (`src/shareCard.ts`,
  `src/heatmap.ts`) for the upcoming Usage Share Card and Monthly token heatmap.

- **Efficiency insights** (opt-in, `showEfficiency`, default off) — starts with a
  **top-10 costliest conversations** panel on the Content tab: expandable rows
  (native disclosure) showing each session's tokens, cache-hit rate, top model
  and project, ranked by cost. (Cost-per-message + realised cache-savings chips
  on Today/projects use the same toggle.)
- **"What's new" prompt after upgrades** — a single, dismissible notification
  the first time you run a new major.minor version, pointing at the dashboard so
  new (including opt-in, default-off) features are discoverable. Shown once per
  version; skipped on a fresh install.
- **Usage Share Card** (opt-in, `enableShareCard`, default off) — a configurable
  one-page SVG you can generate and export/share: pick a range (last 30 days /
  week / month / year / a specific month), a scope (overall / a project / a
  session), which metrics to show, and a **theme** — **Claude Classic** (orange,
  default), **Claude Cream**, **Aurora Dark**, or **Auto**. Self-contained SVG;
  optional GitHub **avatar + name**; deterministic; privacy by construction (no
  prompts/paths/ids). Built on demand; config + preview survive a refresh.
- **Publish Token Heatmap to GitHub** — one-click publish of the heatmap SVG to
  a repo (default: your profile repo) via VS Code's built-in GitHub auth (no
  PAT). Shows a consent modal first.
- **Top-10 costliest *messages*** (opt-in, `showCostliestMessages`, default off,
  Content tab) — ranks single turns by cost; expand for the triggering prompt,
  model, skill, a **cost split** that distinguishes a **cache miss** from a long
  answer, the **cache-hit rate**, and the **time since the last turn** (+ a
  "model switch flushed the cache" / "idle past cache TTL" cause). (Reworked from
  the earlier costliest-*conversations* panel.)
- **Cache warmth estimate** (`showEfficiency`) — infers how long your prompt
  cache stays warm while idle from your own turns (measured **~60 min**, not 5).
- **Efficiency chips** — cost/message, **tokens/message**, realised cache savings
  on Today / month / all-time; a **Cost/msg** column in the projects table.
- **Conversation viewer** (opt-in, `showConversationViewer`, **default on** — it's
  read-only) — a "view" button on the Sessions tab opens a read-only reader for a
  past conversation: your prompts up front, the model's answers rendered from
  Markdown (tables included), with thinking and tool traffic behind toggles. Lets
  you re-read a session to jog your memory *without* loading it back into the
  model's context (unlike resume). Reads local logs only; refreshes each time you
  open it; loads the last 10 rounds.
- **Experimental insights** (opt-in, `showInsights`, default off, Content tab) —
  heuristic estimates from your local logs, labelled as estimates: a **cache-churn
  bill** ($ spent re-writing cache after model switches / idle gaps), **cache
  warmth by model** (how long each model keeps your cache warm), **big one-shot
  turns** (a checkpoint nudge), **your active hours** (a 24-h token sparkline +
  peak window), and **skill ROI** (output tokens returned per $ per skill/plugin).
- **Sessions "Active" column** — estimated hands-on time per session (gaps between
  turns, each idle gap capped at 1.5 h), which is far more meaningful than the raw
  first-to-last span for long-lived sessions. Sortable, with an explanatory tooltip.
- **Live-refresh delay control** (`fileWatchSeconds`: Off / 1 / 2 / 5 / 10 / 20 /
  30 s, default 2 s) replaces the on/off "live file watching" toggle. This only
  re-reads your **local** log files — no API call; the `/usage` quota fetch is
  throttled separately.
- **Chinese share-card units** — the share card uses 万/亿 (萬/億 in zh-TW) and its
  text follows the UI language, so an English card is fully English and a Chinese
  card fully Chinese.

### Changed
- **`enableSessionActions`** (default off) gates the Sessions **resume _and_
  delete** buttons together — both *act* on your Claude Code (reopen / trash a
  log), at odds with the extension being read-only, so they're opt-in as a pair.
  (Replaces the earlier `enableSessionDelete`.)
- **Timezone-aware bucketing** — every Today / day / month / hour total now derives
  its day boundary from the configured IANA zone (empty = system), kept in lockstep
  with the display, so the aggregations agree with each other and with the console;
  an invalid zone falls back to the system zone instead of breaking the dashboard.
- **Cache-write cost by TTL** — when a log carries the cache-creation TTL split, a
  1-hour cache write is priced at 2× base input (vs the 5-minute 1.25×), matching
  Anthropic's billing; logs without the split are unchanged. (PR #62, @zeyutang.)
- **Timezone dropdown = full UTC-offset coverage** — common zones plus every UTC
  offset (grouped Common / UTC offset), each labelled with its current offset;
  IANA identifiers only (no editorialised place names).
- **`dashboardAutoRefresh`** (positive wording, default true) replaces the
  double-negative `pauseDashboardRefresh`; existing values are migrated.
- Repository metadata (`repository` / `bugs` / `homepage`) now points at the
  `ClaudeCodeUsage` organization.

### Fixed
- **Thinking share reads "hidden", not a false 0%,** for models that omit their
  reasoning text (Fable 5 / Opus 4.8 — `"thinking":""` + a signature).
- **Quota reset countdown** in the tooltip now reads `4d 12h` (the compact
  status-bar form keeps `4.5d`); a recently-expired usage-anchored window no
  longer shows a fabricated countdown while idle.
- **Auto-refresh no longer wipes** the generated share card or collapses expanded
  Content rows (reset only on tab switch); the GitHub avatar renders (webview CSP
  now allows `data:` images).
- Message counts exclude api_error retries and the compaction summary line.
- **Timezone is a validated dropdown** — the Timezone setting is now a picker of
  valid IANA zones (`Intl.supportedValuesOf`) instead of free text, so an invalid
  value can't be entered; a guard also rejects any old bad synced value. Fixes a
  crash where a hand-typed zone made `Intl` throw and broke the whole dashboard.
  (#51)
- **German (de-DE) now selectable** — the German translation (contributed by
  @mxzinke) existed in the strings and `SupportedLanguage` but had never been
  added to the `package.json` enum or the settings dropdown, so it couldn't be
  chosen. Exposed it everywhere; verified the translation and fixed two English
  leaks (`error`, popup `currentSession`).
- **pt-BR now selectable** — Brazilian Portuguese (added in 2.1.1) was missing
  from the dashboard's language dropdown (`settings.ts` enum) and the README
  language lists, even though the strings, `package.json` enum and
  `SupportedLanguage` already had it. Wired it through everywhere.
- **Timezone-correct month / day bucketing** — the This-month and All-time
  breakdowns now bucket every record's day *and* month in the configured
  timezone (empty = system). Previously the month boundary was local while the
  day key was UTC, so a record just after local midnight on the 1st showed up
  under the previous month's last day. (`src/dateKeys.ts`, unit-tested.)
- **Breakdown table scroll** — number cells stay on one line, so the compact
  (k/M) view fits the panel with no horizontal scroll while full integer numbers
  overflow and scroll the table only; the chart keeps its own scroll.
- **API-error retries no longer inflate the Messages count** — when a request
  errors, Claude Code retries it and re-logs the same user prompt; an identical
  prompt re-appearing within a short window is now counted once (genuine
  re-sends minutes/hours later still count). (`src/promptDedup.ts`, unit-tested.)
- **Compaction summary no longer counts as a message** — when a session is
  auto-compacted, Claude Code injects the "This session is being continued…"
  summary as a *user* message; it's now excluded from the Messages count (you
  never typed it). Verified on real logs.
- **Cache-write ("input cache miss") bars render again** — in every usage bar
  chart, selecting the cache-write metric showed only the axis and value labels:
  the bar's gradient referenced a `--vscode-charts-pink` colour VS Code doesn't
  define, which made the whole gradient invalid (transparent). Added a fallback.

### Removed
- Dropped the unused `@types/glob` devDependency (clears a vulnerability
  advisory). Thanks @zeyutang (#63).

### Fixed
- **Sonnet 5 context window** — `contextWindowFor()` only recognised the 1M
  window via a "4.6+" pattern (e.g. `sonnet-4-6`), so `claude-sonnet-5` — which
  has no `-4-` segment — fell through to the 200K legacy default. The dashboard
  and status-bar context bar now correctly show a 1M window for Sonnet 5.

## [2.1.1] — Unreleased

### Added
- **Monthly cost in the status bar** — the `statusBarMetric` setting gains a
  new `monthly-cost` option. When selected, the first status-bar item shows the
  current calendar month's total cost ($(calendar) icon) instead of today's
  cost. Hover tooltip mirrors the today tooltip with month-to-date token and
  cost breakdown. (PR #41, @PhisicsLollo0.)
- **Sessions: resume / copy / delete** — each session row can copy its id, copy
  its project path, resume it (in the
  official Claude Code extension, or a terminal for cross-project sessions), or
  delete it (to the trash, after a confirm); plus a Current project / All filter.
  (PR #43, @oxsean.)
- **Quota display options** — `quotaFiveHourOnly` (show only the 5-hour window)
  and `showResetInStatusBar` (append a compact reset countdown) in the ⚙ Settings
  tab. The default stays the clean `5h 6% · wk 1%`; full reset times always live
  in the tooltip. To hide cost, set `statusBarMetric` to `tokens`. (PR #43.)
- **Sturdier quota** — the last `/usage` result is cached to disk and shown
  instantly on startup; on a 429 the fetch backs off instead of hammering the
  endpoint. (PR #43.)
- **Wider dashboard** (up to 1600 px) with indented sub-project rows; status-bar
  setting changes apply without a full dashboard reload. (PR #43.)
- **Brazilian Portuguese (pt-BR)** — adds pt-BR as a seventh interface
  language: status bar, dashboard, settings labels/help and the advice demo
  sample. (PR #48, @henrique-carvalho-dev.)

### Fixed
- **Account switch now refreshes the quota** — switching Claude accounts no
  longer leaves the status bar stuck on the previous account's usage until a
  window reload. The OAuth credentials are re-read on every quota fetch (a
  switched-in account's token is valid, so the old expiry-only re-read never
  noticed it), and the credentials file is watched so the change is picked up
  promptly instead of after a full cache interval. (Keychain-stored credentials
  on macOS update on the next refresh tick.) (PR #47.)
- **Model pricing accuracy** — several models had missing or stale pricing:
  `glm-5.1`, `glm-5.2` (were falling back to glm-4.6 rates), `minimax-m3`
  (used Sonnet default), `mimo-v2.5-pro` (used Sonnet default),
  `kimi-k2.7-code` (input/output correct via family inference, cache wrong),
  `qwen3.5-flash`, `qwen3.5-plus` (used qwen-plus rates),
  `hy3-preview` (used Sonnet default), `step-3.7-flash`, `step-3.5-flash`
  (used Sonnet default). Added correct official/exchange rates for each;
  registered family-inference branches for minimax, mimo, hy3 and step-
  so unknown future models from these providers also get sensible defaults.
  (PR #46, @YuboZhang.)

## [2.1.0] — 2026-06-26

### Added
- **Weekly Opus limit in the status bar** — opt-in `showOpusWeekly` (default
  off) appends `opus:NN%` after the 5h / weekly quota figures, for heavy Opus
  users who want an at-a-glance weekly Opus signal. Merged from
  [PR #38](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/pull/38)
  (@wheelbarrel00); re-applied here on the dashboard-managed settings.
- **Settings in the dashboard** — a new ⚙ Settings tab edits every option in
  place (grouped: General, Status bar, Data & refresh, AI advice & Optimizer),
  applied immediately. To keep VS Code's own Settings UI uncluttered, only
  three settings stay declared there (so they still sync via Settings Sync):
  `language`, `dataDirectory`, `advice.apiKey`. The rest now live in the
  extension's own storage and are managed from the dashboard. A one-time
  migration copies any existing `settings.json` values into the new store on
  first launch, so upgrades keep your configuration. (Setting labels/help are
  English; group headers and chrome are localised in all six languages.)
- **Workflows tab** — one row per multi-agent run: true dynamic-workflow
  runs (wf_ dirs) **and ad-hoc sub-agent batches** (≥2 Task-tool agents in
  one session, tagged "subagents" — what ultracode produces when the
  dynamic-workflow feature isn't engaged, e.g. via proxy routing). Columns:
  start time, name (script-derived or session title), project, **models
  used**, agent count, cost, token split, **cache hit rate** and duration;
  expands to a per-agent breakdown where each agent is labelled by **the
  task it was dispatched** (shared boilerplate hoisted into one pinned row,
  agent rows show only what differs; full text in tooltips). The cache
  hit rate is the headline diagnostic: native-Claude workflows reuse the
  prompt cache across agents (observed ~75%), a provider without cross-agent
  caching shows ~0% — i.e. the same workflow costs disproportionately more.
  A summary strip shows this month's workflow count, cost and cost share.
- **Sub-agent attribution in the loader** — records from `subagents/` logs
  now carry the workflow id, agent id and agent type (from
  `agent-*.meta.json`), resolved from the file path so worktree-isolated
  agents attribute correctly.
- **Thinking share** — estimated thinking-token share per session (new
  sortable Sessions column, ⚠ + `/effort` hint above 60%) and a one-line
  summary on the Today tab. Estimated from text length, like the rest of
  the content analysis.
- **Workflow quota guard** — a dismissible dashboard banner when the
  remaining 5-hour quota drops below `workflowQuotaWarnPercent` (default
  50%, 0 disables): interrupted workflow runs lose their prompt cache and
  re-run ~40% more expensive. The status bar stays untouched.
- **Usage attribution panel** ("What's contributing to your usage?") —
  modelled on the official `/usage` screen but multi-provider and with five
  scopes (Day / Week / Month / per-session / per-project, vs. Day/Week
  officially). Characteristic lines (independent signals, not a breakdown):
  share of usage at >150k context, from 8h+ active sessions, from
  subagent-heavy sessions, from workflow runs, plus the top skill and top
  plugin once they exceed 10%. Tables: Skills, Subagents (by agent type),
  Plugins, Models. Skill shares follow the official methodology — the
  session's usage at/after the skill's invocation counts toward it (shares
  overlap by design); trivial commands like /model and /clear are excluded.
  Full panel in the Content tab; a compact strip (≥5% lines only) on the
  Today tab.

- **AI advice transport** — speaks the **Anthropic** `/v1/messages` shape by
  default (`advice.apiFormat`), with the OpenAI chat-completions shape kept for
  DeepSeek and other compatible proxies. Timeout / retry / curl-fallback
  hardening across both. *(A keyless "subscription" backend — reuse the Claude
  Code OAuth session to call the API with no key — was prototyped and verified
  working via curl, but is NOT shipped: Anthropic returns 403 "Request not
  allowed" for that use of the OAuth token, so it's too fragile/inappropriate
  for a public extension. The transport stays dormant in advisor.ts to
  re-enable if direct calls become permitted.)*
- **AI advice fed with the new signals** — the advice prompt now includes
  the multi-agent runs (per-run cost, agent fan-out, cache hit rate per
  provider), the estimated thinking share and the usage-attribution panel
  (characteristics + top skills/subagents/plugins/models), so the model can
  give targeted advice instead of generic tips. New optional setting
  `claudeCodeUsage.advice.userContext`: free-text background about you/the
  project; when set, the advice ends with a "Personalised for this project"
  section calibrated against it. New `advice.promptWindowDays` (default 30)
  sets how many days of your own prompts and content the analysis samples.
- **AI advice card** at the top of the Content tab — the "Get AI advice"
  button now lives in a labelled card that says, in one line, what gets sent,
  instead of being tucked into the analysis header.
- **Usage Optimizer** (opt-in, `advice.optimizer.enabled`, default off) — a
  card on the Content tab where you paste a rough request and get back ONE
  tightened, paste-ready prompt plus a recommended reasoning effort / thinking
  / model for that task. Three optional lenses: flag ambiguous references,
  condense long pasted material, suggest a style direction. Runs through the
  same backend as AI advice; **only the text you paste is sent** (never your
  files or Claude Code's terminal), behind a one-time consent prompt.
- **Context-window indicator** in the status bar — shows the current
  session's context fill as a percentage (like `/context`), estimated from
  the latest log record (`input + cache read + cache write` tokens vs the
  model's window; `[1m]` long-context variants use 1M). Amber at 80%, red at
  95%. **Experimental, off by default** (`claudeCodeUsage.showContext`) — it can
  only show the input-side total, not `/context`'s category breakdown (those are
  Claude Code internals not on disk). A `~` marks a guessed window size;
  `contextWindowOverride` pins the real size for proxied/custom models. Reads
  the main-thread record (a running sub-agent no longer hijacks it) and stays
  visible across an overnight gap (24 h staleness guard). The tooltip shows a
  quota-style bar + the input-side composition.
  (Built on [PR #31](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/pull/31), @ScherbakovAl.)
- **`claudeCodeUsage.showCost` setting** — hide the status-bar cost item for
  those who only want the quota / context indicators (the dashboard still
  shows all cost figures). (PR #31, @ScherbakovAl.)
- **Authoritative skill / plugin attribution** — the Usage tracking panel now
  weights skills and plugins by the exact usage Claude Code stamps on each line
  (`attributionSkill` / `attributionPlugin`, ≥ CC 2.1) instead of the
  `<command-name>` heuristic, which it keeps only as a fallback for older logs.
- **Workflow main-session orchestration** — each run's drill-down now shows the
  main-thread spend that bracketed it (same session, within the run's window),
  so a native-Claude run whose expensive Opus/Fable orchestration lived in the
  main thread finally shows its true cost and models, not just the cheap
  sub-agent files. Heuristic (timestamp-bracketing, capped to focused windows).
- **Clearer run badges** — "workflow" (a dynamic-workflow run dir) vs
  "subagents (ad-hoc)" (a plain Task-tool fan-out), with a hint that the effort
  level itself is not recorded in the logs.
- **Per-model context-window sizes** in the status-bar context indicator
  (Opus 4.6+/Sonnet 4.6+/Fable 5 = 1M, Haiku/older Claude = 200K, DeepSeek =
  128K), and its tooltip is now a `/context`-style breakdown (fresh input /
  cache read / cache write / free space) with a tightened note. The Today
  "Usage tracking" card now shows only exact cost-weighted shares — the
  text-length thinking estimate was dropped from it (it remains on the
  Sessions tab, marked as an estimate). The Workflows tab gained a note
  explaining that native-Claude ultracode whose orchestration stays in the
  main session shows up in Sessions / Usage tracking rather than as a row.
- **Calibrated content analysis** — the Content tab can now anchor its
  per-category token figures to the *exact* billed totals (`analysis.calibrate`,
  default on): relative shares still come from text length, but the absolute
  numbers are scaled so assistant categories sum to real output tokens and
  user/tool-result categories to real input + cache-write tokens. This corrects
  a large undercount the text-length estimate had on the input side (cache
  creation is invisible to character counts). Sessions' Thinking column gains a
  calibrated "real thinking tokens" figure in its tooltip.

### Changed
- **Header trimmed** — the apple-style auto-refresh toggle moved into the ⚙
  Settings tab (a manual ↻ refresh still appears top-right when auto-refresh is
  paused). Two shortcut buttons remain: ✨ AI advice and ⚙ Settings, each
  jumping to its tab. The gear icon sits on the header button; the tab label
  drops it.
- **Usage Optimizer output is plain text** — the rewritten prompt is now
  returned without Markdown (no bold/headings/backticks/bullets) so it pastes
  cleanly into a terminal. Copy clearer, task-framed help; marked experimental.
- **AI advice + Optimizer cards redesigned** as a cohesive "action card"
  treatment (accent rail + icon badge), distinct from the data panels.

### Fixed
- **"Get AI Usage Advice" hanging or failing with `terminated`** — the
  request now has a 120 s timeout with a clear error, one retry, and a
  fallback to the system `curl` (the same transport of last resort the quota
  client uses); the prompt-sample payload is capped (40 prompts × 1500 chars).
- **Advice prompt samples polluted by agent traffic** — sub-agent logs,
  meta/sidechain lines and agent-framework scaffolding text are no longer
  harvested as "user prompts" for the advice feature.
- **Quota indicator blanked after switching folders in the same window** — the
  curl fallback now pins its working directory to the home dir (an inherited,
  now-invalid cwd made `spawn` fail with ENOENT), and a workspace-folders-change
  listener forces a fresh fetch — so the quota survives a folder switch without
  needing a new window.

## [2.0.2] — 2026-06-09

### Added
- **Claude Fable 5 / Mythos 5** pricing ($10 / $50, cache write $12.50,
  cache read $1 per MTok). Model ids with a `[1m]` long-context suffix are
  now resolved to their base pricing (also fixes proxy configs like
  `deepseek-v4-pro[1m]`).
- **Stacked cost-composition charts** on the Today (hourly), This-Month
  (daily) and All-Time (monthly) views, with a Y-axis and reference lines.
  Each cost bar splits into input / output / cache-write / cache-read; the
  metric switcher still renders single bars for token / message metrics.
- **Sessions tab "Session" column** — the conversation title (the name
  `claude --resume` shows), sortable, so same-project sessions are
  distinguishable.
- Dashboard **auto-refresh toggle** had already landed in 2.0.1; this release
  refines its surrounding behaviour.

### Fixed
- **Quota indicator stale / stuck after reset** — an expired window now shows
  0% (rolled forward to the new period) and is refetched, instead of lingering
  on a stale value or vanishing. Adapted from
  [PR #24](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/pull/24) by
  [@nickearnshaw](https://github.com/nickearnshaw).
- **Quota "only comes back after I restart VS Code"** — an expired in-memory
  OAuth token now triggers a re-read of `~/.claude/.credentials.json` (which
  Claude Code keeps refreshing) before our own refresh; the 429 cool-down was
  cut from 5 minutes to 60 s; and the `/usage` fetch cadence was made gentler
  (60 s active / 120 s idle) so rate-limiting is rare.
- **Usage not showing the first time you open VS Code** — the status bar now
  shows a loading state immediately and the quota fetch is non-blocking, so
  local cost figures appear at once and the quota follows.
  ([#26](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/issues/26))
- **"This project" figure undercounted / disappeared** — per-conversation
  attribution now keys off the session's home project directory instead of the
  per-record working directory (which wanders mid-session), and the figure is
  shown even at $0 instead of vanishing through the day.
- **Message count** now counts messages you actually typed, excluding API
  calls, command echoes (`/model` …) and interruption markers (a session that
  read 106 now reads ~86). Token figures are unchanged.
- **Per-metric chart Y-axis** now updates when switching metric (it was stuck
  on the cost units).
- **Activity-aware refresh** (≈8 s while Claude Code is writing, the user's
  interval when idle) with coalesced triggers, so high-consumption ultracode /
  Fable 5 runs update promptly without starving on rapid sub-agent writes.
- **Sub-agent / workflow log attribution** — records under
  `subagents/workflows/…` resolve to their parent session and real project
  (were fragmenting into `wf_*` / `agent-*` pseudo-entries).
- Drill-down charts: removed a double scrollbar; date labels parse the date
  textually (UTC parsing shifted labels a day in negative-UTC timezones).
- `launch.json` `preLaunchTask` fixed so F5 works in a single-root checkout
  ([PR #22](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/pull/22), @nickearnshaw).

### Docs / project
- Refreshed all language READMEs to v2 (en / zh-TW / ja / ko concise; zh-CN
  full translation); fixed the `CHANGELOG.md` link casing.
- Added `CONTRIBUTING.md`, a PR template, and issue templates; documented
  `cleanupPeriodDays` for history retention
  ([PR #21](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/pull/21), @nickearnshaw).
- Loading-spinner / re-entrancy guard for the webview
  ([PR #20](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/pull/20), @nickearnshaw).
- Updated `CLAUDE.md` to the v2 architecture and release process.

---

## [2.0.1] — 2026-06-03

### Added
- **Dashboard "Auto-refresh" toggle** — iOS-style slider in the header
  pauses automatic webview updates while the status bar continues live.
  The "Refresh Now" button appears when auto-refresh is off. State persists
  via `claudeCodeUsage.pauseDashboardRefresh` setting. Addresses
  issue #17 follow-up (constantly-reloading dashboard during agent work).
- **`claudeCodeUsage.fileWatching` setting** — disables `fs.watch`-based
  real-time refresh for users who prefer the calmer interval-only mode.
- **Diagnostic output channel** — `Claude Code Usage: Show Diagnostic Logs`
  now logs per-refresh stats: files scanned, records kept/replaced/skipped,
  rejection reasons, and per-model record counts with token sums. Useful
  for diagnosing under-reported usage with third-party proxies.

### Fixed
- **Dedup kept the wrong record** (issue #18, reported by @zhaoxiao9302):
  proxies such as mimo / CC Switch write a `tokens=0` placeholder first
  and then a second record with real values sharing the same `messageId`.
  The dedup now keeps whichever record has the higher total token sum
  instead of always keeping the first.
- **DeepSeek pricing wrong** — `deepseek-chat` and `deepseek-reasoner`
  were priced at V4-Flash rates ($0.14/$0.28); corrected to V4-Pro
  ($0.435/$0.87, cache hit $0.003625). Added explicit `deepseek-v4-pro`
  entry. Family fallback now also resolves to Pro tier.
- **Quota indicator hidden in workspaces without local data** — quota is
  account-level; it now refreshes unconditionally and is no longer hidden
  when the workspace has no Claude history or the data directory cannot
  be found.
- **Webview / status bar stuck on "Loading…"** (PR #20, @nickearnshaw):
  added re-entrancy guard so overlapping refresh triggers coalesce instead
  of piling up. Spinner now only shows on cold start (no data yet);
  background refreshes keep the existing dashboard visible.
- **Log timestamps were UTC** — diagnostic output channel now shows the
  user's local time.

### Added (models)
- **Opus 4.8** added to the pricing table (same tier as 4.7/4.6/4.5).

### Changed
- Quota fetch cache: 2 min (v2.0.0) → 120 s (unchanged value, restored
  from an intermediate 30 s that was too chatty).
- Validator relaxed: only `timestamp` and numeric `input_tokens` /
  `output_tokens` are required; secondary fields with unexpected types
  are accepted rather than causing the whole record to be dropped.
- `claudeCodeUsage.advice.apiKey` no longer falls back to the pre-2.0
  flat `adviceApiKey` key (fixes demo-mode never triggering).

### Docs
- README intro replaced with "The Claude Code coach in your status bar"
  positioning (EN + 中文 + ja + ko + zh-TW slogan updated).
- New Troubleshooting entries: missing history (→ `cleanupPeriodDays`),
  token counts lower than provider dashboard (→ sub-agent note).
  Thanks @nickearnshaw (PR #21) for the `cleanupPeriodDays` docs.

### Dev
- `launch.json` `preLaunchTask` fixed so F5 works in a single-root
  checkout (PR #22, @nickearnshaw).

---

## [2.0.0] — 2026-05-26

### Added

#### Pricing accuracy

- **Opus 4.6 / 4.7 / Sonnet 4.5 / Sonnet 4.6 / Haiku 4.5** added to the pricing
  table (verified against the official Anthropic pricing page).
- Reference pricing for common non-Anthropic models that may appear in proxied
  Claude Code setups: **OpenAI** (GPT-5.x, 4.1.x, 4o, o3, o4-mini), **Google
  Gemini** (2.5 Pro/Flash, 2.0 Flash), **DeepSeek** (chat / reasoner /
  v4-flash), **Moonshot Kimi** (K2.5 / K2.6), **Zhipu GLM** (4.5 / 4.6) and
  **Alibaba Qwen** (Max / Plus / Turbo / Long).
- **Family-aware pricing fallback**: unknown model snapshots are now priced
  against the current tier of their detected family (Opus / Sonnet / Haiku /
  GPT / Gemini / DeepSeek / Kimi / GLM / Qwen) instead of always falling back
  to Sonnet 4.
- **Per-model rates** displayed inline in the model breakdown section.
- **`Refresh Model Pricing`** command + button pulls live prices from
  LiteLLM's public dataset as runtime overrides.

#### Quota tracking (real `/usage` data)

- **5-hour and weekly limit utilisation** + reset times fetched via Claude
  Code's own OAuth session at `~/.claude/.credentials.json` →
  `api.anthropic.com/api/oauth/usage`. Zero configuration. _Approach adapted
  from upstream [PR #9](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/pull/9) by
  [@Dobidop](https://github.com/Dobidop)._
- Dedicated, quieter status-bar item shows `5h:N% wk:N%`; warns yellow at
  ≥80%, red at ≥95%.
- Tooltip is a Markdown table with utilisation, reset countdown and weekly
  reset weekday/time.

#### Usage insights

- **Sessions tab** — usage per conversation (one row per `.jsonl` file), with
  project, peak context window, duration and a session-id tooltip. Sortable.
- **Projects tab** — usage aggregated per working directory. Paths that differ
  only in case are merged. Projects are grouped (configurably) by their
  enclosing git repository with sub-folder drill-down. Sortable.
- **Content tab** — estimated breakdown of which conversation content consumes
  tokens (your prompts vs. tool results by tool vs. assistant output /
  thinking), scoped to the last 30 days.
- **Branches tab** — usage aggregated per git branch.
- **Stacked token-composition chart** on the daily / monthly / hourly views,
  with Y-axis and reference lines.
- **Today's hourly chart** now has a Y-axis, two dashed reference lines and a
  value label on every bar; tooltip no longer repeats the hour.
- **Cost composition** in the usage summary: how much of the cost comes from
  input / output / cache-write / cache-read tokens.
- **Cache hit rate** metric in the usage summary.
- **Peak context** column on the Sessions tab, mirroring what `/context`
  reports for a single request.

#### AI advice (opt-in)

- **`Get AI Usage Advice`** command + button. Sends an aggregate summary
  plus a sample of your recent user prompts (or just the aggregates if
  prompts are unavailable) to an OpenAI-compatible chat endpoint
  (DeepSeek V4 Pro by default, `reasoning_effort=max`) and opens the
  optimisation advice as a Markdown document.
- **Scope picker**: overall, or one specific project.
- Output filename is `claude-advice-<scope>-YYYY-MM-DD_HHmm.md`.
- Advice model is instructed to reply in the user's UI language.
- **Demo-mode fallback**: if no API key is configured, the command offers
  a `Preview demo` option that opens a static example of what real advice
  looks like — so users can decide whether to set up a key before
  configuring one. The demo file is filename-marked `…-DEMO-…`, opens
  with a prominent banner ("This file is a static demo, not real advice"
  and 4 enable steps), and the body is **localised per UI language**
  (en / zh-CN / zh-TW / ja / ko / de-DE) so users can judge the feature
  in their own language.

#### Quality-of-life

- **Status-bar tooltip** is now an aligned Markdown table.
- Status bar also shows the **current-session cost** next to today's cost.
- **Compact number format** option (`1.2M` / `345K`).
- **Reading-friendly timestamps** ("Today HH:MM", "Yesterday HH:MM",
  "MM-DD HH:MM", "YYYY-MM-DD").
- **Sortable columns** on Sessions / Projects / Branches tabs.
- **`Refresh Model Pricing`** + `Get AI Usage Advice` commands in the
  Command Palette.

#### Settings (all opt-in)

- `enableContentAnalysis` — toggle the Content tab + analysis pipeline.
- `projectGroupingMode` — `git` (default), `folder` (no fs walk) or `flat`.
- `compactNumbers` — toggle `1.2M`/`345K` formatting.
- `usageLimitTracking` — enable/disable the OAuth quota indicator.
- `adviceApiKey` / `adviceApiUrl` / `adviceModel` / `adviceReasoningEffort` —
  AI advice configuration.

### Changed

- **`advice.apiKey` is no longer back-compat read from the pre-2.0
  `adviceApiKey` flat key.** Other `advice.*` config still falls back so
  URL / model / effort survive the rename. Reason: with the apiKey
  fallback, clearing the _new_ key in Settings did not actually disable
  the feature (the old key kept it alive silently and the demo-mode
  fallback never triggered). Migration: if you set `adviceApiKey`
  before 2.0, re-paste it under **`claudeCodeUsage.advice.apiKey`**.
- **OAuth usage API calls now go through the system `curl` binary** instead
  of Node's `fetch` / `https`. Reason: Anthropic's edge now rejects
  requests whose TLS ClientHello (JA3/JA4) does not match a real CLI
  client — Node's openssl handshake gets `403 "Request not allowed"` from
  both the usage and token-refresh endpoints, while the same bearer token
  works fine through `curl`. `curl.exe` ships with Windows 10+ (2018) and
  is universally available on macOS / Linux, so this is portable. If
  `curl` is missing the quota indicator just stays hidden, like before.

### Fixed

- **Opus 4.5** 5-minute cache-write rate: was `$6.00 / MTok`, corrected to
  `$6.25 / MTok` (= 1.25× the input rate).
- **Haiku 3.5** 5-minute cache-write rate: was `$1.60 / MTok` (that's the
  1-hour rate), corrected to `$1.00 / MTok`.
- `claudeCodeUsage.decimalPlaces` setting was ignored by `formatCurrency` —
  now respected throughout the UI.
- Cache metrics renamed to **"Input Cache (Miss/Hit)"** for clarity.
- **Hard-coded Traditional Chinese strings** in the drill-down views
  (`renderHourlyData`, `renderDailyData`, `renderDailyChart`) replaced with
  proper i18n — non-zh-TW users no longer see Chinese in the daily/hourly
  detail panels. Affected closing upstream **PR #8** in spirit.
- **Light theme tab visibility**: tab labels inherited a white foreground
  on light themes and became unreadable. Fixed by setting an explicit
  `color: var(--vscode-foreground)` on `.tab`. **Closes upstream #11.**
- All `toLocaleString` / `toLocaleDateString` calls now pass the user's
  selected locale explicitly, so thousands-separators and date order match
  the UI language (German `.`, English `,`, etc.). Aligned with upstream
  **PR #8**'s locale-aware approach.

### Personalisation

- `enableContentAnalysis` (default true) — toggle the Content tab + analysis pipeline.
- `projectGroupingMode` — `git` (default), `folder` (no fs walk) or `flat`.
- `timezone` — IANA timezone name for date display (e.g. `Asia/Hong_Kong`,
  `UTC`). Useful inside sandboxes / devcontainers whose system timezone
  doesn't match the user's actual zone. **Closes upstream #10.**
- `compactNumbers` — toggle `1.2M`/`345K` formatting.
- `usageLimitTracking` — enable/disable the OAuth quota indicator.
- `adviceApiKey` / `adviceApiUrl` / `adviceModel` / `adviceReasoningEffort` —
  AI advice configuration.

### Issues closed by this release

- **#7** Phantom `ccusageIntegration.js` in published `.vsix` — this release
  is built from clean source; the file does not exist. `.claude/**` and
  `.github/**` added to `.vscodeignore` as a belt-and-braces measure.
- **#10** Preferred timezone configuration — see `timezone` setting above.
- **#11** Display anomaly under light theme — fixed.
- **#13** "Feature request: % used" — fulfilled by the real OAuth quota
  indicator described above.

### Performance & stability

- **Idle-aware refresh**: when no log file has changed since the last load,
  the refresh skips the recompute and only updates the (independent) quota
  indicator. Idle ticks now do near-zero work.
- **Non-blocking refresh**: the loader yields to the event loop every 25
  files so a large history no longer freezes the extension host (and the
  Claude Code extension that shares it).
- Refresh uses an `mtime`-based check instead of a fixed 1-minute cache age.

### Acknowledgements

Based on [`ClaudeCodeUsage/ClaudeCodeUsage`](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage)
MIT-licensed. Significant inspiration / patches from upstream
PRs:

- [#9](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage/pull/9) — Real 5-hour and
  weekly usage limit tracking via the Anthropic OAuth API, by
  [@Dobidop](https://github.com/Dobidop). The OAuth approach in this fork is
  adapted from that PR.

Many code changes in this fork were drafted with assistance from
[Claude Code](https://claude.com/claude-code) (commits credit
`Co-Authored-By: Claude <noreply@anthropic.com>`).

---

## Pre-2.0 history (upstream 1.0.x)

Released under [`ClaudeCodeUsage/ClaudeCodeUsage`](https://github.com/ClaudeCodeUsage/ClaudeCodeUsage)
before the 2.0 fork.

## [1.0.8] — 2025-11-28

- Converted all code comments from Traditional Chinese to English.
- Improved code internationalisation standards.
- Pricing: added Opus 4.5 / Haiku 4.5 rates (thanks to
  [@mxzinke](https://github.com/mxzinke)).
- Added German (de-DE) translation support (thanks to
  [@mxzinke](https://github.com/mxzinke)).

## [1.0.7] — 2025-11-28

- Multilingual translation support for hourly usage labels.
- Removed hardcoded Chinese text from code; replaced with i18n
  translation system.

## [1.0.6] — 2025-08-10

- Added support for Claude Opus 4.1 model pricing
  (`claude-opus-4-1-20250805` / `claude-opus-4-1`).
- Pricing matches Opus 4 ($15 / $75 per MTok).

## [1.0.5] — 2025-01

- Hourly usage statistics and visualisation.
- Dashboard hourly breakdown.

## [1.0.4] — 2025-01

- All-time data calculation.
- "All Time" translations across supported languages.

## [1.0.3] — 2025-01

- GitHub repository URL migration.
- README image-link fixes.

## [1.0.0] — 2025-01

- Initial complete release.
- Status-bar usage monitoring.
- Multi-language support (en / zh-TW / zh-CN / ja / ko).
- Analytics dashboard with charts and tables.
- Theme integration and responsive design.
