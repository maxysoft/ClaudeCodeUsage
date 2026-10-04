# Session handoff — ClaudeCodeUsage fork

Resume point for a fresh session. Written 2026-10-04.

## Where things stand

- Branch `main`, last commit `51d81ed` "Merge upstream v2.4.0: retain fork-exclusive features (v2.15.0)".
- **Not pushed, not tagged, no VSIX built.** Unpushed commits: everything from `730dd9c` onward (v2.14.0 work) plus `51d81ed`.
- Backup of the pre-merge state: branch `pre-merge-2.15.0-backup` at `669c8cd`.
- Verified green at `51d81ed`: `tsc --noEmit` clean, node suite 1260 pass / 0 fail, Playwright 194 passed, `tests/perf/measure-dashboard-reuse.cjs` exits 0.

## Verification commands (always Docker, ONE container at a time)

```bash
docker run --rm -v "$(pwd):/app" -w /app -v npmcache-ccu:/root/.npm node:24 \
  sh -c "git config --global --add safe.directory /app && npm ci --no-audit --silent && npx tsc --noEmit && npm run test 2>&1 | tail -6"

docker run --rm -v "$(pwd):/app" -w /app -v npmcache-ccu:/root/.npm mcr.microsoft.com/playwright:v1.61.1-noble \
  sh -c "npm ci --no-audit --silent && npm run compile --silent && CI=true npx playwright test --reporter=line 2>&1 | tail -6"
```

Docker daemon is often stopped on this box and needs `sudo systemctl start docker` (interactive password). Never fall back to a host build.

## Work requested in this session, status

1. **Playwright coverage for the This Week tab** — the UI harness never passed `weekResetsAt`, so the reset banner, the week usage-tracking card and the whole `week-` drilldown path were unreachable in tests. This is the blind spot that let several regressions ship.
2. **`weekAggregate` churn** — returns a fresh object每 publish while every other `cachedDataPanel` ref is identity-stable, so each poll busts the HTML cache of all Claude panels. A naive memo was tried and **reverted**: it retained stale week data across source replacement and broke 10 tests (`Claude source replacement…`, `coordinator Claude…`, `production Claude polls retain all dashboard references…`). Any fix must reset the memo when the Claude source is cleared/replaced.
3. **Node 26** in CI workflows (`publish.yml` was Node 20, `test.yml` Node 22).
4. **README `✨`** — `README.md` and `README-zh-CN.md` still advertise "✨ AI advice" though the fork uses an inline SVG lightbulb. `CLAUDE.md` also still names seven READMEs where `AGENTS.md` requires nine.

## Fork-exclusive features (must survive every upstream merge)

See `CLAUDE.md` § "Fork-exclusive features". Quick greps that must hold:

```bash
grep -c "✨" src/webview.ts                                              # 0
grep -cE "VSCE_PAT|OVSX_PAT|vsce publish|ovsx publish" .github/workflows/publish.yml   # 0
grep -rhoE "uses: [^ ]+" .github/workflows/*.yml | sort -u               # all 40-hex SHAs
```

`updateData` positional contract: `weekData` is **slot 3**, `weekResetsAt` is **last**. `allRecords` is parameter 11 (index 10) — upstream code and benchmarks assume index 9.

## Known traps, learned the hard way

- Upstream code never knows about the fork's extra `updateData` parameters. Every merge, re-check every call site including error/cold-failure paths and `tests/ui/support/render-harness.cjs` and `tests/perf/measure-dashboard-reuse.cjs`.
- Pricing tests price raw token objects and never go through the loader, so a loader-side regression (e.g. upstream's `compactUsageRecord` dropping `speed`/`inference_geo`/`output_tokens_details`) stays green. Loader-path tests are the only guard.
- Upstream re-adds Marketplace/Open VSX publishing on most releases; the fork ships a GitHub Release asset only.
- Review findings live in `.audit/2026-10-04/merge-v2.15.0-{opus,fable}.md`.
