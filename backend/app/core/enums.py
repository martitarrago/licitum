from enum import StrEnum


class EstadoCertificado(StrEnum):
    pendiente_revision = "pendiente_revision"
    procesando = "procesando"
    validado = "validado"
    rechazado = "rechazado"


class EstadoAnalisisPliego(StrEnum):
    pendiente = "pendiente"
    procesando = "procesando"
    completado = "completado"
    fallido = "fallido"
