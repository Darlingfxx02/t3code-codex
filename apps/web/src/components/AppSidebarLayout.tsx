import { useAtomValue } from "@effect/atom-react";
import * as Schema from "effect/Schema";
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useLocation, useNavigate, useRouter, type AnyRouter } from "@tanstack/react-router";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { SearchIcon } from "lucide-react";

import { moveWorkspaceFocus, workspaceAreaProps } from "../lib/workspaceFocus";
import { isCommandPaletteOpen, openCommandPalette } from "../commandPaletteBus";
import { isElectron } from "../env";
import {
  releaseThreadUndoShortcut,
  threadUndoClaimsShortcut,
  undoLatestThreadAction,
} from "../hooks/showThreadUndoNotice";
import { getLocalStorageItem, removeLocalStorageItem } from "../hooks/useLocalStorage";
import { isRichTextBoldShortcut, resolveShortcutCommand } from "../keybindings";
import { isEditableFocused } from "../lib/editableFocus";
import { isPreviewFocused } from "../lib/previewFocus";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { selectActiveRightPanel, useRightPanelStore } from "../rightPanelStore";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { cn, isMacPlatform } from "../lib/utils";
import { primaryServerKeybindingsAtom } from "../state/server";
import {
  PanelAnimationSuppressionProvider,
  usePanelAnimationSettings,
  usePanelNavigationSuppression,
} from "../panelAnimations";
import { BackgroundThreadAnnouncer } from "./BackgroundThreadAnnouncer";
import { HistorySwipeNavigation } from "./HistorySwipeNavigation";
import ThreadSidebar from "./Sidebar";
import { SidebarBrandWidthProbe, SidebarChromeFooter } from "./sidebar/SidebarChrome";
import { WorkspaceIconRail } from "./sidebar/WorkspaceIconRail";
import {
  isAppModalPage,
  isAutomationsPage,
  isDesignPage,
  isSettingsPage,
  isTasksPage,
  workspaceSidebarMode,
} from "./sidebar/mainAppLocation";
import { SettingsSidebarNav } from "./settings/SettingsSidebarNav";
import type { SidebarRouteReveal } from "./sidebar/routeReveal";
import { Button } from "./ui/button";
import { useThreadRouteTarget } from "../hooks/useThreadRouteTarget";
import { useProject, useQuietThreadProjection, useQuietThreadShell } from "../state/entities";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { ProjectFavicon } from "./ProjectFavicon";
import {
  clampThreadSidebarWidth,
  resolveInitialThreadSidebarWidth,
  resolveThreadSidebarMaximumWidth,
  resolveThreadSidebarMinimumWidth,
  THREAD_MAIN_CONTENT_MIN_WIDTH,
  THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
} from "./threadSidebarWidth";
import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "./ui/sidebar";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { registerCommands, registerMenuAction } from "../shortcuts/dispatcher";
import { buildThreadRouteParams, resolveThreadRouteRef } from "../threadRoutes";

const MACOS_TRAFFIC_LIGHTS_LEFT_INSET = "var(--desktop-window-controls-inset, 90px)";

