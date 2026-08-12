import { useEffect, useRef } from "react";

import {
  MEASURE_DIMENSION_COMMITTED_COLOR,
  MEASURE_DIMENSION_DRAFT_COLOR,
  MEASURE_DIMENSION_FADED_ALPHA,
  drawMeasureDimension,
  drawPulsingEndRing,
  measureLabelText,
  screenSpaceDimensionLayout
} from "cadjs/lib/viewer/measureDimension.js";
import { projectWorldPointToClient } from "cadjs/lib/viewer/measureRuler.js";

import { measureRulerDraftMeasurement } from "../../../workbench/measureRulerState.js";

export function useViewerMeasureOverlay({
  measureCanvasRef,
  measureState,
  activeMeasurementId = "",
  runtimeRef,
  mountRef,
  previewMode,
  viewerReadyTick
}) {
  const measureStateRef = useRef(measureState);
  measureStateRef.current = measureState;
  const activeIdRef = useRef(activeMeasurementId);
  activeIdRef.current = activeMeasurementId;

  useEffect(() => {
    const canvas = measureCanvasRef.current;
    if (!canvas) {
      return undefined;
    }

    let rafId = 0;

    const render = (now) => {
      const context = canvas.getContext("2d");
      if (!context) {
        rafId = window.requestAnimationFrame(render);
        return;
      }
      const runtime = runtimeRef.current;
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const cssWidth = mountRef.current?.clientWidth || 1;
      const cssHeight = mountRef.current?.clientHeight || 1;
      const width = Math.round(cssWidth * dpr);
      const height = Math.round(cssHeight * dpr);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, cssWidth, cssHeight);

      const state = measureStateRef.current;
      const camera = runtime?.camera || null;
      if (state && camera && !previewMode) {
        const localRect = { left: 0, top: 0, width: cssWidth, height: cssHeight };
        const bounds = { width: cssWidth, height: cssHeight };
        const activeId = activeIdRef.current;

        for (const item of state.measurements || []) {
          const layout = screenSpaceDimensionLayout(item?.pickA, item?.pickB, item?.measurement, camera, localRect);
          if (!layout) {
            continue;
          }
          const active = item.id === activeId;
          drawMeasureDimension(context, layout, {
            color: MEASURE_DIMENSION_COMMITTED_COLOR,
            alpha: active ? 1 : MEASURE_DIMENSION_FADED_ALPHA,
            lineWidth: active ? 2.4 : 1.5,
            witnessWidth: active ? 1.6 : 1.2,
            ringRadius: active ? 4 : 3,
            label: active ? measureLabelText(item.measurement) : "",
            bounds
          });
        }

        const draft = state.draft;
        if (draft?.anchor && draft?.hover) {
          const draftMeasurement = measureRulerDraftMeasurement(state);
          const layout = screenSpaceDimensionLayout(draft.anchor, draft.hover, draftMeasurement, camera, localRect);
          if (layout) {
            drawMeasureDimension(context, layout, {
              color: MEASURE_DIMENSION_DRAFT_COLOR,
              alpha: 0.95,
              lineWidth: 2.2,
              ringRadius: 4,
              label: measureLabelText(draftMeasurement),
              bounds
            });
            const end = projectWorldPointToClient(draft.hover.point, camera, localRect);
            if (end) {
              drawPulsingEndRing(context, end, { now, color: MEASURE_DIMENSION_DRAFT_COLOR });
            }
          }
        }
      }

      rafId = window.requestAnimationFrame(render);
    };

    rafId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [measureCanvasRef, runtimeRef, mountRef, previewMode, viewerReadyTick]);
}
