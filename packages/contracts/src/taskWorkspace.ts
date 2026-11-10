import * as Schema from "effect/Schema";

import { EnvironmentId, IsoDateTime, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { SecretReference } from "./secretReference.ts";

const Id = TrimmedNonEmptyString.check(Schema.isMaxLength(256));
const LongText = Schema.String.check(Schema.isMaxLength(200_000));

export const TaskWorkspaceTaskStatus = Schema.Struct({
  name: TrimmedNonEmptyString,
  category: Schema.optional(Schema.String),
  color: Schema.optional(Schema.String),
});
export type TaskWorkspaceTaskStatus = typeof TaskWorkspaceTaskStatus.Type;

export const TaskWorkspaceSprint = Schema.Struct({
  id: Id,
  name: TrimmedNonEmptyString,
  state: Schema.optional(Schema.Literals(["future", "active", "closed"])),
  startAt: Schema.NullOr(IsoDateTime),
  endAt: Schema.NullOr(IsoDateTime),
});
export type TaskWorkspaceSprint = typeof TaskWorkspaceSprint.Type;

export const TaskWorkspaceAttachment = Schema.Struct({
  id: Id,
  name: TrimmedNonEmptyString,
  url: Schema.NullOr(Schema.String),
  mimeType: Schema.NullOr(Schema.String),
});
export type TaskWorkspaceAttachment = typeof TaskWorkspaceAttachment.Type;

export const TaskWorkspaceComment = Schema.Struct({
  id: Id,
  author: TrimmedNonEmptyString,
  body: LongText,
  createdAt: IsoDateTime,
  source: Schema.Literals(["jira", "agent", "system"]),
});
export type TaskWorkspaceComment = typeof TaskWorkspaceComment.Type;

export const TaskWorkspaceIssue = Schema.Struct({
  key: Id,
  summary: TrimmedNonEmptyString,
  description: Schema.String,
  browseUrl: Schema.NullOr(Schema.String),
  status: TaskWorkspaceTaskStatus,
  assignee: Schema.NullOr(TrimmedNonEmptyString),
  assigneeId: Schema.NullOr(TrimmedNonEmptyString),
  priority: Schema.NullOr(TrimmedNonEmptyString),
  sprint: Schema.NullOr(TaskWorkspaceSprint),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  attachments: Schema.optional(Schema.Array(TaskWorkspaceAttachment)),
  comments: Schema.Array(TaskWorkspaceComment),
  sourceRevision: Id,
});
export type TaskWorkspaceIssue = typeof TaskWorkspaceIssue.Type;

export const TaskWorkspaceDraft = Schema.Struct({
  summary: Schema.String,
  description: Schema.String,
  fields: Schema.Record(Schema.String, Schema.String),
  baseRevision: Id,
  dirty: Schema.Boolean,
  updatedAt: IsoDateTime,
});
export type TaskWorkspaceDraft = typeof TaskWorkspaceDraft.Type;

export const TaskWorkspaceStage = Schema.Struct({
  id: Id,
  name: TrimmedNonEmptyString,
  kind: Schema.Literals(["agent", "check", "audit", "publish"]),
  dependsOn: Schema.Array(Id),
  parallel: Schema.Boolean,
  provider: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  skills: Schema.Array(Schema.String),
  connectors: Schema.Array(Schema.String),
  command: Schema.NullOr(Schema.String),
  required: Schema.Boolean,
  rules: Schema.Array(Schema.String),
  prompt: Schema.String,
  timeoutMs: Schema.Int.check(Schema.isBetween({ minimum: 1_000, maximum: 86_400_000 })),
});
export type TaskWorkspaceStage = typeof TaskWorkspaceStage.Type;

export const TaskWorkspaceScenario = Schema.Struct({
  id: Id,
  name: TrimmedNonEmptyString,
  stages: Schema.Array(TaskWorkspaceStage),
  maxVariants: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 20 })),
  maxRetries: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 5 })),
  enabled: Schema.Boolean,
  autoStart: Schema.optional(Schema.Boolean),
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  selectedVariantIds: Schema.Array(Id).check(Schema.isMaxLength(3)),
});
export type TaskWorkspaceScenario = typeof TaskWorkspaceScenario.Type;

