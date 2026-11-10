import { useAtomValue } from "@effect/atom-react";
import type {
  EnvironmentId,
  ProjectId,
  SecretProviderId,
  TaskWorkspaceArtifact,
  TaskWorkspaceComment,
  TaskWorkspaceCommand,
  TaskWorkspaceCommandInput,
  TaskWorkspaceScenario,
  TaskWorkspaceSnapshot,
  TaskWorkspaceStage,
  TaskWorkspaceTask,
  TaskWorkspaceVariant,
} from "@t3tools/contracts";
import {
  AlertCircleIcon,
  ArrowLeftIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleDotIcon,
  ExternalLinkIcon,
  FileCode2Icon,
  GitBranchIcon,
  GaugeIcon,
  HomeIcon,
  ListTodoIcon,
  LoaderCircleIcon,
  MessageSquareTextIcon,
  PaletteIcon,
  PlayIcon,
  RefreshCwIcon,
  RocketIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  SquareTerminalIcon,
  XCircleIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { cn } from "../../lib/utils";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironments, usePrimaryEnvironmentId, usePullRequestsSupported } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { taskWorkspaceCommand, taskWorkspaceRead } from "../../state/taskWorkspace";
import { PullRequestGlyph } from "../pullRequest/pullRequestIcons";
import { readPullRequestListPreferences } from "../pullRequest/pullRequestListPreferences";
import { SidebarUpdatePill } from "../sidebar/SidebarUpdatePill";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";

type TaskWorkspaceSearch = {
  readonly environmentId?: EnvironmentId;
  readonly projectId?: ProjectId;
  readonly taskId?: string;
};

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDate(value: string | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : DATE_FORMATTER.format(date);
}

function formatDateTime(value: string | null | undefined) {
  if (value === null || value === undefined) return "N/A";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "N/A" : DATE_TIME_FORMATTER.format(date);
}

function taskState(task: TaskWorkspaceTask) {
  if (task.run?.status === "queued") return { label: "Queued", tone: "info" as const };
  if (task.run?.status === "running") return { label: "Processing", tone: "info" as const };
  if (task.run?.status === "failed") return { label: "Processing failed", tone: "error" as const };
  if (task.run?.status === "succeeded")
    return { label: "Ready for review", tone: "success" as const };
  if (task.run?.status === "cancelled") return { label: "Cancelled", tone: "muted" as const };
  const category = (task.issue.status.category ?? "").toLocaleLowerCase();
  const tone =
    category.includes("done") || category.includes("готов") || category.includes("complete")
      ? ("success" as const)
      : category.includes("progress") || category.includes("процесс")
        ? ("info" as const)
        : ("muted" as const);
  return { label: task.issue.status.name, tone };
}

function scenarioGraphError(stages: ReadonlyArray<TaskWorkspaceStage>): string | null {
  const ids = new Set<string>();
  for (const stage of stages) {
    if (ids.has(stage.id)) return "Stage IDs must be unique.";
    ids.add(stage.id);
  }
  for (const stage of stages) {
    if (stage.dependsOn.some((dependency) => dependency === stage.id || !ids.has(dependency)))
      return `Dependencies for ${stage.name} contain an unknown or self-referencing stage.`;
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    const stage = stages.find((entry) => entry.id === id);
    const valid = stage?.dependsOn.every(visit) ?? false;
    visiting.delete(id);
    if (valid) visited.add(id);
    return valid;
  };
  return stages.every((stage) => visit(stage.id)) ? null : "Stage dependencies contain a cycle.";
}

function statusVariant(tone: "info" | "error" | "success" | "muted") {
  return tone === "muted" ? "outline" : tone;
}

function StageIcon({ stage, task }: { stage: TaskWorkspaceStage; task: TaskWorkspaceTask }) {
  const run = task.run;
  const completed = run?.completedStageIds.includes(stage.id) === true;
  const active = run?.currentStageId === stage.id && run.status === "running";
  if (completed) return <CheckCircle2Icon className="size-4 text-success" />;
  if (active) return <LoaderCircleIcon className="size-4 animate-spin text-info" />;
  if (run?.status === "failed" && run.currentStageId === stage.id)
    return <XCircleIcon className="size-4 text-destructive" />;
  return <CircleDotIcon className="size-4 text-muted-foreground/60" />;
}

function StageRow({
  stage,
  task,
  onRetry,
}: {
  stage: TaskWorkspaceStage;
  task: TaskWorkspaceTask;
  onRetry: (stageId: string) => void;
}) {
  const run = task.run;
  const active = task.run?.currentStageId === stage.id && task.run.status === "running";
  return (
    <li className={cn("flex items-start gap-3 rounded-lg px-2.5 py-2", active && "bg-info/8")}>
      <span className="mt-0.5 shrink-0" aria-hidden>
        <StageIcon stage={stage} task={task} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{stage.name}</span>
          {stage.parallel ? (
            <Badge variant="outline" size="sm">
              Parallel
            </Badge>
          ) : null}
        </span>
        <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>{stage.kind}</span>
          {stage.provider ? <span>{stage.provider}</span> : null}
          {stage.model ? <span>{stage.model}</span> : null}
          {stage.command ? <code className="truncate">{stage.command}</code> : null}
        </span>
      </span>
      {run?.status === "failed" && run.currentStageId === stage.id ? (
        <Button size="xs" variant="ghost-muted" onClick={() => onRetry(stage.id)}>
          Retry stage
        </Button>
      ) : null}
    </li>
  );
}

