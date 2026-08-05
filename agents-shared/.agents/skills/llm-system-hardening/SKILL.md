---
name: llm-system-hardening
description: Apply this skill whenever the user is designing, reviewing, debugging, or hardening a prompt, system prompt, LLM-powered feature, RAG pipeline, or agentic system — especially when reliability, hallucinations, prompt injection, prompt poisoning, determinism, evals, tool use, guardrails, or production LLM deployments come up. Trigger even when the user doesn't explicitly ask for a "reliability review": if they share a prompt template, an agent config, a RAG design, or a snippet of a harness, proactively audit it against these rules. Also trigger for meta-questions like "how do I make this more deterministic" or "why is my agent hallucinating". Do not trigger for generic LLM trivia, pure model comparisons, or casual questions about how transformers work.
---

# LLM System Hardening

A checklist-driven skill for designing and reviewing LLM-based systems against three failure modes: **hallucination**, **prompt injection / poisoning**, and **non-determinism**. It also covers the **harness** — the code around the model — because in practice that's where most real-world reliability lives.

## Mental model (read this first)

These three goals trade off against each other. You cannot fully achieve all of them simultaneously with current LLMs:

- Reducing hallucinations often requires longer, richer prompts (more surface area for injection).
- Making output deterministic (temperature 0, constrained decoding) can make hallucinations *more* consistent, not less.
- Defending against injection often means adding instructions and checks, which consumes the context budget you'd otherwise spend on grounding.

**The right frame is not "make the LLM deterministic and correct" but "treat the LLM as a high-variance component inside an otherwise deterministic system."** The harness around the model — validation, retries, evals, tool-scoping, logging — is what makes the overall system reliable. Push as much certainty as possible out of the model and into code.

When reviewing or designing something, work through the four sections below in order. Skipping the harness section is the single most common mistake.

---

## 1. Reducing hallucinations

Hallucinations happen because models are trained to be helpful and fluent; producing *something* is rewarded more than saying "I don't know." Every rule below either reduces the pressure to fabricate or gives the model grounding it can cite.

### Principles

- **Give an explicit escape hatch.** Tell the model "I don't know" or "the provided context doesn't contain this" is a valid, preferred answer. If you don't say this, the model will guess.
- **Ground in retrieved context, not parametric memory.** For anything factual or product-specific, inject source material and instruct the model to answer *only* from it. Ask it to cite the specific passage. If it can't cite, it shouldn't claim.
- **Ask for reasoning before the answer.** "Think step by step before answering" or extended thinking (for Claude) reduces errors on logic, math, and multi-step inference. Put the reasoning *before* the final answer — order matters.
- **Decompose complex tasks.** A single mega-prompt doing five things hallucinates more than five focused prompts chained together. Each sub-task has a smaller surface area for error. If you're writing a prompt longer than ~500 lines of instructions, strongly consider splitting it.
- **Use few-shot examples.** 2–5 examples of `input → correct output` anchor both format and reasoning better than abstract instructions. Include at least one edge case and, if relevant, at least one "should refuse / should say I don't know" example.
- **Verify with a second pass.** For high-stakes output, a "critic" call that reviews the first output against the source catches a meaningful fraction of hallucinations. For the highest stakes, sample multiple times at slight temperature variance and keep only claims that are stable across samples (self-consistency).

### Review checklist

When auditing a prompt for hallucination risk, ask:

1. Is there an explicit "say I don't know" instruction?
2. Are factual claims required to cite retrieved context?
3. Is reasoning requested before conclusions?
4. Is the task decomposed, or is one prompt doing too much?
5. Are there few-shot examples covering normal, edge, and refusal cases?
6. Is there a second-pass verifier for high-stakes outputs?

---

## 2. Preventing prompt injection and poisoning

Injection is not a "prompt problem," it's a **trust-boundary problem**. The model cannot reliably distinguish "instructions from my operator" from "instructions embedded in a document I'm reading." Your job is to make sure instructions coming from untrusted sources cannot reach privileged actions.

### Principles

- **Treat all external content as untrusted data, never as instructions.** Web pages, PDFs, emails, user uploads, tool results, even the output of another agent — all untrusted. Wrap this content in clear delimiters (XML tags work well with Claude: `<user_document>…</user_document>`) and tell the model explicitly that content inside those tags is data to analyze, not instructions to follow.
- **Real instructions live in the system prompt.** The system prompt has higher effective priority than the user turn. Never let untrusted content reach the system prompt. Never concatenate user-controlled strings into your system prompt.
- **Least-privilege tools.** An injected "delete all records" is only dangerous if the agent has that tool wired up. Most agent security comes from tool design, not prompt hardening. Ask: for every tool this agent has, what's the worst a malicious document could make it do?
- **Human-in-the-loop for irreversible actions.** Sending money, deleting data, publishing content, emailing externally, modifying permissions — require explicit user confirmation at the *harness* level, not the model level. The model's sign-off doesn't count; a confirmation flag it fills in is a confirmation flag an injection can fill in.
- **Validate tool call arguments.** If the model calls `send_email(to, body)`, validate `to` against an allowlist in code before executing. Don't trust the model to have resisted injection — validate downstream.
- **Never put secrets in the prompt.** API keys, database URLs, admin credentials — if they're in the prompt, an injection can exfiltrate them. Keep them in the tool execution layer and reference by name.
- **Isolate untrusted agents.** If one agent reads external content, don't let it directly instruct another agent with privileged tools. Pass structured, validated data between them.
- **Log and monitor tool calls.** You cannot detect injection in production without visibility. Log every tool invocation with the prompt that led to it.

### Review checklist

When auditing for injection risk, ask:

