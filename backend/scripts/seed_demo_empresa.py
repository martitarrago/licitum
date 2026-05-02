"""Seed de la empresa demo con perfil PYME constructora catalana realista.

Inspirado en Calam Tapias Construccions SL (n_registral RELIC NB1220972) —
empresa real catalana con ~31 clasificaciones RELIC, perfil C/G/E/J/K. Se usa
su n_registral para sincronizar datos RELIC reales contra Socrata, pero todo
lo demás (nombre, CIF, dirección, personal) es sintético.

Idempotente — se puede re-ejecutar.

Uso:
    cd backend
    ./.venv/Scripts/python.exe scripts/seed_demo_empresa.py
"""
from __future__ import annotations

import asyncio
import logging
import sys
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID

# Permite ejecutar desde cualquier cwd
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config import settings
from app.models.clasificacion_rolece import ClasificacionRolece
from app.models.empresa import Empresa
from app.models.personal_empresa import PersonalEmpresa
from app.models.sistema_gestion_empresa import SistemaGestionEmpresa
from app.services.relic_sync import sincronizar_empresa_relic
from workers.intel_scores import _run_recalc_empresa

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("seed")

EMPRESA_ID = UUID("00000000-0000-0000-0000-000000000001")
N_REGISTRAL_RELIC = "NB1220972"   # Calam Tapias en RELIC — fuente de datos reales

EMPRESA_PROFILE = {
    "nombre": "Bosch i Ribera Construccions, SL",
    "cif": "B66789012",
    "email": "contacte@boschribera.cat",
    "direccion_calle": "Carrer Sant Pere més Alt, 45",
    "direccion_codigo_postal": "08003",
    "direccion_ciudad": "Barcelona",
    "direccion_provincia": "Barcelona",
    "direccion_provincia_codigo": "08",
    "direccion_pais": "ES",
    "telefono": "+34 933 12 45 67",
    "iae": "501.1",
    "cnae": "4121",
    "tamano_pyme": "pequena",
    "plantilla_media": 14,
    "volumen_negocio_n":  Decimal("1180000.00"),
    "volumen_negocio_n1": Decimal("980000.00"),
    "volumen_negocio_n2": Decimal("850000.00"),
    "representante_nombre": "Jordi Bosch i Ribera",
    "representante_nif": "37123456P",
    "representante_cargo": "Administrador únic",
    "ccc_seguridad_social": "08-12345678/90",
    "poder_notario": "Eulàlia Ferrer Mestres",
    "poder_protocolo": "1234",
}

# ROLECE — perfil real basado en Calam Tapias (C/G/E/J/K).
# Grupos C y G son los principales; E y J cubren urbanización y rehabilitación,
# que son los nichos habituales de una PYME constructora catalana.
ROLECE_ENTRIES = [
    # C-2 Estructures de fàbrica/formigó cat 3 (360k–840k)
    {"grupo": "C", "subgrupo": "2", "categoria": "3",
     "fecha_obtencion": date(2018, 5, 8),
     "fecha_caducidad": date(2028, 5, 8),
     "activa": True},
    # G-6 Obres viàries sense qualificació específica cat 3
    {"grupo": "G", "subgrupo": "6", "categoria": "3",
     "fecha_obtencion": date(2018, 5, 8),
     "fecha_caducidad": date(2028, 5, 8),
     "activa": True},
    # E-1 Abastaments i sanejaments cat 3 (urbanització, xarxes)
    {"grupo": "E", "subgrupo": "1", "categoria": "3",
     "fecha_obtencion": date(2020, 3, 15),
     "fecha_caducidad": date(2028, 5, 8),
     "activa": True},
    # J-1 Mecàniques: fontaneria, climatització cat 3 (rehabilitació)
    {"grupo": "J", "subgrupo": "1", "categoria": "3",
     "fecha_obtencion": date(2020, 3, 15),
     "fecha_caducidad": date(2028, 5, 8),
     "activa": True},
]

