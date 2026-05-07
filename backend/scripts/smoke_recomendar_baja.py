"""Smoke test del motor recomendar_baja refactorizado.

Cubre los casos del spec de calculadora_motor_redesign.md:
  1) Caso Badalona 2026/12686M (mediana > techo seguro → conflicto)
  2) Peso del precio < 40% (memoria decide → conservadora)
  3) Histórico bajo (n_obs < 10 → conservadora, no p90)
  4) Lineal con saciedad → default = saciedad clampada
  5) Lineal + n_obs alto + peso precio alto → default = competitiva (p90)
  6) Sin histórico ni saciedad → blanda
  7) Threshold extraído del PCAP (regex extracto)
  8) Threshold "media + Xpp" del PCAP

Lanzar: ./.venv/Scripts/python.exe -m scripts.smoke_recomendar_baja
"""
from __future__ import annotations

from app.services.calculadora_economica import (
    extraer_threshold_pcap,
    recomendar_baja,
)


def _print_rec(label: str, rec) -> None:
    print(f"\n=== {label} ===")
    print(
        f"  sugerido: {rec.pct_sugerido}% ({rec.pct_sugerido_label}) | "
        f"techo {rec.techo_temerario_pct}% ({rec.techo_temerario_fuente}) | "
        f"confianza={rec.confianza}"
    )
    for r in rec.referencias:
        marker = "*" if r.es_default else " "
        warn = " [!]" if r.es_temerario else ""
        print(f"   {marker} {r.label:14s} {r.pct:6.2f}% {warn}  -- {r.descripcion}")
    if rec.advertencias:
        print(f"  advertencias: {rec.advertencias}")
    print(f"  razonamiento: {rec.razonamiento}")
    print(
        f"  legacy: rango {rec.rango_optimo_min_pct}–"
        f"{rec.rango_optimo_max_pct}"
    )


