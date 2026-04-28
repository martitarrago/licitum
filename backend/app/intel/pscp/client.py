"""Cliente async para el dataset PSCP `ybgg-dgi6` en Socrata.

Sin auth (suficiente para volumen actual). Soporta SoQL: $where, $select,
$group, $order, $limit, $offset.

Spec: docs/data-science/architecture.md sección 5.

Uso:
    async with PscpClient() as c:
        async for batch in c.iter_records(where="data_publicacio_adjudicacio > '2026-04-01'"):
            for record in batch:
                ...
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from typing import Any

import httpx

logger = logging.getLogger(__name__)

DATASET_URL = "https://analisi.transparenciacatalunya.cat/resource/ybgg-dgi6.json"
DEFAULT_PAGE_SIZE = 1000  # Socrata sin token soporta hasta 1000/req cómodamente
DEFAULT_TIMEOUT = 120.0
MAX_RETRIES = 4


class PscpClient:
    """Async client para PSCP Socrata. Usar como context manager."""

    def __init__(
        self,
        app_token: str | None = None,
        timeout: float = DEFAULT_TIMEOUT,
        page_size: int = DEFAULT_PAGE_SIZE,
        rate_limit_delay: float = 0.0,
    ) -> None:
        self._app_token = app_token
        self._timeout = timeout
        self._page_size = page_size
        self._rate_limit_delay = rate_limit_delay
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "PscpClient":
        headers = {"Accept": "application/json"}
        if self._app_token:
            headers["X-App-Token"] = self._app_token
        self._client = httpx.AsyncClient(timeout=self._timeout, headers=headers)
        return self

    async def __aexit__(self, *exc: Any) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def _fetch_with_retries(self, params: dict[str, str]) -> list[dict]:
        assert self._client is not None, "use as async context manager"
        last_err: Exception | None = None
        for attempt in range(MAX_RETRIES):
            try:
                r = await self._client.get(DATASET_URL, params=params)
                r.raise_for_status()
                return r.json()
            except (httpx.HTTPError, httpx.TimeoutException) as e:
                last_err = e
                wait = 2 ** attempt
                logger.warning(
                    "PSCP fetch failed (attempt %d/%d): %s — retrying in %ds",
                    attempt + 1, MAX_RETRIES, e, wait,
                )
                await asyncio.sleep(wait)
        raise RuntimeError(f"PSCP fetch failed after {MAX_RETRIES} retries: {last_err}")

    async def count(self, where: str | None = None) -> int:
        params: dict[str, str] = {"$select": "count(*)"}
        if where:
            params["$where"] = where
        result = await self._fetch_with_retries(params)
        if not result:
            return 0
        # Socrata devuelve [{"count": "1234"}] o [{"count_*": "1234"}]
        first = result[0]
        for v in first.values():
            try:
                return int(v)
            except (ValueError, TypeError):
                continue
        return 0

    async def iter_records(
        self,
        where: str | None = None,
        order: str = ":id",
        select: str = ":*, *",
        limit_total: int | None = None,
    ) -> AsyncIterator[list[dict]]:
        """Itera por páginas de `page_size` registros.

        Por defecto ordena por `:id` (interno de Socrata, estable) para
        garantizar que la paginación es consistente entre requests.

        El select default `:*, *` incluye tanto system fields (`:id`,
        `:created_at`, etc.) como user fields. Sin `:*` el `:id` no llega
        y el upsert no puede deduplicar.
        """
        offset = 0
        emitted = 0
        while True:
            page_size = self._page_size
            if limit_total is not None:
                remaining = limit_total - emitted
                if remaining <= 0:
                    return
                page_size = min(page_size, remaining)

            params: dict[str, str] = {
                "$select": select,
                "$order": order,
                "$limit": str(page_size),
                "$offset": str(offset),
            }
            if where:
                params["$where"] = where

            batch = await self._fetch_with_retries(params)
            if not batch:
                return

            yield batch
            emitted += len(batch)
            offset += len(batch)

            if len(batch) < page_size:
                return  # última página

            if self._rate_limit_delay > 0:
                await asyncio.sleep(self._rate_limit_delay)
