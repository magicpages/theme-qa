---
name: create-issue
description: File a GitHub issue from a free-form description. Autonomously classifies type, investigates the codebase to fill technical fields, checks for duplicates, and creates the issue with all template-required fields populated. Use when you have a problem or idea you want recorded; just describe it.
user-invocable: true
argument-hint: <description in free text>
---

# Create GitHub Issue (autonomous)

You are creating a well-structured GitHub issue for theme-qa — the shared QA and test framework for Magic Pages' Ghost themes — from a free-form description in `$ARGUMENTS`. The user wants to describe the problem once and have you fill out everything else.

At the start, create a `TaskCreate` task list with these phases so the user sees progress:

1. Classify type and extract context
2. Check for duplicate open issues
3. Investigate codebase (Explore agents)
4. Draft and create issue

Mark each phase `in_progress` then `completed` as you go. If a phase short-circuits (e.g. duplicate detected, abort), mark the remaining phases `deleted` with a one-line note.

## Phase 1: Classify Type and Extract Context

Read `$ARGUMENTS` — the user's full description. Decide which of the four types applies:

- **bug**: something is broken, fails, crashes, errors, returns wrong result. Present-tense problem language.
- **enhancement / feature**: new capability that doesn't exist. Future-tense "we should be able to…" language.
- **improvement**: existing thing should be better — faster, clearer, less flaky. Comparative language.
- **task**: maintenance, refactor, dependency bump, CI, docs. Doesn't change behavior for consumer themes.

If `.github/ISSUE_TEMPLATE/` exists, map each type to its template there and use that template's field labels in Phase 4. If it doesn't, use the default fields listed in Phase 4.

If the description is genuinely ambiguous between two types, pick the most defensible one and silently note "type inferred" — don't ask. The user said "just describe it."

Extract from the description:

- **Affected files / symbols / commands** mentioned by name (e.g. `theme-qa.config.mjs`, a CLI subcommand, a Playwright spec, the reusable `theme.yml` workflow)
- **Affected consumer themes** if named (Pod, Vienna, Berlin, Kyiv, Alpine)
- **Severity hints**: words like "every theme's CI is red", "security", "blocks releases" → urgent; "broken for several themes", "blocking" → high; "with workaround", "flaky", "minor" → medium; "nit", "cosmetic", "ideally" → low. Default to **medium** when unclear.

## Phase 2: Duplicate Check

Search open issues for keyword overlap. Pull 2-3 distinctive nouns/symbols from the description (skip generic words like "fix", "issue", "error"). Examples: "gscan fails on Ghost 6 helpers" → keywords `gscan helpers`. "Ghost container never becomes ready" → keywords `container ready`.

```bash
# Multiple narrow searches beat one broad search; OR them.
gh issue list --state open --limit 50 --search "<keyword phrase 1>" --json number,title,labels,url
gh issue list --state open --limit 50 --search "<keyword phrase 2>" --json number,title,labels,url
```

For each hit, decide:

- **Strong overlap** (same area, same symptom, or same proposed change): treat as a duplicate candidate.
- **Loose overlap** (same file mentioned but unrelated symptom): not a duplicate; ignore.

**If one or more strong matches:** stop. Show the user:

```
Possible duplicates of what you're describing:
  #34 — "Ghost container readiness timeout" (open, label: bug)
       https://github.com/.../issues/34

What would you like to do?
  1. File this as a new issue anyway
  2. Add a comment to the existing issue
  3. Abort
```

Use `AskUserQuestion` for the choice. Default-highlight option 1 only when the symptoms genuinely diverge.

**If no strong matches:** proceed silently. Don't pad the issue body with "may relate to" links — they get stale.

## Phase 3: Investigate Codebase

Dispatch **Explore subagents** via the `Agent` tool with `subagent_type: "Explore"`. In parallel when more than one is needed (single message, multiple `Agent` tool calls):

- **One agent** when the description points at one specific file/command/spec.
- **Two agents** when the description spans two unrelated areas. Typical split: the CLI and its checks vs. the reusable GitHub workflow and Docker setup.

