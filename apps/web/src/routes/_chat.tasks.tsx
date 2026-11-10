import { createFileRoute } from "@tanstack/react-router";

import { TasksWorkspace } from "../components/tasks/TasksWorkspace";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

type TasksSearch = {
  readonly environmentId?: EnvironmentId;
  readonly projectId?: ProjectId;
  readonly taskId?: string;
};

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export const Route = createFileRoute("/_chat/tasks")({
  validateSearch: (raw: Record<string, unknown>): TasksSearch => {
    const environmentId = parseOptionalString(raw.environmentId);
    const projectId = parseOptionalString(raw.projectId);
    const taskId = parseOptionalString(raw.taskId);
    return {
      ...(environmentId === undefined ? {} : { environmentId: environmentId as EnvironmentId }),
      ...(projectId === undefined ? {} : { projectId: projectId as ProjectId }),
      ...(taskId === undefined ? {} : { taskId }),
    };
  },
  component: () => <TasksWorkspace target={Route.useSearch()} />,
});