function WorkspaceGlobalChrome() {
  const navigate = useNavigate();
  const automationsPage = useLocation({
    select: (location) => isAutomationsPage(location.pathname),
  });
  const designPage = useLocation({
    select: (location) => isDesignPage(location.pathname),
  });
  const tasksPage = useLocation({
    select: (location) => isTasksPage(location.pathname),
  });
  const chromeSidebarWidth =
    automationsPage || tasksPage
      ? "var(--automations-sidebar-width)"
      : designPage
        ? "var(--design-sidebar-width)"
        : "var(--sidebar-width)";
  const target = useThreadRouteTarget();
  const threadRef = target?.kind === "server" ? target.threadRef : null;
  const shell = useQuietThreadShell(threadRef);
  // Settled threads have no shell; fall back to the open thread's projection, as ChatView does.
  const projection = useQuietThreadProjection(shell === null ? threadRef : null);
  const thread = shell ?? projection?.projection.thread ?? null;
  const title = tasksPage
    ? "Tasks"
    : designPage
      ? "Design"
      : automationsPage
        ? ""
        : thread?.title.trim() || (target?.kind === "draft" ? "New thread" : "T3 Code");
  const projectRef =
    threadRef !== null && thread !== null
      ? scopeProjectRef(threadRef.environmentId, thread.projectId)
      : null;
  const project = useProject(projectRef);
  const parentRef =
    threadRef !== null &&
    thread?.lineage.relationshipToParent === "subagent" &&
    thread.lineage.parentThreadId !== null
      ? scopeThreadRef(threadRef.environmentId, thread.lineage.parentThreadId)
      : null;
  const parentTitle = useQuietThreadShell(parentRef)?.title ?? "Parent thread";

  return (
    <header
      className="fixed top-0 right-0 left-0 z-30 flex h-(--workspace-chrome-height) items-center gap-2 pe-5 ps-5 md:left-(--workspace-rail-width)"
      style={{
        paddingInlineStart:
          "max(1.25rem, calc(var(--workspace-controls-left) - var(--workspace-rail-width)))",
      }}
      data-workspace-global-chrome=""
    >
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        {automationsPage || designPage || tasksPage ? (
          <span aria-hidden className="size-7" />
        ) : (
          <SidebarTrigger aria-label="Toggle main sidebar" className="size-7" />
        )}
        <Button
          variant="ghost-muted"
          size="icon-sm"
          aria-label="Global search"
          onClick={() => openCommandPalette()}
        >
          <SearchIcon aria-hidden className="size-4" />
        </Button>
      </div>
      <div
        className={cn(
          "absolute inset-y-0 flex min-w-0 items-center gap-2.5 ps-2 pe-32 text-sm",
          automationsPage && "max-md:!left-24 max-md:pe-3",
        )}
        style={{
          left: `calc(0.25rem + 1px + ${chromeSidebarWidth})`,
          right: "0px",
        }}
      >
        {project ? <ProjectFavicon project={project} className="size-4 shrink-0" /> : null}
        {parentRef ? (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label={`Open parent thread: ${parentTitle}`}
                    onClick={() => {
                      void navigate({
                        to: "/$environmentId/$threadId",
                        params: buildThreadRouteParams(parentRef),
                      });
                    }}
                    className="min-w-0 max-w-[45%] shrink cursor-pointer truncate rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  />
                }
              >
                {parentTitle}
              </TooltipTrigger>
              <TooltipPopup side="bottom">{parentTitle}</TooltipPopup>
            </Tooltip>
            <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
          </>
        ) : null}
        <div
          className={designPage ? "sr-only" : "min-w-0 flex-1 truncate text-foreground/90"}
          {...(automationsPage ? { "data-automation-chrome-title": "" } : {})}
        >
          {title}
        </div>
      </div>
      <span
        aria-hidden
        className="pointer-events-none fixed z-40 hidden w-px bg-border/60 md:block"
        style={{
          left: `calc(var(--workspace-rail-width) + 0.25rem + 1px + ${chromeSidebarWidth})`,
          top: "0.5rem",
          height: "calc(var(--workspace-chrome-height) - 1rem)",
        }}
      />
      <div
        className="pointer-events-none fixed top-0 z-40 flex h-(--workspace-chrome-height) items-center justify-end"
        style={{ right: "calc(var(--workspace-shell-inset) + 1px)" }}
        data-workspace-right-tabs=""
      />
      {designPage ? (
        <div
          className="pointer-events-auto absolute inset-y-0 right-5 z-40 flex min-w-0 items-center ps-2 text-sm"
          style={{ left: `calc(0.25rem + 1px + ${chromeSidebarWidth})` }}
          data-design-chrome-actions=""
        />
      ) : null}
    </header>
  );
}

function subscribeToViewportWidth(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function readViewportWidth(): number {
  return window.innerWidth;
}

// Cache the synchronous fullscreen IPC read until subscription.
let windowFullscreenSnapshot: boolean | null = null;

function macosDesktopBridge() {
  if (!isElectron || !isMacPlatform(navigator.platform)) return null;
  return window.desktopBridge ?? null;
}

function subscribeToWindowFullscreen(onChange: () => void): () => void {
  const bridge = macosDesktopBridge();
  if (
    typeof bridge?.getWindowFullscreenState !== "function" ||
    typeof bridge.onWindowFullscreenStateChange !== "function"
  ) {
    return () => {};
  }
  const unsubscribe = bridge.onWindowFullscreenStateChange((fullscreen) => {
    windowFullscreenSnapshot = fullscreen;
    onChange();
  });
  // The window may have changed state between the first render and this subscription.
  windowFullscreenSnapshot = bridge.getWindowFullscreenState();
  return () => {
    unsubscribe();
    windowFullscreenSnapshot = null;
  };
}

function readWindowFullscreen(): boolean {
  if (windowFullscreenSnapshot === null) {
    const getWindowFullscreenState = macosDesktopBridge()?.getWindowFullscreenState;
    windowFullscreenSnapshot =
      typeof getWindowFullscreenState === "function" ? getWindowFullscreenState() : false;
  }
  return windowFullscreenSnapshot;
}

function readInitialThreadSidebarWidth(): number {
  try {
    return resolveInitialThreadSidebarWidth(
      getLocalStorageItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY, Schema.Finite),
      window.innerWidth,
    );
  } catch (error) {
    console.error("Could not read persisted thread sidebar width.", error);
    return resolveInitialThreadSidebarWidth(null, window.innerWidth);
  }
}

