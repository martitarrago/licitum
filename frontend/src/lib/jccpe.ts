// Catálogo oficial ROLECE — Real Decreto 1098/2001 (RGLCAP)
// Grupos A–K con sus subgrupos oficiales

export interface SubgrupoJCCPE {
  codigo: string;
  nombre: string;
}

export interface GrupoJCCPE {
  codigo: string;
  nombre: string;
  subgrupos: SubgrupoJCCPE[];
}

export const CATALOGO_JCCPE: GrupoJCCPE[] = [
  {
    codigo: "A",
    nombre: "Movimiento de tierras y perforaciones",
    subgrupos: [
      { codigo: "1", nombre: "Desmontes y vaciados" },
      { codigo: "2", nombre: "Explanaciones" },
      { codigo: "3", nombre: "Canteras" },
      { codigo: "4", nombre: "Pozos y galerías" },
      { codigo: "5", nombre: "Túneles" },
    ],
  },
  {
    codigo: "B",
    nombre: "Puentes, viaductos y grandes estructuras",
    subgrupos: [
      { codigo: "1", nombre: "De fábrica u hormigón en masa" },
      { codigo: "2", nombre: "De hormigón armado" },
      { codigo: "3", nombre: "De hormigón pretensado" },
      { codigo: "4", nombre: "Metálicas" },
    ],
  },
  {
    codigo: "C",
    nombre: "Edificaciones",
    subgrupos: [
      { codigo: "1", nombre: "Demoliciones" },
      { codigo: "2", nombre: "Estructuras de fábrica u hormigón" },
      { codigo: "3", nombre: "Estructuras metálicas" },
      { codigo: "4", nombre: "Albañilería, revocos y revestidos" },
      { codigo: "5", nombre: "Cantería y marmolería" },
      { codigo: "6", nombre: "Pavimentos, solados y alicatados" },
      { codigo: "7", nombre: "Aislamientos e impermeabilizaciones" },
      { codigo: "8", nombre: "Carpintería de madera" },
      { codigo: "9", nombre: "Carpintería metálica" },
    ],
  },
  {
    codigo: "D",
    nombre: "Ferroviarias",
    subgrupos: [
      { codigo: "1", nombre: "Tendido de vías" },
      { codigo: "2", nombre: "Elevados sobre carril o cable" },
      { codigo: "3", nombre: "Señalizaciones y enclavamientos" },
      { codigo: "4", nombre: "Electrificación de ferrocarriles" },
      { codigo: "5", nombre: "Obras de ferrocarriles sin clasificación específica" },
    ],
  },
  {
    codigo: "E",
    nombre: "Hidráulicas",
    subgrupos: [
      { codigo: "1", nombre: "Abastecimiento y saneamiento" },
      { codigo: "2", nombre: "Presas" },
      { codigo: "3", nombre: "Canales" },
      { codigo: "4", nombre: "Acequias y desagüe" },
      { codigo: "5", nombre: "Defensa de márgenes y corrección de cauces" },
      { codigo: "6", nombre: "Conducciones con tubería de presión de gran diámetro" },
      { codigo: "7", nombre: "Obras hidráulicas sin clasificación específica" },
    ],
  },
  {
    codigo: "F",
    nombre: "Marítimas",
    subgrupos: [
      { codigo: "1", nombre: "Dragados" },
      { codigo: "2", nombre: "Escolleras" },
      { codigo: "3", nombre: "Con pilotaje" },
      { codigo: "4", nombre: "Pantalanes y tornapuntas" },
      { codigo: "5", nombre: "Pavimentaciones" },
      { codigo: "6", nombre: "Faros, radiofaros y señalizaciones marítimas" },
      { codigo: "7", nombre: "Obras marítimas sin clasificación específica" },
      { codigo: "8", nombre: "Emisarios submarinos" },
    ],
  },
  {
    codigo: "G",
    nombre: "Viales y pistas",
    subgrupos: [
      { codigo: "1", nombre: "Autopistas" },
      { codigo: "2", nombre: "Pistas de aterrizaje" },
      { codigo: "3", nombre: "Con firmes de hormigón hidráulico" },
      { codigo: "4", nombre: "Con firmes de mezclas bituminosas" },
      { codigo: "5", nombre: "Señalizaciones y balizamientos viales" },
      { codigo: "6", nombre: "Obras viales sin clasificación específica" },
    ],
  },
  {
    codigo: "H",
    nombre: "Transportes de productos petrolíferos y gaseosos",
    subgrupos: [
      { codigo: "1", nombre: "Oleoductos" },
      { codigo: "2", nombre: "Gasoductos" },
      { codigo: "3", nombre: "Estaciones de servicio" },
      { codigo: "4", nombre: "Instalaciones auxiliares de transporte de productos petrolíferos" },
      { codigo: "5", nombre: "Sin clasificación específica" },
    ],
  },
  {
    codigo: "I",
    nombre: "Instalaciones eléctricas",
    subgrupos: [
      { codigo: "1", nombre: "Alumbrado, iluminaciones y balizamientos luminosos" },
      { codigo: "2", nombre: "Centrales de producción de energía" },
      { codigo: "3", nombre: "Líneas de alta tensión" },
      { codigo: "4", nombre: "Subestaciones" },
      { codigo: "5", nombre: "Centros de transformación y distribución en alta tensión" },
      { codigo: "6", nombre: "Depósitos de gases" },
      { codigo: "7", nombre: "Telecomunicaciones e instalaciones radioeléctricas" },
      { codigo: "8", nombre: "Instalaciones eléctricas sin clasificación específica" },
      { codigo: "9", nombre: "Instalaciones de sistemas de control, regulación y comunicaciones" },
    ],
  },
  {
    codigo: "J",
    nombre: "Instalaciones mecánicas",
    subgrupos: [
      { codigo: "1", nombre: "Elevadores y transportadores" },
      { codigo: "2", nombre: "Ventilación, calefacción y climatización" },
      { codigo: "3", nombre: "Instalaciones frigoríficas" },
      { codigo: "4", nombre: "Instalaciones contra incendios" },
      { codigo: "5", nombre: "Instalaciones de comunicaciones" },
      { codigo: "6", nombre: "Sin clasificación específica" },
    ],
  },
  {
    codigo: "K",
    nombre: "Especiales",
    subgrupos: [
      { codigo: "1", nombre: "Cimentaciones especiales" },
      { codigo: "2", nombre: "Sondeos, inyecciones y pilotajes" },
      { codigo: "3", nombre: "Tablestacados" },
      { codigo: "4", nombre: "Pinturas y metalizaciones" },
      { codigo: "5", nombre: "Ornamentaciones y decoraciones interiores" },
      { codigo: "6", nombre: "Jardinería y plantaciones" },
      { codigo: "7", nombre: "Restauración de bienes inmuebles histórico-artísticos" },
      { codigo: "8", nombre: "Estaciones de tratamiento de aguas" },
      { codigo: "9", nombre: "Instalaciones de jardines y parques de recreo" },
    ],
  },
];

