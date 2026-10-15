# Upgrade Sentinel

Use this page to get the latest Sentinel. Most upgrades are two commands. A few changes need you to do something once by hand; they are listed under [One-off steps](#one-off-steps), newest first.

## Before you start

- Read what changed: [What's new](reference/whats-new.md).
- Check the [one-off steps](#one-off-steps) for anything newer than your copy. If you don't know how old your copy is, `git log -1 --format=%cd` shows the date of the version you have.
- If you'd like a way back, [back up your data](operations.md#back-up-a-volume) first.

## Upgrade

1. Get the new version, in the folder you installed Sentinel in:

   ```bash
   git pull
   ```

2. Rebuild and restart:

   ```bash
   docker compose up --build -d
   ```

   If you run decoders and haven't set `COMPOSE_PROFILES`, add your profiles, for example `docker compose --profile all up --build -d`.

3. Reload Sentinel in your browser. If the page looks half old, half new, force a full reload: Ctrl+Shift+R (Cmd+Shift+R on macOS).

4. Check that everything says **(healthy)**: `docker compose ps`.

Your settings, recordings and other data are on Docker volumes, so they are kept. Database changes are made automatically when each service starts.

## Go back to an older version

```bash
git log --oneline            # find the version you want
git checkout <commit>
docker compose up --build -d
```

To return to the latest version later, run `git checkout main && git pull`, then `docker compose up --build -d`.

Data you created on the newer version stays. If a [one-off step](#one-off-steps) says going back loses data, restore the backup you made before upgrading.

## One-off steps

### The radio hub is now called `radio` (October 2026)

The radio hub's container, volume and database were renamed from `radio-hub` to `radio`. Do this **before** you start the new version for the first time, or the hub starts with no Sentry hosts.

First check you need it: `docker volume ls` lists a volume ending in `radio_hub_data`. If it doesn't, skip this step.

1. Stop Sentinel (this keeps your data):

   ```bash
   docker compose down
   ```

2. Copy the hub's data into a volume with the new name, renaming its database files:

   ```bash
   docker volume create \
     --label com.docker.compose.project=sentinel \
     --label com.docker.compose.volume=radio_data \
     sentinel_radio_data
   docker run --rm -v sentinel_radio_hub_data:/from -v sentinel_radio_data:/to alpine \
     sh -c 'cp -a /from/. /to/ && cd /to && for file in radio-hub.db*; do mv "$file" "radio${file#radio-hub}"; done'
   ```

   If your Sentinel folder isn't called `sentinel`, use its name in place of `sentinel` in the volume names and the first label.

3. Move the old logins aside, so new ones are created in the new layout:

   ```bash
   docker run --rm -v sentinel_service_credentials:/credentials alpine \
     mv /credentials/services /credentials/services-old
   ```

4. In `.env`, rename `SENTINEL_RADIO_HUB_REPLICAS` to `SENTINEL_RADIO_REPLICAS`, if you have it.
5. Upgrade as usual: `git pull`, then `docker compose up --build -d`.
6. Check the hub's log: `docker logs sentinel-radio`. Core logs `registry: radio radio registered`.
7. If you use a radio host, [export and import its credentials again](radio-host.md#changing-things-later). Credentials files in the old layout are refused.

Once it works, you can delete the old volume: `docker volume rm sentinel_radio_hub_data`.

### Every section runs as its own service (October 2026)

Sentinel used to run as one container with one database. Each section, and the radio hub, now runs as its own service with its own database, and Sentinel only runs under Docker.

- **Your data comes across by itself.** On its first start, each service copies its tables out of the old `sentinel.db` and logs `legacy import: copied N rows into …`. SDR also copies its recordings' files. The old copies stay where they were.
- **Remove old `.env` lines.** These no longer do anything: `SENTINEL_EXTERNAL_SERVICES`, `SENTINEL_RADIO_HUB_HOST`, `SENTINEL_JOIN_TOKEN`, `SENTINEL_DECODER_SECRET`, and any section names in `COMPOSE_PROFILES` (keep the decoder profiles). Rename `NATS_SERVER_EXTRA_HOSTNAMES` to `SENTINEL_CORE_HOSTNAMES`.
- **Remove old volumes**, after the first successful start:

  ```bash
  docker volume rm sentinel_nats_setup sentinel_join_token sentinel_decoder_secret
  ```

- **Going back** to a version before this change loses what you created since: data made by a section's own service is only in that service's volume.

### Containers no longer run as root (October 2026)

Nothing to do on macOS or Windows: the first start hands the data volumes to Sentinel's own user. On Linux, if your user isn't 1000, set `SENTINEL_RUNTIME_USER_ID` and `SENTINEL_RUNTIME_GROUP_ID` in `.env` to your ids (`id -u`, `id -g`), or Sentinel can't save the config file.
