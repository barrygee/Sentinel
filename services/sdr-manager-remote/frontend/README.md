# @sentinel/sdr-manager-remote

The **REMOTE SDR HOSTS** group of Settings › SDR Manager ([ADR 0007](../../../docs/adr/0007-sdr-manager.md)):
the SDR hosts the `sdr-manager-remote` service manages — this machine's own
sdr-manager-local, listed as "This machine", and SDR Manager hosts on other
machines — plus the `radioSites` capability the maps, Air's receiver picker and
the SDR section's DEVICES list read them through.

It is a Module Federation remote the `sdr-manager-remote` service serves from
`/remotes/sdr-manager-remote/`. Its `./register` entry (`src/register.ts`) adds
settings and a capability only, never a map section. It imports only
`@sentinel/ui`, `@sentinel/shell-api`, `@sentinel/map-kit` and its own files.

```bash
npm run lint -w @sentinel/sdr-manager-remote
npm run typecheck -w @sentinel/sdr-manager-remote
npm run test:coverage -w @sentinel/sdr-manager-remote   # 100% coverage gate
```
