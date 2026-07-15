# Domain Docs

This is a single-context repository.

## Before exploring

Read these files when they exist:

- `CONTEXT.md` at the repository root
- Relevant ADRs under `docs/adr/`

If these files do not exist, proceed without flagging their absence or creating them upfront.

## File structure

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

The domain documentation is intentionally created lazily when a domain concept or architectural decision needs to be recorded.

## Use the glossary vocabulary

When an issue title, refactor proposal, hypothesis, or test name uses a domain concept, prefer the term defined in `CONTEXT.md`. If the required concept is not defined, treat that as a possible domain-modeling gap.

## Flag ADR conflicts

If a proposed change contradicts an existing ADR, surface the conflict explicitly instead of silently overriding it.
