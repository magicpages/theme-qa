---
name: review
description: Multi-pass review of current branch changes — design review + 3 escalating defect passes. Auto-fixes findings unless --report-only is passed. Use before opening a PR or as a self-review gate inside /implement and /address-review.
user-invocable: true
argument-hint: [--report-only]
---

# Multi-Pass Code Review

Three escalating passes over the current branch's diff plus a separate design review. By default, valid findings (Critical / High / Medium severity) are auto-fixed before the skill returns; pass `--report-only` to opt out and get just the findings tables.

The auto-fix step at the end lets the skill act as a quality gate from `/implement` and `/address-review` without forcing a second hop.

## Phase 1: Scope

First, fetch the latest `main` from origin and diff against `origin/main` — in worktrees the local `main` ref goes stale because nothing runs `git pull` on it, and `git branch -f main origin/main` fails when another worktree has `main` checked out:

```bash
git fetch origin main
git diff origin/main...HEAD --name-only
git diff origin/main...HEAD
```

Read the conventions in `AGENTS.md` that apply to the touched paths (CLI source, Playwright checks, Docker setup, the reusable workflow) so later passes flag the right things.

If the branch name encodes an issue (`fix/123-…`), fetch it for scope context:

```bash
gh issue view 123 --json title,body,labels --jq '{title, labels: [.labels[].name]}'
```

## Phase 2: Design Review (qualitative — no severity)

Apply this lens once before the defect passes. Output as a separate `### Design` section in the final report. These are observations the author should consider; they don't go through severity classification.

- **Scope alignment:** does the diff exceed the issue's stated scope? Flag "while-I'm-here" cleanups, unrelated refactors, expanded acceptance criteria.
- **Consumer contract:** theme repos depend on the CLI flags and exit codes, the `theme-qa.config.mjs` shape, and the reusable `.github/workflows/theme.yml` inputs and secrets. Does the diff change any of them? If so, is it backwards compatible, or is the break called out?
- **YAGNI / KISS:** premature abstractions, helpers/configs/feature-flags/backwards-compat shims with no current trigger, three-line abstractions that obscure what could be three inline lines.
- **Pattern reuse:** code that re-invents an existing helper in the repo — Ghost container start/stop and readiness, config loading, gscan invocation, shared Playwright fixtures.

## Phase 3: Pass 1 — General Defect Scan

Review the full diff. Flag:

- Bugs, logic errors, security issues, missing input validation, incorrect error handling
- Missing tests for new behavior; bug fixes without a regression test (regression test must fail without the fix — assertions on mocks don't count)
- Project-specific concerns from the checklist below

Only flag lines that are **added or modified** in the diff. Don't flag unchanged context lines even if they appear in diff hunks.

## Phase 4: Pass 2 — What Was Missed

Assume Pass 1 missed something. Focus on:

- Cross-file interactions between changed files
- Subtle logic errors and implicit assumptions
- Order-of-operations issues, off-by-one, async/await pitfalls

Skip findings already raised in Pass 1 — same file + overlapping line range, or same root cause at a different location (keep the one closest to the cause).

## Phase 5: Pass 3 — What's Absent

Assume defects remain. Focus on what the code does NOT do:

- Missing error handling for error paths the code actually exercises
- Missing edge cases (empty arrays, nullish inputs, length-zero strings, a theme with no `package.json` field the code expects)
- Missing input validation
- Missing cleanup on failure (containers, temp directories, browser contexts)
- Race conditions, resource leaks, incorrect state assumptions

Skip findings already raised.

## Phase 6: Consolidate

For each finding from Passes 1-3:

1. **Dedup:** same file + overlapping range, or same root cause at multiple locations → keep the one closest to the cause.
2. **Re-examine:** if context is thin, read the full file with the `Read` tool now and verify the finding stands.
3. **Confidence filter:** drop anything below 80% confidence. When in doubt, drop.
4. **Severity classification:**
   - **Critical:** a check that reports pass when it should fail, secrets or tokens exposed in logs or artifacts, breaking every consumer theme's CI
   - **High:** incorrect behavior under normal use, unhandled error paths that will be hit, significant logic flaw
   - **Medium:** bad practice that could lead to bugs, missing validation for unlikely-but-possible inputs, minor logic issue
5. **Drop Low-severity findings entirely.** They're noise.

## Phase 7: Auto-Fix

**Skip this phase when invoked with `--report-only`.**

For each remaining Critical/High/Medium finding:

1. Read the file at the finding's location.
2. Apply the fix as a code edit.
3. Continue to the next finding; batch related fixes in the same file.

After all fixes, run quality gates:

```bash
npm run lint && npm test
```

`npm run lint` runs editorconfig-checker and `prettier --check`. Run `npm run format` to auto-fix Prettier issues. Fix any new failures the edits introduced.

**Loop:** if any Critical/High/Medium findings were applied, restart from Phase 1 with the new diff. Cap the loop at **3 iterations** — if the third pass still has unresolved findings, stop and surface them in the report so the user can decide.

## Phase 8: Output

Print to the conversation. No GitHub writes.

```
### Design
- <qualitative observation>

### Critical
| File:Lines | Description |
|---|---|
| src/x.js:42-45 | <one-line description> |

### High
| File:Lines | Description |
|---|---|

### Medium
| File:Lines | Description |
|---|---|

### Auto-fixed
- src/x.js:42-45 — <what was fixed>

### Skipped
- <ref> — <why: false positive / out of scope / loop cap reached>
```

Omit any section that's empty. When `--report-only`, omit the `Auto-fixed` section.

## Project-Specific Checklist

Apply this checklist during all three defect passes. These are correctness/safety rules the linters can't catch.

- **Node 22 ESM:** `import`/`export` only, `node:`-prefixed built-ins, paths built from `import.meta.url` or `process.cwd()` deliberately — the package directory and the consumer theme's directory are different places.
- **CLI behavior:** a failed check exits non-zero; child processes (`docker`, `gscan`, `npx`) have their exit codes and stderr checked, not just their stdout parsed.
- **Ghost in Docker:** readiness waits on Ghost answering, not on the container starting; no fixed host ports that collide on shared runners; containers and volumes are removed on success and on failure.
- **Playwright:** web-first assertions and locators that auto-retry; no fixed `waitForTimeout` sleeps; screenshots taken after fonts and images settle.
- **Reusable workflow** (`.github/workflows/theme.yml`): every input and secret it reads is declared; third-party actions pinned; least-privilege `permissions`; secrets never echoed into logs or uploaded artifacts.
- **Public repo:** no internal hostnames, tokens, customer names or customer data in code, fixtures, test snapshots or comments.

## False-Positive Exclusion List

Do NOT flag:

- Pre-existing issues not introduced in the diff
- Style/formatting (Prettier and editorconfig territory)
- Pedantic nitpicks a senior engineer wouldn't flag
- Issues silenced via lint-ignore comments in the same diff
- Test-file findings unless they mask a production defect
- Speculative findings depending on runtime state that can't be confirmed from the diff
- Anything explicitly permitted by `AGENTS.md` (read it before judging)

## Constraints

- Default: write code freely to apply fixes. With `--report-only`, do NOT modify source code.
- Never post comments, reviews, or any data to GitHub. Output stays in the conversation.
- Never report style or formatting issues — covered by Prettier and editorconfig.
- Never report issues in generated files, lock files, or changelog entries.
