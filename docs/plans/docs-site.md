# Documentation site (`/doc`): content plan

Status: **approved by the owner** (2026-10-15), after a content-design review.
Decisions in §8. Nothing here is built yet.

## 1. What we're making and why

A complete set of Sentinel documentation for people who have never seen the
project:

- **Someone who wants to use Sentinel**: get it running, understand what each
  section is for, and use it day to day, including off grid with their own
  radios. For a self-hosted app this is usually also the person who runs it.
- **A new developer** who wants to understand how the code and the running
  system fit together well enough to change them safely.

The documentation is shown **inside the app at `/doc`**, in the same visual
style as Settings, so it works offline like the rest of Sentinel. The source is
the markdown in this repository's `docs/` folder: one copy, readable on GitHub
and in the app.

## 2. Principles

1. **Task first.** Pages open with what the page helps you do, then get you
   doing it. Background comes after. Pages with prerequisites have a
   **Before you start** list.
2. **Say what it's for.** Every feature, setting and file is explained by the
   job it does for you ("Set this when you want…"), not only how to set it.
3. **One page, one job.** If a title needs "and", split the page.
4. **Start-up is never more than one page away.** The whole app, and each
   section on its own, has short numbered start-up steps (see 2.1 for where
   they live).
5. **Show, don't describe.** A screenshot where you have to find something on
   screen; a diagram where you have to understand how things connect. Never a
   screenshot of text. Neither is ever the only way to get the information.
6. **One owner per fact.** Each fact lives on one page (2.1); every other page
   links to it instead of repeating it.
7. **Works on GitHub too.** Plain markdown plus Mermaid; relative links between
   pages; images in `docs/images/`.

### 2.1 Who owns what

