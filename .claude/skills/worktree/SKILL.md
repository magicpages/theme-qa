---
name: worktree
description: Create an isolated git worktree for a GitHub issue, ready for a parallel agent session in a separate terminal tab. Use when you want this session to keep running while another session works on a different issue. For sequential work on a single issue, run `/implement <issue>` directly — it auto-creates a worktree.
user-invocable: true
argument-hint: <issue-number> [type] [short-description]
---

# Create Worktree for Issue #$ARGUMENTS

Set up an isolated git worktree so the user can run a parallel agent session for this issue.

> **Note:** `/implement <issue>` already creates a worktree by default and continues work in the current session. Use `/worktree` only when you want a _separate, parallel_ session running alongside this one.

## Phase 1: Parse Arguments and Fetch Issue

Parse `$ARGUMENTS` — the first token is always the issue number. Optional overrides: type and short-description.

```bash
gh issue view <issue-number> --json title,labels --jq '{title, labels: [.labels[].name]}'
```

If type was not provided as an argument, determine branch prefix from issue labels:

- `bug` label → `fix/`
- `improvement` label → `refactor/`
- `enhancement` or `feature` label → `feat/`
- `task` or `documentation` label → `chore/`
- Default → `chore/`

If short-description was not provided, derive 3-5 kebab-case words from the issue title.

## Phase 2: Ensure Main is Up-to-Date

```bash
git fetch origin main
```

## Phase 3: Create the Worktree

Worktrees live inside the main repo at `.worktrees/<issue-number>` (gitignored). Keeping them inside the repo means coding agents only need folder permissions for the parent once, instead of re-prompting for each new sibling directory.

```bash
MAIN_REPO="$(git rev-parse --show-toplevel)"
WORKTREE_PATH="${MAIN_REPO}/.worktrees/<issue-number>"
BRANCH_NAME="<type>/<issue-number>-<short-description>"

git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" origin/main
```

If the branch already exists (e.g., resuming work), use:

```bash
git worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
```

## Phase 4: Symlink Environment Files

Symlink local env files from the main repo so they are shared. Only create symlinks when the source file actually exists, so we don't leave broken symlinks behind:

```bash
[ -f "$MAIN_REPO/.env" ] && ln -sf "$MAIN_REPO/.env" "$WORKTREE_PATH/.env"
[ -f "$MAIN_REPO/.env.local" ] && ln -sf "$MAIN_REPO/.env.local" "$WORKTREE_PATH/.env.local"
```

## Phase 5: Install Dependencies

```bash
cd "$WORKTREE_PATH" && npm ci
```

Playwright browsers live in a shared per-user cache, so a new worktree does not need `npx playwright install` unless the Playwright version changed on this branch.

## Phase 6: Report

Tell the user:

1. Worktree created at `$WORKTREE_PATH` on branch `$BRANCH_NAME`
2. Environment files symlinked (if any), dependencies installed
3. To start the parallel session, open a new terminal tab, `cd $WORKTREE_PATH`, and start their coding agent there
4. In that new session, run `/implement <issue-number> --no-worktree` to start coding (the `--no-worktree` flag tells `/implement` not to create another worktree, since it's already inside one)
5. When done, run `/cleanup` from the main repo to remove merged worktrees

> If you don't actually need a parallel session and just want to work on this issue now, abort and run `/implement <issue-number>` instead — it handles the worktree itself.