export const TaskWorkspaceArtifact = Schema.Struct({
  id: Id,
  variantId: Id,
  kind: Schema.Literals(["story", "screenshot", "diff", "log", "file", "report"]),
  label: TrimmedNonEmptyString,
  path: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String),
  storyId: Schema.NullOr(Schema.String),
  sourceSha: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
});
export type TaskWorkspaceArtifact = typeof TaskWorkspaceArtifact.Type;

export const TaskWorkspaceCheckResult = Schema.Struct({
  id: Id,
  name: TrimmedNonEmptyString,
  status: Schema.Literals(["queued", "running", "passed", "failed", "skipped"]),
  command: Schema.NullOr(Schema.String),
  exitCode: Schema.NullOr(Schema.Int),
  attempt: Schema.optional(Schema.Int),
  output: Schema.String,
  startedAt: Schema.NullOr(IsoDateTime),
  finishedAt: Schema.NullOr(IsoDateTime),
});
export type TaskWorkspaceCheckResult = typeof TaskWorkspaceCheckResult.Type;

export const TaskWorkspaceVariant = Schema.Struct({
  id: Id,
  label: TrimmedNonEmptyString,
  status: Schema.Literals(["queued", "running", "succeeded", "failed", "cancelled"]),
  worktreePath: Schema.NullOr(Schema.String),
  sourceSha: Id,
  threadIds: Schema.Array(ThreadId),
  completedStageIds: Schema.optional(Schema.Array(Id)),
  checks: Schema.Array(TaskWorkspaceCheckResult),
  artifactIds: Schema.Array(Id),
  output: Schema.optional(Schema.String),
  error: Schema.NullOr(Schema.String),
});
export type TaskWorkspaceVariant = typeof TaskWorkspaceVariant.Type;

