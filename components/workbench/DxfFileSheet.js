import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import {
  DXF_BEND_DIRECTION,
  normalizeDxfBendAngleDeg,
  normalizeDxfBendDirection,
  normalizeDxfPreviewThicknessMm
} from "../../lib/dxf/buildPreviewMesh";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "../ui/accordion";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import FileSheet from "./FileSheet";

const fieldLabelClasses = "block text-xs font-medium text-muted-foreground";
const compactInputClasses = "h-8 text-xs font-medium tabular-nums";
const compactIconButtonClasses = "size-8";

function formatThicknessInput(valueMm) {
  const numericValue = Number(valueMm);
  if (!Number.isFinite(numericValue)) {
    return "";
  }
  return numericValue.toFixed(4).replace(/\.?0+$/, "");
}

function formatAngleInput(valueDeg) {
  const rounded = Math.round(Number(valueDeg) * 10) / 10;
  return Number.isFinite(rounded) ? String(rounded) : "";
}

function DxfBendRow({
  index,
  setting,
  onChange
}) {
  const [draftAngle, setDraftAngle] = useState(() => formatAngleInput(setting?.angleDeg));

  useEffect(() => {
    setDraftAngle(formatAngleInput(setting?.angleDeg));
  }, [setting?.angleDeg]);

  const commitAngle = (nextValue) => {
    const normalizedAngle = normalizeDxfBendAngleDeg(nextValue, setting?.angleDeg);
    onChange(index, { angleDeg: normalizedAngle });
    setDraftAngle(formatAngleInput(normalizedAngle));
  };

  const direction = normalizeDxfBendDirection(setting?.direction);

  return (
    <div className="px-3 py-2">
      <span className={fieldLabelClasses}>B{index + 1}</span>
      <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_5.75rem] gap-2">
        <div className="min-w-0">
          <span className="sr-only">Direction</span>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={direction}
            onValueChange={(nextDirection) => {
              if (!nextDirection) {
                return;
              }
              onChange(index, { direction: nextDirection });
            }}
            className="grid h-8 w-full min-w-0 grid-cols-2"
            aria-label={`Bend ${index + 1} direction`}
          >
            <ToggleGroupItem
              value={DXF_BEND_DIRECTION.UP}
              className="text-xs data-[state=on]:font-semibold data-[state=on]:ring-1 data-[state=on]:ring-inset data-[state=on]:ring-primary"
            >
              Up
            </ToggleGroupItem>
            <ToggleGroupItem
              value={DXF_BEND_DIRECTION.DOWN}
              className="text-xs data-[state=on]:font-semibold data-[state=on]:ring-1 data-[state=on]:ring-inset data-[state=on]:ring-primary"
            >
              Down
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <label className="block">
          <span className="sr-only">Angle</span>
          <div className="relative">
            <Input
              type="number"
              min="0"
              max="180"
              step="1"
              inputMode="decimal"
              value={draftAngle}
              onChange={(event) => {
                setDraftAngle(event.target.value);
              }}
              onFocus={(event) => {
                event.currentTarget.select();
              }}
              onMouseUp={(event) => {
                event.preventDefault();
              }}
              onBlur={() => {
                commitAngle(draftAngle);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              className={`${compactInputClasses} w-full pr-9 text-right`}
              aria-label={`Bend ${index + 1} angle in degrees`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">deg</span>
          </div>
        </label>
      </div>
    </div>
  );
}

export default function DxfFileSheet({
  open,
  isDesktop,
  width,
  valueMm,
  bendSettings,
  hasDxfData,
  explorerLoading,
  onStartResize,
  onThicknessChange,
  onBendChange,
  themeSections = null
}) {
  const [draftValue, setDraftValue] = useState(() => formatThicknessInput(valueMm));
  const normalizedBendSettings = Array.isArray(bendSettings) ? bendSettings : [];

  useEffect(() => {
    setDraftValue(formatThicknessInput(valueMm));
  }, [valueMm]);

  const commitValue = (nextValue) => {
    const normalizedValue = normalizeDxfPreviewThicknessMm(nextValue, valueMm);
    onThicknessChange(normalizedValue);
    setDraftValue(formatThicknessInput(normalizedValue));
  };

  return (
    <FileSheet
      open={open}
      title="DXF"
      isDesktop={isDesktop}
      width={width}
      onStartResize={onStartResize}
    >
      <Accordion type="multiple" defaultValue={["plate", "bends"]} className="text-sm">
        <AccordionItem value="plate" className="border-border">
          <AccordionTrigger>Plate</AccordionTrigger>
          <AccordionContent>
            <label className="block px-3 py-2">
              <span className={fieldLabelClasses}>Thickness</span>
              <div className="mt-1.5 grid grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={compactIconButtonClasses}
                  onClick={() => {
                    commitValue(valueMm - 0.25);
                  }}
                  disabled={!hasDxfData}
                  aria-label="Reduce DXF material thickness"
                  title="Reduce thickness"
                >
                  <Minus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </Button>
                <div className="relative block">
                  <Input
                    type="number"
                    min="0.2"
                    max="25"
                    step="any"
                    inputMode="decimal"
                    value={draftValue}
                    disabled={!hasDxfData}
                    onChange={(event) => {
                      setDraftValue(event.target.value);
                    }}
                    onBlur={() => {
                      commitValue(draftValue);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                    }}
                    className={`${compactInputClasses} w-full pr-9 text-right`}
                    aria-label="DXF material thickness in millimeters"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">mm</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={compactIconButtonClasses}
                  onClick={() => {
                    commitValue(valueMm + 0.25);
                  }}
                  disabled={!hasDxfData}
                  aria-label="Increase DXF material thickness"
                  title="Increase thickness"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                </Button>
              </div>
            </label>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="bends" className="border-border">
          <AccordionTrigger>Bends</AccordionTrigger>
          <AccordionContent className="py-1">
            {normalizedBendSettings.length ? normalizedBendSettings.map((setting, index) => (
              <DxfBendRow
                key={setting.id || `bend-${index + 1}`}
                index={index}
                setting={setting}
                onChange={onBendChange}
              />
            )) : (
              <p className="px-3 py-3 text-xs text-muted-foreground">
                {explorerLoading ? "Loading bends..." : "No bends are available."}
              </p>
            )}
          </AccordionContent>
        </AccordionItem>
        {themeSections}
      </Accordion>
    </FileSheet>
  );
}
