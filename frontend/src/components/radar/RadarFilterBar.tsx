"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Search, X } from "lucide-react";
import {
  PROVINCIAS,
  PROVINCIAS_LABEL,
  TIPOS_ORGANISMO,
  TIPOS_ORGANISMO_LABEL,
  type Provincia,
  type TipoOrganismo,
} from "@/lib/api/licitaciones";
import { CheckboxGroup, type CheckboxOption } from "@/components/ui/CheckboxGroup";
import { FilterPill } from "@/components/ui/FilterPill";
import { FilterPopover } from "@/components/ui/FilterPopover";
import {
  ORDER_BY_DIR,
  ORDER_BY_LABEL,
  ORDER_BY_OPTIONS,
  TIER_DOT,
  TIER_LABEL,
  type OrderBy,
  type RadarFilters,
  type Tier,
  type UseRadarFiltersReturn,
} from "@/lib/hooks/useRadarFilters";

// ─── Opciones / presets ──────────────────────────────────────────────────────

const TIER_OPTS: { value: Tier; label: string; dot: string; subtitle: string }[] = [
  { value: "todas",     label: "Todas",         dot: TIER_DOT.todas,     subtitle: "" },
  { value: "excelente", label: "Excelente",     dot: TIER_DOT.excelente, subtitle: "≥ 70" },
  { value: "buena",     label: "Buena",         dot: TIER_DOT.buena,     subtitle: "50–69" },
  { value: "raso",      label: "Aprobada raso", dot: TIER_DOT.raso,      subtitle: "40–49" },
  { value: "no_apta",   label: "No apta",       dot: TIER_DOT.no_apta,   subtitle: "< 40" },
];

const PROVINCIA_OPTS: CheckboxOption<Provincia>[] = PROVINCIAS.map((p) => ({
  value: p,
  label: PROVINCIAS_LABEL[p],
}));

const ORGANISMO_OPTS: CheckboxOption<TipoOrganismo>[] = TIPOS_ORGANISMO.map((t) => ({
  value: t,
  label: TIPOS_ORGANISMO_LABEL[t],
}));

interface ImportePreset {
  id: string;
  label: string;
  min: number | null;
  max: number | null;
}

// Alineado con categorías ROLECE (RD 1098/2001 art. 26).
const IMPORTE_PRESETS: ImportePreset[] = [
  { id: "cat1", label: "Hasta 150 000 €", min: null, max: 150_000 },
  { id: "cat2", label: "150 000 € – 360 000 €", min: 150_000, max: 360_000 },
  { id: "cat3", label: "360 000 € – 840 000 €", min: 360_000, max: 840_000 },
  { id: "cat4", label: "840 000 € – 2,4 M€", min: 840_000, max: 2_400_000 },
  { id: "cat5", label: "2,4 M€ – 5 M€", min: 2_400_000, max: 5_000_000 },
  { id: "cat6", label: "Más de 5 M€", min: 5_000_000, max: null },
];

interface PlazoPreset {
  id: string;
  label: string;
  min: number | null;
  max: number | null;
}

const PLAZO_PRESETS: PlazoPreset[] = [
  { id: "today", label: "Hoy", min: null, max: 0 },
  { id: "7d", label: "Próximos 7 días", min: null, max: 7 },
  { id: "14d", label: "Próximos 14 días", min: null, max: 14 },
  { id: "30d", label: "Próximos 30 días", min: null, max: 30 },
  { id: "30plus", label: "Más de 30 días", min: 30, max: null },
];

// ─── Helpers de resumen para el FilterPill ───────────────────────────────────

