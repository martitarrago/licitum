"""Construye EmpresaContext desde M2 — el cruce M2 ↔ scoring.

Dos pasos limpios:

1. `build_empresa_static_profile(session, empresa_id)`:
   Lee datos M2 estables (preferencias, clasificaciones ROLECE/RELIC,
   anualidad media, dirección NUTS, documentos vigentes). NO depende de
   ninguna licitación concreta. Cacheable.

2. `evaluate_empresa_for_licitacion(profile, licitacion)`:
   Combina el profile con UNA licitación específica. Aquí calculamos
   `cumple_clasificacion` (proxy: semáforo pre-calculado del Radar),
   `cumple_solvencia` (anualidad_media vs presupuesto),
   `distancia_km`/`es_misma_provincia` (NUTS empresa vs lloc obra),
   `dias_a_cierre`. Devuelve `EmpresaContext` listo para `score_licitacion`.

Esta separación deja claro qué es M2 y qué es per-pliego (futuro M3
extraerá del PCAP los requisitos exactos y mejorará los proxies).
"""
from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.enums import EstadoCertificado
from app.intel.scoring.service import EmpresaContext
from app.models.certificado_obra import CertificadoObra
from app.models.clasificacion_rolece import ClasificacionRolece
from app.models.documento_empresa import DocumentoEmpresa
from app.models.empresa import Empresa
from app.models.empresa_preferencias import (
    EmpresaPreferenciaCpv,
    EmpresaPreferenciaTerritorio,
    EmpresaPreferencias,
)
from app.models.licitacion import Licitacion


# Documentos cuya caducidad bloquea la formalización post-adjudicación
# (LCSP — el órgano da 10 días hábiles tras adjudicación provisional).
DOCUMENTOS_CRITICOS_FORMALIZACION = (
    "hacienda_corriente",
    "ss_corriente",
    "poliza_rc",
)
DIAS_PRE_CADUCIDAD = 30  # mismo umbral que en schemas/documento_empresa.py


# ----------------------------------------------------------------------------
# Static profile (info estable de la empresa — cacheable)
# ----------------------------------------------------------------------------


@dataclass(frozen=True)
class EmpresaStaticProfile:
    empresa_id: uuid.UUID
    cif: str | None
    # Geografía — codigo INE primario (Phase 2 Fase 2.3), nombre uppercase como fallback
    direccion_provincia: str | None         # ej. "BARCELONA" (uppercase, legacy)
    direccion_provincia_codigo: str | None  # ej. "08" (INE)
    # Preferencias
    presupuesto_min_interes: float | None
    presupuesto_max_interes: float | None
    apetito_ute: bool
    estado_aceptacion: str
    obras_simultaneas_max: int | None
    obras_simultaneas_actual: int | None
    pref_cpv_prioridades: dict[str, str]  # {'45': 'core', ...}
    pref_territorios: dict[str, str]  # {'BARCELONA': 'preferida', ...} (provincia o comarca)
    # Solvencia económica — volúmenes declarados (Phase 2 Fase 3)
    volumen_negocio_n: float | None
    volumen_negocio_n1: float | None
    volumen_negocio_n2: float | None
    plantilla_media: int | None
    # Solvencia técnica derivada
    anualidad_media: float | None  # de certificados (€/año equivalente, /resumen-solvencia)
    grupos_rolece_activos: list[str]  # ['C', 'I', 'G']
    # Documentos
    docs_caducados: list[str]  # ['hacienda_corriente', ...]
    docs_caducan_pronto: list[str]
    # Reservado — pendiente de añadir a EmpresaPreferencias en futura migración
    margen_minimo_baja: float | None = None

    @property
    def volumen_negocio_max(self) -> float | None:
        """Mayor de los 3 ejercicios declarados (n, n-1, n-2). None si todos None."""
        vols = [v for v in (self.volumen_negocio_n, self.volumen_negocio_n1, self.volumen_negocio_n2) if v is not None]
        return max(vols) if vols else None


def _provincia_norm(s: str | None) -> str | None:
    if not s:
        return None
    return s.strip().upper()


def _docs_estado_hoy(documentos: list[DocumentoEmpresa]) -> tuple[list[str], list[str]]:
    """Clasifica documentos críticos por estado vs HOY."""
    hoy = date.today()
    caducados: list[str] = []
    caducan: list[str] = []
    for d in documentos:
        if d.tipo not in DOCUMENTOS_CRITICOS_FORMALIZACION:
            continue
        if d.fecha_caducidad is None:
            continue
        if d.fecha_caducidad < hoy:
            caducados.append(d.tipo)
        elif (d.fecha_caducidad - hoy).days <= DIAS_PRE_CADUCIDAD:
            caducan.append(d.tipo)
    return caducados, caducan


