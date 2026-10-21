"""Clear a forgotten SDR Manager console password, from a shell on this machine.

Sentry's `tools/reset-password.sh`, moved into the package so it runs wherever
the service does:

    docker compose exec sdr-manager-local python -m sentinel_sdr_manager_local.reset_password

It asks before acting, because the console is then open to anyone who can
reach this machine until a new password is set. Clearing also rotates the
session secret, so every signed-in browser — and any copied cookie — is
signed out at once. Devices, ports and hotspot settings are untouched.
"""

from __future__ import annotations

import asyncio
import sys
from collections.abc import Callable

from backend import database as core_database
from sqlalchemy.ext.asyncio import async_sessionmaker

from sentinel_sdr_manager_local.services.console_auth import ConsoleAuthService

WARNING = """
  This clears the SDR Manager console password.

  The console becomes open — anyone who can reach this machine will be able
  to change your SDRs, with no password — until you set a new one. Every
  signed-in browser is signed out immediately.

  Your devices, ports and hotspot settings are untouched.
"""

CONFIRMATION_ANSWERS = frozenset({"y", "yes"})


async def clear_console_password() -> None:
    """Drop the password hash and rotate the session secret."""
    service = ConsoleAuthService(async_sessionmaker(core_database.engine, expire_on_commit=False))
    await service.clear_password()


def main(ask: Callable[[str], str] = input) -> int:
    """Confirm, then clear. Returns the process exit code: 0 cleared, 1 left unchanged."""
    print(WARNING)
    try:
        reply = ask("  Continue? [y/N] ")
    except EOFError:
        # No terminal attached (`exec -T`, a pipe): never clear without a yes.
        reply = ""
    if reply.strip().lower() not in CONFIRMATION_ANSWERS:
        print("\n  Left unchanged.\n", file=sys.stderr)
        return 1
    asyncio.run(clear_console_password())
    print("\n  Password cleared. Set a new one in Settings › SDR Manager.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
