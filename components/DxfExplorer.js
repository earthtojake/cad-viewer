"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import { copyImageBlobToClipboard } from "../lib/clipboard";

const MIN_VIEW_SIZE = 1;
const VIEW_PADDING_RATIO = 0.08;
const MAX_ZOOM_IN = 20;
const MAX_ZOOM_OUT = 12;
const WHEEL_ZOOM_FACTOR = 1.12;
const VIEWBOX_EPSILON = 1e-6;

function readCssVar(name, fallback) {
  if (typeof window === "undefined") {
    return fallback;
  }
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function readPalette() {
  return {
    background: readCssVar("--ui-app-bg", "#f3f4f6"),
    cutStroke: readCssVar("--ui-text", "#111827"),
    bendStroke: readCssVar("--ui-accent", "#b45309")
  };
}

function buildFittedViewBox(bounds, viewport) {
  const width = Math.max(Number(bounds?.width) || 0, MIN_VIEW_SIZE);
  const height = Math.max(Number(bounds?.height) || 0, MIN_VIEW_SIZE);
  const viewportWidth = Math.max(Number(viewport?.width) || 0, 1);
  const viewportHeight = Math.max(Number(viewport?.height) || 0, 1);
  const paddedWidth = width * (1 + VIEW_PADDING_RATIO * 2);
  const paddedHeight = height * (1 + VIEW_PADDING_RATIO * 2);
  const contentAspect = paddedWidth / Math.max(paddedHeight, MIN_VIEW_SIZE);
  const viewportAspect = viewportWidth / viewportHeight;

  let viewWidth = paddedWidth;
  let viewHeight = paddedHeight;
  if (contentAspect > viewportAspect) {
    viewHeight = viewWidth / viewportAspect;
  } else {
    viewWidth = viewHeight * viewportAspect;
  }

  return {
    x: (width - viewWidth) / 2,
    y: (height - viewHeight) / 2,
    width: Math.max(viewWidth, MIN_VIEW_SIZE),
    height: Math.max(viewHeight, MIN_VIEW_SIZE)
  };
}

function clampViewBox(nextViewBox, baseViewBox) {
  const minWidth = Math.max(baseViewBox.width / MAX_ZOOM_IN, MIN_VIEW_SIZE);
  const minHeight = Math.max(baseViewBox.height / MAX_ZOOM_IN, MIN_VIEW_SIZE);
  const maxWidth = Math.max(baseViewBox.width * MAX_ZOOM_OUT, MIN_VIEW_SIZE);
  const maxHeight = Math.max(baseViewBox.height * MAX_ZOOM_OUT, MIN_VIEW_SIZE);
  return {
    x: Number(nextViewBox.x) || 0,
    y: Number(nextViewBox.y) || 0,
    width: Math.min(Math.max(Number(nextViewBox.width) || baseViewBox.width, minWidth), maxWidth),
    height: Math.min(Math.max(Number(nextViewBox.height) || baseViewBox.height, minHeight), maxHeight)
  };
}

function areViewBoxesEqual(a, b) {
  return (
    Math.abs((Number(a?.x) || 0) - (Number(b?.x) || 0)) < VIEWBOX_EPSILON &&
    Math.abs((Number(a?.y) || 0) - (Number(b?.y) || 0)) < VIEWBOX_EPSILON &&
    Math.abs((Number(a?.width) || 0) - (Number(b?.width) || 0)) < VIEWBOX_EPSILON &&
    Math.abs((Number(a?.height) || 0) - (Number(b?.height) || 0)) < VIEWBOX_EPSILON
  );
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob === "function") {
      canvas.toBlob((value) => {
        if (value) {
          resolve(value);
          return;
        }
        reject(new Error("Failed to encode screenshot"));
      }, "image/png");
      return;
    }

    try {
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1] || "";
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      resolve(new Blob([bytes], { type: "image/png" }));
    } catch (error) {
      reject(error instanceof Error ? error : new Error("Failed to encode screenshot"));
    }
  });
}

