import { RotateCwIcon, FlipHorizontalIcon, FlipVerticalIcon } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

export function DesignRotationControls({
  onRotate,
  onFlip,
  disabled = false,
}: {
  onRotate: () => void;
  onFlip: (axis: "horizontal" | "vertical") => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex h-7 rounded-md bg-input/25" role="group" aria-label="Transform layers">
      {(
        [
          ["Rotate 90° clockwise", RotateCwIcon, onRotate],
          ["Flip horizontal", FlipHorizontalIcon, () => onFlip("horizontal")],
          ["Flip vertical", FlipVerticalIcon, () => onFlip("vertical")],
        ] as const
      ).map(([label, Icon, action]) => (
        <Tooltip key={label}>
          <TooltipTrigger
            render={
              <button
                type="button"
                disabled={disabled}
                aria-label={label}
                className="flex flex-1 items-center justify-center rounded-md hover:bg-accent disabled:opacity-40"
                onClick={action}
              />
            }
          >
            <Icon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup>
            {label}
            {label === "Flip horizontal" ? " · ⇧ H" : label === "Flip vertical" ? " · ⇧ V" : ""}
          </TooltipPopup>
        </Tooltip>
      ))}
    </div>
  );
}
