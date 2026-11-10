import { EnvironmentId, ThreadId, ScheduledTaskId, type ScheduledTask } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";

const state = vi.hoisted(() => ({ allowed: true, toggle: vi.fn(), run: vi.fn() }));
vi.mock(import("../../state/session"), async (importOriginal) => ({
  ...(await importOriginal()),
  useEnvironmentScope: () => state.allowed,
  readEnvironmentScope: () => state.allowed,
}));
vi.mock(import("@effect/atom-react"), async (importOriginal) => ({
  ...(await importOriginal()),
  useAtomValue: (() => state.allowed) as never,
}));
vi.mock(import("@tanstack/react-router"), async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => vi.fn(),
}));
vi.mock(import("../../state/use-atom-command"), async (importOriginal) => {
  const { serverEnvironment } = await import("../../state/server");
  return {
    ...(await importOriginal()),
    useAtomCommand: ((command: unknown) =>
      command === serverEnvironment.setScheduledTaskEnabled ? state.toggle : state.run) as never,
  };
});
vi.mock(import("../../state/query"), async (importOriginal) => ({
  ...(await importOriginal()),
  useEnvironmentQuery: (() => ({
    data: { tasks: [{ ...task, ...taskState }] },
    error: null,
  })) as never,
}));

import { act, render as renderUi } from "../../../test/render";
import { ThreadAutomationsPanel } from "./ThreadAutomationsPanel";
const environmentId = EnvironmentId.make("remote");
const threadId = ThreadId.make("thread");
const task = {
  id: ScheduledTaskId.make("task"),
  threadId,
  title: "Daily review",
  enabled: true,
  schedule: { type: "interval", everyMs: 60000 },
  lastRunStatus: "never",
} as ScheduledTask;
const taskState: {
  blockedByPolicy: string | undefined;
  lastRunStatus: ScheduledTask["lastRunStatus"];
} = { blockedByPolicy: undefined, lastRunStatus: "never" };

async function setup() {
  state.allowed = true;
  taskState.blockedByPolicy = undefined;
  taskState.lastRunStatus = "never";
  state.toggle.mockReset().mockResolvedValue({ _tag: "Success" });
  state.run.mockReset().mockResolvedValue({ _tag: "Success" });

  await using stack = new AsyncDisposableStack();
  const screen = stack.use(await renderUi(null));
  const container = screen.container;
  async function renderPanel() {
    await act(
      async () =>
        await screen.rerender(
          <ThreadAutomationsPanel environmentId={environmentId} threadId={threadId} />,
        ),
    );
  }

  const byLabel = (label: string) =>
    container.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;

  const environment = stack.move();
  return { renderPanel, byLabel, [Symbol.asyncDispose]: () => environment.disposeAsync() };
}
it.each([true, false])("runs scheduled work only with task permission (%s)", async (allowed) => {
  await using fixture = await setup();
  const { renderPanel, byLabel } = fixture;
  state.allowed = allowed;
  await renderPanel();
  await act(async () => byLabel("Run Daily review now").click());
  expect(state.run).toHaveBeenCalledTimes(allowed ? 1 : 0);
});

it("rejects a retained toggle after task permission is revoked", async () => {
  await using fixture = await setup();
  const { renderPanel, byLabel } = fixture;
  await renderPanel();
  state.allowed = false;
  await act(async () => byLabel("Toggle Daily review automation").click());
  expect(state.toggle).not.toHaveBeenCalled();

  state.allowed = true;
  await act(async () => byLabel("Toggle Daily review automation").click());
  expect(state.toggle).toHaveBeenCalledOnce();
});

it("allows pausing blocked or running automations", async () => {
  await using fixture = await setup();
  const { renderPanel, byLabel } = fixture;
  taskState.blockedByPolicy = "Blocked by policy";
  taskState.lastRunStatus = "running";
  await renderPanel();
  await act(async () => byLabel("Toggle Daily review automation").click());
  expect(state.toggle).toHaveBeenCalledOnce();
});

it.each(["blocked", "running"] as const)("does not run a %s automation", async (status) => {
  await using fixture = await setup();
  const { renderPanel, byLabel } = fixture;
  if (status === "blocked") taskState.blockedByPolicy = "Blocked by policy";
  taskState.lastRunStatus = status === "running" ? "running" : "never";
  await renderPanel();
  await act(async () => byLabel("Run Daily review now").click());
  expect(state.run).not.toHaveBeenCalled();
});
