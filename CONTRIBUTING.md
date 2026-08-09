# Contributing to Asterion

## Development expectations

1. Start from a passing `npm run check`.
2. Put business policy in `packages/core`; do not duplicate it in a route or component.
3. Add a focused test when changing a transition, permission, planner rule, or persistence behavior.
4. Preserve organization boundaries in every new storage method and API route.
5. Explain any schema/RLS change and its rollout plan in the pull request.

## Pull-request checklist

- [ ] `npm run check` passes locally.
- [ ] Inputs are validated at the HTTP boundary.
- [ ] A role and tenant boundary has been considered.
- [ ] Audit/outbox behavior is correct for the mutation.
- [ ] Documentation and operational notes are updated when behavior changes.

## Commit style

Use concise imperative subjects, for example `feat(core): add permit hold transition` or `fix(api): return dispatch conflict metadata`. Keep refactors separate from behavior changes when practical.
