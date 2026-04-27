"""Trigger del recálculo del semáforo del Radar.

Cuando el usuario modifica datos en M3 (certificados o clasificaciones) que
afectan al semáforo del Radar M2, se encola la tarea Celery
`recalcular_todas` para mantener M2 consistente con M3 sin que el usuario
tenga que pulsar el botón "Recalcular semáforos".

Llamarlo SIEMPRE **después** de `db.commit()` para no encolar cambios que
podrían no llegar a persistirse (ej: si el commit falla por constraint).
"""
from __future__ import annotations

import logging

logger = logging.getLogger(__name__)


def disparar_recalculo_semaforo() -> None:
    """Encola un recálculo de los semáforos del Radar.

    Idempotente: la tarea `recalcular_todas` solo escribe filas que cambian.
    Trabajos duplicados solo gastan unos segundos de CPU del worker; no
    corrompen datos.

    El import es diferido para evitar dependencia circular entre
    `app/services/` y `workers/`.

    Tolera fallos del broker silenciosamente: si Redis está caído, no se
    encola nada y el semáforo del Radar quedará desincronizado hasta el
    siguiente recálculo manual o ingesta diaria. Mejor que tumbar el
    endpoint de M3 que el usuario está usando ahora.
    """
    try:
        from workers.recalcular_semaforos import recalcular_todas

        recalcular_todas.delay()
        logger.info("Recálculo del semáforo del Radar encolado tras cambio en M3.")
    except Exception:
        logger.exception("No se pudo encolar recalcular_todas")
