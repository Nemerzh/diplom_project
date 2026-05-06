import os

import httpx
import pytest

DEFAULT_BASE = os.getenv("TEST_API_BASE_URL", "http://127.0.0.1:8000")


@pytest.fixture(scope="session")
def api_base() -> str:
    return os.getenv("TEST_API_BASE_URL", DEFAULT_BASE).rstrip("/")


@pytest.fixture(scope="session")
def api_reachable(api_base: str) -> bool:
    try:
        r = httpx.get(f"{api_base}/health", timeout=3.0)
        return r.status_code == 200
    except httpx.RequestError:
        return False


@pytest.fixture
def client(api_base: str, api_reachable: bool):
    if not api_reachable:
        pytest.skip(
            f"API недоступний за {api_base} — підніміть бекенд (наприклад docker compose) "
            "або задайте TEST_API_BASE_URL"
        )
    with httpx.Client(base_url=api_base, timeout=30.0) as c:
        yield c
