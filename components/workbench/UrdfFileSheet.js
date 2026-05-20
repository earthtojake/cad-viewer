import { memo, useEffect, useRef, useState } from "react";
import { Copy, RotateCcw } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "../ui/accordion";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../ui/select";
import { Slider } from "../ui/slider";
import FileSheet from "./FileSheet";

const fieldLabelClasses = "block text-xs font-medium text-muted-foreground";
const compactInputClasses = "h-8 px-2 !text-xs font-medium leading-none tabular-nums";
const compactJointInputClasses = "h-7 px-2 !text-[11px] font-medium leading-none tabular-nums";

function isAngularJoint(joint) {
  const jointType = String(joint?.type || "").trim().toLowerCase();
  return jointType === "continuous" || jointType === "revolute";
}

function jointUnitLabel(joint) {
  return isAngularJoint(joint) ? "deg" : "m";
}

function formatJointValue(value, joint) {
  const scale = isAngularJoint(joint) ? 10 : 10000;
  const rounded = Math.round(Number(value) * scale) / scale;
  const safeValue = Number.isFinite(rounded) ? rounded : 0;
  return isAngularJoint(joint) ? `${safeValue}\u00b0` : `${safeValue} m`;
}

function formatJointInput(value, joint) {
  const scale = isAngularJoint(joint) ? 10 : 10000;
  const rounded = Math.round(Number(value) * scale) / scale;
  return Number.isFinite(rounded) ? String(rounded) : "";
}

function formatSdfNumber(value, fallback = "0") {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }
  const rounded = Math.round(numericValue * 1000) / 1000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function formatMotionCoordinate(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return "";
  }
  const rounded = Math.round(numericValue * 10000) / 10000;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

function motionPositionsClose(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) {
    return false;
  }
  return [0, 1, 2].every((index) => Math.abs(Number(a[index]) - Number(b[index])) <= 0.0005);
}

function clampJointInputValue(valueDeg, minValueDeg, maxValueDeg, fallbackValueDeg) {
  const numericValue = Number.isFinite(Number(valueDeg)) ? Number(valueDeg) : fallbackValueDeg;
  return Math.min(Math.max(numericValue, minValueDeg), Math.max(minValueDeg, maxValueDeg));
}

const UrdfJointRow = memo(function UrdfJointRow({
  joint,
  valueDeg,
  onValueChange
}) {
  const jointName = String(joint?.name || "").trim();
  const minValueDeg = Number.isFinite(Number(joint?.minValueDeg)) ? Number(joint.minValueDeg) : -180;
  const maxValueDeg = Number.isFinite(Number(joint?.maxValueDeg)) ? Number(joint.maxValueDeg) : 180;
  const safeValueDeg = clampJointInputValue(valueDeg, minValueDeg, maxValueDeg, 0);
  const unitLabel = jointUnitLabel(joint);
  const sliderStep = isAngularJoint(joint) ? 1 : 0.001;
  const pendingFrameRef = useRef(0);
  const pendingValueRef = useRef(safeValueDeg);
  const [liveValueDeg, setLiveValueDeg] = useState(safeValueDeg);
  const [draftValue, setDraftValue] = useState(() => formatJointInput(safeValueDeg, joint));

  useEffect(() => {
    pendingValueRef.current = safeValueDeg;
    setLiveValueDeg(safeValueDeg);
    setDraftValue(formatJointInput(safeValueDeg, joint));
  }, [safeValueDeg, joint]);

  useEffect(() => () => {
    if (pendingFrameRef.current && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(pendingFrameRef.current);
    }
  }, []);

  const scheduleValueChange = (nextValueDeg) => {
    pendingValueRef.current = nextValueDeg;
    if (typeof requestAnimationFrame !== "function") {
      onValueChange(joint, nextValueDeg);
      return;
    }
    if (pendingFrameRef.current) {
      return;
    }
    pendingFrameRef.current = requestAnimationFrame(() => {
      pendingFrameRef.current = 0;
      onValueChange(joint, pendingValueRef.current);
    });
  };

  const commitValue = (nextValueDeg) => {
    const normalizedValueDeg = clampJointInputValue(nextValueDeg, minValueDeg, maxValueDeg, liveValueDeg);
    pendingValueRef.current = normalizedValueDeg;
    if (pendingFrameRef.current && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(pendingFrameRef.current);
      pendingFrameRef.current = 0;
    }
    setLiveValueDeg(normalizedValueDeg);
    setDraftValue(formatJointInput(normalizedValueDeg, joint));
    onValueChange(joint, normalizedValueDeg);
  };

  return (
    <div className="px-3 py-1.5">
      <label className="block">
        <div className="flex items-center justify-between gap-2">
          <span className={`${fieldLabelClasses} min-w-0 truncate`}>{jointName || "Joint"}</span>
          <div className="relative w-16 shrink-0">
            <Input
              type="number"
              min={String(minValueDeg)}
              max={String(maxValueDeg)}
              step="0.1"
              inputMode="decimal"
              value={draftValue}
              onChange={(event) => {
                setDraftValue(event.target.value);
              }}
              onFocus={(event) => {
                event.currentTarget.select();
              }}
              onMouseUp={(event) => {
                event.preventDefault();
              }}
              onBlur={() => {
                commitValue(draftValue);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                }
              }}
              className={`${compactJointInputClasses} pr-6 text-right`}
              aria-label={`${jointName || "Joint"} value in ${unitLabel}`}
            />
            <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[9px] leading-none text-muted-foreground">{unitLabel}</span>
          </div>
        </div>
        <Slider
          className="mt-1 h-5 min-w-0"
          min={minValueDeg}
          max={maxValueDeg}
          step={sliderStep}
          value={[liveValueDeg]}
          onValueChange={(nextValue) => {
            const nextValueDeg = clampJointInputValue(nextValue?.[0], minValueDeg, maxValueDeg, liveValueDeg);
            setLiveValueDeg(nextValueDeg);
            setDraftValue(formatJointInput(nextValueDeg, joint));
            scheduleValueChange(nextValueDeg);
          }}
          onValueCommit={(nextValue) => {
            commitValue(nextValue?.[0]);
          }}
          aria-label={jointName || "Joint value"}
          title={`${formatJointValue(minValueDeg, joint)} to ${formatJointValue(maxValueDeg, joint)}`}
        />
      </label>
    </div>
  );
});

