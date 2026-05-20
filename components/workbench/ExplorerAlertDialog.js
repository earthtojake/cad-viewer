import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "../ui/alert-dialog";
import { Badge } from "../ui/badge";
import ExplorerAlertCommand from "./ExplorerAlertCommand";

export default function ExplorerAlertDialog({
  explorerAlertOpen,
  explorerAlert,
  previewMode,
  setExplorerAlertOpen
}) {
  if (!explorerAlert || previewMode) {
    return null;
  }
  const isWarning = explorerAlert.severity === "warning";
  const compact = Boolean(explorerAlert.compact);

  return (
    <AlertDialog
      open={explorerAlertOpen}
      onOpenChange={setExplorerAlertOpen}
    >
      <AlertDialogContent className={compact ? "max-w-sm" : "max-w-md"}>
        <AlertDialogHeader>
          <Badge
            variant={isWarning ? "warning" : "destructive"}
            className="mb-1"
          >
            {isWarning ? "Warning" : "Error"}
          </Badge>
          <AlertDialogTitle>{explorerAlert.title}</AlertDialogTitle>
          <AlertDialogDescription className={compact ? "leading-5 whitespace-pre-line" : "space-y-3 leading-6"}>
            <span className="block">{explorerAlert.message}</span>
            {!compact && explorerAlert.resolution ? (
              <span className="block text-muted-foreground/80">{explorerAlert.resolution}</span>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ExplorerAlertCommand command={explorerAlert.command} />
        <AlertDialogFooter>
          <AlertDialogCancel aria-label="Close alert dialog">Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
