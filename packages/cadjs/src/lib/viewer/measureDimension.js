import { formatMeasurement } from "./measurement.js";
import { dimensionEndpoints, measureDimensionSegments } from "./measureLines.js";
import { projectWorldPointToClient } from "./measureRuler.js";

// Draft state is amber so it can never be confused with the cyan of a committed
// dimension.  Committed cyan is also distinct from the blue selection highlight.
export const MEASURE_DIMENSION_DRAFT_COLOR = "#f59e0b";
export const MEASURE_DIMENSION_COMMITTED_COLOR = "#22d3ee";
export const MEASURE_DIMENSION_FADED_ALPHA = 0.3;
export const MEASURE_DIMENSION_LABEL_BACKGROUND = "rgba(15, 23, 42, 0.92)";
export const MEASURE_DIMENSION_LABEL_FONT =
  "600 8px ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

const LABEL_PADDING_X = 6;
const LABEL_PADDING_Y = 3;
const LABEL_MIN_MARGIN = 4;

export function measureLabelText(measurement, { precision = 2 } = {}) {
  const formatted = formatMeasurement(measurement, { precision });
  if (!formatted) {
    return "";
  }
  return measurement?.perpendicular !== null && measurement?.perpendicular !== undefined
    ? `⟂ ${formatted}`
    : formatted;
}

/**
 * Projects world-space measurement endpoints to screen space and builds an
 * offset dimension construction in pixel coordinates.
 * Completely immune to camera orbit jitter.
 */
export function screenSpaceDimensionLayout(
  pickA,
  pickB,
  measurement = null,
  camera = null,
  rect = null,
  {
    offset = 24,
    witnessOvershoot = 5,
    arrowLength = 8,
    arrowWidth = 3.5
  } = {}
) {
  const endpoints = dimensionEndpoints(pickA, pickB, measurement);
  if (!endpoints) {
    return null;
  }
  const screenStart = projectWorldPointToClient(endpoints.start, camera, rect);
  const screenEnd = projectWorldPointToClient(endpoints.end, camera, rect);
  if (!screenStart || !screenEnd) {
    return null;
  }

  const dx = screenEnd.x - screenStart.x;
  const dy = screenEnd.y - screenStart.y;
  const length = Math.hypot(dx, dy);
  if (!(length > 1e-6)) {
    return null;
  }

  const dirX = dx / length;
  const dirY = dy / length;
  const perpX = -dirY;
  const perpY = dirX;

  const offsetX = perpX * offset;
  const offsetY = perpY * offset;

  const witnessStartA = { x: screenStart.x, y: screenStart.y };
  const witnessEndA = {
    x: screenStart.x + perpX * (offset + witnessOvershoot),
    y: screenStart.y + perpY * (offset + witnessOvershoot)
  };

  const witnessStartB = { x: screenEnd.x, y: screenEnd.y };
  const witnessEndB = {
    x: screenEnd.x + perpX * (offset + witnessOvershoot),
    y: screenEnd.y + perpY * (offset + witnessOvershoot)
  };

  const dimensionStart = {
    x: screenStart.x + offsetX,
    y: screenStart.y + offsetY
  };
  const dimensionEnd = {
    x: screenEnd.x + offsetX,
    y: screenEnd.y + offsetY
  };

  const flip = length < arrowLength * 2.5;
  const arrow1Dir = flip ? -1 : 1;
  const arrow2Dir = flip ? 1 : -1;

  const arrow1 = {
    tip: dimensionStart,
    left: {
      x: dimensionStart.x + (dirX * arrowLength * arrow1Dir) + (perpX * arrowWidth),
      y: dimensionStart.y + (dirY * arrowLength * arrow1Dir) + (perpY * arrowWidth)
    },
    right: {
      x: dimensionStart.x + (dirX * arrowLength * arrow1Dir) - (perpX * arrowWidth),
      y: dimensionStart.y + (dirY * arrowLength * arrow1Dir) - (perpY * arrowWidth)
    }
  };

  const arrow2 = {
    tip: dimensionEnd,
    left: {
      x: dimensionEnd.x + (dirX * arrowLength * arrow2Dir) + (perpX * arrowWidth),
      y: dimensionEnd.y + (dirY * arrowLength * arrow2Dir) + (perpY * arrowWidth)
    },
    right: {
      x: dimensionEnd.x + (dirX * arrowLength * arrow2Dir) - (perpX * arrowWidth),
      y: dimensionEnd.y + (dirY * arrowLength * arrow2Dir) - (perpY * arrowWidth)
    }
  };

  const label = {
    x: (dimensionStart.x + dimensionEnd.x) / 2,
    y: (dimensionStart.y + dimensionEnd.y) / 2
  };

  return {
    rings: [screenStart, screenEnd],
    witnesses: [
      [witnessStartA, witnessEndA],
      [witnessStartB, witnessEndB]
    ],
    dimensionLine: [dimensionStart, dimensionEnd],
    arrows: [arrow1, arrow2],
    ticks: [
      [
        { x: dimensionStart.x - dirX * 3, y: dimensionStart.y - dirY * 3 },
        { x: dimensionStart.x + dirX * 3, y: dimensionStart.y + dirY * 3 }
      ],
      [
        { x: dimensionEnd.x - dirX * 3, y: dimensionEnd.y - dirY * 3 },
        { x: dimensionEnd.x + dirX * 3, y: dimensionEnd.y + dirY * 3 }
      ]
    ],
    label
  };
}

