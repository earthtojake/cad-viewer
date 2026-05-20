import {
  Accordion
} from "../ui/accordion";
import FileSheet from "./FileSheet";

export default function MeshFileSheet({
  open,
  title = "Mesh",
  isDesktop,
  width,
  onStartResize,
  themeSections = null
}) {
  return (
    <FileSheet
      open={open}
      title={title}
      isDesktop={isDesktop}
      width={width}
      onStartResize={onStartResize}
    >
      <Accordion type="multiple" className="text-sm">
        {themeSections}
      </Accordion>
    </FileSheet>
  );
}
