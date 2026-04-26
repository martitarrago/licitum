"use client";

import { useEffect, useLayoutEffect, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";

interface FilterPopoverProps {
  /** Trigger render — recibe ref que debes pegar al botón y `open`/`toggle`. */
  trigger: (api: {
    ref: Ref<HTMLButtonElement>;
    open: boolean;
    toggle: () => void;
  }) => React.ReactNode;
  /** Contenido del panel. Se monta en un portal. */
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  /** Ancho mínimo del panel. Default 240px. */
  minWidth?: number;
  /** Callback cuando se cierra el popover (útil para resetear estado interno). */
  onClose?: () => void;
}

/**
 * Popover flotante para filtros del Radar.
 *
 * Replica el patrón de CustomSelect (portal + position fixed + click-outside)
 * pero con contenido libre, no una lista de opciones. Auto-flip arriba/abajo
 * según espacio disponible y se realinea al hacer scroll/resize.
 */
export function FilterPopover({
  trigger,
  children,
  minWidth = 240,
  onClose,
}: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  function close() {
    if (open) {
      setOpen(false);
      onClose?.();
    }
  }

  function toggle() {
    if (open) close();
    else setOpen(true);
  }

  // Posicionar el panel cuando se abre y al cambiar viewport.
  useLayoutEffect(() => {
    if (!open) return;
    function reposition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const panelH = panelRef.current?.offsetHeight ?? 320;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const showBelow = spaceBelow >= panelH + 8 || spaceBelow >= spaceAbove;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - minWidth - 8));
      setStyle(
        showBelow
          ? { top: rect.bottom + 6, left, minWidth }
          : { bottom: window.innerHeight - rect.top + 6, left, minWidth },
      );
    }
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, minWidth]);

  // Click-outside para cerrar.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      {trigger({ ref: triggerRef, open, toggle })}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", zIndex: 9999, ...style }}
            className="
              rounded-xl bg-surface-raised ring-1 ring-border shadow-lg
              animate-fade-in
            "
            role="dialog"
          >
            {typeof children === "function" ? children(close) : children}
          </div>,
          document.body,
        )}
    </>
  );
}