def main() -> None:
    # 1) Caso Badalona -- mediana 18.71 > techo seguro (20-2=18); media+10pp threshold
    rec = recomendar_baja(
        formula_tipo="lineal",
        baja_media_historica_pct=18.71,
        baja_mediana_historica_pct=18.5,
        baja_p90_historica_pct=22.0,
        n_obs_historico=4,
        ofertes_esperadas=2.25,
        pct_criterios_objetivos=100.0,
        baja_temeraria_extracto=None,
        presupuesto_base=500000.0,
    )
    _print_rec("1) Badalona -- n=4, mediana cerca del techo", rec)
    assert rec.pct_sugerido is not None and rec.pct_sugerido <= rec.techo_temerario_pct, (
        "no debe superar threshold"
    )

    # 2) Peso del precio bajo (memoria decide)
    rec = recomendar_baja(
        formula_tipo="lineal",
        baja_media_historica_pct=10.0,
        baja_mediana_historica_pct=9.5,
        baja_p90_historica_pct=14.0,
        n_obs_historico=50,
        ofertes_esperadas=8.0,
        pct_criterios_objetivos=30.0,
        presupuesto_base=1_000_000.0,
    )
    _print_rec("2) Peso precio 30% -- debe sugerir conservadora", rec)
    assert rec.pct_sugerido_label == "conservadora", "peso bajo→conservadora"

    # 3) Histórico bajo -- sin p90 fiable
    rec = recomendar_baja(
        formula_tipo="lineal",
        baja_media_historica_pct=12.0,
        baja_mediana_historica_pct=11.5,
        baja_p90_historica_pct=18.0,  # debería ignorarse, n<10
        n_obs_historico=5,
        ofertes_esperadas=3.0,
        pct_criterios_objetivos=70.0,
        presupuesto_base=500_000.0,
    )
    _print_rec("3) n_obs=5 -- p90 ignorado, sugiere conservadora", rec)
    assert rec.pct_sugerido_label == "conservadora"

    # 4) Lineal con saciedad
    rec = recomendar_baja(
        formula_tipo="lineal_con_saciedad",
        baja_media_historica_pct=10.0,
        baja_mediana_historica_pct=10.0,
        baja_p90_historica_pct=15.0,
        n_obs_historico=30,
        umbral_saciedad_pct=12.0,
        ofertes_esperadas=5.0,
        pct_criterios_objetivos=60.0,
        presupuesto_base=300_000.0,
    )
    _print_rec("4) Lineal + saciedad 12% -- default saciedad", rec)
    assert rec.pct_sugerido_label == "saciedad"

    # 5) Lineal con histórico abundante + peso precio alto
    rec = recomendar_baja(
        formula_tipo="lineal",
        baja_media_historica_pct=12.5,
        baja_mediana_historica_pct=12.0,
        baja_p90_historica_pct=16.5,
        n_obs_historico=80,
        ofertes_esperadas=10.0,
        pct_criterios_objetivos=70.0,
        presupuesto_base=2_000_000.0,
    )
    _print_rec("5) Lineal + n=80 + peso 70% -- default competitiva (p90)", rec)
    assert rec.pct_sugerido_label == "competitiva"

    # 6) Sin histórico ni saciedad
    rec = recomendar_baja(
        formula_tipo="lineal",
        baja_media_historica_pct=None,
        baja_mediana_historica_pct=None,
        baja_p90_historica_pct=None,
        n_obs_historico=0,
        ofertes_esperadas=None,
        pct_criterios_objetivos=80.0,
        presupuesto_base=400_000.0,
    )
    _print_rec("6) Sin histórico ni saciedad -- confianza ninguna", rec)
    assert rec.confianza == "ninguna"

    # 7) Extraer threshold del PCAP -- "20% sobre presupuesto base"
    extr = extraer_threshold_pcap(
        "Es consideraran ofertes anormals o desproporcionades aquelles "
        "que ofereixin una baixa superior al 20% sobre el pressupost base "
        "de licitació.",
        baja_media_historica=None,
    )
    print(f"\n=== 7) Regex '20% sobre presupuesto' → {extr}")
    assert extr is not None and extr[0] == 20.0

    # 8) Extraer threshold "media + 10pp" / "10 puntos sobre la media"
    extr = extraer_threshold_pcap(
        "Es consideraran baixes anormals aquelles que siguin inferiors "
        "en més de 10 punts percentuals a la mitjana de les ofertes.",
        baja_media_historica=12.0,
    )
    print(f"\n=== 8a) Regex 'media + 10pp' (media=12) → {extr}")
    assert extr is not None and abs(extr[0] - 22.0) < 0.01

    # 8b) "15% sobre la media" — DELIBERADAMENTE no extrae (ambiguo: pp vs %).
    extr = extraer_threshold_pcap(
        "Se considerarán bajas temerarias las que superen un 15% sobre la media aritmética.",
        baja_media_historica=10.0,
    )
    print(f"\n=== 8b) '15% sobre la media' (ambiguo) → {extr}")
    assert extr is None, "Patrón ambiguo no debe extraerse para no inventar"

    # 9) Integración: threshold del PCAP entra en recomendar_baja
    rec = recomendar_baja(
        formula_tipo="lineal",
        baja_media_historica_pct=12.0,
        baja_mediana_historica_pct=11.5,
        baja_p90_historica_pct=15.5,
        n_obs_historico=40,
        ofertes_esperadas=8.0,
        pct_criterios_objetivos=70.0,
        baja_temeraria_extracto=(
            "Baixa anormal: superior al 18% sobre el pressupost base"
        ),
        presupuesto_base=600_000.0,
    )
    _print_rec("9) Threshold PCAP=18% → fuente=pcap", rec)
    assert rec.techo_temerario_fuente == "pcap"
    assert rec.techo_temerario_pct == 18.0

    # 10) Campo IA explícito baja_temeraria_pct + base=presupuesto_base
    rec = recomendar_baja(
        formula_tipo="lineal",
        baja_media_historica_pct=10.0,
        baja_mediana_historica_pct=10.0,
        baja_p90_historica_pct=14.0,
        n_obs_historico=40,
        ofertes_esperadas=8.0,
        pct_criterios_objetivos=70.0,
        baja_temeraria_pct=15.0,
        baja_temeraria_base="presupuesto_base",
        baja_temeraria_extracto="texto irrelevante con número 99 que NO debe usarse",
        presupuesto_base=500_000.0,
    )
    _print_rec("10) Campo IA explícito 15% s/ presupuesto", rec)
    assert rec.techo_temerario_pct == 15.0
    assert rec.techo_temerario_fuente == "pcap"

    # 11) Base=media_aritmetica → IA no da pct directo, debe caer a regex/LCSP
    rec = recomendar_baja(
        formula_tipo="lineal",
        baja_media_historica_pct=10.0,
        baja_mediana_historica_pct=10.0,
        baja_p90_historica_pct=14.0,
        n_obs_historico=40,
        ofertes_esperadas=8.0,
        pct_criterios_objetivos=70.0,
        baja_temeraria_pct=10.0,
        baja_temeraria_base="media_aritmetica",  # base relativa → ignorado
        baja_temeraria_extracto=None,
        presupuesto_base=500_000.0,
    )
    _print_rec("11) Base=media_aritmetica → ignorado, fallback LCSP", rec)
    assert rec.techo_temerario_fuente == "lcsp_149"

    # ─── Casos de "el motor NO inventa" ───────────────────────────────────

    # 12) Sin ofertes ni media → threshold None (no fabrica 15%)
    rec = recomendar_baja(
        formula_tipo="lineal",
        baja_media_historica_pct=None,
        baja_mediana_historica_pct=None,
        baja_p90_historica_pct=None,
        n_obs_historico=0,
        ofertes_esperadas=None,
        pct_criterios_objetivos=70.0,
        presupuesto_base=400_000.0,
    )
    _print_rec("12) Sin datos → threshold None, sin techo_legal inventado", rec)
    assert rec.techo_temerario_pct is None
    assert rec.techo_temerario_fuente is None
    assert all(r.label != "techo_legal" for r in rec.referencias)

    # 13) Mediana presente pero n_obs<10 → no fabrica competitiva
    rec = recomendar_baja(
        formula_tipo="lineal",
        baja_media_historica_pct=12.0,
        baja_mediana_historica_pct=11.5,
        baja_p90_historica_pct=18.0,  # debería ignorarse, n<10
        n_obs_historico=5,
        ofertes_esperadas=3.0,
        pct_criterios_objetivos=70.0,
        presupuesto_base=500_000.0,
    )
    _print_rec("13) n_obs<10 → sin referencia competitiva fabricada", rec)
    assert all(r.label != "competitiva" for r in rec.referencias), (
        "competitiva no debe aparecer cuando p90 no es fiable"
    )

    # 14) ofertes_esperadas ahora se respeta tal cual (no se fabrica n=4)
    # Caso real Badalona: ofertes_avg=2.25 → LCSP 149.2.b → threshold=20%
    rec = recomendar_baja(
        formula_tipo="lineal",
        baja_media_historica_pct=18.71,
        baja_mediana_historica_pct=18.5,
        baja_p90_historica_pct=22.0,
        n_obs_historico=4,
        ofertes_esperadas=2.25,  # real, no fabricated
        pct_criterios_objetivos=100.0,
        presupuesto_base=500_000.0,
    )
    _print_rec("14) Badalona honesto: ofertes=2.25 → LCSP 149.2.b → 20%", rec)
    assert rec.techo_temerario_pct == 20.0
    assert "mediana" in " ".join(rec.advertencias).lower() if rec.advertencias else True

    print("\n[OK] Todos los casos OK")


if __name__ == "__main__":
    main()
