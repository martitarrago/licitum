"""m2: filtros radar — provincias[] + tipo_organismo + indices

Añade dos columnas derivadas a `licitaciones`:
  - provincias text[]    — array de provincias catalanas extraido de raw_data->>'codi_nuts'
  - tipo_organismo varchar(32) — categoria heuristica del organismo

Backfill in-place a partir de los datos JSONB y `organismo` ya presentes.
Crea indices para los filtros del Radar (provincias GIN, tipo_organismo,
fecha_limite, importe_licitacion).

La logica de mapeo aqui debe coincidir con la del worker
`workers/ingesta_pscp.py` (`_extraer_provincias`, `_extraer_tipo_organismo`).

Revision ID: 0008_licitaciones_filtros
Revises: 0007_licitaciones
Create Date: 2026-04-26

"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_licitaciones_filtros"
down_revision: Union[str, None] = "0007_licitaciones"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---------------------------------------------------------------------
    # 1) Columnas nuevas
    # ---------------------------------------------------------------------
    op.add_column(
        "licitaciones",
        sa.Column(
            "provincias",
            postgresql.ARRAY(sa.String(32)),
            nullable=False,
            server_default="{}",
        ),
    )
    op.add_column(
        "licitaciones",
        sa.Column("tipo_organismo", sa.String(32), nullable=True),
    )

    # ---------------------------------------------------------------------
    # 2) Backfill provincias
    #
    # Casos a cubrir (verificados con datos reales en BD):
    #   ES51            → ['barcelona','girona','lleida','tarragona']  (Cataluna entera)
    #   ES511           → ['barcelona']
    #   ES512           → ['girona']
    #   ES513           → ['lleida']
    #   ES514           → ['tarragona']
    #   ES511||ES513    → ['barcelona','lleida']  (multi via separador ||)
    #   resto (ES, AD…) → '{}'   (queda fuera del filtro de provincia)
    #
    # Idempotente: solo toca filas donde provincias = '{}'.
    # ---------------------------------------------------------------------

    # 2a. Caso "Cataluna entera"
    op.execute(
        sa.text(
            """
            UPDATE licitaciones
            SET provincias = ARRAY['barcelona','girona','lleida','tarragona']::varchar[]
            WHERE raw_data->>'codi_nuts' = 'ES51'
              AND cardinality(provincias) = 0
            """
        )
    )

    # 2b. NUTS3 unico o multi separado por '||'.
    # Mapeo NUTS3 → provincia inline en CASE; ARRAY_AGG ordenado alfabeticamente
    # para mantener resultado deterministico (mismo orden que el worker).
    op.execute(
        sa.text(
            r"""
            UPDATE licitaciones AS l
            SET provincias = subq.provs
            FROM (
                SELECT id,
                       ARRAY_AGG(DISTINCT prov ORDER BY prov)::varchar[] AS provs
                FROM (
                    SELECT id,
                           CASE code
                               WHEN 'ES511' THEN 'barcelona'
                               WHEN 'ES512' THEN 'girona'
                               WHEN 'ES513' THEN 'lleida'
                               WHEN 'ES514' THEN 'tarragona'
                           END AS prov
                    FROM (
                        SELECT id,
                               regexp_split_to_table(raw_data->>'codi_nuts', '\|\|') AS code
                        FROM licitaciones
                        WHERE raw_data->>'codi_nuts' IS NOT NULL
                          AND raw_data->>'codi_nuts' <> 'ES51'
                          AND cardinality(provincias) = 0
                    ) splits
                ) mapped
                WHERE prov IS NOT NULL
                GROUP BY id
            ) AS subq
            WHERE l.id = subq.id
            """
        )
    )

    # ---------------------------------------------------------------------
    # 3) Backfill tipo_organismo
    #
    # Heuristica por nombre, primer match gana (orden importa). Mantener
    # sincronizado con `_extraer_tipo_organismo` en el worker.
    # ---------------------------------------------------------------------
    op.execute(
        sa.text(
            """
            UPDATE licitaciones
            SET tipo_organismo = CASE
                WHEN organismo ILIKE 'Ajuntament%'             THEN 'ayuntamiento'
                WHEN organismo ILIKE '%Diputació%'             THEN 'diputacio'
                WHEN organismo ILIKE '%Consell Comarcal%'      THEN 'consell_comarcal'
                WHEN organismo ILIKE '%Universitat%'           THEN 'universidad'
                WHEN organismo ILIKE 'Generalitat%'
                  OR organismo ILIKE 'Departament%'
                  OR organismo ILIKE 'Servei Català%'
                  OR organismo ILIKE 'Institut Català%'
                  OR organismo ILIKE 'Agència Catalana%'
                  OR organismo ILIKE 'ICS%'                    THEN 'generalitat'
                WHEN organismo IS NULL                         THEN NULL
                ELSE 'otros'
            END
            WHERE tipo_organismo IS NULL
            """
        )
    )

    # ---------------------------------------------------------------------
    # 4) Indices (creados al final: insertar antes y luego indexar es mas
    #    rapido que mantener el indice durante el bulk).
    # ---------------------------------------------------------------------
    op.create_index(
        "ix_licitaciones_provincias_gin",
        "licitaciones",
        ["provincias"],
        postgresql_using="gin",
    )
    op.create_index(
        "ix_licitaciones_tipo_organismo",
        "licitaciones",
        ["tipo_organismo"],
    )
    op.create_index(
        "ix_licitaciones_fecha_limite",
        "licitaciones",
        ["fecha_limite"],
    )
    op.create_index(
        "ix_licitaciones_importe_licitacion",
        "licitaciones",
        ["importe_licitacion"],
    )


def downgrade() -> None:
    op.drop_index("ix_licitaciones_importe_licitacion", "licitaciones")
    op.drop_index("ix_licitaciones_fecha_limite", "licitaciones")
    op.drop_index("ix_licitaciones_tipo_organismo", "licitaciones")
    op.drop_index("ix_licitaciones_provincias_gin", "licitaciones")
    op.drop_column("licitaciones", "tipo_organismo")
    op.drop_column("licitaciones", "provincias")
