import type { DesignAssetPayload, DesignSyncRequest, DesignSyncResult } from "@t3tools/contracts";

export interface DesignServerState {
  readonly documentId: string;
  readonly revision: number;
  readonly nodes: ReadonlyMap<string, unknown>;
  readonly assetIds: ReadonlySet<string>;
  readonly snapshot?: string;
  readonly assetPayloads?: ReadonlyMap<string, DesignAssetPayload>;
}

export interface AppliedDesignSync {
  readonly state: DesignServerState;
  readonly result: DesignSyncResult;
}

function snapshotNodes(
  snapshot: string | undefined,
  documentId: string,
): Map<string, unknown> | undefined {
  if (snapshot === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(snapshot);
  } catch {
    return undefined;
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("documentId" in value) ||
    value.documentId !== documentId ||
    !("nodes" in value) ||
    !Array.isArray(value.nodes)
  )
    return undefined;
  const nodes = new Map<string, unknown>();
  for (const node of value.nodes as unknown[]) {
    if (
      typeof node !== "object" ||
      node === null ||
      !("nodeId" in node) ||
      typeof node.nodeId !== "string" ||
      nodes.has(node.nodeId)
    )
      return undefined;
    nodes.set(node.nodeId, node);
  }
  return nodes;
}

function snapshotValue(snapshot: string | undefined): unknown {
  if (snapshot === undefined) return null;
  try {
    return JSON.parse(snapshot);
  } catch {
    return null;
  }
}

/**
 * Applies a Design transaction only when the caller's base revision matches.
 * The server can persist the returned state in its environment-owned store.
 */
export function applyDesignSyncRequest(
  state: DesignServerState,
  request: DesignSyncRequest,
): AppliedDesignSync {
  if (request.documentId !== state.documentId || request.baseRevision !== state.revision) {
    return {
      state,
      result: {
        _tag: "conflict",
        documentId: state.documentId,
        revision: state.revision,
        conflicts: request.operations.map((operation) => ({
          nodeId: operation.nodeId,
          ...(operation.assetId === undefined ? {} : { assetId: operation.assetId }),
          baseRevision: request.baseRevision,
          serverRevision: state.revision,
          localValue: operation.payload,
          serverValue:
            operation.nodeId !== null
              ? (state.nodes.get(operation.nodeId) ?? null)
              : operation.assetId === undefined
                ? snapshotValue(state.snapshot)
                : (state.assetPayloads?.get(operation.assetId) ?? null),
        })),
      },
    };
  }

  const snapshot = snapshotNodes(request.snapshot, state.documentId);
  const nodes = snapshot ?? new Map(state.nodes);
  const assetIds = new Set(state.assetIds);
  for (const operation of request.operations) {
    if (operation.nodeId !== null && snapshot === undefined) {
      if (operation.payload === null) nodes.delete(operation.nodeId);
      else nodes.set(operation.nodeId, operation.payload);
    }
  }
  for (const assetId of request.assetIds) assetIds.add(assetId);
  const revision = state.revision + request.operations.length;
  return {
    state: {
      ...state,
      revision,
      nodes,
      assetIds,
      ...(request.snapshot === undefined ? {} : { snapshot: request.snapshot }),
      assetPayloads: new Map([
        ...(state.assetPayloads ?? new Map()),
        ...(request.assetPayloads ?? []).map((asset) => [asset.assetId, asset] as const),
      ]),
    },
    result: {
      _tag: "accepted",
      documentId: state.documentId,
      revision,
      acceptedOperationIds: request.operations.map(({ operationId }) => operationId),
    },
  };
}
