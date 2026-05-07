from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class UserEmpresa(TimestampMixin, Base):
    """Vínculo usuario Supabase Auth → empresa Licitum.

    `user_id` es el UUID que Supabase emite en `auth.users.id` (lo recibimos
    en el JWT bajo `sub`). Una fila por usuario; un usuario solo puede ver
    una empresa en el MVP. Para multi-empresa cambiar la PK.
    """

    __tablename__ = "user_empresa"

    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
    )
    empresa_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("empresas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rol: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="admin",
        server_default="admin",
    )
