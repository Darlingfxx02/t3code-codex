import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as TestClock from "effect/testing/TestClock";
import { it } from "@effect/vitest";
import { describe, expect } from "vite-plus/test";

import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  SecretProviderId,
  TaskWorkspaceError,
  type TaskWorkspaceIssue,
  type TaskWorkspaceReadInput,
  type TaskWorkspaceRun,
  type TaskWorkspaceSnapshot,
} from "@t3tools/contracts";
import type * as WorkspaceFileSystem from "../workspace/WorkspaceFileSystem.ts";

import { createJiraClient } from "./jiraClient.ts";
import { makeTaskWorkspaceService, updateVariantRun } from "./TaskWorkspaceService.ts";

const environmentId = EnvironmentId.make("qa-environment");
const projectId = ProjectId.make("qa-project");
const input: TaskWorkspaceReadInput = {
  environmentId,
  projectId,
  workspaceRoot: "/workspace/project",
};

const issue: TaskWorkspaceIssue = {
  key: "NEUROKEY-42",
  summary: "Task",
  description: "Description",
  browseUrl: "https://jira.example.test/browse/NEUROKEY-42",
  status: { name: "Сделать", category: "К выполнению", color: "default" },
  assignee: "Designer",
  assigneeId: "designer",
  priority: "Medium",
  sprint: null,
  createdAt: "2026-11-10T08:00:00.000Z",
  updatedAt: "2026-11-10T08:00:00.000Z",
  attachments: [],
  comments: [],
  sourceRevision: "2026-11-10T08:00:00.000+0300",
};

function filesystem() {
  const files = new Map<string, string>();
  const service = {
    getMetadata: () => Effect.succeed(null),
    readFile: (request: { readonly relativePath: string }) => {
      const contents = files.get(request.relativePath);
      return Effect.succeed(
        contents === undefined
          ? {
              relativePath: request.relativePath,
              contents: "",
              byteLength: 0,
              truncated: false,
              exists: false,
            }
          : {
              relativePath: request.relativePath,
              contents,
              byteLength: contents.length,
              truncated: false,
            },
      );
    },
    writeFile: (request: { readonly relativePath: string; readonly contents: string }) => {
      files.set(request.relativePath, request.contents);
      return Effect.succeed({
        relativePath: request.relativePath,
        byteLength: request.contents.length,
        truncated: false,
      });
    },
  } as unknown as WorkspaceFileSystem.WorkspaceFileSystem["Service"];
  return { files, service };
}

function jiraClient() {
  return createJiraClient(
    { baseUrl: "https://jira.example.test", token: "test-token" },
    {
      fetch: async (inputUrl) => {
        const url = new URL(inputUrl);
        if (url.pathname.endsWith("/field")) return Response.json([]);
        if (url.pathname.endsWith("/search"))
          return Response.json({
            total: 1,
            issues: [
              {
                key: issue.key,
                fields: {
                  summary: issue.summary,
                  description: issue.description,
                  status: {
                    name: issue.status.name,
                    statusCategory: { name: issue.status.category, colorName: issue.status.color },
                  },
                  assignee: { displayName: issue.assignee, name: issue.assigneeId },
                  priority: { name: issue.priority },
                  created: issue.createdAt,
                  updated: issue.updatedAt,
                  comment: { total: 0, comments: [] },
                },
              },
            ],
          });
        return Response.json({ fields: { comment: { total: 0, comments: [] } }, key: issue.key });
      },
    },
  );
}

