import httpx

from backend.config import settings


async def fetch_aircraft(lat: float, lon: float, radius: int) -> dict:
    """Fetch live aircraft from airplanes.live. Returns the raw JSON dict."""
    url = f"{settings.adsb_upstream_base}/point/{lat}/{lon}/{radius}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            url,
            headers={
                "User-Agent": "SENTINEL/1.0",
                "Accept": "application/json",
            },
        )
        response.raise_for_status()
        return response.json()
