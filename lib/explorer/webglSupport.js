const WEBGL_CONTEXT_ERROR_PATTERN = /(?:error creating webgl context|webgl context could not be created|failed to create webgl|webgl is not supported)/i;

export function runtimeErrorMessage(error) {
  return error instanceof Error ? error.message : String(error || "");
}

export function isWebGlContextCreationError(error) {
  return WEBGL_CONTEXT_ERROR_PATTERN.test(runtimeErrorMessage(error));
}

export function buildRuntimeInitializationAlert(error) {
  const message = runtimeErrorMessage(error).trim();

  if (isWebGlContextCreationError(error)) {
    return {
      severity: "error",
      blocking: true,
      summary: "WebGL unavailable",
      title: "Browser WebGL is unavailable",
      message: "CAD Explorer needs browser WebGL to render 3D models, but this browser could not create a WebGL context.",
      resolution: "Enable hardware acceleration or software WebGL in the browser, update the graphics or Mesa drivers, then reload CAD Explorer. In Chrome, check chrome://gpu for the WebGL status."
    };
  }

  return {
    severity: "error",
    blocking: true,
    summary: "Explorer startup failed",
    title: "CAD Explorer could not start",
    message: message || "The 3D renderer failed before CAD Explorer finished starting.",
    resolution: "Reload CAD Explorer. If the problem persists, check the browser console for the renderer startup error."
  };
}
