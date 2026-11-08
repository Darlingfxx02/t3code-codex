import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

import { deriveThreadTitleFromPrompt } from "../lib/projectThreadStartTurn";
import type { QueuedThreadCreation, QueuedThreadMessage } from "./thread-outbox-model";

export type PendingNewTask = PendingQueuedTask;

export interface PendingQueuedTask {
  readonly kind: "pending";
  readonly key: string;
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly projectTitle: string | undefined;
  readonly projectCwd: string | undefined;
  readonly branch: string | null;
  readonly title: string;
  readonly createdAt: string;
  readonly message: QueuedThreadMessage;
  readonly creation: QueuedThreadCreation;
}

export function buildPendingNewTasks(input: {
  readonly queuedMessages: ReadonlyArray<QueuedThreadMessage>;
}): ReadonlyArray<PendingNewTask> {
  const tasks: PendingNewTask[] = [];
  for (const message of input.queuedMessages) {
    if (!message.creation) {
      continue;
    }
    tasks.push({
      kind: "pending",
      key: `pending-task:${message.messageId}`,
      environmentId: message.environmentId,
      projectId: message.creation.projectId,
      projectTitle: message.creation.projectTitle,
      projectCwd: message.creation.projectCwd,
      branch: message.creation.branch,
      title: deriveThreadTitleFromPrompt(message.text),
      createdAt: message.createdAt,
      message,
      creation: message.creation,
    });
  }
  tasks.sort((left, right) => {
    return right.createdAt.localeCompare(left.createdAt) || left.key.localeCompare(right.key);
  });
  return tasks;
}
