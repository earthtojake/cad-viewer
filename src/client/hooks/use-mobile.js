import * as React from "react"

import {
  CAD_WORKSPACE_MOBILE_MEDIA_QUERY,
  isCadWorkspaceMobileViewport
} from "../workbench/breakpoints.js"

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(() => (
    typeof window === "undefined" ? false : isCadWorkspaceMobileViewport(window.innerWidth)
  ))

  React.useEffect(() => {
    const mql = window.matchMedia(CAD_WORKSPACE_MOBILE_MEDIA_QUERY)
    const onChange = () => {
      setIsMobile(isCadWorkspaceMobileViewport(window.innerWidth))
    }
    mql.addEventListener("change", onChange)
    setIsMobile(isCadWorkspaceMobileViewport(window.innerWidth))
    return () => mql.removeEventListener("change", onChange);
  }, [])

  return !!isMobile
}
