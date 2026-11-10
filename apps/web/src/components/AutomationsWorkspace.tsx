import { Link, useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import {
  ArrowLeftIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  Clock3Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  RefreshCwIcon,
  Settings2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { EnvironmentId, ScheduledTask, ScheduledTaskId } from "@t3tools/contracts";
import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { webhookAddress } from "@t3tools/client-runtime/webhook-address";

import { cn } from "../lib/utils";
import { workspaceAreaProps } from "../lib/workspaceFocus";
import {
  useEnvironmentHttpBaseUrl,
  useEnvironments,
  usePrimaryEnvironmentId,
} from "../state/environments";
import { useEnvironmentQuery } from "../state/query";
import { serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import { readEnvironmentScope } from "../state/session";
import { useCopyToClipboard } from "../hooks/useCopyToClipboard";
import { ScheduledRelativeLabel } from "./scheduledTaskPresentation";
import {
  scheduleLabel,
  scheduledTaskRunStatusLabel,
  scheduledTaskStatusVariant,
  validateScheduledTasksSearch,
} from "./settings/scheduledTasksSettings.logic";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";
import { Switch } from "./ui/switch";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "./ui/select";
import { stackedThreadToast, toastManager } from "./ui/toast";

export type AutomationsSearch = ReturnType<typeof validateScheduledTasksSearch>;

function AutomationWorkspaceTitle({
  title,
  mobileDetailOpen,
}: {
  title: string | undefined;
  mobileDetailOpen: boolean;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- The app shell owns the title slot and mounts beside this workspace.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- The external portal target is available after mount.
    setTarget(document.querySelector<HTMLElement>("[data-automation-chrome-title]"));
  }, []);
  return target && title
    ? createPortal(
        <h1 className={cn("truncate font-normal", !mobileDetailOpen && "max-md:hidden")}>
          {title}
        </h1>,
        target,
      )
    : null;
}

const NEXT_RUN_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function taskStatus(task: ScheduledTask) {
  if (task.blockedByPolicy) return task.blockedByPolicy;
  if (!task.enabled) return "Paused";
  if (task.lastRunStatus === "running") return "Running now";
  if (task.lastRunStatus === "failed") return "Failed";
  if (task.schedule.type === "webhook") return "Listening";
  if (task.schedule.type === "once" && task.lastRunStatus === "succeeded" && !task.nextRunAt)
    return "Done";
  if (task.nextRunAt) return `Next ${formatNextRun(task.nextRunAt)}`;
  return "Not scheduled";
}

function formatNextRun(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "soon";
  return NEXT_RUN_FORMATTER.format(date);
}

function isEnvironmentConnecting(environment: {
  readonly connection: { readonly phase: string };
  readonly serverConfig: unknown;
}) {
  return (
    environment.connection.phase === "connecting" ||
    environment.connection.phase === "reconnecting" ||
    (environment.connection.phase === "connected" && environment.serverConfig === null)
  );
}

function statusTone(task: ScheduledTask) {
  if (task.blockedByPolicy || task.lastRunStatus === "failed") return "error" as const;
  if (!task.enabled) return "muted" as const;
  if (task.lastRunStatus === "succeeded") return "success" as const;
  if (task.lastRunStatus === "running") return "info" as const;
  return "muted" as const;
}

function StatusDot({ task }: { task: ScheduledTask }) {
  const tone = statusTone(task);
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        tone === "error" && "bg-destructive",
        tone === "success" && "bg-success",
        tone === "info" && "bg-info",
        tone === "muted" && (task.enabled ? "bg-muted-foreground/50" : "bg-muted-foreground/25"),
      )}
    />
  );
}

function EmptyAutomationState({
  onCreate,
  canCreate,
}: {
  onCreate: () => void;
  canCreate: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-10 max-md:hidden">
      <div className="flex max-w-md flex-col items-center text-center">
        <span className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-border/70 bg-muted/35 text-muted-foreground">
          <CalendarClockIcon className="size-6" />
        </span>
        <h2 className="text-lg font-semibold tracking-tight">Schedule your next task</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Create an automation once and keep its schedule and runs together.
        </p>
        <Button
          className="mt-5"
          size="sm"
          disabled={!canCreate}
          title={!canCreate ? "You do not have permission to create automations." : undefined}
          onClick={onCreate}
        >
          <PlusIcon />
          New automation
        </Button>
      </div>
    </div>
  );
}

