# Upgrade

```bash
git pull
docker compose up --build -d      # add --profile … if you run decoders without COMPOSE_PROFILES
docker compose ps                 # everything (healthy)
```

Then hard-reload the browser (Ctrl+Shift+R, Cmd+Shift+R on macOS). Data is kept; databases update themselves.

- **What changed:** the [changelog](https://github.com/barrygee/Sentinel/blob/main/CHANGELOG.md), or `CHANGELOG.md` in your copy.
- **Want a way back?** [Back up](operations.md#back-up-or-restore-a-volume) first.
- **Go back:** `git checkout <commit>` then `docker compose up --build -d`. Return with `git checkout main && git pull`.

Check the one-off steps below for anything newer than your copy (`git log -1 --format=%cd`).

## One-off steps

### Radio hub renamed `radio-hub` → `radio` (October 2026)

Only if `docker volume ls` shows `…radio_hub_data`. Do it before starting the new version.

```bash
docker compose down
docker volume create --label com.docker.compose.project=sentinel \
  --label com.docker.compose.volume=radio_data sentinel_radio_data
docker run --rm -v sentinel_radio_hub_data:/from -v sentinel_radio_data:/to alpine \
  sh -c 'cp -a /from/. /to/ && cd /to && for file in radio-hub.db*; do mv "$file" "radio${file#radio-hub}"; done'
docker run --rm -v sentinel_service_credentials:/credentials alpine \
  mv /credentials/services /credentials/services-old
```

- Use your folder's name in place of `sentinel` if it differs.
- In `.env`, rename `SENTINEL_RADIO_HUB_REPLICAS` to `SENTINEL_RADIO_REPLICAS`.
- Upgrade as usual, then check `docker logs sentinel-radio`.
- Radio host: export and import its credentials again.
- Afterwards: `docker volume rm sentinel_radio_hub_data`.

### Every section is its own service (October 2026)

- Data moves itself on first start (`legacy import: copied N rows …`).
- Remove from `.env`: `SENTINEL_EXTERNAL_SERVICES`, `SENTINEL_RADIO_HUB_HOST`, `SENTINEL_JOIN_TOKEN`, `SENTINEL_DECODER_SECRET`, and section names in `COMPOSE_PROFILES`. Rename `NATS_SERVER_EXTRA_HOSTNAMES` to `SENTINEL_CORE_HOSTNAMES`.
- After a good start: `docker volume rm sentinel_nats_setup sentinel_join_token sentinel_decoder_secret`.
- Going back to an older version loses what was created since.

### Containers no longer run as root (October 2026)

Linux only: if your user isn't 1000, set `SENTINEL_RUNTIME_USER_ID` and `_GROUP_ID` in `.env`.
