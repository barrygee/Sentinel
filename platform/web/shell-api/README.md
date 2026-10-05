# @sentinel/shell-api

The contract between the Sentinel shell and its sections (P4 of
[`docs/plans/section-containers.md`](../../../docs/plans/section-containers.md)).
Under Module Federation it is a host-provided singleton, so every section remote
sees the same registries and the same Pinia stores as the shell.

Import as `@sentinel/shell-api/<path>` — `.vue` with its extension, `.ts` without:

| Path                                                                                                               | Contents                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell/*`                                                                                                          | Registries (`sectionRegistry`, `sidebarRegistry`, `settingsRegistry`, `notificationRegistry`, `footerRegistry`, `backgroundServices`, `settingsHydration`) and capabilities (`capabilities`, `radioCapability`, `radioSitesCapability`, `useRadio`) |
| `stores/*`                                                                                                         | Core Pinia stores: `app`, `settings`, `theme`, `basemap`, `notifications`, `offlineMaps`, `sentrySites`, `tracking`, plus the `_persist` helper                                                                                                     |
| `services/*`                                                                                                       | `settingsApi`, `offlineMapsApi`                                                                                                                                                                                                                     |
| `types/settings`, `constants/sidebarPanes`, `utils/*`, `composables/useNotificationSound`                          | What the above depend on                                                                                                                                                                                                                            |
| `settings/*`                                                                                                       | The settings kit sections build on: `useStagedSetting`, `BaseToggleSetting.vue`, `BaseNumberSetting.vue`, `JsonDataControl.vue`, `OnlineSourceControl.vue`, `SourceOverrideControl.vue`, `RadioSelect.vue`                                          |
| `overlays/NoUrlOverlay.vue`, `composables/useConnectivity`, `composables/useSidebarPaneTarget`, `utils/domainKeys` | Shell chrome sections render or read                                                                                                                                                                                                                |
| `testing/fakeRadio`                                                                                                | A stand-in `radio` capability for specs (test-only)                                                                                                                                                                                                 |

Section code never lives here. The composition root that imports the sections
(`frontend/vue/src/shell/sections.ts`) stays in the SPA.

```bash
npm run lint -w @sentinel/shell-api
npm run typecheck -w @sentinel/shell-api
npm run test:coverage -w @sentinel/shell-api   # 100% coverage gate
```
