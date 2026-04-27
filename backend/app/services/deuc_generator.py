"""Generador del Sobre A (DEUC + declaración responsable) en HTML.

MVP: HTML puro generado en Python (sin Jinja2 — el venv del proyecto no
trae pip y la complejidad del template no justifica la dependencia
adicional). Si en el futuro se añade Jinja2, este módulo se reescribe a
templates `app/templates/sobre_a/*.html.j2` con la misma lógica.

Estrategia DEUC ultra-simplificado:
  - Si la empresa está inscrita en RELIC y NO tiene prohibición de
    contratar, se usa el bloque corto "consta en RELIC nº X" con la base
    legal del art. 159.4 LCSP + normativa autonómica catalana.
  - En cualquier otro caso, se renderiza la declaración detallada con la
    lista de clasificaciones (manuales + RELIC) y el volumen anual de
    negocio.

Las declaraciones responsables LCSP estándar (no incursa en prohibición,
al corriente Hacienda/SS, no concurso, etc.) se incluyen siempre — son
la "espina dorsal" del Sobre A.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from html import escape
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.clasificacion_rolece import ClasificacionRolece
from app.models.empresa import Empresa
from app.models.empresa_relic import EmpresaRelic
from app.models.licitacion import Licitacion
from app.models.licitacion_analisis_ia import LicitacionAnalisisIA

TAMANO_PYME_LABELS = {
    "micro": "Microempresa (<10 empleados)",
    "pequena": "Pequeña empresa (<50 empleados)",
    "mediana": "Mediana empresa (<250 empleados)",
    "grande": "Gran empresa (≥250 empleados)",
}

MESES_ES = {
    1: "enero",
    2: "febrero",
    3: "marzo",
    4: "abril",
    5: "mayo",
    6: "junio",
    7: "julio",
    8: "agosto",
    9: "septiembre",
    10: "octubre",
    11: "noviembre",
    12: "diciembre",
}


def _fecha_larga_es(d: date) -> str:
    return f"{d.day} de {MESES_ES[d.month]} de {d.year}"


def _e(value: Any) -> str:
    """HTML-escape a value, devolviendo cadena vacía si es None."""
    if value is None:
        return ""
    return escape(str(value), quote=True)


def _fmt_eur(v: Decimal | float | int | None) -> str:
    if v is None:
        return "—"
    try:
        n = float(v)
    except (ValueError, TypeError):
        return "—"
    return f"{n:,.0f} €".replace(",", ".")


@dataclass
class SobreAGenerated:
    html: str
    snapshot: dict[str, Any]
    usa_relic: bool


async def generar_sobre_a(
    db: AsyncSession,
    empresa_id: UUID,
    expediente: str,
) -> SobreAGenerated:
    """Genera el Sobre A renderizado para una pareja (empresa, licitación)."""
    empresa = await db.scalar(
        select(Empresa).where(Empresa.id == empresa_id)
    )
    if empresa is None:
        raise ValueError(f"Empresa {empresa_id} no encontrada")

    licitacion = await db.scalar(
        select(Licitacion).where(Licitacion.expediente == expediente)
    )
    if licitacion is None:
        raise ValueError(f"Licitación con expediente {expediente!r} no encontrada")

    relic = await db.scalar(
        select(EmpresaRelic)
        .where(EmpresaRelic.empresa_id == empresa_id)
        .options(selectinload(EmpresaRelic.clasificaciones_relic))
    )

    clasif_manual = list(
        (
            await db.execute(
                select(ClasificacionRolece).where(
                    ClasificacionRolece.empresa_id == empresa_id,
                    ClasificacionRolece.activa.is_(True),
                    ClasificacionRolece.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )

    analisis = await db.scalar(
        select(LicitacionAnalisisIA).where(
            LicitacionAnalisisIA.licitacion_id == licitacion.id
        )
    )
    docs_extra: list[str] = []
    if analisis and analisis.extracted_data:
        raw = analisis.extracted_data.get("docs_extra_sobre_a") or []
        if isinstance(raw, list):
            docs_extra = [str(d) for d in raw if d]

    usa_relic = bool(relic and not relic.prohibicio)

    clasificaciones: list[dict[str, Any]] = []
    if relic:
        for c in relic.clasificaciones_relic:
            if c.tipus_cl == "OBRES" and not c.suspensio:
                clasificaciones.append(
                    {
                        "grupo": c.grupo,
                        "subgrupo": c.subgrupo,
                        "categoria": c.categoria,
                        "fuente": "relic",
                    }
                )
    for c in clasif_manual:
        clasificaciones.append(
            {
                "grupo": c.grupo,
                "subgrupo": c.subgrupo,
                "categoria": c.categoria,
                "fuente": "manual",
            }
        )

    fecha = _fecha_larga_es(date.today())
    html = _render_html(
        empresa=empresa,
        licitacion=licitacion,
        relic=relic,
        usa_relic=usa_relic,
        clasificaciones=clasificaciones,
        docs_extra=docs_extra,
        fecha=fecha,
    )

    snapshot: dict[str, Any] = {
        "empresa": {
            "nombre": empresa.nombre,
            "cif": empresa.cif,
            "email": empresa.email,
            "telefono": empresa.telefono,
            "iae": empresa.iae,
            "tamano_pyme": empresa.tamano_pyme,
            "direccion_calle": empresa.direccion_calle,
            "direccion_codigo_postal": empresa.direccion_codigo_postal,
            "direccion_ciudad": empresa.direccion_ciudad,
            "direccion_provincia": empresa.direccion_provincia,
            "direccion_pais": empresa.direccion_pais,
            "representante_nombre": empresa.representante_nombre,
            "representante_nif": empresa.representante_nif,
            "representante_cargo": empresa.representante_cargo,
            "volumen_negocio_n": str(empresa.volumen_negocio_n)
            if empresa.volumen_negocio_n is not None
            else None,
        },
        "licitacion": {
            "expediente": licitacion.expediente,
            "titulo": licitacion.titulo,
            "organismo": licitacion.organismo,
            "importe_licitacion": str(licitacion.importe_licitacion)
            if licitacion.importe_licitacion is not None
            else None,
        },
        "usa_relic": usa_relic,
        "n_registral": relic.n_registral if relic else None,
        "clasificaciones": clasificaciones,
        "docs_extra": docs_extra,
        "fecha_emision": fecha,
    }

    return SobreAGenerated(html=html, snapshot=snapshot, usa_relic=usa_relic)


def _render_html(
    *,
    empresa: Empresa,
    licitacion: Licitacion,
    relic: EmpresaRelic | None,
    usa_relic: bool,
    clasificaciones: list[dict[str, Any]],
    docs_extra: list[str],
    fecha: str,
) -> str:
    """Construye el HTML completo del Sobre A.

    Print stylesheet inline. Editorial: serif, A4, márgenes 2cm. El HTML
    está diseñado para abrirse en iframe del frontend y disparar
    `window.print()` para que el cliente lo guarde como PDF.
    """
    # Bloques de identificación
    direccion_partes = [
        empresa.direccion_calle,
        empresa.direccion_codigo_postal,
        empresa.direccion_ciudad,
        f"({empresa.direccion_provincia})" if empresa.direccion_provincia else None,
    ]
    direccion = ", ".join(p for p in direccion_partes[:3] if p)
    if empresa.direccion_provincia:
        direccion = f"{direccion} ({empresa.direccion_provincia})" if direccion else f"({empresa.direccion_provincia})"

    tamano_label = TAMANO_PYME_LABELS.get(empresa.tamano_pyme or "", "")

    representante_html = ""
    if empresa.representante_nombre:
        partes_repr = [_e(empresa.representante_nombre)]
        if empresa.representante_nif:
            partes_repr.append(f"NIF {_e(empresa.representante_nif)}")
        if empresa.representante_cargo:
            partes_repr.append(_e(empresa.representante_cargo))
        representante_html = (
            "<p><strong>" + partes_repr[0] + "</strong>"
            + (" · " + " · ".join(partes_repr[1:]) if len(partes_repr) > 1 else "")
            + "</p>"
        )
    else:
        representante_html = (
            '<p class="warning"><strong>⚠ Falta representante legal en M2.</strong> '
            "Completa <code>/empresa/perfil</code> con nombre, NIF y cargo antes "
            "de firmar este documento.</p>"
        )

    # Bloque solvencia
    if usa_relic and relic is not None:
        solvencia_html = (
            '<div class="relic-banner">'
            "<p><strong>Empresa inscrita en RELIC.</strong> "
            "A los efectos del artículo 159.4 de la Ley 9/2017 de Contratos del "
            "Sector Público (LCSP) y la normativa de contratación pública "
            "catalana aplicable, la presente declaración acredita la "
            "personalidad jurídica, capacidad de obrar, representación y "
            "solvencia económica/financiera y técnica/profesional mediante la "
            "inscripción en el <em>Registre Electrònic d'Empreses Licitadores i "
            "Classificades de Catalunya</em> con número registral "
            f"<strong>{_e(relic.n_registral)}</strong>. Los datos completos "
            "se encuentran consultables en el portal oficial RELIC.</p>"
            "</div>"
        )
        clasif_inline_html = ""  # No detallamos en versión RELIC simplificada
    else:
        solvencia_html = ""
        if clasificaciones:
            items = "".join(
                f"<li>Clasificación grupo <strong>{_e(c['grupo'])}</strong>"
                + (f"-{_e(c['subgrupo'])}" if c.get("subgrupo") else "")
                + (f", categoría <strong>{_e(c['categoria'])}</strong>" if c.get("categoria") else "")
                + (f' <span class="muted">(según RELIC)</span>' if c.get("fuente") == "relic" else "")
                + "</li>"
                for c in clasificaciones
            )
            clasif_inline_html = f"<ul>{items}</ul>"
        else:
            clasif_inline_html = (
                "<p>No se aportan clasificaciones empresariales — la solvencia "
                "se acredita por los medios alternativos previstos en el pliego "
                "(volumen anual de negocio y/o experiencia documentada).</p>"
            )
        if empresa.volumen_negocio_n is not None:
            clasif_inline_html += (
                f"<p>Volumen anual de negocio del último ejercicio: "
                f"<strong>{_e(_fmt_eur(empresa.volumen_negocio_n))}</strong></p>"
            )

    # Bloque docs_extra (si M3 detectó documentación adicional exigida)
    docs_extra_html = ""
    if docs_extra:
        items = "".join(f"<li>{_e(d)}</li>" for d in docs_extra)
        docs_extra_html = (
            '<section class="section">'
            "<h2>Documentación adicional exigida por el órgano contratante</h2>"
            "<p>Conforme al Pliego de Cláusulas Administrativas Particulares, "
            "se incluye además la siguiente documentación:</p>"
            f"<ul>{items}</ul>"
            "</section>"
        )

    # Numeración de declaraciones — la 7ª varía si hay RELIC o no
    decl_extra_solvencia = ""
    if not usa_relic:
        decl_extra_solvencia = (
            '<div class="declaration"><strong>7.</strong> Que la empresa '
            "cumple los requisitos de solvencia económica y financiera y "
            "técnica o profesional exigidos por el pliego, según el detalle "
            f"siguiente:{clasif_inline_html}</div>"
        )
        n_compromiso, n_veracidad = 8, 9
    else:
        n_compromiso, n_veracidad = 7, 8

    ciudad_firma = empresa.direccion_ciudad or "—"

    return f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Sobre A · {_e(licitacion.expediente)}</title>
<style>
  @page {{ size: A4; margin: 2cm; }}
  body {{
    font-family: "Times New Roman", Times, serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #000;
    background: #fff;
    margin: 0;
    padding: 24pt;
    max-width: 800px;
    margin-inline: auto;
  }}
  h1 {{ font-size: 18pt; margin: 0; letter-spacing: 0.04em; }}
  h2 {{ font-size: 11pt; margin: 1.6em 0 0.4em 0; text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 1px solid #000; padding-bottom: 2pt; }}
  .meta {{ font-size: 9.5pt; color: #444; margin: 0.2em 0 1.6em 0; }}
  .meta strong {{ color: #000; }}
  .section {{ margin-bottom: 1.2em; }}
  .declaration {{
    margin: 0.4em 0 0.7em 0;
    padding-left: 1em;
    border-left: 2px solid #ddd;
    text-align: justify;
  }}
  dl.datos {{ margin: 0; }}
  dl.datos dt {{ font-weight: bold; width: 32%; float: left; clear: left; }}
  dl.datos dd {{ margin: 0 0 0.25em 32%; }}
  dl.datos::after {{ content: ""; display: block; clear: both; }}
  .relic-banner {{
    background: #f4f4f4;
    border-left: 3px solid #000;
    padding: 0.6em 1em;
    margin: 1em 0;
    text-align: justify;
  }}
  .relic-banner p {{ margin: 0; }}
  .warning {{ color: #c45a5a; font-size: 9.5pt; }}
  .muted {{ color: #666; font-size: 9pt; }}
  ul {{ margin: 0.3em 0; padding-left: 1.4em; }}
  li {{ margin-bottom: 0.15em; }}
  code {{ font-family: ui-monospace, monospace; font-size: 9.5pt; background: #eee; padding: 1pt 4pt; border-radius: 2pt; }}
  .signature {{ margin-top: 3em; }}
  .signature-line {{
    margin-top: 5em;
    border-top: 1px solid #000;
    width: 60%;
    padding-top: 4pt;
    font-size: 9.5pt;
  }}
  .footer {{
    margin-top: 3em;
    padding-top: 0.5em;
    border-top: 1px solid #ddd;
    font-size: 8pt;
    color: #888;
    text-align: center;
  }}
  @media print {{
    body {{ padding: 0; max-width: none; }}
  }}
</style>
</head>
<body>

<header>
  <h1>SOBRE A</h1>
  <p class="meta"><em>Documentación administrativa · Declaración responsable conforme al art. 140 LCSP</em></p>
  <p class="meta">
    <strong>Expediente:</strong> {_e(licitacion.expediente)}<br>
    {f'<strong>Objeto:</strong> {_e(licitacion.titulo)}<br>' if licitacion.titulo else ''}
    <strong>Órgano contratante:</strong> {_e(licitacion.organismo) or "—"}<br>
    <strong>Fecha:</strong> {_e(fecha)}
  </p>
</header>

<section class="section">
  <h2>Datos del licitador</h2>
  <dl class="datos">
    <dt>Razón social</dt><dd>{_e(empresa.nombre)}</dd>
    <dt>CIF</dt><dd>{_e(empresa.cif)}</dd>
    {f'<dt>IAE</dt><dd>{_e(empresa.iae)}</dd>' if empresa.iae else ''}
    {f'<dt>Tamaño</dt><dd>{_e(tamano_label)}</dd>' if tamano_label else ''}
    {f'<dt>Domicilio</dt><dd>{_e(direccion)}</dd>' if direccion else ''}
    {f'<dt>Email</dt><dd>{_e(empresa.email)}</dd>' if empresa.email else ''}
    {f'<dt>Teléfono</dt><dd>{_e(empresa.telefono)}</dd>' if empresa.telefono else ''}
  </dl>
</section>

<section class="section">
  <h2>Representante legal</h2>
  {representante_html}
</section>

<section class="section">
  <h2>Declaración responsable</h2>
  {solvencia_html}
  <p>El representante legal arriba identificado, en nombre y representación de la empresa licitadora, <strong>DECLARA BAJO SU RESPONSABILIDAD</strong>:</p>

  <div class="declaration"><strong>1.</strong> Que la empresa está válidamente constituida y no se encuentra incursa en ninguna de las prohibiciones de contratar previstas en el artículo 71 de la Ley 9/2017 de Contratos del Sector Público (LCSP).</div>

  <div class="declaration"><strong>2.</strong> Que la empresa se halla al corriente del cumplimiento de las obligaciones tributarias con la Agencia Estatal de Administración Tributaria y, en su caso, con la Administración Tributaria de Cataluña.</div>

  <div class="declaration"><strong>3.</strong> Que la empresa se halla al corriente del cumplimiento de las obligaciones con la Tesorería General de la Seguridad Social.</div>

  <div class="declaration"><strong>4.</strong> Que la empresa no se encuentra en situación de concurso de acreedores, declaración de insolvencia, intervención judicial, suspensión de actividades o disolución.</div>

  <div class="declaration"><strong>5.</strong> Que ningún cargo directivo de la empresa se halla incurso en supuestos de incompatibilidad regulados por la Ley 3/2015 reguladora del ejercicio del alto cargo de la Administración General del Estado o normativa autonómica equivalente.</div>

  <div class="declaration"><strong>6.</strong> Que la empresa no ha cometido falsedad alguna al emitir declaraciones responsables o aportar información en procedimientos previos de contratación pública.</div>

  {decl_extra_solvencia}

  <div class="declaration"><strong>{n_compromiso}.</strong> Que se compromete, en caso de resultar adjudicataria, a aportar en el plazo máximo de 10 días hábiles desde el requerimiento de la mesa de contratación la documentación acreditativa de los puntos anteriores y a constituir la garantía definitiva equivalente al 5 % del importe de adjudicación, conforme al artículo 150 LCSP.</div>

  <div class="declaration"><strong>{n_veracidad}.</strong> Que la información y los datos consignados en esta declaración son ciertos. Conoce que la falsedad podrá ser causa de la prohibición de contratar prevista en el artículo 71.1.e) LCSP.</div>
</section>

{docs_extra_html}

<div class="signature">
  <p>{_e(ciudad_firma)}, a {_e(fecha)}</p>
  <div class="signature-line">
    Firma del representante legal &mdash; {_e(empresa.representante_nombre or '...')}
  </div>
</div>

<p class="footer">Generado por Licitum · Snapshot de los datos de empresa al momento de la generación · El sistema propone, el licitador firma.</p>

</body>
</html>
"""
