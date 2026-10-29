---
name: babysit-pr
description: Watch a PR until reviewpass has reviewed its current head, then report the verdict and offer to address the findings. Use after pushing a PR when you want to continue other work.
user-invocable: true
argument-hint: [pr-number]
---

# Watch PR for the reviewpass Review

Every PR needs an approval from reviewpass (`reviewpass[bot]`, `.github/workflows/reviewpass.yml`) before it merges. It reviews each push to the PR. This skill waits for the review of the current head and reports it.

## Phase 1: Identify the PR

If a PR number was provided in `$ARGUMENTS`, use it.

Otherwise, detect from the current branch:

```bash
gh pr view --json number,title,url,headRefOid --jq '{number, title, url, headRefOid}'
```

Store the PR number, title, URL and head SHA. Get the head SHA again each cycle: a new push replaces the review you are waiting for.

## Phase 2: Get Repo Info

```bash
REPO=$(gh repo view --json nameWithOwner --jq '.nameWithOwner')
```

## Phase 3: Poll for the Review of the Head

Every 2 minutes, look for a reviewpass review of the head commit:

```bash
gh api --paginate "repos/${REPO}/pulls/<PR_NUMBER>/reviews" \
  --jq '.[] | select(.user.login == "reviewpass[bot]" and .commit_id == "<HEAD_SHA>") | {state, body: .body[0:300]}'
```

`--paginate` applies the filter page by page, so each matching review prints on its own line; the last line is the newest. Any output means reviewpass has finished: proceed to Phase 4.

No output means the review is still running, or that it failed, because a failed run never posts a review. Check the workflow run for the head commit:

```bash
gh run list --workflow reviewpass.yml --commit <HEAD_SHA> --event pull_request --limit 1 --json status,conclusion,databaseId,url
```

A run that completed with `failure` or `cancelled` reviewed nothing. Stop and tell the user, with the run URL (`gh run view <id> --log-failed` gives the cause).

**Timeout:** a review takes several minutes and more on a large diff. After 30 minutes (15 checks), stop and tell the user the review hasn't landed; they can run `/babysit-pr` again later.

Use `sleep 120` between checks and print a short status each cycle (e.g. "Waiting for reviewpass on PR #42 at abc1234 (check 3/15)").

## Phase 4: Report the Verdict

Count the open reviewpass threads, which hold back an approval:

```bash
gh api graphql -F owner="${REPO%/*}" -F repo="${REPO#*/}" -F number=<PR_NUMBER> -f query='
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes { isResolved comments(first: 1) { nodes { author { login } } } }
      }
    }
  }
}' --jq '[.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved | not) | select(.comments.nodes[0].author.login == "reviewpass")] | length'
```

GraphQL names the bot `reviewpass`; the REST calls above name it `reviewpass[bot]`.

Tell the user:

1. PR #N ("title") at `<short head SHA>`
2. Verdict: `APPROVED`, `COMMENTED` or `CHANGES_REQUESTED`
3. New findings in this review, and open reviewpass threads in total
4. PR URL

`APPROVED` means the review gate is passed; stop there. reviewpass approves only when a review finds nothing new **and** none of its earlier threads are open, so a `COMMENTED` review saying "No new findings" still blocks while threads are open.

## Phase 5: Offer Next Steps

For any verdict other than `APPROVED`, ask the user whether to:

- Run `/address-review <PR_NUMBER>` now
- Skip for now (they'll handle it later)

If they choose to address, invoke the `/address-review` skill.
