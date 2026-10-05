# @sentinel/section-land

The **Land** section of Sentinel — APRS stations (via the radio platform) and the UK repeater directory on the Land map, plus Land settings.

It registers itself with the shell in `src/section.ts` (routes, nav, sidebar,
settings, notifications, capabilities) and imports only `@sentinel/ui`,
`@sentinel/shell-api`, `@sentinel/map-kit` and its own files — never another
section or the SPA. In P4 of
[`docs/plans/section-containers.md`](../../../../docs/plans/section-containers.md)
it becomes a Module Federation remote the shell loads at runtime.

```bash
npm run lint -w @sentinel/section-land
npm run typecheck -w @sentinel/section-land
npm run test:coverage -w @sentinel/section-land   # 100% coverage gate
```
