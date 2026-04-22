"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Seleccionar…",
  disabled = false,
  className = "",
  "aria-label": ariaLabel,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? "";

  function handleOpen() {
    if (disabled) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelH = Math.min(options.length * 36 + 8, 300);
    const spaceBelow = window.innerHeight - rect.bottom;
    const showBelow = spaceBelow >= panelH || spaceBelow >= window.innerHeight / 2;
    const minW = Math.max(rect.width, 220);
    setPanelStyle(
      showBelow
        ? { top: rect.bottom + 4, left: rect.left, minWidth: minW }
        : { bottom: window.innerHeight - rect.top + 4, left: rect.left, minWidth: minW },
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
          inline-flex w-full items-center justify-between gap-1.5
          rounded-lg bg-surface ring-1 ring-border
          px-3 py-2 text-sm text-left
          transition-colors focus:outline-none focus:ring-2 focus:ring-foreground
          disabled:opacity-50 disabled:pointer-events-none
          hover:ring-foreground/30
          ${className}
        `}
      >
        <span
          className={`truncate ${value ? "text-foreground" : "text-muted-foreground"}`}
        >
          {selectedLabel || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", zIndex: 9999, ...panelStyle }}
            className="max-h-[300px] overflow-y-auto rounded-xl bg-surface-raised ring-1 ring-border shadow-lg py-1"
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`
                  w-full text-left px-3 py-2 text-sm transition-colors
                  ${o.value === value
                    ? "bg-foreground text-surface font-medium"
                    : "text-foreground hover:bg-muted"
                  }
                `}
              >
                {o.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
