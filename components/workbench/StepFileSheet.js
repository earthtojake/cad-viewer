import { useEffect, useMemo, useRef } from "react";
import { ChevronRight, Eye, EyeOff, FlipHorizontal2, Package, Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "../../lib/cn";
import {
  buildStepClipPatch,
  clipAxisBounds,
  clipAxisPosition,
  DEFAULT_STEP_CLIP_SETTINGS,
  normalizeStepClipSettings
} from "../../lib/explorer/clipPlane";
import { flattenVisibleStepTreeRows } from "../../lib/step/stepTree";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "../ui/accordion";
import { Button } from "../ui/button";
import { ColorPicker } from "../ui/color-picker";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import FileSheet from "./FileSheet";

const fieldLabelClasses = "block text-xs font-medium text-muted-foreground";
const compactButtonClasses = "h-7 px-2 text-[11px]";
const compactIconButtonClasses = "size-6";
const treeRowButtonClasses = "h-7 min-w-0 rounded-md px-1.5 text-xs font-normal text-sidebar-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";
const AXIS_OPTIONS = Object.freeze(["x", "y", "z"]);

function formatMm(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "0";
  }
  if (Math.abs(numericValue) >= 100) {
    return numericValue.toFixed(0);
  }
  if (Math.abs(numericValue) >= 10) {
    return numericValue.toFixed(1);
  }
  return numericValue.toFixed(2);
}

function formatControlNumber(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "0";
  }
  if (Math.abs(numericValue) >= 100) {
    return numericValue.toFixed(0);
  }
  if (Math.abs(numericValue) >= 10) {
    return numericValue.toFixed(1);
  }
  return numericValue.toFixed(2);
}

function formatSeconds(value) {
  const numericValue = Math.max(Number(value) || 0, 0);
  return `${numericValue.toFixed(numericValue >= 10 ? 1 : 2)}s`;
}

function leafIdsHidden(leafPartIds, hiddenPartIds) {
  const leafIds = Array.isArray(leafPartIds)
    ? leafPartIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (!leafIds.length) {
    return false;
  }
  const hidden = new Set(Array.isArray(hiddenPartIds) ? hiddenPartIds : []);
  return leafIds.every((id) => hidden.has(id));
}

