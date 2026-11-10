import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  TaskWorkspaceCommandInput,
  TaskWorkspaceSnapshot,
} from "./taskWorkspace.ts";

const decodeCommand = Schema.decodeSync(TaskWorkspaceCommandInput);
const decodeSnapshot = Schema.decodeSync(TaskWorkspaceSnapshot);

describe("Task workspace contracts", () => {
  it("accepts a revisioned command without exposing credentials", () => {
    const command = decodeCommand({
      environmentId: "environment-1",
      projectId: "project-1",
      workspaceRoot: "/workspace/project",
      revision: 4,
      command: {
        _tag: "configureJira",
        url: "https://jira.example.test",
        username: null,
        secretRef: { provider: "personal", reference: "jira-token" },
      },
    });
    expect(command.command._tag).toBe("configureJira");
    expect(command.command).not.toHaveProperty("token");
  });

  it("keeps connection metadata safe in a readable snapshot", () => {
    const snapshot = decodeSnapshot({
      revision: 0,
      configured: false,
      connection: { configured: false, url: null, username: null, secretConfigured: false },
      assignee: null,
      sprints: [],
      tasks: [],
      lastSyncedAt: null,
      error: null,
    });
    expect(snapshot.connection.secretConfigured).toBe(false);
    expect(snapshot).not.toHaveProperty("token");
  });
});
