"""sdr-manager-remote's REST routers, all under `/api/sdr-manager/remote/hosts`.

`ROUTERS` is the order they are mounted in, which keeps the route table (and
so first-match routing and the request guard's rules) as it was when they
were one router: the host routes, then devices, then the Wi-Fi hotspot.
"""

from fastapi import APIRouter

from sentinel_sdr_manager_remote.routers import host_devices, host_wifi, hosts

ROUTERS: list[APIRouter] = [hosts.router, host_devices.router, host_wifi.router]
