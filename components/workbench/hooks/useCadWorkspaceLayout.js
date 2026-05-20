import { useEffect, useRef } from "react";

import {
  getCadWorkspaceLayoutMode,
  shouldCadWorkspaceDefaultFileExplorerOpen,
  shouldCadWorkspaceDefaultFileSettingsOpen
} from "../../../lib/workbench/breakpoints.js";

const SIDEBAR_WRAPPER_SELECTOR = "[data-slot='sidebar-wrapper']";
export const CAD_WORKSPACE_MIN_MODEL_VIEWPORT_WIDTH = 700;

function sidebarWrapperElement() {
  return document.querySelector(SIDEBAR_WRAPPER_SELECTOR);
}

function applySidebarWidth(width) {
  sidebarWrapperElement()?.style.setProperty("--sidebar-width", `${width}px`);
}

function scheduleSidebarWidth(resizeState, width) {
  resizeState.latestWidth = width;
  if (resizeState.animationFrame) {
    return;
  }

  resizeState.animationFrame = window.requestAnimationFrame(() => {
    resizeState.animationFrame = 0;
    applySidebarWidth(resizeState.latestWidth);
  });
}

function readWindowViewportWidth(fallback = 1600) {
  const width = Number(window.innerWidth);
  return Number.isFinite(width) && width > 0 ? width : fallback;
}

export function preferredPanelWidthAfterViewportSync(width, minWidth = 0) {
  const numericWidth = Number(width);
  if (!Number.isFinite(numericWidth)) {
    return minWidth;
  }
  return Math.max(minWidth, numericWidth);
}

function clampPanelWidthForLayout(value, minWidth, maxWidth) {
  const numericValue = Number(value);
  const numericMinWidth = Number(minWidth);
  const numericMaxWidth = Number(maxWidth);
  const normalizedMinWidth = Number.isFinite(numericMinWidth) && numericMinWidth > 0 ? numericMinWidth : 0;
  const normalizedMaxWidth = Number.isFinite(numericMaxWidth) && numericMaxWidth > 0
    ? Math.max(normalizedMinWidth, numericMaxWidth)
    : normalizedMinWidth;
  const normalizedValue = Number.isFinite(numericValue) ? numericValue : normalizedMinWidth;
  return Math.min(Math.max(normalizedValue, normalizedMinWidth), normalizedMaxWidth);
}

export function maxPanelWidthForViewport(viewportWidth, maxWidth, { openPanelCount = 1 } = {}) {
  const numericMaxWidth = Number(maxWidth);
  const normalizedMaxWidth = Number.isFinite(numericMaxWidth) && numericMaxWidth > 0 ? numericMaxWidth : 0;
  const numericViewportWidth = Number(viewportWidth);
  if (!Number.isFinite(numericViewportWidth) || numericViewportWidth <= 0) {
    return normalizedMaxWidth;
  }

  const normalizedOpenPanelCount = Math.max(1, Math.trunc(Number(openPanelCount) || 1));
  const reservedModelWidth = Math.max(0, CAD_WORKSPACE_MIN_MODEL_VIEWPORT_WIDTH);
  const viewportPanelBudget = Math.max(0, numericViewportWidth - reservedModelWidth);
  const perPanelBudget = Math.floor(viewportPanelBudget / normalizedOpenPanelCount);
  return Math.min(
    normalizedMaxWidth,
    Math.floor(numericViewportWidth * 0.42),
    perPanelBudget
  );
}

export function canFitDesktopPanels(viewportWidth, panelMinWidths = []) {
  const numericViewportWidth = Number(viewportWidth);
  if (!Number.isFinite(numericViewportWidth) || numericViewportWidth <= 0) {
    return true;
  }
  const totalPanelMinWidth = (Array.isArray(panelMinWidths) ? panelMinWidths : [])
    .reduce((total, width) => {
      const numericWidth = Number(width);
      return total + (Number.isFinite(numericWidth) && numericWidth > 0 ? numericWidth : 0);
    }, 0);
  return numericViewportWidth >= CAD_WORKSPACE_MIN_MODEL_VIEWPORT_WIDTH + totalPanelMinWidth;
}

export function resolveDesktopPanelWidths({
  viewportWidth,
  sidebarOpen = false,
  sheetOpen = false,
  sidebarWidth = 0,
  sheetWidth = 0,
  sidebarMinWidth = 0,
  sheetMinWidth = 0,
  sidebarMaxWidth = 0,
  sheetMaxWidth = 0
} = {}) {
  if (!sidebarOpen && !sheetOpen) {
    return { sidebarWidth: 0, sheetWidth: 0 };
  }

  const sidebarMax = Number(sidebarMaxWidth);
  const sheetMax = Number(sheetMaxWidth);

  if (sidebarOpen && !sheetOpen) {
    return {
      sidebarWidth: clampPanelWidthForLayout(sidebarWidth, sidebarMinWidth, sidebarMax),
      sheetWidth: 0
    };
  }

  if (!sidebarOpen && sheetOpen) {
    return {
      sidebarWidth: 0,
      sheetWidth: clampPanelWidthForLayout(sheetWidth, sheetMinWidth, sheetMax)
    };
  }

  const sidebarMin = Math.max(0, Number(sidebarMinWidth) || 0);
  const sheetMin = Math.max(0, Number(sheetMinWidth) || 0);
  let nextSidebarWidth = clampPanelWidthForLayout(sidebarWidth, sidebarMin, sidebarMax);
  let nextSheetWidth = clampPanelWidthForLayout(sheetWidth, sheetMin, sheetMax);

  return {
    sidebarWidth: nextSidebarWidth,
    sheetWidth: nextSheetWidth
  };
}

