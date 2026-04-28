"""Trigger de recálculo del scoring de ganabilidad.

Cuando el usuario modifica algo de M2 que afecta al EmpresaContext
(preferencias, clasificaciones, certificados, documentos, dirección),
encolamos el recálculo de scores de ese empresa_id en Celery.

Idempotente vía empresa_context_hash: si el hash no cambió desde el último
recálculo, el worker hace skip en <2s. Trabajos duplicados solo gastan CPU
del worker, no corrompen datos.

Llamar SIEMPRE **después** de `db.commit()` para no encolar cambios que
podrían no llegar a persistirse.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

logger = logging.getLogger(__name__)


def disparar_recalculo_scores(empresa_id: uuid.UUID | str) -> None:
    """Encola un recálculo de scores para una empresa.

    El import es diferido para evitar dependencia circular entre
    `app/services/` y `workers/`.

    Tolera fallos del broker silenciosamente: si Redis está caído, no se
    encola nada y los scores quedarán al día con el siguiente cron diario
    (07:15 Madrid). Mejor que tumbar el endpoint M2 que el usuario está
    usando ahora.
    """
    try:
        from workers.intel_scores import calcular_para_empresa

        calcular_para_empresa.apply_async(
            args=[str(empresa_id)],
            # Si en 5 min hay otro disparo, el segundo task hace skip por
            # hash idéntico — pero deduplicamos en cola con expires.
            expires=5 * 60,
        )
        logger.info("Recálculo de scores encolado para empresa %s", empresa_id)
    except Exception:
        logger.exception("No se pudo encolar calcular_para_empresa(%s)", empresa_id)
