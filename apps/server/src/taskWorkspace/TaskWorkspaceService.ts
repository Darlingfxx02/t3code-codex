import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import {
  TaskWorkspaceCommandInput,
  TaskWorkspaceError,
  TaskWorkspaceReadInput,
  TaskWorkspaceSnapshot,
  type TaskWorkspaceCommand,
  type TaskWorkspaceConnection,
  type TaskWorkspaceIssue,
  type TaskWorkspaceScenario,
  type TaskWorkspaceTask,
  type TaskWorkspaceCheckResult,
  type TaskWorkspaceArtifact,
  type TaskWorkspaceComment,
  type TaskWorkspaceVariant,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import * as WorkspaceFileSystem from "../workspace/WorkspaceFileSystem.ts";
import { createJiraClient, JiraClientError } from "./jiraClient.ts";

const LEGACY_STATE_FILE = ".t3/task-workspace.json";
const STATE_DIRECTORY = ".t3/task-workspace";
const STATE_SEMAPHORES = new Map<string, Semaphore.Semaphore>();
const DISPATCH_SEMAPHORES = new Map<string, Semaphore.Semaphore>();
const ACTIVE_MONITORS = new Set<string>();
const AUTO_SYNC_INTERVAL_MS = 30_000;
const AUTO_SYNC_WATCHERS = new Set<string>();

type WorkspaceFileSystemService = WorkspaceFileSystem.WorkspaceFileSystem["Service"];
type JiraClient = ReturnType<typeof createJiraClient>;
const decodeSnapshot = Schema.decodeUnknownSync(TaskWorkspaceSnapshot);
const isTaskWorkspaceError = Schema.is(TaskWorkspaceError);

/** Optional host integrations. The default service remains useful in local-only mode. */
export interface TaskWorkspaceAdapters {
  readonly backgroundSync?: boolean;
  readonly jiraClientFor?: (
    connection: TaskWorkspaceConnection,
  ) => Effect.Effect<JiraClient | null, TaskWorkspaceError>;
  readonly launchStorybook?: (input: {
    readonly workspaceRoot: string;
    readonly storyId: string;
    readonly url: string | null;
  }) => Effect.Effect<void, TaskWorkspaceError>;
  readonly publishVariant?: (input: {
    readonly workspaceRoot: string;
    readonly branch: string;
    readonly variant: TaskWorkspaceVariant;
  }) => Effect.Effect<{ readonly pushedSha: string; readonly remoteUrl?: string }, TaskWorkspaceError>;
  readonly dispatchVariants?: (input: {
    readonly workspaceRoot: string;
    readonly projectId: ProjectId;
    readonly task: TaskWorkspaceTask;
    readonly runId: string;
    readonly variants: ReadonlyArray<TaskWorkspaceVariant>;
    readonly onVariant?: (entry: {
      readonly variantId: string;
      readonly threadId: ThreadId;
      readonly worktreePath: string | null;
      readonly sourceSha: string;
    }) => Effect.Effect<void, TaskWorkspaceError>;
  }) => Effect.Effect<
    ReadonlyArray<{
      readonly variantId: string;
      readonly threadId: ThreadId;
      readonly worktreePath: string | null;
      readonly sourceSha: string;
    }>,
    TaskWorkspaceError
  >;
  readonly cancelVariants?: (input: {
    readonly projectId: ProjectId;
    readonly threadIds: ReadonlyArray<ThreadId>;
  }) => Effect.Effect<void, TaskWorkspaceError>;
  readonly monitorRun?: (input: {
    readonly workspaceRoot: string;
    readonly projectId: ProjectId;
    readonly task: TaskWorkspaceTask;
    readonly run: NonNullable<TaskWorkspaceTask["run"]>;
    readonly report: (update: {
      readonly variantId: string;
      readonly status: "succeeded" | "failed" | "cancelled";
      readonly stageId?: string;
      readonly stageCompleted?: boolean;
      readonly error?: string | null;
      readonly output?: string;
      readonly final?: boolean;
      readonly checks?: ReadonlyArray<TaskWorkspaceCheckResult>;
      readonly threadIds?: ReadonlyArray<ThreadId>;
      readonly comments?: ReadonlyArray<TaskWorkspaceComment>;
      readonly artifacts?: ReadonlyArray<TaskWorkspaceArtifact>;
    }) => Effect.Effect<void, TaskWorkspaceError>;
    readonly recordThread: (
      variantId: string,
      threadIds: ReadonlyArray<ThreadId>,
    ) => Effect.Effect<void, TaskWorkspaceError>;
    readonly isCancelled: Effect.Effect<boolean, TaskWorkspaceError>;
  }) => Effect.Effect<void, TaskWorkspaceError>;
}

export class TaskWorkspaceService extends Context.Service<
  TaskWorkspaceService,
  {
    readonly read: (
      input: TaskWorkspaceReadInput,
    ) => Effect.Effect<TaskWorkspaceSnapshot, TaskWorkspaceError>;
    readonly command: (
      input: TaskWorkspaceCommandInput,
    ) => Effect.Effect<TaskWorkspaceSnapshot, TaskWorkspaceError>;
  }
>()("t3/taskWorkspace/TaskWorkspaceService") {}

const now = () => DateTime.formatIso(DateTime.nowUnsafe());

const emptySnapshot = (): TaskWorkspaceSnapshot => ({
  revision: 0,
  configured: false,
  connection: { configured: false, url: null, username: null, secretConfigured: false, projectKeys: [] },
  assignee: null,
  sprints: [],
  tasks: [],
  lastSyncedAt: null,
  error: null,
});

function taskError(operation: string, message: string, cause?: unknown): TaskWorkspaceError {
  return new TaskWorkspaceError({
    operation,
    message,
    ...(cause === undefined ? {} : { cause }),
  });
}

function stateFile(input: Pick<TaskWorkspaceReadInput, "environmentId" | "projectId">): string {
  const segment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
  return `${STATE_DIRECTORY}/${segment(input.environmentId)}/${segment(input.projectId)}.json`;
}

function jiraSourceKey(connection: Pick<TaskWorkspaceConnection, "url" | "username" | "projectKeys">): string {
  const raw = `${connection.url ?? ""}|${connection.username ?? ""}|${[...(connection.projectKeys ?? [])]
    .sort()
    .join(",")}`;
  let hash = 2_166_136_261;
  for (const character of raw) hash = Math.imul(hash ^ character.charCodeAt(0), 16_777_619);
  return `${(hash >>> 0).toString(16)}-${raw.length}`;
}

function sourceStateFile(
  input: Pick<TaskWorkspaceReadInput, "environmentId" | "projectId">,
  connection: Pick<TaskWorkspaceConnection, "url" | "username" | "projectKeys">,
): string {
  const segment = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
  return `${STATE_DIRECTORY}/${segment(input.environmentId)}/${segment(input.projectId)}/${jiraSourceKey(connection)}.json`;
}

function sameJiraSource(
  left: Pick<TaskWorkspaceConnection, "url" | "username" | "projectKeys">,
  right: Pick<TaskWorkspaceConnection, "url" | "username" | "projectKeys">,
): boolean {
  return (
    (left.url ?? "") === (right.url ?? "") &&
    (left.username ?? "") === (right.username ?? "") &&
    [...(left.projectKeys ?? [])].sort().join(",") === [...(right.projectKeys ?? [])].sort().join(",")
  );
}

function taskId(environmentId: string, projectId: string, issueKey: string): string {
  return `${environmentId}:${projectId}:${issueKey}`;
}

function defaultScenario(): TaskWorkspaceScenario {
  return {
    id: "default-local-review",
    name: "Independent variants and checks",
    stages: [
      {
        id: "variants",
        name: "Generate independent variants",
        kind: "agent",
        dependsOn: [],
        parallel: true,
        provider: null,
        model: null,
        skills: [],
        connectors: [],
        command: null,
        required: true,
        rules: ["Keep each variant in its own worktree."],
        prompt: "Implement the task without publishing external changes.",
        timeoutMs: 1_800_000,
      },
      {
        id: "audit",
        name: "Audit and select viable variants",
        kind: "audit",
        dependsOn: ["variants"],
        parallel: false,
        provider: null,
        model: null,
        skills: [],
        connectors: [],
        command: null,
        required: true,
        rules: ["Report evidence and unresolved risks."],
        prompt: "Compare the generated variants and explain the selection.",
        timeoutMs: 900_000,
      },
      {
        id: "checks",
        name: "Run project checks",
        kind: "check",
        dependsOn: ["audit"],
        parallel: false,
        provider: null,
        model: null,
        skills: [],
        connectors: [],
        command: null,
        required: true,
        rules: ["Attach command output; never infer a pass."],
        prompt: "Run the configured checks in the selected worktrees.",
        timeoutMs: 900_000,
      },
    ],
    maxVariants: 5,
    maxRetries: 1,
    enabled: true,
    autoStart: false,
    revision: 0,
    selectedVariantIds: [],
  };
}

function parseSnapshot(contents: string): TaskWorkspaceSnapshot {
  try {
    const value: unknown = JSON.parse(contents);
    return decodeSnapshot(value);
  } catch (cause) {
    throw taskError("read", "Task workspace state is malformed and was not used.", cause);
  }
}

function validateScenario(scenario: TaskWorkspaceScenario): void {
  const ids = new Set<string>();
  scenario.stages.forEach((stage) => {
    if (ids.has(stage.id)) throw taskError("configureScenario", `Duplicate stage ${stage.id}.`);
    ids.add(stage.id);
  });
  scenario.stages.forEach((stage) => {
    if (stage.dependsOn.some((dependency) => dependency === stage.id || !ids.has(dependency))) {
      throw taskError("configureScenario", `Invalid dependency in stage ${stage.id}.`);
    }
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id))
      throw taskError("configureScenario", "Scenario dependencies contain a cycle.");
    if (visited.has(id)) return;
    visiting.add(id);
    scenario.stages.find((entry) => entry.id === id)?.dependsOn.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  scenario.stages.forEach((stage) => visit(stage.id));
}

function sortedTasks(tasks: ReadonlyArray<TaskWorkspaceTask>): TaskWorkspaceTask[] {
  return [...tasks].sort((left, right) => {
    const created = left.issue.createdAt.localeCompare(right.issue.createdAt);
    return created === 0 ? left.issue.key.localeCompare(right.issue.key) : created;
  });
}

function updateTask(
  snapshot: TaskWorkspaceSnapshot,
  taskIdToUpdate: string,
  update: (task: TaskWorkspaceTask) => TaskWorkspaceTask,
): TaskWorkspaceSnapshot {
  const index = snapshot.tasks.findIndex((task) => task.id === taskIdToUpdate);
  if (index < 0) throw taskError("command", `Task ${taskIdToUpdate} was not found.`);
  const tasks = snapshot.tasks.slice();
  const current = tasks[index];
  if (current === undefined) throw taskError("command", `Task ${taskIdToUpdate} was not found.`);
  tasks[index] = update(current);
  return { ...snapshot, tasks, revision: snapshot.revision + 1, error: null };
}

export function updateVariantRun(
  snapshot: TaskWorkspaceSnapshot,
  update: {
    readonly taskId: string;
    readonly runId: string;
    readonly variantId: string;
    readonly status: "succeeded" | "failed" | "cancelled";
    readonly stageId?: string;
    readonly stageCompleted?: boolean;
    readonly error?: string | null;
    readonly output?: string;
    readonly final?: boolean;
    readonly checks?: ReadonlyArray<TaskWorkspaceCheckResult>;
    readonly threadIds?: ReadonlyArray<ThreadId>;
    readonly comments?: ReadonlyArray<TaskWorkspaceComment>;
    readonly artifacts?: ReadonlyArray<TaskWorkspaceArtifact>;
  },
): TaskWorkspaceSnapshot {
  return updateTask(snapshot, update.taskId, (task) => {
    if (task.run === null || task.run.id !== update.runId) return task;
    const variants = task.run.variants.map((variant) =>
      variant.id === update.variantId
        ? {
            ...variant,
            ...( ["cancelled", "failed", "succeeded"].includes(task.run!.status)
              ? {}
              : { status: update.status, error: update.error ?? null }),
            ...(update.output === undefined ? {} : { output: update.output }),
            ...(update.stageCompleted !== true || update.stageId === undefined
              ? {}
              : {
                  completedStageIds: [
                    ...new Set([...(variant.completedStageIds ?? []), update.stageId]),
                  ],
                }),
            ...(update.checks === undefined ? {} : { checks: update.checks }),
            ...(update.artifacts === undefined
              ? {}
              : {
                  artifactIds: [
                    ...new Set([
                      ...variant.artifactIds,
                      ...update.artifacts
                        .filter((artifact) => artifact.variantId === variant.id)
                        .map((artifact) => artifact.id),
                    ]),
                  ],
                }),
            ...(update.threadIds === undefined
              ? {}
              : { threadIds: [...new Set([...variant.threadIds, ...update.threadIds])] }),
          }
        : variant,
    );
    if (["cancelled", "failed", "succeeded"].includes(task.run.status)) {
      return {
        ...task,
        run: {
          ...task.run,
          variants,
          ...(update.threadIds === undefined
            ? {}
            : {
                workerThreadIds: [
                  ...new Set([...(task.run.workerThreadIds ?? []), ...update.threadIds]),
                ],
              }),
        },
        ...(update.comments === undefined
          ? {}
          : {
              comments: [
                ...task.comments,
                ...update.comments.filter(
                  (comment) => !task.comments.some((existing) => existing.id === comment.id),
                ),
              ],
            }),
        ...(update.artifacts === undefined
          ? {}
          : {
              artifacts: [
                ...task.artifacts,
                ...update.artifacts.filter(
                  (artifact) => !task.artifacts.some((existing) => existing.id === artifact.id),
                ),
              ],
            }),
        updatedAt: now(),
      };
    }
    const allTerminal = variants.every((variant) =>
      ["succeeded", "failed", "cancelled"].includes(variant.status),
    );
    const anyFailed = variants.some((variant) => variant.status === "failed");
    const anyCancelled = variants.some((variant) => variant.status === "cancelled");
    const stageCompletedForAllVariants =
      update.stageCompleted === true &&
      update.stageId !== undefined &&
      variants.every((variant) => variant.completedStageIds?.includes(update.stageId!));
    const reportedCompletedStageIds =
      stageCompletedForAllVariants && update.stageId !== undefined
        ? [...new Set([...task.run.completedStageIds, update.stageId])]
        : task.run.completedStageIds;
    const nextRunnableStage = task.scenario.stages.find(
      (stage) =>
        !reportedCompletedStageIds.includes(stage.id) &&
        stage.dependsOn.every((dependency) => reportedCompletedStageIds.includes(dependency)),
    );
    const publishPending =
      update.final === true &&
      update.stageCompleted !== true &&
      update.stageId !== undefined &&
      task.scenario.stages.find((stage) => stage.id === update.stageId)?.kind === "publish";
    const agentStage = task.scenario.stages.find((stage) => stage.kind === "agent");
    const nextStage = task.scenario.stages.find((stage) => stage.dependsOn.includes(agentStage?.id ?? ""));
    return {
      ...task,
      run: {
        ...task.run,
        variants,
        ...(update.threadIds === undefined
          ? {}
          : {
              workerThreadIds: [
                ...new Set([...(task.run.workerThreadIds ?? []), ...update.threadIds]),
              ],
            }),
        status: allTerminal
          ? update.final && !anyFailed && !anyCancelled
            ? "succeeded"
            : anyFailed
            ? "failed"
            : anyCancelled
              ? "cancelled"
              : nextStage === undefined
                ? "succeeded"
                : "running"
          : "running",
        currentStageId:
          publishPending
            ? update.stageId!
            : update.stageCompleted === true && update.stageId !== undefined && !update.final
            ? nextRunnableStage?.id ?? null
            : allTerminal
              ? update.final && !anyFailed && !anyCancelled
                ? null
                : nextStage?.id ?? (anyFailed || anyCancelled ? task.run.currentStageId : null)
              : task.run.currentStageId,
        completedStageIds:
          update.final && !anyFailed && !anyCancelled
            ? task.scenario.stages
                .filter((stage) => !publishPending || stage.kind !== "publish")
                .map((stage) => stage.id)
            : allTerminal && agentStage !== undefined && !anyFailed
              ? [...new Set([...reportedCompletedStageIds, agentStage.id])]
              : reportedCompletedStageIds,
        finishedAt:
          allTerminal &&
          (anyFailed || anyCancelled || nextStage === undefined || update.final)
            ? now()
            : null,
        error: anyFailed
          ? "One or more agent variants failed."
          : anyCancelled
            ? "One or more agent variants were cancelled."
            : null,
      },
      ...(update.comments === undefined
        ? {}
        : {
            comments: [
              ...task.comments,
              ...update.comments.filter(
                (comment) => !task.comments.some((existing) => existing.id === comment.id),
              ),
            ],
          }),
      ...(update.artifacts === undefined
        ? {}
        : {
            artifacts: [
              ...task.artifacts,
              ...update.artifacts.filter(
                (artifact) => !task.artifacts.some((existing) => existing.id === artifact.id),
              ),
            ],
          }),
      updatedAt: now(),
    };
  });
}

function attachVariantThreads(
  snapshot: TaskWorkspaceSnapshot,
  update: {
    readonly taskId: string;
    readonly runId: string;
    readonly variantId: string;
    readonly threadIds: ReadonlyArray<ThreadId>;
  },
): TaskWorkspaceSnapshot {
  return updateTask(snapshot, update.taskId, (task) => {
    if (task.run === null || task.run.id !== update.runId) return task;
    const variant = task.run.variants.find((entry) => entry.id === update.variantId);
    if (variant === undefined) return task;
    const threadIds = [...new Set([...variant.threadIds, ...update.threadIds])];
    return {
      ...task,
      run: {
        ...task.run,
        workerThreadIds: [...new Set([...(task.run.workerThreadIds ?? []), ...update.threadIds])],
        variants: task.run.variants.map((entry) =>
          entry.id === update.variantId ? { ...entry, threadIds } : entry,
        ),
      },
      updatedAt: now(),
    };
  });
}

function mergeIssue(
  input: TaskWorkspaceReadInput,
  issue: TaskWorkspaceIssue,
  previous: TaskWorkspaceTask | undefined,
): TaskWorkspaceTask {
  const previousComments = previous?.comments ?? [];
  return {
    id: taskId(input.environmentId, input.projectId, issue.key),
    environmentId: input.environmentId,
    projectId: input.projectId,
    issue,
    draft: previous?.draft ?? null,
    scenario: previous?.scenario ?? defaultScenario(),
    run: previous?.run ?? null,
    // Jira is the source of truth for Jira comments: replace its snapshot so
    // edits/deletions are reflected while preserving local agent/system notes.
    comments: [
      ...previousComments.filter((comment) => comment.source !== "jira"),
      ...issue.comments,
    ],
    artifacts: previous?.artifacts ?? [],
    publishes: previous?.publishes ?? [],
    createdAt: previous?.createdAt ?? issue.createdAt,
    updatedAt: now(),
  };
}

function defaultJiraClient(connection: TaskWorkspaceConnection): JiraClient | null {
  const url = process.env.T3_JIRA_URL?.trim() || connection.url?.trim();
  const token = process.env.T3_JIRA_TOKEN?.trim();
  if (!url || !token) return null;
  return createJiraClient({
    baseUrl: url,
    token,
    username: process.env.T3_JIRA_USERNAME?.trim() || connection.username,
  });
}

function jiraFailure(cause: unknown): TaskWorkspaceError {
  if (cause instanceof JiraClientError) return taskError("sync", cause.message, cause);
  return taskError(
    "sync",
    "Jira synchronization failed. Previous local tasks were preserved.",
    cause,
  );
}

export function makeTaskWorkspaceService(
  workspaceFileSystem: WorkspaceFileSystemService,
  adapters: TaskWorkspaceAdapters = {},
  semaphore?: Semaphore.Semaphore,
) {
  const lockFor = (input: Pick<TaskWorkspaceReadInput, "environmentId" | "projectId" | "workspaceRoot">) => {
    if (semaphore !== undefined) return semaphore;
    const key = stateFile(input);
    const existing = STATE_SEMAPHORES.get(key);
    if (existing !== undefined) return existing;
    const created = Semaphore.makeUnsafe(1);
    STATE_SEMAPHORES.set(key, created);
    return created;
  };
  const dispatchLockFor = (
    input: Pick<TaskWorkspaceReadInput, "environmentId" | "projectId">,
  ) => {
    const key = stateFile(input);
    const existing = DISPATCH_SEMAPHORES.get(key);
    if (existing !== undefined) return existing;
    const created = Semaphore.makeUnsafe(1);
    DISPATCH_SEMAPHORES.set(key, created);
    return created;
  };
  const decodeStored = Effect.fn("TaskWorkspace.decodeStored")(function* (
    contents: string,
    operation: string,
  ) {
    return yield* Effect.try({
      try: () => parseSnapshot(contents),
      catch: (cause) =>
        isTaskWorkspaceError(cause)
          ? cause
          : taskError("read", `Could not decode ${operation} task workspace state.`, cause),
    });
  });
  const readStored = (
    input: Pick<TaskWorkspaceReadInput, "environmentId" | "projectId" | "workspaceRoot">,
  ) =>
    workspaceFileSystem
      .readFile({ cwd: input.workspaceRoot, relativePath: stateFile(input), allowMissing: true })
      .pipe(
        Effect.flatMap((result) =>
          result.exists !== false
            ? decodeStored(result.contents, "stored")
            : workspaceFileSystem
                .readFile({ cwd: input.workspaceRoot, relativePath: LEGACY_STATE_FILE, allowMissing: true })
                .pipe(
                  Effect.flatMap((legacy) =>
                    legacy.exists !== false
                      ? decodeStored(legacy.contents, "legacy")
                      : Effect.succeed(emptySnapshot()),
                  ),
                ),
        ),
        // @effect-diagnostics-next-line flatMapConditionalToFilterOrFail:off - a missing source file intentionally falls back to the pointer snapshot.
        Effect.flatMap((snapshot) =>
          snapshot.connection.url === null
            ? Effect.succeed(snapshot)
            : workspaceFileSystem
                .readFile({
                  cwd: input.workspaceRoot,
                  relativePath: sourceStateFile(input, snapshot.connection),
                  allowMissing: true,
                })
                .pipe(
                  Effect.flatMap((source) =>
                    source.exists === false ? Effect.succeed(snapshot) : decodeStored(source.contents, "source"),
                  ),
                ),
        ),
        Effect.mapError((cause) =>
          isTaskWorkspaceError(cause)
            ? cause
            : taskError("read", "Could not read task workspace state.", cause),
        ),
        Effect.map((snapshot) => ({
          ...snapshot,
          tasks: snapshot.tasks.filter(
            (task) =>
              task.environmentId === input.environmentId && task.projectId === input.projectId,
          ),
        })),
      );

  const writeStored = Effect.fn("TaskWorkspace.writeStored")(function* (
    input: Pick<TaskWorkspaceReadInput, "environmentId" | "projectId" | "workspaceRoot">,
    snapshot: TaskWorkspaceSnapshot,
  ) {
    return yield* Effect.gen(function* () {
      // @effect-diagnostics-next-line preferSchemaOverJson:off - snapshot is already schema-decoded and persisted as human-readable local state.
      const contents = JSON.stringify(snapshot, null, 2);
      if (snapshot.connection.url !== null)
        yield* workspaceFileSystem.writeFile({
          cwd: input.workspaceRoot,
          relativePath: sourceStateFile(input, snapshot.connection),
          contents,
        });
      yield* workspaceFileSystem.writeFile({
        cwd: input.workspaceRoot,
        relativePath: stateFile(input),
        contents,
      });
      return snapshot;
    }).pipe(
      Effect.mapError((cause) => taskError("write", "Could not persist task workspace state.", cause)),
    );
  });
  const readSourceStored = Effect.fn("TaskWorkspace.readSourceStored")(function* (
    input: Pick<TaskWorkspaceReadInput, "environmentId" | "projectId" | "workspaceRoot">,
    connection: Pick<TaskWorkspaceConnection, "url" | "username" | "projectKeys">,
  ) {
    return yield* workspaceFileSystem
      .readFile({
        cwd: input.workspaceRoot,
        relativePath: sourceStateFile(input, connection),
        allowMissing: true,
      })
      .pipe(
        Effect.flatMap((source) =>
          source.exists === false ? Effect.succeed(null) : decodeStored(source.contents, "source"),
        ),
        Effect.mapError((cause) =>
          isTaskWorkspaceError(cause)
            ? cause
            : taskError("read", "Could not read Jira source state.", cause),
        ),
      );
  });

  const readUnlocked = Effect.fn("TaskWorkspace.read")(function* (input: TaskWorkspaceReadInput) {
    const stored = yield* readStored(input);
    const lastSyncedAtMs = stored.lastSyncedAt === null ? 0 : Date.parse(stored.lastSyncedAt);
    const shouldInitialSync =
      (stored.lastSyncedAt === null ||
        !Number.isFinite(lastSyncedAtMs) ||
        DateTime.toEpochMillis(DateTime.nowUnsafe()) - lastSyncedAtMs >= AUTO_SYNC_INTERVAL_MS) &&
      (Boolean(process.env.T3_JIRA_TOKEN?.trim()) || stored.connection.secretConfigured);
    const snapshot = shouldInitialSync
      ? yield* sync(input, stored).pipe(
          Effect.flatMap((synced) => {
            return startAutoTasks(
              { ...input, revision: synced.revision, command: { _tag: "sync" } },
              synced,
            ).pipe(Effect.flatMap((started) => writeStored(input, started)));
          }),
          Effect.catch((cause) => Effect.succeed({ ...stored, error: cause.message })),
        )
      : stored;
    if (adapters.monitorRun !== undefined) {
      yield* Effect.forEach(snapshot.tasks, (task) => startMonitor(input, task), { discard: true });
    }
    const assignee = input.assignee?.trim();
    const tasks = sortedTasks(
      snapshot.tasks.filter((task) => {
        const assigneeMatch =
          assignee === undefined ||
          assignee === "" ||
          task.issue.assigneeId === assignee ||
          task.issue.assignee === assignee;
        const sprintMatch =
          input.sprintId === undefined || task.issue.sprint?.id === input.sprintId;
        return assigneeMatch && sprintMatch;
      }),
    );
    return { ...snapshot, assignee: assignee || snapshot.assignee, tasks };
  });

  const sync = Effect.fn("TaskWorkspace.sync")(function* (
    input: TaskWorkspaceReadInput,
    snapshot: TaskWorkspaceSnapshot,
  ) {
    const client =
      adapters.jiraClientFor === undefined
        ? yield* Effect.try({
            try: () => defaultJiraClient(snapshot.connection),
            catch: (cause) => taskError("sync", "Jira credential could not be resolved.", cause),
          })
        : yield* adapters.jiraClientFor(snapshot.connection);
    if (client === null)
      return yield* new TaskWorkspaceError({
        operation: "sync",
        message:
          "Jira is not connected. Set T3_JIRA_URL/T3_JIRA_TOKEN or configure a server secret reference.",
      });
    const result = yield* Effect.tryPromise({
      try: () =>
        client.searchIssues({
          assignee: input.assignee ?? null,
          ...(snapshot.connection.projectKeys === undefined
            ? {}
            : { projectKeys: snapshot.connection.projectKeys }),
        }),
      catch: jiraFailure,
    });
    const previous = new Map(snapshot.tasks.map((task) => [task.issue.key, task] as const));
    return {
      ...snapshot,
      configured: true,
      connection: {
        ...snapshot.connection,
        configured: true,
        url: snapshot.connection.url ?? process.env.T3_JIRA_URL ?? null,
        secretConfigured: true,
      },
      sprints: result.sprints.slice(),
      tasks: sortedTasks(
        result.issues.map((issue) => mergeIssue(input, issue, previous.get(issue.key))),
      ),
      lastSyncedAt: now(),
      error: null,
      revision: snapshot.revision + 1,
    };
  });

  const startTaskRun = Effect.fn("TaskWorkspace.startTaskRun")(function* (
    input: TaskWorkspaceCommandInput,
    snapshot: TaskWorkspaceSnapshot,
    taskIdToRun: string,
  ) {
    const task = snapshot.tasks.find((entry) => entry.id === taskIdToRun);
    if (task === undefined)
      return yield* taskError("runScenario", `Task ${taskIdToRun} was not found.`);
    if (!task.scenario.enabled)
      return yield* taskError("runScenario", "This scenario is disabled.");
    if (task.run?.status === "queued" || task.run?.status === "running")
      return yield* taskError("runScenario", "This task already has an active run.");
    const runId = `run-${DateTime.formatIso(DateTime.nowUnsafe()).replace(/[^0-9]/g, "")}`;
    const variants = Array.from(
      { length: task.scenario.maxVariants },
      (_, index): TaskWorkspaceVariant => ({
        id: `${runId}-variant-${index + 1}`,
        label: `Variant ${index + 1}`,
        status: "queued",
        worktreePath: null,
        sourceSha: task.issue.sourceRevision,
        threadIds: [],
        checks: [],
        artifactIds: [],
        error: null,
      }),
    );
    const run = {
      id: runId,
      status: "queued" as const,
      sourceRevision: task.issue.sourceRevision,
      startedAt: null,
      finishedAt: null,
      currentStageId: task.scenario.stages[0]?.id ?? null,
      variantCount: variants.length,
      completedStageIds: [],
      error: null,
      workerThreadIds: [],
      variants,
    };
    const queuedSnapshot = updateTask(snapshot, taskIdToRun, (current) => ({
      ...current,
      run,
      updatedAt: now(),
    }));
    // Persist the queued run before creating provider threads. If dispatch or the
    // server fails halfway through, restart/cancel still has a durable run to reconcile.
    yield* writeStored(input, queuedSnapshot);
    let durableSnapshot = queuedSnapshot;
    const durableDispatched: Array<{
      readonly variantId: string;
      readonly threadId: ThreadId;
      readonly worktreePath: string | null;
      readonly sourceSha: string;
    }> = [];
    const onVariant = (entry: (typeof durableDispatched)[number]) => {
      return dispatchLockFor(input).withPermits(1)(
        Effect.gen(function* () {
          durableDispatched.push(entry);
          durableSnapshot = updateTask(durableSnapshot, taskIdToRun, (current) => ({
            ...current,
            run:
              current.run === null
                ? current.run
                : {
                    ...current.run,
                    status: "running",
                    startedAt: current.run.startedAt ?? now(),
                    workerThreadIds: [
                      ...new Set([...(current.run.workerThreadIds ?? []), entry.threadId]),
                    ],
                    variants: current.run.variants.map((variant) =>
                      variant.id === entry.variantId
                        ? {
                            ...variant,
                            status: "running" as const,
                            worktreePath: entry.worktreePath,
                            sourceSha: entry.sourceSha,
                            threadIds: [...new Set([...variant.threadIds, entry.threadId])],
                          }
                        : variant,
                    ),
                  },
            updatedAt: now(),
          }));
          yield* writeStored(input, durableSnapshot);
        }),
      );
    };
    const returnedDispatched =
      adapters.dispatchVariants === undefined
        ? []
        : yield* adapters.dispatchVariants({
            workspaceRoot: input.workspaceRoot,
            projectId: input.projectId,
            task,
            runId,
            variants,
            onVariant,
          });
    const dispatched = [
      ...durableDispatched,
      ...returnedDispatched.filter(
        (entry) => !durableDispatched.some((existing) => existing.variantId === entry.variantId),
      ),
    ];
    const dispatchByVariant = new Map(dispatched.map((entry) => [entry.variantId, entry] as const));
    return updateTask(durableSnapshot, taskIdToRun, (current) => ({
      ...current,
      run:
        dispatched.length === 0
          ? run
          : {
              ...run,
              sourceRevision: dispatched[0]?.sourceSha ?? run.sourceRevision,
              workerThreadIds: dispatched.map((entry) => entry.threadId),
              status: "running",
              startedAt: now(),
              variants: run.variants.map((variant) => {
                const launched = dispatchByVariant.get(variant.id);
                return launched === undefined
                  ? variant
                  : {
                      ...variant,
                      status: "running",
                      worktreePath: launched.worktreePath,
                      sourceSha: launched.sourceSha,
                      threadIds: [launched.threadId],
                    };
              }),
            },
      updatedAt: now(),
    }));
  });

  const startAutoTasks = Effect.fn("TaskWorkspace.startAutoTasks")(function* (
    input: TaskWorkspaceCommandInput,
    snapshot: TaskWorkspaceSnapshot,
  ) {
    let current = snapshot;
    for (const task of snapshot.tasks.filter(
      (entry) => entry.run === null && entry.scenario.autoStart === true,
    )) {
      current = yield* startTaskRun({ ...input, revision: current.revision }, current, task.id);
    }
    return current;
  });

  const applyCommand = Effect.fn("TaskWorkspace.command")(function* (
    input: TaskWorkspaceCommandInput,
    snapshot: TaskWorkspaceSnapshot,
  ) {
    if (input.revision !== snapshot.revision)
      return yield* new TaskWorkspaceError({
        operation: "command",
        message: "Task workspace changed. Reload before applying this command.",
      });
    const command: TaskWorkspaceCommand = input.command;
    switch (command._tag) {
      case "sync": {
        const synced = yield* sync(input, snapshot);
        return yield* startAutoTasks({ ...input, revision: synced.revision }, synced);
      }
      case "configureJira": {
        const parsed = yield* Effect.try({
          try: () => new URL(command.url),
          catch: (cause) => taskError("configureJira", "Jira URL is invalid.", cause),
        });
        if (
          !["https:", "http:"].includes(parsed.protocol) ||
          parsed.username ||
          parsed.password ||
          parsed.search ||
          parsed.hash
        )
          return yield* taskError(
            "configureJira",
            "Jira URL must not contain credentials or a query string.",
          );
        const normalizedUrl = parsed.href.replace(/\/$/, "");
        const targetConnection = {
          ...snapshot.connection,
          url: normalizedUrl,
          username: command.username,
          projectKeys: command.projectKeys ?? [],
        };
        const sourceChanged = !sameJiraSource(snapshot.connection, targetConnection);
        const targetSource = sourceChanged
          ? yield* readSourceStored(input, targetConnection)
          : null;
        const base =
          sourceChanged && targetSource === null
            ? { ...snapshot, tasks: [], sprints: [], lastSyncedAt: null }
            : targetSource ?? snapshot;
        return {
          ...base,
          configured: true,
          connection: {
            ...base.connection,
            configured: true,
            url: normalizedUrl,
            username: command.username,
            secretConfigured:
              command.secretRef !== null || Boolean(process.env.T3_JIRA_TOKEN?.trim()),
            secretRef: command.secretRef,
            projectKeys: command.projectKeys ?? [],
          },
          error: null,
          revision: snapshot.revision + 1,
        };
      }
      case "saveDraft":
        return updateTask(snapshot, command.taskId, (task) => {
          if (command.baseRevision !== task.issue.sourceRevision)
            throw taskError(
              "saveDraft",
              "The Jira issue changed. Synchronize before saving this draft.",
            );
          const updatedAt = now();
          return {
            ...task,
            draft: {
              summary: command.summary,
              description: command.description,
              fields: command.fields,
              baseRevision: command.baseRevision,
              dirty: true,
              updatedAt,
            },
            updatedAt,
          };
        });
      case "discardDraft":
        return updateTask(snapshot, command.taskId, (task) => ({
          ...task,
          draft: null,
          updatedAt: now(),
        }));
      case "configureScenario": {
        validateScenario(command.scenario);
        return updateTask(snapshot, command.taskId, (task) => ({
          ...task,
          scenario: { ...command.scenario, revision: task.scenario.revision + 1 },
          updatedAt: now(),
        }));
      }
      case "runScenario":
        return yield* startTaskRun(input, snapshot, command.taskId);
      case "cancelRun":
        {
          const task = snapshot.tasks.find((entry) => entry.id === command.taskId);
          if (task?.run && ["queued", "running"].includes(task.run.status)) {
            const threadIds = [
              ...new Set([
                ...(task.run.workerThreadIds ?? []),
                ...task.run.variants.flatMap((variant) => variant.threadIds),
              ]),
            ];
            if (adapters.cancelVariants !== undefined && threadIds.length > 0)
              yield* adapters.cancelVariants({ projectId: input.projectId, threadIds });
          }
          return updateTask(snapshot, command.taskId, (current) =>
            current.run === null ||
            ["succeeded", "failed", "cancelled"].includes(current.run.status)
              ? current
              : {
                  ...current,
                  run: {
                    ...current.run,
                    status: "cancelled",
                    finishedAt: now(),
                    error: "Cancelled by the user.",
                  },
                  updatedAt: now(),
                },
          );
        }
      case "retryStage":
        {
          const task = snapshot.tasks.find((entry) => entry.id === command.taskId);
          const stage = task?.scenario.stages.find((entry) => entry.id === command.stageId);
          if (task === undefined || stage === undefined)
            return yield* taskError("retryStage", `Stage ${command.stageId} was not found.`);
          if (task.run === null) return yield* taskError("retryStage", "There is no run to retry.");
          if (stage.kind === "publish")
            return yield* taskError(
              "retryStage",
              "Publish stages are retried through the explicit Publish action.",
            );
          const reset = updateTask(snapshot, command.taskId, (current) => ({
            ...current,
            run: null,
            updatedAt: now(),
          }));
          return yield* startTaskRun(input, reset, command.taskId);
        }
      case "selectVariants":
        return updateTask(snapshot, command.taskId, (task) => {
          if (new Set(command.variantIds).size !== command.variantIds.length)
            throw taskError("selectVariants", "A variant can only be selected once.");
          const variants = new Set(task.run?.variants.map((variant) => variant.id) ?? []);
          if (command.variantIds.some((id) => !variants.has(id)))
            throw taskError(
              "selectVariants",
              "The selected variant is not part of the current run.",
            );
          return {
            ...task,
            scenario: { ...task.scenario, selectedVariantIds: command.variantIds },
            updatedAt: now(),
          };
        });
      case "launchStorybook": {
        const task = snapshot.tasks.find((entry) => entry.id === command.taskId);
        const artifact = task?.artifacts.find((entry) => entry.id === command.artifactId);
        if (task === undefined)
          return yield* taskError("launchStorybook", `Task ${command.taskId} was not found.`);
        if (artifact === undefined || artifact.kind !== "story" || artifact.storyId === null)
          return yield* taskError(
            "launchStorybook",
            "The selected artifact has no verified Storybook story ID.",
          );
        if (adapters.launchStorybook === undefined)
          return yield* taskError(
            "launchStorybook",
            "Storybook launcher is not configured for this environment.",
          );
        yield* adapters.launchStorybook({
          workspaceRoot: input.workspaceRoot,
          storyId: artifact.storyId,
          url: artifact.url,
        });
        return snapshot;
      }
      case "publishVariant": {
        const task = snapshot.tasks.find((entry) => entry.id === command.taskId);
        const variant = task?.run?.variants.find((entry) => entry.id === command.variantId);
        if (task === undefined || variant === undefined)
          return yield* taskError("publishVariant", "The selected variant was not found.");
        if (task.run?.status !== "succeeded" || variant.status !== "succeeded")
          return yield* taskError("publishVariant", "Only a succeeded variant can be published.");
        const publishStageId =
          command.stageId ??
          task.run.currentStageId ??
          task.scenario.stages.find((stage) => stage.kind === "publish")?.id;
        if (
          publishStageId !== undefined &&
          task.scenario.stages.find((stage) => stage.id === publishStageId)?.kind !== "publish"
        )
          return yield* taskError("publishVariant", "The selected stage is not a publish stage.");
        const publishStageDefinition = task.scenario.stages.find(
          (stage) => stage.id === publishStageId,
        );
        if (
          publishStageDefinition !== undefined &&
          publishStageDefinition.dependsOn.some(
            (dependency) => !task.run!.completedStageIds.includes(dependency),
          )
        )
          return yield* taskError(
            "publishVariant",
            "The selected publish stage is waiting for its dependencies.",
          );
        if (adapters.publishVariant === undefined) {
          const failed = updateTask(snapshot, command.taskId, (current) => ({
            ...current,
            publishes: [
              ...current.publishes,
              {
                id: `publish-${DateTime.formatIso(DateTime.nowUnsafe()).replace(/[^0-9]/g, "")}`,
                variantId: command.variantId,
                ...(publishStageId === undefined ? {} : { stageId: publishStageId }),
                phase: "failed",
                branch: command.branch,
                sourceSha: variant.sourceSha,
                pushedSha: null,
                remoteUrl: null,
                commentCount: command.commentIds.length,
                error: "Source-control publisher is not configured for this environment.",
                updatedAt: now(),
              },
            ],
            updatedAt: now(),
          }));
          yield* writeStored(input, failed);
          return yield* taskError(
            "publishVariant",
            "Source-control publisher is not configured for this environment.",
          );
        }
        const previousReceipt = task.publishes.find(
          (entry) =>
            entry.variantId === command.variantId &&
              (publishStageId === undefined || entry.stageId === publishStageId) &&
            entry.branch === command.branch &&
            entry.phase !== "succeeded",
        );
        const publishId =
          previousReceipt?.id ??
          `publish-${DateTime.formatIso(DateTime.nowUnsafe()).replace(/[^0-9]/g, "")}`;
        const receipt = {
          id: publishId,
          variantId: command.variantId,
          ...(publishStageId === undefined ? {} : { stageId: publishStageId }),
          phase: "pushing" as const,
          branch: command.branch,
          sourceSha: variant.sourceSha,
          pushedSha: null,
          remoteUrl: null,
          commentCount: 0,
          error: null,
          updatedAt: now(),
        };
        let publishing = updateTask(snapshot, command.taskId, (current) => ({
          ...current,
          publishes:
            previousReceipt === undefined
              ? [...current.publishes, receipt]
              : current.publishes.map((entry) =>
                  entry.id === previousReceipt.id
                    ? {
                        ...entry,
                        phase: "commenting" as const,
                        error: null,
                        commentCount: 0,
                        updatedAt: now(),
                      }
                    : entry,
                ),
          updatedAt: now(),
        }));
        // Persist the intent before external work so a restart cannot lose an in-flight push.
        yield* writeStored(input, publishing);
        const pushedResult = yield* Effect.result(
          previousReceipt?.pushedSha !== null && previousReceipt?.pushedSha !== undefined
            ? Effect.succeed({
                pushedSha: previousReceipt.pushedSha,
                ...(previousReceipt.remoteUrl === undefined || previousReceipt.remoteUrl === null
                  ? {}
                  : { remoteUrl: previousReceipt.remoteUrl }),
              })
            : adapters.publishVariant({
                workspaceRoot: input.workspaceRoot,
                branch: command.branch,
                variant,
              }),
        );
        if (Result.isFailure(pushedResult)) {
          const failed = updateTask(publishing, command.taskId, (current) => ({
            ...current,
            publishes: current.publishes.map((entry) =>
              entry.id === publishId
                ? {
                    ...entry,
                    phase: "failed" as const,
                    error: pushedResult.failure.message,
                    updatedAt: now(),
                  }
                : entry,
            ),
            updatedAt: now(),
          }));
          yield* writeStored(input, failed);
          return yield* taskError("publishVariant", pushedResult.failure.message);
        }
        const pushed = pushedResult.success;
        const jira =
          adapters.jiraClientFor === undefined
            ? defaultJiraClient(snapshot.connection)
            : yield* adapters.jiraClientFor(snapshot.connection);
        publishing = updateTask(publishing, command.taskId, (current) => ({
          ...current,
          publishes: current.publishes.map((entry) =>
            entry.id === publishId
                  ? {
                      ...entry,
                      phase: "commenting" as const,
                      pushedSha: pushed.pushedSha,
                      ...(pushed.remoteUrl === undefined ? {} : { remoteUrl: pushed.remoteUrl }),
                      updatedAt: now(),
                    }
              : entry,
          ),
          updatedAt: now(),
        }));
        yield* writeStored(input, publishing);
        if (jira === null) {
          const failed = updateTask(publishing, command.taskId, (current) => ({
            ...current,
            publishes: current.publishes.map((entry) =>
              entry.id === publishId
                ? {
                    ...entry,
                    phase: "failed" as const,
                    error: "Jira is not connected; the push receipt is preserved for recovery.",
                    updatedAt: now(),
                  }
                : entry,
            ),
            updatedAt: now(),
          }));
          yield* writeStored(input, failed);
          return yield* taskError(
            "publishVariant",
            "Jira is not connected; the push receipt is preserved for recovery.",
          );
        }
        const commentResults = yield* Effect.forEach(command.commentIds, (commentId) => {
          const comment = task.comments.find((entry) => entry.id === commentId);
          const commentEffect: Effect.Effect<string | null, TaskWorkspaceError> =
            comment === undefined
              ? Effect.succeed(null)
              : Effect.tryPromise({
                  try: () =>
                    jira.ensureComment(
                      task.issue.key,
                      comment.body,
                      `t3-task-workspace:${task.id}:${comment.id}`,
                    ),
                  catch: jiraFailure,
                }).pipe(Effect.map((result) => result.id));
          return Effect.result(commentEffect);
        });
        const failedComment = commentResults.find((result) => Result.isFailure(result));
        const commentIds = commentResults.flatMap((result) =>
          Result.isSuccess(result) && result.success !== null ? [result.success] : [],
        );
        if (failedComment !== undefined && Result.isFailure(failedComment)) {
          const failureMessage = isTaskWorkspaceError(failedComment.failure)
            ? failedComment.failure.message
            : "Jira comment delivery failed.";
          const failed = updateTask(publishing, command.taskId, (current) => ({
            ...current,
            publishes: current.publishes.map((entry) =>
              entry.id === publishId
                ? {
                    ...entry,
                    phase: "failed" as const,
                    pushedSha: pushed.pushedSha,
                    commentCount: commentIds.length,
                    error: failureMessage,
                    updatedAt: now(),
                  }
                : entry,
            ),
            updatedAt: now(),
          }));
          yield* writeStored(input, failed);
          return yield* taskError("publishVariant", failureMessage);
        }
        return updateTask(publishing, command.taskId, (current) => {
          const publishStage = current.scenario.stages.find(
            (stage) => stage.kind === "publish" && stage.id === publishStageId,
          );
          const variants =
            current.run === null
              ? []
              : current.run.variants.map((entry) =>
                  entry.id === command.variantId && publishStage !== undefined
                    ? {
                        ...entry,
                        completedStageIds: [
                          ...new Set([...(entry.completedStageIds ?? []), publishStage.id]),
                        ],
                      }
                    : entry,
                );
          const publishCompletedForAll =
            publishStage !== undefined &&
            variants.length > 0 &&
            variants.every((entry) => entry.completedStageIds?.includes(publishStage.id));
          const completedStageIds =
            publishCompletedForAll && publishStage !== undefined && current.run !== null
              ? [...new Set([...current.run.completedStageIds, publishStage.id])]
              : current.run?.completedStageIds ?? [];
          return {
            ...current,
            publishes: current.publishes.map((entry) =>
              entry.id === publishId
                ? {
                    ...entry,
                    phase: "succeeded" as const,
                    pushedSha: pushed.pushedSha,
                    commentCount: commentIds.length,
                    updatedAt: now(),
                  }
                : entry,
            ),
            ...(publishStage === undefined || current.run === null
              ? {}
              : {
                  run: {
                    ...current.run,
                    variants,
                    currentStageId: publishCompletedForAll
                      ? current.scenario.stages.find(
                          (stage) =>
                            stage.kind === "publish" &&
                            !completedStageIds.includes(stage.id) &&
                            stage.dependsOn.every((dependency) => completedStageIds.includes(dependency)),
                        )?.id ?? null
                      : publishStage.id,
                    completedStageIds,
                  },
                }),
            updatedAt: now(),
          };
        });
      }
    }
  });

  const startMonitor = Effect.fn("TaskWorkspace.startMonitor")(
    function* (input: TaskWorkspaceReadInput, task: TaskWorkspaceTask) {
      if (
        adapters.monitorRun === undefined ||
        task.run === null ||
        !["queued", "running"].includes(task.run.status)
      )
        return;
      const key = `${stateFile(input)}:${task.run.id}`;
      if (ACTIVE_MONITORS.has(key)) return;
      ACTIVE_MONITORS.add(key);
      const report = (update: {
        readonly variantId: string;
        readonly status: "succeeded" | "failed" | "cancelled";
        readonly stageId?: string;
        readonly stageCompleted?: boolean;
        readonly error?: string | null;
        readonly output?: string;
        readonly final?: boolean;
        readonly checks?: ReadonlyArray<TaskWorkspaceCheckResult>;
        readonly threadIds?: ReadonlyArray<ThreadId>;
        readonly comments?: ReadonlyArray<TaskWorkspaceComment>;
        readonly artifacts?: ReadonlyArray<TaskWorkspaceArtifact>;
      }) =>
        lockFor(input).withPermits(1)(
          readStored(input).pipe(
            Effect.map((stored) =>
              updateVariantRun(stored, {
                taskId: task.id,
                runId: task.run!.id,
                ...update,
              }),
            ),
            Effect.flatMap((updated) => writeStored(input, updated)),
          ),
        );
      const recordThread = (variantId: string, threadIds: ReadonlyArray<ThreadId>) =>
        lockFor(input).withPermits(1)(
          readStored(input).pipe(
            Effect.flatMap((stored) => {
              const updated = attachVariantThreads(stored, {
                taskId: task.id,
                runId: task.run!.id,
                variantId,
                threadIds,
              });
              const cancelled =
                updated.tasks.find((entry) => entry.id === task.id)?.run?.status === "cancelled";
              return writeStored(input, updated).pipe(
                Effect.andThen(
                  cancelled && adapters.cancelVariants !== undefined
                    ? adapters.cancelVariants({ projectId: input.projectId, threadIds })
                    : Effect.void,
                ),
              );
            }),
          ),
        );
      const isCancelled = readStored(input).pipe(
        Effect.map((stored) =>
          stored.tasks.find((entry) => entry.id === task.id)?.run?.status === "cancelled",
        ),
      );
      yield* Effect.gen(function* () {
        const result = yield* Effect.result(
          adapters.monitorRun!({
            workspaceRoot: input.workspaceRoot,
            projectId: input.projectId,
            task,
            run: task.run!,
            report,
            recordThread,
            isCancelled,
          }),
        );
        if (Result.isFailure(result)) {
          yield* report({
            variantId: task.run!.variants[0]!.id,
            status: "failed",
            error: "The worker monitor stopped unexpectedly.",
          });
        }
      }).pipe(Effect.ensuring(Effect.sync(() => ACTIVE_MONITORS.delete(key))), Effect.forkDetach);
    },
  );

  const ensureBackgroundSync = Effect.fn("TaskWorkspace.ensureBackgroundSync")(function* (
    input: TaskWorkspaceReadInput,
  ) {
    if (adapters.backgroundSync !== true) return;
    const key = stateFile(input);
    if (AUTO_SYNC_WATCHERS.has(key)) return;
    AUTO_SYNC_WATCHERS.add(key);
    yield* Effect.forkDetach(
      Effect.gen(function* () {
        while (true) {
          yield* Effect.sleep(Duration.millis(AUTO_SYNC_INTERVAL_MS));
          yield* lockFor(input).withPermits(1)(readUnlocked(input)).pipe(Effect.ignore);
        }
      }).pipe(Effect.ensuring(Effect.sync(() => AUTO_SYNC_WATCHERS.delete(key)))),
    );
  });

  const read = (input: TaskWorkspaceReadInput) =>
    lockFor(input).withPermits(1)(readUnlocked(input)).pipe(
      Effect.tap(() => ensureBackgroundSync(input)),
    );
  const command = (input: TaskWorkspaceCommandInput) =>
    lockFor(input).withPermits(1)(
      readStored(input).pipe(
        Effect.flatMap((snapshot) => applyCommand(input, snapshot)),
        Effect.flatMap((snapshot) =>
          writeStored(input, snapshot).pipe(
            Effect.tap(() =>
              adapters.monitorRun === undefined
                ? Effect.void
                : Effect.forEach(snapshot.tasks, (task) => startMonitor(input, task), {
                    discard: true,
                  }),
            ),
          ),
        ),
        Effect.catchIf(
          (cause) => isTaskWorkspaceError(cause) && cause.operation === "sync",
          (cause) =>
            readStored(input).pipe(
              Effect.flatMap((snapshot) =>
                writeStored(input, { ...snapshot, error: cause.message }),
              ),
              Effect.andThen(Effect.fail(cause)),
            ),
        ),
      ),
    );

  return { read, command };
}

const make = Effect.gen(function* () {
  const workspaceFileSystem = yield* WorkspaceFileSystem.WorkspaceFileSystem;
  const semaphore = yield* Semaphore.make(1);
  return TaskWorkspaceService.of(makeTaskWorkspaceService(workspaceFileSystem, {}, semaphore));
});

export const layer = Layer.effect(TaskWorkspaceService, make);