export const TaskWorkspaceRunStatus = Schema.Literals([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type TaskWorkspaceRunStatus = typeof TaskWorkspaceRunStatus.Type;

export const TaskWorkspaceRun = Schema.Struct({
  id: Id,
  status: TaskWorkspaceRunStatus,
  sourceRevision: Id,
  startedAt: Schema.NullOr(IsoDateTime),
  finishedAt: Schema.NullOr(IsoDateTime),
  currentStageId: Schema.NullOr(Id),
  variantCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  completedStageIds: Schema.Array(Id),
  error: Schema.NullOr(Schema.String),
  workerThreadIds: Schema.optional(Schema.Array(ThreadId)),
  variants: Schema.Array(TaskWorkspaceVariant),
});
export type TaskWorkspaceRun = typeof TaskWorkspaceRun.Type;

export const TaskWorkspacePublish = Schema.Struct({
  id: Id,
  variantId: Id,
  stageId: Schema.optional(Id),
  phase: Schema.Literals(["queued", "pushing", "commenting", "succeeded", "failed"]),
  branch: TrimmedNonEmptyString,
  sourceSha: Id,
  pushedSha: Schema.NullOr(Id),
  remoteUrl: Schema.optional(Schema.NullOr(Schema.String)),
  commentCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  error: Schema.NullOr(Schema.String),
  updatedAt: IsoDateTime,
});
export type TaskWorkspacePublish = typeof TaskWorkspacePublish.Type;

export const TaskWorkspaceTask = Schema.Struct({
  id: Id,
  environmentId: EnvironmentId,
  projectId: ProjectId,
  issue: TaskWorkspaceIssue,
  draft: Schema.NullOr(TaskWorkspaceDraft),
  scenario: TaskWorkspaceScenario,
  run: Schema.NullOr(TaskWorkspaceRun),
  comments: Schema.Array(TaskWorkspaceComment),
  artifacts: Schema.Array(TaskWorkspaceArtifact),
  publishes: Schema.Array(TaskWorkspacePublish),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type TaskWorkspaceTask = typeof TaskWorkspaceTask.Type;

export const TaskWorkspaceConnection = Schema.Struct({
  configured: Schema.Boolean,
  url: Schema.NullOr(Schema.String),
  username: Schema.NullOr(Schema.String),
  secretConfigured: Schema.Boolean,
  projectKeys: Schema.optional(Schema.Array(Id)),
  secretRef: Schema.optional(Schema.NullOr(SecretReference)),
});
export type TaskWorkspaceConnection = typeof TaskWorkspaceConnection.Type;

export const TaskWorkspaceSnapshot = Schema.Struct({
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  configured: Schema.Boolean,
  connection: TaskWorkspaceConnection,
  assignee: Schema.NullOr(Schema.String),
  sprints: Schema.Array(TaskWorkspaceSprint),
  tasks: Schema.Array(TaskWorkspaceTask),
  lastSyncedAt: Schema.NullOr(IsoDateTime),
  error: Schema.NullOr(Schema.String),
});
export type TaskWorkspaceSnapshot = typeof TaskWorkspaceSnapshot.Type;

export const TaskWorkspaceReadInput = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
  workspaceRoot: TrimmedNonEmptyString,
  assignee: Schema.optional(Schema.String),
  sprintId: Schema.optional(Schema.String),
});
export type TaskWorkspaceReadInput = typeof TaskWorkspaceReadInput.Type;

export const TaskWorkspaceSaveDraft = Schema.Struct({
  taskId: Id,
  baseRevision: Id,
  summary: Schema.String,
  description: Schema.String,
  fields: Schema.Record(Schema.String, Schema.String),
});
export const TaskWorkspaceDiscardDraft = Schema.Struct({ taskId: Id });
export const TaskWorkspaceConfigureJira = Schema.Struct({
  url: TrimmedNonEmptyString,
  username: Schema.NullOr(Schema.String),
  secretRef: Schema.NullOr(SecretReference),
  projectKeys: Schema.optional(Schema.Array(Id)),
});
export const TaskWorkspaceConfigureScenario = Schema.Struct({
  taskId: Id,
  scenario: TaskWorkspaceScenario,
});
export const TaskWorkspaceRunScenario = Schema.Struct({ taskId: Id });
export const TaskWorkspaceCancelRun = Schema.Struct({ taskId: Id });
export const TaskWorkspaceRetryStage = Schema.Struct({ taskId: Id, stageId: Id });
export const TaskWorkspaceSelectVariants = Schema.Struct({ taskId: Id, variantIds: Schema.Array(Id).check(Schema.isMaxLength(3)) });
export const TaskWorkspaceLaunchStorybook = Schema.Struct({
  taskId: Id,
  artifactId: Id,
});
export const TaskWorkspacePublishVariant = Schema.Struct({
  taskId: Id,
  variantId: Id,
  stageId: Schema.optional(Id),
  branch: TrimmedNonEmptyString,
  commentIds: Schema.Array(Id),
});
export const TaskWorkspaceSync = Schema.Struct({});

export const TaskWorkspaceCommand = Schema.Union([
  Schema.TaggedStruct("sync", TaskWorkspaceSync.fields),
  Schema.TaggedStruct("configureJira", TaskWorkspaceConfigureJira.fields),
  Schema.TaggedStruct("saveDraft", TaskWorkspaceSaveDraft.fields),
  Schema.TaggedStruct("discardDraft", TaskWorkspaceDiscardDraft.fields),
  Schema.TaggedStruct("configureScenario", TaskWorkspaceConfigureScenario.fields),
  Schema.TaggedStruct("runScenario", TaskWorkspaceRunScenario.fields),
  Schema.TaggedStruct("cancelRun", TaskWorkspaceCancelRun.fields),
  Schema.TaggedStruct("retryStage", TaskWorkspaceRetryStage.fields),
  Schema.TaggedStruct("selectVariants", TaskWorkspaceSelectVariants.fields),
  Schema.TaggedStruct("launchStorybook", TaskWorkspaceLaunchStorybook.fields),
  Schema.TaggedStruct("publishVariant", TaskWorkspacePublishVariant.fields),
]);
export type TaskWorkspaceCommand = typeof TaskWorkspaceCommand.Type;

export const TaskWorkspaceCommandInput = Schema.Struct({
  environmentId: EnvironmentId,
  projectId: ProjectId,
  workspaceRoot: TrimmedNonEmptyString,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  command: TaskWorkspaceCommand,
});
export type TaskWorkspaceCommandInput = typeof TaskWorkspaceCommandInput.Type;

export class TaskWorkspaceError extends Schema.TaggedError<TaskWorkspaceError>()(
  "TaskWorkspaceError",
  { message: Schema.String, operation: Schema.String, cause: Schema.optional(Schema.Unknown) },
) {}
