from __future__ import annotations

from functools import lru_cache

import aioboto3
from fastapi import HTTPException, status

from app.config import settings


class R2Storage:
    def __init__(
        self,
        account_id: str,
        access_key_id: str,
        secret_access_key: str,
        bucket: str,
        public_url_base: str | None = None,
    ) -> None:
        self._endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
        self._access_key_id = access_key_id
        self._secret_access_key = secret_access_key
        self._bucket = bucket
        self._public_url_base = (public_url_base or f"{self._endpoint_url}/{bucket}").rstrip("/")
        self._session = aioboto3.Session()

    def _client(self):
        return self._session.client(
            "s3",
            endpoint_url=self._endpoint_url,
            aws_access_key_id=self._access_key_id,
            aws_secret_access_key=self._secret_access_key,
            region_name="auto",
        )

    async def upload(self, key: str, body: bytes, content_type: str) -> str:
        async with self._client() as s3:
            await s3.put_object(
                Bucket=self._bucket,
                Key=key,
                Body=body,
                ContentType=content_type,
                ContentDisposition="inline",
            )
        return f"{self._public_url_base}/{key}"

    async def delete(self, key: str) -> None:
        async with self._client() as s3:
            await s3.delete_object(Bucket=self._bucket, Key=key)


@lru_cache(maxsize=1)
def _build_storage() -> R2Storage | None:
    required = (
        settings.r2_account_id,
        settings.r2_access_key_id,
        settings.r2_secret_access_key,
        settings.r2_bucket,
    )
    if not all(required):
        return None
    return R2Storage(
        account_id=settings.r2_account_id,  # type: ignore[arg-type]
        access_key_id=settings.r2_access_key_id,  # type: ignore[arg-type]
        secret_access_key=settings.r2_secret_access_key,  # type: ignore[arg-type]
        bucket=settings.r2_bucket,  # type: ignore[arg-type]
        public_url_base=settings.r2_public_url_base,
    )


def get_storage() -> R2Storage:
    storage = _build_storage()
    if storage is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Almacenamiento R2 no configurado. Define R2_ACCOUNT_ID, "
            "R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET en .env",
        )
    return storage