def _anualidad_media(certificados: list[CertificadoObra]) -> float | None:
    """Anualidad media de los últimos 5 años — alineada con /resumen-solvencia.

    Fórmula: total importe (con UTE aplicado) / 5 años. Es la métrica que ya
    expone el endpoint M2 público — replicar aquí evita divergencia entre lo
    que el cliente ve en su pantalla de Solvencia y lo que el motor de
    ganabilidad usa en el hard filter.

    Pre-requisito: la lista debe estar ya filtrada (validado + contratista
    principal + ventana 5 años + es_valido_solvencia ≠ False) por la query
    que llame a esta función.
    """
    if not certificados:
        return None
    total = 0.0
    for c in certificados:
        if c.importe_adjudicacion is None:
            continue
        importe = float(c.importe_adjudicacion)
        if c.porcentaje_ute is not None:
            importe = importe * float(c.porcentaje_ute) / 100.0
        total += importe
    if total <= 0:
        return None
    return total / 5.0


async def build_empresa_static_profile(
    session: AsyncSession,
    empresa_id: uuid.UUID,
) -> EmpresaStaticProfile:
    """Carga todo lo M2 que necesita el scoring en un único profile inmutable."""
    # Empresa básica
    empresa = (
        await session.execute(
            select(Empresa).where(Empresa.id == empresa_id, Empresa.deleted_at.is_(None))
        )
    ).scalar_one()

    # Preferencias (con territorios + cpvs)
    prefs_q = await session.execute(
        select(EmpresaPreferencias)
        .options(
            selectinload(EmpresaPreferencias.territorios),
            selectinload(EmpresaPreferencias.cpvs),
        )
        .where(EmpresaPreferencias.empresa_id == empresa_id)
    )
    prefs = prefs_q.scalar_one_or_none()

    pref_cpv: dict[str, str] = {}
    pref_terr: dict[str, str] = {}
    if prefs is not None:
        for p in prefs.cpvs:
            pref_cpv[p.cpv_division] = p.prioridad
        for t in prefs.territorios:
            key = t.provincia_codigo or t.comarca_codigo
            if key:
                pref_terr[key] = t.prioridad

    # Clasificaciones ROLECE activas (no caducadas)
    rolece_q = await session.execute(
        select(ClasificacionRolece).where(
            and_(
                ClasificacionRolece.empresa_id == empresa_id,
                ClasificacionRolece.deleted_at.is_(None),
                ClasificacionRolece.activa.is_(True),
                ClasificacionRolece.fecha_caducidad >= date.today(),
            )
        )
    )
    grupos = sorted({r.grupo for r in rolece_q.scalars().all()})

    # Certificados validados → anualidad media (espejo de /resumen-solvencia)
    # Filtros canónicos: validado + contratista principal + ventana 5 años
    # + importe presente + es_valido_solvencia ≠ False.
    periodo_inicio = date.today() - timedelta(days=5 * 365)
    cert_q = await session.execute(
        select(CertificadoObra).where(
            and_(
                CertificadoObra.empresa_id == empresa_id,
                CertificadoObra.deleted_at.is_(None),
                CertificadoObra.estado == EstadoCertificado.validado,
                CertificadoObra.contratista_principal.is_(True),
                CertificadoObra.fecha_fin >= periodo_inicio,
                CertificadoObra.importe_adjudicacion.is_not(None),
                CertificadoObra.es_valido_solvencia.is_not(False),
            )
        )
    )
    anualidad = _anualidad_media(list(cert_q.scalars().all()))

    # Documentos administrativos
    docs_q = await session.execute(
        select(DocumentoEmpresa).where(
            and_(
                DocumentoEmpresa.empresa_id == empresa_id,
                DocumentoEmpresa.deleted_at.is_(None),
            )
        )
    )
    docs_caducados, docs_caducan = _docs_estado_hoy(list(docs_q.scalars().all()))

    return EmpresaStaticProfile(
        empresa_id=empresa_id,
        cif=empresa.cif,
        direccion_provincia=_provincia_norm(empresa.direccion_provincia),
        direccion_provincia_codigo=empresa.direccion_provincia_codigo,
        presupuesto_min_interes=float(prefs.presupuesto_min_interes) if prefs and prefs.presupuesto_min_interes is not None else None,
        presupuesto_max_interes=float(prefs.presupuesto_max_interes) if prefs and prefs.presupuesto_max_interes is not None else None,
        apetito_ute=bool(prefs.apetito_ute) if prefs else False,
        estado_aceptacion=prefs.estado_aceptacion if prefs else "acepta",
        obras_simultaneas_max=prefs.obras_simultaneas_max if prefs else None,
        obras_simultaneas_actual=prefs.obras_simultaneas_actual if prefs else None,
        pref_cpv_prioridades=pref_cpv,
        pref_territorios=pref_terr,
        volumen_negocio_n=float(empresa.volumen_negocio_n) if empresa.volumen_negocio_n is not None else None,
        volumen_negocio_n1=float(empresa.volumen_negocio_n1) if empresa.volumen_negocio_n1 is not None else None,
        volumen_negocio_n2=float(empresa.volumen_negocio_n2) if empresa.volumen_negocio_n2 is not None else None,
        plantilla_media=empresa.plantilla_media,
        anualidad_media=anualidad,
        grupos_rolece_activos=grupos,
        docs_caducados=docs_caducados,
        docs_caducan_pronto=docs_caducan,
        margen_minimo_baja=None,  # TODO migración para añadirlo a empresa_preferencias
    )


