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
import ViewerAlertCommand from "./ViewerAlertCommand";

export default function ViewerAlertDialog({
  viewerAlertOpen,
  viewerAlert,
  previewMode,
  setViewerAlertOpen
}) {
  if (!viewerAlert || previewMode) {
    return null;
  }
  const isWarning = viewerAlert.severity === "warning";
  const compact = Boolean(viewerAlert.compact);

  return (
    <AlertDialog
      open={viewerAlertOpen}
      onOpenChange={setViewerAlertOpen}
    >
      <AlertDialogContent className={compact ? "max-w-sm" : "max-w-md"}>
        <AlertDialogHeader>
          <Badge
            variant={isWarning ? "warning" : "destructive"}
            className="mb-1"
          >
            {isWarning ? "Warning" : "Error"}
          </Badge>
          <AlertDialogTitle>{viewerAlert.title}</AlertDialogTitle>
          <AlertDialogDescription className={compact ? "leading-5 whitespace-pre-line" : "space-y-3 leading-6"}>
            <span className="block">{viewerAlert.message}</span>
            {!compact && viewerAlert.resolution ? (
              <span className="block text-muted-foreground/80">{viewerAlert.resolution}</span>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ViewerAlertCommand command={viewerAlert.command} />
        <AlertDialogFooter>
          <AlertDialogCancel aria-label="Close alert dialog">Close</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
