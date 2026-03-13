---
name: git-unstaged-commit
description: Summarize unstaged git changes, stage relevant files, and create a conventional commit safely.
version: 1.0.0
---

# Git Unstaged Commit

Use this skill when the user asks to summarize current unstaged changes and commit them.

## Goal

- Inspect unstaged/untracked changes.
- Produce a concise, accurate summary of what changed and why.
- Stage relevant files.
- Create a safe Conventional Commit message.

## Required Workflow

1. Check repository state:
   - `git status --short`
   - `git diff`
   - `git log -5 --oneline`

2. Review scope and safety:
   - Ensure no obvious secrets are staged (`.env`, credentials, tokens).
   - If secrets appear, stop and warn the user.
   - Keep unrelated/generated files out of commit unless user asked for them.

3. Draft commit message:
   - Follow Conventional Commits: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`.
   - Keep subject under 70 chars.
   - Focus on intent/outcome (the "why").

4. Stage and commit:
   - Stage only relevant files.
   - Commit with the drafted message.
   - Run `git status --short` to verify the result.

5. Report back:
   - Summarize the changes in 3-6 bullets.
   - Include commit hash and commit title.
   - Mention any remaining unstaged/untracked files.

## Commit Message Guidelines

- Prefer single-scope, single-purpose commits.
- Use:
  - `feat(...)` for new capability.
  - `fix(...)` for bug fixes.
  - `chore(...)` for maintenance/non-functional updates.
- Example:
  - `feat(telegram): add admin approval card for users`

## Safety Rules

- Never use destructive git commands (`reset --hard`, force push).
- Do not amend existing commits unless explicitly requested.
- Do not push unless explicitly requested.
