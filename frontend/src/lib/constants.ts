export const EMPRESA_DEMO_ID = "00000000-0000-0000-0000-000000000001";

// Derivado de CATALOGO_JCCPE para no duplicar la fuente de verdad
export { CATALOGO_JCCPE, CATEGORIAS_ROLECE, getSubgrupos, getNombreGrupo, getNombreSubgrupo } from "./jccpe";

import { CATALOGO_JCCPE } from "./jccpe";

export const GRUPOS_ROLECE = CATALOGO_JCCPE.map((g) => ({
  value: g.codigo,
  label: `${g.codigo} — ${g.nombre}`,
}));
