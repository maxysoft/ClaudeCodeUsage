# Changelog

All notable changes to this fork compared to upstream
[`jack21/ClaudeCodeUsage`](https://github.com/jack21/ClaudeCodeUsage) (last
upstream release: 2.0.0). Format follows [Keep a Changelog](https://keepachangelog.com).

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
  from upstream [PR #9](https://github.com/jack21/ClaudeCodeUsage/pull/9) by
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

Based on [`jack21/ClaudeCodeUsage`](https://github.com/jack21/ClaudeCodeUsage)
MIT-licensed. Significant inspiration / patches from upstream
PRs:

- [#9](https://github.com/jack21/ClaudeCodeUsage/pull/9) — Real 5-hour and
  weekly usage limit tracking via the Anthropic OAuth API, by
  [@Dobidop](https://github.com/Dobidop). The OAuth approach in this fork is
  adapted from that PR.

Many code changes in this fork were drafted with assistance from
[Claude Code](https://claude.com/claude-code) (commits credit
`Co-Authored-By: Claude <noreply@anthropic.com>`).

---

## Pre-2.0 history (upstream 1.0.x)

Released under [`jack21/ClaudeCodeUsage`](https://github.com/jack21/ClaudeCodeUsage)
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
