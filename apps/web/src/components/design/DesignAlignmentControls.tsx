import {
  AlignStartVerticalIcon,
  AlignCenterVerticalIcon,
  AlignEndVerticalIcon,
  AlignStartHorizontalIcon,
  AlignCenterHorizontalIcon,
  AlignEndHorizontalIcon,
  MoreHorizontalIcon,
} from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { Button } from "../ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";

export type DesignAlignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

export function DesignAlignmentControls({
  onAlign,
  disabled = false,
  onDistribute,
  distributeDisabled = false,
}: {
  onAlign: (alignment: DesignAlignment) => void;
  disabled?: boolean;
  onDistribute?: (axis: "horizontal" | "vertical") => void;
  distributeDisabled?: boolean;
}) {
  return (
    <div className="flex gap-2" role="group" aria-label="Align layers">
      {(
        [
          [
            ["left", AlignStartVerticalIcon],
            ["center", AlignCenterVerticalIcon],
            ["right", AlignEndVerticalIcon],
          ],
          [
            ["top", AlignStartHorizontalIcon],
            ["middle", AlignCenterHorizontalIcon],
            ["bottom", AlignEndHorizontalIcon],
          ],
        ] as const
      ).map((group) => (
        <div key={group[0][0]} className="flex min-w-0 flex-1 rounded-md bg-input/25">
          {group.map(([alignment, Icon]) => (
            <Tooltip key={String(alignment)}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Align ${alignment}`}
                    disabled={disabled}
                    className="flex h-7 flex-1 items-center justify-center rounded-md hover:bg-accent disabled:opacity-40"
                    onClick={() => onAlign(alignment)}
                  >
                    <Icon className="size-3.5" />
                  </button>
                }
              />
              <TooltipPopup>Align {String(alignment)}</TooltipPopup>
            </Tooltip>
          ))}
        </div>
      ))}
      {onDistribute ? (
        <Menu>
          <MenuTrigger
            render={<Button size="icon-xs" variant="ghost-muted" aria-label="Alignment options" />}
          >
            <MoreHorizontalIcon />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem disabled={distributeDisabled} onClick={() => onDistribute("horizontal")}>
              Distribute horizontal spacing
            </MenuItem>
            <MenuItem disabled={distributeDisabled} onClick={() => onDistribute("vertical")}>
              Distribute vertical spacing
            </MenuItem>
          </MenuPopup>
        </Menu>
      ) : null}
    </div>
  );
}
