import { X } from "lucide-react";

import { formatMeasurementDelta } from "cadjs/lib/viewer/measurement.js";
import { measureLabelText } from "cadjs/lib/viewer/measureDimension.js";

import { MEASURE_RULER_MAX_MEASUREMENTS } from "../../workbench/measureRulerState.js";
import { cn } from "@/ui/utils";

export default function MeasurePanel({
  measurements = [],
  activeId = "",
  onActivate = null,
  onDelete = null,
  measureModeActive = false
}) {
  return (
    <div className="pointer-events-auto inline-flex w-52 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-md border border-sidebar-border cad-glass-surface text-sidebar-foreground shadow-sm">
      <div className="flex items-center justify-between px-2.5 pt-1.5 pb-1 text-[10px] font-medium text-sidebar-foreground/60">
        <span>Measurements</span>
        <span className="tabular-nums">
          {measurements.length}/{MEASURE_RULER_MAX_MEASUREMENTS}
        </span>
      </div>
      <div className="max-h-40 overflow-y-auto px-1 pb-1">
        {measurements.length === 0 ? (
          <div className="px-1.5 py-1 text-[11px] leading-snug text-sidebar-foreground/60">
            {measureModeActive ? "Click two points on model to measure" : "No measurements"}
          </div>
        ) : (
          measurements.map((item, index) => {
            const active = item.id === activeId;
            const labelText = measureLabelText(item.measurement);
            const deltaText = formatMeasurementDelta(item.measurement);
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                title={deltaText ? `${labelText} (${deltaText})` : labelText}
                onClick={() => onActivate?.(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onActivate?.(item.id);
                  }
                }}
                className={cn(
                  "flex h-7 cursor-pointer items-center justify-between gap-1.5 rounded-sm px-1.5 text-[11px] transition",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                )}
              >
                <span className="truncate tabular-nums">
                  <span className="mr-1 text-[10px] text-sidebar-foreground/50">#{index + 1}</span>
                  {labelText}
                </span>
                <button
                  type="button"
                  aria-label={`Delete measurement ${index + 1}`}
                  className="grid size-4 shrink-0 place-items-center rounded-sm text-sidebar-foreground/50 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete?.(item.id);
                  }}
                >
                  <X className="size-3" strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
