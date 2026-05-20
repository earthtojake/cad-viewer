import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Contrast, Grid3x3, Plus, RotateCcw, Save, X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "../ui/accordion";
import { Button } from "../ui/button";
import { ColorPicker } from "../ui/color-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "../ui/dropdown-menu";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "../ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { cn } from "../../lib/cn";
import {
  DEFAULT_THEME_PRESET_ID,
  THEME_DISPLAY_MODES,
  THEME_EDGE_SOURCES,
  THEME_FLOOR_MODES,
  THEME_TOPOLOGY_EDGE_FILTERS,
  MAX_THEME_FILL_COLORS,
  normalizeThemeSettings,
  resolveSystemThemePresetId
} from "../../lib/themeSettings";
import FileSheet from "./FileSheet";

const BACKGROUND_MODE_OPTIONS = [
  { value: "solid", label: "Solid" },
  { value: "linear", label: "Linear" },
  { value: "radial", label: "Radial" },
  { value: "transparent", label: "Transparent" }
];

const DISPLAY_MODE_OPTIONS = [
  { value: THEME_DISPLAY_MODES.SOLID, label: "Solid", Icon: Box },
  { value: THEME_DISPLAY_MODES.WIREFRAME, label: "Wire", Icon: Grid3x3 }
];

const FLOOR_MODE_OPTIONS = [
  { value: THEME_FLOOR_MODES.STAGE, label: "Stage" },
  { value: THEME_FLOOR_MODES.GRID, label: "Grid" },
  { value: THEME_FLOOR_MODES.NONE, label: "None" }
];

const EDGE_SOURCE_OPTIONS = [
  { value: THEME_EDGE_SOURCES.TOPOLOGY, label: "CAD" },
  { value: THEME_EDGE_SOURCES.DERIVED, label: "Mesh" }
];

const TOPOLOGY_EDGE_FILTER_OPTIONS = [
  { value: THEME_TOPOLOGY_EDGE_FILTERS.FEATURE, label: "Feature" },
  { value: THEME_TOPOLOGY_EDGE_FILTERS.ALL, label: "All" }
];

const PRIMARY_LIGHT_OPTIONS = [
  { value: "directional", label: "Directional" },
  { value: "spot", label: "Spot" },
  { value: "point", label: "Point" }
];

const controlRowClasses = "space-y-1.5 px-3 py-2";
const fieldLabelClasses = "block text-xs font-medium text-muted-foreground";
const valueBadgeClasses = "rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground";
const compactButtonClasses = "h-8 px-2 text-xs";
const SLIDER_COMMIT_DELAY_MS = 120;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatNumber(value, digits = 2) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "0";
  }
  return numericValue.toFixed(digits);
}

function Field({ label, value, children, className }) {
  return (
    <div className={cn(controlRowClasses, className)}>
      <div className="flex items-center justify-between gap-3">
        <span className={fieldLabelClasses}>{label}</span>
        {value != null ? (
          <span className={valueBadgeClasses}>{value}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Section({ title, value, children }) {
  return (
    <AccordionItem value={value} className="border-border">
      <AccordionTrigger>{title}</AccordionTrigger>
      <AccordionContent className="py-1">{children}</AccordionContent>
    </AccordionItem>
  );
}

function SectionGroupLabel({ children }) {
  return (
    <div className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground first:pt-1">
      {children}
    </div>
  );
}

function SwitchRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className={fieldLabelClasses}>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function SliderInput({ value, min, max, step = 0.01, onChange }) {
  const numericValue = Number.isFinite(Number(value)) ? Number(value) : min;
  const [draftValue, setDraftValue] = useState(numericValue);
  const commitTimerRef = useRef(null);

  useEffect(() => {
    setDraftValue(numericValue);
  }, [numericValue]);

  useEffect(() => () => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
    }
  }, []);

  const resolveNextValue = (nextValue) => {
    const numericNextValue = Number(nextValue);
    return Number.isFinite(numericNextValue) ? clamp(numericNextValue, min, max) : numericValue;
  };

  const commitValue = (nextValue) => {
    const resolvedNextValue = resolveNextValue(nextValue);
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
    }
    if (Math.abs(resolvedNextValue - numericValue) > 1e-9) {
      onChange(resolvedNextValue);
    }
  };

  const scheduleCommitValue = (nextValue) => {
    const resolvedNextValue = resolveNextValue(nextValue);
    setDraftValue(resolvedNextValue);
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
    }
    commitTimerRef.current = setTimeout(() => {
      commitValue(resolvedNextValue);
    }, SLIDER_COMMIT_DELAY_MS);
  };

  return (
    <Slider
      value={[draftValue]}
      min={min}
      max={max}
      step={step}
      onValueChange={(nextValue) => scheduleCommitValue(nextValue[0] ?? draftValue)}
      onValueCommit={(nextValue) => commitValue(nextValue[0] ?? draftValue)}
      className="h-8"
    />
  );
}

