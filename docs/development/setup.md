# Set up for development

Use this page to go from a fresh clone to editing Sentinel with live reload. Branches, commits and pull requests are in [Contributing](../../CONTRIBUTING.md); tests and checks are in [Run tests and quality checks](testing.md).

## Before you start

| Tool | Version | Used for |
|---|---|---|
| Docker with Docker Compose | recent | Running Sentinel. Every service runs in a container, even while you develop. |
| [nvm](https://github.com/nvm-sh/nvm) and Node.js | Node 24 or 25 with npm 11 (`.nvmrc` says 24) | The frontend and its tests |
| [uv](https://docs.astral.sh/uv/) | recent | The backend's Python (3.12 or newer), its packages and its tests |
| Git | recent | — |

You don't need Python or pytest installed globally: uv manages them. Run every `uv` command from the repo root with `--project backend` (see [Two rules that save time](#two-rules-that-save-time)).

## First-time set-up

1. Clone the repo and enter it:

   ```bash
   git clone https://github.com/barrygee/Sentinel.git
   cd Sentinel
   ```

2. Switch to the pinned Node version, then install every frontend package. This also installs the pre-commit hook:

   ```bash
   nvm use
   npm ci
   ```

   An install under the wrong Node or npm version fails with `EBADENGINE` on purpose, so the lockfile always matches CI.

3. Install the backend's packages on your computer. Sentinel itself runs in Docker; this local copy is for the backend tests, lint and your editor:

   ```bash
   uv sync --project backend
   ```

4. Start Sentinel:

   ```bash
   docker compose up --build -d
   ```

   Open **http://localhost:8080** and check it works. No keys or passwords are needed.

## The dev loop

The containers are set up for development: your code is mounted into them, so you don't rebuild images while you work.

**Backend.** Every Python service runs with live reload. Save a `.py` file under `backend/` or `services/*/backend/` and that service restarts itself in a second or two. Watch it with `docker compose logs -f <service>`.

**Frontend.** Run the Vite dev server in a second terminal and open **http://localhost:5173**:

```bash
cd frontend/vue && npm run dev
```

Vite serves the shell and every section package with hot reload (changes appear without a page reload), and passes API and WebSocket calls through to the stack on :8080.

**What :8080 serves** is the built app in `frontend/spa-dist/`, which is committed. To see a frontend change there, or to ship one, rebuild it and commit the result:

```bash
cd frontend/vue && npm run build
```

Then reload the browser; no restart is needed. The docs are bundled into the app too, so a docs change needs the same rebuild.

**Rebuild the images** (`docker compose up --build -d`) only when dependencies change (`pyproject.toml`, `package.json`).

How all of this is wired is in [How Sentinel runs in Docker](../architecture/docker.md#how-your-edits-reach-the-running-app).

## Run one section while developing

To work on one section with less running, start core with only that section:

```bash
docker compose up -d gateway sea          # core and Sea
docker compose up -d gateway sdr radio    # SDR needs the radio hub for live radios
```

Its code reloads live as usual. The shell shows only the sections that are running.

To stop one service while you test how the rest behave without it: `docker compose stop sea`. Start it again with `docker compose up -d sea`.

## Two rules that save time

- **The app is `frontend/vue/` and the section packages.** The root `package.json` is the workspace root and holds repo-wide tooling (lint for config files, the full-stack browser tests, the pre-commit hook). It is not the app. Install from the root (`npm ci`); add a package to the app with `npm install <package> -w frontend/vue`.
- **Run `uv` from the repo root with `--project backend`.** The backend's `pyproject.toml` is in `backend/`, so a bare `uv run` from the root finds the wrong Python. If pytest says `Missing required plugins: pytest-asyncio`, it is running outside the backend's environment: fix the command, don't install the plugin globally.

## Your editor

Turn on format-on-save with Prettier for TypeScript and Vue, and ruff for Python, using the repo's config. The pre-commit hook formats and lints staged files anyway, but saving formatted saves a round trip.

## Next

- [Find your way around the code](code-map.md)
- [Run tests and quality checks](testing.md)
- [How to…](how-to.md) add a setting, a section, a decoder or a map control