function readUsagePageOpen(router: AnyRouter) {
  return router.state.location.pathname === "/usage";
}

function isKeybindingCaptureTarget(event: KeyboardEvent) {
  return event.target instanceof HTMLElement && event.target.closest("[data-keybinding-capture]");
}

function readRoutePanelsOpen(router: AnyRouter) {
  const routeThreadRef = resolveThreadRouteRef(router.state.matches.at(-1)?.params ?? {});
  if (!routeThreadRef) return { terminalOpen: false, previewOpen: false };
  return {
    terminalOpen: selectThreadTerminalUiState(
      useTerminalUiStateStore.getState().terminalUiStateByThreadKey,
      routeThreadRef,
    ).terminalOpen,
    previewOpen:
      selectActiveRightPanel(useRightPanelStore.getState().byThreadKey, routeThreadRef) ===
      "preview",
  };
}

export function registerNavigationHistoryCommands(router: AnyRouter): () => void {
  return registerCommands(
    {
      "navigation.back": (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.history.back();
      },
      "navigation.forward": (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.history.forward();
      },
    },
    {
      when: (event) => !isKeybindingCaptureTarget(event),
      context: () => ({
        ...readRoutePanelsOpen(router),
        usagePageOpen: readUsagePageOpen(router),
      }),
    },
  );
}

// Capture phase, so F6 also leaves widgets that swallow keys, such as the terminal.
function registerWorkspaceFocusCommands(router: AnyRouter): () => void {
  const move = (direction: 1 | -1) => (event: KeyboardEvent) => {
    if (event.isComposing) return false;
    // Inside a dialog the move is refused, but the key is still consumed.
    event.preventDefault();
    event.stopPropagation();
    moveWorkspaceFocus(direction);
  };
  const disposers = [
    registerCommands(
      { "workspace.focusNext": move(1), "workspace.focusPrevious": move(-1) },
      {
        capture: true,
        when: (event) => !isKeybindingCaptureTarget(event),
        context: () => readRoutePanelsOpen(router),
      },
    ),
    // A focused desktop browser forwards the keys; its renderer focus is stale.
    registerMenuAction("workspace.focusNext", () => moveWorkspaceFocus(1, "panel")),
    registerMenuAction("workspace.focusPrevious", () => moveWorkspaceFocus(-1, "panel")),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}

// Escape leaves the pull requests page when no scope (a selection, a dialog,
// a drag) claimed it, so it observes after every other scope.
function registerPullRequestsEscapeCommand(router: AnyRouter): () => void {
  return registerCommands(
    {},
    {
      observe: (event, consumed) => {
        if (consumed || event.repeat || event.isComposing || event.key !== "Escape") return;
        if (router.state.location.pathname !== "/pull-requests") return;
        event.preventDefault();
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement) activeElement.blur();
        if (router.state.location.state.__TSR_index !== 0) {
          window.history.back();
          return;
        }
        void router.navigate({ to: "/" });
      },
    },
  );
}

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

// A held key undoes once. Module state: undoing an archive navigates, and the
// hold must survive whatever that re-renders.
let heldUndoKey: string | null = null;

