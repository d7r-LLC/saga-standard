# Writing Voice & Style

These rules apply to all AI-generated text — documentation, marketing copy, UI strings, comments, commit messages, README files, blog posts, release notes, and any content that will be read by humans. The goal is writing that sounds like a sharp person wrote it, not a language model.

## The Core Test

Before finalizing any text, ask: _"Would a competent human writer actually write this sentence?"_ If the answer is no, rewrite it. If you're unsure, simplify.

---

## Words & Phrases — Never Use

These are the fastest signals that text was AI-generated. Avoid them unconditionally.

### The Em Dash Problem

**Never use the em dash (—) as a sentence connector.**

AI writers reach for the em dash constantly. It creates a characteristic rhythm that marks text as machine-generated immediately. Use periods, commas, colons, or parentheses instead. Reserve the em dash only for genuine interruptions in dialogue.

```
❌  The agent registers its identity — this is the first step toward portability.
✅  The agent registers its identity. That's the first step toward portability.

❌  SAGA solves three problems — identity, memory, and transfer.
✅  SAGA solves three problems: identity, memory, and transfer.
```

### Filler Openers — Always Delete

Never start a response, paragraph, or sentence with these:

- Certainly!
- Absolutely!
- Of course!
- Great question!
- Sure thing!
- I'd be happy to help
- I'd love to
- Let's dive in
- Let's explore
- Without further ado
- Allow me to
- As requested

These words do no work. Delete them and start with the actual content.

### Overused Verbs — Replace

| Avoid         | Use Instead                                          |
| ------------- | ---------------------------------------------------- |
| Leverage      | Use                                                  |
| Utilize       | Use                                                  |
| Delve into    | Explore, examine, look at                            |
| Empower       | Let, help, allow, enable                             |
| Unlock        | Open, reveal, give access to                         |
| Streamline    | Simplify, speed up, reduce                           |
| Transform     | Change, rebuild, replace                             |
| Revolutionize | Change significantly (or just describe what changes) |
| Elevate       | Improve, raise                                       |
| Harness       | Use, apply                                           |

### Filler Phrases — Delete Entirely

These phrases add zero meaning. Cut them:

- It's important to note that
- It's worth noting that
- It goes without saying
- Needless to say
- To be clear
- As mentioned previously
- At the end of the day
- Moving forward
- Going forward
- In today's world
- In the modern landscape
- In today's fast-paced environment
- The fact that
- In terms of
- When it comes to
- From a [x] perspective

### Corporate Buzzwords — Avoid

These words are overused to the point of meaninglessness:

- Seamless
- Robust
- Comprehensive
- Holistic
- Synergy
- Paradigm shift
- Game-changer
- Cutting-edge
- State-of-the-art
- Best-in-class
- World-class
- Innovative
- Revolutionary
- Groundbreaking
- Ecosystem (unless you mean an actual biological or technical ecosystem)
- Landscape (unless geographic)
- Journey (unless literal)
- Stakeholders (unless in a formal business/legal context)
- Pain points (prefer: problems, friction, issues)
- Value proposition (prefer: what it does, why it matters)
- At scale (only use when scale is actually relevant and specific)

### Transition Words — Use Sparingly

These aren't banned but are overused. Use them only when the logical connection is genuinely needed:

- Furthermore
- Moreover
- Additionally
- In conclusion
- In summary
- To summarize
- First and foremost
- Last but not least
- On the other hand
- That being said
- With that said

If you need "furthermore" to connect two sentences, you probably just need a period.

---

## Sentence Structure

### Avoid AI Rhythm Patterns

AI tends to write in consistent, parallel sentence structures that create a detectable cadence. Vary sentence length deliberately. Short sentences punch. Longer sentences, when they carry complex ideas that need room to breathe, are fine — but mix them up.

```
❌  The agent registers with a wallet. The wallet verifies identity. The identity enables transfer.
(Three identical structures in a row — mechanical.)

✅  The agent registers with a wallet. That wallet address becomes its identity — permanent,
verifiable, portable. Every transfer after that is just proof of ownership.
```

Wait — that used an em dash. Correct version:

```
✅  The agent registers with a wallet. That wallet address becomes its permanent identity.
Every transfer after that is just proof of ownership.
```

### Don't Explain What You're About to Say

Just say it.

```
❌  In this section, we will explore the three core components of a SAGA document.
✅  A SAGA document has three core components.

❌  This document will walk you through the process of registering an agent.
✅  To register an agent, run:
```

### Avoid the "Not Only... But Also" Construction