async function buildSvgScreenshotBlob(svgElement, { width, height, backgroundColor }) {
  const serializer = new XMLSerializer();
  const svgMarkup = serializer.serializeToString(svgElement);
  const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Failed to render DXF screenshot"));
      nextImage.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to create screenshot canvas");
    }
    context.fillStyle = backgroundColor;
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return await canvasToBlob(canvas);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const DxfExplorer = forwardRef(function DxfExplorer({
  dxfData,
  modelKey,
  onExplorerAlertChange
}, ref) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const dragStateRef = useRef(null);
  const previousModelKeyRef = useRef(modelKey);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 1, height: 1 });
  const palette = readPalette();

  const boundsWidth = Math.max(Number(dxfData?.bounds?.width) || 0, MIN_VIEW_SIZE);
  const boundsHeight = Math.max(Number(dxfData?.bounds?.height) || 0, MIN_VIEW_SIZE);
  const fittedViewBox = useMemo(
    () => buildFittedViewBox(
      { width: boundsWidth, height: boundsHeight },
      viewportSize
    ),
    [boundsHeight, boundsWidth, viewportSize.height, viewportSize.width]
  );

  useEffect(() => {
    onExplorerAlertChange?.(null);
  }, [modelKey, onExplorerAlertChange]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver !== "function") {
      return undefined;
    }

    const observer = new ResizeObserver((entries) => {
      const nextEntry = entries[0];
      if (!nextEntry) {
        return;
      }
      setViewportSize((current) => {
        const nextWidth = nextEntry.contentRect.width;
        const nextHeight = nextEntry.contentRect.height;
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return {
          width: nextWidth,
          height: nextHeight
        };
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const modelChanged = previousModelKeyRef.current !== modelKey;
    previousModelKeyRef.current = modelKey;

    setViewBox((current) => {
      if (!modelChanged && areViewBoxesEqual(current, fittedViewBox)) {
        return current;
      }
      return fittedViewBox;
    });
  }, [
    fittedViewBox.height,
    fittedViewBox.width,
    fittedViewBox.x,
    fittedViewBox.y,
    modelKey
  ]);

  useEffect(() => {
    const clearDrag = () => {
      dragStateRef.current = null;
    };
    window.addEventListener("pointerup", clearDrag);
    window.addEventListener("pointercancel", clearDrag);
    return () => {
      window.removeEventListener("pointerup", clearDrag);
      window.removeEventListener("pointercancel", clearDrag);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    async captureScreenshot({ filename = "cad-screenshot.png", mode = "download" } = {}) {
      const container = containerRef.current;
      const svgElement = svgRef.current;
      if (!container || !svgElement) {
        throw new Error("Explorer not ready");
      }

      const rect = container.getBoundingClientRect();
      const pixelRatio = Math.max(window.devicePixelRatio || 1, 1);
      const width = Math.max(1, Math.round(rect.width * pixelRatio));
      const height = Math.max(1, Math.round(rect.height * pixelRatio));
      const blobPromise = buildSvgScreenshotBlob(svgElement, {
        width,
        height,
        backgroundColor: palette.background
      });

      if (mode === "clipboard") {
        return await copyImageBlobToClipboard(blobPromise);
      }

      const blob = await blobPromise;
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      return blob;
    }
  }), [palette.background]);

  const handlePointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragStateRef.current = {
      clientX: event.clientX,
      clientY: event.clientY
    };
  };

  const handlePointerMove = (event) => {
    const dragState = dragStateRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!dragState || !rect || !rect.width || !rect.height) {
      return;
    }

    const deltaX = event.clientX - dragState.clientX;
    const deltaY = event.clientY - dragState.clientY;
    dragStateRef.current = {
      clientX: event.clientX,
      clientY: event.clientY
    };

    setViewBox((current) => ({
      ...current,
      x: current.x - (deltaX / rect.width) * current.width,
      y: current.y - (deltaY / rect.height) * current.height
    }));
  };

  const handleWheel = (event) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) {
      return;
    }

    event.preventDefault();
    const cursorX = (event.clientX - rect.left) / rect.width;
    const cursorY = (event.clientY - rect.top) / rect.height;
    const scale = event.deltaY > 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;

    setViewBox((current) => {
      const nextWidth = current.width * scale;
      const nextHeight = current.height * scale;
      const anchorX = current.x + current.width * cursorX;
      const anchorY = current.y + current.height * cursorY;
      return clampViewBox(
        {
          x: anchorX - nextWidth * cursorX,
          y: anchorY - nextHeight * cursorY,
          width: nextWidth,
          height: nextHeight
        },
        fittedViewBox
      );
    });
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onDoubleClick={() => {
        setViewBox(fittedViewBox);
      }}
      onWheel={handleWheel}
    >
      <svg
        ref={svgRef}
        className="h-full w-full"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect
          x={viewBox.x}
          y={viewBox.y}
          width={viewBox.width}
          height={viewBox.height}
          fill={palette.background}
        />
        {Array.isArray(dxfData?.paths) ? dxfData.paths.map((path, index) => {
          const isBendPath = path?.kind === "bend";
          return (
            <path
              key={`${path?.layer || "path"}:${index}`}
              d={String(path?.d || "")}
              fill="none"
              stroke={isBendPath ? palette.bendStroke : palette.cutStroke}
              strokeDasharray={isBendPath ? "8 6" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={isBendPath ? 1.5 : 1.75}
              vectorEffect="non-scaling-stroke"
            />
          );
        }) : null}
        {Array.isArray(dxfData?.circles) ? dxfData.circles.map((circle, index) => {
          const isBendCircle = circle?.kind === "bend";
          return (
            <circle
              key={`${circle?.layer || "circle"}:${index}`}
              cx={Number(circle?.cx) || 0}
              cy={Number(circle?.cy) || 0}
              r={Math.max(Number(circle?.r) || 0, 0)}
              fill="none"
              stroke={isBendCircle ? palette.bendStroke : palette.cutStroke}
              strokeDasharray={isBendCircle ? "8 6" : undefined}
              strokeWidth={isBendCircle ? 1.5 : 1.75}
              vectorEffect="non-scaling-stroke"
            />
          );
        }) : null}
      </svg>
    </div>
  );
});

export default DxfExplorer;
