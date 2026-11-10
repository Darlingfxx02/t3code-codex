import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ScheduledTaskId,
  ThreadId,
  type ScheduledTask,
} from "@t3tools/contracts";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../test/render";
import { AutomationsWorkspace } from "./AutomationsWorkspace";

const environmentId = EnvironmentId.make("laptop");
const projectId = ProjectId.make("project");
const task: ScheduledTask = {
  id: ScheduledTaskId.make("daily-review"),
  title: "Daily review",
  prompt: "Review the latest changes.",
  enabled: true,
  schedule: { type: "fixed_time", timeOfDay: "09:00", weekdays: [1, 2, 3, 4, 5] },
  projectId,
  threadId: null,
  workspaceStrategy: { type: "root" },
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-6.1-sol" },
  runtimeMode: "full-access",
  interactionMode: "default",
  createdBy: "user",
  creationSource: "web",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  nextRunAt: "2026-01-02T09:00:00.000Z",
  lastRunAt: null,
  lastRunStatus: "never",
  lastRunError: null,
  runCount: 0,
};
const blockedTask: ScheduledTask = {
  ...task,
  id: ScheduledTaskId.make("blocked-review"),
  title: "Blocked review",
  blockedByPolicy: "Blocked by policy",
};
const boundTask: ScheduledTask = {
  ...task,
  id: ScheduledTaskId.make("bound-review"),
  title: "Bound review",
  threadId: ThreadId.make("bound-thread"),
};
const atomState = { canOperate: true };
const queryState = { refresh: vi.fn() };
const environmentState = {
  entries: [
    {
      environmentId,
      label: "Laptop",
      connection: { phase: "connected" },
      serverConfig: { environment: { capabilities: { oneTimeSchedules: true } } },
    },
  ] as Array<Record<string, unknown>>,
};
const setup = () => {
  atomState.canOperate = true;
  queryState.refresh.mockReset();
  environmentState.entries = [
    {
      environmentId,
      label: "Laptop",
      connection: { phase: "connected" },
      serverConfig: { environment: { capabilities: { oneTimeSchedules: true } } },
    },
  ];
};
const primaryEnvironment = () => {
  return environmentState.entries.find((entry) => entry.environmentId === environmentId);
};
async function desktopViewport() {
  const previous = { width: window.innerWidth, height: window.innerHeight };
  await page.viewport(1280, 800);
  return {
    async [Symbol.asyncDispose]() {
      await page.viewport(previous.width, previous.height);
    },
  };
}