```
❌  SAGA not only defines agent identity but also captures memory and task history.
✅  SAGA defines agent identity, memory, and task history.
```

### Avoid Symmetrical Three-Part Endings

AI loves closing with a punchy trio. It's become a cliché.

```
❌  Simple. Powerful. Portable.
❌  Fast. Reliable. Secure.
✅  (Just end the sentence. The product speaks for itself.)
```

### Don't Repeat the Question

When responding to a prompt or question, don't restate it before answering.

```
❌  You asked about how SAGA handles memory transfer. SAGA handles memory transfer by...
✅  SAGA transfers memory in five sub-systems...
```

---

## Formatting

### Headers Are Not Punctuation

Don't add a header to every paragraph. Headers are navigation — they help readers skip to what they need. If content is one coherent section, it doesn't need a header. A README with a `##` every three sentences reads like a PowerPoint deck, not documentation.

### Bullet Points Are Not Prose

Bullet points are for genuine lists. Don't convert flowing thoughts into bullets because it looks organized.

```
❌
The SAGA spec offers several advantages:
- It is portable
- It is verifiable
- It supports transfer between organizations
- It preserves memory

✅
A SAGA document travels with the agent across organizations. It's cryptographically
signed, so any platform can verify its authenticity. Memory, skills, and task history
all come with it.
```

Use bullets when you have 3+ discrete items that don't have natural prose flow. Use prose when the ideas connect.

### Bold Sparingly

Bolding every other phrase trains readers to ignore bold. Use it for genuinely critical information — warnings, required fields, commands. Not for emphasis on any word that seems interesting.

### Emoji in Professional Content

No emoji in documentation, commit messages, API responses, error messages, or any technical writing. Emoji in marketing copy and UI: acceptable when intentional and minimal. Never as decoration on every line.

---

## Tone

### Write for One Person

Technical documentation and copy should feel like it's written for a specific human being, not a generic audience. "You" is almost always better than "users" or "developers."

```
❌  Developers can register their agents using the CLI.
✅  Register your agent using the CLI.
```

### Confidence Without Preamble

State things directly. Don't hedge unless the uncertainty is genuinely important.

```
❌  This might potentially be useful for agents that may need to transfer between organizations.
✅  Use this when transferring an agent between organizations.
```

### Short > Long

If a sentence can be cut in half without losing meaning, cut it. If a paragraph can be one sentence, make it one sentence.

```
❌  The purpose of this document is to provide a comprehensive overview of the SAGA
specification, which is designed to enable the portability of AI agents across
different platforms and organizational environments.

✅  SAGA defines how AI agents move between platforms and organizations.
```

### Technical Content: Be Precise, Not Formal

Precision and formality are not the same thing. Technical writing should be exact, but it doesn't need to sound like a legal brief.

```
❌  The aforementioned wallet address serves as the canonical identifier for the agent entity.
✅  The wallet address is the agent's permanent ID.
```

---

## Common Patterns to Catch in Review

Run a search for these before publishing any human-facing content:

```
— (em dash)
"certainly"
"absolutely"
"of course"
"I'd be happy"
"leverage"
"utilize"
"delve"
"it's important to note"
"it's worth noting"
"furthermore"
"moreover"
"in today's"
"moving forward"
"seamless"
"robust"
"comprehensive"
"holistic"
"game-changer"
"cutting-edge"
"revolutionize"
"unlock"
"empower"
"transform"
"ecosystem" (check context)
"journey" (check context)
"landscape" (check context)
```

If any of these appear, rewrite the sentence. No exceptions.

---

## Examples — Full Rewrites

### Before (AI-generated)

> Certainly! SAGA is a comprehensive, cutting-edge specification that leverages cryptographic identity to empower AI agents with seamless portability across organizational landscapes. Furthermore, it holistically addresses the pain points of agent transfer by providing a robust framework that not only preserves identity but also captures the full journey of an agent's experiences and memories. In today's fast-paced AI ecosystem, this represents a paradigm shift.

### After (Human voice)

> SAGA is a portable format for AI agents. A SAGA document captures an agent's identity, memory, skills, and task history in a signed, verifiable container. Any platform that implements the spec can import that document and bring the agent online. No rebuild from scratch, no lost context, no broken lineage.

---

### Before (AI-generated)

> It's important to note that when registering an agent, you should ensure that the wallet address you utilize is one that you have access to, as it will serve as the canonical identifier going forward.

### After (Human voice)

> Register with a wallet address you control. It becomes the agent's permanent identity and cannot be changed after registration.
