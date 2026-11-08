import { FolderPlusIcon, SearchIcon, SquarePenIcon } from "lucide-react";
import {
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";

import { cn } from "~/lib/utils";
import { SidebarMenuButton } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export interface SidebarThreadHeaderProps {
  showProjectScope: boolean;
  projectScope: ReactNode;
  onSearch: () => void;
  searchShortcutLabel: string | null | undefined;
  onNewProject: () => void;
  onNewThread: (event: ReactMouseEvent) => void;
  newThreadDisabled: boolean;
  newThreadShortcutLabel: string | null | undefined;
  showProjectPickerHint: boolean;
  showActions?: boolean;
  showProjectActions?: boolean;
}

export function SidebarThreadHeader({
  showProjectScope,
  projectScope,
  onSearch,
  searchShortcutLabel,
  onNewProject,
  onNewThread,
  newThreadDisabled,
  newThreadShortcutLabel,
  showProjectPickerHint,
  showActions = true,
  showProjectActions = true,
}: SidebarThreadHeaderProps) {
  const newThreadLabel = newThreadShortcutLabel
    ? `New thread (${newThreadShortcutLabel})`
    : "New thread";

  return (
    <div className="flex items-center gap-0.5">
      {showActions ? (
        <>
          <SidebarHeaderIconButton
            label="Global search"
            tooltip={
              searchShortcutLabel ? `Search (${searchShortcutLabel})` : "Search"
            }
            onClick={onSearch}
          >
            <SearchIcon />
          </SidebarHeaderIconButton>
          {showProjectActions ? (
            <div className="flex shrink-0 items-center">
              <SidebarHeaderIconButton label="Add project" onClick={onNewProject}>
                <FolderPlusIcon />
              </SidebarHeaderIconButton>
              <SidebarHeaderIconButton
                label="New thread"
                tooltip={
                  showProjectPickerHint ? (
                    <span className="flex flex-col gap-0.5">
                      <span>{newThreadLabel}</span>
                      <span className="text-muted-foreground">
                        Choose a project: Shift+click
                      </span>
                    </span>
                  ) : (
                    newThreadLabel
                  )
                }
                disabled={newThreadDisabled}
                onClick={onNewThread}
              >
                <SquarePenIcon />
              </SidebarHeaderIconButton>
            </div>
          ) : null}
        </>
      ) : showProjectScope ? (
        projectScope
      ) : null}
    </div>
  );
}

export function SidebarHeaderIconButton({
  label,
  tooltip = label,
  tooltipSide = "bottom",
  className,
  children,
  ...rest
}: {
  label: string;
  tooltip?: ReactNode;
  tooltipSide?: "top" | "bottom" | "left" | "right";
  className?: string | undefined;
  children?: ReactNode;
} & Omit<
  ComponentProps<typeof SidebarMenuButton>,
  "children" | "className" | "tooltip" | "isActive" | "aria-label"
>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <SidebarMenuButton
            size="icon"
            type="button"
            aria-label={label}
            {...rest}
            className={cn(
              "relative size-7 shrink-0 [-webkit-app-region:no-drag]",
              className,
            )}
          />
        }
      >
        {children}
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-1/2 pointer-fine:hidden"
        />
      </TooltipTrigger>
      <TooltipPopup side={tooltipSide}>{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
