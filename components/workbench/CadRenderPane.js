import { useEffect } from "react";
import CadExplorer from "../CadExplorer";
import DxfExplorer from "../DxfExplorer";
import { X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import ExplorerAlertCommand from "./ExplorerAlertCommand";
import { RENDER_FORMAT } from "../../lib/workbench/constants";
import { THEME_FLOOR_MODES } from "../../lib/themeSettings";
import { EXPLORER_SCENE_SCALE } from "../../lib/explorer/sceneScale";
import { EXPLORER_PICK_MODE } from "../../lib/explorer/constants";

const EMPTY_LIST = Object.freeze([]);

function viewportInsetPx(value) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

export default function CadRenderPane({
  explorerRef,
  renderFormat,
  renderPartsIndividually = false,
  selectedMeshData,
  selectedDxfData,
  selectedDxfMeshData,
  selectedKey,
  selectedDxfKey,
  missingFileRef = "",
  explorerPerspective,
  explorerPerspectiveRef,
  themeSettings,
  previewMode,
  viewportFrameInsets,
  explorerLoading,
  explorerAlert,
  stepUpdateInProgress,
  referenceSelectionPending = false,
  referenceSelectionUnavailable = false,
  viewPlaneOffsetRight = 16,
  explorerMode,
  assemblyParts,
  hiddenPartIds,
  selectedPartIds,
  hoveredPartId,
  hoveredReferenceId,
  selectedReferenceIds,
  selectorRuntime,
  parameters = null,
  stepModuleRuntime = null,
  pickableFaces,
  pickableEdges,
  pickableVertices,
  focusedPartIds = "",
  clip = null,
  clipSettings = null,
  drawToolActive,
  drawingTool,
  drawingStrokes,
  handleDrawingStrokesChange,
  handlePerspectiveChange,
  handleModelHoverChange,
  handleModelReferenceActivate,
  handleModelReferenceDoubleActivate,
  handleExplorerAlertChange,
  handleStepModuleTransformDetectedChange,
  selectionCount,
  copyButtonLabel,
  handleCopySelection,
  handleScreenshotCopy,
  urdfPosePicker = null
}) {
  const resolvedParameters = parameters || stepModuleRuntime;
  const resolvedClip = clip ?? clipSettings;
  const explorerAlertVariant = explorerAlert?.severity === "warning" ? "warning" : "destructive";
  const explorerAlertSummaryClasses = explorerAlert?.severity === "warning" ? "text-chart-5" : "text-destructive";
  const compactExplorerAlert = Boolean(explorerAlert?.compact);
  const dxfMode = renderFormat === RENDER_FORMAT.DXF;
  const urdfMode = renderFormat === RENDER_FORMAT.URDF || renderFormat === RENDER_FORMAT.SDF;
  const stlMode = renderFormat === RENDER_FORMAT.STL;
  const meshOnlyMode = stlMode || renderFormat === RENDER_FORMAT.THREE_MF || renderFormat === RENDER_FORMAT.GLB;
  const dxfMeshPreviewReady = dxfMode && !!selectedDxfMeshData;
  const activeMeshData = dxfMeshPreviewReady ? selectedDxfMeshData : selectedMeshData;
  const activeModelKey = dxfMeshPreviewReady ? (selectedDxfKey || selectedKey) : selectedKey;
  const missingFileLabel = String(missingFileRef || "").trim();
  const topologySelectionPending = Boolean(referenceSelectionPending && !dxfMode && !urdfMode && !meshOnlyMode);
  const topologySelectionUnavailable = Boolean(referenceSelectionUnavailable && !dxfMode && !urdfMode && !meshOnlyMode);
  const urdfPosePickerActive = Boolean(urdfPosePicker?.active);
  const urdfPosePickerPrompt = "Select target";
  const posePickerExitStyle = {
    left: `calc(${Math.max(Number(viewportFrameInsets?.left) || 0, 0)}px + 0.75rem)`,
    top: `calc(${Math.max(Number(viewportFrameInsets?.top) || 0, 0)}px + 0.75rem)`
  };
  const ctaMode = !dxfMode && !meshOnlyMode && drawToolActive
    ? "screenshot"
    : selectionCount > 0
      ? "selection"
      : "";
  const bottomOverlayStyle = {
    bottom: "1rem"
  };
  const modelViewportOverlayStyle = {
    left: `${viewportInsetPx(viewportFrameInsets?.left)}px`,
    right: `${viewportInsetPx(viewportFrameInsets?.right)}px`,
    top: `${viewportInsetPx(viewportFrameInsets?.top)}px`,
    bottom: `${viewportInsetPx(viewportFrameInsets?.bottom)}px`
  };
  const modelViewportBottomOverlayStyle = {
    left: `${viewportInsetPx(viewportFrameInsets?.left)}px`,
    right: `${viewportInsetPx(viewportFrameInsets?.right)}px`,
    bottom: `calc(${viewportInsetPx(viewportFrameInsets?.bottom)}px + 1rem)`
  };
  const ctaOverlayStyle = {
    ...bottomOverlayStyle,
    left: `calc(${viewportInsetPx(viewportFrameInsets?.left)}px + 1rem)`,
    right: `calc(${viewportInsetPx(viewportFrameInsets?.right)}px + 1rem)`
  };
  const ctaLabel = ctaMode === "screenshot" ? "Copy Screenshot" : copyButtonLabel;
  const ctaTitle = ctaMode === "screenshot" ? "Copy screenshot to clipboard" : copyButtonLabel;
  const ctaDisabled = ctaMode === "screenshot" ? explorerLoading || !activeMeshData : false;

  useEffect(() => {
    if (!urdfPosePickerActive || typeof window === "undefined" || typeof document === "undefined") {
      return undefined;
    }
    const handleEscape = (event) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key !== "Escape" && event.key !== "Esc" && event.code !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      urdfPosePicker?.onCancel?.();
    };
    window.addEventListener("keydown", handleEscape, true);
    document.addEventListener("keydown", handleEscape, true);
    return () => {
      window.removeEventListener("keydown", handleEscape, true);
      document.removeEventListener("keydown", handleEscape, true);
    };
  }, [urdfPosePicker, urdfPosePickerActive]);

  return (
    <div className="absolute inset-0">
      {dxfMode && !dxfMeshPreviewReady ? (
        <DxfExplorer
          ref={explorerRef}
          dxfData={selectedDxfData}
          modelKey={selectedDxfKey}
          onExplorerAlertChange={handleExplorerAlertChange}
        />
      ) : (
        <CadExplorer
          ref={explorerRef}
          meshData={activeMeshData}
          modelKey={activeModelKey}
          perspective={explorerPerspective}
          perspectiveRef={explorerPerspectiveRef}
          showEdges={true}
          recomputeNormals={false}
          themeSettings={themeSettings}
          previewMode={dxfMode ? false : previewMode}
          showViewPlane={dxfMode ? true : !previewMode}
          floorModeOverride={dxfMode ? THEME_FLOOR_MODES.GRID : ""}
          scale={urdfMode ? EXPLORER_SCENE_SCALE.URDF : EXPLORER_SCENE_SCALE.CAD}
          viewPlaneOffsetRight={viewPlaneOffsetRight}
          viewPlaneOffsetBottom="1rem"
          compactViewPlane={false}
          viewportFrameInsets={viewportFrameInsets}
          isLoading={explorerLoading}
          pickMode={
            urdfMode || meshOnlyMode || topologySelectionPending || topologySelectionUnavailable
              ? EXPLORER_PICK_MODE.NONE
              : (!dxfMode && explorerMode === "assembly" ? EXPLORER_PICK_MODE.ASSEMBLY : EXPLORER_PICK_MODE.AUTO)
          }
          renderPartsIndividually={urdfMode ? true : (renderPartsIndividually || Boolean(resolvedParameters?.definition))}
          pickableParts={dxfMode || urdfMode || meshOnlyMode ? EMPTY_LIST : assemblyParts}
          hiddenPartIds={dxfMode || meshOnlyMode ? [] : hiddenPartIds}
          selectedPartIds={dxfMode || meshOnlyMode ? [] : selectedPartIds}
          hoveredPartId={dxfMode || meshOnlyMode ? "" : hoveredPartId}
          hoveredReferenceId={dxfMode || meshOnlyMode ? "" : hoveredReferenceId}
          selectedReferenceIds={dxfMode || meshOnlyMode ? [] : selectedReferenceIds}
          selectorRuntime={dxfMode || meshOnlyMode ? null : selectorRuntime}
          parameters={dxfMode || meshOnlyMode ? null : resolvedParameters}
          pickableFaces={dxfMode || meshOnlyMode ? [] : pickableFaces}
          pickableEdges={dxfMode || meshOnlyMode ? [] : pickableEdges}
          pickableVertices={dxfMode || meshOnlyMode ? [] : pickableVertices}
          focusedPartId={dxfMode || meshOnlyMode ? "" : focusedPartIds}
          clip={dxfMode || meshOnlyMode ? null : resolvedClip}
          drawingEnabled={!dxfMode && !meshOnlyMode && drawToolActive}
          drawingTool={drawingTool}
          drawingStrokes={dxfMode || meshOnlyMode ? [] : drawingStrokes}
          onDrawingStrokesChange={handleDrawingStrokesChange}
          onPerspectiveChange={handlePerspectiveChange}
          onHoverReferenceChange={handleModelHoverChange}
          onActivateReference={handleModelReferenceActivate}
          onDoubleActivateReference={handleModelReferenceDoubleActivate}
          onExplorerAlertChange={handleExplorerAlertChange}
          onStepModuleTransformDetectedChange={handleStepModuleTransformDetectedChange}
          urdfPosePicker={urdfPosePicker}
        />
      )}
      {!previewMode && missingFileLabel ? (
        <div
          className="pointer-events-none absolute z-30 flex min-w-0 items-center justify-center px-4 py-4"
          style={modelViewportOverlayStyle}
        >
          <Alert
            variant="destructive"
            className="cad-glass-popover pointer-events-auto w-full max-w-xl min-w-0 p-5 text-center shadow-lg"
          >
            <p className="col-start-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-destructive">
              File does not exist
            </p>
            <AlertTitle className="col-start-1 mt-1 line-clamp-none text-lg text-foreground">File does not exist</AlertTitle>
            <AlertDescription className="col-start-1 mt-1 text-sm leading-6 text-muted-foreground">
              <code className="rounded-md bg-muted px-2 py-1 text-xs text-foreground">{missingFileLabel}</code>
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      {!previewMode && explorerAlert ? (
        <div
          className="pointer-events-none absolute z-30 flex min-w-0 items-center justify-center px-4 py-4"
          style={modelViewportOverlayStyle}
        >
          <Alert
            variant={explorerAlertVariant}
            className={`cad-glass-popover pointer-events-auto w-full min-w-0 shadow-lg ${compactExplorerAlert ? "max-w-lg p-4" : "max-w-xl p-5"}`}
          >
            {compactExplorerAlert ? null : (
              <p className={`col-start-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${explorerAlertSummaryClasses}`}>
                {explorerAlert.summary || "Explorer error"}
              </p>
            )}
            <AlertTitle className={`col-start-1 line-clamp-none text-foreground ${compactExplorerAlert ? "text-base" : "mt-1 text-lg"}`}>{explorerAlert.title}</AlertTitle>
            <AlertDescription className={`col-start-1 mt-1 gap-2 ${compactExplorerAlert ? "text-xs leading-5 whitespace-pre-line" : "text-sm leading-6"}`}>
              <p>{explorerAlert.message}</p>
              {!compactExplorerAlert && explorerAlert.resolution ? (
                <p className="text-muted-foreground/80">{explorerAlert.resolution}</p>
              ) : null}
            </AlertDescription>
            <div className="col-start-1 min-w-0">
              <ExplorerAlertCommand command={explorerAlert.command} />
            </div>
          </Alert>
        </div>
      ) : null}
      {!previewMode && stepUpdateInProgress ? (
        <div className="pointer-events-none absolute z-20 flex justify-center px-4" style={modelViewportBottomOverlayStyle}>
          <Alert
            role="status"
            className="cad-glass-popover w-auto px-3 py-1.5 text-[11px] font-medium text-popover-foreground shadow-sm"
          >
            STEP changed. Updating/regenerating references...
          </Alert>
        </div>
      ) : null}
      {!previewMode && !stepUpdateInProgress && topologySelectionPending ? (
        <div className="pointer-events-none absolute z-20 flex justify-center px-4" style={modelViewportBottomOverlayStyle}>
          <Alert
            role="status"
            className="cad-glass-popover w-auto px-3 py-1.5 text-[11px] font-medium text-popover-foreground shadow-sm"
          >
            Preparing selectable topology...
          </Alert>
        </div>
      ) : null}
      {!previewMode && !stepUpdateInProgress && topologySelectionUnavailable ? (
        <div className="pointer-events-none absolute z-20 flex justify-center px-4" style={modelViewportBottomOverlayStyle}>
          <Alert
            role="status"
            variant="warning"
            className="cad-glass-popover w-auto px-3 py-1.5 text-[11px] font-medium text-popover-foreground shadow-sm"
          >
            Selectable topology unavailable.
          </Alert>
        </div>
      ) : null}
      {!previewMode && urdfPosePickerActive ? (
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          className="cad-glass-popover pointer-events-auto absolute z-30 size-6 rounded-md border-sidebar-border p-0 text-popover-foreground shadow-sm"
          style={posePickerExitStyle}
          onClick={() => {
            urdfPosePicker?.onCancel?.();
          }}
          aria-label="Exit Select Pose"
          title="Exit Select Pose"
        >
          <X className="size-3.5" strokeWidth={2} aria-hidden="true" />
        </Button>
      ) : null}
      {!previewMode && urdfPosePickerActive ? (
        <div className="pointer-events-none absolute z-20 flex justify-center px-4" style={modelViewportBottomOverlayStyle}>
          <Alert
            role="status"
            className="cad-glass-popover w-auto px-3 py-1.5 text-[11px] font-medium text-popover-foreground shadow-sm"
          >
            {urdfPosePickerPrompt}
          </Alert>
        </div>
      ) : null}
      {!previewMode && ctaMode && !stepUpdateInProgress && !topologySelectionPending && !topologySelectionUnavailable ? (
        <div
          className="pointer-events-none absolute z-20 flex min-w-0 justify-center"
          style={ctaOverlayStyle}
        >
          <Button
            type="button"
            variant="default"
            size="sm"
            className="pointer-events-auto h-9 w-fit min-w-0 max-w-[min(28rem,100%)] shrink overflow-hidden border border-white bg-white px-4 text-[12px] font-semibold text-black shadow-lg shadow-black/20 hover:bg-white/90 focus-visible:ring-white/40 dark:border-white dark:bg-white dark:text-black dark:hover:bg-white/90 max-sm:w-full"
            disabled={ctaDisabled}
            onClick={() => {
              if (ctaMode === "screenshot") {
                void handleScreenshotCopy?.();
                return;
              }
              void handleCopySelection();
            }}
            title={ctaTitle}
          >
            <span className="block min-w-0 max-w-full truncate">{ctaLabel}</span>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
