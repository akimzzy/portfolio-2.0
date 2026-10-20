# Akeem's writing pattern

Use this as an editorial guide, not a fixed set of headings. Start with one concrete problem and follow the decisions needed to understand it. A reader should leave knowing what happened, why the approach made sense, and where its limits are.

## The flexible spine

1. **Situation:** Who needed something, and what were they trying to do? Open with a recognisable task or problem before introducing the stack.
2. **Constraint:** What made the obvious solution insufficient? Explain the practical stakes: cost, time, reliability, access, or the user's workflow.
3. **Decision:** What did I choose, what alternatives did I actually consider, and why? Include only recollections the owner has supplied.
4. **Mechanism:** Show how the relevant part works through one concrete example. Explain terminology on first use. Include code or a diagram only if it clarifies the decision.
5. **Consequence:** What worked, what did the approach cost in complexity, and what feedback or limitations emerged?
6. **Takeaway:** End with a specific lesson grounded in the story. State when the approach is useful without presenting it as a universal rule.

Combine or omit steps when the subject needs it. Headings should describe the actual content rather than repeat these labels.

## Adapt to the article

- **Project story:** Business need, personal ownership, one or two difficult decisions, live workflow, and user feedback. Leave separate technical deep dives for later articles.
- **Technical deep dive:** A concrete failure or requirement, the correctness rule, implementation, edge cases, and meaningful verification. Use a small example readers can follow.
- **Engineering practice:** A realistic scenario, available options, their tradeoffs, and a worked example. Explain when the practice is worth the effort.

## Voice and readability

Write in first person for work Akeem personally owned. Describe shared contributions accurately. Use direct language and short, connected paragraphs. Explain the real task before the abstraction: finding one perfume in a large catalogue is easier to picture than a cache strategy.

Avoid generic openings, invented dialogue, motivational conclusions, technology lists without purpose, and claims that something is effortless or universally best. Do not invent mistakes, incidents, alternatives, or retrospective wishes to make a story more dramatic.

Illustrative scenarios may explain a mechanism, but must not sound like reported customer incidents. Real quotes must come from a supplied or cited source.

## Evidence rules

- Personal context, ownership, decisions, and feedback come from Akeem's account.
- Technical implementation claims must match the relevant source code or verified documentation.
- Current platform prices and limits need official sources and a review date in editorial notes.
- Planned capacity is different from a current live count. A feature request is different from a shipped feature. A base service price is different from a total operating bill.
- Report measured results only when supporting measurements exist. Explain avoided work without inventing percentages or savings.
- Describe tradeoffs and boundaries: local caches can be stale; server validation remains authoritative; successful email delivery does not prove it was read.
- Keep private business data, credentials, customer records, and private repository links out of articles.

## Drafting and approval

Gather a short brief covering the trigger, ownership, hardest problem, actual alternatives, and outcome or feedback. Ask only for missing facts that materially change the story. Write one complete draft, then check it for factual accuracy, repetition, readability, and unsupported claims.

Keep source notes and unresolved facts outside the reader-facing article. Exclude commercial negotiations, approval arrangements, and internal scope discussions unless they are essential to the subject and explicitly approved for publication. Remove editorial disclaimers by narrowing the claim itself. Explain project-specific choices without implying that every app needs the same architecture. Review voice and accuracy with Akeem, then publish only with his approval. Choose a publication date at that point. Drafts stay outside public routes until approved.

## Standalone articles and optional cross-references

Assume every reader arrives directly from search and has never seen the portfolio, the example project, or another article. Open with the task, who needs it, and the result this article will help them achieve. Introduce the minimum project context and define unfamiliar services or terms locally.

For a tutorial, state prerequisites and tested versions, provide the required example files/data/configuration, explain each consequential step, and show how to verify the result. Supply the complete path for the promised task. Readers should not need a private repository or an earlier post to reconstruct missing setup. Basic language/framework knowledge may be a stated prerequisite; a sibling blog post must not be one.

For a case study, provide enough context to understand the decision, alternatives actually considered, mechanism, and consequences. Do not imply a narrative is a copy-and-run tutorial unless its example has been verified that way.

Related links offer a deeper treatment of a side question. They must not replace an essential instruction, definition, safety/correctness rule, or failure-handling explanation. Repeat a short explanation when readers need it; avoid repeating whole walkthroughs. A link to the overview is optional even when the same project provides the example.

Use descriptive link text that names the destination's subject. Link to published articles only. The overview can gain links in relevant paragraphs as follow-ups appear; avoid a list of broken or coming-soon links. Read next recommendations supplement these contextual links.

## Scope review before drafting

Write one sentence stating the reader question and one stating the outcome. List what the article covers and which adjacent subjects receive only a brief explanation. Merge topics that share the same task and example; split when they need different outcomes, correctness rules, or substantial independent walkthroughs. Do not create one article per tool by default, and do not force distinct failure modes into one oversized post.

Depth follows the promised outcome. Keep the common path understandable, explain the edge cases that materially affect it, and omit unrelated infrastructure. Do not add architectural layers merely to make an example look production ready. Do not remove transaction, synchronisation, privacy, or recovery constraints merely to make it look simple.

Before publication, apply the cold-reader check:

- Can a reader explain the problem and why the approach fits without opening another article?
- Are prerequisites, terms, example data, and configuration available where needed?
- For a tutorial, can the reader complete and verify the promised task using this article and normal official setup references?
- If every sibling-article link disappeared, would the main explanation or tutorial still work?
- Do links add useful optional depth, and do their published destinations match their labels?
- Does the example explain relevant limitations without claiming every project needs the same design?

## Sentence-level editing

Write as Akeem explaining his work to another engineer. Prefer concrete verbs and name the thing that changed. Use ordinary punctuation; avoid em dashes as a sentence habit. Keep necessary technical hyphens and date ranges. Cut generic praise, stock transitions, repeated three-part lists, and abstract phrases such as “full-stack delivery” when a specific action says more. Vary sentence length naturally without adding anecdotes, dialogue, measurements, or claims that Akeem has not supplied. Do not force every paragraph into the same problem-solution-lesson pattern.

## Concision pass

Use one recognisable task to carry the explanation. Keep only the background, example, tradeoff, and failure cases needed to understand that task. Remove side topics that do not change the reader's decision or ability to follow the mechanism. Prefer a short example over a second abstract explanation. Explain essential terms locally; offer optional documentation links for deeper API detail. A shorter article must still state its correctness boundaries. Review one article at a time before moving to the next.