| Fact | Owning page | Others |
|---|---|---|
| Starting the whole app | `install.md` | README keeps the two commands and links here; CONTRIBUTING and CLAUDE.md link here |
| Starting one section | `install.md` (the commands) and that section page's **Start it** block | `development/setup.md` links to them |
| First settings to make | `install.md` | Welcome links to it |
| Development set-up and dev loop | `development/setup.md` | CONTRIBUTING links to it |
| Tests and quality gates | `development/testing.md` | CONTRIBUTING and CLAUDE.md link to it (CLAUDE.md may keep a command summary for the AI assistant) |
| Branches, commits, PRs | `CONTRIBUTING.md` | — |
| Upgrading | `upgrading.md` | everything else links to it |
| Problems inside a section | that section page's **Troubleshooting** | `troubleshooting.md` indexes them by symptom |
| Start-up and platform problems | `troubleshooting.md` | — |
| `.env` variables | `.env.example` (the source) | `configuration.md` groups and explains them, and links each to the page that needs it |
| Where recordings are saved | `use/sdr/record.md` | README keeps a short section (owner's request) linking to it; `operations.md` links to it |
| Ports and services | `reference/ports-and-services.md` | — |

A CI check fails on a broken relative link or `#anchor` in `docs/`, so links
stay correct as pages move (in PR D2).

### 2.2 Style guide

- Address the reader as "you", in the active voice.
- Steps are numbered and imperative, one action per step, about seven at
  most per list. Say what you should see after the important steps.
- Headings in sentence case. British English (Sentinel has UK features and
  users).
- No "simply", "just", "easy" or "obviously".
- UI labels exactly as the app shows them, capitals included, in bold:
  **APPLY CHANGES**, **RECORDINGS**. Paths with ›:
  **Settings › SDR › Recordings Folder**.
- Code blocks do one job each, with a line before saying what it does.
  Placeholders look like `<radio-host-name>`.
- Link text says where it goes; never "here" or "see this".
- No internal phase or PR codes (P7.4b, #481) on user pages.
- Define a term the first time it's used and link it to the glossary. Say
  "section", never "domain".
- Alt text says what to notice, not "screenshot of".
- Example data in screenshots and text is clearly fictional (callsigns,
  vessel names, stations).

## 3. Information architecture

The `/doc` navigation mirrors Settings: a rail of **groups** on the left, the
pages of the chosen group, then the page. Each group below is one rail entry,
in this order. ✱ marks a page that exists today and is reworked; everything
else is new.

### Get started

| Title | File | Contents |
|---|---|---|
| Welcome to Sentinel | `index.md` | A short overview: what Sentinel is and the five sections, one line each. |
| Quick start | `install.md` | Commands only, kept extremely simple: start everything, start one or several sections, add decoders, stop; the app config JSON (`sentinel_config.json` / **Application Config**); the four first settings. |

Owner's decision (2026-10-15, during D3): Get started must be extremely simple. The
former **Run only the sections you need** page is folded into Quick start as commands,
and **Find your way around the screen** moves to the top of **Use Sentinel**
(`use/interface.md`). Day-one detail lives on each section page.

### Things you can do

End-to-end walkthroughs that cross sections, each pulling the steps from
several pages into one order (linking to the owning pages for detail):

| Title | File |
|---|---|
| Run Sentinel with no internet | `tasks/no-internet.md` (puts the off-grid set-up in order: offline maps, radios, decoders, switching to **Off Grid**) |
| Catch a satellite pass and record it | `tasks/record-a-satellite-pass.md` |
| Get alerted to aircraft emergencies | `tasks/aircraft-emergency-alerts.md` |
| Find and listen to a local repeater | `tasks/listen-to-a-repeater.md` |
| Track ships off grid with your own radio | `tasks/track-ships-off-grid.md` |

### Use Sentinel

Every section page has the same shape, so you learn it once:
**What it's for** → **Start it** → **Before you start** (what you need) →
**Using it** (tasks, with screenshots) → **Off grid** → **Settings** (each
setting: what it does and when to change it) → **Troubleshooting**.

| Title | File | Use cases to cover |
|---|---|---|
| Air: aircraft (ADS-B) | `use/air.md` | Watching local air traffic; emergency squawk alerts (7700/7600/7500), even with no browser open; military and civil filters; off-grid ADS-B with your own dongle. |
| Space: satellites | `use/space.md` | Finding a satellite; passes over you; pass alerts and auto-tuning a radio for a pass; the day/night line. |
| Sea: ships (AIS) | `use/sea.md` | Shipping near you; tracks and shipping lanes; entering the AISStream key (one connection per key); off-grid AIS from your own radio. |
| Land: repeaters and APRS | `use/land.md` | Switching Land on; the UK repeater directory; APRS stations heard off air. |
| Add a radio | `use/sdr/add-a-radio.md` | What the SDR section gives you; rtl_tcp and Sentry radios; the radio panel at a glance. Screenshot: add-radio form. |
| Listen to a frequency | `use/sdr/listen.md` | Spectrum and waterfall, tuning, modes, bandwidth, squelch, band plan; audio keeps playing across sections. |
| Save and scan frequencies | `use/sdr/frequencies.md` | Saved frequencies, groups, scanning, range search. |
| Record what you hear | `use/sdr/record.md` | What recordings are for; WAV vs raw IQ and their sizes; where they're saved and why you'd change it; maximum length; downloading. |
| Decode digital signals | `use/sdr/decode.md` | Digital voice, APRS, AIS, ADS-B: what each is for, which dongle it needs, starting one. Opens with "This page is about using decoders; to install them see Install and run decoders; to see how they work see Decoding." |
| Alerts | `use/alerts.md` | What raises an alert; the bell and pop-ups; going to an alert's subject; alert settings. |
| Change the map look | `use/maps.md` | Map themes, terrain, range rings, Sentry sites. |
| Download maps for offline use | ✱ `use/offline-maps.md` | Choosing an area and depth; how much space it takes. |
| Change settings | `use/settings.md` | Settings are staged until **APPLY CHANGES**; finding a setting. |
| Edit the config file | `use/config-file.md` | The live `sentinel_config.json`: editing it by hand, uploading and downloading a config. |

### Set up and run

| Title | File | Contents |
|---|---|---|
| Environment variables (.env) | ✱ `configuration.md` | `.env.example` is the source; this page groups its variables by job and says what each is for. |
| Choose radios and hardware | `hardware.md` | Dongles, antennas, hosts; rtl_tcp; Sentry; one client per dongle; the Linux USB buffer fix. |
| Install and run decoders | ✱ `decoders.md` | Operator half: profiles, images, credentials, logs. Opening line links to the other two decoding pages. |
| Run the radios on a second machine | ✱ `radio-host.md` | Reworked to the template. |
| Check logs, health and backups | ✱ `operations.md` | Logs, health, where data lives, backups. |
| Troubleshooting | `troubleshooting.md` | Start-up and platform problems, then an index of every section's problems by symptom. |
| Upgrade Sentinel | `upgrading.md` | Upgrade steps plus one-off notes (e.g. radio-hub → radio). |

### How it works

| Title | File | Diagrams |
|---|---|---|
| System overview | `architecture/overview.md` | Containers and connections; one request's journey. |
| Docker and how Sentinel runs | `architecture/docker.md` | (added at the owner's request) Docker basics for a new developer; what compose starts; the image's build stages; volumes; ports; profiles; the dev loop. |
| Backend code | `architecture/backend.md` | (added) Packages, import rules, composition roots, module lifecycles. |
| Databases | `architecture/databases.md` | (added at the owner's request) How each SQLite database is set up, created and changed, seeded, edited, backed up; test databases. |
| Gateway and routing | `architecture/gateway.md` | Registration → route sync to Caddy; longest-prefix table. |
| Services and start-up | `architecture/services.md` | Start-up, waiting for core, registration; a section stopping or missing. |
| Event bus | `architecture/event-bus.md` | Local handlers then NATS; request/reply; subjects. |
| Data stores | `architecture/data-stores.md` | Every database, volume and file: owner, contents, backup. Settings flow and config-file sync. |
| Caching | `architecture/caching.md` | Fresh/stale/miss; ADS-B `X-Cache`; vessel snapshots; repeater cache; offline tile tiers. |
| Radios and the SDR pipeline | `architecture/sdr-pipeline.md` | rtl_tcp → broadcaster → FFT → WebSocket → waterfall and audio; recording and IQ transfer. |
| Decoding | `architecture/decoding.md` | Decoder life cycle; channel ownership; stereo AIS. Opening line links to the two other decoding pages. |
| Section data flows | `architecture/data-flows.md` | Air, Space, Sea (two sources, one store), Land. |
| Frontend | `architecture/frontend.md` | Shell, section remotes, shared packages; stores; Settings and Docs pages. |
| Security | `architecture/security.md` | Credentials, NATS users, TLS, who may do what, CSP. |

### Develop

| Title | File | Contents |
|---|---|---|
| Set up for development | `development/setup.md` | Tools (Docker, Node 24 via nvm, uv); the dev loop (compose with live reload + Vite hot reload); **run one section while developing** (`docker compose up -d gateway <section>`, live reload of that section's code). |
| Find your way around the code | `development/code-map.md` | Every top-level folder and package, one line each, with "go here to change X". |
| Run tests and quality checks | `development/testing.md` | Every gate, how to run it, the two e2e suites, coverage, common traps. |
| How to… | `development/how-to.md` | Add a setting; a section; a decoder kind; a bus subject; a map control; ship a frontend change (rebuild `spa-dist`). |
| Contribute | ✱ `CONTRIBUTING.md` (root) | Shrinks to branches, Conventional Commits and PRs; links to the pages above. |
| Design decisions | ✱ `adr/*` | Shown as-is, newest first. |

### Reference

| Title | File |
|---|---|
| Glossary | `reference/glossary.md` (ADS-B, AIS, APRS, IQ, dongle, rtl_tcp, Sentry, decoder, sidecar, squawk, TLE, tile, core, section, radio hub, gateway, Off Grid, …) |
| Ports and services | `reference/ports-and-services.md` (every container: what it does, its port, its data) |
| Commands cheat sheet | `reference/commands.md` |
| What's new | link to `CHANGELOG.md` on GitHub, labelled "(online only)" |

Built in D5 (2026-10-15): **What's new** is a one-paragraph page (`reference/whats-new.md`) linking the changelog, because the nav can't hold external links. The glossary moved out of `architecture/overview.md` into `reference/glossary.md`, the ports and profiles tables out of `architecture/docker.md` and `operations.md` into `reference/ports-and-services.md`, and the backup steps out of `architecture/databases.md` into `operations.md`, so each has one owner. Building images for other architectures moved into `hardware.md`.

**Not shown in `/doc`:** `docs/plans/*` (working design notes). `sections.md`
is replaced by the **Use Sentinel** pages. `README.md` stays the short GitHub
landing page: what Sentinel is, two commands to start, the recordings section,
and a link to the docs.

**Search:** full text of every page, ranked so title and heading matches come
first, with synonyms ("plane" → Air, "ship" → Sea, "ham" → Land and SDR,
"scanner" → SDR, "satellite" → Space). Results show the page, the heading
and a snippet, and go straight to that heading.

## 4. Diagrams

Mermaid in the markdown, so they render on GitHub and in the app and are edited
as text. Each diagram:

- has a one-sentence caption saying what to look at;
- is followed by its **text equivalent**: numbered steps after a sequence
  diagram, a list or table of parts and connections after a flowchart;
- renders as an SVG with `role="img"` and an `aria-label` from the caption;
- uses colours with AA contrast on the light content area.

| # | Diagram | Type | Page |
|---|---|---|---|
| D1 | Containers and connections | flowchart | overview |
| D2 | One browser request through the gateway | sequence | overview |
| D3 | Service start-up and registration | sequence | services |
| D4 | Route sync from registry to Caddy | sequence | gateway |
| D5 | Event bus: local then NATS, request/reply | flowchart | event-bus |
| D6 | Who owns which data store | flowchart | data-stores |
| D7 | A settings change: stage → APPLY → core → config file → services | sequence | data-stores |
| D8 | Upstream fetch: fresh, stale or miss | flowchart | caching |
| D9 | Offline map tile tiers | flowchart | caching |
| D10 | SDR pipeline: dongle to waterfall and speakers | flowchart | sdr-pipeline |
| D11 | Recording and IQ transfer | sequence | sdr-pipeline |
| D12 | Decoder life cycle | sequence | decoding |
| D13 | Air, including the squawk watcher | flowchart | data-flows |
| D14 | Sea: two sources, one store | flowchart | data-flows |
| D15 | Land: APRS and repeaters | flowchart | data-flows |
| D16 | Space: TLEs to passes and auto-tune | flowchart | data-flows |
| D17 | Frontend composition | flowchart | frontend |
| D18 | Trust boundaries and credentials | flowchart | security |
| D19 | Online or off-grid source selection | flowchart | no-internet task |
| D20 | One machine vs a second radio machine | flowchart | radio-host |

## 5. Screenshots

Taken by a script, never by hand, so they can be retaken whenever the UI
changes: a Playwright spec (`frontend/vue/e2e/docs-screenshots.spec.ts`, run on
demand, not part of the gating suite) drives the app against the e2e suite's
mocked API, with fixed fictional data and a fixed clock. Output:
`docs/images/<page>-<subject>.png` at desktop size, plus phone size where the
layout differs. Annotated shots use numbered callouts that match a numbered
list in the text.

Planned: first-run screen; "no data source" overlay; **My Location**; whole
screen (annotated); each section's map with data; Air emergency alert; Space
pass list; Sea vessel detail and entering the AISStream key; switching Land on;
Land repeaters; add-radio form; SDR radio panel, waterfall, frequencies,
**RECORDINGS** tab; Settings (App, a section, **Recordings Folder**); offline
map download; alerts; the **Docs** entry in Settings; a section on a phone.

## 6. How `/doc` works (for PR D2)

- **Route:** `/doc/<page path>` (e.g. `/doc/use/sdr/record`), a page like
  `/settings/<section>`: it leaves the current section (SDR audio plays on), and
  closing returns there. `/doc` opens the Welcome page. Opened from a **Docs**
  entry inside the Settings panel (owner's choice), and from links in Settings
  next to settings a page explains.
- **Content:** the markdown is bundled into the app at build time (Vite
  `import.meta.glob` over `docs/**/*.md` and `CONTRIBUTING.md`), so `/doc`
  works offline and needs no backend endpoint. Images are bundled as hashed
  assets. `docs/nav.json` gives groups, page order, titles and search synonyms.
- **Search:** a full-text index built at build time from the same markdown
  (split by heading), searched in the browser with a small client-side search
  library, so it works offline. The index is loaded only when `/doc` opens.
- **Rendering:** markdown → HTML with `markdown-it`, sanitised with
  `DOMPurify`; headings get anchors; relative `.md` links become `/doc/...`
  routes; code blocks get a copy button. Mermaid loads only on pages with a
  diagram (its own chunk) and renders to SVG.
- **Look:** the Settings panel's layout and design language (light content
  area, charcoal rail, square corners, single-column cards, dot accents),
  mobile first, WCAG 2.2 AA (landmarks, skip link, heading order, keyboard
  use, visible focus, reduced motion).

## 7. Delivery

| PR | Contents | Reviewed by |
|---|---|---|
| D1 | This plan | content designer (done), owner |
| D2 | `/doc` page: route, renderer, nav, search, Mermaid, styling, link check in CI, tests | UX designer, frontend developer, accessibility audit |
| D3 | Get started, Things you can do, Use Sentinel | content designer |
| D4 | How it works + diagrams | content designer; accuracy check against the code |
| D5 | Set up and run, Develop, Reference (reworking ✱ files; README/CONTRIBUTING trimmed to 2.1) | content designer |
| D6 | Screenshot script + images placed in pages | content designer, UX designer |

Every content PR is checked against the code (UI labels, commands, defaults),
and every command is run before it's documented.

## 8. Owner's decisions (2026-10-15)

1. The design decisions (ADRs) are shown in `/doc` under **Develop**.
2. The way into the docs is a **Docs** entry inside Settings (not a separate
   button beside the gear).
3. Search is full text from the first version.
4. The plan is approved; build starts with PR D2.
