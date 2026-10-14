# Running the radio hub on a second host

Sentinel's **radio hub** owns everything that touches a physical radio: rtl_tcp and
Sentry connections, the `/ws/sdr/*` sockets and the decoders (voice, APRS, AIS). It
can run on a separate machine next to the dongles (a "radio host") while the rest of
Sentinel (the **core host**: app, gateway, NATS and the sections) stays where it is.
The browser keeps using the core host's address; nothing changes for it.

```
 browser ──http──▶ core host :8080 (gateway) ──TLS──▶ radio host :8443 (radio-host-gateway) ──▶ radio
                                                                                                  ▲
 radio ──TLS──▶ core host :8443 (service entrypoint: register, settings, secrets)             │
 radio ──TLS──▶ core host :4222 (NATS, its own user)                     decoders ───────────┘
                                                                         (radio host's compose network only)
```

Everything that crosses the LAN is TLS, verified against a CA generated for your
deployment, and every process signs in with its own credential (see `CLAUDE.md`,
*Internal credentials*). The decoders never leave the radio host's own Docker network,
so no PCM port is published.

## What you need

- Both machines can reach each other by a stable name or IP address (a DHCP
  reservation or local DNS entry). Below they are `sentinel.lan` (core) and `radio.lan`.
- A checkout of this repository on both, and Docker with compose v2.
- The radio host reaches its dongles (rtl_tcp or Sentry) as before.

## 1. Core host

Add to the core host's `.env` (see `.env.example`):

```bash
# The hub runs on the radio host, not here: don't start this host's own.
SENTINEL_RADIO_REPLICAS=0
# COMPOSE_PROFILES must NOT include any decoder profile.

# Names other hosts reach this one by, and the name core reaches the radio host by.
SENTINEL_CORE_HOSTNAMES=sentinel.lan
SENTINEL_RADIO_HOST_HOSTNAMES=radio.lan

# Open the TLS service entrypoint and NATS to the LAN (both default to 127.0.0.1).
SENTINEL_SERVICE_ENTRYPOINT_ADDRESS=0.0.0.0:8443
NATS_PUBLISHED_ADDRESS=0.0.0.0:4222
```

Then:

```bash
docker compose up -d                 # service-credentials issues the certificates
docker compose restart nats          # only if NATS was already running: it reads its config at start
docker compose run --rm -T service-credentials \
    python -m backend.scripts.service_credentials_bundle export radio-host > radio-host-credentials.tar.gz
```

The bundle holds the radio host's credentials: the hub's and each decoder's token,
the hub's NATS user, the CA certificate and the radio host gateway's certificate and
key. It never contains core's own credential or the CA's private key. **It is a
secret:** copy it over a trusted channel and delete it afterwards.

```bash
scp radio-host-credentials.tar.gz radio.lan:sentinel/
rm radio-host-credentials.tar.gz
```

## 2. Radio host

In the radio host's checkout, create `.env`:

```bash
SENTINEL_CORE_ENTRYPOINT_URL=https://sentinel.lan:8443
SENTINEL_CORE_NATS_URL=tls://sentinel.lan:4222
SENTINEL_RADIO_HOST_URL=https://radio.lan:8443
COMPOSE_PROFILES=aprs,ais            # the decoders you want: voice-decoder, aprs, ais, all
```

Then:

```bash
docker compose -f compose.radio-host.yaml run --rm -T credentials-import < radio-host-credentials.tar.gz
rm radio-host-credentials.tar.gz
docker compose -f compose.radio-host.yaml up -d --build
```

The hub logs `connected to core at https://sentinel.lan:8443`, `event bus connected to
NATS` and `radio registered with core`; each decoder logs `connected to the radio
hub through http://radio:8000`. On the core host, `docker compose logs app` shows
`registry: radio … registered from https://radio.lan:8443`, and SDR, APRS and AIS
work in the browser as before.

Radios are configured in Settings exactly as before. Their address is now as seen from
the radio host (`host.docker.internal` for an rtl_tcp running on the radio host itself).
Sentry hosts live in the hub's own database, which starts empty on a new radio host:
add them again under Settings.

## Changing things later

- **New or renamed host names:** update `SENTINEL_CORE_HOSTNAMES` /
  `SENTINEL_RADIO_HOST_HOSTNAMES`, run `docker compose up -d` and
  `docker compose restart nats gateway` on the core host. The certificates are
  reissued, so export a fresh bundle and import it on the radio host.
- **Credentials:** created once and kept. To rotate one, delete its
  `credentials/<caller>/` folder on the `service_credentials` volume, run
  `docker compose up -d` on the core host, then re-export and re-import.
- **Moving the hub back:** stop the radio host (`docker compose -f compose.radio-host.yaml down`),
  remove `SENTINEL_RADIO_REPLICAS=0` from the core host's `.env` and `docker compose up -d`.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Hub logs `waiting for core to answer (… certificate verify failed …)` | `SENTINEL_CORE_ENTRYPOINT_URL`'s host isn't in `SENTINEL_CORE_HOSTNAMES`, or the bundle predates a host name change |
| Hub logs `waiting for core to answer (… Connection refused …)` | `SENTINEL_SERVICE_ENTRYPOINT_ADDRESS` still binds 127.0.0.1, or a firewall blocks 8443 |
| Hub never says `event bus connected` | `NATS_PUBLISHED_ADDRESS` not opened, or NATS not restarted after the host names changed |
| SDR pages show the hub unavailable | Core can't reach `SENTINEL_RADIO_HOST_URL`: check port 8443 on the radio host and that its name is in `SENTINEL_RADIO_HOST_HOSTNAMES` |
| `registration: core refused radio (401)` | The bundle's credentials no longer match core's (the volume was recreated): export and import again |
