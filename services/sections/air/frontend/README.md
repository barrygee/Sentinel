# @sentinel/section-air

The **Air** section of Sentinel — ADS-B aircraft: the Air map, live aircraft control, filters, overhead-alert zones, aircraft alerts and Air settings.

It registers itself with the shell in `src/section.ts` (routes, nav, sidebar,
settings, notifications, capabilities) and imports only `@sentinel/ui`,
`@sentinel/shell-api`, `@sentinel/map-kit` and its own files — never another
section or the SPA. In P4 of
[`docs/plans/section-containers.md`](../../../../docs/plans/section-containers.md)
it becomes a Module Federation remote the shell loads at runtime.

```bash
npm run lint -w @sentinel/section-air
npm run typecheck -w @sentinel/section-air
npm run test:coverage -w @sentinel/section-air   # 100% coverage gate
```