PERSONAL_ENTRIES = [
    {"nombre_completo": "Marc Vidal Pujol",
     "dni": "39456712M",
     "rol": "jefe_obra",
     "titulacion": "ICCP — Universitat Politècnica de Catalunya",
     "anios_experiencia": 18,
     "activo": True,
     "notas": "Experiencia en obras viarias y rehabilitación residencial."},
    {"nombre_completo": "Anna Soler Mas",
     "dni": "47891234A",
     "rol": "arquitecto",
     "titulacion": "Arquitecta técnica — Escola Politècnica Superior d'Edificació",
     "anios_experiencia": 7,
     "activo": True,
     "notas": "Responsable de redacción de Sobre B y memoria técnica."},
    {"nombre_completo": "Sergi Casals i Font",
     "dni": "44321987S",
     "rol": "encargado",
     "titulacion": "Cicle formatiu de grau superior — Projectes d'edificació",
     "anios_experiencia": 22,
     "activo": True,
     "notas": "Encargado general, prevención de riesgos nivel intermedio."},
]

SISTEMAS_GESTION = [
    {"tipo": "iso_9001",
     "fecha_emision": date(2023, 6, 30),
     "fecha_caducidad": date(2027, 6, 30),
     "entidad_certificadora": "AENOR",
     "alcance": "Construcción y rehabilitación de edificios y obra civil."},
    {"tipo": "iso_14001",
     "fecha_emision": date(2023, 6, 30),
     "fecha_caducidad": date(2027, 6, 30),
     "entidad_certificadora": "AENOR",
     "alcance": "Gestión ambiental en obras de construcción."},
]


async def main() -> None:
    engine = create_async_engine(settings.database_url, echo=False)
    Session = async_sessionmaker(engine, expire_on_commit=False)

    async with Session() as db:
        # ── 1. Empresa profile ───────────────────────────────────────────
        emp = await db.get(Empresa, EMPRESA_ID)
        if emp is None:
            log.error("No existe empresa demo con id %s — abortando", EMPRESA_ID)
            return

        for k, v in EMPRESA_PROFILE.items():
            setattr(emp, k, v)
        await db.commit()
        log.info("Empresa actualizada: %s (%s)", emp.nombre, emp.cif)

        # ── 2. ROLECE — purga + reinserta ─────────────────────────────────
        await db.execute(text(
            "DELETE FROM clasificaciones_rolece WHERE empresa_id = :id"
        ), {"id": EMPRESA_ID})
        for entry in ROLECE_ENTRIES:
            db.add(ClasificacionRolece(empresa_id=EMPRESA_ID, **entry))
        await db.commit()
        log.info("ROLECE: %d clasificaciones reinsertadas", len(ROLECE_ENTRIES))

        # ── 3. Personal ──────────────────────────────────────────────────
        await db.execute(text(
            "DELETE FROM personal_empresa WHERE empresa_id = :id"
        ), {"id": EMPRESA_ID})
        for entry in PERSONAL_ENTRIES:
            db.add(PersonalEmpresa(empresa_id=EMPRESA_ID, **entry))
        await db.commit()
        log.info("Personal: %d entradas", len(PERSONAL_ENTRIES))

        # ── 4. Sistemas de gestión (ISO) ─────────────────────────────────
        await db.execute(text(
            "DELETE FROM sistemas_gestion_empresa WHERE empresa_id = :id"
        ), {"id": EMPRESA_ID})
        for entry in SISTEMAS_GESTION:
            db.add(SistemaGestionEmpresa(empresa_id=EMPRESA_ID, **entry))
        await db.commit()
        log.info("Sistemas de gestión: %d certificados", len(SISTEMAS_GESTION))

        # ── 5. RELIC sync (llama Socrata real) ───────────────────────────
        log.info("Sincronizando RELIC con n_registral=%s ...", N_REGISTRAL_RELIC)
        relic = await sincronizar_empresa_relic(db, EMPRESA_ID, N_REGISTRAL_RELIC)
        # `clasificaciones_relic` está cargada tras refresh dentro del sync
        log.info(
            "RELIC OK — empresa=%s clasificaciones=%d prohibicio=%s",
            relic.nom_empresa,
            len(relic.clasificaciones_relic),
            relic.prohibicio,
        )

    # ── 6. Recalc de scores (síncrono, sin Celery) ──────────────────────
    log.info("Recalculando scores de ganabilidad...")
    result = await _run_recalc_empresa(Session, EMPRESA_ID, force=True)
    log.info(
        "Scores recalculados — scored=%d descartadas=%d duracion=%.1fs",
        result.get("scored", 0),
        result.get("descartadas", 0),
        result.get("duration_seconds", 0),
    )

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
