---
name: implement
description: Implement a GitHub issue end-to-end — research, plan, code, test, review, commit, push, PR. Creates a worktree by default. Use when starting work on a new issue.
user-invocable: true
argument-hint: <issue-number> [--no-worktree]
---

# Implement GitHub Issue

You are implementing a GitHub issue for theme-qa, the shared QA and test framework for Magic Pages' Ghost themes. Parse `$ARGUMENTS`: the first numeric token is the issue number; `--no-worktree` opts out of worktree creation. All other tokens are ignored.

At the start, create a `TaskCreate` task list with these seven phases so the user sees live progress:

1. Research issue and codebase
2. Draft plan and self-critique
3. Implement
4. Test (lint + tests)
5. Pre-PR review
6. Commit
7. Push and open PR

Mark each phase `in_progress` before starting it and `completed` when done. If a phase is intentionally skipped (e.g. no clarifying questions needed), still mark it complete with a one-line note.

## Phase 0: Setup — Issue Fetch and Worktree

Fetch the issue first so later phases have its title/labels:

```bash
gh issue view <issue> --json title,body,labels,assignees,state
```

If the issue is already closed, ask the user whether to proceed (likely a mistake).

Determine branch prefix from the first matching label:

- `bug` → `fix/`
- `improvement` → `refactor/`
- `enhancement` or `feature` → `feat/`
- `task`, `documentation` or default → `chore/`

Derive a 3-5 word kebab-case `<short-description>` from the title. Branch name: `<type>/<issue>-<short-description>`.

### Worktree state detection

Run `git worktree list` and `git rev-parse --show-toplevel` to identify which of three states you're in.

#### State A — In main repo, no `--no-worktree` (default path)

Worktrees live at `<repo-root>/.worktrees/<issue>` (gitignored). Keeping them inside the repo means parent-folder permissions only need to be granted once — coding agents don't re-prompt for each new worktree the way they would for sibling directories.

1. Run `git status --porcelain`. If non-empty, warn the user that uncommitted changes exist in the main repo — proceed anyway, since worktrees are independent.
2. Check `.worktrees/<issue>` doesn't already exist. If it does and its branch matches `<branch>`, reuse it (treat as State C below). If it exists with a different branch, ask whether to reuse, pick a different path, or abort.
3. Fetch and create the worktree:

```bash
MAIN_REPO="$(git rev-parse --show-toplevel)"
WORKTREE_PATH="${MAIN_REPO}/.worktrees/<issue>"
git fetch origin main

if git show-ref --verify --quiet "refs/heads/<branch>" \
   || git ls-remote --exit-code --heads origin "<branch>" >/dev/null 2>&1; then
  git worktree add "$WORKTREE_PATH" "<branch>"
else
  git worktree add "$WORKTREE_PATH" -b "<branch>" origin/main
fi

[ -f "$MAIN_REPO/.env" ] && ln -sf "$MAIN_REPO/.env" "$WORKTREE_PATH/.env"
[ -f "$MAIN_REPO/.env.local" ] && ln -sf "$MAIN_REPO/.env.local" "$WORKTREE_PATH/.env.local"
```

4. Move this session into the worktree and kick off `npm ci` in the background:

```bash
cd "$WORKTREE_PATH"
```

Then run `npm ci` with `run_in_background: true` so research can proceed in parallel. Capture the background command id; await it before Phase 4.

5. **Tell the user explicitly:**

> I've moved this session into the worktree at `<absolute path>`. Your terminal prompt won't reflect this until you `cd` there yourself, but every command I run from here on operates inside the worktree.

This message is load-bearing — without it, users will run `git status` in their terminal, see they're still in the main repo, and panic.

6. If the branch already existed, run `git rev-list --left-right --count origin/main...<branch>` and report ahead/behind counts, so the user knows whether they're resuming prior work or starting fresh.

#### State B — In main repo, `--no-worktree` flag

```bash
git checkout main && git pull origin main
git checkout -b <branch>
```

Or `git checkout <branch>` if it already exists locally.

