---
name: council
description: Stress-test an ambiguous decision with three independent subagent voices (Skeptic, Pragmatist, Critic) plus your own position, then synthesize a verdict that keeps the strongest dissent visible. Use for go/no-go calls or tradeoffs with several credible options. Not for code review, planning, or factual questions.
user-invocable: true
argument-hint: <the decision to make>
---

# Council

Structured disagreement before a decision. The value is not consensus — it's making the disagreement legible before choosing. The anti-anchoring mechanism: the three voices are fresh subagents that see only the question and compact context, never the conversation.

## When

- Several credible paths, no obvious winner (ship now vs. hold, opt-in check vs. default-on for every theme, extend the CLI vs. add a separate tool).
- A decision that constrains every consumer theme or is expensive to reverse — run the council first, then record the verdict's dissent in the issue or PR description.
- The conversation has drifted toward one answer and you want it challenged.

Not for: verifying code (`/review`, `/reviewpass`), breaking work into steps (`/implement`), factual questions (answer directly), obvious tasks (do them).

## Workflow

1. **Extract the question.** One explicit prompt: what we're deciding, the constraints, what counts as success. If it's vague, ask the user one clarifying question first.
2. **Gather compact context.** Only what changes the answer: relevant file excerpts, issue text, numbers. Skip repo context for strategic questions.
3. **Write your own position first** — before launching anything: position, three strongest reasons, main risk. This keeps the synthesis from just mirroring the voices.
4. **Launch the three voices in parallel** as fresh subagents (one `task` batch, read-only `scout` agents when they need to look at code). Each gets only:

   ```text
   You are the [ROLE] on a four-voice decision council.

   Question: [decision]
   Context: [compact context]

   Respond with:
   1. Position — 1-2 sentences
   2. Reasoning — 3 bullets
   3. Risk — the biggest risk in your recommendation
   4. Surprise — one thing the other voices may miss

   Be direct. No hedging. Under 300 words.
   ```

   | Voice      | Lens                                                                                                                |
   | ---------- | ------------------------------------------------------------------------------------------------------------------- |
   | Skeptic    | Challenge the framing and assumptions; propose the simplest credible alternative, including "don't do this at all". |
   | Pragmatist | Shipping speed, operational reality for a small team, impact on the themes that consume this repo.                  |
   | Critic     | Downside risk, edge cases, failure modes, what's expensive to reverse.                                              |

5. **Synthesize with guardrails.** Never dismiss a voice without saying why. If a voice changed your recommendation, say so. Always show the strongest dissent, even when rejected. Two voices against your position is a real signal, not noise.
6. **Present the verdict** — scannable on a phone:

   ```markdown
   ## Council: [short title]

   **Own position:** [1-2 sentences] — [why]
   **Skeptic:** [1-2 sentences] — [why]
   **Pragmatist:** [1-2 sentences] — [why]
   **Critic:** [1-2 sentences] — [why]

   ### Verdict

   - **Consensus:** [where they agree]
   - **Strongest dissent:** [the most important disagreement]
   - **Premise check:** [did the Skeptic challenge the question itself?]
   - **Recommendation:** [the path, and what would change it]
   ```

## Follow-up

One round by default. For another round, keep the new question narrow, pass the previous verdict only if needed, and keep the Skeptic's context as clean as possible.

Persist nothing by default. If the verdict changes active work, update the issue.

## Anti-patterns

- Feeding the voices the conversation transcript.
- Using it for code review or implementation work.
- Smoothing over disagreement in the verdict.