/**
 * Projects a world-space dimension construction into device-pixel client space
 * for canvas drawing. Returns null when any construction point is behind the
 * camera or otherwise unprojectable.
 */
export function screenDimensionLayout(segments, camera, rect) {
  if (!segments) {
    return null;
  }
  const project = (point) => projectWorldPointToClient(point, camera, rect);
  const start = project(segments.start);
  const end = project(segments.end);
  const witnessStart = project(segments.witnessStart);
  const witnessEnd = project(segments.witnessEnd);
  const label = project(segments.labelPoint);
  if (!start || !end || !witnessStart || !witnessEnd || !label) {
    return null;
  }
  const ticks = [];
  for (const [tickStart, tickEnd] of segments.ticks || []) {
    const a = project(tickStart);
    const b = project(tickEnd);
    if (!a || !b) {
      return null;
    }
    ticks.push([a, b]);
  }
  return {
    rings: [start, end],
    witnesses: [
      [start, witnessStart],
      [end, witnessEnd]
    ],
    dimensionLine: [witnessStart, witnessEnd],
    ticks,
    label
  };
}

function strokeSegment(context, start, end) {
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
}

export function drawMeasureDimension(context, layout, {
  color = MEASURE_DIMENSION_COMMITTED_COLOR,
  alpha = 1,
  lineWidth = 2.2,
  witnessWidth = 1.6,
  tickWidth = 2.6,
  ringRadius = 3.75,
  ringStrokeWidth = 2,
  label = "",
  labelColor = "#ffffff",
  labelBackground = MEASURE_DIMENSION_LABEL_BACKGROUND,
  bounds = null
} = {}) {
  if (!context || !layout) {
    return;
  }
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, Number(alpha) || 1));
  context.strokeStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const [start, end] of layout.witnesses) {
    context.lineWidth = witnessWidth;
    strokeSegment(context, start, end);
  }

  const [dimensionStart, dimensionEnd] = layout.dimensionLine;
  context.lineWidth = lineWidth;
  strokeSegment(context, dimensionStart, dimensionEnd);

  if (Array.isArray(layout.arrows) && layout.arrows.length) {
    context.fillStyle = color;
    for (const arrow of layout.arrows) {
      if (arrow?.tip && arrow?.left && arrow?.right) {
        context.beginPath();
        context.moveTo(arrow.tip.x, arrow.tip.y);
        context.lineTo(arrow.left.x, arrow.left.y);
        context.lineTo(arrow.right.x, arrow.right.y);
        context.closePath();
        context.fill();
      }
    }
  } else if (Array.isArray(layout.ticks)) {
    for (const [tickStart, tickEnd] of layout.ticks) {
      context.lineWidth = tickWidth;
      strokeSegment(context, tickStart, tickEnd);
    }
  }

  for (const point of layout.rings) {
    context.beginPath();
    context.arc(point.x, point.y, ringRadius, 0, Math.PI * 2);
    context.fillStyle = "#ffffff";
    context.fill();
    context.lineWidth = ringStrokeWidth;
    context.strokeStyle = color;
    context.stroke();
  }

  const labelText = String(label || "").trim();
  if (labelText) {
    context.font = MEASURE_DIMENSION_LABEL_FONT;
    const textWidth = context.measureText(labelText).width;
    const paddingX = LABEL_PADDING_X;
    const paddingY = LABEL_PADDING_Y;
    const chipWidth = textWidth + (paddingX * 2);
    const chipHeight = 11 + (paddingY * 2);
    let chipX = layout.label.x - (chipWidth / 2);
    let chipY = layout.label.y - (chipHeight / 2);
    if (bounds && Number(bounds.width) > 0 && Number(bounds.height) > 0) {
      const minX = LABEL_MIN_MARGIN;
      const maxX = Math.max(minX, Number(bounds.width) - chipWidth - LABEL_MIN_MARGIN);
      const minY = LABEL_MIN_MARGIN;
      const maxY = Math.max(minY, Number(bounds.height) - chipHeight - LABEL_MIN_MARGIN);
      chipX = Math.min(Math.max(chipX, minX), maxX);
      chipY = Math.min(Math.max(chipY, minY), maxY);
    }
    const radius = 5;
    context.beginPath();
    if (typeof context.roundRect === "function") {
      context.roundRect(chipX, chipY, chipWidth, chipHeight, radius);
    } else {
      context.rect(chipX, chipY, chipWidth, chipHeight);
    }
    context.fillStyle = labelBackground;
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.stroke();

    context.fillStyle = labelColor;
    context.textBaseline = "middle";
    context.textAlign = "center";
    context.fillText(labelText, chipX + (chipWidth / 2), chipY + (chipHeight / 2));
  }

  context.restore();
}

export function drawPulsingEndRing(context, point, {
  now = null,
  color = MEASURE_DIMENSION_DRAFT_COLOR,
  baseRadius = 4.5,
  periodMs = 1000,
  amplitude = 1.2
} = {}) {
  if (!context || !point) {
    return;
  }
  const readoutNow = Number.isFinite(now)
    ? now
    : typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const pulseRadius = baseRadius + 2 +
    Math.abs(Math.sin(readoutNow / periodMs)) * amplitude;
  context.save();
  context.globalAlpha = 0.35;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(point.x, point.y, pulseRadius, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(point.x, point.y, baseRadius, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 2;
  context.strokeStyle = color;
  context.stroke();
  context.restore();
}
