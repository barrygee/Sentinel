import time


def now_ms() -> int:
    return int(time.time() * 1000)


def is_fresh(expires_at: int) -> bool:
    return now_ms() < expires_at


def is_within_stale(fetched_at: int, stale_ms: int) -> bool:
    return now_ms() < fetched_at + stale_ms
