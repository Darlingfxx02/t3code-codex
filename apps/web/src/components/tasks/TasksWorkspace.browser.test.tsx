import { EnvironmentId, ProjectId, type TaskWorkspaceSnapshot, type TaskWorkspaceTask } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import "~/index.css";
import { render } from "../../../test/render";
import { TasksWorkspace } from "./TasksWorkspace";

const environmentId = EnvironmentId.make("laptop");
const projectId = ProjectId.make("project");
const taskId = `${environmentId}:${projectId}:NEUROKEY-1`;
const issue = {
  key: "NEUROKEY-1",
  summary: "Add the task workspace",
  description: "Show the source task and generated results.",
  browseUrl: "https://jira.example.test/browse/NEUROKEY-1",
  status: { name: "In progress", category: "In Progress", color: "blue" },
  assignee: "Designer",
  assigneeId: "designer",
  priority: "High",
  sprint: null,
  createdAt: "2026-11-10T08:00:00.000Z",
  updatedAt: "2026-11-10T08:30:00.000Z",
  attachments: [
    {
      id: "attachment-1",
      name: "mock.png",
      url: "https://jira.example.test/secure/attachment/attachment-1/mock.png",
      mimeType: "image/png",
    },
  ],
  comments: [],
  sourceRevision: "2026-11-10T08:30:00.000+0300",
} as const;
const task: TaskWorkspaceTask = {
  id: taskId,
  environmentId,
  projectId,
  issue,
  draft: null,
  scenario: {
    id: "review",
    name: "Independent variants and checks",
    stages: [
      {
        id: "variants",
        name: "Generate variants",
        kind: "agent",
        dependsOn: [],
        parallel: true,
        provider: null,
        model: null,
        skills: [],
        connectors: [],
        command: null,
        required: true,
        rules: [],
        prompt: "Implement the task.",
        timeoutMs: 60_000,
      },
    ],
    maxVariants: 2,
    maxRetries: 1,
    enabled: true,
    autoStart: false,
    revision: 0,
    selectedVariantIds: [],
  },
  run: null,
  comments: [],
  artifacts: [],
  publishes: [],
  createdAt: issue.createdAt,
  updatedAt: issue.updatedAt,
};
const snapshot: TaskWorkspaceSnapshot = {
  revision: 1,
  configured: true,
  connection: {
    configured: true,
    url: "https://jira.example.test",
    username: null,
    secretConfigured: true,
    projectKeys: ["NEUROKEY"],
    secretRef: null,
  },
  assignee: null,
  sprints: [],
  tasks: [task],
  lastSyncedAt: issue.updatedAt,
  error: null,
};
const queryState = { refresh: vi.fn() };
const atomState = { canOperate: true };

vi.mock(import("@tanstack/react-router"), async (original) => ({
  ...(await original()),
  useNavigate: () => vi.fn(),
  Link: (({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) => (
    <a {...props}>{children}</a>
  )) as never,
}));
vi.mock(import("@effect/atom-react"), async (original) => ({
  ...(await original()),
  useAtomValue: () => atomState.canOperate,
}));
vi.mock("../../state/environments", () => ({
  useEnvironments: () => ({
    environments: [
      {
        environmentId,
        label: "Laptop",
        connection: { phase: "connected" },
        serverConfig: {},
      },
    ],
  }),
  usePrimaryEnvironmentId: () => environmentId,
  usePullRequestsSupported: () => false,
}));
vi.mock("../../state/entities", () => ({
  useProjects: () => [
    {
      environmentId,
      id: projectId,
      title: "Neurokey",
      workspaceRoot: "/workspace/project",
    },
  ],
}));
vi.mock("../../state/query", () => ({
  useEnvironmentQuery: () => ({
    data: snapshot,
    error: null,
    isPending: false,
    refresh: queryState.refresh,
  }),
}));
vi.mock("../../state/taskWorkspace", () => ({
  taskWorkspaceRead: vi.fn(() => null),
  taskWorkspaceCommand: {
    permissionAtom: () => "task-workspace-permission",
  },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => vi.fn().mockResolvedValue({ _tag: "Success" }),
}));
vi.mock(import("../sidebar/SidebarUpdatePill"), () => ({
  SidebarUpdatePill: () => <span aria-hidden="true" />,
}));

it("renders the selected task source, scenario and results panes", async () => {
  await using screen = await render(
    <TasksWorkspace target={{ environmentId, projectId, taskId }} />,
    { router: false },
  );

  await expect
    .element(screen.getByRole("heading", { level: 1, name: "Add the task workspace" }))
    .toBeInTheDocument();
  await expect.element(screen.getByText("Original task", { exact: true })).toBeInTheDocument();
  await expect.element(screen.getByRole("link", { name: "mock.png" })).toBeInTheDocument();
  await expect
    .element(screen.getByRole("list", { name: "Processing stages" }))
    .toBeInTheDocument();
  await expect.element(screen.getByText("Generated results", { exact: true })).toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "Run scenario" })).toBeInTheDocument();
});

it("gates task mutations when the environment is read-only", async () => {
  atomState.canOperate = false;
  await using screen = await render(
    <TasksWorkspace target={{ environmentId, projectId, taskId }} />,
    { router: false },
  );

  await expect.element(screen.getByRole("button", { name: "Configure scenario" })).toBeDisabled();
  await expect.element(screen.getByRole("button", { name: "Run scenario" })).toBeDisabled();
  atomState.canOperate = true;
});

it("keeps the task list reachable on a narrow viewport", async () => {
  await page.viewport(375, 812);
  await using screen = await render(<TasksWorkspace target={{ environmentId, projectId }} />, {
    router: false,
  });

  await expect.element(screen.getByRole("heading", { name: "Tasks" })).toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: /Add the task workspace/ })).toBeVisible();
  await expect
    .element(screen.getByText("Select a task to inspect its source and processing scenario.", { exact: true }))
    .not.toBeVisible();
});
