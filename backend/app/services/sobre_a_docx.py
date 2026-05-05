"""Generador del Sobre A en formato .docx (Microsoft Word).

Se construye programáticamente desde el `snapshot` JSONB del registro de
SobreAGeneracion — los mismos datos que alimentan el HTML de preview,
pero con un layout neutral pensado para que el usuario lo edite en Word
antes de imprimir, firmar y subir el PDF al portal.

Diseño deliberadamente sobrio: Calibri 11, sin tipografía editorial.
El usuario va a editar este documento; los floruras se las sumamos al
preview HTML y al render final, no aquí.
"""
from __future__ import annotations

import io
from typing import Any

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Cm, Pt, RGBColor

# Las declaraciones LCSP estándar — espina dorsal del Sobre A.
DECLARACIONES_LCSP: list[str] = [
    "Posee personalidad jurídica y, en su caso, representación suficiente "
    "para concurrir a la presente licitación.",
    "Cumple las condiciones establecidas legalmente para contratar con la "
    "Administración Pública (art. 65 LCSP).",
    "No se encuentra incursa en ninguna de las prohibiciones para contratar "
    "previstas en el art. 71 LCSP.",
    "Se encuentra al corriente del cumplimiento de sus obligaciones "
    "tributarias con la Hacienda estatal y autonómica catalana.",
    "Se encuentra al corriente del cumplimiento de sus obligaciones con la "
    "Seguridad Social.",
    "No se halla en situación de concurso de acreedores ni ha solicitado la "
    "declaración del mismo.",
    "No ha incurrido en falsedad al efectuar las declaraciones responsables "
    "exigidas en este procedimiento.",
    "Se compromete a aportar, en el plazo concedido, la documentación "
    "acreditativa de los extremos declarados en caso de resultar adjudicataria.",
]


def _fmt_eur(v: Any) -> str:
    if v is None or v == "":
        return "—"
    try:
        n = float(str(v))
    except (ValueError, TypeError):
        return "—"
    return f"{n:,.0f} €".replace(",", ".")


def _add_h1(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(14)
    run.font.color.rgb = RGBColor(0x18, 0x18, 0x1B)


def _add_h2(doc: Document, text: str) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run(text.upper())
    run.bold = True
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0x52, 0x52, 0x5B)


def _add_kv(doc: Document, label: str, value: str | None) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    label_run = p.add_run(f"{label}: ")
    label_run.bold = True
    label_run.font.size = Pt(11)
    val_run = p.add_run(value or "—")
    val_run.font.size = Pt(11)


def _add_para(doc: Document, text: str, *, italic: bool = False) -> None:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(6)
    run = p.add_run(text)
    run.font.size = Pt(11)
    if italic:
        run.italic = True


