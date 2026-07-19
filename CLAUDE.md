# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication style

**This rule is mandatory and applies from the very first message of every session, including new sessions, compacted sessions, and resumed sessions.**

At the start of every session, invoke `/caveman wenyan` automatically — do not wait for the user to ask.

**Internal reasoning**: always use caveman wenyan — 思考用文言，精簡不失技術。

**Intermediate updates** (tool-call narration, progress notes, mid-task status): always use caveman ultra — maximum compression, no articles, abbreviate prose words, arrows for causality.

**Final response / summary**: always write in normal mode — full sentences, standard English, no caveman compression. The closing summary visible to the user must be clear and professional regardless of active caveman level.

**Enforcement**: if the session hook activates a different caveman level, the project CLAUDE.md takes precedence.

## Project policy

Compatibility entry point for Claude Code. `AGENTS.md` is the canonical repository policy;
read and follow it before changing this repository. The
faithful maintainer review copy is `AGENTS.zh-CN.md`.

Claude-specific compatibility notes:

- The product remains Claude-only in v2.2.1; Codex is a development tool.
- Claude conversation JSONL is read-only. OAuth credential refresh is a
  separate, existing security-sensitive behavior; do not broaden it casually.
- JSONL activity may tune the quota-cache TTL, but polling always follows
  `refreshInterval`; do not restore a hidden active polling override.
- Do not create a second policy source here. Update `AGENTS.md` and its Chinese
  review copy when repository rules change.

## Fork-exclusive features

This fork (`maxysoft/ClaudeCodeUsage`) retains features on top of upstream
(`jack21/ClaudeCodeUsage`) that are not part of the canonical `AGENTS.md`
policy. When merging upstream changes, these must survive:

- `src/webview.ts` — "This Week" tab (`tab-week`, `renderWeekData()`,
  `week-reset-banner` CSS, `weekData`/`weekResetsAt` data plumbing).
- `src/statusBar.ts` — three cost segments shown together in the status bar:
  today's total (`$(pulse)`), this workspace's cost today (`$(folder)`), and
  the current session's cost (`$(history)`), each with its own tooltip column
  in `createTooltip()`.
- `src/webview.ts` — "Get AI Advice" button and its Content-tab shortcut use an
  inline SVG lightbulb icon, never the `✨` emoji.
- `package.json` — `"publisher": "maxysoft"` and fork-specific
  `description`/`author`/`contributors`/`repository` fields.
- `CHANGELOG.md` — this fork keeps its own changelog framed as changes to this
  fork compared to upstream; do not replace it with upstream's raw
  `CHANGELOG.md` content.

See `CHANGELOG.md` for the version this fork is currently aligned with upstream.

## Documentation Maintenance

**IMPORTANT**: When updating README.md, you MUST simultaneously update all language versions
(see `AGENTS.md` for the authoritative list, currently `README.md`, `README-en.md`,
`README-zh-TW.md`, `README-zh-CN.md`, `README-ja.md`, `README-ko.md`, and `README-id.md`).
This ensures consistency across all documentation and maintains the multi-language support
that users expect.