const MotionCoordinateInput = memo(function MotionCoordinateInput({
  axis,
  value,
  disabled,
  onValueChange
}) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const [draftValue, setDraftValue] = useState(() => formatMotionCoordinate(safeValue));

  useEffect(() => {
    setDraftValue(formatMotionCoordinate(safeValue));
  }, [safeValue]);

  const commitValue = (nextValue) => {
    const numericValue = Number(nextValue);
    const committedValue = Number.isFinite(numericValue) ? numericValue : safeValue;
    setDraftValue(formatMotionCoordinate(committedValue));
    onValueChange?.(committedValue);
  };

  return (
    <label className="block min-w-0">
      <span className={fieldLabelClasses}>{axis}</span>
      <Input
        type="number"
        step="0.001"
        inputMode="decimal"
        disabled={disabled}
        value={draftValue}
        onChange={(event) => {
          setDraftValue(event.target.value);
        }}
        onFocus={(event) => {
          event.currentTarget.select();
        }}
        onMouseUp={(event) => {
          event.preventDefault();
        }}
        onBlur={() => {
          commitValue(draftValue);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        className={`${compactInputClasses} mt-1.5 text-right`}
        aria-label={`Target ${axis} coordinate`}
      />
    </label>
  );
});

function SdfValueField({ label, value }) {
  const displayValue = String(value ?? "");
  return (
    <div className="block min-w-0">
      <span className={fieldLabelClasses}>{label}</span>
      <div
        className="mt-1.5 min-h-8 truncate rounded-md border border-border/70 bg-muted/25 px-2 py-1.5 text-xs font-medium leading-5 text-foreground"
        title={displayValue}
      >
        {displayValue}
      </div>
    </div>
  );
}

function formatSdfMetadataItem(item, fields) {
  if (!item || typeof item !== "object") {
    return "";
  }
  return fields
    .map((field) => String(item?.[field] || "").trim())
    .filter(Boolean)
    .join(" / ");
}

function SdfMetadataList({ title, items, fields }) {
  const records = Array.isArray(items)
    ? items.map((item) => formatSdfMetadataItem(item, fields)).filter(Boolean)
    : [];
  if (!records.length) {
    return null;
  }
  return (
    <div className="space-y-1.5 rounded-md border border-border/80 bg-background/40 p-3">
      <span className={fieldLabelClasses}>{title}</span>
      <div className="space-y-1">
        {records.slice(0, 5).map((record, index) => (
          <div
            key={`${title}:${index}`}
            className="truncate text-xs font-medium leading-5 text-foreground"
            title={record}
          >
            {record}
          </div>
        ))}
        {records.length > 5 ? (
          <div className="text-xs text-muted-foreground">{records.length - 5} more</div>
        ) : null}
      </div>
    </div>
  );
}

export default function UrdfFileSheet({
  open,
  title = "URDF",
  sourceFormat = "urdf",
  showJoints = true,
  showMotion = true,
  isDesktop,
  width,
  onStartResize,
  joints,
  groupStates,
  activeGroupStateId,
  jointValues,
  onJointValueChange,
  onGroupStateSelect,
  onCopyJointAngles,
  onResetPose,
  motion = null,
  sdf = null,
  themeSections = null
}) {
  const isSdf = String(sourceFormat || "").trim().toLowerCase() === "sdf";
  const movableJoints = Array.isArray(joints) ? joints : [];
  const groupStatePresets = Array.isArray(groupStates) ? groupStates : [];
  const sdfInfo = sdf?.info && typeof sdf.info === "object" ? sdf.info : {};
  const sdfStaticMetadata = sdfInfo.staticMetadata && typeof sdfInfo.staticMetadata === "object"
    ? sdfInfo.staticMetadata
    : {};
  const sdfIncludes = Array.isArray(sdfStaticMetadata.includes) ? sdfStaticMetadata.includes : [];
  const sdfPlugins = Array.isArray(sdfStaticMetadata.plugins) ? sdfStaticMetadata.plugins : [];
  const sdfSensors = Array.isArray(sdfStaticMetadata.sensors) ? sdfStaticMetadata.sensors : [];
  const sdfLights = Array.isArray(sdfStaticMetadata.lights) ? sdfStaticMetadata.lights : [];
  const sdfPhysics = Array.isArray(sdfStaticMetadata.physics) ? sdfStaticMetadata.physics : [];
  const sdfWarnings = Array.isArray(sdfStaticMetadata.warnings) ? sdfStaticMetadata.warnings : [];
  const sdfNestedModelCount = Number.isFinite(Number(sdfStaticMetadata.nestedModelCount))
    ? Number(sdfStaticMetadata.nestedModelCount)
    : 0;
  const motionEndEffectors = Array.isArray(motion?.endEffectors) ? motion.endEffectors : [];
  const motionPlanningGroups = Array.isArray(motion?.planningGroups) ? motion.planningGroups : [];
  const motionTargetFrames = Array.isArray(motion?.targetFrames) ? motion.targetFrames : [];
  const motionEnabled = showMotion && motionEndEffectors.length > 0;
  const defaultSections = [
    ...(isSdf ? ["sdf"] : []),
    ...(motionEnabled ? ["motion"] : []),
    ...(showJoints ? ["joints"] : [])
  ];
  const activeMotionEndEffectorName = String(motion?.activeEndEffectorName || motionEndEffectors[0]?.name || "").trim();
  const activeMotionPlanningGroupName = String(motion?.activePlanningGroupName || motionPlanningGroups[0]?.name || "").trim();
  const activeMotionTargetFrameName = String(motion?.activeTargetFrameName || motionTargetFrames[0] || "").trim();
  const motionTargetPosition = Array.isArray(motion?.targetPosition) ? motion.targetPosition : [0, 0, 0];
  const motionCurrentPosition = Array.isArray(motion?.currentPosition) ? motion.currentPosition : null;
  const moveit2Settings = motion?.moveit2 && typeof motion.moveit2 === "object" ? motion.moveit2 : {};
  const motionBusy = Boolean(motion?.solving);
  const motionActionsEnabled = motion?.actionsEnabled !== false;
  const motionServerStatus = motion?.serverLive ? "connected" : "offline";
  const motionServerOffline = motionEnabled && !motion?.serverLive;
  const motionSelectPoseActive = Boolean(motion?.selectPoseActive);
  const motionTargetMatchesCurrentPosition = motionCurrentPosition ? motionPositionsClose(motionTargetPosition, motionCurrentPosition) : true;
  const activeGroupStateValue = groupStatePresets.some((state) => String(state?.id || "").trim() === activeGroupStateId)
    ? activeGroupStateId
    : "__custom__";
  const activeGroupState = groupStatePresets.find((state) => String(state?.id || "").trim() === activeGroupStateValue);
  const activeGroupStateLabel = activeGroupStateValue === "__custom__" ? "custom" : String(activeGroupState?.label || activeGroupState?.name || activeGroupStateValue);
  const [openSections, setOpenSections] = useState(() => defaultSections);

  useEffect(() => {
    setOpenSections((current) => {
      const allowedSections = new Set([
        ...(isSdf ? ["sdf"] : []),
        ...(showJoints ? ["joints"] : []),
        ...(motionEnabled ? ["motion"] : []),
        "display",
        "material",
        "studio"
      ]);
      const nextSections = (Array.isArray(current) ? current : []).filter((section) => allowedSections.has(section));
      if (isSdf && !nextSections.includes("sdf")) {
        nextSections.unshift("sdf");
      }
      if (motionEnabled && !nextSections.includes("motion")) {
        nextSections.unshift("motion");
      }
      if (showJoints && !nextSections.includes("joints")) {
        nextSections.push("joints");
      }
      if (nextSections.length === current.length && nextSections.every((section, index) => section === current[index])) {
        return current;
      }
      return nextSections;
    });
  }, [isSdf, motionEnabled, showJoints]);

  return (
    <FileSheet
      open={open}
      title={title}
      isDesktop={isDesktop}
      width={width}
      onStartResize={onStartResize}
    >
      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
        {isSdf ? (
          <AccordionItem value="sdf">
            <AccordionTrigger>SDF</AccordionTrigger>
            <AccordionContent className="py-1">
              <div className="space-y-3 px-3 py-2">
                <div className="grid grid-cols-2 gap-2">
                  <SdfValueField label="Version" value={String(sdfInfo.version || "unknown")} />
                  <SdfValueField label="Document" value={String(sdfInfo.documentKind || "model")} />
                  {sdfInfo.worldName ? (
                    <SdfValueField label="World" value={String(sdfInfo.worldName)} />
                  ) : null}
                  <SdfValueField label="Frame mode" value={sdfInfo.nativeFrameSemantics ? "native" : "compat"} />
                  <SdfValueField label="Root link" value={String(sdfInfo.rootLink || "")} />
                  <SdfValueField label="Model" value={String(sdfInfo.modelName || title || "model")} />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <SdfValueField label="Links" value={String(sdfInfo.linkCount ?? movableJoints.length)} />
                  <SdfValueField label="Joints" value={String(sdfInfo.jointCount ?? joints?.length ?? 0)} />
                  <SdfValueField label="Frames" value={String(sdfInfo.frameCount ?? 0)} />
                  <SdfValueField label="Includes" value={String(sdfIncludes.length)} />
                  <SdfValueField label="Plugins" value={String(sdfPlugins.length)} />
                  <SdfValueField label="Sensors" value={String(sdfSensors.length)} />
                  <SdfValueField label="Lights" value={String(sdfLights.length)} />
                  <SdfValueField label="Physics" value={String(sdfPhysics.length)} />
                  <SdfValueField label="Nested models" value={formatSdfNumber(sdfNestedModelCount)} />
                  <SdfValueField label="Unsupported geom." value={`${formatSdfNumber(sdfInfo.unsupportedVisualCount)} / ${formatSdfNumber(sdfInfo.unsupportedCollisionCount)}`} />
                </div>

                {sdfWarnings.length ? (
                  <div className="space-y-1.5 rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {sdfWarnings.map((warning, index) => (
                      <p key={`sdf-warning:${index}`}>{warning}</p>
                    ))}
                  </div>
                ) : null}

                <SdfMetadataList title="Includes" items={sdfIncludes} fields={["name", "uri"]} />
                <SdfMetadataList title="Plugins" items={sdfPlugins} fields={["name", "filename"]} />
                <SdfMetadataList title="Sensors" items={sdfSensors} fields={["name", "type"]} />
                <SdfMetadataList title="Lights" items={sdfLights} fields={["name", "type"]} />
                <SdfMetadataList title="Physics" items={sdfPhysics} fields={["name", "type", "default"]} />
              </div>
            </AccordionContent>
          </AccordionItem>
        ) : null}
        {motionEnabled ? (
          <AccordionItem value="motion">
            <AccordionTrigger>MoveIt2</AccordionTrigger>
            <AccordionContent className="py-1">
              <div className="space-y-3 px-3 py-2">
                {motionServerOffline ? (
                  <div
                    role="alert"
                    className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive"
                  >
                    <p className="font-semibold">MoveIt2 server is offline</p>
                    <p className="mt-0.5 text-muted-foreground">
                      Solve pose and plan to pose are disabled until the local server is running.
                    </p>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>SRDF</span>
                    <Input
                      value={motion?.srdf?.srdf || motion?.srdf?.srdfHash || "linked"}
                      readOnly
                      disabled
                      className={`${compactInputClasses} mt-1.5`}
                      aria-label="SRDF status"
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>MoveIt2 server</span>
                    <Input
                      value={motionServerStatus}
                      readOnly
                      disabled
                      className={`${compactInputClasses} mt-1.5`}
                      aria-label="MoveIt2 server status"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>Planning group</span>
                    <Select
                      value={activeMotionPlanningGroupName}
                      disabled={motionBusy || motionPlanningGroups.length <= 1}
                      onValueChange={(value) => {
                        motion?.onMoveIt2SettingChange?.("activePlanningGroupName", value);
                      }}
                    >
                      <SelectTrigger size="sm" className="mt-1.5 h-8 !text-xs">
                        <SelectValue placeholder="Select group" />
                      </SelectTrigger>
                      <SelectContent>
                        {motionPlanningGroups.map((group) => {
                          const name = String(group?.name || "").trim();
                          return name ? (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ) : null;
                        })}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>End effector</span>
                  <Select
                    value={activeMotionEndEffectorName}
                    disabled={motionBusy || motionEndEffectors.length <= 1}
                    onValueChange={(value) => {
                      motion?.onEndEffectorChange?.(value);
                    }}
                  >
                    <SelectTrigger size="sm" className="mt-1.5 h-8 !text-xs">
                      <SelectValue placeholder="Select end effector" />
                    </SelectTrigger>
                    <SelectContent>
                      {motionEndEffectors.map((endEffector) => {
                        const name = String(endEffector?.name || "").trim();
                        return name ? (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ) : null;
                      })}
                    </SelectContent>
                  </Select>
                  </label>
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>Target frame</span>
                    <Select
                      value={activeMotionTargetFrameName}
                      disabled={motionBusy || motionTargetFrames.length <= 1}
                      onValueChange={(value) => {
                        motion?.onMoveIt2SettingChange?.("targetFrame", value);
                      }}
                    >
                      <SelectTrigger size="sm" className="mt-1.5 h-8 !text-xs">
                        <SelectValue placeholder="Select frame" />
                      </SelectTrigger>
                      <SelectContent>
                        {motionTargetFrames.map((frame) => {
                          const name = String(frame || "").trim();
                          return name ? (
                            <SelectItem key={name} value={name}>
                              {name}
                            </SelectItem>
                          ) : null;
                        })}
                      </SelectContent>
                    </Select>
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {["X", "Y", "Z"].map((axis, index) => (
                    <MotionCoordinateInput
                      key={axis}
                      axis={axis}
                      value={motionTargetPosition[index]}
                      disabled={motionBusy}
                      onValueChange={(nextValue) => {
                        motion?.onTargetPositionChange?.(index, nextValue);
                      }}
                    />
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>IK timeout</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0.001"
                      value={moveit2Settings.ikTimeout ?? 0.05}
                      disabled={motionBusy}
                      onChange={(event) => motion?.onMoveIt2SettingChange?.("ikTimeout", event.target.value)}
                      className={`${compactInputClasses} mt-1.5 text-right`}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>IK attempts</span>
                    <Input
                      type="number"
                      step="1"
                      min="1"
                      value={moveit2Settings.ikAttempts ?? 1}
                      disabled={motionBusy}
                      onChange={(event) => motion?.onMoveIt2SettingChange?.("ikAttempts", event.target.value)}
                      className={`${compactInputClasses} mt-1.5 text-right`}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>Tolerance</span>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.0001"
                      value={moveit2Settings.ikTolerance ?? 0.002}
                      disabled={motionBusy}
                      onChange={(event) => motion?.onMoveIt2SettingChange?.("ikTolerance", event.target.value)}
                      className={`${compactInputClasses} mt-1.5 text-right`}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>Planning pipeline</span>
                    <Input
                      value={moveit2Settings.planningPipeline ?? "ompl"}
                      disabled={motionBusy}
                      onChange={(event) => motion?.onMoveIt2SettingChange?.("planningPipeline", event.target.value)}
                      className={`${compactInputClasses} mt-1.5`}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>Planner ID</span>
                    <Input
                      value={moveit2Settings.plannerId ?? "RRTConnectkConfigDefault"}
                      disabled={motionBusy}
                      onChange={(event) => motion?.onMoveIt2SettingChange?.("plannerId", event.target.value)}
                      className={`${compactInputClasses} mt-1.5`}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>Plan time</span>
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={moveit2Settings.planningTime ?? 1}
                      disabled={motionBusy}
                      onChange={(event) => motion?.onMoveIt2SettingChange?.("planningTime", event.target.value)}
                      className={`${compactInputClasses} mt-1.5 text-right`}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>Velocity</span>
                    <Input
                      type="number"
                      step="0.05"
                      min="0.01"
                      max="1"
                      value={moveit2Settings.maxVelocityScalingFactor ?? 1}
                      disabled={motionBusy}
                      onChange={(event) => motion?.onMoveIt2SettingChange?.("maxVelocityScalingFactor", event.target.value)}
                      className={`${compactInputClasses} mt-1.5 text-right`}
                    />
                  </label>
                  <label className="block min-w-0">
                    <span className={fieldLabelClasses}>Acceleration</span>
                    <Input
                      type="number"
                      step="0.05"
                      min="0.01"
                      max="1"
                      value={moveit2Settings.maxAccelerationScalingFactor ?? 1}
                      disabled={motionBusy}
                      onChange={(event) => motion?.onMoveIt2SettingChange?.("maxAccelerationScalingFactor", event.target.value)}
                      className={`${compactInputClasses} mt-1.5 text-right`}
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    variant={motionSelectPoseActive ? "secondary" : "outline"}
                    size="sm"
                    className="h-8 px-2 text-xs"
                    disabled={motionBusy || !motionActionsEnabled}
                    onClick={() => {
                      if (motionSelectPoseActive) {
                        motion?.onCancelSelectPose?.();
                        return;
                      }
                      motion?.onSelectPose?.();
                    }}
                    aria-pressed={motionSelectPoseActive}
                  >
                    <span>Select Pose</span>
                  </Button>
                  {!motionTargetMatchesCurrentPosition ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      disabled={motionBusy}
                      onClick={() => {
                        motion?.onUseCurrentPosition?.();
                      }}
                    >
                      <span>Reset</span>
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    disabled={motionBusy || !motionActionsEnabled || motionTargetMatchesCurrentPosition}
                    onClick={() => {
                      void motion?.onSolve?.();
                    }}
                  >
                    <span>{motionBusy ? "Solving..." : "Solve pose"}</span>
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    disabled={motionBusy || !motionActionsEnabled || motionTargetMatchesCurrentPosition}
                    onClick={() => {
                      void motion?.onPlan?.();
                    }}
                  >
                    <span>{motionBusy ? "Planning..." : "Plan to pose"}</span>
                  </Button>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        ) : null}
        {showJoints ? (
        <AccordionItem value="joints">
          <AccordionTrigger>Joints</AccordionTrigger>
          <AccordionContent className="py-1">
            {movableJoints.length ? (
              <>
                <div className="space-y-2 px-3 py-2">
                  {groupStatePresets.length ? (
                    <div>
                      <span className={fieldLabelClasses}>Group state</span>
                      <Select
                        value={activeGroupStateValue === "__custom__" ? undefined : activeGroupStateValue}
                        onValueChange={(value) => {
                          if (value === "__custom__") {
                            return;
                          }
                          const groupState = groupStatePresets.find((candidate) => String(candidate?.id || "").trim() === value);
                          if (groupState) {
                            onGroupStateSelect?.(groupState);
                          }
                        }}
                      >
                        <SelectTrigger size="sm" className="mt-1.5 h-8 !text-xs">
                          <span className="truncate">{activeGroupStateLabel}</span>
                        </SelectTrigger>
                        <SelectContent>
                          {groupStatePresets.map((groupState) => {
                            const groupStateId = String(groupState?.id || "").trim();
                            const groupStateName = String(groupState?.label || groupState?.name || "").trim() || "State";
                            return (
                              <SelectItem key={groupStateId} value={groupStateId}>
                                {groupStateName}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={onResetPose}
                    >
                      <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      <span>Reset pose</span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        void onCopyJointAngles?.();
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                      <span>{isSdf ? "Copy values" : "Copy angles"}</span>
                    </Button>
                  </div>
                </div>
                {movableJoints.map((joint) => (
                  <UrdfJointRow
                    key={joint.name}
                    joint={joint}
                    valueDeg={jointValues?.[joint.name] ?? joint?.defaultValueDeg ?? 0}
                    onValueChange={onJointValueChange}
                  />
                ))}
              </>
            ) : (
              <p className="px-3 py-2 text-xs text-muted-foreground">No movable joints are available.</p>
            )}
          </AccordionContent>
        </AccordionItem>
        ) : null}
        {themeSections}
      </Accordion>
    </FileSheet>
  );
}