#### State C — Already inside a worktree

Run `git branch --show-current` and compare to `<branch>`.

- **Match:** "Resuming work on existing worktree branch `<branch>`." Proceed.
- **Mismatch:** Use `AskUserQuestion`. Options:
  - Create a new worktree at the main repo's `.worktrees/<issue>` (recommended)
  - Branch here from current state (risky — current branch may have unrelated changes)
  - Abort

## Phase 1: Research

Read the issue body fully and the conventions in `AGENTS.md`. Then dispatch **Explore subagents** via the `Agent` tool, in parallel when more than one is needed (single message, multiple `Agent` tool calls):

- **One agent** for narrow issues (one file, one check, or one command).
- **Two agents** for cross-cutting issues. Typical split: (1) the CLI — commands, config loading, checks, Playwright specs; (2) the runtime around it — Ghost-in-Docker setup and the reusable `.github/workflows/theme.yml`. Adjust the split to match the issue.

Each agent prompt should include:

- The issue title and full body
- A focused question (e.g. "Find every place that starts or stops the Ghost container and identify the patterns used.")
- An instruction to return: file paths, key functions, existing patterns/utilities to reuse, any inconsistencies relevant to the issue
- A reminder to check its findings against the conventions in `AGENTS.md`

After agents return, **read** the 3-6 most load-bearing files yourself. Agent summaries are not authoritative for files you'll edit.

## Phase 2: Clarifying Questions

Decide whether ambiguity exists.

**Skip** when the issue specifies the affected files, expected behavior, acceptance criteria, and a single clear approach. Mark the phase complete with "Issue fully specified — no clarifications needed."

**Ask** when any of these are true:

- Multiple reasonable approaches with different trade-offs
- The issue references behavior not present in the code
- Acceptance criteria are vague ("make it better", "improve UX")
- The fix could regress related functionality and the desired scope is unclear
- The change would break the consumer contract (CLI flags, `theme-qa.config.mjs` shape, workflow inputs) and the issue doesn't say whether that's intended

Bundle 1-3 questions into one `AskUserQuestion` call with concrete options. Bias toward skipping — better to propose a plan and let the user redirect than to interrogate.

## Phase 3: Draft Plan and Self-Critique

This phase has two passes. **Do not** ask the user for approval — the user can interrupt at any point if they disagree, and an explicit "approve?" gate just adds friction. The self-critique pass replaces it.

### Pass 1 — Draft plan

Write a compact plan summary in the conversation:

```
**Approach:** <2-3 sentence summary>

**Files to change:**
- path/to/file1.js — what changes
- path/to/file2.js — what changes

**New files (if any):**
- path/to/new-file.js — purpose

**Tests:**
- path/to/file.test.js — what scenarios

**Consumer impact:** <none / what theme repos need to change>

**Out of scope:** <intentionally not addressed>
```

### Pass 2 — Self-critique with a fresh, skeptical lens

Read the draft plan back as if reviewing someone else's. Apply this checklist explicitly — name each item and decide pass/fail rather than just nodding. Single pass. The goal is to catch issues _now_ rather than finding them in pre-PR review or in reviewpass's findings.

- **YAGNI / KISS:** Does the plan add abstractions, helpers, configs, feature flags, or backwards-compat shims that the issue does not require? Three similar lines beat a premature abstraction. Don't design for hypothetical futures.
- **Scope creep:** Does the plan touch files unrelated to the issue, do "while I'm here" cleanup, or expand acceptance criteria beyond what the ticket says? Trim back to the smallest correct change.
- **Existing patterns:** Did Phase 1 surface a helper or pattern that the plan should be reusing instead of duplicating? Reference the file path. Common candidates: Ghost container start/stop and readiness, config loading, gscan invocation, shared Playwright fixtures.
- **Missing surface area:** Did the issue mention behavior the plan doesn't address? Tests for the new behavior? Docs for a new config key or CLI flag? Changes consumer themes need to make? Imagine the PR and ask "what's missing."
- **Test strategy honesty:** Are the tests meaningful, or are they asserting on mocks? Bug fixes need a regression test that would fail without the fix — run it against the unfixed code and see it fail on the assertion that encodes the bug, not on setup or a typo. Generic "happy path" tests don't count.
- **Convention conflicts:** Does any change violate `AGENTS.md`? Flag now.
- **Convention drift:** Does naming, file location, and module style (Node 22 ESM, `node:` built-ins) follow what the repo already does?

