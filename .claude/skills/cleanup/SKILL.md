---
name: cleanup
description: Remove git worktrees whose branches have been merged. Use to clean up after parallel work sessions are complete.
user-invocable: true
---

# Clean Up Merged Worktrees

Remove worktrees for branches that have been merged to main.

## Phase 1: List All Worktrees

```bash
git worktree list
```

Identify all worktrees that are NOT the main working directory. The main repo is the path returned by `git rev-parse --git-common-dir`'s parent — every other entry in `git worktree list` is a linked worktree to clean up if its branch has merged.

Worktrees may live in either of these locations and this skill handles both:

- `<repo>/.worktrees/<issue>` — the default for `/implement` and `/worktree` (inside-repo, gitignored)
- Tooling-specific paths outside the repo — created by other tools

## Phase 2: Check Merge Status

For each non-main worktree, determine if its branch has been merged:

```bash
# Check if branch is merged into origin/main
git fetch origin main
git branch --merged origin/main
```

Cross-reference the worktree branches against merged branches. Also check GitHub for merged PRs:

```bash
# Check if there's a merged PR for this branch
gh pr list --state merged --head "<branch-name>" --json number,title,mergedAt --jq '.[0]'
```

Categorize each worktree as:

- **Safe to remove** — branch is merged to main (PR merged)
- **Not merged** — still has an open or unmerged PR
- **No PR** — branch exists but no PR was created

## Phase 3: Report and Confirm

Show the user a summary:

```
Worktrees found:

  ✓ .worktrees/123 (fix/123-some-bug) — merged via PR #45, safe to remove
  ✓ .worktrees/456 (feat/456-new-thing) — merged via PR #78, safe to remove
  ✗ .worktrees/789 (chore/789-refactor) — PR #90 still open, keeping

Remove 2 merged worktrees?
```

Wait for user confirmation before proceeding.

## Phase 4: Remove Merged Worktrees

For each confirmed worktree:

```bash
# Remove the worktree
git worktree remove <worktree-path>

# Delete the local branch (it's merged, safe to delete)
git branch -d <branch-name>
```

If `git worktree remove` fails (e.g., uncommitted changes), report the error and skip that worktree.

## Phase 5: Prune and Report

```bash
# Clean up any stale worktree references
git worktree prune
```

Report what was removed and what remains.
