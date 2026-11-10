import {
  EnvironmentId,
  MessageId,
  ScheduledTaskId,
  ThreadId,
  type AssistantCitation,
} from "@t3tools/contracts";
import type { AnyRouter } from "@tanstack/react-router";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import {
  assistantCitationFromLocation,
  assistantCitationNavigation,
} from "../../lib/assistantCitationNavigation";
import {
  isAppModalPage,
  isAutomationsPage,
  isDesignPage,
  isSettingsPage,
  isTasksPage,
  startMainAppLocationTracking,
  useCloseAppModal,
  useNavigateToMainApp,
  workspaceSidebarMode,
} from "./mainAppLocation";

const THREAD_PATH = "/environment-one/thread-one";

const citation: AssistantCitation = {
  version: 1,
  environmentId: EnvironmentId.make("environment-one"),
  threadId: ThreadId.make("thread-one"),
  messageId: MessageId.make("assistant-one"),
  text: "quoted reply",
  start: 0,
  end: 12,
  prefix: "",
  suffix: "",
};

function ReturnControls() {
  const closeAppModal = useCloseAppModal();
  const navigateToMainApp = useNavigateToMainApp();
  return (
    <>
      <button type="button" onClick={() => void closeAppModal()}>
        Close modal
      </button>
      <button type="button" onClick={() => void navigateToMainApp()}>
        Back to app
      </button>
    </>
  );
}

// The tracker records on onResolved, which the router emits only once React commits the page.
async function settled(router: AnyRouter, navigation: Promise<void>) {
  await navigation;
  await vi.waitFor(() =>
    expect(router.state.resolvedLocation?.href).toBe(router.state.location.href),
  );
}

describe("main app return location", () => {
  it("keeps Settings and Automations in the workspace shell", () => {
    expect(isSettingsPage("/settings/general")).toBe(true);
    expect(isAutomationsPage("/automations")).toBe(true);
    expect(isDesignPage("/design")).toBe(true);
    expect(isTasksPage("/tasks")).toBe(true);
    expect(workspaceSidebarMode("/settings/general")).toBe("settings");
    expect(workspaceSidebarMode("/automations")).toBe("automations");
    expect(workspaceSidebarMode("/design")).toBe("design");
    expect(workspaceSidebarMode("/tasks")).toBe("tasks");
    expect(workspaceSidebarMode("/environment-one/thread-one")).toBe("thread");
    expect(isAppModalPage("/settings/general")).toBe(false);
    expect(isAppModalPage("/automations")).toBe(false);
    expect(isAppModalPage("/design")).toBe(false);
    expect(isAppModalPage("/tasks")).toBe(false);
    expect(isAppModalPage("/usage")).toBe(true);
  });

  it("returns to the thread without re-opening the quote source it was opened at", async () => {
    await using screen = await render(<ReturnControls />, { router: THREAD_PATH });
    const router = screen.router!;
    using _tracking = { [Symbol.dispose]: startMainAppLocationTracking(router) };

    const returnLocation = async (from: string, control: string) => {
      await settled(router, router.navigate(assistantCitationNavigation(citation)));
      expect(assistantCitationFromLocation(router.state.location.href)).toEqual(citation);
      await settled(router, router.navigate({ href: from }));
      await userEvent.click(screen.getByRole("button", { name: control }));
      await vi.waitFor(() => expect(router.state.location.pathname).toBe(THREAD_PATH));
      return router.state.location.href;
    };

    const closingUsage = await returnLocation("/usage", "Close modal");
    const sidebarBack = await returnLocation("/pull-requests", "Back to app");

    expect({ closingUsage, sidebarBack }).toEqual({
      closingUsage: THREAD_PATH,
      sidebarBack: THREAD_PATH,
    });
  });

  it("keeps Settings in the app shell and returns Usage to it", async () => {
    await using screen = await render(<ReturnControls />, { router: THREAD_PATH });
    const router = screen.router!;
    using _tracking = { [Symbol.dispose]: startMainAppLocationTracking(router) };

    await settled(router, router.navigate({ href: "/settings/general" }));
    expect(isSettingsPage(router.state.location.pathname)).toBe(true);
    expect(isAppModalPage(router.state.location.pathname)).toBe(false);

    await settled(router, router.navigate({ href: "/usage" }));
    await userEvent.click(screen.getByRole("button", { name: "Close modal" }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/settings/general"));
  });

  it("preserves automation scope for a scheduled-task return target", async () => {
    const environmentId = EnvironmentId.make("environment-one");
    const taskId = ScheduledTaskId.make("task-one");
    await using screen = await render(<ReturnControls />, {
      router: `/settings/scheduled-tasks?environmentId=${environmentId}&taskId=${taskId}&returnTo=automations`,
    });

    await userEvent.click(screen.getByRole("button", { name: "Close modal" }));
    await vi.waitFor(() => expect(screen.router!.state.location.pathname).toBe("/automations"));
    expect(screen.router!.state.location.search).toEqual({ environmentId, taskId });
  });
});