function ScenarioCard({
  task,
  onConfigure,
  onRetry,
  commandDisabled,
}: {
  task: TaskWorkspaceTask;
  onConfigure: (scenario: TaskWorkspaceScenario) => void;
  onRetry: (stageId: string) => void;
  commandDisabled: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.scenario);
  const scenario = task.scenario;
  const invalidStage = draft.stages.some((stage) => stage.name.trim() === "");
  const graphError = scenarioGraphError(draft.stages);
  const updateStage = (stageId: string, patch: Partial<TaskWorkspaceStage>) => {
    setDraft((current) => ({
      ...current,
      stages: current.stages.map((stage) =>
        stage.id === stageId ? { ...stage, ...patch } : stage,
      ),
    }));
  };
  const toggleDependency = (stageId: string, dependencyId: string) => {
    const stage = draft.stages.find((entry) => entry.id === stageId);
    if (stage === undefined) return;
    const dependsOn = stage.dependsOn.includes(dependencyId)
      ? stage.dependsOn.filter((entry) => entry !== dependencyId)
      : [...stage.dependsOn, dependencyId];
    updateStage(stageId, { dependsOn });
  };
  const addStage = () => {
    const stageId = `stage-${draft.stages.length + 1}-${Date.now()}`;
    setDraft((current) => ({
      ...current,
      stages: [
        ...current.stages,
        {
          id: stageId,
          name: "New check stage",
          kind: "check",
          dependsOn: current.stages.at(-1)?.id ? [current.stages.at(-1)!.id] : [],
          parallel: false,
          provider: null,
          model: null,
          skills: [],
          connectors: [],
          command: null,
          required: true,
          rules: [],
          prompt: "Run the configured project check.",
          timeoutMs: 900_000,
        },
      ],
    }));
  };
  const removeStage = (stageId: string) => {
    if (draft.stages.length <= 1) return;
    setDraft((current) => ({
      ...current,
      stages: current.stages
        .filter((stage) => stage.id !== stageId)
        .map((stage) => ({
          ...stage,
          dependsOn: stage.dependsOn.filter((dependency) => dependency !== stageId),
        })),
    }));
  };
  const moveStage = (stageId: string, direction: -1 | 1) => {
    setDraft((current) => {
      const index = current.stages.findIndex((stage) => stage.id === stageId);
      const targetIndex = index + direction;
      if (index < 0 || targetIndex < 0 || targetIndex >= current.stages.length) return current;
      const stages = current.stages.slice();
      const [stage] = stages.splice(index, 1);
      if (stage === undefined) return current;
      stages.splice(targetIndex, 0, stage);
      return { ...current, stages };
    });
  };
  return (
    <section className="rounded-2xl border border-border/70 bg-muted/20 p-4 shadow-xs">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-info/10 text-info-foreground ring-1 ring-info/20">
          <SparklesIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{scenario.name}</h2>
            <Badge variant={scenario.enabled ? "secondary" : "outline"}>
              {scenario.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {scenario.maxVariants} variants · {scenario.maxRetries} retries · revision{" "}
            {scenario.revision}
          </p>
        </div>
        <Button
          size="icon-sm"
          variant="ghost-muted"
          aria-label="Configure scenario"
          onClick={() => setEditing((value) => !value)}
          disabled={commandDisabled}
        >
          <SlidersHorizontalIcon />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost-muted"
          aria-label={open ? "Collapse scenario" : "Expand scenario"}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </Button>
      </div>
      {editing ? (
        <div
          className="mt-4 space-y-3 rounded-xl border border-border/60 bg-background/55 p-3"
          aria-label="Scenario editor"
        >
          <fieldset disabled={commandDisabled} className="contents">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-xs text-muted-foreground">
              Variants
              <Input
                type="number"
                min={1}
                max={20}
                value={draft.maxVariants}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    maxVariants: Math.max(1, Math.min(20, Number(event.target.value) || 1)),
                  }))
                }
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Retries
              <Input
                type="number"
                min={0}
                max={5}
                value={draft.maxRetries}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    maxRetries: Math.max(0, Math.min(5, Number(event.target.value) || 0)),
                  }))
                }
              />
            </label>
            <label className="flex items-center gap-2 self-end pb-1 text-xs text-foreground">
              <Switch
                size="sm"
                checked={draft.enabled}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({ ...current, enabled: checked }))
                }
                aria-label="Scenario enabled"
              />
              Enabled
            </label>
            <label className="flex items-center gap-2 self-end pb-1 text-xs text-foreground">
              <Switch
                size="sm"
                checked={draft.autoStart === true}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({ ...current, autoStart: checked }))
                }
                aria-label="Auto-start matching Jira tasks"
              />
              Auto-start matching Jira tasks
            </label>
          </div>
          <div className="space-y-2">
            {draft.stages.map((stage) => (
              <div key={stage.id} className="rounded-lg border border-border/60 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="grid min-w-48 flex-1 gap-1 text-2xs text-muted-foreground">
                    Stage name
                    <Input
                      aria-label={`${stage.name} name`}
                      value={stage.name}
                      onChange={(event) => updateStage(stage.id, { name: event.target.value })}
                    />
                  </label>
                  <Badge variant="outline" size="sm">
                    {stage.kind}
                  </Badge>
                  <Badge variant="outline" size="sm">
                    id:{stage.id}
                  </Badge>
                  <Button size="icon-xs" variant="ghost-muted" aria-label={`Move ${stage.name} up`} onClick={() => moveStage(stage.id, -1)} disabled={commandDisabled}>↑</Button>
                  <Button size="icon-xs" variant="ghost-muted" aria-label={`Move ${stage.name} down`} onClick={() => moveStage(stage.id, 1)} disabled={commandDisabled}>↓</Button>
                  <Button size="xs" variant="ghost-muted" aria-label={`Remove ${stage.name}`} onClick={() => removeStage(stage.id)} disabled={commandDisabled || draft.stages.length <= 1}>Remove</Button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div className="grid gap-1 text-2xs text-muted-foreground sm:col-span-2">
                    <span>Depends on</span>
                    <div className="flex flex-wrap gap-1.5" aria-label={`${stage.name} dependencies`}>
                      {draft.stages
                        .filter((candidate) => candidate.id !== stage.id)
                        .map((candidate) => (
                          <Button
                            key={candidate.id}
                            size="xs"
                            variant={stage.dependsOn.includes(candidate.id) ? "secondary" : "outline"}
                            onClick={() => toggleDependency(stage.id, candidate.id)}
                          >
                            {candidate.name}
                          </Button>
                        ))}
                    </div>
                    <span className="text-2xs text-muted-foreground/70">
                      Select the stages that must finish first.
                    </span>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      size="sm"
                      checked={stage.parallel}
                      onCheckedChange={(parallel) => updateStage(stage.id, { parallel })}
                      aria-label={`${stage.name} parallel`}
                    />
                    Parallel
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      size="sm"
                      checked={stage.required}
                      onCheckedChange={(required) => updateStage(stage.id, { required })}
                      aria-label={`${stage.name} required`}
                    />
                    Required
                  </label>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <p className="sm:col-span-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                    Execution inputs
                  </p>
                  <label className="grid gap-1 text-2xs text-muted-foreground">
                    Provider
                    <Input
                      aria-label={`${stage.name} provider`}
                      value={stage.provider ?? ""}
                      placeholder="codex"
                      onChange={(event) =>
                        updateStage(stage.id, { provider: event.target.value || null })
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-2xs text-muted-foreground">
                    Model
                    <Input
                      aria-label={`${stage.name} model`}
                      value={stage.model ?? ""}
                      placeholder="Default model"
                      onChange={(event) =>
                        updateStage(stage.id, { model: event.target.value || null })
                      }
                    />
                  </label>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <p className="sm:col-span-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                    Checks and extensions
                  </p>
                  <label className="grid gap-1 text-2xs text-muted-foreground">
                    Check command
                    <Input
                      aria-label={`${stage.name} command`}
                      value={stage.command ?? ""}
                      placeholder="npm test"
                      onChange={(event) => updateStage(stage.id, { command: event.target.value || null })}
                    />
                  </label>
                  <label className="grid gap-1 text-2xs text-muted-foreground">
                    Skills
                    <Input
                      aria-label={`${stage.name} skills`}
                      value={stage.skills.join(", ")}
                      placeholder="Comma separated"
                      onChange={(event) =>
                        updateStage(stage.id, {
                          skills: event.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                        })
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-2xs text-muted-foreground">
                    Connectors
                    <Input
                      aria-label={`${stage.name} connectors`}
                      value={stage.connectors.join(", ")}
                      placeholder="Comma separated"
                      onChange={(event) =>
                        updateStage(stage.id, {
                          connectors: event.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                        })
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-2xs text-muted-foreground">
                    Rules
                    <Input
                      aria-label={`${stage.name} rules`}
                      value={stage.rules.join(", ")}
                      placeholder="Comma separated"
                      onChange={(event) =>
                        updateStage(stage.id, {
                          rules: event.target.value.split(",").map((value) => value.trim()).filter(Boolean),
                        })
                      }
                    />
                  </label>
                </div>
                <label className="mt-2 grid gap-1 text-2xs text-muted-foreground">
                  Prompt
                  <Textarea
                    className="min-h-20"
                    aria-label={`${stage.name} prompt`}
                    value={stage.prompt}
                    placeholder="Stage prompt"
                    onChange={(event) => updateStage(stage.id, { prompt: event.target.value })}
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {stage.skills.map((skill) => (
                    <Badge key={skill} variant="secondary" size="sm">
                      skill:{skill}
                    </Badge>
                  ))}
                  {stage.connectors.map((connector) => (
                    <Badge key={connector} variant="outline" size="sm">
                      connector:{connector}
                    </Badge>
                  ))}
                  {stage.rules.map((rule) => (
                    <Badge key={rule} variant="outline" size="sm">
                      rule:{rule}
                    </Badge>
                  ))}
                </div>
                {stage.command ? (
                  <code className="mt-2 block truncate text-2xs text-muted-foreground">
                    check: {stage.command}
                  </code>
                ) : null}
              </div>
            ))}
          </div>
          <Button size="xs" variant="outline" onClick={addStage} disabled={commandDisabled}>
            Add stage
          </Button>
          {graphError ? <p className="text-xs text-destructive" role="alert">{graphError}</p> : null}
          </fieldset>
          {commandDisabled ? (
            <p className="text-xs text-muted-foreground">Read-only: you do not have permission to change this workspace.</p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              size="xs"
              variant="ghost-muted"
              onClick={() => {
                setDraft(scenario);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="xs"
              disabled={commandDisabled || invalidStage || graphError !== null}
              onClick={() => {
                onConfigure({ ...draft, revision: scenario.revision });
                setEditing(false);
              }}
            >
              Save scenario
            </Button>
          </div>
          <p className="text-2xs text-muted-foreground">
            Saved as a revisioned local scenario. Stages run only when you start the scenario.
          </p>
        </div>
      ) : null}
      {open ? (
        <ol
          className="mt-4 space-y-1 border-s border-border/70 ps-3"
          aria-label="Processing stages"
        >
          {scenario.stages.map((stage) => (
            <StageRow key={stage.id} stage={stage} task={task} onRetry={onRetry} />
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function CommentRow({ comment }: { comment: TaskWorkspaceComment }) {
  return (
    <li className="rounded-xl border border-border/60 bg-background/45 p-3">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-foreground">
          <MessageSquareTextIcon className="size-3.5" />
          {comment.author}
          <Badge variant="outline" size="sm">
            {comment.source}
          </Badge>
        </span>
        <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/90">
        {comment.body}
      </p>
    </li>
  );
}

function ArtifactCard({
  artifact,
  onLaunch,
}: {
  artifact: TaskWorkspaceArtifact;
  onLaunch: () => void;
}) {
  return (
    <li className="rounded-xl border border-border/60 bg-background/45 p-3">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {artifact.kind === "story" ? (
            <FileCode2Icon className="size-4" />
          ) : (
            <SquareTerminalIcon className="size-4" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{artifact.label}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {artifact.kind} · {artifact.storyId ?? artifact.path ?? "No location"}
          </p>
          <p className="mt-1 text-2xs text-muted-foreground">
            {artifact.sourceSha
              ? `source ${artifact.sourceSha.slice(0, 8)}`
              : "Source revision unavailable"}
          </p>
        </div>
        {artifact.kind === "story" && artifact.storyId ? (
          <Button size="xs" variant="outline" onClick={onLaunch}>
            <PlayIcon />
            Storybook
          </Button>
        ) : artifact.url ? (
          <Button
            size="icon-sm"
            variant="ghost-muted"
            render={<a href={artifact.url} target="_blank" rel="noreferrer" />}
            aria-label="Open artifact"
          >
            <ExternalLinkIcon />
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function VariantRow({
  variant,
  environmentId,
  artifacts,
  onLaunchArtifact,
}: {
  variant: TaskWorkspaceVariant;
  environmentId: EnvironmentId;
  artifacts: ReadonlyArray<TaskWorkspaceArtifact>;
  onLaunchArtifact: (artifact: TaskWorkspaceArtifact) => void;
}) {
  const tone =
    variant.status === "succeeded"
      ? "success"
      : variant.status === "failed"
        ? "error"
        : variant.status === "running"
          ? "info"
          : "muted";
  return (
    <li className="rounded-xl border border-border/60 bg-background/45 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{variant.label}</p>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            source {variant.sourceSha.slice(0, 8)}
            {variant.worktreePath ? ` · ${variant.worktreePath}` : ""}
          </p>
        </div>
        <Badge variant={statusVariant(tone)}>{variant.status}</Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {variant.checks.map((check) => (
          <div key={check.id} className="flex flex-col gap-1">
            <Badge
              variant={
                check.status === "passed"
                  ? "secondary"
                  : check.status === "failed"
                    ? "destructive"
                    : "outline"
              }
              size="sm"
            >
              {check.name}: {check.status}
              {check.exitCode === null ? "" : ` · exit ${check.exitCode}`}
              {check.attempt === undefined ? "" : ` · attempt ${check.attempt}`}
            </Badge>
            {check.output ? (
              <pre className="max-h-24 overflow-auto whitespace-pre-wrap px-1 text-2xs text-muted-foreground">
                {check.output}
              </pre>
            ) : null}
          </div>
        ))}
      </div>
      {variant.output ? (
        <details className="mt-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2">
          <summary className="cursor-pointer text-2xs font-medium text-muted-foreground">
            Agent output
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-2xs text-muted-foreground">
            {variant.output}
          </pre>
        </details>
      ) : null}
      {variant.threadIds.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2 text-2xs text-muted-foreground">
          {variant.threadIds.map((threadId) => (
            <Link
              key={threadId}
              to="/$environmentId/$threadId"
              params={{ environmentId, threadId }}
              className="text-info underline-offset-2 hover:underline"
            >
              Open agent thread
            </Link>
          ))}
        </div>
      ) : null}
      {artifacts.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {artifacts.map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} onLaunch={() => onLaunchArtifact(artifact)} />
          ))}
        </ul>
      ) : null}
      {variant.error ? <p className="mt-2 text-xs text-destructive">{variant.error}</p> : null}
    </li>
  );
}

function TaskList({
  tasks,
  contextLabel,
  environmentId,
  environmentOptions,
  projectId,
  projectOptions,
  lastSyncedAt,
  assigneeFilter,
  assigneeOptions,
  statusFilter,
  statusOptions,
  onEnvironmentChange,
  onProjectChange,
  onAssigneeChange,
  onStatusFilterChange,
  selectedId,
  filter,
  onFilterChange,
  onSelect,
  onSync,
  syncDisabled,
}: {
  tasks: ReadonlyArray<TaskWorkspaceTask>;
  contextLabel: string;
  environmentId: EnvironmentId;
  environmentOptions: ReadonlyArray<{ readonly id: EnvironmentId; readonly label: string }>;
  projectId: ProjectId;
  projectOptions: ReadonlyArray<{ readonly id: ProjectId; readonly label: string }>;
  lastSyncedAt: string | null;
  assigneeFilter: string;
  assigneeOptions: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  statusFilter: string;
  statusOptions: ReadonlyArray<string>;
  onEnvironmentChange: (value: EnvironmentId) => void;
  onProjectChange: (value: ProjectId) => void;
  onAssigneeChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
  selectedId: string | undefined;
  filter: string;
  onFilterChange: (value: string) => void;
  onSelect: (task: TaskWorkspaceTask) => void;
  onSync: () => void;
  syncDisabled: boolean;
}) {
  const needle = filter.trim().toLocaleLowerCase();
  const visible =
    needle.length === 0
      ? tasks
      : tasks.filter((task) =>
          `${task.issue.key} ${task.issue.summary} ${task.issue.status.name}`
            .toLocaleLowerCase()
            .includes(needle),
        );
  const statusVisible =
    statusFilter === ""
      ? visible
      : visible.filter((task) => task.issue.status.name === statusFilter);
  const assigneeVisible =
    assigneeFilter === ""
      ? statusVisible
      : statusVisible.filter(
          (task) => task.issue.assigneeId === assigneeFilter || task.issue.assignee === assigneeFilter,
        );
  const groups = new Map<string, TaskWorkspaceTask[]>();
  assigneeVisible
    .toSorted((a, b) => b.issue.createdAt.localeCompare(a.issue.createdAt))
    .forEach((task) => {
      const key = task.issue.sprint?.name ?? "Without sprint";
      const group = groups.get(key) ?? [];
      group.push(task);
      groups.set(key, group);
    });
  return (
    <aside
      {...workspaceAreaProps("tasks-sidebar", 0, "Tasks list")}
      className="flex h-full min-h-0 w-full shrink-0 flex-col border-b border-border/70 bg-sidebar md:w-(--automations-sidebar-width) md:border-e md:border-b-0"
      aria-label="Tasks"
    >
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border/70 px-4">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">Tasks</h2>
          <p className="truncate text-xs text-muted-foreground">{contextLabel}</p>
          <p className="truncate text-2xs text-muted-foreground/70">
            {lastSyncedAt ? `Synced ${formatDateTime(lastSyncedAt)}` : "Not synchronized yet"}
          </p>
        </div>
        <Badge variant="secondary">{assigneeVisible.length}</Badge>
        <Button size="icon-sm" variant="ghost-muted" aria-label="Sync tasks" onClick={onSync} disabled={syncDisabled}>
          <RefreshCwIcon className={syncDisabled ? "animate-spin" : undefined} />
        </Button>
      </div>
      <label className="relative mx-3 my-3 block">
        <Input
          type="search"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Search tasks"
          aria-label="Search tasks"
        />
      </label>
      <div className="grid gap-2 border-b border-border/70 px-3 pb-3 sm:grid-cols-2 md:grid-cols-1">
        <Select value={environmentId} onValueChange={(value) => value && onEnvironmentChange(value as EnvironmentId)}>
          <SelectTrigger size="sm" aria-label="Environment">
            <SelectValue placeholder="Environment" />
          </SelectTrigger>
          <SelectPopup>
            {environmentOptions.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Select value={projectId} onValueChange={(value) => value && onProjectChange(value as ProjectId)}>
          <SelectTrigger size="sm" aria-label="Project">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectPopup>
            {projectOptions.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Select value={assigneeFilter || "all"} onValueChange={(value) => onAssigneeChange(value === "all" ? "" : (value ?? ""))}>
          <SelectTrigger size="sm" aria-label="Jira assignee">
            <SelectValue placeholder="All assignees" />
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="all">All assignees</SelectItem>
            {assigneeOptions.map((entry) => (
              <SelectItem key={entry.id} value={entry.id}>
                {entry.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Select value={statusFilter || "all"} onValueChange={(value) => onStatusFilterChange(value === "all" ? "" : (value ?? ""))}>
          <SelectTrigger size="sm" aria-label="Jira status">
            <SelectValue placeholder="All Jira statuses" />
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="all">All Jira statuses</SelectItem>
            {statusOptions.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-20 md:pb-3">
        {assigneeVisible.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            {tasks.length === 0 ? "No Jira tasks are available." : "No tasks match these filters."}
          </p>
        ) : null}
        {[...groups.entries()]
          .sort(([, left], [, right]) => {
            const rank = (task: TaskWorkspaceTask) =>
              task.issue.sprint === null
                ? 3
                : task.issue.sprint.state === "active"
                  ? 0
                  : task.issue.sprint.state === "future"
                    ? 1
                    : 2;
            const rankDifference = rank(left[0]!) - rank(right[0]!);
            if (rankDifference !== 0) return rankDifference;
            return (right[0]?.issue.sprint?.startAt ?? "").localeCompare(
              left[0]?.issue.sprint?.startAt ?? "",
            );
          })
          .map(([sprint, entries]) => (
            <section key={sprint} className="mb-4">
              <h2 className="flex items-center justify-between px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{sprint}</span>
                <span className="font-normal tabular-nums">{entries.length}</span>
              </h2>
              <ul className="space-y-0.5">
                {entries.map((task) => {
                  const state = taskState(task);
                  return (
                    <li key={task.id}>
                      <button
                        type="button"
                        aria-current={task.id === selectedId ? "page" : undefined}
                        onClick={() => onSelect(task)}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-sidebar-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                          task.id === selectedId && "bg-sidebar-row-selected",
                        )}
                      >
                        <span
                          className={cn(
                            "mt-0.5 size-2 shrink-0 rounded-full",
                            state.tone === "success" && "bg-success",
                            state.tone === "error" && "bg-destructive",
                            state.tone === "info" && "bg-info",
                            state.tone === "muted" && "bg-muted-foreground/40",
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            <span className="truncate">{task.issue.summary}</span>
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span>{task.issue.key}</span>
                            <span>{formatDate(task.issue.createdAt)}</span>
                          </span>
                          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
                            <span className="truncate">{task.issue.status.name}</span>
                            {task.run ? (
                              <span className="truncate text-info">· {state.label}</span>
                            ) : null}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
      </div>
    </aside>
  );
}

function TaskDetails({
  task,
  environmentId,
  onCommand,
  onBack,
  commandDisabled,
  commandError,
  commandNotice,
}: {
  task: TaskWorkspaceTask;
  environmentId: EnvironmentId;
  onCommand: (command: TaskWorkspaceCommand) => void;
  onBack: () => void;
  commandDisabled: boolean;
  commandError: string | null;
  commandNotice: string | null;
}) {
  const [draftSummary, setDraftSummary] = useState(task.draft?.summary ?? task.issue.summary);
  const [draftDescription, setDraftDescription] = useState(
    task.draft?.description ?? task.issue.description,
  );
  const [editing, setEditing] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(
    task.scenario.selectedVariantIds[0],
  );
  const [branch, setBranch] = useState(
    `feature/task-${task.issue.key.toLocaleLowerCase().replace(/[^a-z0-9-]+/g, "-")}`,
  );
  const [runConfirmOpen, setRunConfirmOpen] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const state = taskState(task);
  const run = task.run;
  const selectedVariant = run?.variants.find((variant) => variant.id === selectedVariantId);
  const selectedArtifact = task.artifacts.find(
    (artifact) =>
      artifact.kind === "story" && artifact.storyId && artifact.variantId === selectedVariantId,
  );
  const selectedArtifactId = selectedArtifact?.id;
  const visibleSummary = task.draft?.dirty ? task.draft.summary : task.issue.summary;
  const visibleDescription = task.draft?.dirty
    ? task.draft.description
    : task.issue.description;
  const saveDraft = () => {
    onCommand({
      _tag: "saveDraft",
      taskId: task.id,
      baseRevision: task.draft?.baseRevision ?? task.issue.sourceRevision,
      summary: draftSummary,
      description: draftDescription,
      fields: task.draft?.fields ?? {},
    });
    setEditing(false);
  };
  const publish = () => {
    if (selectedVariant === undefined) return;
    onCommand({
      _tag: "publishVariant",
      taskId: task.id,
      variantId: selectedVariant.id,
      ...(task.run?.currentStageId === null || task.run?.currentStageId === undefined
        ? {}
        : { stageId: task.run.currentStageId }),
      branch,
      commentIds: task.comments
        .filter((comment) => comment.source === "agent")
        .map((comment) => comment.id),
    });
    setPublishConfirmOpen(false);
  };
  // Synchronizes the global shortcut with the selected Storybook artifact.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- window keydown listener is external to React and is removed on unmount
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        !(event.metaKey || event.ctrlKey) ||
        !event.shiftKey ||
        event.key.toLocaleLowerCase() !== "s"
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA")
      )
        return;
      if (selectedArtifactId === undefined || commandDisabled) return;
      event.preventDefault();
      onCommand({ _tag: "launchStorybook", taskId: task.id, artifactId: selectedArtifactId });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [commandDisabled, onCommand, selectedArtifactId, task.id]);
  return (
    <main
      {...workspaceAreaProps("tasks-main", 1, "Task details")}
      className="min-w-0 flex-1 overflow-y-auto scrollbar-gutter-both bg-background"
      data-task-workspace-main=""
    >
      <header className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center gap-2 border-b border-border/70 bg-background/95 px-4 py-2 backdrop-blur md:px-6">
        <Button
          size="icon-sm"
          variant="ghost-muted"
          className="md:hidden"
          aria-label="Back to tasks"
          onClick={onBack}
        >
          <ArrowLeftIcon />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{task.issue.key}</p>
          <h1 className="truncate text-base font-semibold">{task.issue.summary}</h1>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Badge variant="outline">{task.issue.status.name}</Badge>
          {task.run ? <Badge variant={statusVariant(state.tone)}>{state.label}</Badge> : null}
          {task.draft?.dirty ? <Badge variant="secondary">Local draft</Badge> : null}
        </div>
        <Button
          size="xs"
          variant="ghost-muted"
          onClick={() => setEditing((value) => !value)}
          disabled={commandDisabled}
        >
          <SlidersHorizontalIcon />
          {editing ? "Close edit" : "Edit draft"}
        </Button>
        {task.draft?.dirty ? (
          <Button
            size="xs"
            variant="ghost-muted"
            onClick={() => setDiscardConfirmOpen(true)}
            disabled={commandDisabled}
          >
            Discard draft
          </Button>
        ) : null}
        {run?.status === "running" || run?.status === "queued" ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() => onCommand({ _tag: "cancelRun", taskId: task.id })}
            disabled={commandDisabled}
          >
            <XCircleIcon />
            Cancel run
          </Button>
        ) : (
          <Button
            size="xs"
            variant="outline"
            onClick={() => setRunConfirmOpen(true)}
            disabled={commandDisabled}
          >
            <PlayIcon />
            {run?.status === "failed" ? "Retry scenario" : "Run scenario"}
          </Button>
        )}
      </header>
      {commandError ? (
        <div
          role="alert"
          className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive md:mx-6"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
          <span>{commandError}</span>
        </div>
      ) : null}
      {commandNotice ? (
        <div
          role="status"
          className="mx-4 mt-4 rounded-xl border border-success/30 bg-success/8 px-3 py-2 text-sm text-success-foreground md:mx-6"
        >
          {commandNotice}
        </div>
      ) : null}
      <div className="mx-auto flex w-full max-w-(--chat-content-max-width) flex-col gap-4 p-4 pb-20 md:p-6">
        <section className="rounded-2xl border border-border/70 bg-muted/15 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Original task</h2>
            {task.issue.browseUrl ? (
              <a
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                href={task.issue.browseUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Jira <ExternalLinkIcon className="size-3.5" />
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">Jira link unavailable</span>
            )}
          </div>
          {editing ? (
            <div className="mt-3 space-y-3">
              <Input
                value={draftSummary}
                onChange={(event) => setDraftSummary(event.target.value)}
                aria-label="Task summary draft"
              />
              <Textarea
                value={draftDescription}
                onChange={(event) => setDraftDescription(event.target.value)}
                aria-label="Task description draft"
                className="min-h-32"
              />
              <div className="flex justify-end gap-2">
                <Button size="xs" variant="ghost-muted" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
                <Button size="xs" onClick={saveDraft} disabled={commandDisabled}>
                  Save local draft
                </Button>
              </div>
              <p className="text-2xs text-muted-foreground">
                Local draft only · Jira remains unchanged until publish.
              </p>
            </div>
          ) : (
            <>
              {task.draft?.dirty ? (
                <p className="mt-3 text-2xs font-medium uppercase tracking-wide text-info">
                  Local draft preview · Jira source remains unchanged
                </p>
              ) : null}
              <h3 className="mt-2 text-base font-medium">{visibleSummary}</h3>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/85">
                {visibleDescription || "No description provided."}
              </p>
              {task.issue.attachments && task.issue.attachments.length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Jira attachments">
                  {task.issue.attachments.map((attachment) => (
                    <li key={attachment.id}>
                      {attachment.url ? (
                        <a
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-xs text-info hover:bg-muted/40"
                        >
                          <FileCode2Icon className="size-3.5 shrink-0" />
                          <span className="truncate">{attachment.name}</span>
                        </a>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-xs text-muted-foreground">
                          <FileCode2Icon className="size-3.5" />
                          {attachment.name}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
              {task.draft?.dirty ? (
                <details className="mt-3 rounded-lg border border-border/60 bg-background/55 p-2.5 text-xs">
                  <summary className="cursor-pointer font-medium text-muted-foreground">
                    Jira source version
                  </summary>
                  <h4 className="mt-2 font-medium text-foreground">{task.issue.summary}</h4>
                  <p className="mt-1 whitespace-pre-wrap leading-5 text-muted-foreground">
                    {task.issue.description || "No description provided."}
                  </p>
                </details>
              ) : null}
            </>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Assignee</dt>
              <dd className="mt-0.5 font-medium">{task.issue.assignee ?? "Unassigned"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Priority</dt>
              <dd className="mt-0.5 font-medium">{task.issue.priority ?? "N/A"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Sprint</dt>
              <dd className="mt-0.5 font-medium">{task.issue.sprint?.name ?? "N/A"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Updated</dt>
              <dd className="mt-0.5 font-medium">{formatDate(task.issue.updatedAt)}</dd>
            </div>
          </dl>
        </section>
        <ScenarioCard
          task={task}
          commandDisabled={commandDisabled}
          onConfigure={(scenario) =>
            onCommand({ _tag: "configureScenario", taskId: task.id, scenario })
          }
          onRetry={(stageId) => onCommand({ _tag: "retryStage", taskId: task.id, stageId })}
        />
        {run?.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
            <span>{run.error}</span>
            <Button
              size="xs"
              variant="ghost-muted"
              className="ms-auto"
              onClick={() => setRunConfirmOpen(true)}
              disabled={commandDisabled}
            >
              Retry
            </Button>
          </div>
        ) : null}
        <section className="rounded-2xl border border-border/70 bg-muted/15 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Generated results</h2>
            <span className="text-xs text-muted-foreground">
              {run?.variants.length ?? 0} variants · {task.artifacts.length} artifacts
            </span>
          </div>
          {run?.variants.length ? (
            <ul className="mt-3 space-y-2">
              {run.variants.map((variant) => (
                <VariantRow
                  key={variant.id}
                  variant={variant}
                  environmentId={environmentId}
                  artifacts={task.artifacts.filter((artifact) => artifact.variantId === variant.id)}
                  onLaunchArtifact={(artifact) =>
                    onCommand({ _tag: "launchStorybook", taskId: task.id, artifactId: artifact.id })
                  }
                />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No generated variants yet. Run the scenario to create local candidates.
            </p>
          )}
        </section>
        <section className="rounded-2xl border border-border/70 bg-muted/15 p-4">
          <h2 className="text-sm font-semibold">Comments</h2>
          {task.comments.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No comments have been recorded.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {task.comments.map((comment) => (
                <CommentRow key={comment.id} comment={comment} />
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-border/70 bg-muted/15 p-4">
          <div className="flex items-center gap-2">
            <RocketIcon className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Publish</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Pushes the selected variant first, then sends prepared Jira comments. Partial failures
            stay visible for retry.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Select
              value={selectedVariantId}
              onValueChange={(value) => {
                setSelectedVariantId(value ?? undefined);
                onCommand({
                  _tag: "selectVariants",
                  taskId: task.id,
                  variantIds: value ? [value] : [],
                });
              }}
            >
              <SelectTrigger size="sm" className="min-w-52">
                <SelectValue placeholder="Choose a generated variant" />
              </SelectTrigger>
              <SelectPopup>
                {(run?.variants ?? []).map((variant) => (
                  <SelectItem key={variant.id} value={variant.id}>
                    {variant.label} · {variant.status}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Publish branch
              <Input
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                aria-label="Publish branch"
              />
            </label>
            <Button
              size="sm"
              disabled={
                selectedVariant === undefined ||
                selectedVariant.status !== "succeeded" ||
                commandDisabled
              }
              onClick={() => setPublishConfirmOpen(true)}
            >
              <GitBranchIcon />
              Publish
            </Button>
          </div>
          {task.publishes.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {task.publishes.map((publish) => (
                <li key={publish.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge
                    variant={
                      publish.phase === "succeeded"
                        ? "secondary"
                        : publish.phase === "failed"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {publish.phase}
                  </Badge>
                  <span className="text-muted-foreground">
                    {publish.branch} · {publish.commentCount} comments
                    {publish.pushedSha ? ` · ${publish.pushedSha.slice(0, 8)}` : ""}
                    {publish.remoteUrl ? ` · ${publish.remoteUrl}` : ""}
                  </span>
                  {publish.error ? <span className="text-destructive">{publish.error}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-2xs text-muted-foreground">
            Storybook shortcut: ⌘/Ctrl + Shift + S. Publishing remains a separate, explicit action.
          </p>
        </section>
        <section className="rounded-2xl border border-border/70 bg-muted/15 p-4">
          <h2 className="text-sm font-semibold">Activity</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Source updated {formatDateTime(task.issue.updatedAt)} · local processing state updated{" "}
            {formatDateTime(task.updatedAt)}
          </p>
        </section>
      </div>
      <AlertDialog open={runConfirmOpen} onOpenChange={setRunConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Start {task.scenario.maxVariants} task variants?</AlertDialogTitle>
            <AlertDialogDescription>
              This starts independent agent threads in separate worktrees. The scenario will use
              {" "}
              {task.scenario.stages.find((stage) => stage.kind === "agent")?.provider ?? "codex"}
              {" "}with full workspace access. Audit and checks remain pending until their workers
              report results.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              onClick={() => {
                setRunConfirmOpen(false);
                onCommand({ _tag: "runScenario", taskId: task.id });
              }}
            >
              Start scenario
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <AlertDialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish {selectedVariant?.label ?? "this variant"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Push the selected worktree to <strong>{branch}</strong>, then send {" "}
              {task.comments.filter((comment) => comment.source === "agent").length} prepared Jira
              comments. A partial failure keeps the push receipt for recovery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button onClick={publish}>Publish</Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
      <AlertDialog open={discardConfirmOpen} onOpenChange={setDiscardConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this local draft?</AlertDialogTitle>
            <AlertDialogDescription>
              The saved Jira source remains unchanged. Your local draft text will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>Cancel</AlertDialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setDiscardConfirmOpen(false);
                onCommand({ _tag: "discardDraft", taskId: task.id });
              }}
            >
              Discard draft
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </main>
  );
}

function unavailableState(
  message: string,
  action?: { label: string; onClick: () => void; disabled?: boolean },
  includeNavigation = true,
  className?: string,
) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
        <div className="max-w-sm">
          <AlertCircleIcon className="mx-auto size-8 text-muted-foreground/70" />
          <p className="mt-3 text-sm text-muted-foreground">{message}</p>
          {action ? (
            <Button className="mt-4" size="sm" onClick={action.onClick} disabled={action.disabled}>
              <RefreshCwIcon />
              {action.label}
            </Button>
          ) : null}
        </div>
      </div>
      {includeNavigation ? <TaskMobileNavigation /> : null}
    </div>
  );
}

function TaskMobileNavigation({
  environmentId,
  projectId,
}: {
  readonly environmentId?: EnvironmentId;
  readonly projectId?: ProjectId;
}) {
  const pullRequestsSupported = usePullRequestsSupported();
  return (
    <nav
      aria-label="Workspace navigation"
      className="fixed inset-x-0 bottom-0 z-20 flex h-14 items-center justify-around border-t border-border/70 bg-background/95 px-2 backdrop-blur md:hidden"
    >
      <Link
        to="/"
        aria-label="Home"
        className="rounded-lg p-2 text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <HomeIcon className="size-5" />
      </Link>
      <Link
        to="/automations"
        aria-label="Automations"
        className="rounded-lg p-2 text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <CalendarClockIcon className="size-5" />
      </Link>
      <Link
        to="/design"
        aria-label="Design"
        className="rounded-lg p-2 text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <PaletteIcon className="size-5" />
      </Link>
      {pullRequestsSupported ? (
        <Link
          to="/pull-requests"
          search={readPullRequestListPreferences()}
          aria-label="Pull requests"
          className="rounded-lg p-2 text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <PullRequestGlyph.pullRequest className="size-5" />
        </Link>
      ) : null}
      <Link
        to="/tasks"
        search={{
          ...(environmentId === undefined ? {} : { environmentId }),
          ...(projectId === undefined ? {} : { projectId }),
        }}
        aria-current="page"
        aria-label="Tasks"
        className="rounded-lg bg-secondary p-2 text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <ListTodoIcon className="size-5" />
      </Link>
      <Link
        to="/usage"
        aria-label="Usage"
        className="rounded-lg p-2 text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <GaugeIcon className="size-5" />
      </Link>
      <SidebarUpdatePill rail />
      <Link
        to="/settings"
        aria-label="Settings"
        className="rounded-lg p-2 text-muted-foreground hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <SettingsIcon className="size-5" />
      </Link>
    </nav>
  );
}

export function TasksWorkspace({ target }: { target: TaskWorkspaceSearch }) {
  const navigate = useNavigate();
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const projects = useProjects();
  const connected = environments.filter(
    (environment) =>
      environment.connection.phase === "connected" && environment.serverConfig !== null,
  );
  const environmentId = target.environmentId ?? primaryEnvironmentId ?? connected[0]?.environmentId;
  const environment = environmentId
    ? environments.find((entry) => entry.environmentId === environmentId)
    : undefined;
  const project = projects.find(
    (entry) =>
      entry.environmentId === environmentId &&
      (target.projectId === undefined || entry.id === target.projectId),
  );
  const projectId = project?.id;
  const workspaceRoot = project?.workspaceRoot;
  const projectOptions = projects
    .filter((entry) => entry.environmentId === environmentId)
    .map((entry) => ({ id: entry.id, label: entry.title }));
  const environmentOptions = connected.map((entry) => ({
    id: entry.environmentId,
    label: entry.label,
  }));
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const query = useEnvironmentQuery(
    environmentId && projectId && workspaceRoot
      ? taskWorkspaceRead({
          environmentId,
          input: {
            environmentId,
            projectId,
            workspaceRoot,
          },
        })
      : null,
  );
  const command = useAtomCommand(taskWorkspaceCommand, {
    label: "task workspace command",
    reportFailure: false,
  });
  const canCommand = useAtomValue(taskWorkspaceCommand.permissionAtom(environmentId ?? null));
  const [commandPending, setCommandPending] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandNotice, setCommandNotice] = useState<string | null>(null);
  const snapshot = query.data as TaskWorkspaceSnapshot | null;
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [jiraUrl, setJiraUrl] = useState("");
  const [secretProvider, setSecretProvider] = useState("");
  const [secretPath, setSecretPath] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const taskFromRoute = snapshot?.tasks.find((task) => task.id === target.taskId);
  const selectedTask = target.taskId === undefined ? undefined : taskFromRoute;
  const statusOptions = snapshot
    ? [...new Set(snapshot.tasks.map((task) => task.issue.status.name))].toSorted()
    : [];
  const assigneeOptions = snapshot
    ? [
        ...new Map(
          snapshot.tasks.flatMap((task) => {
            const id = task.issue.assigneeId ?? task.issue.assignee;
            return id === null ? [] : [[id, task.issue.assignee ?? id] as const];
          }),
        ),
      ]
        .map(([id, label]) => ({ id, label }))
        .toSorted((left, right) => left.label.localeCompare(right.label))
    : [];
  // Keeps the server-owned detached worker state visible while a run is active.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- timer is an external polling resource held until unmount
  useEffect(() => {
    if (snapshot === null || !snapshot.configured)
      return;
    const refreshId = window.setInterval(
      query.refresh,
      snapshot.tasks.some((task) => task.run?.status === "running") ? 2_000 : 30_000,
    );
    return () => window.clearInterval(refreshId);
  }, [query.refresh, snapshot]);
  const runCommand = async (payload: TaskWorkspaceCommand) => {
    if (
      environmentId === undefined ||
      projectId === undefined ||
      workspaceRoot === undefined ||
      snapshot === null ||
      !canCommand ||
      commandPending
    )
      return;
    setCommandPending(true);
    setCommandError(null);
    setCommandNotice(null);
    const result = await command({
      environmentId,
      input: {
        environmentId,
        projectId,
        workspaceRoot,
        revision: snapshot.revision,
        command: payload,
      } satisfies TaskWorkspaceCommandInput,
    });
    if (result._tag === "Failure") {
      const failure = squashAtomCommandFailure(result);
      setCommandError(
        failure instanceof Error ? failure.message : "The task action could not be completed.",
      );
    } else {
      const notices: Partial<Record<TaskWorkspaceCommand["_tag"], string>> = {
        sync: "Jira task list synchronized.",
        saveDraft: "Local draft saved.",
        discardDraft: "Local draft discarded.",
        configureScenario: "Scenario revision saved.",
        runScenario: "Scenario started in isolated worktrees.",
        cancelRun: "Worker cancellation requested.",
        publishVariant: "Publish request accepted; receipt is being updated.",
      };
      setCommandNotice(notices[payload._tag] ?? "Task action completed.");
    }
    query.refresh();
    setCommandPending(false);
  };
  if (environmentId === undefined)
    return unavailableState("Select a connected environment to view tasks.");
  if (environment === undefined || environment.connection.phase !== "connected")
    return unavailableState("Connect an environment to view tasks.");
  if (projectId === undefined || workspaceRoot === undefined)
    return unavailableState("Select a project with a connected task source.");
  if (query.error)
    return unavailableState(query.error, {
      label: "Retry",
      onClick: query.refresh,
      disabled: !canCommand,
    });
  if (snapshot === null && query.isPending)
    return (
      <>
        <div
          className="flex min-h-0 flex-1 items-center justify-center pb-16 text-sm text-muted-foreground"
          role="status"
        >
          <LoaderCircleIcon className="mr-2 size-4 animate-spin" />
          Loading tasks…
        </div>
        <TaskMobileNavigation environmentId={environmentId} projectId={projectId} />
      </>
    );
  if (snapshot === null || !snapshot.configured)
    return (
      <>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto scrollbar-gutter-both p-6 pb-20">
          <div className="w-full max-w-lg rounded-2xl border border-border/70 bg-muted/15 p-5">
            <h1 className="text-base font-semibold">Connect Jira task source</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Store only the Jira URL and a server-side secret reference. The token never enters the
              browser or local task snapshot.
            </p>
            <div className="mt-4 grid gap-3">
              <Input
                value={jiraUrl || snapshot?.connection.url || ""}
                onChange={(event) => setJiraUrl(event.target.value)}
                placeholder="https://jira.example.com"
                aria-label="Jira URL"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Input
                  value={secretProvider}
                  onChange={(event) => setSecretProvider(event.target.value)}
                  placeholder="Secret provider"
                  aria-label="Secret provider"
                />
                <Input
                  value={secretPath}
                  onChange={(event) => setSecretPath(event.target.value)}
                  placeholder="Secret reference"
                  aria-label="Secret reference"
                />
              </div>
              <Input
                value={jiraProjectKey}
                onChange={(event) => setJiraProjectKey(event.target.value)}
                placeholder="Jira project key, for example NEUROKEY"
                aria-label="Jira project key"
              />
              {snapshot?.error ? <p className="text-sm text-destructive">{snapshot.error}</p> : null}
              <Button
                className="w-full justify-center"
                disabled={commandPending || !canCommand || jiraUrl.trim() === ""}
                onClick={() =>
                  void runCommand({
                    _tag: "configureJira",
                    url: jiraUrl.trim(),
                    username: null,
                    secretRef:
                      secretProvider.trim() !== "" && secretPath.trim() !== ""
                        ? {
                            provider: secretProvider.trim() as SecretProviderId,
                            reference: secretPath.trim(),
                          }
                        : null,
                    projectKeys: jiraProjectKey.trim() === "" ? [] : [jiraProjectKey.trim()],
                  })
                }
              >
                Connect and sync
              </Button>
            </div>
          </div>
        </div>
        <TaskMobileNavigation environmentId={environmentId} projectId={projectId} />
      </>
    );
  return (
    <>
      {snapshot.error ? (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/8 px-3 py-2 text-sm text-destructive md:mx-4">
          <AlertCircleIcon className="size-4 shrink-0" />
          <span className="min-w-0 flex-1">{snapshot.error}</span>
          <Button
            size="xs"
            variant="ghost-muted"
            onClick={() => void runCommand({ _tag: "sync" })}
            disabled={commandPending || !canCommand}
          >
            Retry sync
          </Button>
        </div>
      ) : null}
      <div
        className="flex h-full min-h-0 w-full flex-1 flex-col bg-background md:flex-row"
        data-task-workspace="true"
      >
        <div
          className={cn(
            "h-full min-h-0 flex-1 md:flex-none md:w-(--automations-sidebar-width)",
            selectedTask ? "max-md:hidden" : "flex",
          )}
        >
          <TaskList
            tasks={snapshot.tasks}
            contextLabel={`${project?.title ?? projectId} · ${environment.label ?? environment.environmentId}`}
            environmentId={environmentId}
            environmentOptions={environmentOptions}
            projectId={projectId}
            projectOptions={projectOptions}
            lastSyncedAt={snapshot.lastSyncedAt}
            assigneeFilter={assigneeFilter}
            assigneeOptions={assigneeOptions}
            statusFilter={statusFilter}
            statusOptions={statusOptions}
            onEnvironmentChange={(value) => {
              setAssigneeFilter("");
              void navigate({ to: "/tasks", search: { environmentId: value } });
            }}
            onProjectChange={(value) => {
              setAssigneeFilter("");
              void navigate({ to: "/tasks", search: { environmentId, projectId: value } });
            }}
            onAssigneeChange={setAssigneeFilter}
            onStatusFilterChange={setStatusFilter}
            selectedId={selectedTask?.id}
            filter={filter}
            onFilterChange={setFilter}
            onSync={() => void runCommand({ _tag: "sync" })}
            syncDisabled={commandPending || !canCommand}
            onSelect={(task) => {
              setCommandError(null);
              setCommandNotice(null);
              void navigate({ to: "/tasks", search: { environmentId, projectId, taskId: task.id } });
            }}
          />
        </div>
        {selectedTask ? (
          <TaskDetails
            key={selectedTask.id}
            task={selectedTask}
            environmentId={environmentId}
            onCommand={runCommand}
            onBack={() => void navigate({ to: "/tasks", search: { environmentId, projectId } })}
            commandDisabled={commandPending || !canCommand}
            commandError={commandError}
            commandNotice={commandNotice}
          />
        ) : (
          unavailableState(
            target.taskId
              ? "This task is no longer in the selected project."
              : "Select a task to inspect its source and processing scenario.",
            undefined,
            false,
            "max-md:hidden",
          )
        )}
      </div>
      <TaskMobileNavigation environmentId={environmentId} projectId={projectId} />
    </>
  );
}
