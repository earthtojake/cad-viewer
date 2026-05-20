import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "../ui/tooltip";
import { cn } from "../../lib/cn";

export function ToolbarButton({
  label,
  active = false,
  tooltipSide = "bottom",
  className,
  children,
  ...props
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="icon-xs"
          className={cn("size-6 shadow-none", className)}
          aria-label={label}
          title={label}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export function ToolbarTextButton({
  label,
  active = false,
  tooltipSide = "top",
  className,
  children,
  ...props
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={active ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "min-h-9 flex-1 touch-manipulation px-3 text-xs shadow-none",
            className
          )}
          aria-label={label}
          title={label}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={tooltipSide} sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