// Undoes the thread actions in the sidebar's notice. Settings, Automations and
// Usage own mod+z while open. Captured so mod+z reaches it before the composer's
// own undo handler consumes the key.
function registerThreadUndoCommands(
  router: AnyRouter,
  readSidebarVisible: () => boolean,
): () => void {
  const threadSidebarShown = () => {
    const pathname = router.state.location.pathname;
    return (
      !isAppModalPage(pathname) &&
      !isSettingsPage(pathname) &&
      !isAutomationsPage(pathname) &&
      !isDesignPage(pathname) &&
      !isTasksPage(pathname)
    );
  };
  const unregister = registerCommands(
    {},
    {
      capture: true,
      when: threadSidebarShown,
      onKeyDown: (event) => {
        // Cancel a held key's repeats so they cannot fall through to the
        // editor's own undo, even after the last notice is gone.
        if (event.repeat) {
          if (event.code !== heldUndoKey) return false;
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
        // A modifier tapped mid-hold leaves the held key repeating.
        if (!MODIFIER_KEYS.has(event.key)) heldUndoKey = null;
        const command = resolveShortcutCommand(
          event,
          appAtomRegistry.get(primaryServerKeybindingsAtom),
          {
            context: {
              terminalFocus: isTerminalFocused(),
              previewFocus: isPreviewFocused(),
              ...readRoutePanelsOpen(router),
              // A collapsed sidebar hides the notice, so text fields keep their own undo.
              editableFocus:
                isEditableFocused(event.target) &&
                !(readSidebarVisible() && threadUndoClaimsShortcut()),
              modelPickerOpen: isModelPickerOpen(),
            },
          },
        );
        if (command !== "thread.undo") {
          if (!MODIFIER_KEYS.has(event.key)) releaseThreadUndoShortcut();
          return false;
        }
        if (isCommandPaletteOpen() || isModelPickerOpen()) return false;
        if (!undoLatestThreadAction()) return false;
        heldUndoKey = event.code;
        event.preventDefault();
        event.stopPropagation();
        return true;
      },
    },
  );
  // Pastes from a menu, dictation and drops edit text without a keypress.
  const onInput = () => {
    if (threadSidebarShown()) releaseThreadUndoShortcut();
  };
  window.addEventListener("input", onInput, true);
  return () => {
    unregister();
    window.removeEventListener("input", onInput, true);
  };
}

/** Keyboard and menu commands that live as long as the app shell. */
function registerAppShellCommands(router: AnyRouter, shellElement: Element): () => void {
  // The provider mirrors the visibility it renders onto its wrapper, so the
  // committed state is readable when a key arrives.
  const readSidebarVisible = () =>
    shellElement.closest('[data-slot="sidebar-wrapper"]')?.getAttribute("data-sidebar-state") ===
    "expanded";
  const disposers = [
    registerThreadUndoCommands(router, readSidebarVisible),
    registerNavigationHistoryCommands(router),
    registerWorkspaceFocusCommands(router),
    registerPullRequestsEscapeCommand(router),
    registerMenuAction("open-settings", () => {
      if (!/^\/settings(\/|$)/.test(router.state.location.pathname))
        void router.navigate({ to: "/settings" });
    }),
  ];
  return () => {
    for (const dispose of disposers) dispose();
  };
}

function SidebarControl() {
  const router = useRouter();
  const usagePageOpen = useLocation({ select: (location) => location.pathname === "/usage" });
  const automationsPage = useLocation({
    select: (location) => isAutomationsPage(location.pathname),
  });
  const designPage = useLocation({
    select: (location) => isDesignPage(location.pathname),
  });
  const tasksPage = useLocation({
    select: (location) => isTasksPage(location.pathname),
  });
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const { toggleSidebar } = useSidebar();

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window keydown listener that toggles the sidebar on its shortcut
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (automationsPage || designPage || tasksPage) return;
      if (event.defaultPrevented) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("[data-keybinding-capture]")
      ) {
        return;
      }
      if (
        isRichTextBoldShortcut(event, window.getSelection()) &&
        event.target instanceof HTMLElement &&
        event.target.closest('[data-composer-rich-text="true"]')
      ) {
        // The rich-text composer claims Mod+B only to bold selected text;
        // the toggle stays available everywhere else.
        return;
      }
      if (
        resolveShortcutCommand(event, keybindings, { context: { usagePageOpen } }) !==
        "sidebar.toggle"
      )
        return;

      event.preventDefault();
      event.stopPropagation();
      toggleSidebar();
    };

    window.addEventListener("keydown", onKeyDown, true);
    const unsubscribe = window.desktopBridge?.onMenuAction((action) => {
      if (action === "sidebar.toggle" && !automationsPage && !designPage && !tasksPage)
        toggleSidebar();
    });
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      unsubscribe?.();
    };
  }, [automationsPage, designPage, tasksPage, keybindings, toggleSidebar, usagePageOpen]);

  // The control lives as long as the shell, so it carries the shell's commands. Created
  // once so re-renders never re-register them.
  const [appShellCommandsRef] = useState(
    () => (node: HTMLDivElement | null) =>
      node === null ? undefined : registerAppShellCommands(router, node),
  );

  return <div ref={appShellCommandsRef} className="hidden" data-sidebar-control="" />;
}

