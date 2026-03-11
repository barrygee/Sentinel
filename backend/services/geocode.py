import httpx

from backend.config import settings


async def reverse_geocode(lat: float, lon: float) -> dict:
    """Fetch reverse geocode from Nominatim. Returns the raw JSON dict."""
    url = f"{settings.nominatim_base}/reverse"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.get(
            url,
            params={"format": "json", "lat": lat, "lon": lon},
            headers={
                "User-Agent": "SENTINEL/1.0 (surveillance map application)",
                "Accept-Language": "en",
            },
        )
        response.raise_for_status()
        return response.json()
