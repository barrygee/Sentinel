# Plan: fix the code first, then decide whether to merge the section containers

**Status:** proposed, not started · **Date:** 2026-11-03 · **Cut against:** `main` @ `d18f53e3` · decision record: new ADR superseding 0006, only if Stage 3 goes ahead
**Scope:** Stage 1 changes no user-visible behaviour and no container count. Stage 3 is optional and needs an owner decision at Stage 2.

## 0. Summary

**Is one container per service the best approach?** Partly. 12 of the 19 compose services sit on real boundaries and
should stay separate. The other 7 (`space`, `land`, `air`, `sea`, `sdr`, `docs`, `sdr-manager-remote`) are separate for
organisational reasons only, and could share one container.

**Can it be done with fewer containers?** Yes: the default stack could go from 13 running containers to 7, without a
major rewrite. The code is already modular. Sections import shared code rather than copying it, ten import-linter
contracts gate CI, and `tests/in_process_app.py` already composes almost every service in one process.

**Should it be?** Not yet. Merging is a runtime gain, not a code gain: it removes about 500 lines and saves an estimated
0.6–0.8 GiB, but it puts seven services in one crash domain and goes back on two recent owner decisions: one container
per section (ADR 0006, 2026-09-30), and separate services as the only deployment mode (revised 2026-10-13, after the
planned `services/dev-all/` composer was dropped without being built). Stage 3's composer is essentially that idea. The
problems most worth fixing are not caused by the container count, so Stage 1 fixes those first. Stage 2 then measures on
real hardware, and the merge is decided on that evidence.

## 1. Service decisions

| Service | Decision | Why |
| --- | --- | --- |
| `app` | Keep | Sole `gateway_admin` client; holds all settings |
| `gateway` | Keep | Caddy; the guard trusts its fixed address |
| `nats` | Keep | Hub traffic crosses hosts |
| `redis` | Keep | About 6 MiB; shared bans, unreachable from decoders |
| `service-credentials` | Keep | One-shot; the CA key stays here |
| `radio` | Keep | Runs on the radio host, next to the dongles (about 33 Mbps IQ per dongle) |
| `sdr-manager-local` | Keep | Root, privileged, host network, USB |
| `voice-decoder` | Keep | Patent-encumbered mbelib |
| `aprs-decoder`, `ais-decoder` | Keep | Untrusted RF input; different Direwolf builds |
| `adsb-decoder` | Keep | Native readsb, opt-in |
| `stub-decoder` | Keep | Opt-in test double |
| `space`, `land`, `air`, `sea`, `sdr` | Candidate to merge | Same image; differ only by command, env and volumes; no section-to-section NATS subject |
| `docs` | Candidate to merge | 182 lines of Python, no database, paying a full runtime cost |
| `sdr-manager-remote` | Candidate to merge | Unprivileged (ADR 0007) |

## 2. What ADR 0006 delivered

| Goal | Result |
| --- | --- |
| Leave a section out | Delivered and tested in CI |
| Move a service to another host | Delivered, for the radio hub only |
| Upgrade a section on its own | Not delivered: images share all 35 layers and one `uv.lock`, and there are no per-service tags |
| 60–90 MB per Python service | Measured 138–140 MiB idle. All seven imported in one interpreter took 104 MiB, against 97–100 MiB each alone, so most of the cost is duplicated runtime |

## 3. Stage 1: do regardless of the merge decision

Each row is independent and safe as its own PR. The order puts the security fix first.

| # | Change | Behaviour held by | Size |
| --- | --- | --- | --- |
| 1 | **Security.** Mount `sentinel_db` read-only into `space`, `land`, `air`, `sea` and `sdr`. It holds the AISStream key, and the import's read-only open was enforced only in application code | Tested: the legacy import's read-only ATTACH works on a `:ro` mount with a WAL database, with a live writer and after it exits. On branch `fix/security-quick-fixes` | Done, uncommitted |
| 2 | **Security.** Add `:ro` to the `&backend-code` anchor, and delete the `./backend` mounts on `sdr-manager-local` and `service-credentials`. `:ro` alone isn't enough: `app` keeps write access because it writes `sentinel_config.json` there, and `sdr-manager-local` ran that code as root. Both images contain the code, so those two services now need a rebuild after a `backend/` edit | Live reload only reads, so the `docker compose up` dev loop is unchanged for the sections. On branch `fix/security-quick-fixes` | Done, uncommitted |
| 3 | Run `compute_passes` in `asyncio.to_thread`. It runs inline in async routes and stalls the Space event loop today | Same results | Tiny |
| 4 | Reuse one HTTP client in `settings_client.py`, then cache reads, invalidated by `settings.changed.<ns>` with a short TTL as a backstop. `app` served 424 `/api/settings/air` reads in 10 minutes, each on a new connection (`settings_client.py:99`). NATS fails open, so a missed event must not leave a value stale for good, and services not subscribed to their namespace need adding to `nats_permissions.py` | Same values, at worst one TTL late | Small |
| 5 | Shared decoder supervisor for `HubLink`, `post_event` and `run_direwolf_once`, and widen the Docker contexts | Same wire contract. CI doesn't build these images, so build locally | About −300 lines, 2 PRs |
| 6 | Add layer and independence contracts, and move `internal_auth` and `instance_identity` to platform. Add `sentinel_docs` to the section contracts | Import paths only | About 200 lines, 2 PRs |
| 7 | Inject the settings store and session factory into platform | Same two settings modes | About 150 lines |
| 8 | Move section tuning out of `backend/config.py` (511 lines, 128 fields) into section packages, following `sentinel_sdr_manager_remote/config.py` | Same env names and defaults | About 300 lines moved, 1 PR per section |
| 9 | Shared map rail in map-kit for the four `*SideMenu.vue` files, and one Space stylesheet for `SpaceFilter.vue` and `SpacePasses` | Playwright and axe; the 100% coverage gate needs specs at commit time | About −700 lines, 2–3 PRs |