function fmtImporte(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M€`;
  if (v >= 1_000) return `${Math.round(v / 1_000)} k€`;
  return `${v} €`;
}

function resumenImporte(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const preset = IMPORTE_PRESETS.find((p) => p.min === min && p.max === max);
  if (preset) return preset.label.replace(/€$/, "€").replace(/000 /g, "k ").replace(/\s+/g, " ").trim();
  if (min != null && max != null) return `${fmtImporte(min)} – ${fmtImporte(max)}`;
  if (min != null) return `≥ ${fmtImporte(min)}`;
  return `≤ ${fmtImporte(max!)}`;
}

function resumenPlazo(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  const preset = PLAZO_PRESETS.find((p) => p.min === min && p.max === max);
  if (preset) return preset.label;
  if (min != null && max != null) return `${min}–${max} días`;
  if (min != null) return `≥ ${min} días`;
  return `≤ ${max} días`;
}

function resumenList<T extends string>(list: T[], labelMap: Record<T, string>, all: T[], allLabel: string): { value: string | null; count: number } {
  if (list.length === 0) return { value: null, count: 0 };
  if (list.length === all.length) return { value: allLabel, count: 0 };
  if (list.length === 1) return { value: labelMap[list[0]], count: 0 };
  return { value: null, count: list.length };
}

// ─── Sub-componentes (paneles internos) ──────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

function PuntuacionPanel({
  value,
  onSelect,
}: {
  value: Tier;
  onSelect: (v: Tier) => void;
}) {
  return (
    <ul className="flex flex-col py-1.5" role="radiogroup">
      {TIER_OPTS.map((opt) => {
        const active = opt.value === value;
        return (
          <li key={opt.value}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(opt.value)}
              className={[
                "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                "hover:bg-muted focus:outline-none",
                active ? "font-semibold text-foreground" : "text-foreground",
              ].join(" ")}
            >
              <span className={`h-2 w-2 flex-shrink-0 rounded-full ${opt.dot}`} aria-hidden="true" />
              <span className="flex-1">{opt.label}</span>
              {opt.subtitle && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {opt.subtitle}
                </span>
              )}
              {active && <span className="ml-1 text-[10px] font-bold text-muted-foreground">●</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function OrdenPanel({
  value,
  onSelect,
}: {
  value: OrderBy;
  onSelect: (v: OrderBy) => void;
}) {
  return (
    <ul className="flex flex-col py-1.5" role="radiogroup">
      {ORDER_BY_OPTIONS.map((opt) => {
        const active = opt === value;
        const dir = ORDER_BY_DIR[opt];
        const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
        return (
          <li key={opt}>
            <button
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(opt)}
              className={[
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                "hover:bg-muted focus:outline-none",
                active ? "font-semibold text-foreground" : "text-foreground",
              ].join(" ")}
            >
              <Arrow
                className={`h-3.5 w-3.5 flex-shrink-0 ${active ? "text-foreground" : "text-muted-foreground"}`}
                strokeWidth={2.25}
                aria-hidden="true"
              />
              <span className="flex-1">{ORDER_BY_LABEL[opt]}</span>
              {active && <span className="text-[10px] font-bold text-muted-foreground">●</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ImportePanel({
  min,
  max,
  onChange,
  onClear,
}: {
  min: number | null;
  max: number | null;
  onChange: (min: number | null, max: number | null) => void;
  onClear: () => void;
}) {
  const isPreset = IMPORTE_PRESETS.some((p) => p.min === min && p.max === max);
  const [custom, setCustom] = useState(!isPreset && (min !== null || max !== null));
  const [draftMin, setDraftMin] = useState<string>(min != null ? String(min) : "");
  const [draftMax, setDraftMax] = useState<string>(max != null ? String(max) : "");

  useEffect(() => {
    setDraftMin(min != null ? String(min) : "");
    setDraftMax(max != null ? String(max) : "");
  }, [min, max]);

  function applyCustom() {
    const m = draftMin === "" ? null : Math.max(0, Number(draftMin) || 0);
    const M = draftMax === "" ? null : Math.max(0, Number(draftMax) || 0);
    if (m != null && M != null && m > M) return;
    onChange(m, M);
  }

  return (
    <div className="w-72 py-1">
      {!custom ? (
        <>
          <SectionTitle>Categorías ROLECE</SectionTitle>
          <ul className="flex flex-col" role="radiogroup">
            {IMPORTE_PRESETS.map((p) => {
              const active = p.min === min && p.max === max;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onChange(p.min, p.max)}
                    className={[
                      "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors",
                      "hover:bg-muted focus:outline-none",
                      active ? "font-semibold text-foreground" : "text-foreground",
                    ].join(" ")}
                  >
                    <span>{p.label}</span>
                    {active && <span className="text-xs text-muted-foreground">●</span>}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-border px-3 py-2">
            <button
              type="button"
              onClick={() => setCustom(true)}
              className="text-xs font-semibold text-foreground hover:underline underline-offset-2"
            >
              Rango personalizado →
            </button>
          </div>
        </>
      ) : (
        <div className="px-3 py-3 space-y-3">
          <SectionTitle>Rango personalizado (€)</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Mínimo
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                value={draftMin}
                onChange={(e) => setDraftMin(e.target.value)}
                placeholder="0"
                className="
                  rounded-lg bg-surface ring-1 ring-border px-2.5 py-1.5
                  text-sm text-foreground tabular-nums
                  focus:outline-none focus:ring-2 focus:ring-foreground/20
                "
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium text-muted-foreground">
              Máximo
              <input
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                value={draftMax}
                onChange={(e) => setDraftMax(e.target.value)}
                placeholder="∞"
                className="
                  rounded-lg bg-surface ring-1 ring-border px-2.5 py-1.5
                  text-sm text-foreground tabular-nums
                  focus:outline-none focus:ring-2 focus:ring-foreground/20
                "
              />
            </label>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => setCustom(false)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              ← Presets
            </button>
            <button
              type="button"
              onClick={applyCustom}
              className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-surface hover:opacity-85"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
      {(min != null || max != null) && (
        <div className="border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={() => {
              onClear();
              setCustom(false);
            }}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Quitar filtro
          </button>
        </div>
      )}
    </div>
  );
}

function PlazoPanel({
  min,
  max,
  onSelect,
  onClear,
}: {
  min: number | null;
  max: number | null;
  onSelect: (min: number | null, max: number | null) => void;
  onClear: () => void;
}) {
  return (
    <div className="w-60 py-1">
      <SectionTitle>Plazo de presentación</SectionTitle>
      <ul className="flex flex-col" role="radiogroup">
        {PLAZO_PRESETS.map((p) => {
          const active = p.min === min && p.max === max;
          return (
            <li key={p.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onSelect(p.min, p.max)}
                className={[
                  "flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors",
                  "hover:bg-muted focus:outline-none",
                  active ? "font-semibold text-foreground" : "text-foreground",
                ].join(" ")}
              >
                <span>{p.label}</span>
                {active && <span className="text-xs text-muted-foreground">●</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {(min != null || max != null) && (
        <div className="border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Quitar filtro
          </button>
        </div>
      )}
    </div>
  );
}

function CpvPanel({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  function apply() {
    const v = draft.trim();
    if (v === "") {
      onChange(null);
      setError(null);
      return;
    }
    if (!/^[0-9-]{1,16}$/.test(v)) {
      setError("Solo dígitos y guion (máx 16)");
      return;
    }
    setError(null);
    onChange(v);
  }

  return (
    <div className="w-72 py-1">
      <div className="px-3 pt-3 pb-2 space-y-2">
        <SectionTitle>Prefijo CPV</SectionTitle>
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
          placeholder="ej. 4521"
          className="
            w-full rounded-lg bg-surface ring-1 ring-border px-3 py-1.5
            text-sm text-foreground placeholder:text-muted-foreground tabular-nums
            focus:outline-none focus:ring-2 focus:ring-foreground/20
          "
        />
        <p className="text-[11px] leading-snug text-muted-foreground">
          Filtra por código CPV que empiece por el prefijo. Ej.{" "}
          <span className="font-mono">45</span> = obras de construcción,{" "}
          <span className="font-mono">4521</span> = construcción de edificios.
        </p>
        {error && <p className="text-[11px] font-medium text-danger">{error}</p>}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Quitar filtro
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={apply}
          className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-surface hover:opacity-85"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}

// ─── Búsqueda (input independiente, no popover) ──────────────────────────────

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  // Debounce para no spamear la URL en cada keystroke
  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (draft === value) return;
    const t = setTimeout(() => onChange(draft), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return (
    <div className="relative ml-auto w-full max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Buscar título u organismo…"
        className="
          w-full rounded-full bg-surface ring-1 ring-border
          pl-9 pr-8 py-1.5 text-sm text-foreground placeholder:text-muted-foreground
          focus:outline-none focus:ring-2 focus:ring-foreground/20
          transition-shadow
        "
      />
      {draft && (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          aria-label="Limpiar búsqueda"
          className="
            absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-5 w-5
            items-center justify-center rounded-full text-muted-foreground
            hover:bg-muted hover:text-foreground
          "
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

interface RadarFilterBarProps {
  state: UseRadarFiltersReturn;
}

export function RadarFilterBar({ state }: RadarFilterBarProps) {
  const { filters, patchFilters, setFilter } = state;

  const provResumen = resumenList(
    filters.provincia,
    PROVINCIAS_LABEL as Record<Provincia, string>,
    PROVINCIAS as Provincia[],
    "Toda Cataluña",
  );
  const orgResumen = resumenList(
    filters.tipo_organismo,
    TIPOS_ORGANISMO_LABEL as Record<TipoOrganismo, string>,
    TIPOS_ORGANISMO as TipoOrganismo[],
    "Todos",
  );
  const importeResumen = resumenImporte(filters.importe_min, filters.importe_max);
  const plazoResumen = resumenPlazo(filters.plazo_min_dias, filters.plazo_max_dias);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Puntuación (tier de ganabilidad — sustituye al semáforo legacy) */}
      <FilterPopover
        minWidth={240}
        trigger={({ ref, open, toggle }) => (
          <FilterPill
            ref={ref}
            label="Puntuación"
            value={filters.tier !== "todas" ? TIER_LABEL[filters.tier] : null}
            active={filters.tier !== "todas"}
            open={open}
            onClick={toggle}
          />
        )}
      >
        {(close) => (
          <PuntuacionPanel
            value={filters.tier}
            onSelect={(v) => {
              setFilter("tier", v);
              close();
            }}
          />
        )}
      </FilterPopover>

      {/* Provincia */}
      <FilterPopover
        minWidth={220}
        trigger={({ ref, open, toggle }) => (
          <FilterPill
            ref={ref}
            label="Provincia"
            value={provResumen.value}
            count={provResumen.count}
            active={filters.provincia.length > 0}
            open={open}
            onClick={toggle}
          />
        )}
      >
        <CheckboxGroup
          options={PROVINCIA_OPTS}
          selected={filters.provincia}
          onChange={(next) => setFilter("provincia", next)}
        />
      </FilterPopover>

      {/* Tipo organismo */}
      <FilterPopover
        minWidth={260}
        trigger={({ ref, open, toggle }) => (
          <FilterPill
            ref={ref}
            label="Organismo"
            value={orgResumen.value}
            count={orgResumen.count}
            active={filters.tipo_organismo.length > 0}
            open={open}
            onClick={toggle}
          />
        )}
      >
        <CheckboxGroup
          options={ORGANISMO_OPTS}
          selected={filters.tipo_organismo}
          onChange={(next) => setFilter("tipo_organismo", next)}
        />
      </FilterPopover>

      {/* Importe */}
      <FilterPopover
        minWidth={288}
        trigger={({ ref, open, toggle }) => (
          <FilterPill
            ref={ref}
            label="Importe"
            value={importeResumen}
            active={filters.importe_min != null || filters.importe_max != null}
            open={open}
            onClick={toggle}
          />
        )}
      >
        {(close) => (
          <ImportePanel
            min={filters.importe_min}
            max={filters.importe_max}
            onChange={(m, M) => {
              patchFilters({ importe_min: m, importe_max: M });
              close();
            }}
            onClear={() => patchFilters({ importe_min: null, importe_max: null })}
          />
        )}
      </FilterPopover>

      {/* Plazo */}
      <FilterPopover
        minWidth={240}
        trigger={({ ref, open, toggle }) => (
          <FilterPill
            ref={ref}
            label="Plazo"
            value={plazoResumen}
            active={filters.plazo_min_dias != null || filters.plazo_max_dias != null}
            open={open}
            onClick={toggle}
          />
        )}
      >
        {(close) => (
          <PlazoPanel
            min={filters.plazo_min_dias}
            max={filters.plazo_max_dias}
            onSelect={(m, M) => {
              patchFilters({ plazo_min_dias: m, plazo_max_dias: M });
              close();
            }}
            onClear={() => patchFilters({ plazo_min_dias: null, plazo_max_dias: null })}
          />
        )}
      </FilterPopover>

      {/* CPV */}
      <FilterPopover
        minWidth={288}
        trigger={({ ref, open, toggle }) => (
          <FilterPill
            ref={ref}
            label="CPV"
            value={filters.cpv_prefix}
            active={!!filters.cpv_prefix}
            open={open}
            onClick={toggle}
          />
        )}
      >
        <CpvPanel
          value={filters.cpv_prefix}
          onChange={(next) => setFilter("cpv_prefix", next)}
        />
      </FilterPopover>

      {/* Ordenar — separador visual con margen izquierdo */}
      <div className="ml-1 h-5 w-px bg-border" aria-hidden="true" />
      <FilterPopover
        minWidth={240}
        trigger={({ ref, open, toggle }) => (
          <FilterPill
            ref={ref}
            label="Ordenar"
            value={ORDER_BY_LABEL[filters.order_by]}
            active={filters.order_by !== "score"}
            open={open}
            onClick={toggle}
            icon={ORDER_BY_DIR[filters.order_by] === "asc" ? ArrowUp : ArrowDown}
          />
        )}
      >
        {(close) => (
          <OrdenPanel
            value={filters.order_by}
            onSelect={(v) => {
              setFilter("order_by", v);
              close();
            }}
          />
        )}
      </FilterPopover>

      {/* Búsqueda */}
      <SearchInput value={filters.q} onChange={(v) => setFilter("q", v)} />
    </div>
  );
}

// ─── Para chips activos: helpers públicos ────────────────────────────────────

export function describeFilters(filters: RadarFilters): {
  key: string;
  label: string;
  onRemoveKey: keyof RadarFilters | "importe" | "plazo";
}[] {
  const out: { key: string; label: string; onRemoveKey: keyof RadarFilters | "importe" | "plazo" }[] = [];

  if (filters.tier !== "todas") {
    out.push({
      key: `tier-${filters.tier}`,
      label: `Puntuación: ${TIER_LABEL[filters.tier]}`,
      onRemoveKey: "tier",
    });
  }

  // Provincia: regla "Toda Cataluña" si están las 4
  if (filters.provincia.length === PROVINCIAS.length) {
    out.push({
      key: "prov-cat",
      label: "Toda Cataluña",
      onRemoveKey: "provincia",
    });
  } else {
    for (const p of filters.provincia) {
      out.push({
        key: `prov-${p}`,
        label: PROVINCIAS_LABEL[p],
        onRemoveKey: "provincia",
      });
    }
  }

  if (filters.tipo_organismo.length === TIPOS_ORGANISMO.length) {
    out.push({
      key: "org-all",
      label: "Todos los organismos",
      onRemoveKey: "tipo_organismo",
    });
  } else {
    for (const t of filters.tipo_organismo) {
      out.push({
        key: `org-${t}`,
        label: TIPOS_ORGANISMO_LABEL[t],
        onRemoveKey: "tipo_organismo",
      });
    }
  }

  const imp = resumenImporte(filters.importe_min, filters.importe_max);
  if (imp) {
    out.push({ key: "importe", label: `Importe: ${imp}`, onRemoveKey: "importe" });
  }
  const plz = resumenPlazo(filters.plazo_min_dias, filters.plazo_max_dias);
  if (plz) {
    out.push({ key: "plazo", label: `Plazo: ${plz}`, onRemoveKey: "plazo" });
  }
  if (filters.cpv_prefix) {
    out.push({ key: "cpv", label: `CPV ${filters.cpv_prefix}*`, onRemoveKey: "cpv_prefix" });
  }
  if (filters.q) {
    out.push({ key: "q", label: `"${filters.q}"`, onRemoveKey: "q" });
  }

  return out;
}