Each Explore agent prompt should include:

- The user's description verbatim
- A focused question shaped to the issue type:
  - **bug:** "Find the file(s) likely causing this. Identify the offending function and line, what makes it fail, and a concrete fix."
  - **feature:** "Find existing patterns this would extend or follow (similar checks, related commands, related config keys). Identify the extension point."
  - **improvement:** "Find the current implementation. Identify what about it is awkward / slow / flaky / unclear."
  - **task:** "Find every file that needs to change. List them with one-line notes."
- An instruction to return: **file paths with line numbers**, **key function names**, **a concrete suggestion** (root-cause line for bugs / extension-point file for features / current pattern for improvements / file inventory for tasks).

After agents return, **read** the 2-3 most load-bearing files yourself before drafting. Agent summaries aren't authoritative for what you put in the issue.

**Skip this phase** when the description is purely conceptual ("we should think about how to handle X") with no concrete code anchor — in that case mark Root Cause / Affected Files as `[needs investigation]` (see Phase 4).

## Phase 4: Draft and Create

Fetch the available labels — never invent ones:

```bash
gh label list --limit 100 --json name,description --jq '.[] | "\(.name): \(.description)"'
```

Select labels from that list only:

- **Type label**: the one matching the chosen type (`bug`, `enhancement`, `documentation`, or whichever exists for improvement/task).
- **Component and priority labels**: only if the repo has them; pick from Phase 1 inference.

Assignee: the user running the skill (`@me`) unless the description explicitly names someone else.

### Title

`<type>: <one-line summary>` — reuse the description's gist; cap at ~70 chars; avoid trailing punctuation. Examples:

- `bug: Ghost container readiness check times out on cold start`
- `feature: run gscan against a custom Ghost version`
- `improvement: reuse one Ghost container across Playwright specs`
- `task: bump @playwright/test to the latest minor`

### Body — match the template's required fields

When the repo has issue templates, use markdown headers matching each template's field labels and fill every required field. Otherwise use these fields:

**bug:** Problem, Steps to Reproduce, Expected Behavior, Affected Themes, Priority

**feature:** Summary, Motivation, Proposed Solution, Acceptance Criteria, Priority

**improvement:** Current Behavior, Proposed Improvement, Priority

**task:** Objective, Context, Scope, Priority

Fill required fields from the description + Phase 3 investigation. Fill optional fields when the investigation surfaced relevant content (Root Cause with `file:line`, Suggested Fix, Affected Files, Implementation Notes).

This repository is public. Keep issue bodies free of secrets, tokens, internal hostnames, and customer names or data — describe the symptom with a public theme or a minimal reproduction instead.

When a required field genuinely cannot be inferred, write:

```
[needs investigation — <one-line reason>]
```

…and add this note at the top of the body (only when at least one `[needs investigation]` is present):

```markdown
> ⚠️ Filed from a one-line description. Fields marked `[needs investigation]` need follow-up before implementation.
```

### Issue creation

```bash
gh issue create \
  --title "<type>: <summary>" \
  --label "<labels from gh label list>" \
  --assignee "@me" \
  --body "$(cat <<'EOF'
<rendered body>
EOF
)"
```

Print the resulting issue URL.

## Phase 5: Report

Tell the user:

- The issue URL and number
- The labels applied
- Type/priority that were **inferred** rather than stated, so they can correct via the GitHub UI if wrong
- Any fields marked `[needs investigation]`, with a one-line reason each
- Possible follow-up: `/implement <issue-number>` to start work, or `/worktree <issue-number>` for a parallel session

## Constraints

- Do NOT invent labels; pick from `gh label list` output.
- Do NOT skip the duplicate check — it saves the user from accidentally filing the same thing twice.
- Do NOT pad fields with filler when the information genuinely isn't there. The `[needs investigation]` placeholder is the honest answer.
- Do NOT include AI attribution or tool footers in the issue body.