vi.mock(import("@tanstack/react-router"), async (original) => ({
  ...(await original()),
  useNavigate: () => vi.fn(),
  Link: (({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <a {...props}>{children}</a>
  )) as never,
  useLocation: (({
    select,
  }: {
    select?: (location: { search: Record<string, never> }) => unknown;
  }) => (select ? select({ search: {} }) : {})) as never,
}));
vi.mock(import("@effect/atom-react"), async (original) => ({
  ...(await original()),
  useAtomValue: () => atomState.canOperate,
}));
vi.mock(import("../state/environments"), async (original) => ({
  ...(await original()),
  useEnvironments: (() => ({ environments: environmentState.entries })) as never,
  usePrimaryEnvironmentId: () =>
    (primaryEnvironment()?.environmentId as EnvironmentId | undefined) ?? null,
}));
vi.mock(import("../state/query"), async (original) => ({
  ...(await original()),
  useEnvironmentQuery: (() => ({
    data: { tasks: [task, blockedTask, boundTask] },
    error: null,
    isPending: false,
    dataUpdatedAt: 1,
    refresh: queryState.refresh,
  })) as never,
}));
vi.mock(import("../state/session"), async (original) => ({
  ...(await original()),
  readEnvironmentScope: () => true,
}));
vi.mock(import("../state/use-atom-command"), async (original) => ({
  ...(await original()),
  useAtomCommand: () => vi.fn().mockResolvedValue({ _tag: "Success" }),
}));
function WorkspaceHarness({ target }: Parameters<typeof AutomationsWorkspace>[0]) {
  return (
    <>
      <header aria-label="Workspace header">
        <div data-automation-chrome-title="" />
      </header>
      <AutomationsWorkspace target={target} />
    </>
  );
}

it("opens a selected automation with its prompt and schedule actions", async () => {
  setup();
  await using _viewport = await desktopViewport();
  await using screen = await render(
    <WorkspaceHarness target={{ environmentId }} />,
    // Navigation and links are mocked; this test only verifies the isolated workspace UI.
    { router: false },
  );

  await expect
    .element(page.getByRole("banner").getByRole("heading", { name: "Daily review" }))
    .toBeInTheDocument();
  await expect.element(page.getByText("Automation prompt", { exact: true })).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Run now" })).toBeInTheDocument();
  await screen.rerender(<WorkspaceHarness target={{ environmentId, taskId: blockedTask.id }} />);
  await expect
    .element(page.getByRole("banner").getByRole("heading", { name: "Blocked review" }))
    .toBeInTheDocument();
  await expect.element(page.getByRole("heading", { name: "Daily review" })).not.toBeInTheDocument();
  await screen.rerender(
    <WorkspaceHarness target={{ environmentId, taskId: ScheduledTaskId.make("unavailable") }} />,
  );
  await expect.element(page.getByRole("banner").getByRole("heading")).not.toBeInTheDocument();
});

it("disables Run now for a policy-blocked automation", async () => {
  setup();
  await using _viewport = await desktopViewport();
  await using _screen = await render(
    <WorkspaceHarness target={{ environmentId, taskId: blockedTask.id }} />,
    // Navigation and links are mocked; this test only verifies the isolated workspace UI.
    { router: false },
  );

  await expect.element(page.getByRole("heading", { name: "Blocked review" })).toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "Run now" })).toBeDisabled();
});

it("keeps refresh available after requesting a snapshot", async () => {
  setup();
  await using _viewport = await desktopViewport();
  await using _screen = await render(<WorkspaceHarness target={{ environmentId }} />, {
    router: false,
  });

  const refresh = page.getByRole("button", { name: "Refresh automations" });
  await refresh.click();
  expect(queryState.refresh).toHaveBeenCalledTimes(1);
  await expect.element(refresh).toBeEnabled();
});

it("keeps the primary environment selected while it reconnects", async () => {
  setup();
  await using _viewport = await desktopViewport();
  environmentState.entries = [
    {
      environmentId,
      label: "Laptop",
      connection: { phase: "reconnecting" },
      serverConfig: null,
    },
    {
      environmentId: EnvironmentId.make("remote"),
      label: "Remote",
      connection: { phase: "connected" },
      serverConfig: { environment: { capabilities: { oneTimeSchedules: true } } },
    },
  ];

  await using _screen = await render(<WorkspaceHarness target={{}} />, { router: false });
  await expect
    .element(page.getByRole("main", { name: "Automations" }).getByText("Connecting environment…"))
    .toBeInTheDocument();
});

it("renders the bound thread link for a linked automation", async () => {
  setup();
  await using _viewport = await desktopViewport();
  await using _screen = await render(
    <WorkspaceHarness target={{ environmentId, taskId: boundTask.id }} />,
    // Navigation and links are mocked; this test only verifies the isolated workspace UI.
    { router: false },
  );

  await expect.element(page.getByText("Open thread", { exact: true })).toBeInTheDocument();
});

it("disables automation mutations without operate permission", async () => {
  setup();
  await using _viewport = await desktopViewport();
  atomState.canOperate = false;
  await using _screen = await render(
    <WorkspaceHarness target={{ environmentId, taskId: task.id }} />,
    { router: false },
  );

  await expect.element(page.getByRole("button", { name: "Edit" })).toBeDisabled();
  await expect.element(page.getByRole("button", { name: "Run now" })).toBeDisabled();
  await expect.element(page.getByRole("button", { name: "New automation" })).toBeDisabled();
  await expect
    .element(page.getByRole("switch", { name: "Toggle Daily review automation" }))
    .toBeDisabled();
});
