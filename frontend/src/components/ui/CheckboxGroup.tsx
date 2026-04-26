"use client";

import { Check } from "lucide-react";

export interface CheckboxOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface CheckboxGroupProps<T extends string> {
  options: CheckboxOption<T>[];
  selected: T[];
  onChange: (next: T[]) => void;
}

/**
 * Lista de checkboxes multi-selección para usar dentro de un FilterPopover.
 * No tiene padding propio: el popover marca el contenedor.
 */
export function CheckboxGroup<T extends string>({
  options,
  selected,
  onChange,
}: CheckboxGroupProps<T>) {
  const set = new Set(selected);

  function toggle(v: T) {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(options.map((o) => o.value).filter((x) => next.has(x)));
  }

  return (
    <ul className="flex flex-col py-1" role="group">
      {options.map((opt) => {
        const checked = set.has(opt.value);
        return (
          <li key={opt.value}>
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => toggle(opt.value)}
              className={[
                "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors",
                "hover:bg-muted focus:outline-none focus-visible:bg-muted",
                checked ? "text-foreground" : "text-foreground",
              ].join(" ")}
            >
              <span
                aria-hidden="true"
                className={[
                  "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors",
                  checked
                    ? "border-foreground bg-foreground text-surface"
                    : "border-border bg-transparent",
                ].join(" ")}
              >
                {checked && <Check className="h-3 w-3 stroke-[3]" />}
              </span>
              <span className="flex flex-1 flex-col leading-tight">
                <span className="font-medium">{opt.label}</span>
                {opt.hint && (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {opt.hint}
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