def generar_docx(snapshot: dict[str, Any]) -> bytes:
    """Construye el .docx desde el snapshot persistido y devuelve los bytes."""
    empresa = snapshot.get("empresa") or {}
    licitacion = snapshot.get("licitacion") or {}
    usa_relic = bool(snapshot.get("usa_relic"))
    n_registral = snapshot.get("n_registral")
    clasificaciones = snapshot.get("clasificaciones") or []
    docs_extra = snapshot.get("docs_extra") or []
    fecha_emision = snapshot.get("fecha_emision") or ""

    doc = Document()

    # Márgenes A4 amplios
    for section in doc.sections:
        section.top_margin = Cm(2)
        section.bottom_margin = Cm(2)
        section.left_margin = Cm(2.2)
        section.right_margin = Cm(2.2)

    # Estilo base Calibri
    style = doc.styles["Normal"]
    style.font.name = "Calibri"
    style.font.size = Pt(11)

    # ── Título ────────────────────────────────────────────────────────
    _add_h1(doc, "DECLARACIÓN RESPONSABLE — SOBRE A")

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(18)
    run = p.add_run(
        f"Procedimiento abierto · {licitacion.get('titulo') or '(sin título)'}"
    )
    run.italic = True
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0x71, 0x71, 0x7A)

    # ── Datos de la licitación ───────────────────────────────────────
    _add_h2(doc, "Licitación")
    _add_kv(doc, "Expediente", licitacion.get("expediente"))
    _add_kv(doc, "Órgano de contratación", licitacion.get("organismo"))
    if licitacion.get("importe_licitacion"):
        _add_kv(
            doc,
            "Presupuesto base de licitación",
            _fmt_eur(licitacion.get("importe_licitacion")),
        )

    # ── Datos del licitador ──────────────────────────────────────────
    _add_h2(doc, "Datos del licitador")
    _add_kv(doc, "Razón social", empresa.get("nombre"))
    _add_kv(doc, "CIF/NIF", empresa.get("cif"))

    direccion_partes = [
        empresa.get("direccion_calle"),
        empresa.get("direccion_codigo_postal"),
        empresa.get("direccion_ciudad"),
    ]
    direccion = ", ".join(p for p in direccion_partes if p)
    if empresa.get("direccion_provincia"):
        direccion = (
            f"{direccion} ({empresa['direccion_provincia']})"
            if direccion
            else f"({empresa['direccion_provincia']})"
        )
    _add_kv(doc, "Domicilio social", direccion or None)

    if empresa.get("telefono"):
        _add_kv(doc, "Teléfono", empresa.get("telefono"))
    if empresa.get("email"):
        _add_kv(doc, "Correo electrónico", empresa.get("email"))
    if empresa.get("iae"):
        _add_kv(doc, "Epígrafe IAE", empresa.get("iae"))

    # ── Representante legal ─────────────────────────────────────────
    _add_h2(doc, "Representante legal con poder bastante")
    if empresa.get("representante_nombre"):
        repr_partes = [empresa["representante_nombre"]]
        if empresa.get("representante_nif"):
            repr_partes.append(f"NIF {empresa['representante_nif']}")
        if empresa.get("representante_cargo"):
            repr_partes.append(empresa["representante_cargo"])
        _add_para(doc, " · ".join(repr_partes))
    else:
        _add_para(
            doc,
            "[Pendiente: completar nombre, NIF y cargo del representante en "
            "el módulo Empresa antes de firmar.]",
            italic=True,
        )

    # ── Solvencia ───────────────────────────────────────────────────
    _add_h2(doc, "Solvencia")
    if usa_relic and n_registral:
        _add_para(
            doc,
            f"La empresa se encuentra inscrita en el Registro Electrónico de "
            f"Empresas Licitadoras de la Generalitat de Catalunya (RELIC) con "
            f"el número registral {n_registral}, lo que acredita los "
            f"requisitos de capacidad y solvencia exigidos en el procedimiento "
            f"abierto simplificado del art. 159.4 LCSP.",
        )
        if clasificaciones:
            _add_para(doc, "Clasificaciones de obras vigentes:")
            for c in clasificaciones:
                cat = c.get("categoria")
                grp = c.get("grupo") or "—"
                sub = c.get("subgrupo") or "—"
                fuente = c.get("fuente", "")
                fuente_label = " (RELIC)" if fuente == "relic" else " (manual)"
                line = f"   • Grupo {grp}, Subgrupo {sub}"
                if cat is not None:
                    line += f", Categoría {cat}"
                line += fuente_label
                _add_para(doc, line)
    else:
        if clasificaciones:
            _add_para(doc, "Clasificaciones declaradas en obras:")
            for c in clasificaciones:
                cat = c.get("categoria")
                grp = c.get("grupo") or "—"
                sub = c.get("subgrupo") or "—"
                line = f"   • Grupo {grp}, Subgrupo {sub}"
                if cat is not None:
                    line += f", Categoría {cat}"
                _add_para(doc, line)
        if empresa.get("volumen_negocio_n"):
            _add_kv(
                doc,
                "Volumen anual de negocio (último ejercicio)",
                _fmt_eur(empresa.get("volumen_negocio_n")),
            )

    # ── Declaraciones responsables ──────────────────────────────────
    _add_h2(doc, "Declaraciones responsables")
    _add_para(
        doc,
        "El representante firmante DECLARA, bajo su responsabilidad, lo "
        "siguiente:",
    )
    for i, decl in enumerate(DECLARACIONES_LCSP, start=1):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.left_indent = Cm(0.6)
        run = p.add_run(f"{i}. ")
        run.bold = True
        run.font.size = Pt(11)
        run = p.add_run(decl)
        run.font.size = Pt(11)

    # ── Documentación adicional exigida por el pliego ────────────────
    if docs_extra:
        _add_h2(doc, "Documentación adicional exigida por el pliego")
        _add_para(
            doc,
            "Se aporta la documentación complementaria requerida en el PCAP:",
        )
        for d in docs_extra:
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(2)
            p.paragraph_format.left_indent = Cm(0.6)
            run = p.add_run("• ")
            run.font.size = Pt(11)
            run = p.add_run(d)
            run.font.size = Pt(11)

    # ── Lugar y fecha + firma ───────────────────────────────────────
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(24)
    p.paragraph_format.space_after = Pt(60)
    p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    ciudad = empresa.get("direccion_ciudad") or "_______________"
    run = p.add_run(f"En {ciudad}, a {fecha_emision}.")
    run.font.size = Pt(11)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run("Firma del representante legal")
    run.italic = True
    run.font.size = Pt(10)
    run.font.color.rgb = RGBColor(0x71, 0x71, 0x7A)

    # ── Serializar a bytes ──────────────────────────────────────────
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
