"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const DAYS_SHORT = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sa", "Do"];
const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function parseIso(value: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplay(value: string): string {
  const d = parseIso(value);
  if (!d) return "";
  return d.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Returns an array of day numbers (1–N) or null for empty cells, Monday-first
function buildCalendar(year: number, month: number): (number | null)[] {
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const offset = (firstDow + 6) % 7; // convert to Mon-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(offset).fill(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

interface DatePickerProps {
  value: string; // ISO yyyy-mm-dd or ""
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
}

export function DatePicker({
  value,
  onChange,
  disabled = false,
  placeholder = "Seleccionar fecha…",
  "aria-label": ariaLabel,
  className = "",
}: DatePickerProps) {
  const today = new Date();
  const todayIso = toIso(today);

  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const [navYear, setNavYear] = useState(today.getFullYear());
  const [navMonth, setNavMonth] = useState(today.getMonth());
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function handleOpen() {
    if (disabled) return;
    const parsed = parseIso(value);
    setNavYear(parsed?.getFullYear() ?? today.getFullYear());
    setNavMonth(parsed?.getMonth() ?? today.getMonth());

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelH = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showBelow = spaceBelow >= panelH || spaceBelow >= window.innerHeight / 2;
    setPanelStyle(
      showBelow
        ? { top: rect.bottom + 4, left: rect.left }
        : { bottom: window.innerHeight - rect.top + 4, left: rect.left },
    );
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (
        panelRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function prevMonth() {
    if (navMonth === 0) {
      setNavMonth(11);
      setNavYear((y) => y - 1);
    } else {
      setNavMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (navMonth === 11) {
      setNavMonth(0);
      setNavYear((y) => y + 1);
    } else {
      setNavMonth((m) => m + 1);
    }
  }

  function selectDay(day: number) {
    const d = new Date(navYear, navMonth, day);
    onChange(toIso(d));
    setOpen(false);
  }

  const cells = buildCalendar(navYear, navMonth);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={open ? () => setOpen(false) : handleOpen}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        className={`
          inline-flex w-full items-center gap-2
          rounded-lg bg-surface ring-1 ring-border
          px-3 py-2 text-sm text-left
          transition-colors focus:outline-none focus:ring-2 focus:ring-foreground
          disabled:opacity-50 disabled:pointer-events-none
          hover:ring-foreground/30
          ${className}
        `}
      >
        <CalendarDays
          className="h-4 w-4 flex-shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span
          className={`flex-1 truncate ${value ? "text-foreground" : "text-muted-foreground"}`}
        >
          {value ? formatDisplay(value) : placeholder}
        </span>
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", zIndex: 9999, width: 288, ...panelStyle }}
            className="rounded-xl bg-surface-raised ring-1 ring-border shadow-lg p-3 select-none"
          >
            {/* Month navigation */}
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={prevMonth}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Mes anterior"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="text-sm font-semibold capitalize text-foreground">
                {MONTH_NAMES[navMonth]} {navYear}
              </span>
              <button
                type="button"
                onClick={nextMonth}
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {/* Day-of-week headers */}
            <div className="mb-1 grid grid-cols-7">
              {DAYS_SHORT.map((d) => (
                <div
                  key={d}
                  className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((day, i) => {
                if (!day) return <div key={i} aria-hidden="true" />;
                const iso = toIso(new Date(navYear, navMonth, day));
                const isSelected = iso === value;
                const isToday = iso === todayIso;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectDay(day)}
                    className={`
                      mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors
                      ${isSelected
                        ? "bg-foreground font-semibold text-surface"
                        : isToday
                          ? "font-medium text-foreground ring-1 ring-border hover:bg-muted"
                          : "text-foreground hover:bg-muted"
                      }
                    `}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
