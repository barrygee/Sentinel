#!/bin/sh
# Entrypoint for the app image: core and every service run from it (the
# section-containers plan's §4.6 "non-root images").
#
# The process never runs as root. The container starts as root only long
# enough to hand its writable mounts to the runtime user, then drops to it, the
# pattern the official postgres/redis images use. A plain `USER` in the
# Dockerfile cannot do this: named volumes created before images ran unprivileged
# (every one in a live deployment) are root-owned, and an unprivileged process
# could not write its own database.
#
# SENTINEL_RUNTIME_USER_ID / SENTINEL_RUNTIME_GROUP_ID pick the runtime user
# (default 1000, the image's `sentinel` user). Set them to your own ids on a
# Linux host whose ./backend is bind-mounted (as docker-compose.yml does for
# live reload) and not owned by uid 1000, so the app can still write
# backend/data/sentinel_config.json. Started with an explicit non-root `--user`,
# this execs the command unchanged.
set -eu

runtime_user_id="${SENTINEL_RUNTIME_USER_ID:-1000}"
runtime_group_id="${SENTINEL_RUNTIME_GROUP_ID:-1000}"

# Mounts the process writes to: its database volume, and the shared secret
# volumes core writes (read-only in section containers, so a failure there is
# expected and harmless), and the radio hub's recordings mounts.
writable_directories="${SENTINEL_WRITABLE_DIRECTORIES:-/app/data /run/decoder /run/sentinel /sdr-data /sdr-service-data}"

if [ "$(id -u)" != "0" ]; then
    exec "$@"
fi

# Only entries not already owned are changed, so a restart walks a few
# directories and changes nothing.
for writable_directory in $writable_directories; do
    [ -d "$writable_directory" ] || continue
    find "$writable_directory" \( ! -user "$runtime_user_id" -o ! -group "$runtime_group_id" \) \
        -exec chown "$runtime_user_id:$runtime_group_id" {} + 2>/dev/null || true
done

# /root is not the runtime user's; anything reading HOME looks here instead.
export HOME=/home/sentinel
exec setpriv --reuid="$runtime_user_id" --regid="$runtime_group_id" --clear-groups -- "$@"
