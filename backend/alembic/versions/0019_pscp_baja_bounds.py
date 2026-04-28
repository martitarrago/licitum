"""Recompute baja_pct con bounds: si fuera de [-100, 100], NULL.

Bug: GENERATED column original calculaba (1 - import/pressupost) * 100
sin acotar. Con pressupost casi cero y import normal, baja explotaba a
millones → overflow en NUMERIC(7,3).

Bajas reales razonables están en [-50, 80] (negativas si modificación al
alza). Cualquier cosa fuera de [-100, 100] es ruido de calidad de datos
de PSCP. Lo NULLeamos.

Revision ID: 0019_pscp_baja_bounds
Revises: 0018_empresa_recursos
Create Date: 2026-04-28

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0019_pscp_baja_bounds"
down_revision: Union[str, None] = "0018_empresa_recursos"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Mviews que dependen de baja_pct (creadas en 0017) — drop primero.
    op.execute("DROP MATERIALIZED VIEW IF EXISTS agg_competencia_organ_cpv;")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS agg_empresa_perfil;")

    op.execute("ALTER TABLE pscp_adjudicacion DROP COLUMN baja_pct;")
    op.execute(
        """
        ALTER TABLE pscp_adjudicacion
        ADD COLUMN baja_pct NUMERIC(7,3)
        GENERATED ALWAYS AS (
            CASE
                WHEN pressupost_licitacio_sense > 0
                     AND import_adjudicacio_sense IS NOT NULL
                     AND ABS((1 - import_adjudicacio_sense / pressupost_licitacio_sense) * 100) < 999.999
                THEN ROUND(
                    (1 - import_adjudicacio_sense / pressupost_licitacio_sense) * 100,
                    3
                )
                ELSE NULL
            END
        ) STORED;
        """
    )

    # Recrear agg_competencia_organ_cpv idéntica a 0017.
    op.execute(
        """
        CREATE MATERIALIZED VIEW agg_competencia_organ_cpv AS
        SELECT
            codi_organ,
            MAX(nom_organ) AS nom_organ,
            COALESCE(codi_cpv_4, '____') AS codi_cpv_4,
            COALESCE(tipus_contracte, 'Unknown') AS tipus_contracte,
            COUNT(*) AS n_obs,
            ROUND(AVG(ofertes_rebudes::numeric), 2) AS ofertes_avg,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ofertes_rebudes) AS ofertes_median,
            PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ofertes_rebudes) AS ofertes_p90,
            ROUND(
                SUM(CASE WHEN ofertes_rebudes = 1 THEN 1 ELSE 0 END)::numeric / COUNT(*),
                4
            ) AS pct_oferta_unica,
            ROUND(AVG(baja_pct), 2) AS baja_avg,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY baja_pct) AS baja_median,
            PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY baja_pct) AS baja_p90,
            ROUND(AVG(import_adjudicacio_sense), 2) AS import_avg
        FROM pscp_adjudicacion
        WHERE fase_publicacio IN ('Adjudicació', 'Formalització')
          AND ofertes_rebudes IS NOT NULL
          AND deleted_at IS NULL
        GROUP BY codi_organ, COALESCE(codi_cpv_4, '____'), COALESCE(tipus_contracte, 'Unknown')
        WITH NO DATA;
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX idx_agg_comp_pk "
        "ON agg_competencia_organ_cpv (codi_organ, codi_cpv_4, tipus_contracte);"
    )

    # Recrear agg_empresa_perfil idéntica a 0017.
    op.execute(
        """
        CREATE MATERIALIZED VIEW agg_empresa_perfil AS
        SELECT
            ae.cif,
            MAX(e.denominacio_canonica) AS denominacio_canonica,
            COUNT(*) AS n_adjudicaciones,
            COUNT(*) FILTER (WHERE a.tipus_contracte = 'Obres') AS n_obres,
            ROUND(AVG(a.baja_pct), 2) AS baja_avg,
            ROUND(SUM(a.import_adjudicacio_sense), 2) AS volumen_total,
            MIN(a.data_adjudicacio_contracte) AS primera_adj,
            MAX(a.data_adjudicacio_contracte) AS ultima_adj,
            (
                SELECT ARRAY_AGG(DISTINCT codi_organ ORDER BY codi_organ)
                FROM pscp_adjudicacion a2
                JOIN pscp_adjudicacion_empresa ae2 ON ae2.adjudicacion_id = a2.id
                WHERE ae2.cif = ae.cif
                  AND a2.fase_publicacio IN ('Adjudicació', 'Formalització')
                  AND a2.deleted_at IS NULL
            ) AS organs_freq,
            (
                SELECT ARRAY_AGG(DISTINCT codi_cpv_4 ORDER BY codi_cpv_4)
                FROM pscp_adjudicacion a2
                JOIN pscp_adjudicacion_empresa ae2 ON ae2.adjudicacion_id = a2.id
                WHERE ae2.cif = ae.cif
                  AND a2.codi_cpv_4 IS NOT NULL
                  AND a2.fase_publicacio IN ('Adjudicació', 'Formalització')
                  AND a2.deleted_at IS NULL
            ) AS cpvs_freq
        FROM pscp_adjudicacion_empresa ae
        JOIN pscp_adjudicacion a ON a.id = ae.adjudicacion_id
        JOIN pscp_empresa e ON e.cif = ae.cif
        WHERE a.fase_publicacio IN ('Adjudicació', 'Formalització')
          AND a.deleted_at IS NULL
        GROUP BY ae.cif
        WITH NO DATA;
        """
    )
    op.execute("CREATE UNIQUE INDEX idx_agg_empresa_pk ON agg_empresa_perfil (cif);")


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS agg_competencia_organ_cpv;")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS agg_empresa_perfil;")

    op.execute("ALTER TABLE pscp_adjudicacion DROP COLUMN baja_pct;")
    op.execute(
        """
        ALTER TABLE pscp_adjudicacion
        ADD COLUMN baja_pct NUMERIC(7,3)
        GENERATED ALWAYS AS (
            CASE
                WHEN pressupost_licitacio_sense > 0
                     AND import_adjudicacio_sense IS NOT NULL
                THEN ROUND(
                    (1 - import_adjudicacio_sense / pressupost_licitacio_sense) * 100,
                    3
                )
                ELSE NULL
            END
        ) STORED;
        """
    )

    # Recrear la mview con la versión antigua (idéntica estructura)
    op.execute(
        """
        CREATE MATERIALIZED VIEW agg_competencia_organ_cpv AS
        SELECT
            codi_organ,
            MAX(nom_organ) AS nom_organ,
            COALESCE(codi_cpv_4, '____') AS codi_cpv_4,
            COALESCE(tipus_contracte, 'Unknown') AS tipus_contracte,
            COUNT(*) AS n_obs,
            ROUND(AVG(ofertes_rebudes::numeric), 2) AS ofertes_avg,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ofertes_rebudes) AS ofertes_median,
            PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY ofertes_rebudes) AS ofertes_p90,
            ROUND(
                SUM(CASE WHEN ofertes_rebudes = 1 THEN 1 ELSE 0 END)::numeric / COUNT(*),
                4
            ) AS pct_oferta_unica,
            ROUND(AVG(baja_pct), 2) AS baja_avg,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY baja_pct) AS baja_median,
            PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY baja_pct) AS baja_p90,
            ROUND(AVG(import_adjudicacio_sense), 2) AS import_avg
        FROM pscp_adjudicacion
        WHERE fase_publicacio IN ('Adjudicació', 'Formalització')
          AND ofertes_rebudes IS NOT NULL
          AND deleted_at IS NULL
        GROUP BY codi_organ, COALESCE(codi_cpv_4, '____'), COALESCE(tipus_contracte, 'Unknown')
        WITH NO DATA;
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX idx_agg_comp_pk "
        "ON agg_competencia_organ_cpv (codi_organ, codi_cpv_4, tipus_contracte);"
    )
