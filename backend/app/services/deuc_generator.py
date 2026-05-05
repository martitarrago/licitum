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
    clasif_exigida: dict[str, Any] | None = None
    if analisis and analisis.extracted_data:
        raw = analisis.extracted_data.get("docs_extra_sobre_a") or []
        if isinstance(raw, list):
            docs_extra = [str(d) for d in raw if d]
        # Clasificación que exige el PCAP (extraída por M3). Si la pide,
        # filtramos las clasificaciones de la empresa para mostrar SOLO la
        # que matchea — no todo el catálogo.
        grupo_pliego = analisis.extracted_data.get("clasificacion_grupo")
        subgrupo_pliego = analisis.extracted_data.get("clasificacion_subgrupo")
        cat_pliego = analisis.extracted_data.get("clasificacion_categoria")
        if grupo_pliego:
            clasif_exigida = {
                "grupo": str(grupo_pliego),
                "subgrupo": str(subgrupo_pliego) if subgrupo_pliego else None,
                "categoria": int(cat_pliego) if cat_pliego is not None else None,
            }

    usa_relic = bool(relic and not relic.prohibicio)

    # Recolección de clasificaciones de OBRAS de la empresa (RELIC + manuales).
    todas_clasif: list[dict[str, Any]] = []
    if relic:
        for c in relic.clasificaciones_relic:
            if c.tipus_cl == "OBRES" and not c.suspensio:
                todas_clasif.append(
                    {
                        "grupo": c.grupo,
                        "subgrupo": c.subgrupo,
                        "categoria": c.categoria,
                        "fuente": "relic",
                    }
                )
    for c in clasif_manual:
        todas_clasif.append(
            {
                "grupo": c.grupo,
                "subgrupo": c.subgrupo,
                "categoria": c.categoria,
                "fuente": "manual",
            }
        )

    # Filtrado: solo las relevantes para esta licitación.
    # 1. Si el pliego exige clasificación X → solo mostrar las que matchean
    #    grupo (y subgrupo si lo especifica). Categoría >= la exigida.
    # 2. Si el pliego NO exige clasificación y la empresa está en RELIC →
    #    no listar nada (RELIC ya las acredita por sí mismo).
    # 3. Si no exige y no está en RELIC → no listar nada (la solvencia se
    #    acredita por otros medios — volumen anual, experiencia).
    clasificaciones_relevantes: list[dict[str, Any]] = []
    if clasif_exigida:
        for c in todas_clasif:
            if c["grupo"] != clasif_exigida["grupo"]:
                continue
            if (
                clasif_exigida.get("subgrupo")
                and c.get("subgrupo") != clasif_exigida["subgrupo"]
            ):
                continue
            if (
                clasif_exigida.get("categoria") is not None
                and c.get("categoria") is not None
                and c["categoria"] < clasif_exigida["categoria"]
            ):
                continue
            clasificaciones_relevantes.append(c)

    fecha = _fecha_larga_es(date.today())
    html = _render_html(
        empresa=empresa,
        licitacion=licitacion,
        relic=relic,
        usa_relic=usa_relic,
        clasif_exigida=clasif_exigida,
        clasificaciones_relevantes=clasificaciones_relevantes,
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
        # Clasificaciones FILTRADAS por relevancia para esta licitación
        # (no el catálogo entero de la empresa). Si el pliego no exige
        # clasificación, esta lista va vacía.
        "clasificaciones": clasificaciones_relevantes,
        "clasificacion_exigida": clasif_exigida,
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
    clasif_exigida: dict[str, Any] | None,
    clasificaciones_relevantes: list[dict[str, Any]],
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

    # Bloque RELIC — banner inicial cuando aplica.
    if usa_relic and relic is not None:
        relic_banner_html = (
            '<div class="relic-banner">'
            "<p><strong>Empresa inscrita en el RELIC.</strong> "
            "Conforme al artículo 159.4 LCSP y la normativa de contratación "
            "pública catalana aplicable, esta inscripción exime al licitador "
            "de aportar la documentación que ya consta en el "
            "<em>Registre Electrònic d'Empreses Licitadores i Classificades "
            "de Catalunya</em>. Número registral: "
            f"<strong>{_e(relic.n_registral)}</strong>.</p>"
            "</div>"
        )
    else:
        relic_banner_html = ""

    # Bloque clasificación: solo si el pliego la exige.
    clasif_decl_html = ""
    if clasif_exigida:
        exig = clasif_exigida
        exig_str = f"grupo {_e(exig['grupo'])}"
        if exig.get("subgrupo"):
            exig_str += f", subgrupo {_e(exig['subgrupo'])}"
        if exig.get("categoria") is not None:
            exig_str += f", categoría {_e(exig['categoria'])}"
        if clasificaciones_relevantes:
            # La empresa cumple la clasificación exigida.
            items = "".join(
                f"<li>Clasificación {_e(c['grupo'])}"
                + (f"-{_e(c['subgrupo'])}" if c.get("subgrupo") else "")
                + (f", categoría {_e(c['categoria'])}" if c.get("categoria") else "")
                + (
                    ' <span class="muted">(acreditada en RELIC)</span>'
                    if c.get("fuente") == "relic"
                    else ""
                )
                + "</li>"
                for c in clasificaciones_relevantes
            )
            clasif_decl_html = (
                f"<p>Clasificación exigida en el PCAP: <strong>{exig_str}</strong>. "
                "El licitador la acredita con la siguiente clasificación vigente:</p>"
                f"<ul>{items}</ul>"
            )
        else:
            # El pliego exige clasificación pero la empresa no la tiene.
            # Aviso explícito — el usuario debe revisar antes de firmar.
            clasif_decl_html = (
                f'<p class="warning"><strong>⚠ Clasificación exigida no '
                f"localizada.</strong> El PCAP requiere "
                f"<strong>{exig_str}</strong> pero esta clasificación no "
                "consta vigente en los datos del licitador. Revisa el "
                "módulo Empresa antes de firmar este documento.</p>"
            )

    # Bloque docs_extra (si M3 detectó documentación adicional exigida)
    docs_extra_html = ""
    if docs_extra:
        items = "".join(f"<li>{_e(d)}</li>" for d in docs_extra)
        docs_extra_html = (
            '<section class="section">'
            "<h2>Documentación adicional exigida por el órgano contratante</h2>"
            "<p>Conforme al Pliego de Cláusulas Administrativas Particulares, "
            "el licitador deberá aportar adicionalmente la siguiente "
            "documentación al sobre único de la oferta:</p>"
            f"<ul>{items}</ul>"
            "</section>"
        )

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
  <h1>DECLARACIÓN RESPONSABLE</h1>
  <p class="meta"><em>Documentación administrativa del Sobre A · art. 159.4 LCSP</em></p>
  <p class="meta">
    <strong>Expediente:</strong> {_e(licitacion.expediente)}<br>
    {f'<strong>Objeto:</strong> {_e(licitacion.titulo)}<br>' if licitacion.titulo else ''}
    <strong>Órgano contratante:</strong> {_e(licitacion.organismo) or "—"}<br>
    <strong>Fecha:</strong> {_e(fecha)}
  </p>
</header>

{relic_banner_html}

<section class="section">
  <h2>Datos del licitador</h2>
  <dl class="datos">
    <dt>Razón social</dt><dd>{_e(empresa.nombre)}</dd>
    <dt>CIF</dt><dd>{_e(empresa.cif)}</dd>
    {f'<dt>IAE</dt><dd>{_e(empresa.iae)}</dd>' if empresa.iae else ''}
    {f'<dt>Tamaño</dt><dd>{_e(tamano_label)}</dd>' if tamano_label else ''}
    {f'<dt>Domicilio fiscal</dt><dd>{_e(direccion)}</dd>' if direccion else ''}
    {f'<dt>Teléfono</dt><dd>{_e(empresa.telefono)}</dd>' if empresa.telefono else ''}
    {f'<dt>Email habilitado para notificaciones</dt><dd>{_e(empresa.email)}</dd>' if empresa.email else ''}
  </dl>
</section>

<section class="section">
  <h2>Representante legal</h2>
  {representante_html}
</section>

<section class="section">
  <h2>Declaración responsable (art. 159.4 LCSP)</h2>
  <p>El representante legal arriba identificado, en nombre y representación de la empresa licitadora, <strong>DECLARA BAJO SU RESPONSABILIDAD</strong>:</p>

  <div class="declaration"><strong>1.</strong> Ostentar la <strong>representación válida y suficiente</strong> de la sociedad licitadora para concurrir al presente procedimiento.</div>

  <div class="declaration"><strong>2.</strong> Que la empresa se halla <strong>válidamente constituida</strong>, dispone de la capacidad de obrar exigida por el art. 65 LCSP y cuenta con las <strong>autorizaciones administrativas</strong> precisas para el ejercicio de la actividad objeto de este contrato.</div>

  <div class="declaration"><strong>3.</strong> Que ni la empresa ni sus administradores incurren en ninguna de las <strong>prohibiciones de contratar</strong> previstas en el artículo 71 de la Ley 9/2017 de Contratos del Sector Público (LCSP).</div>

  <div class="declaration"><strong>4.</strong> Que la empresa cumple los <strong>requisitos de solvencia económica y financiera y técnica o profesional</strong> exigidos por el Pliego de Cláusulas Administrativas Particulares.{(' ' + clasif_decl_html) if clasif_decl_html else ''}</div>

  <div class="declaration"><strong>5.</strong> Que la empresa se halla al <strong>corriente del cumplimiento de las obligaciones tributarias</strong> con la Agencia Estatal de Administración Tributaria y con la Administración Tributaria de Cataluña, así como de las <strong>obligaciones con la Tesorería General de la Seguridad Social</strong>.</div>

  <div class="declaration"><strong>6.</strong> Que la empresa <strong>no se encuentra en situación de concurso</strong> de acreedores, declaración de insolvencia, intervención judicial, suspensión de actividades o disolución.</div>

  <div class="declaration"><strong>7.</strong> Que la empresa <strong>no ha incurrido en falsedad</strong> al emitir declaraciones responsables o aportar información en procedimientos previos de contratación pública.</div>

  <div class="declaration"><strong>8.</strong> Que el licitador <strong>se compromete a adscribir a la ejecución del contrato</strong> los medios personales y materiales suficientes (art. 76.2 LCSP) y a aportar, en caso de resultar adjudicataria y dentro del plazo establecido por la mesa de contratación, la documentación acreditativa de los extremos declarados.</div>

  <div class="declaration"><strong>9.</strong> Que la empresa <strong>designa la dirección de correo electrónico</strong> arriba indicada como medio preferente para la práctica de las notificaciones derivadas de este procedimiento.</div>

  <div class="declaration"><strong>10.</strong> Que la información y los datos consignados en esta declaración son <strong>ciertos</strong>. El firmante conoce que la falsedad podrá ser causa de la prohibición de contratar prevista en el art. 71.1.e) LCSP.</div>
</section>

{docs_extra_html}

<div class="signature">
  <p>{_e(ciudad_firma)}, a {_e(fecha)}</p>
  <div class="signature-line">
    Firma del representante legal &mdash; {_e(empresa.representante_nombre or '...')}
  </div>
</div>

</body>
</html>
"""
