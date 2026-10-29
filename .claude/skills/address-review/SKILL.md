---
name: address-review
description: Triage and address PR review comments from humans and bots. Self-critiques fixes (YAGNI/KISS), runs /review + lint + test, replies to each thread, and resolves the threads it addressed. Use after a review lands.
user-invocable: true
argument-hint: [pr-number]
---

# Address PR Review Comments

You are addressing review comments on a pull request. The skill triages comments, applies a self-critique pass to flag YAGNI/over-engineering pushback, fixes the rest, gates with `/review` + lint + test, then replies and resolves only the threads it actually addressed.

At the start, create a `TaskCreate` task list with these phases:

1. Fetch PR + review comments
2. Triage comments
3. Self-critique fixes (YAGNI/KISS)
4. Implement fixes
5. Quality gate (/review + lint + test)
6. Commit and push
7. Reply to threads + resolve addressed ones

Mark each `in_progress` and `completed` as you go.

## Phase 1: Identify the PR

Use `$ARGUMENTS` if provided. Otherwise detect from current branch:

```bash
gh pr view --json number,title,headRefName,url,author --jq '{number, title, headRefName, url, author: .author.login}'
```

Capture: `PR_NUMBER`, `PR_AUTHOR`, `REPO`:

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
```

If no PR exists for the branch, stop and tell the user.

## Phase 2: Fetch All Review Comments

Pull comments from every reviewer (humans and bots), excluding the PR author's own comments.

**Inline (in-diff) comments:**

```bash
gh api --paginate "repos/$REPO/pulls/$PR_NUMBER/comments" \
  --jq ".[] | select(.user.login != \"$PR_AUTHOR\") | {id, path, line, original_line, body, user: .user.login, created_at, in_reply_to_id}"
```

**PR-level review comments (the summary body):**

```bash
gh api --paginate "repos/$REPO/pulls/$PR_NUMBER/reviews" \
  --jq ".[] | select(.user.login != \"$PR_AUTHOR\" and .body != null and .body != \"\") | {id, state, body, user: .user.login}"
```

**Review threads (for resolution later) — GraphQL:**

```bash
gh api graphql -F owner="${REPO%/*}" -F repo="${REPO#*/}" -F number="$PR_NUMBER" -f query='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 50) { nodes { databaseId author { login } } }
        }
      }
    }
  }
}'
```

Build a `commentId → threadNodeId` map from this — you'll need it in Phase 8.

**Bail clean:** if there are zero non-author comments and no review bodies, tell the user "No review comments to address" and stop.

**Skip already-resolved threads:** drop every comment whose thread has `isResolved: true`, unless the user passed `--include-resolved` (rare).

## Phase 3: Triage

For each comment, bucket it:

### Valid finding — fix it

- Security issues (tokens or secrets in logs or artifacts, command injection through theme-supplied config, overly broad workflow permissions)
- A check that can report pass when it should fail (swallowed exit code, missing `await`, assertion that never runs)
- Missing error handling or cleanup for paths that will be hit (Ghost container left running, temp files left behind)
- A silent break in the consumer contract — CLI flags, `theme-qa.config.mjs` shape, reusable workflow inputs
- Wrong project pattern per `AGENTS.md`

### False positive — reply with reasoning, no fix

Don't hardcode the list. Read the actual policy:

- `AGENTS.md` — any convention that explicitly permits the flagged pattern
- A finding from a bot that contradicts a documented convention: the project rule wins — name the rule in the reply

### Judgment call — read referenced file + nearby code

Decide based on existing patterns in the codebase. When two reviewers conflict (e.g. a human disagrees with a bot), the human's comment takes precedence.

## Phase 4: Self-Critique Fixes (YAGNI / KISS Lens)

Before writing any code, do a single skeptical pass over the planned fixes — same lens used in `/implement` Phase 3 and `/review` Design Review.

For each "valid finding," ask:

- **YAGNI / KISS:** Is the reviewer asking for over-engineering? Common patterns: defensive null checks requested in 5 places when only the entry-point check matters; "consider extracting this into a helper" for code used once; suggested config knobs with no current trigger. Identify the minimal correct fix and push back on the rest in the reply.
- **Scope creep:** Does any "valid" fix expand the PR beyond the issue's authorized scope? Push back, suggest a follow-up issue.
- **Pattern reuse:** Would the proposed fix duplicate logic that already exists elsewhere in the repo?

For items the critique downgrades: move them to **skipped (YAGNI/scope)** and write a clear, specific rebuttal in the reply (Phase 8). Don't be defensive — if the reviewer's point is valid, take it.

State the critique result in the conversation as a short bulleted summary so the user can interrupt if they disagree:

```
### Critique
- comment 12345 — accepted as-is
- comment 12346 — downgraded: 1 entry-point null check is sufficient (YAGNI)
- comment 12347 — downgraded: scope creep, will file follow-up
```

If everything passes the critique, say so explicitly: "Critique: no fixes downgraded."

## Phase 5: Implement Fixes

Standard edits. Read each file first, edit minimally, follow `AGENTS.md`. Group related fixes per file to minimize churn.

## Phase 6: Quality Gate

```bash
npm run lint && npm test
```

`npm run lint` runs editorconfig-checker and `prettier --check`; run `npm run format` to auto-fix Prettier issues. Then invoke the review skill:

```
Skill(skill="review")
```

`/review` is multi-pass and auto-fixes its own findings before returning. Re-run `npm run lint && npm test` after `/review` returns to confirm nothing broke. Loop the outer (`/review` → lint+test) up to 3 times if `/review` keeps surfacing new issues; stop and surface remaining findings to the user if it doesn't converge.

## Phase 7: Commit and Push

Determine the issue number from the PR title or branch name (`fix/411-…` → `#411`). Use the inline commit conventions from `/implement` Phase 7 (HEREDOC, no AI attribution).

