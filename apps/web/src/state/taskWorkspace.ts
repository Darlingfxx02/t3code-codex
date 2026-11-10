import { WS_METHODS } from "@t3tools/contracts";
import {
  createEnvironmentRpcCommand,
  createEnvironmentRpcSubscriptionAtomFamily,
} from "@t3tools/client-runtime/state/runtime";

import { connectionAtomRuntime } from "../connection/runtime";

/**
 * Task workspace data is a server stream rather than a one-shot query. Keeping the
 * adapter here gives the route the same typed permission/session boundary as the
 * other environment features and lets server updates replace the current snapshot.
 */
export const taskWorkspaceRead = createEnvironmentRpcSubscriptionAtomFamily(
  connectionAtomRuntime,
  {
    label: "environment-data:task-workspace:read",
    tag: WS_METHODS.taskWorkspaceRead,
    idleTtlMs: 5 * 60_000,
  },
);

export const taskWorkspaceCommand = createEnvironmentRpcCommand(connectionAtomRuntime, {
  label: "environment-data:task-workspace:command",
  tag: WS_METHODS.taskWorkspaceCommand,
});