Rows 6–8 are also what make Stage 3 cheap, so nothing is wasted if the merge goes ahead.

**Separate decision: `--reload` in deployments.** `docker compose up` is both the dev loop and the deploy path, so
deployments run `--reload` with code mounted from the checkout. Moving that into a dev override is cleaner, but it
changes how code reaches a deployment: plain code changes would need a rebuild, and CLAUDE.md, the README and
`docs/development/` would all need updating. Row 2 closes the main security gap without this, so it can wait. `app`
itself keeps a writable `./backend`; moving `sentinel_config.json` out with `APP_CONFIG_PATH` would let that go too.

Tests are not scheduled during the build. They are decided at commit/push time, on owner confirmation.

## 4. Stage 2: measure, then decide

1. Run the full stack on the smallest real target (a Pi 4 or 5) and record memory, startup time and CPU. All figures
   above come from Docker Desktop on arm64 with 8 CPUs.
2. Find out whether anyone actually stops individual sections in practice.
3. Spike two unknowns, without merging: do per-table session binds work with aiosqlite, and does the combined lifespan
   boot? `tests/in_process_app.py` skips lifespan and turns the guard off, so no deployment exercises this today.

**Decision rule:** merge if memory is a real constraint on a target host. If it isn't, stop here and record why in ADR
0006. There is no smaller shortcut through `app`: folding `docs` in would save one runtime, but it breaks "core never
hosts a section" (ADR 0006, `test_core_entry_point.py`) for about 138 MiB.

## 5. Stage 3: optional merge

Target: 7 default containers (`app`, `gateway`, `sections`, `radio`, `nats`, `redis`, one-shot `service-credentials`).
Compose goes from 19 services to 13. Opt-in services are unchanged. About 5–6 PRs.

Two choices settle where the reviewers disagreed:

- **A new `sections` container, not loading into `app`.** This keeps ADR 0006's rule that core never hosts a section,
  which import-linter and `test_core_entry_point.py` enforce. Sections subscribe to bus events at import, so a copy in
  core would handle events meant for the service. A section fault also can't take down the shell, the settings store
  or the only `gateway_admin` client. This costs one more container than loading into `app`.
- **Keep the separate SQLite files, with per-table session binds.** Merging into one file risks stale pre-split rows
  winning silently, because `import_legacy_tables` skips populated tables and `sentinel.db` keeps old copies. It would
  also add write contention and make the change harder to reverse. The cost is that `database.py:26` allows one engine,
  and there are 74 non-test `AsyncSessionLocal` references across 21 files to review (31 in the sections).

Steps:

1. Move the legacy-import `_prepare` work out of `service.py` into one shared per-package descriptor.
2. Add a `sections` composer outside `backend`, modelled on `tests/in_process_app.py` and selected by
   `SENTINEL_SECTIONS`. `create_service` takes several manifests, and `registers_as` becomes a set.
3. Add the session binds, and pin the legacy recordings path (`directory == ""`), which derives from the parent of
   `DB_PATH`.
4. Give the merged process one identity. It needs its own NATS user with the union of the seven subject lists
   (`nats_permissions.py`), a `service_access.py` entry covering their rights, and one credentials folder. The
   `core` NATS user can't be reused here, because it is allowed every subject.
5. Update compose, replace `--scale` section removal, and rework the `gateway-smoke` legs and `test_standalone_*`
   (2,773 lines pin today's topology).
6. Write the ADR superseding 0006, and update CLAUDE.md, `docs/operations.md` and the README.

**What changes for the owner:**

- Adding or removing a section becomes an env change plus a restart of all merged sections, not a container start/stop.
- With `raise_errors=True`, a failing local section handler turns a settings PUT into a 500.

**Risks:**

- One event loop and one crash domain: any fault takes all seven down.
- `bus.publish()` awaits local handlers synchronously, so a slow handler in one section now blocks a publisher in
  another. Today that hop goes over NATS.
- Every restart reconnects AISStream, and reconnect storms can lock the key out.
- Sea's key and SDR's IQ rights become process-wide.
- Rate-limit behaviour after the merge is unknown.

## 6. Not verified

- Tests and `lint-imports` were not run for this review, so it's unknown whether the contracts pass with indirect
  imports enforced.
- A full `docker compose up` with the row 1–2 changes: each part was tested in throwaway containers, not the stack as a
  whole. A search found no section writing under `/app/backend`, and the config-file sync is core-only.
- Memory under load once merged: the 104 MiB figure is import-only, on macOS.
- `air`'s 893 MiB cgroup figure against about 178 MB RSS is probably page cache, but this isn't confirmed.
- Production `sentinel.db` contents: only the local file was inspected.
- Sentinel's own licence: there is no root `LICENSE`, so GPL separation wasn't assessed.