```bash
git add <specific files>
git commit -m "$(cat <<'EOF'
fix: address review comments (#<issue>)

<short body summarizing what was fixed and what was pushed back on, if anything>
EOF
)"
git push
```

Capture the new commit SHA — you'll reference it in replies.

If multiple thematically distinct fix groups landed, use multiple commits rather than a monolith.

## Phase 8: Reply and Resolve Threads

For every fetched comment, post a reply on the PR. Resolve the threads you addressed. Leave skipped threads open so the reviewer can decide.

### Reply formats

- **Addressed:** `Fixed in <commit-sha>: <one-line explanation>`
- **Skipped (false positive):** `<reasoning>, e.g. "intentional: AGENTS.md allows this (<quote the rule>)."`
- **Skipped (YAGNI/scope):** `<reasoning>, e.g. "single entry-point check is sufficient — duplicating across all callers would be defensive coding without a current trigger."` Or `"out of scope for #<issue>; filed as follow-up at #<followup>."`

### Posting replies

**Inline-comment thread reply:**

```bash
gh api "repos/$REPO/pulls/$PR_NUMBER/comments/$COMMENT_ID/replies" -f body="<reply>"
```

**PR-level review reply** (top-level PR comment that quotes the review body):

```bash
gh api "repos/$REPO/issues/$PR_NUMBER/comments" -f body="<reply>"
```

### Resolve threads

For each thread whose comment(s) were Addressed, look up the `threadNodeId` from the map built in Phase 2. Once its reply has posted, resolve it:

```bash
gh api graphql -f threadId="$THREAD_NODE_ID" -f query='
mutation($threadId: ID!) {
  resolveReviewThread(input: {threadId: $threadId}) {
    thread { isResolved }
  }
}'
```

If the mutation fails (already resolved, permission, network), log it and continue — don't block the rest of the loop.

**Do NOT** resolve a thread where you skipped the suggestion, or a thread the reply leaves to the user. Those stay open intentionally.

## Phase 9: Final Report

Tell the user:

1. Counts: addressed / skipped (false positive) / skipped (YAGNI or scope)
2. Threads resolved vs left open, with a one-line summary for each open thread (so the user can scan them)
3. New commit SHA(s) and URL(s)
4. Ask the reviewers to look at the new head; run `/address-review` again when new comments land.

If `/review` hit its 3-iteration cap with unresolved findings, surface those explicitly under a **Needs your decision** heading.
