import type { RuntimeMode } from "@t3tools/contracts";
import { useRef } from "react";

import { cn } from "~/lib/utils";
import { Menu, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerControl, ComposerControlIcon, type ComposerControlSize } from "./ComposerControl";
import { ComposerPermissionsSection, type RuntimeModeOption } from "./ComposerFooterControls";
import { focusRequestedPermission, useComposerMenuProps } from "./composerEventScope";
import { runtimeModeConfig } from "./runtimeModeConfig";
import { useComposerMenuState } from "./useComposerMenuState";

export function ComposerPermissionsButton(props: {
  runtimeMode: RuntimeMode;
  runtimeModeOptions: ReadonlyArray<RuntimeModeOption>;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  size?: ComposerControlSize;
  hidden?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useComposerMenuState(props.hidden);
  const composerMenuProps = useComposerMenuProps();
  const { icon, label, description } = runtimeModeConfig[props.runtimeMode];
  const size = props.size ?? "sm";
  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => focusRequestedPermission(isOpen, triggerRef.current)}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <ComposerControl
                  ref={triggerRef}
                  size={size}
                  data-composer-shortcut="composer.mode"
                  aria-label={`Permissions: ${label}`}
                  className={cn(
                    "min-w-7 max-w-[calc(100cqi-13rem)] data-popup-open:bg-accent",
                    props.runtimeMode === "full-access" &&
                      "text-permission-full-access hover:text-permission-full-access dark:text-permission-full-access",
                  )}
                />
              }
            />
          }
        >
          <ComposerControlIcon icon={icon} size={size} className="text-current" />
          <span data-composer-control-label className="truncate">
            {label}
          </span>
        </TooltipTrigger>
        <TooltipPopup side="top">{description}</TooltipPopup>
      </Tooltip>
      <MenuPopup side="top" align="start" {...composerMenuProps}>
        <ComposerPermissionsSection
          runtimeMode={props.runtimeMode}
          runtimeModeOptions={props.runtimeModeOptions}
          onRuntimeModeChange={props.onRuntimeModeChange}
        />
      </MenuPopup>
    </Menu>
  );
}