1. Can any untrusted content (user input, retrieved docs, tool results, web pages) reach the system prompt? If yes, that's the vulnerability.
2. For each tool: what's the worst case if a malicious document controls this tool's arguments?
3. Which actions are irreversible? Do they have a human-in-the-loop gate outside the model?
4. Are tool arguments validated in code (allowlists, schema, bounds) before execution?
5. Are secrets in the prompt, or referenced by name in the execution layer?
6. If multi-agent: does an agent that touches untrusted content have direct access to privileged tools?

---

## 3. Making output more deterministic

Full determinism is not achievable. Even at `temperature: 0`, providers (Anthropic, OpenAI, etc.) have small non-determinism from batch-dependent kernels and floating-point effects. Design the system to tolerate small variations rather than depend on bit-exact reproducibility.

### Principles

- **Set `temperature: 0`.** Necessary but not sufficient. Use `top_k: 1` if the API exposes it.
- **Constrain the output shape.** Use tool use / function calling or strict JSON schemas instead of free-form text. "Pick one of A, B, C" is more stable than "classify this." Fewer degrees of freedom → less variance.
- **Prefill the assistant turn.** With Claude, put initial tokens in the assistant message to force output into a specific format — start with `{` to force JSON, `<answer>` to force a tag structure.
- **Split generation from judgment.** LLM for fuzzy/creative steps, deterministic code for selection and routing. "Generate 5 candidate headlines" → code picks by length/keyword → return. The LLM variance is contained to the generation step.
- **Cache aggressively.** Identical `(prompt, model, params)` → cached response. Deterministic by construction, and cheap. Anthropic's prompt caching also helps with cost at scale.
- **Expose the knobs for debuggability, not just performance.** Log temperature, model, prompt hash, and seed (where supported) on every call. When a user reports a weird output, you need to be able to reproduce the exact call.

### Review checklist

When auditing for determinism, ask:

1. Is temperature set explicitly (not left to SDK default)?
2. Is the output shape constrained (tool use, JSON schema, enum) rather than free-form?
3. Is there prefilling to force format?
4. Are the creative steps separated from the selection/routing steps?
5. Is caching enabled for identical-input calls?
6. Are all call parameters logged for reproduction?

---

## 4. The harness (this is where reliability actually lives)

Most real-world LLM quality comes from the code around the prompt, not the prompt itself. A mediocre prompt with a great harness beats a great prompt with a bad harness, every time.

### Required components

- **Eval suite with golden examples.** 50–200 curated `input → expected_output` pairs covering happy paths, edge cases, and every past failure mode. Run on every prompt change. Without an eval suite, you cannot know if a prompt change improved or regressed anything.
- **Output validation.** Schema checks (Zod, Pydantic), content checks (does the claimed citation actually exist in the source?), plausibility checks (is this number in a reasonable range?). If validation fails, retry with an adjusted prompt — don't return broken output.
- **Retries with adjusted prompts.** On validation failure, feed the error back in and ask the model to correct. Cap retries (2–3) to bound latency and cost.
- **Observability.** Log every prompt, every response, every tool call, token counts, latency, model version. You cannot improve what you cannot see. Langfuse, Braintrust, Helicone, or a home-grown equivalent — pick one.
- **Regression testing in CI.** When a prompt changes, the eval suite runs. No silent regressions. Treat prompts like production code.
- **Canary / gradual rollout.** New prompts go to 5% of traffic first, watch metrics, then ramp. Same discipline as any other production change.
- **Guardrails as a separate layer.** Input filters (PII, injection-pattern detection) and output filters (toxicity, schema violations, citation verification) run independently of the main model, so they can't be subverted by the same injection that got through.

### Review checklist

When auditing a harness, ask:

1. Is there an eval suite? How big? Does it run on every prompt change?
2. Is every output validated before it reaches the user or downstream systems?
3. What happens on validation failure — retry with correction, or broken output returned?
4. Is every prompt/response/tool-call logged with enough metadata to reproduce?
5. Do prompt changes go through CI with eval regression checks?
6. Are new prompts rolled out gradually, with monitored metrics?
7. Are input and output guardrails independent of the main model?

---

## How to use this skill

When the user shares a prompt, system design, agent config, or asks about reliability/hallucinations/injection/determinism:

1. **Identify the concern.** Which of the four sections most applies? Often more than one — work through each relevant section's checklist.
2. **Apply the review checklist.** Walk through the questions and flag concrete gaps against the user's actual code/prompt, not generic advice.
3. **Prioritize by leverage.** Harness issues (no evals, no validation, no logging) are usually higher-leverage than prompt tweaks. Tool-scoping issues are usually higher-leverage than prompt-level injection defenses.
4. **Explain the why, not just the rule.** The principles above each have a "why" — carry it through to the user. "Set temperature to 0 because…" lands better and generalizes better than "you must set temperature to 0."
5. **Be honest about tradeoffs.** Don't claim full determinism is possible, don't claim injection can be fully prevented by prompting alone, don't claim hallucinations can be eliminated. The goal is *risk reduction to an acceptable level for the use case*, not perfection.

## Anti-patterns to flag on sight

- "We'll just tell the model not to follow instructions from documents." → Doesn't work reliably. Use trust boundaries + tool scoping.
- "We set temperature to 0 so the output is deterministic." → Partial; also need constrained output, and accept residual variance.
- "The model confirmed it's safe to send the email." → Model confirmation is not a safety control. Add a human-in-the-loop or code-level check.
- "We don't need evals, we'll just eyeball the outputs." → Invisible regressions. Build the eval suite before the second prompt change.
- "We'll add a guardrail prompt at the end." → A guardrail that shares the same context window as the attacker input is not a guardrail. Run it as a separate call, ideally with a separate model.
- "Just raise the temperature if it's too repetitive." → Raising temperature widens the distribution of *everything*, including hallucinations. Fix the prompt or the retrieval, not the sampler.
