# 0007. SDR Manager: Sentry absorbed into Sentinel as two containers

Date: 2026-10-21
Status: accepted

## Context

Running Sentinel with local dongles took two apps. **Sentry**, a separate
repository, managed the RTL-SDR dongles plugged into a machine. It was a root,
privileged, host-networked FastAPI app that discovered dongles, gave each a
stable identity and ran one `rtl_tcp` + relay pair per dongle. It also handled
reservations, EEPROM serial flashing, config export/import and a Wi-Fi hotspot.
Sentinel only managed Sentry hosts remotely. That code lived inside the radio
hub (the `sentry_hosts` table, `SentryClient`, the fleet poller and the
`hub.sentry.*` lease responders), and its screens sat in the SDR section's
Settings, so host management disappeared whenever the SDR section was off.

The owner asked for one place to manage SDRs, whether local or remote, inside
Sentinel. They also asked for a lightweight mode that only shares a machine's
dongles with other Sentinels, and for Mac support. The Sentry repository is to
be absorbed and then archived. There are no existing users to migrate.

The full design, delivery plan and test plan are in
[`docs/plans/sdr-manager.md`](../plans/sdr-manager.md). This record keeps the
decisions and why they were made.

## Decision

**Two containers behind one Settings section.**

- **`sdr-manager-local`** manages the dongles plugged into this machine. It is
  Sentry's composition root, moved over unchanged into
  `sentinel_sdr_manager_local` and wrapped in `create_service()`. It runs in
  full mode behind the `sdr-manager-local` compose profile, and on its own in
  SDR Manager-only mode.
- **`sdr-manager-remote`** manages SDR hosts on other machines and links this
  machine's devices into Sentinel's radios. It takes the Sentry host model,
  client, poller, lease responders and router out of the radio hub. It always
  runs in full mode.
- **One section, two contributors.** Both register the Settings section
  `sdr-manager` ("SDR Manager"). Each adds its own group, THIS MACHINE or
  REMOTE SDR HOSTS, which shows only while its container runs. To allow this,
  `registerSettingsSection` accepts an identical re-registration and still
  throws on a conflicting one. No SDR Manager screen lives in core.

**The SDR Manager API is the contract between them.** `sdr-manager-remote`
manages every machine, this one included, through the HTTP API on `:8000` that
`sdr-manager-local` serves. It is versioned (version 1), renamed from Sentry's
(`X-Sdr-Manager-*` headers, the `sdr_manager_session` cookie) and pinned by a
contract test that runs the real client against the real server in fake
hardware mode. The gateway doesn't strip prefixes, so the same app is mounted
at `/api/sdr-manager/local` for the gateway and at `/api` for remote managers.

**The radio hub keeps streams, decoding and radios only.** Leases move to
`sdr-manager.remote.reservation.*` on the bus. The hub learns about claims from
`sdr-manager.claims.*` events, so it still never retunes a claimed dongle, and
it asks `sdr-manager-remote` for a host snapshot to grey out unavailable
devices, failing open to "unknown". Air requests leases on the new subjects.

**Exceptions to the platform's rules, each limited to `sdr-manager-local`:**

- **Root, privileged and host-networked.** It needs `/dev/bus/usb`, dbus for
  the hotspot and one port pair per dongle. The privilege applies only to its
  own image and opt-in profile; `sdr-manager-remote` is unprivileged like every
  other section.
- **Serves before core answers.** `wait_for_core` blocks forever, and dongles
  must keep streaming while core is down. `create_service()` gains an opt-in
  `serve_before_core`, off by default for every other service.
- **No NATS.** It talks to core over HTTPS through the `:8443` service
  entrypoint, and to `sdr-manager-remote` only through the SDR Manager API.
- **A native process on macOS.** Docker Desktop has no USB passthrough and no
  host networking, and its USB/IP option is experimental and unproven at
  RTL-SDR data rates. On a Mac it runs from the `sdr-manager-local` command
  (with a LaunchAgent) using `ioreg` discovery and Homebrew's librtlsdr.
  Everything else stays in Docker.
- **A service bearer alongside the console password.** Only
  `sdr-manager-remote` may use it, checked by hash against the accepted-callers
  file through a new `manages_local_sdrs` access flag. Other machines' managers
  sign in with the console password.

**"This machine" is a host row that core's registry keeps current.**
`sdr-manager-remote` polls a token-gated registry listing for
`sdr-manager-local` and upserts one `is_local` host row with service auth. When
the local container goes away the row is disabled, never deleted, because
radios reference it, and it can't be deleted or readdressed by hand.

**Setup is picked once in `.env`.** Five recipes (`COMPOSE_PROFILES`,
`COMPOSE_FILE`, `SDR_MANAGER_LOCAL_NATIVE`) cover full mode with or without
local dongles, SDR Manager-only mode, and both on a Mac. Every machine is then
started with `docker compose up -d`. There is no launcher script.

**Naming.** Every new name includes `sdr-manager`, and the leftover `sentry`
identifiers (radio fields, the range-ring origin, the sites store and map
control, the ADS-B decoder variable) are renamed in their own PR. Sentry's
fixed-location feature is not ported: Sentinel's own location setting is used.

## Consequences

- **Host management no longer depends on the SDR section.** Turning SDR off
  leaves SDR Manager in Settings, and the hub shrinks to radios, streams and
  decoding.
- **One repository, one release.** Sentry's code, tests and image move here.
  The Sentry repository is archived after SDR Manager-only mode ships and a Pi
  has soaked on it.
- **Leases now span two services.** This is the riskiest part (delivery PR 4).
  The order of claim events matters. The claim TTL bounds any stale state, and
  the e2e ADS-B claim test gates the change.
- **A privileged container in the deployment** when the profile is on. The
  limits above keep it to one opt-in image. Its `:8000` and per-dongle ports
  face the network: the UI warns until a console password is set, the docs
  recommend a firewall, and the unauthenticated `/api/v1/sdrs` listing is
  documented as intended.
- **Containers reach the host through `host-gateway`.** `app`, `gateway`,
  `sdr-manager-remote` and the decoders get `extra_hosts`, and a host firewall
  can block that path. It is documented and logged clearly.
- **A second platform to support on macOS.** Hotplug there is poll-only
  (~2 s), a dongle moved to another USB port gets a new identity, and
  Homebrew's librtlsdr differs from the Linux build. `doctor` reports its
  version, and a beginner guide is tested on Apple-silicon and Intel Macs.
- **More contracts to maintain.** Two manifest kinds, new NATS users and
  subjects, a new access flag and the SDR Manager API version all have to stay
  in step. Goldens, the contract suite and the `.env.example` parity test fail
  when they don't.
