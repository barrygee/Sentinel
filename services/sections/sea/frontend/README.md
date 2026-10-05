# @sentinel/section-sea

The **Sea** section of Sentinel — AIS vessels: the Sea map, vessel tracks and shipping lanes, AISStream or off-grid SDR decode, Sea settings.

It registers itself with the shell in `src/section.ts` (routes, nav, sidebar,
settings, notifications, capabilities) and imports only `@sentinel/ui`,
`@sentinel/shell-api`, `@sentinel/map-kit` and its own files — never another
section or the SPA. In P4 of
[`docs/plans/section-containers.md`](../../../../docs/plans/section-containers.md)
it becomes a Module Federation remote the shell loads at runtime.

```bash
npm run lint -w @sentinel/section-sea
npm run typecheck -w @sentinel/section-sea
npm run test:coverage -w @sentinel/section-sea   # 100% coverage gate
```
