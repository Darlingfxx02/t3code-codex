import {
  CalendarClockIcon,
  FolderPlusIcon,
  HomeIcon,
  SearchIcon,
  SettingsIcon,
  SquarePenIcon,
} from "lucide-react";
import { Link, useLocation } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";

import { openCommandPalette } from "../../commandPaletteBus";
import { Button } from "../ui/button";
import { SidebarTrigger } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

function RailTooltip({ label, trigger }: { label: string; trigger: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipPopup side="right">{label}</TooltipPopup>
    </Tooltip>
  );
}

function RailLink({
  label,
  to,
  active,
  children,
}: {
  label: string;
  to: "/" | "/settings/scheduled-tasks" | "/settings";
  active: boolean;
  children: ReactNode;
}) {
  return (
    <RailTooltip
      label={label}
      trigger={
        <Button
          render={<Link to={to} aria-label={label} />}
          size="icon"
          variant={active ? "secondary" : "ghost"}
          className="size-9 rounded-xl"
        >
          {children}
        </Button>
      }
    />
  );
}

function RailAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <RailTooltip
      label={label}
      trigger={
        <Button
          aria-label={label}
          onClick={onClick}
          size="icon"
          variant="ghost"
          className="size-9 rounded-xl"
        >
          {children}
        </Button>
      }
    />
  );
}

export function WorkspaceIconRail() {
  const pathname = useLocation({ select: (location) => location.pathname });

  return (
    <aside
      aria-label="Workspace navigation"
      className="fixed inset-y-0 start-0 z-30 hidden w-(--workspace-rail-width) p-0.5 md:flex"
      data-app-icon-rail=""
    >
      <nav className="flex h-full w-full flex-col items-center rounded-md border border-sidebar-border/70 bg-sidebar surface-grain px-1.5 py-2 text-sidebar-foreground">
        <div className="flex w-full flex-col items-center gap-1">
          <RailTooltip
            label="Toggle sidebar"
            trigger={<SidebarTrigger aria-label="Toggle sidebar" className="size-9 rounded-xl" />}
          />
          <RailLink label="Home" to="/" active={pathname === "/"}>
            <HomeIcon />
          </RailLink>
          <RailAction label="Search" onClick={() => openCommandPalette()}>
            <SearchIcon />
          </RailAction>
          <RailAction
            label="New thread"
            onClick={() => openCommandPalette({ open: "new-thread-in" })}
          >
            <SquarePenIcon />
          </RailAction>
          <RailAction
            label="Add project"
            onClick={() => openCommandPalette({ open: "add-project" })}
          >
            <FolderPlusIcon />
          </RailAction>
        </div>

        <div className="my-2 h-px w-7 bg-sidebar-border/70" />

        <RailLink
          label="Scheduled tasks"
          to="/settings/scheduled-tasks"
          active={pathname.startsWith("/settings/scheduled-tasks")}
        >
          <CalendarClockIcon />
        </RailLink>

        <div className="mt-auto">
          <RailLink
            label="Settings"
            to="/settings"
            active={
              pathname.startsWith("/settings") && !pathname.startsWith("/settings/scheduled-tasks")
            }
          >
            <SettingsIcon />
          </RailLink>
        </div>
      </nav>
    </aside>
  );
}
