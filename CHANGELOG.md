# Changelog

All notable changes to this fork compared to upstream
[`jack21/ClaudeCodeUsage`](https://github.com/jack21/ClaudeCodeUsage) (last
upstream merge: 2.3.0 / `eca4e43`). Format follows [Keep a Changelog](https://keepachangelog.com).

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

## [2.3.0] — Unreleased

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