def compute_empresa_context_hash(profile: EmpresaStaticProfile) -> str:
    """Hash determinístico del profile — para invalidar scores cuando cambia M2.

    Si dos llamadas devuelven el mismo hash, los scores cacheados siguen vigentes.
    """
    payload = {
        "cif": profile.cif,
        "prov": profile.direccion_provincia,
        "prov_cod": profile.direccion_provincia_codigo,
        "pres_min": profile.presupuesto_min_interes,
        "pres_max": profile.presupuesto_max_interes,
        "ute": profile.apetito_ute,
        "estado": profile.estado_aceptacion,
        "sim_max": profile.obras_simultaneas_max,
        "sim_act": profile.obras_simultaneas_actual,
        "cpv": sorted(profile.pref_cpv_prioridades.items()),
        "terr": sorted(profile.pref_territorios.items()),
        # Phase 2 Fase 1.2 — volúmenes y plantilla afectan a hard filters de
        # solvencia económica (Fase 3) → debe entrar en el hash para que
        # cambios en el perfil disparen recálculo automático.
        "vol_n":  round(profile.volumen_negocio_n,  2) if profile.volumen_negocio_n  is not None else None,
        "vol_n1": round(profile.volumen_negocio_n1, 2) if profile.volumen_negocio_n1 is not None else None,
        "vol_n2": round(profile.volumen_negocio_n2, 2) if profile.volumen_negocio_n2 is not None else None,
        "plantilla": profile.plantilla_media,
        "anu": round(profile.anualidad_media, 2) if profile.anualidad_media else None,
        "rolece": profile.grupos_rolece_activos,
        "docs_cad": sorted(profile.docs_caducados),
        "docs_pronto": sorted(profile.docs_caducan_pronto),
        "margen": profile.margen_minimo_baja,
    }
    canonical = json.dumps(payload, sort_keys=True, ensure_ascii=False, default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


# ----------------------------------------------------------------------------
# Per-licitacion evaluation
# ----------------------------------------------------------------------------


def _dias_a_cierre(licitacion: Licitacion) -> int | None:
    if licitacion.fecha_limite is None:
        return None
    delta = licitacion.fecha_limite - datetime.now(timezone.utc)
    return delta.days


def _evaluar_clasificacion(licitacion: Licitacion) -> tuple[bool, float | None]:
    """Proxy con el semáforo CPV-ROLECE pre-calculado del Radar.

    semaforo: 'verde' = cumple holgada, 'amarillo' = ajustada, 'rojo' = no cumple,
    'gris' = no evaluado. Devolvemos (cumple, holgura) para el scoring.
    """
    sem = licitacion.semaforo
    if sem == "verde":
        return True, 1.5  # holgura — el semáforo no precisa cuánto, asumimos 1.5x
    if sem == "amarillo":
        return True, 1.0  # justo
    if sem == "rojo":
        return False, None
    # gris: no evaluado todavía — no penalizar
    return True, None


def _evaluar_solvencia_economica(
    profile: EmpresaStaticProfile, licitacion: Licitacion
) -> bool:
    """Heurística: anualidad_media >= 0.7× presupuesto licitación.

    El requisito real (vol. negocio últimos 3 ejercicios = 1.5× presupuesto)
    lo extraerá M3 del PCAP. Por ahora aproximamos con la anualidad media de
    certificados.
    """
    if profile.anualidad_media is None or licitacion.importe_licitacion is None:
        return True  # sin info → no penalizar
    importe = float(licitacion.importe_licitacion)
    return profile.anualidad_media >= 0.7 * importe


# Mapeo provincia → centroide (lat, lng) por código INE (estándar oficial).
# Phase 2 Fase 2.3: migración de keys uppercase ("BARCELONA") a códigos INE
# ("08"), alineado con la columna `direccion_provincia_codigo` que añadió
# la migración 0022. NUTS3 catalanas son 1:1 con provincias.
_PROVINCIA_CENTROID: dict[str, tuple[float, float]] = {
    "08": (41.55, 2.00),  # Barcelona
    "17": (42.00, 2.65),  # Girona
    "25": (41.90, 1.00),  # Lleida
    "43": (41.05, 1.30),  # Tarragona
}

# Bridge: licitacion.provincias[] viene en strings lowercase ("barcelona",
# "girona", ...) del ingest PSCP. Mapeo a INE para alinear con el dict de
# centroides y con direccion_provincia_codigo del empresa profile.
_PROVINCIA_NAME_TO_INE: dict[str, str] = {
    "barcelona": "08",
    "girona":    "17",
    "lleida":    "25",
    "tarragona": "43",
}


def _haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Distancia great-circle en km entre dos (lat, lng) en grados."""
    import math
    lat1, lon1 = math.radians(a[0]), math.radians(a[1])
    lat2, lon2 = math.radians(b[0]), math.radians(b[1])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def _evaluar_geografia(
    profile: EmpresaStaticProfile, licitacion: Licitacion
) -> tuple[bool, bool, float | None]:
    """(es_misma_provincia, es_mismo_nuts3, distancia_km).

    Compara codigo INE de la empresa (`direccion_provincia_codigo`) con los
    nombres normalizados de `licitacion.provincias[]` mapeados a INE.
    Si la empresa aún no tiene codigo INE (perfil legacy) cae a comparación
    por nombre uppercase. NUTS3 catalanas son 1:1 con provincias.

    Distancia: haversine entre centroides INE. Para obras fuera de Catalunya
    el codigo no está mapeado → None (neutro).
    """
    # Codigo INE de la empresa (preferido) o derivado del nombre legacy
    emp_codigo = profile.direccion_provincia_codigo
    if emp_codigo is None and profile.direccion_provincia:
        emp_codigo = _PROVINCIA_NAME_TO_INE.get(profile.direccion_provincia.lower())

    # Códigos INE de las provincias de la licitación
    lic_codigos: list[str] = []
    for p in (licitacion.provincias or []):
        codigo = _PROVINCIA_NAME_TO_INE.get((p or "").strip().lower())
        if codigo:
            lic_codigos.append(codigo)

    es_misma = bool(emp_codigo and emp_codigo in lic_codigos)
    es_mismo_nuts = es_misma  # NUTS3 catalanas 1:1 con provincias

    distancia_km: float | None = None
    if emp_codigo and lic_codigos:
        emp_centroid = _PROVINCIA_CENTROID.get(emp_codigo)
        if emp_centroid is not None:
            cand_distancias = [
                _haversine_km(emp_centroid, _PROVINCIA_CENTROID[c])
                for c in lic_codigos if c in _PROVINCIA_CENTROID
            ]
            if cand_distancias:
                distancia_km = round(min(cand_distancias), 1)

    return es_misma, es_mismo_nuts, distancia_km


def evaluate_empresa_for_licitacion(
    profile: EmpresaStaticProfile,
    licitacion: Licitacion,
) -> EmpresaContext:
    """Combina profile estable + licitación específica → EmpresaContext."""
    cumple_clas, holgura = _evaluar_clasificacion(licitacion)
    cumple_solv = _evaluar_solvencia_economica(profile, licitacion)
    misma_prov, mismo_nuts, dist_km = _evaluar_geografia(profile, licitacion)
    presupuesto_lic = (
        float(licitacion.importe_licitacion)
        if licitacion.importe_licitacion is not None
        else None
    )

    return EmpresaContext(
        cif=profile.cif,
        cumple_clasificacion=cumple_clas,
        cumple_solvencia=cumple_solv,
        nivel_clasificacion_holgura=holgura,
        presupuesto_min_interes=profile.presupuesto_min_interes,
        presupuesto_max_interes=profile.presupuesto_max_interes,
        apetito_ute=profile.apetito_ute,
        estado_aceptacion=profile.estado_aceptacion,
        obras_simultaneas_max=profile.obras_simultaneas_max,
        obras_simultaneas_actual=profile.obras_simultaneas_actual,
        pref_cpv_prioridades=profile.pref_cpv_prioridades,
        distancia_km_estimada=dist_km,
        es_misma_provincia=misma_prov,
        es_mismo_nuts3=mismo_nuts,
        volumen_negocio_max=profile.volumen_negocio_max,
        margen_minimo_baja=profile.margen_minimo_baja,
        docs_caducados=profile.docs_caducados,
        docs_caducan_pronto=profile.docs_caducan_pronto,
    )
