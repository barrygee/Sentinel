# @sentinel/ui

Sentinel's shared UI primitives — the layer every section and the shell build on.
Depends on nothing but Vue, so it can be shared as a federation singleton (P4 of
[`docs/plans/section-containers.md`](../../../docs/plans/section-containers.md)).

| Entry                         | Contents                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `@sentinel/ui/base/*.vue`     | `Base*` components, `IconRail`, `IconRailAccordion`                                                              |
| `@sentinel/ui/icons/*.vue`    | Generic glyphs (bell, chevron, radio, terrain, …)                                                                |
| `@sentinel/ui/overlays/*.vue` | `NoDataOverlay`, `MapNoticeBanner`                                                                               |
| `@sentinel/ui/utils/*`        | `aprsSymbols` (the APRS symbol table `AprsSymbol` draws)                                                         |
| `@sentinel/ui/composables/*`  | DOM helpers: `useDisclosure`, `useDocumentEvent`, `useWindowEvent`, `useTeleportedMenu`, `useRadioGroupKeyboard` |

Settings-bound controls (`BaseToggleSetting`, `BaseNumberSetting`, …) live in
`@sentinel/shell-api/settings/*`: they persist through the settings API, which is
shell territory.

Source-only package (no build step): consumers compile it with their own Vite.

```bash
npm run lint -w @sentinel/ui
npm run typecheck -w @sentinel/ui
npm run test:coverage -w @sentinel/ui   # 100% coverage gate
```
