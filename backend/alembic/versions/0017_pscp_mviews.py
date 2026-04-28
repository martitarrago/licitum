"""pscp_intel materialized views agregadas.

Spec: docs/data-science/architecture.md sección 4.

3 mviews:
  - agg_competencia_organ_cpv: competencia esperada por (organ, cpv4, tipus)
  - agg_organ_perfil: concentración HHI + top adjudicatarios por órgano
  - agg_empresa_perfil: perfil de cada empresa (organs/cpvs/baja/volumen)

Cada mview tiene unique index para soportar REFRESH MATERIALIZED VIEW
CONCURRENTLY (sin lock contra readers en horario laboral).

Revision ID: 0017_pscp_mviews
Revises: 0016_pscp_drop_unique
Create Date: 2026-04-28

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "0017_pscp_mviews"
down_revision: Union[str, None] = "0016_pscp_drop_unique"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # agg_competencia_organ_cpv
    # ------------------------------------------------------------------
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
        """
        CREATE UNIQUE INDEX idx_agg_comp_pk
            ON agg_competencia_organ_cpv (codi_organ, codi_cpv_4, tipus_contracte);
        """
    )

    # ------------------------------------------------------------------
    # agg_organ_perfil
    # ------------------------------------------------------------------
    op.execute(
        """
        CREATE MATERIALIZED VIEW agg_organ_perfil AS
        WITH adj_emp AS (
            SELECT
                a.codi_organ,
                MAX(a.nom_organ) AS nom_organ,
                ae.cif,
                MAX(e.denominacio_canonica) AS denominacio,
                COUNT(*) AS n
            FROM pscp_adjudicacion a
            JOIN pscp_adjudicacion_empresa ae ON ae.adjudicacion_id = a.id
            JOIN pscp_empresa e ON e.cif = ae.cif
            WHERE a.fase_publicacio IN ('Adjudicació', 'Formalització')
              AND a.tipus_contracte = 'Obres'
              AND a.deleted_at IS NULL
            GROUP BY a.codi_organ, ae.cif
        ),
        totals AS (
            SELECT codi_organ, SUM(n) AS total FROM adj_emp GROUP BY codi_organ
        )
        SELECT
            t.codi_organ,
            MAX(ae.nom_organ) AS nom_organ,
            t.total AS n_adjudicaciones_obras,
            ROUND(SUM(POWER(ae.n::numeric / t.total, 2)), 4) AS hhi_concentracion,
            (
                SELECT JSON_AGG(
                    JSON_BUILD_OBJECT(
                        'cif', ae2.cif,
                        'denominacio', ae2.denominacio,
                        'n', ae2.n,
                        'pct', ROUND(ae2.n::numeric / t.total * 100, 2)
                    )
                    ORDER BY ae2.n DESC
                )
                FROM (
                    SELECT cif, denominacio, n
                    FROM adj_emp
                    WHERE codi_organ = t.codi_organ AND n >= 2
                    ORDER BY n DESC
                    LIMIT 10
                ) ae2
            ) AS top_adjudicatarios
        FROM adj_emp ae
        JOIN totals t USING (codi_organ)
        GROUP BY t.codi_organ, t.total
        WITH NO DATA;
        """
    )
    op.execute(
        "CREATE UNIQUE INDEX idx_agg_organ_pk ON agg_organ_perfil (codi_organ);"
    )

    # ------------------------------------------------------------------
    # agg_empresa_perfil
    # ------------------------------------------------------------------
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
    op.execute(
        "CREATE UNIQUE INDEX idx_agg_empresa_pk ON agg_empresa_perfil (cif);"
    )


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS agg_empresa_perfil;")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS agg_organ_perfil;")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS agg_competencia_organ_cpv;")
