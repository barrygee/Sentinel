# @sentinel/section-sdr

The **SDR** section of Sentinel — The radio engine and panels: spectrum/waterfall, audio, tuning, recordings, decoders, Sentry hosts; provides the `radio` and `radioSites` capabilities other sections use.

It registers itself with the shell in `src/section.ts` (routes, nav, sidebar,
settings, notifications, capabilities) and imports only `@sentinel/ui`,
`@sentinel/shell-api`, `@sentinel/map-kit` and its own files — never another
section or the SPA. In P4 of
[`docs/plans/section-containers.md`](../../../../docs/plans/section-containers.md)
it becomes a Module Federation remote the shell loads at runtime.

```bash
npm run lint -w @sentinel/section-sdr
npm run typecheck -w @sentinel/section-sdr
npm run test:coverage -w @sentinel/section-sdr   # 100% coverage gate
```