function LoadingAutomationState() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
      Loading automations…
    </div>
  );
}

function AutomationScheduleCard({
  task,
  environmentId,
}: {
  task: ScheduledTask;
  environmentId: EnvironmentId;
}) {
  const { copyToClipboard } = useCopyToClipboard({ target: "webhook URL" });
  const webhook = task.webhook;
  const httpBaseUrl = useEnvironmentHttpBaseUrl(environmentId);
  const webhookResult = webhook ? webhookAddress(webhook, httpBaseUrl) : null;
  const webhookUrl = webhookResult?.address ?? null;
  return (
    <section className="mx-auto mb-4 w-full max-w-(--chat-content-max-width) rounded-2xl border border-border/70 bg-muted/25 p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background text-muted-foreground shadow-xs ring-1 ring-border/60">
          <Clock3Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {!task.enabled
              ? "Automation paused"
              : task.schedule.type === "webhook"
                ? "Webhook automation"
                : task.schedule.type === "once" && task.lastRunStatus === "succeeded"
                  ? "Automation complete"
                  : "Automation scheduled"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {scheduleLabel(task.schedule)}
            {task.enabled && task.nextRunAt ? (
              <>
                {" · "}
                <ScheduledRelativeLabel value={task.nextRunAt} />
              </>
            ) : task.enabled ? null : (
              " · paused"
            )}
          </p>
        </div>
        {task.lastRunStatus !== "never" ? (
          <Badge variant={scheduledTaskStatusVariant(task.lastRunStatus)}>
            {scheduledTaskRunStatusLabel(task.lastRunStatus)}
          </Badge>
        ) : null}
      </div>
      {task.lastRunError ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 wrap-anywhere">{task.lastRunError}</span>
        </div>
      ) : null}
      {webhookUrl ? (
        <>
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
            <code className="min-w-0 flex-1 truncate text-2xs text-muted-foreground">
              {webhookUrl}
            </code>
            <Button
              size="xs"
              variant="ghost-muted"
              disabled={webhookResult?.copyable !== true}
              title={webhookResult?.note ?? undefined}
              onClick={() => copyToClipboard(webhookUrl)}
            >
              Copy URL
            </Button>
          </div>
          {webhookResult?.note ? (
            <p className="mt-2 text-xs text-muted-foreground">{webhookResult.note}</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function AutomationListRow({
  task,
  selected,
  onSelect,
  onEdit,
  onRun,
  onToggle,
  canOperate,
  busy,
}: {
  task: ScheduledTask;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onRun: () => void;
  onToggle: (enabled: boolean) => void;
  canOperate: boolean;
  busy: boolean;
}) {
  return (
    <li>
      <div
        className={cn(
          "group flex min-h-16 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
          selected
            ? "bg-sidebar-row-selected text-sidebar-foreground"
            : "hover:bg-sidebar-row-hover",
        )}
      >
        <button
          type="button"
          aria-pressed={selected}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={onSelect}
        >
          <StatusDot task={task} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{task.title}</span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {scheduleLabel(task.schedule)} · {taskStatus(task)}
            </span>
          </span>
        </button>
        <Switch
          checked={task.enabled}
          disabled={busy || !canOperate}
          aria-label={`Toggle ${task.title} automation`}
          title={
            !canOperate
              ? "You do not have permission to change automations."
              : busy
                ? "Another automation update is in progress."
                : undefined
          }
          onCheckedChange={onToggle}
        />
        <Menu>
          <MenuTrigger
            render={
              <Button size="icon-sm" variant="ghost" aria-label={`Actions for ${task.title}`} />
            }
          >
            <MoreHorizontalIcon />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem disabled={busy || !canOperate} onClick={onEdit}>
              <PencilIcon />
              Edit automation
            </MenuItem>
            {task.schedule.type === "webhook" ? null : (
              <MenuItem
                disabled={
                  busy ||
                  !canOperate ||
                  Boolean(task.blockedByPolicy) ||
                  task.lastRunStatus === "running"
                }
                onClick={onRun}
              >
                <PlayIcon />
                Run now
              </MenuItem>
            )}
          </MenuPopup>
        </Menu>
      </div>
    </li>
  );
}

function AutomationSidebar({
  tasks,
  environmentId,
  selectedTaskId,
  returnTaskId,
  onSelect,
  onCreate,
  onEdit,
  onRun,
  onToggle,
  canOperate,
  busyTaskId,
  mobileDetailOpen,
  onRefresh,
  loading,
  error,
  environmentState,
}: {
  tasks: ReadonlyArray<ScheduledTask>;
  environmentId: EnvironmentId | undefined;
  selectedTaskId: ScheduledTaskId | undefined;
  returnTaskId: ScheduledTaskId | undefined;
  onSelect: (task: ScheduledTask) => void;
  onCreate: () => void;
  onEdit: (task: ScheduledTask) => void;
  onRun: (task: ScheduledTask) => void;
  onToggle: (task: ScheduledTask, enabled: boolean) => void;
  canOperate: boolean;
  busyTaskId: ScheduledTaskId | null;
  mobileDetailOpen: boolean;
  onRefresh: () => void;
  loading: boolean;
  error: string | null;
  environmentState: "ready" | "connecting" | "unavailable";
}) {
  const active = tasks.filter((task) => task.enabled);
  const paused = tasks.filter((task) => !task.enabled);
  const list = (title: string, entries: ReadonlyArray<ScheduledTask>) =>
    entries.length === 0 ? null : (
      <section className="space-y-1.5">
        <h2
          id={`automation-group-${title.toLowerCase()}`}
          className="flex items-center gap-2 px-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <span>{title}</span>
          <span className="tabular-nums">{entries.length}</span>
        </h2>
        <ul className="space-y-0.5" aria-labelledby={`automation-group-${title.toLowerCase()}`}>
          {entries.map((task) => (
            <AutomationListRow
              key={task.id}
              task={task}
              selected={task.id === selectedTaskId}
              onSelect={() => onSelect(task)}
              onEdit={() => onEdit(task)}
              onRun={() => onRun(task)}
              onToggle={(enabled) => onToggle(task, enabled)}
              canOperate={canOperate}
              busy={busyTaskId !== null}
            />
          ))}
        </ul>
      </section>
    );
  return (
    <aside
      {...workspaceAreaProps("automations-sidebar", 0, "Automations list")}
      className={cn(
        "flex min-h-0 w-(--automations-sidebar-width) shrink-0 flex-col border-r border-border/70 bg-sidebar text-sidebar-foreground max-md:w-full max-md:flex-1",
        mobileDetailOpen && "max-md:hidden",
      )}
    >
      <div className="border-b border-sidebar-border/70 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 truncate text-base font-semibold tracking-tight">Automations</h2>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Refresh automations"
              disabled={environmentId === undefined || environmentState !== "ready"}
              onClick={onRefresh}
            >
              <RefreshCwIcon className={cn(loading && "opacity-50")} />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Automation settings"
              render={
                <Link
                  to="/settings/scheduled-tasks"
                  search={
                    environmentId
                      ? {
                          environmentId,
                          returnTo: "automations",
                          returnEnvironmentId: environmentId,
                          ...(returnTaskId ? { returnTaskId } : {}),
                        }
                      : { returnTo: "automations" }
                  }
                />
              }
            >
              <Settings2Icon />
            </Button>
          </div>
        </div>
        <Button
          className="mt-3 w-full justify-center"
          size="sm"
          disabled={!canOperate || environmentId === undefined}
          title={!canOperate ? "You do not have permission to manage automations." : undefined}
          onClick={onCreate}
        >
          <PlusIcon />
          New automation
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3">
        {environmentState === "connecting" ? (
          <p
            className="px-3 py-6 text-center text-xs leading-5 text-muted-foreground"
            role="status"
          >
            Connecting environment…
          </p>
        ) : environmentState === "unavailable" ? (
          <p className="px-3 py-6 text-center text-xs leading-5 text-muted-foreground">
            This environment is unavailable.
          </p>
        ) : loading && tasks.length === 0 ? (
          <p
            className="px-3 py-6 text-center text-xs leading-5 text-muted-foreground"
            role="status"
          >
            Loading automations…
          </p>
        ) : error ? (
          <div
            className="flex flex-col items-center gap-2 px-3 py-6 text-center text-xs text-destructive"
            role="alert"
          >
            <p>Unable to load automations.</p>
            <Button size="xs" variant="outline" onClick={onRefresh}>
              Retry
            </Button>
          </div>
        ) : environmentId === undefined ? (
          <p className="px-3 py-6 text-center text-xs leading-5 text-muted-foreground">
            Connect an environment to manage automations.
          </p>
        ) : (
          <>
            {list("Active", active)}
            {list("Paused", paused)}
          </>
        )}
        {environmentState === "ready" &&
        environmentId !== undefined &&
        !loading &&
        !error &&
        tasks.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs leading-5 text-muted-foreground">
            No automations yet.
          </p>
        ) : null}
      </div>
    </aside>
  );
}

function AutomationPreview({
  task,
  environmentId,
}: {
  task: ScheduledTask;
  environmentId: EnvironmentId;
}) {
  return (
    <div className="scrollbar-gutter-both flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-8">
      <div className="mx-auto flex w-full max-w-(--chat-content-max-width) flex-1 flex-col justify-center gap-5">
        {task.blockedByPolicy ? (
          <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-foreground">
            Blocked by policy: {task.blockedByPolicy}
          </div>
        ) : task.lastRunStatus === "running" ? (
          <div className="rounded-xl border border-info/30 bg-info/10 px-3 py-2 text-xs text-info-foreground">
            This automation is running now.
          </div>
        ) : null}
        <div className="flex justify-end">
          <div className="max-w-[min(80%,44rem)] rounded-2xl bg-message px-4 py-3 text-sm leading-6 text-message-foreground shadow-xs">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-message-foreground/80">
              Automation prompt
            </p>
            <p className="whitespace-pre-wrap wrap-anywhere">{task.prompt}</p>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          {task.lastRunStatus === "succeeded" ? (
            <CheckCircle2Icon className="size-4 text-success" />
          ) : null}
          {task.lastRunStatus === "failed" ? (
            <TriangleAlertIcon className="size-4 text-destructive" />
          ) : null}
          <span>
            {task.runCount === 0
              ? "This automation has not run yet."
              : `${task.runCount} ${task.runCount === 1 ? "run" : "runs"} recorded.`}
          </span>
        </div>
        <AutomationScheduleCard task={task} environmentId={environmentId} />
        {task.threadId ? (
          <Link
            className="self-center text-xs font-medium text-primary underline-offset-4 hover:underline"
            to="/$environmentId/$threadId"
            params={{ environmentId, threadId: task.threadId }}
          >
            Open thread
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function AutomationMain({
  task,
  environmentId,
}: {
  task: ScheduledTask;
  environmentId: EnvironmentId;
}) {
  return <AutomationPreview task={task} environmentId={environmentId} />;
}

export function AutomationsWorkspace({ target }: { target: AutomationsSearch }) {
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const connected = environments.filter(
    (environment) =>
      environment.connection.phase === "connected" && environment.serverConfig !== null,
  );
  const fallbackEnvironment = environments.find(isEnvironmentConnecting);
  const requestedEnvironmentRecord = target.environmentId
    ? environments.find((entry) => entry.environmentId === target.environmentId)
    : undefined;
  const requestedEnvironment = requestedEnvironmentRecord
    ? connected.find((entry) => entry.environmentId === requestedEnvironmentRecord.environmentId)
    : undefined;
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const primaryEnvironment = primaryEnvironmentId
    ? environments.find((entry) => entry.environmentId === primaryEnvironmentId)
    : undefined;
  const primaryEnvironmentConnecting =
    primaryEnvironment !== undefined && isEnvironmentConnecting(primaryEnvironment);
  const connectedEnvironmentId =
    requestedEnvironment?.environmentId ??
    (primaryEnvironmentConnecting ? primaryEnvironment?.environmentId : undefined) ??
    connected.find((entry) => entry.environmentId === primaryEnvironmentId)?.environmentId ??
    connected[0]?.environmentId ??
    fallbackEnvironment?.environmentId;
  const requestedEnvironmentConnecting =
    target.environmentId !== undefined
      ? environments.some(
          (entry) => entry.environmentId === target.environmentId && isEnvironmentConnecting(entry),
        )
      : primaryEnvironmentConnecting ||
        (connected.length === 0 && fallbackEnvironment !== undefined);
  const activeEnvironment =
    connected.find((entry) => entry.environmentId === connectedEnvironmentId) ?? null;
  const requestedEnvironmentUnavailable =
    target.environmentId !== undefined &&
    requestedEnvironment === undefined &&
    !requestedEnvironmentConnecting;
  const environmentId =
    requestedEnvironmentUnavailable || requestedEnvironmentConnecting
      ? undefined
      : connectedEnvironmentId;
  const environmentState = requestedEnvironmentConnecting
    ? "connecting"
    : requestedEnvironmentUnavailable
      ? "unavailable"
      : "ready";
  const tasksQuery = useEnvironmentQuery(
    environmentId && !requestedEnvironmentUnavailable
      ? serverEnvironment.scheduledTasksLive({ environmentId, input: {} })
      : null,
  );
  const tasks = tasksQuery.data?.tasks ?? [];
  const [busyTaskId, setBusyTaskId] = useState<ScheduledTaskId | null>(null);
  const [busyAction, setBusyAction] = useState<"toggle" | "run" | null>(null);
  const requestedTask =
    target.taskId === undefined ? undefined : tasks.find((task) => task.id === target.taskId);
  const selectedTask =
    requestedTask ??
    (target.taskId === undefined ? (tasks.find((task) => task.enabled) ?? tasks[0] ?? null) : null);
  const loading = tasksQuery.data === null && tasksQuery.isPending;
  const canOperate = useAtomValue(
    serverEnvironment.upsertScheduledTask.permissionAtom(environmentId ?? ("" as EnvironmentId)),
  );
  const setEnabled = useAtomCommand(serverEnvironment.setScheduledTaskEnabled, {
    label: "automation toggle",
  });
  const runNow = useAtomCommand(serverEnvironment.runScheduledTaskNow, {
    label: "automation run now",
  });
  const refresh = () => {
    if (environmentId === undefined || environmentState !== "ready") return;
    tasksQuery.refresh();
    toastManager.add({ type: "info", title: "Automation refresh requested" });
  };

  const reportFailure = (message: string) => {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: "Could not update automation",
        description: message,
      }),
    );
  };

  const toggle = async (task: ScheduledTask, enabled: boolean) => {
    if (
      !environmentId ||
      busyTaskId !== null ||
      !canOperate ||
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)
    )
      return;
    setBusyTaskId(task.id);
    setBusyAction("toggle");
    const result = await setEnabled({ environmentId, input: { id: task.id, enabled } }).catch(
      (error: unknown) => {
        reportFailure(String(error));
        return null;
      },
    );
    if (result?._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure(String(squashAtomCommandFailure(result)));
    }
    setBusyTaskId(null);
    setBusyAction(null);
  };

  const run = async (task: ScheduledTask) => {
    if (
      !environmentId ||
      busyTaskId !== null ||
      !canOperate ||
      task.blockedByPolicy ||
      task.lastRunStatus === "running" ||
      !readEnvironmentScope(environmentId, AuthOrchestrationOperateScope)
    )
      return;
    setBusyTaskId(task.id);
    setBusyAction("run");
    const result = await runNow({ environmentId, input: { id: task.id } }).catch(
      (error: unknown) => {
        reportFailure(String(error));
        return null;
      },
    );
    if (result?._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      reportFailure(String(squashAtomCommandFailure(result)));
    } else if (result?._tag === "Success") {
      toastManager.add({ type: "success", title: "Automation queued" });
    }
    setBusyTaskId(null);
    setBusyAction(null);
  };

  const openEditor = (task?: ScheduledTask) => {
    if (!environmentId) return;
    void navigate({
      to: "/settings/scheduled-tasks",
      search: task
        ? {
            environmentId,
            taskId: task.id,
            returnTo: "automations",
            returnEnvironmentId: environmentId,
            returnTaskId: task.id,
          }
        : {
            environmentId,
            create: true,
            returnTo: "automations",
            returnEnvironmentId: environmentId,
            ...(target.taskId ? { returnTaskId: target.taskId } : {}),
          },
    });
  };

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col bg-background md:flex-row"
      data-automation-workspace="true"
    >
      <AutomationWorkspaceTitle
        title={environmentId && !tasksQuery.error ? selectedTask?.title : undefined}
        mobileDetailOpen={target.taskId !== undefined}
      />
      <AutomationSidebar
        tasks={tasks}
        environmentId={environmentId}
        selectedTaskId={selectedTask?.id}
        returnTaskId={target.taskId}
        onSelect={(task) => {
          if (!environmentId) return;
          void navigate({ to: "/automations", search: { environmentId, taskId: task.id } });
        }}
        onCreate={() => openEditor()}
        onEdit={openEditor}
        onRun={(task) => void run(task)}
        onToggle={(task, enabled) => void toggle(task, enabled)}
        canOperate={canOperate && !requestedEnvironmentUnavailable}
        busyTaskId={busyTaskId}
        mobileDetailOpen={target.taskId !== undefined}
        onRefresh={refresh}
        loading={loading}
        error={tasksQuery.error}
        environmentState={environmentState}
      />
      <main
        data-workspace-area="automations"
        data-workspace-order={1}
        aria-label="Automations"
        tabIndex={-1}
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          target.taskId === undefined && "max-md:hidden",
        )}
      >
        <header className="flex h-12 shrink-0 items-center gap-3 overflow-x-auto border-b border-border/70 px-5">
          {target.taskId !== undefined ? (
            <Button
              size="icon-sm"
              variant="ghost"
              className="md:hidden"
              aria-label="Back to automations"
              onClick={() =>
                void navigate({
                  to: "/automations",
                  search: environmentId ? { environmentId } : {},
                })
              }
            >
              <ArrowLeftIcon />
            </Button>
          ) : null}
          {connected.length > 0 ? (
            <div className="hidden md:block">
              <Select
                value={environmentId ?? ""}
                onValueChange={(value) => {
                  if (value) {
                    void navigate({
                      to: "/automations",
                      search: { environmentId: value as EnvironmentId },
                    });
                  }
                }}
              >
                <SelectTrigger size="xs" variant="ghost" aria-label="Environment">
                  <SelectValue>
                    {() =>
                      (environmentState === "ready"
                        ? activeEnvironment?.label
                        : requestedEnvironmentRecord?.label) ?? "Environment"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup align="end">
                  {connected.map((entry) => (
                    <SelectItem key={entry.environmentId} value={entry.environmentId}>
                      {entry.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
          ) : null}
          <div className="flex-1" />
          {selectedTask ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <StatusDot task={selectedTask} />
              {taskStatus(selectedTask)}
            </span>
          ) : null}
          {selectedTask ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="xs"
                variant="ghost-muted"
                disabled={!canOperate || busyTaskId !== null}
                title={!canOperate ? "You do not have permission to edit automations." : undefined}
                onClick={() => openEditor(selectedTask)}
              >
                <PencilIcon />
                Edit
              </Button>
              {selectedTask.schedule.type === "webhook" ? null : (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={
                    !canOperate ||
                    Boolean(selectedTask.blockedByPolicy) ||
                    busyTaskId !== null ||
                    selectedTask.lastRunStatus === "running"
                  }
                  title={
                    !canOperate
                      ? "You do not have permission to run automations."
                      : selectedTask.blockedByPolicy
                        ? `Blocked by policy: ${selectedTask.blockedByPolicy}`
                        : selectedTask.lastRunStatus === "running"
                          ? "This automation is already running."
                          : undefined
                  }
                  onClick={() => void run(selectedTask)}
                >
                  {busyTaskId === selectedTask.id && busyAction === "run" ? (
                    <RefreshCwIcon className="animate-spin" />
                  ) : (
                    <PlayIcon />
                  )}
                  {busyTaskId === selectedTask.id && busyAction === "run" ? "Queueing…" : "Run now"}
                </Button>
              )}
            </div>
          ) : null}
        </header>
        {requestedEnvironmentConnecting ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Connecting environment…
          </div>
        ) : requestedEnvironmentUnavailable ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            This environment is unavailable. Choose a connected environment to view automations.
          </div>
        ) : tasksQuery.error ? (
          <div
            role="alert"
            className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-destructive"
          >
            <p>{tasksQuery.error}</p>
            <Button size="xs" variant="outline" onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : tasksQuery.data === null && tasksQuery.isPending ? (
          <LoadingAutomationState />
        ) : target.taskId !== undefined && requestedTask === undefined ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            This automation is unavailable.
          </div>
        ) : selectedTask && environmentId ? (
          <AutomationMain task={selectedTask} environmentId={environmentId} />
        ) : connected.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Connect an environment to manage automations.
          </div>
        ) : (
          <EmptyAutomationState
            onCreate={() => openEditor()}
            canCreate={canOperate && environmentId !== undefined}
          />
        )}
      </main>
    </div>
  );
}
