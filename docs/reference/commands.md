# Commands cheat sheet

The commands you'll use most, in one place. Run them in the folder you installed Sentinel in. This page only lists them: each part links to the page that explains them.

## Run Sentinel

From [Quick start](../install.md) and [Check logs, health and backups](../operations.md):

```bash
docker compose up -d                      # start, or apply a change to .env
docker compose up --build -d              # first start, or after an upgrade
docker compose up -d gateway air sea      # only some sections
docker compose up -d --scale land=0       # everything except one
docker compose down                       # stop; your data is kept
docker compose restart sea                # restart one service
```

## Decoders

From [Install and run decoders](../decoders.md):

```bash
docker compose --profile all up -d --build                      # every decoder
docker compose --profile aprs up -d --build                     # one: voice-decoder, aprs, ais, adsb
docker compose up -d --build --no-deps aprs-decoder             # rebuild one decoder without restarting the app
docker compose --profile all down && docker compose up -d       # back to no decoders
```

## Check on it

From [Check logs, health and backups](../operations.md):

```bash
docker compose ps                         # every service should say (healthy)
docker compose logs -f app sea            # follow some logs
docker compose logs --since 10m radio     # the last ten minutes of one
curl -s http://localhost:8080/health      # core answers {"status":"ok", …}
```

## Upgrade

From [Upgrade Sentinel](../upgrading.md):

```bash
git pull
docker compose up --build -d
```

## Develop

From [Set up for development](../development/setup.md) and [Run tests and quality checks](../development/testing.md):

```bash
nvm use && npm ci                                   # once, and after a pull that changes package-lock.json
cd frontend/vue && npm run dev                      # frontend with hot reload on :5173
cd frontend/vue && npm run build                    # rebuild frontend/spa-dist/ (commit it)
uv run --project backend pytest                     # backend tests (from the repo root)
cd frontend/vue && npm run test:coverage            # app tests, 100% coverage
cd frontend/vue && npm run test:e2e                 # browser tests over the built app
npm run web-packages -- test:coverage               # every shared and section package
npm run check:doc-links                             # every link in docs/ resolves
```
