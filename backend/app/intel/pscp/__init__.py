"""PSCP — ingestión y normalización del dataset Socrata ybgg-dgi6.

Spec: docs/data-science/architecture.md sección 5.
"""
from app.intel.pscp.client import PscpClient
from app.intel.pscp.hashing import compute_content_hash
from app.intel.pscp.normalize import NormalizedCif, explode_ute, normalize_cif

__all__ = [
    "NormalizedCif",
    "PscpClient",
    "compute_content_hash",
    "explode_ute",
    "normalize_cif",
]
