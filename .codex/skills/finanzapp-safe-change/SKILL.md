---
name: finanzapp-safe-change
description: Use this skill for any FinanzApp task that touches multiple modules, backend/frontend integration, database-related code, or risks breaking existing behavior.
---

# FinanzApp Safe Change Skill

## Goal

Make changes safely, with minimal scope and clear verification.

## Before editing

1. Run or inspect:
   - git status
   - relevant package.json files
   - relevant components/services/helpers

2. Identify affected modules.
3. Avoid touching unrelated files.
4. Prefer small focused changes over broad rewrites.

## During implementation

- Reuse existing helpers when possible.
- Extract shared helpers only if logic is duplicated or cross-module.
- Do not rename public fields unless all usages are updated.
- Preserve backward compatibility with existing data.
- Avoid hardcoded IDs, user names, hogar names or dates.

## Database caution

If DB changes are required:
- create migration/script if the project uses migrations
- do not silently change schema assumptions
- keep existing data compatible
- document required manual steps

## API caution

If backend contracts change:
- update frontend calls
- update validations
- keep error messages clear
- avoid breaking existing endpoints unless explicitly requested

## Verification checklist

Before finishing:
- Run frontend build if frontend changed.
- Run backend checks if backend changed and commands are available.
- Check for obvious console/build errors.
- Check that no unrelated files were modified.
- Summarize:
  - files changed
  - behavior changed
  - commands run
  - anything not verified

## Git

Do not commit unless explicitly asked.
Do not push unless explicitly asked.