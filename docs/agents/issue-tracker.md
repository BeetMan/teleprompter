# Issue tracker: GitHub

Issues and product requirements for this repository live as GitHub Issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --comments`
- **List issues**: `gh issue list --state open`
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply a label**: `gh issue edit <number> --add-label "..."`
- **Remove a label**: `gh issue edit <number> --remove-label "..."`
- **Close an issue**: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`; the `gh` CLI can use the current clone automatically.

## Pull requests as a triage surface

PRs as a request surface: no. External pull requests are not included in the issue triage queue by default.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
