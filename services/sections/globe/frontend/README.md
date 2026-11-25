# @sentinel/section-globe

The optional **GLOBE** section of Sentinel: a 3D globe (the look of the
sentinel-site header globe) showing live aircraft, satellites, vessels and APRS
stations, with a show/hide toggle per type.

It is off by default. Settings › App Settings › 3D Globe (`globe.enabled`)
shows it in the nav; its backend is the `globe` service
(`services/sections/globe/backend`), which `SENTINEL_GLOBE_REPLICAS=0` leaves
out entirely.

It registers itself with the shell in `src/section.ts` and imports only
`@sentinel/ui`, `@sentinel/shell-api` and its own files — never another section
or the SPA. Its view is loaded on the first visit (a lazy route), so a disabled
globe costs only its small register chunk.

```bash
npm run lint -w @sentinel/section-globe
npm run typecheck -w @sentinel/section-globe
npm run test:coverage -w @sentinel/section-globe   # 100% coverage gate
```
