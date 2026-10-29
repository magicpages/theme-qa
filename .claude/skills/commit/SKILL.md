---
name: commit
description: Create a git commit with a well-crafted message following project conventions. Use when the user asks to commit, save changes, or says /commit.
disable-model-invocation: true
allowed-tools: Bash, Read, Grep, Glob
argument-hint: [optional message override]
---

# Create a Git Commit

Create a commit for the current staged and unstaged changes following project conventions.

## Steps

1. Run `git status` (never use `-uall`) to see all changed and untracked files
2. Run `git diff` and `git diff --cached` to understand what changed
3. Run `git log --oneline -10` to see recent commit message style
4. Analyze the changes and draft a commit message following the format below
5. Stage relevant files by name (never use `git add -A` or `git add .`)
6. Do NOT stage files that likely contain secrets (`.env`, credentials, tokens, etc.) or local test artifacts (`test-results/`, `playwright-report/`, theme zips)
7. Create the commit using a HEREDOC for the message
8. Run `git status` after to verify success

## Commit Message Format

Use conventional commits with an optional GitHub issue reference:

```
<type>: <short summary> (#<issue> if applicable)

<optional body explaining what and why>
```

**Types:**

- `feat` — new feature or capability
- `fix` — bug fix
- `refactor` — code restructuring without behavior change
- `ci` — CI/CD pipeline changes, including the reusable theme workflow
- `docs` — documentation only
- `test` — adding or updating tests only
- `chore` — maintenance, dependencies, tooling

**Rules:**

- Subject line under 72 characters
- Use imperative mood ("add", "fix", "update", not "added", "fixes", "updated")
- Body explains the **why**, not just the **what** — the diff already shows what changed
- Reference GitHub issues with `(#123)` in the subject when the branch or context indicates one
- If the branch name contains an issue number (e.g. `fix/225-...`), include it
- No AI attribution in commits or PRs: never add `Co-Authored-By` trailers, "Generated with" footers, or any mention of an AI tool
- Always pass the commit message via HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
type: summary (#issue)

Body here.
EOF
)"
```

## If the user provided a message override

Use `$ARGUMENTS` as the commit message body/intent, but still format it according to the conventions above.