export function AppSidebarLayout({ children }: { children: ReactNode }) {
  const [sidebarRouteReveal] = useState<SidebarRouteReveal>(() => ({
    observedKey: null,
    pendingKey: null,
  }));
  const { active: panelAnimationsActive, durationMs: panelAnimationDurationMs } =
    usePanelAnimationSettings();
  const pathname = useLocation({ select: (location) => location.pathname });
  const sidebarMode = workspaceSidebarMode(pathname);
  const settingsPage = sidebarMode === "settings";
  const automationsPage = sidebarMode === "automations";
  const designPage = sidebarMode === "design";
  const tasksPage = sidebarMode === "tasks";
  const sidebarArea =
    settingsPage || automationsPage || designPage || tasksPage
      ? {}
      : workspaceAreaProps("sidebar", 0, "Threads");
  const panelAnimationsSuppressed = usePanelNavigationSuppression(pathname);
  const routePanelAnimationsActive = panelAnimationsActive && !panelAnimationsSuppressed;
  const isMacosDesktop = isElectron && isMacPlatform(navigator.platform);
  const [sidebarWidth, setSidebarWidth] = useState(readInitialThreadSidebarWidth);
  // A clamped drag may not change width, so viewport changes need a separate subscription.
  const viewportWidth = useSyncExternalStore(subscribeToViewportWidth, readViewportWidth);
  const [brandWidth, setBrandWidth] = useState(0);
  const sidebarMinimumWidth = resolveThreadSidebarMinimumWidth(brandWidth);
  const sidebarMaximumWidth = resolveThreadSidebarMaximumWidth(viewportWidth, sidebarMinimumWidth);
  const resetSidebarWidth = () => {
    try {
      removeLocalStorageItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY);
    } catch (error) {
      console.error("Could not clear persisted thread sidebar width.", error);
    }
    setSidebarWidth(resolveInitialThreadSidebarWidth(null, viewportWidth));
  };
  const isWindowFullscreen = useSyncExternalStore(
    subscribeToWindowFullscreen,
    readWindowFullscreen,
  );
  const windowControlsInsetStyle = (
    isMacosDesktop && !isWindowFullscreen
      ? { "--workspace-controls-left": MACOS_TRAFFIC_LIGHTS_LEFT_INSET }
      : {}
  ) as CSSProperties;
  const sidebarProviderStyle = {
    "--sidebar-width": `${clampThreadSidebarWidth(sidebarWidth, sidebarMinimumWidth, sidebarMaximumWidth)}px`,
    "--panel-animation-duration": `${panelAnimationDurationMs}ms`,
    ...windowControlsInsetStyle,
  } as CSSProperties;

  return (
    <PanelAnimationSuppressionProvider value={panelAnimationsSuppressed}>
      <div className="relative h-dvh min-h-0 overflow-hidden bg-background" data-workspace-stage="">
        <WorkspaceIconRail />
        <div
          className="relative ms-(--workspace-shell-inset) me-(--workspace-shell-inset) overflow-hidden rounded-2xl border border-sidebar-border/70 md:ms-[calc(var(--workspace-rail-width)+var(--workspace-shell-inset))]"
          style={{
            marginTop: "var(--workspace-chrome-height)",
            height: "calc(100% - var(--workspace-chrome-height) - var(--workspace-shell-inset))",
          }}
          data-workspace-shell=""
        >
          <SidebarProvider
            className="relative h-full! min-h-0! overflow-hidden"
            data-panel-animations={routePanelAnimationsActive ? "true" : "false"}
            defaultOpen
            style={sidebarProviderStyle}
          >
            <SidebarBrandWidthProbe isElectron={isElectron} onWidthChange={setBrandWidth} />
            {automationsPage || designPage || tasksPage ? null : (
              <Sidebar
                side="left"
                collapsible="offcanvas"
                data-app-sidebar=""
                {...sidebarArea}
                role={settingsPage ? "presentation" : "navigation"}
                aria-label={settingsPage ? undefined : "Threads"}
                resizable={{
                  maxWidth: sidebarMaximumWidth,
                  minWidth: sidebarMinimumWidth,
                  shouldAcceptWidth: ({ currentWidth, nextWidth, wrapper }) =>
                    nextWidth <= currentWidth ||
                    wrapper.clientWidth - nextWidth >= THREAD_MAIN_CONTENT_MIN_WIDTH,
                  storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
                  onResize: setSidebarWidth,
                }}
                style={windowControlsInsetStyle}
              >
                {settingsPage ? (
                  <>
                    <SettingsSidebarNav pathname={pathname} />
                    <SidebarChromeFooter />
                  </>
                ) : (
                  <ThreadSidebar routeReveal={sidebarRouteReveal} />
                )}
                <SidebarRail onDoubleClick={resetSidebarWidth} />
                <SidebarRail titlebar />
              </Sidebar>
            )}
            {children}
            <BackgroundThreadAnnouncer />
            <SidebarControl />
            {isElectron ? <HistorySwipeNavigation /> : null}
            <WorkspaceGlobalChrome />
          </SidebarProvider>
        </div>
      </div>
    </PanelAnimationSuppressionProvider>
  );
}