// Anualidad media por categoría — sistema vigente (LCSP 2017)
export const CATEGORIAS_ROLECE = [
  { value: "1", label: "Categoría 1 — hasta 150.000 €" },
  { value: "2", label: "Categoría 2 — 150.000 – 360.000 €" },
  { value: "3", label: "Categoría 3 — 360.000 – 840.000 €" },
  { value: "4", label: "Categoría 4 — 840.000 – 2.400.000 €" },
  { value: "5", label: "Categoría 5 — 2.400.000 – 5.000.000 €" },
  { value: "6", label: "Categoría 6 — más de 5.000.000 €" },
] as const;

export function getSubgrupos(codigoGrupo: string): SubgrupoJCCPE[] {
  return CATALOGO_JCCPE.find((g) => g.codigo === codigoGrupo)?.subgrupos ?? [];
}

export function getNombreGrupo(codigo: string): string {
  const g = CATALOGO_JCCPE.find((g) => g.codigo === codigo);
  return g ? `${g.codigo} — ${g.nombre}` : codigo;
}

export function getNombreSubgrupo(codigoGrupo: string, codigoSub: string): string {
  const sub = getSubgrupos(codigoGrupo).find((s) => s.codigo === codigoSub);
  return sub ? `${codigoGrupo}${codigoSub} — ${sub.nombre}` : `${codigoGrupo}${codigoSub}`;
}
