# HTTPS

Open Sentinel over an encrypted connection, so what you type, a console password included, never crosses the network readable. Sentinel serves its page over HTTPS on port **8444** as well as plain HTTP on 8080.

## Features

- **Its own certificate:** issued by this Sentinel's certificate authority, made when it was installed. No account, no internet.
- **Trust once per device:** install the certificate authority on each phone, tablet or computer you open Sentinel on.
- **Everything works the same** over either address: the map, SDR audio, Settings.
- **SDR Manager only too:** a Pi set up as [SDR Manager only](sdr-manager-local-only.md) serves its page over HTTPS the same way.

## Turn it on for your network

The certificate covers `localhost` and `127.0.0.1` from the start. To open Sentinel from other devices, name the addresses you open it by. In `.env`:

```
SENTINEL_WEB_HOSTNAMES=192.168.5.67,sentinel.local
```

Then:

```bash
docker compose up -d
docker compose restart gateway
```

`up` issues the certificate again for the new names; the restart makes the gateway load it. Give the machine a fixed address on your router, or a browser warns again when it changes.

## Trust it on each device

1. On the device, open Sentinel at its plain address (`http://192.168.5.67:8080`), then **Settings › App Settings › HTTPS**.
2. **DOWNLOAD CERTIFICATE**, and install it as below.
3. **OPEN OVER HTTPS**, or go to `https://192.168.5.67:8444`.
4. Check the certificate your browser shows: issued by **Sentinel event bus CA**, with the fingerprint shown under **HTTPS**.

| Device                     | Install the downloaded `sentinel-certificate-authority.crt`                                                                                                                                                                                                                                                                                        |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mac**                    | Open it: Keychain Access adds it. Double-click **Sentinel event bus CA**, open **Trust**, set **When using this certificate** to **Always Trust**, close and enter your password. Firefox: also import it under **Settings › Privacy & Security › Certificates › View Certificates › Authorities**, ticking **Trust this CA to identify websites** |
| **iPhone, iPad**           | Download it in Safari, then **Settings › General › VPN & Device Management**, open it and **Install**. Then **Settings › General › About › Certificate Trust Settings** and switch on full trust for it                                                                                                                                            |
| **Android**                | **Settings › Security › More security settings › Encryption & credentials › Install a certificate › CA certificate**, then pick the file (the menu names differ between phones)                                                                                                                                                                    |
| **Windows**                | Open it, **Install Certificate**, **Current User**, **Place all certificates in the following store**, **Trusted Root Certification Authorities**                                                                                                                                                                                                  |
| **Linux, Raspberry Pi OS** | `sudo cp sentinel-certificate-authority.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates`. Chrome and Firefox keep their own list: import it in their certificate settings as an authority                                                                                                                                     |

## Things to know

- **What you are trusting:** this Sentinel's certificate authority. Its private key never leaves the machine (the `service_credentials` Docker volume), and nothing on the page hands it out.
- **Removed the Docker volumes?** A new certificate authority is made on the next start. Install the new one on each device, and remove the old one.
- **Another port:** set `SENTINEL_HTTPS_PORT` in `.env`, then `docker compose up -d`.
- **Plain HTTP stays:** port 8080 keeps working, for this machine and for devices that haven't installed the certificate yet.
- **Downloads over plain HTTP:** a browser can warn that a file "was loaded over an insecure connection". Over HTTPS it doesn't.

## If it's not working

| You see                                                                           | Do                                                                                                                    |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| "Your connection is not private" / "Not secure"                                   | The certificate authority isn't installed on this device, or not trusted: see the table above                         |
| The warning names the address, not the authority (`ERR_CERT_COMMON_NAME_INVALID`) | That address isn't in `SENTINEL_WEB_HOSTNAMES`. Add it, then `docker compose up -d && docker compose restart gateway` |
| The HTTPS address doesn't answer                                                  | Port 8444 is blocked by a firewall, or the gateway is from before HTTPS: `docker compose up -d`                       |
| **HTTPS** says "no certificate yet"                                               | Run `docker compose up -d`: it makes the certificate authority                                                        |