export function useCadWorkspaceLayout({
  isDesktop,
  hasSelectedFile = false,
  setLayoutMode,
  setSidebarOpen,
  setTabToolsOpen,
  setLayoutViewportWidth,
  clampSidebarWidth,
  clampTabToolsWidth,
  setSidebarWidth,
  setTabToolsWidth,
  panelResizeStateRef,
  tabToolsResizeStateRef,
  defaultSidebarWidth,
  sidebarMinWidth,
  tabToolsMinWidth,
  endPanelResize,
  endTabToolsResize
}) {
  const fileExplorerDefaultOpenRef = useRef(null);
  const fileSettingsDefaultOpenRef = useRef(null);

  useEffect(() => {
    const syncViewport = () => {
      const viewportWidth = readWindowViewportWidth();
      const nextLayoutMode = getCadWorkspaceLayoutMode(viewportWidth);
      const nextFileExplorerDefaultOpen = shouldCadWorkspaceDefaultFileExplorerOpen(viewportWidth, { hasSelectedFile });
      const nextFileSettingsDefaultOpen = shouldCadWorkspaceDefaultFileSettingsOpen(viewportWidth);
      const previousFileExplorerDefaultOpen = fileExplorerDefaultOpenRef.current;
      const previousFileSettingsDefaultOpen = fileSettingsDefaultOpenRef.current;
      fileExplorerDefaultOpenRef.current = nextFileExplorerDefaultOpen;
      fileSettingsDefaultOpenRef.current = nextFileSettingsDefaultOpen;
      setLayoutMode(nextLayoutMode);
      if (previousFileExplorerDefaultOpen !== nextFileExplorerDefaultOpen) {
        setSidebarOpen(nextFileExplorerDefaultOpen);
      }
      if (previousFileSettingsDefaultOpen !== nextFileSettingsDefaultOpen) {
        setTabToolsOpen(nextFileSettingsDefaultOpen);
      }
    };

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
    };
  }, [hasSelectedFile, setLayoutMode, setSidebarOpen, setTabToolsOpen]);

  useEffect(() => {
    if (!isDesktop) {
      return undefined;
    }

    const syncPanelWidths = () => {
      setLayoutViewportWidth((current) => readWindowViewportWidth(current));
      setSidebarWidth((current) => preferredPanelWidthAfterViewportSync(current, sidebarMinWidth));
      setTabToolsWidth((current) => preferredPanelWidthAfterViewportSync(current, tabToolsMinWidth));
    };

    syncPanelWidths();
    window.addEventListener("resize", syncPanelWidths);
    return () => {
      window.removeEventListener("resize", syncPanelWidths);
    };
  }, [
    isDesktop,
    setLayoutViewportWidth,
    setSidebarWidth,
    setTabToolsWidth,
    sidebarMinWidth,
    tabToolsMinWidth
  ]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const resizeState = panelResizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const rawWidth = resizeState.startWidth + (event.clientX - resizeState.startX);
      if (rawWidth < sidebarMinWidth) {
        if (resizeState.animationFrame) {
          window.cancelAnimationFrame(resizeState.animationFrame);
          resizeState.animationFrame = 0;
        }
        applySidebarWidth(defaultSidebarWidth);
        setSidebarWidth(defaultSidebarWidth);
        setSidebarOpen(false);
        endPanelResize();
        return;
      }

      const nextWidth = clampSidebarWidth(rawWidth);
      scheduleSidebarWidth(resizeState, nextWidth);
    };

    const endResize = () => {
      const resizeState = panelResizeStateRef.current;
      if (!resizeState) {
        return;
      }
      if (resizeState.animationFrame) {
        window.cancelAnimationFrame(resizeState.animationFrame);
      }
      const nextWidth = Math.max(
        sidebarMinWidth,
        clampSidebarWidth(resizeState.latestWidth ?? resizeState.startWidth)
      );
      applySidebarWidth(nextWidth);
      setSidebarWidth(nextWidth);
      endPanelResize();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endResize);
    window.addEventListener("pointercancel", endResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endResize);
      window.removeEventListener("pointercancel", endResize);
      const resizeState = panelResizeStateRef.current;
      if (resizeState?.animationFrame) {
        window.cancelAnimationFrame(resizeState.animationFrame);
      }
      if (!tabToolsResizeStateRef.current) {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
  }, [
    clampSidebarWidth,
    endPanelResize,
    panelResizeStateRef,
    defaultSidebarWidth,
    setSidebarOpen,
    setSidebarWidth,
    sidebarMinWidth,
    tabToolsResizeStateRef
  ]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const resizeState = tabToolsResizeStateRef.current;
      if (!resizeState) {
        return;
      }

      const nextWidth = resizeState.startWidth - (event.clientX - resizeState.startX);
      if (nextWidth < tabToolsMinWidth) {
        setTabToolsWidth(tabToolsMinWidth);
        setTabToolsOpen(false);
        endTabToolsResize();
        return;
      }
      setTabToolsWidth(clampTabToolsWidth(nextWidth));
    };

    const endResize = () => {
      if (!tabToolsResizeStateRef.current) {
        return;
      }
      endTabToolsResize();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endResize);
    window.addEventListener("pointercancel", endResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endResize);
      window.removeEventListener("pointercancel", endResize);
      if (!panelResizeStateRef.current) {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
  }, [
    clampTabToolsWidth,
    endTabToolsResize,
    panelResizeStateRef,
    setTabToolsOpen,
    setTabToolsWidth,
    tabToolsMinWidth,
    tabToolsResizeStateRef
  ]);
}