export default function StepFileSheet({
  open,
  isDesktop,
  width,
  onStartResize,
  selectedEntry,
  explorerLoading,
  isAssemblyView = false,
  stepTreeRoot,
  expandedTreeNodeIds,
  selectedPartIds,
  hoveredPartId,
  hiddenPartIds,
  onSelectTreeNode,
  onToggleTreeNode,
  onClearSelection,
  onHoverTreeNode,
  treeSelectionDisabled = false,
  treeSelectionDisabledReason = "",
  onTogglePartVisibility,
  hideSelectedParts,
  showAllHiddenParts,
  clipSettings,
  onClipSettingsChange,
  clipBounds,
  stepModule = null,
  themeSections = null
}) {
  const rowRefs = useRef(new Map());
  const selectedIds = Array.isArray(selectedPartIds) ? selectedPartIds : [];
  const hiddenIds = Array.isArray(hiddenPartIds) ? hiddenPartIds : [];
  const visibleRows = useMemo(
    () => flattenVisibleStepTreeRows(stepTreeRoot, expandedTreeNodeIds),
    [expandedTreeNodeIds, stepTreeRoot]
  );
  const hasAssemblyTree = visibleRows.some((row) => row?.hasChildren);
  const showTreeSection = explorerLoading || hasAssemblyTree;
  const activeTreeNodeId = selectedIds[selectedIds.length - 1] || "";
  const selectedPartCount = selectedIds.length;
  const hiddenPartCount = hiddenIds.length;
  const showTreeVisibilityControls = isAssemblyView === true;
  const treeSelectionTitle = treeSelectionDisabled
    ? String(treeSelectionDisabledReason || "Tree selection is disabled in the current parameter state.").trim()
    : "";
  const normalizedClipSettings = useMemo(() => normalizeStepClipSettings(clipSettings), [clipSettings]);
  const stepModuleDefinition = stepModule?.definition || null;
  const stepModuleParameters = Array.isArray(stepModuleDefinition?.parameters) ? stepModuleDefinition.parameters : [];
  const stepModuleAnimations = Array.isArray(stepModuleDefinition?.animations) ? stepModuleDefinition.animations : [];
  const stepModuleStatus = String(stepModule?.status || "").trim();
  const stepModuleError = String(stepModule?.error || "").trim();
  const stepModuleValues = stepModule?.parameterValues || {};
  const stepModuleAnimationState = stepModule?.animationState || {};
  const stepModuleEnabled = stepModule?.enabled !== false;
  const hasStepModulePanel = Boolean(stepModuleDefinition || stepModuleStatus === "loading" || stepModuleError);
  const defaultAccordionValue = hasStepModulePanel
    ? [...(showTreeSection ? ["tree"] : []), "parameters"]
    : [...(showTreeSection ? ["tree"] : [])];

  useEffect(() => {
    if (!activeTreeNodeId) {
      return;
    }
    const target = rowRefs.current.get(activeTreeNodeId);
    target?.scrollIntoView?.({
      block: "nearest"
    });
  }, [activeTreeNodeId]);

  if (!selectedEntry) {
    return null;
  }

  const updateClipSettings = (patch) => {
    onClipSettingsChange?.(buildStepClipPatch(normalizedClipSettings, patch));
  };

  return (
    <FileSheet
      open={open}
      title="STEP"
      isDesktop={isDesktop}
      width={width}
      onStartResize={onStartResize}
    >
      <Accordion type="multiple" defaultValue={defaultAccordionValue}>
        {showTreeSection ? (
          <AccordionItem value="tree">
            <AccordionTrigger title={treeSelectionTitle || undefined}>Tree</AccordionTrigger>
            <AccordionContent>
              {showTreeVisibilityControls ? (
                <div className="space-y-1.5 px-3 py-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={compactButtonClasses}
                      onClick={hideSelectedParts}
                      disabled={treeSelectionDisabled || selectedPartCount < 2}
                      title={treeSelectionDisabled ? treeSelectionTitle : selectedPartCount > 1 ? `Hide ${selectedPartCount} selected nodes` : "Select multiple nodes to hide them together"}
                    >
                      <EyeOff className="size-3" strokeWidth={2} aria-hidden="true" />
                      <span>Hide all</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={compactButtonClasses}
                      onClick={showAllHiddenParts}
                      disabled={hiddenPartCount < 1}
                      title={hiddenPartCount > 0 ? `Show ${hiddenPartCount} hidden ${hiddenPartCount === 1 ? "part" : "parts"}` : "No hidden parts to show"}
                    >
                      <Eye className="size-3" strokeWidth={2} aria-hidden="true" />
                      <span>Show all</span>
                    </Button>
                  </div>
                </div>
              ) : null}

              <div
                className="space-y-px px-1.5 pb-2"
                role="tree"
                aria-multiselectable="true"
                aria-disabled={treeSelectionDisabled}
                title={treeSelectionTitle || undefined}
                onClick={(event) => {
                  if (treeSelectionDisabled) {
                    return;
                  }
                  if (event.target === event.currentTarget) {
                    onClearSelection?.();
                  }
                }}
              >
                {explorerLoading && !visibleRows.length ? (
                  <p className="px-1.5 py-2 text-xs text-[var(--ui-text-muted)]">
                    Loading STEP tree...
                  </p>
                ) : null}

                {visibleRows.map((row) => {
                  const selected = selectedIds.includes(row.id);
                  const showSelectedRowState = selected && !row.hasChildren;
                  const hovered = hoveredPartId === row.id;
                  const hidden = leafIdsHidden(row.leafPartIds, hiddenIds);
                  const VisibilityIcon = hidden ? EyeOff : Eye;
                  const visibilityLabel = hidden ? "Show" : "Hide";
                  const rowDepthPx = Math.min(Math.max(row.depth, 0) * 24, 144);
                  return (
                    <div
                      key={row.id}
                      ref={(node) => {
                        if (node) {
                          rowRefs.current.set(row.id, node);
                          return;
                        }
                        rowRefs.current.delete(row.id);
                      }}
                      role="treeitem"
                      aria-expanded={row.hasChildren ? row.expanded : undefined}
                      aria-selected={selected}
                      aria-disabled={treeSelectionDisabled}
                      className={cn("rounded-md", hidden && "opacity-45")}
                      title={treeSelectionTitle || undefined}
                    >
                      <div className="flex h-7 items-center gap-0.5">
                        <div className="flex min-w-0 flex-1 items-center gap-0" style={{ paddingLeft: rowDepthPx }}>
                          {row.hasChildren ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="size-6 shrink-0 rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              onClick={(event) => {
                                event.stopPropagation();
                                onToggleTreeNode?.(row.id);
                              }}
                              aria-label={row.expanded ? `Collapse ${row.label}` : `Expand ${row.label}`}
                              title={row.expanded ? "Collapse" : "Expand"}
                            >
                              <ChevronRight
                                className={cn("size-3.5 transition-transform", row.expanded && "rotate-90")}
                                strokeWidth={2}
                                aria-hidden="true"
                              />
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={cn(
                              treeRowButtonClasses,
                              "flex-1 touch-manipulation justify-start text-left",
                              !row.hasChildren && "gap-2 !px-2",
                              treeSelectionDisabled && "text-sidebar-foreground/55",
                              showSelectedRowState
                                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                                : hovered && "bg-sidebar-accent text-sidebar-accent-foreground"
                            )}
                            title={treeSelectionTitle || row.label}
                            disabled={treeSelectionDisabled}
                            onClick={(event) => {
                              if (treeSelectionDisabled) {
                                return;
                              }
                              onSelectTreeNode?.(row.id, { multiSelect: event.shiftKey });
                            }}
                            onMouseEnter={() => {
                              if (!treeSelectionDisabled) {
                                onHoverTreeNode?.(row.id);
                              }
                            }}
                            onMouseLeave={() => {
                              if (!treeSelectionDisabled) {
                                onHoverTreeNode?.("");
                              }
                            }}
                          >
                            {!row.hasChildren ? (
                              <Package className="size-3.5 shrink-0 text-sidebar-foreground/55" strokeWidth={1.8} aria-hidden="true" />
                            ) : null}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium leading-4">
                                {row.label}
                              </span>
                            </span>
                          </Button>
                        </div>

                        {showTreeVisibilityControls ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className={cn(
                              compactIconButtonClasses,
                              "rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                              hidden && "bg-sidebar-accent text-sidebar-accent-foreground"
                            )}
                            onClick={(event) => {
                              event.stopPropagation();
                              onTogglePartVisibility?.(row.id);
                            }}
                            aria-label={`${visibilityLabel} ${row.label}`}
                            title={visibilityLabel}
                          >
                            <VisibilityIcon className="size-2.5" strokeWidth={2} aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {!visibleRows.length && !explorerLoading ? (
                  <p className="px-1.5 py-2 text-xs text-[var(--ui-text-muted)]">
                    No STEP tree is available.
                  </p>
                ) : null}
              </div>
            </AccordionContent>
          </AccordionItem>
        ) : null}

        {stepModuleDefinition || stepModuleStatus === "loading" || stepModuleError ? (
          <AccordionItem value="parameters">
            <AccordionTrigger>Parameters</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3 px-3 py-3">
                {stepModuleStatus === "loading" ? (
                  <p className="text-xs text-[var(--ui-text-muted)]">Loading STEP module...</p>
                ) : null}
                {stepModuleError ? (
                  <p className="whitespace-pre-line text-xs text-destructive">{stepModuleError}</p>
                ) : null}
                {stepModuleDefinition && !stepModuleParameters.length ? (
                  <p className="text-xs text-[var(--ui-text-muted)]">No module parameters.</p>
                ) : null}
                {stepModuleParameters.map((parameter) => {
                  const value = stepModuleValues?.[parameter.id] ?? parameter.defaultValue;
                  if (parameter.type === "boolean") {
                    return (
                      <div key={parameter.id} className="flex items-center justify-between gap-3">
                        <span className={fieldLabelClasses}>{parameter.label}</span>
                        <Switch
                          checked={value === true}
                          onCheckedChange={(checked) => stepModule?.onParameterChange?.(parameter.id, checked)}
                          disabled={!stepModuleEnabled}
                          aria-label={parameter.label}
                        />
                      </div>
                    );
                  }
                  if (parameter.type === "enum") {
                    return (
                      <div key={parameter.id} className="space-y-1.5">
                        <span className={fieldLabelClasses}>{parameter.label}</span>
                        <Select
                          value={String(value ?? "")}
                          onValueChange={(nextValue) => stepModule?.onParameterChange?.(parameter.id, nextValue)}
                          disabled={!stepModuleEnabled}
                        >
                          <SelectTrigger size="sm" className="h-8" aria-label={parameter.label}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {parameter.options.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  }
                  if (parameter.type === "color") {
                    return (
                      <div key={parameter.id} className="space-y-1.5">
                        <span className={fieldLabelClasses}>{parameter.label}</span>
                        <ColorPicker
                          value={String(value || "#ffffff")}
                          onChange={(nextValue) => stepModule?.onParameterChange?.(parameter.id, nextValue)}
                          disabled={!stepModuleEnabled}
                          aria-label={parameter.label}
                        />
                      </div>
                    );
                  }
                  if (parameter.type === "button") {
                    return (
                      <Button
                        key={parameter.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 w-full justify-center px-2 text-xs"
                        onClick={() => stepModule?.onParameterChange?.(parameter.id, Number(value || 0) + 1)}
                        disabled={!stepModuleEnabled}
                      >
                        {parameter.label}
                      </Button>
                    );
                  }
                  return (
                    <div key={parameter.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className={fieldLabelClasses}>{parameter.label}</span>
                        <span className="text-[11px] text-[var(--ui-text-muted)]">
                          {formatControlNumber(value)}{parameter.unit ? ` ${parameter.unit}` : ""}
                        </span>
                      </div>
                      <Slider
                        className="[&_[data-slot=slider-thumb]]:border-0"
                        value={[Number(value) || 0]}
                        min={parameter.min}
                        max={parameter.max}
                        step={parameter.step || 0.01}
                        onValueChange={(nextValue) => stepModule?.onParameterChange?.(parameter.id, nextValue?.[0] ?? value)}
                        disabled={!stepModuleEnabled}
                        aria-label={parameter.label}
                      />
                      <Input
                        type="number"
                        className="h-8"
                        value={Number(value) || 0}
                        min={parameter.min}
                        max={parameter.max}
                        step={parameter.step || 0.01}
                        onChange={(event) => stepModule?.onParameterChange?.(parameter.id, event.target.value)}
                        disabled={!stepModuleEnabled}
                        aria-label={`${parameter.label} value`}
                      />
                    </div>
                  );
                })}
                {stepModuleParameters.length ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 w-full justify-center px-2 text-xs"
                    onClick={() => stepModule?.onResetParameters?.()}
                    disabled={!stepModuleEnabled}
                    title="Reset module parameters"
                  >
                    <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                    <span>Reset parameters</span>
                  </Button>
                ) : null}
                {stepModuleDefinition && stepModuleAnimations.length ? (
                  <div className="space-y-3 border-t border-border/60 pt-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className={fieldLabelClasses}>Animation</span>
                    </div>
                    {stepModuleAnimations.length > 1 ? (
                      <Select
                        value={String(stepModuleAnimationState.activeId || stepModuleAnimations[0]?.id || "")}
                        onValueChange={(nextValue) => stepModule?.onAnimationSelect?.(nextValue)}
                        disabled={!stepModuleEnabled}
                      >
                        <SelectTrigger size="sm" className="h-8" aria-label="STEP animation">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {stepModuleAnimations.map((animation) => (
                            <SelectItem key={animation.id} value={animation.id}>
                              {animation.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 flex-1 justify-center px-2 text-xs"
                        onClick={() => stepModule?.onAnimationPlayToggle?.()}
                        disabled={!stepModuleEnabled}
                      >
                        {stepModuleAnimationState.playing ? (
                          <Pause className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                        ) : (
                          <Play className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                        )}
                        <span>{stepModuleAnimationState.playing ? "Pause" : "Play"}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        className="h-8 w-8"
                        onClick={() => stepModule?.onAnimationReset?.()}
                        disabled={!stepModuleEnabled}
                        aria-label="Restart STEP animation"
                        title="Restart"
                      >
                        <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      </Button>
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span className={fieldLabelClasses}>Time</span>
                        <span className="text-[11px] text-[var(--ui-text-muted)]">
                          {formatSeconds(stepModuleAnimationState.elapsedSec)}
                        </span>
                      </div>
                      <Slider
                        className="mt-2 [&_[data-slot=slider-thumb]]:border-0"
                        value={[Number(stepModuleAnimationState.elapsedSec) || 0]}
                        min={0}
                        max={Math.max(Number(stepModuleAnimationState.duration) || 1, 0.001)}
                        step={0.01}
                        onValueChange={(nextValue) => stepModule?.onAnimationScrub?.(nextValue?.[0] ?? 0)}
                        disabled={!stepModuleEnabled}
                        aria-label="STEP animation time"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <span className={fieldLabelClasses}>Speed</span>
                        <span className="text-[11px] text-[var(--ui-text-muted)]">
                          {formatControlNumber(stepModuleAnimationState.speed || 1)}x
                        </span>
                      </div>
                      <Slider
                        className="mt-2 [&_[data-slot=slider-thumb]]:border-0"
                        value={[Number(stepModuleAnimationState.speed) || 1]}
                        min={0.1}
                        max={3}
                        step={0.1}
                        onValueChange={(nextValue) => stepModule?.onAnimationSpeedChange?.(nextValue?.[0] ?? 1)}
                        disabled={!stepModuleEnabled}
                        aria-label="STEP animation speed"
                      />
                    </div>
                  </div>
                ) : null}
                {stepModuleDefinition ? (
                  <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                    <span className={fieldLabelClasses}>Enable</span>
                    <Switch
                      checked={stepModuleEnabled}
                      onCheckedChange={(checked) => stepModule?.onEnabledChange?.(checked)}
                      aria-label="Enable STEP module"
                    />
                  </div>
                ) : null}
              </div>
            </AccordionContent>
          </AccordionItem>
        ) : null}

        <AccordionItem value="clip">
          <AccordionTrigger>Clip</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className={fieldLabelClasses}>Enable</span>
                <Switch
                  checked={normalizedClipSettings.enabled}
                  onCheckedChange={(checked) => updateClipSettings({ enabled: checked })}
                  aria-label="Enable clipping plane"
                />
              </div>

              <div className="space-y-2">
                {AXIS_OPTIONS.map((axis) => {
                  const axisOffset = normalizedClipSettings.offsets?.[axis] ?? DEFAULT_STEP_CLIP_SETTINGS.offsets[axis];
                  const axisSettings = {
                    ...normalizedClipSettings,
                    axis,
                    offset: axisOffset,
                    offsets: {
                      ...normalizedClipSettings.offsets,
                      [axis]: axisOffset
                    }
                  };
                  const boundsForAxis = clipAxisBounds(clipBounds, axis);
                  const axisRange = Math.max(boundsForAxis.max - boundsForAxis.min, 0);
                  const clipPosition = clipAxisPosition(clipBounds, axisSettings);
                  return (
                    <div key={axis} className="space-y-1">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className={`${fieldLabelClasses} uppercase`}>
                          {axis}
                        </span>
                        <span className="text-[11px] text-[var(--ui-text-muted)]">
                          {formatMm(clipPosition)} mm
                        </span>
                      </div>
                      <Slider
                        className="[&_[data-slot=slider-thumb]]:border-0"
                        value={[axisOffset]}
                        min={0}
                        max={1}
                        step={0.001}
                        disabled={!axisRange}
                        onValueChange={(value) => {
                          const nextOffset = Array.isArray(value) ? value[0] : value;
                          updateClipSettings({
                            axis,
                            offset: nextOffset,
                            offsets: { [axis]: nextOffset }
                          });
                        }}
                        aria-label={`Clip ${axis.toUpperCase()} axis`}
                      />
                      <div className="mt-1 flex justify-between text-[10px] text-[var(--ui-text-muted)]">
                        <span>{formatMm(boundsForAxis.min)}</span>
                        <span>{formatMm(boundsForAxis.max)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={compactButtonClasses}
                  onClick={() => updateClipSettings({ invert: !normalizedClipSettings.invert })}
                  aria-pressed={normalizedClipSettings.invert}
                  title="Flip clip side"
                >
                  <FlipHorizontal2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                  <span>Flip</span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={compactButtonClasses}
                  onClick={() => onClipSettingsChange?.(normalizeStepClipSettings(DEFAULT_STEP_CLIP_SETTINGS))}
                  title="Reset clip plane"
                >
                  <RotateCcw className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                  <span>Reset</span>
                </Button>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
        {themeSections}
      </Accordion>
    </FileSheet>
  );
}
