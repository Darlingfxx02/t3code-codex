import { useLocation, useNavigate, type AnyRouter } from "@tanstack/react-router";

import { GUEST_PAGE_PATH } from "../../guestPage";
import { withoutAssistantCitationHash } from "../../lib/assistantCitationNavigation";
import { validateScheduledTasksSearch } from "../settings/scheduledTasksSettings.logic";

export function isSettingsPage(pathname: string) {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

export function isAutomationsPage(pathname: string) {
  return pathname === "/automations";
}

export function isDesignPage(pathname: string) {
  return pathname === "/design";
}

export function isTasksPage(pathname: string) {
  return pathname === "/tasks";
}

export function workspaceSidebarMode(
  pathname: string,
): "thread" | "settings" | "automations" | "design" | "tasks" {
  if (isSettingsPage(pathname)) return "settings";
  if (isAutomationsPage(pathname)) return "automations";
  if (isDesignPage(pathname)) return "design";
  if (isTasksPage(pathname)) return "tasks";
  return "thread";
}

/** Usage is the remaining overlay page; Settings and Automations use the app shell. */
export function isAppModalPage(pathname: string) {
  return pathname === "/usage";
}

export function isSidebarUtilityPage(pathname: string) {
  return pathname.startsWith("/projects/") || pathname === "/pull-requests";
}

// Pages the root route always renders without the app shell, so they are never
// a page to return to. Other paths seen before auth or on a prompt-link landing
// are still recorded; they are real app URLs, so returning to one is harmless.
const SHELL_LESS_PATHS = new Set(["/pair", "/connect", "/connect-agent", GUEST_PAGE_PATH]);

let mainAppHref: string | null = null;
let appModalReturnHref: string | null = null;

/** Remembers where modal and utility pages lead back to. */
export function startMainAppLocationTracking(router: AnyRouter): () => void {
  const record = () => {
    const { pathname } = router.state.location;
    if (isAppModalPage(pathname) || SHELL_LESS_PATHS.has(pathname)) return;
    const href = withoutAssistantCitationHash(router.state.location.href);
    appModalReturnHref = href;
    if (
      !isAppModalPage(pathname) &&
      !isSettingsPage(pathname) &&
      !isAutomationsPage(pathname) &&
      !isDesignPage(pathname) &&
      !isTasksPage(pathname)
    ) {
      if (!isSidebarUtilityPage(pathname)) mainAppHref = href;
    }
  };
  record();
  return router.subscribe("onResolved", record);
}

export function useNavigateToMainApp() {
  const navigate = useNavigate();
  return () => navigate({ href: mainAppHref ?? "/" });
}

/** Leaves a modal page for the page that opened it. */
export function useCloseAppModal() {
  const navigate = useNavigate();
  const returnTo = useLocation({
    select: (location) =>
      typeof location.search === "object" && location.search !== null
        ? (location.search as { readonly returnTo?: string }).returnTo
        : undefined,
  });
  const automationSearch = useLocation({
    select: (location) => {
      if (typeof location.search !== "object" || location.search === null) return null;
      const search = validateScheduledTasksSearch(location.search as Record<string, unknown>);
      if (search.returnTo !== "automations") return null;
      return {
        ...((search.returnEnvironmentId ?? search.environmentId)
          ? { environmentId: search.returnEnvironmentId ?? search.environmentId }
          : {}),
        ...((search.returnTaskId ?? search.taskId)
          ? { taskId: search.returnTaskId ?? search.taskId }
          : {}),
      };
    },
  });
  return () =>
    returnTo === "automations" && automationSearch !== null
      ? navigate({ to: "/automations", search: automationSearch })
      : navigate({ href: appModalReturnHref ?? mainAppHref ?? "/" });
}