Write the critique inline as a short bulleted list under a `### Critique` heading. For each finding, state the issue and how the plan changes. If everything passes, say so explicitly: "Critique: no changes — plan stands." Don't fabricate findings to look thorough.

### Pass 3 — Revised plan

If the critique surfaced any issues, post the revised plan in the same format as Pass 1, with a `(revised)` marker. If the critique was clean, the original plan is the final plan — don't repeat it.

Then **proceed directly to Phase 4**. The user has the revised plan visible and can interrupt if they want changes; do not wait for an explicit "yes."

## Phase 4: Implement

Make small, incremental edits. Follow the conventions in `AGENTS.md` — do not duplicate them here.

Key reminders only:

- Reuse existing helpers for the Ghost container, config loading, gscan and Playwright fixtures
- A failed check must exit non-zero; clean up containers and temp files on failure too
- Every change needs tests; bug fixes need a regression test
- This repo is public: no internal hostnames, tokens, customer names or customer data in code, fixtures or snapshots

Before this phase begins, await the backgrounded `npm ci` from Phase 0 if it's still running.

## Phase 5: Test

```bash
npm run lint && npm test
```

`npm run lint` runs editorconfig-checker and `prettier --check`. If it reports Prettier issues, run `npm run format` to auto-fix, then re-stage. Fix every failure before proceeding. Never skip tests. If a test seems wrong, fix the test (and explain why in the commit body) — don't just delete it.

## Phase 6: Pre-PR Review

Invoke the review skill — it runs three escalating defect passes plus a design review and **auto-fixes Critical/High/Medium findings** before returning:

```
Skill(skill="review")
```

After it returns, re-run `npm run lint && npm test` to confirm the fixes didn't break anything. If `/review` left any unresolved findings (e.g. it hit its 3-iteration loop cap), decide per-finding whether to address manually or carry forward.

## Phase 7: Commit

Inline the commit conventions here rather than invoking `/commit` — `/commit` has `disable-model-invocation: true` and is meant for direct user-driven commits, not skill chaining.

- Format: `<type>: <imperative summary> (#<issue>)`
- Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `ci`
- Subject under 72 chars, imperative mood
- Body explains the **why**, not the what
- Stage files by name (no `git add -A` / `git add .`)
- Skip `.env*`, credentials, anything with secrets, and local test artifacts
- HEREDOC for the message
- No AI attribution in commits or the PR (see `/commit`)
- Multiple focused commits beat one monolith for large changes

```bash
git add <specific files>
git commit -m "$(cat <<'EOF'
<type>: <summary> (#<issue>)

<body>
EOF
)"
```

## Phase 8: Push and Open PR

```bash
git push -u origin HEAD
gh pr create --title "<type>: <summary> (close #<issue>)" --body "$(cat <<'EOF'
## Summary

- <key change>
- <key change>

## Test plan

- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] <issue-specific test scenarios>

close #<issue>
EOF
)"
```

When the PR changes the consumer contract (CLI flags, `theme-qa.config.mjs` shape, reusable workflow inputs), add a `## Consumer impact` section above `close #<issue>` stating what theme repos need to change, so the reviewer knows the PR is a break, not just code.

## Phase 9: Final Report

Tell the user:

1. The PR URL
2. Branch name and (if applicable) the absolute worktree path — remind them this session is `cd`'d into the worktree
3. Brief summary of what was implemented
4. CI must pass before the PR merges.

**Suggested next steps:**

- `/address-review` once review comments land
- After merge, run `/cleanup` from the main repo to remove this worktree
- `/worktree <other-issue>` if you want a separate parallel session for another issue in a different terminal tab
