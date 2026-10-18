# Set up for development

From a fresh clone to editing with live reload. Branches and commits: [Contributing](../../CONTRIBUTING.md).

## You need

- Docker with Docker Compose
- [nvm](https://github.com/nvm-sh/nvm) with Node 24 or 25 and npm 11 (`.nvmrc` says 24)
- [uv](https://docs.astral.sh/uv/) (it manages Python 3.12+)
- Git

## First time

```bash
git clone https://github.com/barrygee/Sentinel.git && cd Sentinel
nvm use && npm ci                 # every frontend package, plus the pre-commit hook
uv sync --project backend         # backend packages, for tests, lint and your editor
docker compose up --build -d      # http://localhost:8080
```

The wrong Node or npm fails with `EBADENGINE` on purpose.

After that, a `git pull` or merge that changes `package-lock.json` runs `npm ci` for you, and one that changes `backend/uv.lock` runs `uv sync --project backend` (the `.husky/post-merge` hook). If either fails, the hook prints the command to run yourself.

## The dev loop

- **Backend:** code is mounted into the containers with `uvicorn --reload`. Save a `.py` and that service restarts in a second or two (`docker compose logs -f <service>`).
- **Frontend:** `cd frontend/vue && npm run dev`, then open **http://localhost:5173**. Hot reload; API and WebSockets pass through to :8080.
- **What :8080 serves** is the committed `frontend/spa-dist/`. Rebuild with `cd frontend/vue && npm run build` and reload; commit it. The in-app docs are not in it: the `docs` service reads `docs/` from the checkout on each load, so an edited page shows on reload with no rebuild.
- **Rebuild images** only when dependencies change (`pyproject.toml`, `package.json`).

## Run less

```bash
docker compose up -d gateway sea           # core and one section
docker compose up -d gateway sdr radio     # SDR needs the hub
docker compose stop sea                    # see how the rest behave without it
```

## Two rules that save time

- **Install from the root** (`npm ci`); add an app dependency with `npm install <package> -w frontend/vue`. The root `package.json` is tooling, not the app.
- **Run `uv` from the root with `--project backend`.** `Missing required plugins: pytest-asyncio` means pytest is outside the backend venv: fix the command.

Turn on format-on-save (Prettier for TS/Vue, ruff for Python).