function ColorInput({ value, onChange, className, disabled = false }) {
  return <ColorPicker value={value} onChange={onChange} className={className} disabled={disabled} />;
}

function resolveFillColors(materials = {}) {
  const colors = Array.isArray(materials.fillColors) && materials.fillColors.length
    ? materials.fillColors
    : [materials.defaultColor || "#ffffff"];
  return colors.slice(0, MAX_THEME_FILL_COLORS);
}

function settingsSignature(settings) {
  return JSON.stringify(normalizeThemeSettings(settings));
}

function FillColorEditor({ colors, onChange, cycleColors = false }) {
  const resolvedColors = colors.length ? colors : ["#ffffff"];
  const commitColors = (nextColors) => {
    const compactColors = nextColors.filter(Boolean).slice(0, MAX_THEME_FILL_COLORS);
    onChange(compactColors.length ? compactColors : [resolvedColors[0] || "#ffffff"]);
  };

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "grid gap-2",
          resolvedColors.length > 1
            ? "grid-cols-[repeat(auto-fit,minmax(7rem,1fr))]"
            : "grid-cols-1"
        )}
      >
        {resolvedColors.map((color, index) => (
          <div
            key={index}
            className={cn(
              "relative min-w-0 transition-opacity",
              !cycleColors && index > 0 && "opacity-45 grayscale"
            )}
          >
            <ColorInput
              value={color}
              className={cn(
                "min-w-0 px-1.5",
                resolvedColors.length > 1 && "pr-7"
              )}
              onChange={(nextColor) => {
                const nextColors = [...resolvedColors];
                nextColors[index] = nextColor;
                commitColors(nextColors);
              }}
            />
            {resolvedColors.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute right-1 top-1/2 z-10 size-5 -translate-y-1/2 rounded-sm p-0 text-muted-foreground hover:bg-background/75 hover:text-foreground"
                onClick={() => commitColors(resolvedColors.filter((_, colorIndex) => colorIndex !== index))}
                aria-label={`Remove color ${index + 1}`}
                title={`Remove color ${index + 1}`}
              >
                <X className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {resolvedColors.length < MAX_THEME_FILL_COLORS ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={compactButtonClasses}
          onClick={() => commitColors([...resolvedColors, resolvedColors[resolvedColors.length - 1] || "#ffffff"])}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          <span>Add color</span>
        </Button>
      ) : null}
    </div>
  );
}

function SegmentedControl({ value, onChange, options }) {
  const templateColumns = `repeat(${Math.max(options.length, 1)}, minmax(0, 1fr))`;
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={value}
      onValueChange={(nextValue) => {
        if (!nextValue) {
          return;
        }
        onChange(nextValue);
      }}
      className="grid h-8 w-full min-w-0"
      style={{ gridTemplateColumns: templateColumns }}
    >
      {options.map((option) => {
        const Icon = option.Icon;
        return (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="min-w-0 gap-1.5 text-xs data-[state=on]:font-semibold data-[state=on]:ring-1 data-[state=on]:ring-inset data-[state=on]:ring-primary"
            title={option.label}
            aria-label={option.label}
          >
            {Icon ? <Icon className="size-3.5" strokeWidth={2} aria-hidden="true" /> : null}
            <span className="truncate">{option.label}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

export function PresetSwatch({ preset = null }) {
  if (!preset) {
    return (
      <span
        className="h-4 w-8 shrink-0 rounded-md border border-dashed bg-muted"
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className="relative h-4 w-8 shrink-0 overflow-hidden rounded-md border shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
      style={{ backgroundImage: preset.preview.background }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-y-0 right-0 w-3"
        style={{ backgroundColor: preset.preview.accentColor, opacity: 0.9 }}
      />
    </span>
  );
}

export function useSystemDefaultThemePresetId() {
  const [systemDefaultPresetId, setSystemDefaultPresetId] = useState(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return DEFAULT_THEME_PRESET_ID;
    }
    return resolveSystemThemePresetId({
      prefersDark: window.matchMedia("(prefers-color-scheme: dark)").matches === true
    });
  });

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return undefined;
    }

    const colorSchemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemDefaultPreset = () => {
      setSystemDefaultPresetId(resolveSystemThemePresetId({
        prefersDark: colorSchemeQuery.matches === true
      }));
    };

    updateSystemDefaultPreset();
    colorSchemeQuery.addEventListener?.("change", updateSystemDefaultPreset);
    return () => {
      colorSchemeQuery.removeEventListener?.("change", updateSystemDefaultPreset);
    };
  }, []);

  return systemDefaultPresetId;
}

function orderedThemePresets(presets, systemDefaultPresetId) {
  const defaultPresetIndex = presets.findIndex((preset) => preset.id === systemDefaultPresetId);
  if (defaultPresetIndex <= 0) {
    return presets;
  }
  return [
    presets[defaultPresetIndex],
    ...presets.slice(0, defaultPresetIndex),
    ...presets.slice(defaultPresetIndex + 1)
  ];
}

function resolveActiveThemePreset(themePresets, themePresetId, themeSettings) {
  const currentThemeSettingsSignature = settingsSignature(themeSettings);
  const directPreset = themePresets.find((preset) => preset.id === themePresetId) || null;
  const directPresetMatches = directPreset
    ? settingsSignature(directPreset.settings) === currentThemeSettingsSignature
    : false;
  if (directPresetMatches) {
    return directPreset;
  }
  return themePresets.find((preset) => settingsSignature(preset.settings) === currentThemeSettingsSignature) || null;
}

export function ThemePresetDropdown({
  themePresets = [],
  themeSettings,
  themePresetId = "",
  updateThemeSettings,
  handleResetThemeSettings,
  handleSaveCustomThemePreset,
  triggerClassName,
  iconClassName
}) {
  const systemDefaultPresetId = useSystemDefaultThemePresetId();
  const orderedPresets = useMemo(
    () => orderedThemePresets(themePresets, systemDefaultPresetId),
    [themePresets, systemDefaultPresetId]
  );
  const activeThemePreset = useMemo(
    () => resolveActiveThemePreset(themePresets, themePresetId, themeSettings),
    [themePresets, themePresetId, themeSettings]
  );
  const activeThemePresetId = activeThemePreset?.id || "";
  const themeHasChanged = !activeThemePreset;
  const activeThemeLabel = activeThemePreset?.label || "Custom";

  const applyThemePreset = (presetId) => {
    const preset = themePresets.find((candidate) => candidate.id === presetId);
    if (!preset) {
      return;
    }
    updateThemeSettings?.(preset.settings);
  };

  const handleSaveTheme = () => {
    if (typeof window === "undefined" || typeof handleSaveCustomThemePreset !== "function") {
      return;
    }
    const fallbackName = activeThemePreset?.label
      ? `${activeThemePreset.label} copy`
      : "Custom theme";
    const themeName = window.prompt("Theme name", fallbackName);
    const normalizedThemeName = String(themeName || "").trim();
    if (!normalizedThemeName) {
      return;
    }
    handleSaveCustomThemePreset(normalizedThemeName);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Theme: ${activeThemeLabel}`}
          title={`Theme: ${activeThemeLabel}`}
          className={triggerClassName}
        >
          <Contrast className={iconClassName} strokeWidth={2} aria-hidden="true" />
          <span className="sr-only">Theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-64">
        <DropdownMenuLabel className="px-2 py-1.5 text-xs text-muted-foreground">
          Theme
        </DropdownMenuLabel>
        {orderedPresets.map((preset) => {
          const active = preset.id === activeThemePresetId;
          return (
            <DropdownMenuItem
              key={preset.id}
              data-active={active}
              aria-current={active ? "true" : undefined}
              className={cn(
                "min-w-0 text-xs",
                "data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground"
              )}
              onSelect={() => applyThemePreset(preset.id)}
            >
              <PresetSwatch preset={preset} />
              <span className="min-w-0 flex-1 truncate">{preset.label}</span>
              {preset.id === systemDefaultPresetId ? (
                <span className="rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em] text-muted-foreground">
                  Default
                </span>
              ) : null}
            </DropdownMenuItem>
          );
        })}
        {themeHasChanged ? (
          <DropdownMenuItem
            data-active="true"
            aria-current="true"
            className={cn(
              "min-w-0 text-xs",
              "data-[active=true]:bg-sidebar-accent data-[active=true]:font-semibold data-[active=true]:text-sidebar-accent-foreground"
            )}
          >
            <PresetSwatch />
            <span className="min-w-0 flex-1 truncate">Custom</span>
          </DropdownMenuItem>
        ) : null}
        {themeHasChanged ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs"
              onSelect={handleSaveTheme}
            >
              <Save className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              <span>Save custom theme</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-xs"
              onSelect={() => handleResetThemeSettings?.()}
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              <span>Reset to default</span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PositionPad({ value, onChange }) {
  const resolvedX = Number.isFinite(Number(value?.x)) ? Number(value.x) : 0;
  const resolvedZ = Number.isFinite(Number(value?.z)) ? Number(value.z) : 0;
  const [draftPosition, setDraftPosition] = useState({ x: resolvedX, z: resolvedZ });
  const draftPositionRef = useRef(draftPosition);
  const commitTimerRef = useRef(null);
  const x = draftPosition.x;
  const z = draftPosition.z;

  useEffect(() => {
    const nextPosition = { x: resolvedX, z: resolvedZ };
    draftPositionRef.current = nextPosition;
    setDraftPosition(nextPosition);
  }, [resolvedX, resolvedZ]);

  useEffect(() => () => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
    }
  }, []);

  const extent = useMemo(() => {
    const magnitude = Math.max(Math.abs(x), Math.abs(z), 220);
    return Math.min(5000, Math.ceil((magnitude * 1.2) / 20) * 20);
  }, [x, z]);

  const markerLeft = ((x + extent) / (extent * 2)) * 100;
  const markerTop = ((extent - z) / (extent * 2)) * 100;

  const commitPosition = (nextX, nextZ) => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
    }
    if (nextX !== resolvedX) {
      onChange("x", nextX);
    }
    if (nextZ !== resolvedZ) {
      onChange("z", nextZ);
    }
  };

  const scheduleCommitPosition = (nextX, nextZ) => {
    const nextPosition = { x: nextX, z: nextZ };
    draftPositionRef.current = nextPosition;
    setDraftPosition(nextPosition);
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
    }
    commitTimerRef.current = setTimeout(() => {
      commitPosition(nextX, nextZ);
    }, SLIDER_COMMIT_DELAY_MS);
  };

  const updateFromPointer = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const ratioX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const ratioY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    const nextX = Math.round((ratioX * 2 - 1) * extent);
    const nextZ = Math.round((1 - ratioY * 2) * extent);
    scheduleCommitPosition(nextX, nextZ);
  };

  return (
    <div className="space-y-2">
      <div
        className="relative h-36 w-full touch-none overflow-hidden rounded-md border bg-background"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            return;
          }
          updateFromPointer(event);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          commitPosition(draftPositionRef.current.x, draftPositionRef.current.z);
        }}
      >
        <div
          className="absolute inset-0 opacity-45"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(154, 169, 188, 0.65) 1.5px, transparent 1.5px)",
            backgroundSize: "22px 22px"
          }}
          aria-hidden="true"
        />
        <div className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden="true" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" aria-hidden="true" />
        <div
          className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary bg-foreground shadow-xs"
          style={{ left: `${markerLeft}%`, top: `${markerTop}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>X {Math.round(x)}</span>
        <span>Z {Math.round(z)}</span>
        <span>range +/-{extent}</span>
      </div>
    </div>
  );
}

export function ThemeSettingsSections({
  themeSettings,
  updateThemeSettings
}) {
  const [activePrimaryLight, setActivePrimaryLight] = useState("directional");

  const setDisplay = (patch) => {
    updateThemeSettings((current) => ({
      ...current,
      display: {
        ...current.display,
        ...patch
      }
    }));
  };

  const setMaterials = (patch) => {
    updateThemeSettings((current) => ({
      ...current,
      materials: {
        ...current.materials,
        ...patch
      }
    }));
  };

  const setBackground = (patch) => {
    updateThemeSettings((current) => ({
      ...current,
      background: {
        ...current.background,
        ...patch
      }
    }));
  };

  const setFloor = (patch) => {
    updateThemeSettings((current) => ({
      ...current,
      floor: {
        ...current.floor,
        ...patch
      }
    }));
  };

  const setEdges = (patch) => {
    const switchesToManualContrast =
      Object.prototype.hasOwnProperty.call(patch, "color");
    updateThemeSettings((current) => ({
      ...current,
      edges: {
        ...current.edges,
        ...(switchesToManualContrast ? { contrastMode: "manual" } : null),
        ...patch
      }
    }));
  };

  const setEnvironment = (patch) => {
    updateThemeSettings((current) => ({
      ...current,
      environment: {
        ...current.environment,
        ...patch
      }
    }));
  };

  const setLighting = (patch) => {
    updateThemeSettings((current) => ({
      ...current,
      lighting: {
        ...current.lighting,
        ...patch
      }
    }));
  };

  const setLightConfig = (lightKey, patch) => {
    updateThemeSettings((current) => ({
      ...current,
      lighting: {
        ...current.lighting,
        [lightKey]: {
          ...current.lighting[lightKey],
          ...patch
        }
      }
    }));
  };

  const setLightPosition = (lightKey, axis, nextValue) => {
    updateThemeSettings((current) => ({
      ...current,
      lighting: {
        ...current.lighting,
        [lightKey]: {
          ...current.lighting[lightKey],
          position: {
            ...current.lighting[lightKey].position,
            [axis]: nextValue
          }
        }
      }
    }));
  };

  return (
    <>
        <Section title="Display" value="display">
          <SectionGroupLabel>Mode</SectionGroupLabel>
          <Field label="Mode">
            <SegmentedControl
              value={themeSettings.display?.mode || THEME_DISPLAY_MODES.SOLID}
              options={DISPLAY_MODE_OPTIONS}
              onChange={(nextValue) => setDisplay({ mode: nextValue })}
            />
          </Field>

          <SectionGroupLabel>Colors</SectionGroupLabel>
          <Field label="Colors" value={`${resolveFillColors(themeSettings.materials).length}/${MAX_THEME_FILL_COLORS}`}>
            <FillColorEditor
              colors={resolveFillColors(themeSettings.materials)}
              cycleColors={themeSettings.materials.cycleColors === true}
              onChange={(nextColors) => setMaterials({
                defaultColor: nextColors[0],
                fillColors: nextColors
              })}
            />
          </Field>

          <SwitchRow
            label="Cycle colors"
            checked={themeSettings.materials.cycleColors === true}
            onChange={(nextValue) => setMaterials({ cycleColors: nextValue })}
          />

          <SwitchRow
            label="Override colors"
            checked={themeSettings.materials.overrideSourceColors === true}
            onChange={(nextValue) => setMaterials({ overrideSourceColors: nextValue })}
          />

          <Field label="Saturation" value={formatNumber(themeSettings.materials.saturation)}>
            <SliderInput
              value={themeSettings.materials.saturation}
              min={0}
              max={2.5}
              step={0.01}
              onChange={(nextValue) => setMaterials({ saturation: nextValue })}
            />
          </Field>

          <Field label="Contrast" value={formatNumber(themeSettings.materials.contrast)}>
            <SliderInput
              value={themeSettings.materials.contrast}
              min={0}
              max={2.5}
              step={0.01}
              onChange={(nextValue) => setMaterials({ contrast: nextValue })}
            />
          </Field>

          <Field label="Brightness" value={formatNumber(themeSettings.materials.brightness)}>
            <SliderInput
              value={themeSettings.materials.brightness}
              min={0}
              max={2}
              step={0.01}
              onChange={(nextValue) => setMaterials({ brightness: nextValue })}
            />
          </Field>

          <SectionGroupLabel>Edges</SectionGroupLabel>
          <SwitchRow label="Show edges" checked={themeSettings.edges.enabled} onChange={(nextValue) => setEdges({ enabled: nextValue })} />
          {themeSettings.edges.enabled ? (
            <>
              <Field label="Source">
                <SegmentedControl
                  value={themeSettings.edges.source || THEME_EDGE_SOURCES.DERIVED}
                  options={EDGE_SOURCE_OPTIONS}
                  onChange={(nextValue) => setEdges({ source: nextValue })}
                />
              </Field>
              {themeSettings.edges.source === THEME_EDGE_SOURCES.TOPOLOGY ? (
                <Field label="CAD edges">
                  <SegmentedControl
                    value={themeSettings.edges.topologyFilter || THEME_TOPOLOGY_EDGE_FILTERS.FEATURE}
                    options={TOPOLOGY_EDGE_FILTER_OPTIONS}
                    onChange={(nextValue) => setEdges({ topologyFilter: nextValue })}
                  />
                </Field>
              ) : null}
              <SwitchRow
                label="Auto contrast"
                checked={themeSettings.edges.contrastMode === "auto"}
                onChange={(nextValue) => setEdges({ contrastMode: nextValue ? "auto" : "manual" })}
              />
              {themeSettings.edges.contrastMode === "auto" ? null : (
                <Field label="Edge color">
                  <ColorInput value={themeSettings.edges.color} onChange={(nextValue) => setEdges({ color: nextValue })} />
                </Field>
              )}
              <Field label="Thickness" value={`${formatNumber(themeSettings.edges.thickness, 1)} px`}>
                <SliderInput
                  value={themeSettings.edges.thickness}
                  min={0.5}
                  max={6}
                  step={0.1}
                  onChange={(nextValue) => setEdges({ thickness: nextValue })}
                />
              </Field>
              <Field label="Edge opacity" value={formatNumber(themeSettings.edges.opacity)}>
                <SliderInput
                  value={themeSettings.edges.opacity}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(nextValue) => setEdges({ opacity: nextValue })}
                />
              </Field>
            </>
          ) : null}
        </Section>

        <Section title="Environment" value="environment">
          <SectionGroupLabel>Backdrop</SectionGroupLabel>
          <Field label="Style">
            <SegmentedControl
              value={themeSettings.background.type}
              onChange={(nextValue) => setBackground({ type: nextValue })}
              options={BACKGROUND_MODE_OPTIONS}
            />
          </Field>

          {themeSettings.background.type === "solid" ? (
            <Field label="Color">
              <ColorInput value={themeSettings.background.solidColor} onChange={(nextValue) => setBackground({ solidColor: nextValue })} />
            </Field>
          ) : null}

          {themeSettings.background.type === "linear" ? (
            <>
              <Field label="Start color">
                <ColorInput value={themeSettings.background.linearStart} onChange={(nextValue) => setBackground({ linearStart: nextValue })} />
              </Field>
              <Field label="End color">
                <ColorInput value={themeSettings.background.linearEnd} onChange={(nextValue) => setBackground({ linearEnd: nextValue })} />
              </Field>
              <Field label="Angle" value={`${formatNumber(themeSettings.background.linearAngle, 0)} deg`}>
                <SliderInput
                  value={themeSettings.background.linearAngle}
                  min={-360}
                  max={360}
                  step={1}
                  onChange={(nextValue) => setBackground({ linearAngle: nextValue })}
                />
              </Field>
            </>
          ) : null}

          {themeSettings.background.type === "radial" ? (
            <>
              <Field label="Inner color">
                <ColorInput value={themeSettings.background.radialInner} onChange={(nextValue) => setBackground({ radialInner: nextValue })} />
              </Field>
              <Field label="Outer color">
                <ColorInput value={themeSettings.background.radialOuter} onChange={(nextValue) => setBackground({ radialOuter: nextValue })} />
              </Field>
            </>
          ) : null}

          <SectionGroupLabel>Floor</SectionGroupLabel>
          <Field label="Mode">
            <SegmentedControl
              value={themeSettings.floor?.mode || THEME_FLOOR_MODES.STAGE}
              onChange={(nextValue) => setFloor({ mode: nextValue })}
              options={FLOOR_MODE_OPTIONS}
            />
          </Field>
          {(themeSettings.floor?.mode || THEME_FLOOR_MODES.STAGE) === THEME_FLOOR_MODES.STAGE ? (
            <>
              <Field label="Color">
                <ColorInput
                  value={themeSettings.floor?.color || "#141416"}
                  onChange={(nextValue) => setFloor({ color: nextValue })}
                />
              </Field>
              <Field label="Roughness" value={formatNumber(themeSettings.floor?.roughness ?? 0.72)}>
                <SliderInput
                  value={themeSettings.floor?.roughness ?? 0.72}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(nextValue) => setFloor({ roughness: nextValue })}
                />
              </Field>
              <Field label="Reflectivity" value={formatNumber(themeSettings.floor?.reflectivity ?? 0.12)}>
                <SliderInput
                  value={themeSettings.floor?.reflectivity ?? 0.12}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(nextValue) => setFloor({ reflectivity: nextValue })}
                />
              </Field>
              <Field label="Shadow" value={formatNumber(themeSettings.floor?.shadowOpacity ?? 0.45)}>
                <SliderInput
                  value={themeSettings.floor?.shadowOpacity ?? 0.45}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(nextValue) => setFloor({ shadowOpacity: nextValue })}
                />
              </Field>
              <Field label="Backdrop blend" value={formatNumber(themeSettings.floor?.horizonBlend ?? 0)}>
                <SliderInput
                  value={themeSettings.floor?.horizonBlend ?? 0}
                  min={0}
                  max={1}
                  step={0.01}
                  onChange={(nextValue) => setFloor({ horizonBlend: nextValue })}
                />
              </Field>
            </>
          ) : null}

          <SectionGroupLabel>Environment Light</SectionGroupLabel>
          <SwitchRow label="Enable environment light" checked={themeSettings.environment.enabled} onChange={(nextValue) => setEnvironment({ enabled: nextValue })} />
          <Field label="Intensity" value={formatNumber(themeSettings.environment.intensity)}>
            <SliderInput
              value={themeSettings.environment.intensity}
              min={0}
              max={4}
              step={0.01}
              onChange={(nextValue) => setEnvironment({ intensity: nextValue })}
            />
          </Field>

          <SectionGroupLabel>Exposure</SectionGroupLabel>
          <Field label="Tone mapping" value={formatNumber(themeSettings.lighting.toneMappingExposure)}>
            <SliderInput
              value={themeSettings.lighting.toneMappingExposure}
              min={0.05}
              max={6}
              step={0.01}
              onChange={(nextValue) => setLighting({ toneMappingExposure: nextValue })}
            />
          </Field>

          <SectionGroupLabel>Primary Lights</SectionGroupLabel>
          <Tabs value={activePrimaryLight} onValueChange={setActivePrimaryLight} className="gap-0">
            <div className="px-3 py-2">
              <TabsList className="grid h-8 w-full grid-cols-3">
                {PRIMARY_LIGHT_OPTIONS.map((option) => (
                  <TabsTrigger key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {PRIMARY_LIGHT_OPTIONS.map((option) => {
              const light = themeSettings.lighting[option.value];
              const supportsDistance = option.value !== "directional";
              return (
                <TabsContent key={option.value} value={option.value} className="mt-0">
                  <SwitchRow
                    label={`Enable ${option.label.toLowerCase()} light`}
                    checked={light.enabled}
                    onChange={(nextValue) => setLightConfig(option.value, { enabled: nextValue })}
                  />
                  <Field label="Color">
                    <ColorInput value={light.color} onChange={(nextValue) => setLightConfig(option.value, { color: nextValue })} />
                  </Field>
                  <Field label="Intensity" value={formatNumber(light.intensity)}>
                    <SliderInput
                      value={light.intensity}
                      min={0}
                      max={20}
                      step={0.01}
                      onChange={(nextValue) => setLightConfig(option.value, { intensity: nextValue })}
                    />
                  </Field>
                  {option.value === "spot" ? (
                    <Field label="Angle" value={formatNumber(light.angle)}>
                      <SliderInput
                        value={light.angle}
                        min={0.01}
                        max={1.57}
                        step={0.01}
                        onChange={(nextValue) => setLightConfig(option.value, { angle: nextValue })}
                      />
                    </Field>
                  ) : null}
                  {supportsDistance ? (
                    <Field label="Distance" value={formatNumber(light.distance, 0)}>
                      <SliderInput
                        value={light.distance}
                        min={0}
                        max={5000}
                        step={1}
                        onChange={(nextValue) => setLightConfig(option.value, { distance: nextValue })}
                      />
                    </Field>
                  ) : null}
                  <Field label="Position (X/Z plane)">
                    <PositionPad
                      value={light.position}
                      onChange={(axis, nextValue) => setLightPosition(option.value, axis, nextValue)}
                    />
                  </Field>
                  <Field label="Height (Y)" value={formatNumber(light.position.y, 0)}>
                    <SliderInput
                      value={light.position.y}
                      min={-5000}
                      max={5000}
                      step={1}
                      onChange={(nextValue) => setLightPosition(option.value, "y", nextValue)}
                    />
                  </Field>
                </TabsContent>
              );
            })}
          </Tabs>

          <SectionGroupLabel>Ambient Light</SectionGroupLabel>
          <SwitchRow
            label="Enable ambient"
            checked={themeSettings.lighting.ambient.enabled}
            onChange={(nextValue) => setLightConfig("ambient", { enabled: nextValue })}
          />
          <Field label="Color">
            <ColorInput value={themeSettings.lighting.ambient.color} onChange={(nextValue) => setLightConfig("ambient", { color: nextValue })} />
          </Field>
          <Field label="Intensity" value={formatNumber(themeSettings.lighting.ambient.intensity)}>
            <SliderInput
              value={themeSettings.lighting.ambient.intensity}
              min={0}
              max={20}
              step={0.01}
              onChange={(nextValue) => setLightConfig("ambient", { intensity: nextValue })}
            />
          </Field>

          <SectionGroupLabel>Hemisphere Light</SectionGroupLabel>
          <SwitchRow
            label="Enable hemisphere"
            checked={themeSettings.lighting.hemisphere.enabled}
            onChange={(nextValue) => setLightConfig("hemisphere", { enabled: nextValue })}
          />
          <Field label="Sky color">
            <ColorInput
              value={themeSettings.lighting.hemisphere.skyColor}
              onChange={(nextValue) => setLightConfig("hemisphere", { skyColor: nextValue })}
            />
          </Field>
          <Field label="Ground color">
            <ColorInput
              value={themeSettings.lighting.hemisphere.groundColor}
              onChange={(nextValue) => setLightConfig("hemisphere", { groundColor: nextValue })}
            />
          </Field>
          <Field label="Intensity" value={formatNumber(themeSettings.lighting.hemisphere.intensity)}>
            <SliderInput
              value={themeSettings.lighting.hemisphere.intensity}
              min={0}
              max={20}
              step={0.01}
              onChange={(nextValue) => setLightConfig("hemisphere", { intensity: nextValue })}
            />
          </Field>
        </Section>
    </>
  );
}

export default function ThemeSettingsPopover({
  open,
  isDesktop,
  width,
  onStartResize,
  themeSettings,
  updateThemeSettings
}) {
  return (
    <FileSheet
      open={open}
      title="Theme"
      isDesktop={isDesktop}
      width={width}
      onStartResize={onStartResize}
    >
      <Accordion type="multiple" className="text-sm">
        <ThemeSettingsSections
          themeSettings={themeSettings}
          updateThemeSettings={updateThemeSettings}
        />
      </Accordion>
    </FileSheet>
  );
}