describe("TaskWorkspaceService persistence", () => {
  it.effect("reads a stored sync revision and local draft back after the first write", () =>
    Effect.gen(function* () {
    const storage = filesystem();
    const service = makeTaskWorkspaceService(storage.service, {
      jiraClientFor: () => Effect.succeed(jiraClient()),
    });

    const empty = yield* service.read(input);
    const synced = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: empty.revision,
        command: { _tag: "sync" },
      });
    expect(synced.tasks).toHaveLength(1);
    expect(storage.files.size).toBe(1);

    const reread = yield* service.read(input);
    expect(reread.revision).toBe(synced.revision);
    expect(reread.tasks[0]?.issue.key).toBe(issue.key);

    const drafted = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: reread.revision,
        command: {
          _tag: "saveDraft",
          taskId: reread.tasks[0]!.id,
          baseRevision: reread.tasks[0]!.issue.sourceRevision,
          summary: "Draft",
          description: issue.description,
          fields: {},
        },
      });
    const afterDraft = yield* service.read(input);
    expect(afterDraft.revision).toBe(drafted.revision);
    expect(afterDraft.tasks[0]?.draft).toMatchObject({ summary: "Draft", dirty: true });
    }),
  );

  it.effect("auto-starts a configured scenario during synchronization", () =>
    Effect.gen(function* () {
      const storage = filesystem();
      let dispatchCount = 0;
      const service = makeTaskWorkspaceService(storage.service, {
        jiraClientFor: () => Effect.succeed(jiraClient()),
        dispatchVariants: ({ variants }) => {
          dispatchCount += 1;
          return Effect.succeed(
            variants.map((variant) => ({
              variantId: variant.id,
              threadId: ThreadId.make(`auto-${variant.id}`),
              worktreePath: "/workspace/project/.worktrees/auto",
              sourceSha: "abc123",
            })),
          );
        },
      });
      const empty = yield* service.read(input);
      const synced = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: empty.revision,
        command: { _tag: "sync" },
      });
      const configured = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: synced.revision,
        command: {
          _tag: "configureScenario",
          taskId: synced.tasks[0]!.id,
          scenario: { ...synced.tasks[0]!.scenario, autoStart: true },
        },
      });
      const started = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: configured.revision,
        command: { _tag: "sync" },
      });
      expect(dispatchCount).toBe(1);
      expect(started.tasks[0]?.run?.status).toBe("running");
    }),
  );

  it.effect("persists a queued run before dispatch failure", () =>
    Effect.gen(function* () {
      const storage = filesystem();
      const service = makeTaskWorkspaceService(storage.service, {
        jiraClientFor: () => Effect.succeed(jiraClient()),
        dispatchVariants: ({ variants, onVariant }) =>
          Effect.gen(function* () {
            yield* Effect.forEach(
              variants.slice(0, 2),
              (variant, index) =>
                onVariant!({
                  variantId: variant.id,
                  threadId: ThreadId.make(`partial-worker-${index + 1}`),
                  worktreePath: `/workspace/project/.worktrees/partial-${index + 1}`,
                  sourceSha: "abc123",
                }),
              { concurrency: 2 },
            );
            return yield* new TaskWorkspaceError({
              operation: "runScenario",
              message: "provider unavailable",
            });
          }),
      });
      const empty = yield* service.read(input);
      const synced = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: empty.revision,
        command: { _tag: "sync" },
      });
      const task = synced.tasks[0]!;
      const result = yield* Effect.result(
        service.command({
          environmentId,
          projectId,
          workspaceRoot: input.workspaceRoot,
          revision: synced.revision,
          command: { _tag: "runScenario", taskId: task.id },
        }),
      );
      expect(Result.isFailure(result)).toBe(true);
      const persisted = yield* service.read(input);
      expect(persisted.tasks[0]?.run?.status).toBe("running");
      expect(persisted.tasks[0]?.run?.workerThreadIds).toEqual(
        expect.arrayContaining(["partial-worker-1", "partial-worker-2"]),
      );
    }),
  );

  it.effect("keeps local task state isolated per Jira source", () =>
    Effect.gen(function* () {
      const storage = filesystem();
      const service = makeTaskWorkspaceService(storage.service, {
        jiraClientFor: () => Effect.succeed(jiraClient()),
      });
      const empty = yield* service.read(input);
      const connectedA = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: empty.revision,
        command: {
          _tag: "configureJira",
          url: "https://jira-a.example.test",
          username: null,
          secretRef: null,
          projectKeys: [],
        },
      });
      const syncedA = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: connectedA.revision,
        command: { _tag: "sync" },
      });
      const draftedA = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: syncedA.revision,
        command: {
          _tag: "saveDraft",
          taskId: syncedA.tasks[0]!.id,
          baseRevision: syncedA.tasks[0]!.issue.sourceRevision,
          summary: "Jira A draft",
          description: issue.description,
          fields: {},
        },
      });
      const connectedB = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: draftedA.revision,
        command: {
          _tag: "configureJira",
          url: "https://jira-b.example.test",
          username: null,
          secretRef: null,
          projectKeys: [],
        },
      });
      expect(connectedB.tasks).toHaveLength(0);
      const restoredA = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: connectedB.revision,
        command: {
          _tag: "configureJira",
          url: "https://jira-a.example.test",
          username: null,
          secretRef: null,
          projectKeys: [],
        },
      });
      expect(restoredA.connection.url).toBe("https://jira-a.example.test");
      expect(restoredA.tasks[0]?.draft?.summary).toBe("Jira A draft");
      expect(storage.files.size).toBeGreaterThanOrEqual(3);
    }),
  );

  it.effect("isolates Jira project scopes on the same server and refreshes removed comments", () =>
    Effect.gen(function* () {
      const storage = filesystem();
      let comments = [
        {
          id: "jira-comment-a",
          author: "Jira",
          body: "First comment",
          createdAt: issue.updatedAt,
          source: "jira" as const,
        },
      ];
      const client = {
        searchIssues: async () => ({ issues: [{ ...issue, comments }], sprints: [] }),
      } as unknown as ReturnType<typeof createJiraClient>;
      const service = makeTaskWorkspaceService(storage.service, {
        jiraClientFor: () => Effect.succeed(client),
      });
      const empty = yield* service.read(input);
      const firstConnection = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: empty.revision,
        command: {
          _tag: "configureJira",
          url: "https://jira-same.example.test",
          username: null,
          secretRef: null,
          projectKeys: ["NEUROKEY"],
        },
      });
      const firstSync = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: firstConnection.revision,
        command: { _tag: "sync" },
      });
      expect(firstSync.tasks[0]?.comments).toHaveLength(1);
      comments = [];
      const refreshed = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: firstSync.revision,
        command: { _tag: "sync" },
      });
      expect(refreshed.tasks[0]?.comments).toHaveLength(0);
      const secondConnection = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: refreshed.revision,
        command: {
          _tag: "configureJira",
          url: "https://jira-same.example.test",
          username: null,
          secretRef: null,
          projectKeys: ["OTHER"],
        },
      });
      expect(secondConnection.tasks).toHaveLength(0);
      const restored = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: secondConnection.revision,
        command: {
          _tag: "configureJira",
          url: "https://jira-same.example.test",
          username: null,
          secretRef: null,
          projectKeys: ["NEUROKEY"],
        },
      });
      expect(restored.tasks[0]?.comments).toHaveLength(0);
      expect(storage.files.size).toBeGreaterThanOrEqual(3);
    }),
  );

  it.effect("reconciles a detached monitor into a succeeded run", () =>
    Effect.gen(function* () {
      const storage = filesystem();
      const service = makeTaskWorkspaceService(storage.service, {
        jiraClientFor: () => Effect.succeed(jiraClient()),
        dispatchVariants: ({ variants }) =>
          Effect.succeed(
            variants.map((variant) => ({
              variantId: variant.id,
              threadId: ThreadId.make(`monitor-${variant.id}`),
              worktreePath: "/workspace/project/.worktrees/monitor",
              sourceSha: "abc123",
            })),
          ),
        monitorRun: ({ run, report }) =>
          Effect.forEach(run.variants, (variant) =>
            report({ variantId: variant.id, status: "succeeded", final: true }),
          ).pipe(Effect.asVoid),
      });
      const empty = yield* service.read(input);
      const synced = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: empty.revision,
        command: { _tag: "sync" },
      });
      const started = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: synced.revision,
        command: { _tag: "runScenario", taskId: synced.tasks[0]!.id },
      });
      expect(started.tasks[0]?.run?.status).toBe("running");
      yield* TestClock.adjust("20 millis");
      const reconciled = yield* service.read(input);
      expect(reconciled.tasks[0]?.run?.status).toBe("succeeded");
    }),
  );

  it.effect("enforces publish-stage dependencies and advances per-stage receipts", () =>
    Effect.gen(function* () {
      const storage = filesystem();
      const initial = makeTaskWorkspaceService(storage.service, {
        jiraClientFor: () => Effect.succeed(jiraClient()),
      });
      const empty = yield* initial.read(input);
      const synced = yield* initial.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: empty.revision,
        command: { _tag: "sync" },
      });
      const statePath = [...storage.files.keys()][0]!;
      const persisted = JSON.parse(storage.files.get(statePath)!) as TaskWorkspaceSnapshot;
      const task = persisted.tasks[0]!;
      const publish1 = {
        id: "publish-ui",
        name: "Publish UI",
        kind: "publish" as const,
        dependsOn: ["variants"],
        parallel: false,
        provider: null,
        model: null,
        skills: [],
        connectors: [],
        command: null,
        required: true,
        rules: [],
        prompt: "Publish UI",
        timeoutMs: 60_000,
      };
      const publish2 = { ...publish1, id: "publish-comments", name: "Publish comments", dependsOn: [publish1.id] };
      const run: TaskWorkspaceRun = {
        id: "run-publish-stages",
        status: "succeeded",
        sourceRevision: issue.sourceRevision,
        startedAt: issue.createdAt,
        finishedAt: issue.updatedAt,
        currentStageId: publish1.id,
        variantCount: 1,
        completedStageIds: ["variants"],
        error: null,
        workerThreadIds: [ThreadId.make("publish-worker")],
        variants: [
          {
            id: "publish-variant",
            label: "Variant 1",
            status: "succeeded",
            worktreePath: "/workspace/project/.worktrees/publish",
            sourceSha: "abc123",
            threadIds: [ThreadId.make("publish-worker")],
            checks: [],
            artifactIds: [],
            error: null,
          },
        ],
      };
      storage.files.set(
        statePath,
        JSON.stringify({
          ...persisted,
          revision: synced.revision + 1,
          tasks: [
            {
              ...task,
              scenario: { ...task.scenario, stages: [task.scenario.stages[0]!, publish1, publish2] },
              run,
            },
          ],
        }),
      );
      let publishCount = 0;
      const service = makeTaskWorkspaceService(storage.service, {
        jiraClientFor: () => Effect.succeed(jiraClient()),
        publishVariant: () => {
          publishCount += 1;
          return Effect.succeed({ pushedSha: `published-${publishCount}` });
        },
      });
      const blocked = yield* Effect.result(
        service.command({
          environmentId,
          projectId,
          workspaceRoot: input.workspaceRoot,
          revision: synced.revision + 1,
          command: {
            _tag: "publishVariant",
            taskId: task.id,
            variantId: "publish-variant",
            stageId: publish2.id,
            branch: "feature/publish-stages",
            commentIds: [],
          },
        }),
      );
      expect(Result.isFailure(blocked)).toBe(true);
      const afterFirst = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: synced.revision + 1,
        command: {
          _tag: "publishVariant",
          taskId: task.id,
          variantId: "publish-variant",
          stageId: publish1.id,
          branch: "feature/publish-stages",
          commentIds: [],
        },
      });
      expect(afterFirst.tasks[0]?.run?.currentStageId).toBe(publish2.id);
      const afterSecond = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: afterFirst.revision,
        command: {
          _tag: "publishVariant",
          taskId: task.id,
          variantId: "publish-variant",
          stageId: publish2.id,
          branch: "feature/publish-stages",
          commentIds: [],
        },
      });
      expect(afterSecond.tasks[0]?.run?.currentStageId).toBeNull();
      expect(afterSecond.tasks[0]?.run?.completedStageIds).toEqual(
        expect.arrayContaining([publish1.id, publish2.id]),
      );
      expect(publishCount).toBe(2);
    }),
  );

  it.effect("keeps a pushed receipt when Jira comments fail", () =>
    Effect.gen(function* () {
    const storage = filesystem();
    const initial = makeTaskWorkspaceService(storage.service, {
      jiraClientFor: () => Effect.succeed(jiraClient()),
    });
    const empty = yield* initial.read(input);
    const synced = yield* initial.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: empty.revision,
        command: { _tag: "sync" },
      });
    const statePath = [...storage.files.keys()][0]!;
    const persisted = JSON.parse(storage.files.get(statePath)!) as TaskWorkspaceSnapshot;
    const syncedTask = persisted.tasks[0]!;
    const patchedTask = {
      ...syncedTask,
      comments: [
        {
          id: "agent-comment",
          author: "agent",
          body: "Review this change.",
          createdAt: issue.updatedAt,
          source: "agent",
        },
      ],
      run: {
        id: "run-1",
        status: "succeeded",
        sourceRevision: issue.sourceRevision,
        startedAt: issue.createdAt,
        finishedAt: issue.updatedAt,
        currentStageId: null,
        variantCount: 1,
        completedStageIds: [],
        error: null,
        variants: [
          {
            id: "variant-1",
            label: "Variant 1",
            status: "succeeded",
            worktreePath: "/workspace/project/.worktrees/variant-1",
            sourceSha: "abc123",
            threadIds: [ThreadId.make("thread-1")],
            checks: [],
            artifactIds: [],
            error: null,
          },
        ],
      },
    };
    storage.files.set(
      statePath,
      JSON.stringify({
        ...persisted,
        revision: synced.revision + 1,
        tasks: [patchedTask, ...persisted.tasks.slice(1)],
      }),
    );
    const failingJira = {
      ensureComment: async () => {
        throw new Error("comment failed");
      },
    } as unknown as ReturnType<typeof createJiraClient>;
    let publishCount = 0;
    const service = makeTaskWorkspaceService(storage.service, {
      jiraClientFor: () => Effect.succeed(failingJira),
      publishVariant: () => {
        publishCount += 1;
        return Effect.succeed({ pushedSha: "def456", remoteUrl: "https://git.example.test/repo.git" });
      },
    });
    const result = yield* Effect.result(
      service.command({
          environmentId,
          projectId,
          workspaceRoot: input.workspaceRoot,
          revision: synced.revision + 1,
          command: {
            _tag: "publishVariant",
            taskId: syncedTask.id,
            variantId: "variant-1",
            branch: "feature/task-42",
            commentIds: ["agent-comment"],
          },
        }),
    );
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) expect(result.failure.message).toContain("Jira synchronization failed");
    const afterFailure = yield* service.read(input);
    expect(afterFailure.tasks[0]?.publishes[0]).toMatchObject({
      phase: "failed",
      pushedSha: "def456",
      commentCount: 0,
    });
    const retry = yield* Effect.result(
      service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: afterFailure.revision,
        command: {
          _tag: "publishVariant",
          taskId: syncedTask.id,
          variantId: "variant-1",
          branch: "feature/task-42",
          commentIds: ["agent-comment"],
        },
      }),
    );
    expect(Result.isFailure(retry)).toBe(true);
    expect(publishCount).toBe(1);
    expect((yield* service.read(input)).tasks[0]?.publishes).toHaveLength(1);
    }),
  );

  it.effect("keeps cancellation terminal and persists worker evidence", () =>
    Effect.gen(function* () {
      const storage = filesystem();
      const service = makeTaskWorkspaceService(storage.service, {
        jiraClientFor: () => Effect.succeed(jiraClient()),
      });
      const empty = yield* service.read(input);
      const synced = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: empty.revision,
        command: { _tag: "sync" },
      });
      const task = synced.tasks[0]!;
      const run: TaskWorkspaceRun = {
        id: "run-evidence",
        status: "running",
        sourceRevision: issue.sourceRevision,
        startedAt: issue.createdAt,
        finishedAt: null,
        currentStageId: "variants",
        variantCount: 1,
        completedStageIds: [],
        error: null,
        workerThreadIds: [ThreadId.make("worker-1")],
        variants: [
          {
            id: "variant-evidence",
            label: "Evidence",
            status: "running",
            worktreePath: "/workspace/project/.worktrees/evidence",
            sourceSha: "abc123",
            threadIds: [ThreadId.make("worker-1")],
            checks: [],
            artifactIds: [],
            error: null,
          },
        ],
      };
      const running: TaskWorkspaceSnapshot = {
        ...synced,
        tasks: [{ ...task, run }],
      };
      const cancelled: TaskWorkspaceSnapshot = {
        ...running,
        tasks: [{ ...task, run: { ...run, status: "cancelled" } }],
      };
      const ignored = updateVariantRun(cancelled, {
        taskId: task.id,
        runId: run.id,
        variantId: "variant-evidence",
        status: "succeeded",
        final: true,
        output: "Late worker output",
        threadIds: [ThreadId.make("audit-after-cancel")],
      });
      expect(ignored.tasks[0]?.run?.status).toBe("cancelled");
      expect(ignored.tasks[0]?.run?.workerThreadIds).toContain("audit-after-cancel");
      expect(ignored.tasks[0]?.run?.variants[0]?.output).toBe("Late worker output");
      const enriched = updateVariantRun(running, {
        taskId: task.id,
        runId: run.id,
        variantId: "variant-evidence",
        status: "succeeded",
        final: true,
        output: "Variant explanation",
        comments: [
          {
            id: "audit-evidence",
            author: "Audit worker",
            body: "Evidence captured.",
            createdAt: issue.updatedAt,
            source: "agent",
          },
        ],
        artifacts: [
          {
            id: "report-evidence",
            variantId: "variant-evidence",
            kind: "report",
            label: "Audit report",
            path: null,
            url: null,
            storyId: null,
            sourceSha: "abc123",
            createdAt: issue.updatedAt,
          },
        ],
      });
      expect(enriched.tasks[0]?.run?.status).toBe("succeeded");
      expect(enriched.tasks[0]?.comments).toHaveLength(1);
      expect(enriched.tasks[0]?.artifacts).toHaveLength(1);
      expect(enriched.tasks[0]?.run?.variants[0]?.output).toBe("Variant explanation");
      expect(enriched.tasks[0]?.run?.variants[0]?.artifactIds).toContain("report-evidence");

      const multiRun: TaskWorkspaceRun = {
        ...run,
        id: "run-stage-aggregation",
        variantCount: 2,
        currentStageId: "audit",
        completedStageIds: ["variants"],
        variants: [
          run.variants[0]!,
          {
            ...run.variants[0]!,
            id: "variant-evidence-2",
            threadIds: [ThreadId.make("worker-2")],
          },
        ],
      };
      const multiSnapshot: TaskWorkspaceSnapshot = {
        ...running,
        tasks: [{ ...task, run: multiRun }],
      };
      const firstAuditReport = updateVariantRun(multiSnapshot, {
        taskId: task.id,
        runId: multiRun.id,
        variantId: "variant-evidence",
        status: "succeeded",
        stageId: "audit",
        stageCompleted: true,
      });
      expect(firstAuditReport.tasks[0]?.run?.completedStageIds).not.toContain("audit");
      const completedAudit = updateVariantRun(firstAuditReport, {
        taskId: task.id,
        runId: multiRun.id,
        variantId: "variant-evidence-2",
        status: "succeeded",
        stageId: "audit",
        stageCompleted: true,
      });
      expect(completedAudit.tasks[0]?.run?.completedStageIds).toContain("audit");
      expect(completedAudit.tasks[0]?.run?.currentStageId).toBe("checks");
    }),
  );

  it.effect("runs the background Jira watcher without a task route read", () =>
    Effect.gen(function* () {
      const storage = filesystem();
      let searchCount = 0;
      const client = {
        searchIssues: async () => {
          searchCount += 1;
          return { issues: [issue], sprints: [] };
        },
      } as unknown as ReturnType<typeof createJiraClient>;
      const service = makeTaskWorkspaceService(storage.service, {
        backgroundSync: true,
        jiraClientFor: () => Effect.succeed(client),
      });
      yield* service.read(input);
      const configured = yield* service.command({
        environmentId,
        projectId,
        workspaceRoot: input.workspaceRoot,
        revision: 0,
        command: {
          _tag: "configureJira",
          url: "https://jira-background.example.test",
          username: null,
          secretRef: { provider: SecretProviderId.make("personal"), reference: "jira-token" },
          projectKeys: [],
        },
      });
      expect(configured.configured).toBe(true);
      yield* TestClock.adjust("30 seconds");
      expect(searchCount).toBeGreaterThanOrEqual(1);
    }),
  );

});
