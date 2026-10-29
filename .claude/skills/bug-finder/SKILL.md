---
name: bug-finder
description: Diagnose a reported bug from a free-form description, logs, stack trace, or screenshot. Reads the description, hunts the offending code in existing files (not the current diff), reports the suspected root cause with file:line citations, and offers to file it via /create-issue. Use when something is broken or behaving oddly and you want to find where in the code it's coming from.
user-invocable: true
argument-hint: <description, paste logs, stack trace, or screenshot>
---

# Find the Bug

Hunt the root cause of a reported problem in the existing codebase. The input in `$ARGUMENTS` is a free-form description — a symptom, a log snippet, a stack trace, a screenshot path, a failing CI run in a theme repo, or a Playwright report. The skill turns it into a concrete root-cause finding with `file:line` citations, then offers a follow-up: file a GitHub issue via `/create-issue` or hand off to `/implement` for a fix.

This is **off-diff**, **read-only** investigation. It does not modify code, does not run `/review`, and does not auto-fix. It is the diagnostic counterpart to `/review` (which scans the current branch's diff) and `/create-issue` (which files what you've already understood).

At the start, create a `TaskCreate` task list with these phases so the user sees progress:

1. Parse input and form hypotheses
2. Locate suspect code (parallel Explore agents)
3. Read suspect files and confirm root cause
4. Check duplicates against open issues
5. Report finding and offer next step

Mark each phase `in_progress` then `completed` as you go. If a phase short-circuits (no input, no plausible suspect found, duplicate detected), mark the remainder `deleted` with a one-line reason.

## Phase 1: Parse Input and Form Hypotheses

Read `$ARGUMENTS` carefully. Extract whichever of these are present:

- **Symptom:** What is broken from the user's POV? ("theme CI hangs at 'starting Ghost'", "gscan step passes a theme that Ghost rejects", "visual check flags every page after a Playwright bump").
- **Reproduction signal:** command, config key, theme, Ghost version, CI vs. local. Often hidden in the wording ("when I run it from the theme repo...", "only on the second spec...").
- **Stack trace lines:** file paths, function names, line numbers. These are the strongest leads — extract every `at someFn (file:///.../src/...)` line.
- **Log lines:** error messages, CLI output, Docker or Ghost container logs, Playwright errors. Match wording against the codebase later.
- **Screenshot:** if `$ARGUMENTS` references a screenshot path, a Playwright trace or diff image, or the conversation has an attached image, read it with the `Read` tool (PNGs work). Look for visible error text, the URL, layout glitches, or the diff region.
- **Affected area hint:** CLI and config loading, Ghost-in-Docker lifecycle, gscan, Playwright checks, the reusable `theme.yml` workflow. Use it to bias the scan.

Form **2–3 hypotheses** about where the bug likely lives. Examples:

- "Theme CI hangs at 'starting Ghost'" → hypothesis 1: the readiness check polls a URL that never returns 200 on a fresh install. Hypothesis 2: the container fails on start and the CLI waits without reading its exit status. Hypothesis 3: the workflow maps a port the runner already uses.
- "Config option ignored" → hypothesis 1: `theme-qa.config.mjs` is resolved relative to the CLI package instead of the theme's working directory. Hypothesis 2: defaults are merged after the user config and overwrite it.

State the hypotheses in the conversation as a short bulleted summary before dispatching agents, so the user can interrupt if you're off-base.

**Bail early** when the input is too thin to act on — e.g. "the tests are broken" with no further detail. Ask the user one focused clarifying question (use `AskUserQuestion`) for the single thing that would most narrow the search: which theme / which command / which Ghost version / what does the log say. Don't ask more than one question; if they can't narrow it, file `[needs investigation]` placeholders later and proceed with the best guess.

## Phase 2: Locate Suspect Code (Parallel Explore Agents)

Dispatch **Explore subagents** in parallel — single message, multiple `Agent` tool calls with `subagent_type: "Explore"`. One agent per hypothesis, up to 3.

Each agent prompt must include:

- The user's input verbatim (paste `$ARGUMENTS` so the agent sees the same signal you did)
- The specific hypothesis it's testing, in one sentence
- A focused question: "Find the file(s) and exact line(s) where this could go wrong. Identify the function, the failing condition, and quote 5–10 lines of context."
- Project context the agent needs: the repo layout and conventions described in `AGENTS.md`
- An instruction to return: **file paths with line numbers**, **the suspect function/expression**, **one-paragraph reasoning** for why this is (or isn't) the cause.

When the input contains a stack trace, skip the hypotheses-and-agents step for any frame that points to a project file — go directly to reading that file in Phase 3. Use Explore only for frames that don't have a clear file:line.

## Phase 3: Read Suspect Files and Confirm

Agent summaries are leads, not verdicts. Before reporting anything, **open the suspect files yourself** with `Read` and verify:

- Does the cited code actually do what the agent claims? (Agents sometimes describe nearby code, not the cited line.)
- Does the surrounding context support the hypothesis? Read 30–50 lines around the suspect line — check the function signature, callers, error paths.
- Is the bug **on a modified line in the current branch** or **pre-existing**? Run `git blame -L <start>,<end> <file>` to find out. Pre-existing bugs are the typical target of this skill; if it's on the current diff, flag that to the user — they may want `/review` instead.
- Are there tests covering this code path? Search the test files for the function name — absence of a test for the failing path is itself a finding.

If after reading you can't confirm any hypothesis with **≥70% confidence**, say so and either:

1. Dispatch a second round of Explore agents with a refined hypothesis based on what you learned, **or**
2. Surface "could not localize" to the user with the hypotheses you investigated, the files you checked, and what would make the next step possible (more log context, the exact command, a reproduction).

Don't fabricate a root cause to deliver a clean report. "I couldn't find it, here's what I looked at" is the honest answer.

## Phase 4: Duplicate Check

Before reporting, search open issues for keyword overlap. Pull 2–3 distinctive nouns/symbols from the symptom + suspect file (skip generic words like "fix", "issue", "error"):

```bash
gh issue list --state open --limit 50 --search "<distinctive keyword phrase>" --json number,title,labels,url
```

For each hit, decide:

- **Strong overlap** (same file/command/symptom): mention in the report as a likely duplicate; offer to comment on the existing issue instead of filing a new one.
- **Loose overlap** (same area, different symptom): note as "may relate to #N" but don't block.

## Phase 5: Report Finding and Offer Next Step

Print to the conversation. No GitHub writes — this skill never files the issue itself.

````
### Symptom
<one-line restatement of what's broken>

### Root cause
**File:** src/example.js:142-148
**Function:** `waitForGhost()`
<2–4 sentences explaining what's wrong and why it produces the observed symptom>

```js
// lines 142-148 (quoted from the file)
```

### Why this matches the symptom
<one paragraph tying the code behaviour to the user's report — log line maps to this branch, stack frame points here, etc.>

### Confidence
<High / Medium / Low> — <one-line reason>

### Suspected first commit
<commit SHA from git blame, date, author, message> — pre-existing / introduced in current branch

### Test coverage
<one line: present and exercises this path / present but skips the failing branch / absent>

### Possible duplicates
- #12 — "<title>" (open, <labels>) — <strong/loose overlap, one-line rationale>

### Suggested next step
- File this as a new issue: `/create-issue <one-line summary copied from Symptom>`
- (or) Comment on existing duplicate: paste the root-cause block into #12
- (or) Fix it directly: `/implement <new-issue-number>` once filed
````

Omit sections that are empty (no duplicates → drop the section).

After printing, ask the user (with `AskUserQuestion`) what they want to do next:

1. File via `/create-issue` (recommended — the description is already drafted in the report above)
2. Comment on the strongest duplicate (only offer if Phase 4 found one)
3. Hand off to `/implement` (only when the root cause is High confidence and the fix is well-scoped)
4. Done — they'll take it from here

If they pick **File via /create-issue**, invoke the skill with a draft description built from the report:

```
Skill(skill="create-issue", args="<Symptom + Root cause block from the report>")
```

`/create-issue` will run its own classification, duplicate check, and codebase investigation — that's expected. The handoff is intentional: `bug-finder` diagnoses, `create-issue` files.

## Project-Specific Bug Patterns

Bias hypotheses toward these classes of bug — they are the usual failure modes of a Node CLI that drives Docker, gscan and Playwright on behalf of other repositories:

- **Missing `await` on async calls** — errors silently lost, a check reported as passed before it ran, ordering bugs.
- **Paths resolved against the wrong root** — `process.cwd()` (the consumer theme) confused with the package's own directory (`import.meta.url`), so config, fixtures or the theme zip are looked up in the wrong place.
- **Swallowed child-process failures** — a `docker`, `gscan` or `npx` invocation whose non-zero exit code or stderr is ignored, so the CLI exits 0 on a failed check.
- **Ghost container lifecycle** — readiness judged by the container starting rather than Ghost answering, fixed ports that collide on shared runners, containers left running after a failed run.
- **Flaky Playwright checks** — fixed `waitForTimeout` sleeps, assertions that don't auto-retry, screenshots taken before fonts or images load.
- **Config defaults clobbering user values** — shallow merges that drop nested keys from `theme-qa.config.mjs`.
- **Workflow input drift** — the reusable `theme.yml` reads an input or secret that callers don't pass, or a step depends on the caller's checkout layout.

When the symptom plausibly fits one of these, mention it explicitly in the hypothesis so the agent search is biased correctly.

## Constraints

- **Read-only.** Never edit source files. Never `git commit`. Never write to GitHub. The report is the only output.
- **Cite, don't paraphrase.** Every root-cause claim needs `file:line` and a quoted snippet — agent prose isn't enough.
- **Don't fabricate confidence.** "Low" confidence with two plausible-but-unconfirmed hypotheses is more useful than "High" on a guess.
- **Stop after one clarifying question.** If the input is genuinely too thin and one targeted question doesn't unblock you, deliver what you have and surface the gaps.
- **Don't run /review or any quality gate.** Those operate on the diff; this skill operates on the latent codebase.
- **No AI attribution** in any text that may end up in a GitHub issue body via the handoff.
- **Public repo.** Logs pasted into the report may end up in a public issue — strip tokens, internal hostnames, and customer names or data before quoting them.
