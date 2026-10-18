"""Whether this deployment includes the in-app docs — what the shell asks at boot.

  GET /api/app/docs — `{"deployed": bool, "available": bool}`

The docs are their own optional service (`sentinel_docs`, compose service
`docs`), which serves the documentation under `/api/documentation/`. The shell
offers Docs (the Settings rail entry, each setting's LEARN MORE link) only while
one is registered: `deployed` says it is, and `available` follows its health
probes, like a section's. A `/docs/…` URL opened without one shows a "docs
unavailable" page instead of a broken one.
"""

from backend.core.service_registry import ServiceRegistry, registry
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/app", tags=["app"])


class DocsDeployment(BaseModel):
    """Body of GET /api/app/docs."""

    deployed: bool
    available: bool


def docs_deployment(service_registry: ServiceRegistry) -> DocsDeployment:
    """Whether a docs service is registered, and whether its probes say it is up."""
    for registration in service_registry.services():
        if registration.manifest.kind == "docs":
            return DocsDeployment(deployed=True, available=registration.available)
    return DocsDeployment(deployed=False, available=False)


@router.get("/docs", response_model=DocsDeployment)
async def get_docs_deployment() -> DocsDeployment:
    """Say whether the shell should offer Docs."""
    return docs_deployment(registry)
