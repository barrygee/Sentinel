# @sentinel/section-space

The **Space** section of Sentinel — Satellites: the globe view, SGP4 tracks and ground tracks, pass predictions and pass/auto-tune alerts, TLE settings.

It registers itself with the shell in `src/section.ts` (routes, nav, sidebar,
settings, notifications, capabilities) and imports only `@sentinel/ui`,
`@sentinel/shell-api`, `@sentinel/map-kit` and its own files — never another
section or the SPA. In P4 of
[`docs/plans/section-containers.md`](../../../../docs/plans/section-containers.md)
it becomes a Module Federation remote the shell loads at runtime.

```bash
npm run lint -w @sentinel/section-space
npm run typecheck -w @sentinel/section-space
npm run test:coverage -w @sentinel/section-space   # 100% coverage gate
```
