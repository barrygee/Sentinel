# @sentinel/sdr-manager-local

The **THIS MACHINE** group of Settings › SDR Manager ([ADR 0007](../../../docs/adr/0007-sdr-manager.md)):
the RTL-SDRs plugged into this machine, managed by the `sdr-manager-local`
service through its SDR Manager API at `/api/sdr-manager/local`.

- **Devices** — each dongle, live over the API's event stream: name it, give
  it an output port, switch streaming on, set who may see it, forget an
  unplugged one, and flash a unique serial onto dongles that share one.
- **Console password** — set or change it, sign out; when one is set, every
  card asks to sign in first.
- **Configuration** — download this machine's configuration file, or import one.
- **Hotspot** — the Wi-Fi network this machine can offer, with its trial
  period, rollback and connected devices (hidden where there's no NetworkManager).

It is a Module Federation remote the `sdr-manager-local` service serves from
`/remotes/sdr-manager-local/` (its image builds it). Its `./register` entry
(`src/register.ts`) adds settings only, never a map section. It imports only
`@sentinel/ui`, `@sentinel/shell-api` and its own files. When the service isn't
deployed, sdr-manager-remote's REMOTE SDR HOSTS group says how to enable it.

```bash
npm run lint -w @sentinel/sdr-manager-local
npm run typecheck -w @sentinel/sdr-manager-local
npm run test:coverage -w @sentinel/sdr-manager-local   # 100% coverage gate
```
