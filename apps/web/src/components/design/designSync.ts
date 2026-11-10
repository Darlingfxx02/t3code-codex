import type { DesignAssetPayload, DesignSyncRequest, DesignSyncResult } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import {
  DesignDocument,
  DesignNode,
  type DesignDocument as DesignDocumentType,
} from "./designDocument";

const isDesignNode = Schema.is(DesignNode);
const decodeDesignDocument = Schema.decodeUnknownSync(DesignDocument);

function addPendingOperation(
  document: DesignDocumentType,
  operation: Omit<DesignDocumentType["pendingOperations"][number], "operationId" | "baseRevision">,
): DesignDocumentType {
  const revision = document.revision + 1;
  return {
    ...document,
    revision,
    pendingOperations: [
      ...document.pendingOperations,
      { ...operation, operationId: `op-${revision}`, baseRevision: document.revision },
    ],
    syncState: "local",
  };
}

export function createDesignSyncRequest(
  document: DesignDocumentType,
  assetPayloads: ReadonlyArray<DesignAssetPayload> = [],
): DesignSyncRequest {
  const baseRevision = Math.max(0, document.revision - document.pendingOperations.length);
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  return {
    documentId: document.documentId,
    baseRevision,
    operations: document.pendingOperations.map((operation) => ({
      ...operation,
      payload: operation.nodeId ? (nodes.get(operation.nodeId) ?? null) : null,
    })),
    assetIds: document.assets.map(({ assetId }) => assetId),
    ...(assetPayloads.length === 0 ? {} : { assetPayloads }),
    snapshot: JSON.stringify({ ...document, pendingOperations: [], syncState: "synced" }),
  };
}

export function applyDesignSyncResult(
  document: DesignDocumentType,
  result: DesignSyncResult,
): DesignDocument {
  if (result._tag === "accepted") {
    const accepted = new Set(result.acceptedOperationIds);
    const pendingOperations = document.pendingOperations
      .filter((operation) => !accepted.has(operation.operationId))
      .map((operation, index) => ({
        ...operation,
        baseRevision: result.revision + index,
      }));
    return {
      ...document,
      revision: result.revision + pendingOperations.length,
      pendingOperations,
      syncState: pendingOperations.length > 0 ? "local" : "synced",
      conflicts: [],
    };
  }
  return {
    ...document,
    revision: result.revision,
    syncState: "conflict",
    conflicts: result.conflicts,
  };
}

export function resolveDesignConflict(
  document: DesignDocumentType,
  conflict: DesignDocumentType["conflicts"][number],
  resolution: "keep-local" | "use-server" | "duplicate-node",
): DesignDocumentType {
  const remaining = document.conflicts.filter(
    (candidate) => candidate.nodeId !== conflict.nodeId || candidate.assetId !== conflict.assetId,
  );
  const rebasePending = (
    next: DesignDocumentType,
    pendingOperations: DesignDocumentType["pendingOperations"],
  ) => ({
    ...next,
    revision: conflict.serverRevision + pendingOperations.length,
    pendingOperations: pendingOperations.map((operation, index) => ({
      ...operation,
      baseRevision: conflict.serverRevision + index,
    })),
  });
  if (resolution === "keep-local") {
    return rebasePending(
      {
        ...document,
        conflicts: remaining,
        syncState: remaining.length > 0 ? "conflict" : "local",
      },
      document.pendingOperations,
    );
  }
  if (conflict.nodeId === null) {
    if (resolution === "use-server" && conflict.assetId === undefined) {
      let serverDocument: DesignDocumentType | null = null;
      try {
        const value =
          typeof conflict.serverValue === "string"
            ? JSON.parse(conflict.serverValue)
            : conflict.serverValue;
        serverDocument = decodeDesignDocument(value);
      } catch {
        serverDocument = null;
      }
      if (serverDocument) {
        const pendingOperations = document.pendingOperations.filter(
          (operation) => operation.nodeId !== null,
        );
        return rebasePending(
          {
            ...serverDocument,
            documentId: document.documentId,
            conflicts: remaining,
            syncState: remaining.length > 0 ? "conflict" : "local",
          },
          pendingOperations,
        );
      }
    }
    const pendingOperations =
      resolution === "use-server"
        ? document.pendingOperations.filter(
            (operation) =>
              operation.nodeId !== null ||
              (conflict.assetId !== undefined && operation.assetId !== conflict.assetId),
          )
        : document.pendingOperations;
    return rebasePending(
      {
        ...document,
        assets:
          resolution === "use-server" && conflict.assetId !== undefined
            ? document.assets.filter((asset) => asset.assetId !== conflict.assetId)
            : document.assets,
        conflicts: remaining,
        syncState: remaining.length > 0 ? "conflict" : "local",
      },
      pendingOperations,
    );
  }
  const serverNode = isDesignNode(conflict.serverValue) ? conflict.serverValue : null;
  const localNode = isDesignNode(conflict.localValue) ? conflict.localValue : null;
  if (resolution === "use-server" && conflict.nodeId === null) return document;
  if (resolution === "duplicate-node" && serverNode === null && localNode === null) return document;
  if (resolution === "duplicate-node") {
    const sourceNode = serverNode ?? localNode;
    if (sourceNode === null) return document;
    const nodeId = `${sourceNode.nodeId}-copy-${document.nodes.length + 1}`;
    const duplicate = { ...sourceNode, nodeId, name: `${sourceNode.name} copy` };
    const withDuplicate = addPendingOperation(
      {
        ...document,
        nodes: document.nodes
          .map((node) =>
            node.nodeId === duplicate.parentId
              ? { ...node, childIds: [...node.childIds, nodeId] }
              : node,
          )
          .concat(duplicate),
        pages:
          duplicate.parentId === null
            ? document.pages.map((page) =>
                page.nodeIds.includes(sourceNode.nodeId)
                  ? { ...page, nodeIds: [...page.nodeIds, nodeId] }
                  : page,
              )
            : document.pages,
        conflicts: remaining,
      },
      { kind: "add-node", nodeId },
    );
    return rebasePending(withDuplicate, withDuplicate.pendingOperations);
  }
  const pendingOperations = document.pendingOperations.filter(
    (operation) => operation.nodeId !== conflict.nodeId,
  );
  const removedNodeIds = new Set<string>([conflict.nodeId]);
  const pendingRemoval = [conflict.nodeId];
  while (pendingRemoval.length > 0) {
    const nodeId = pendingRemoval.pop();
    const node = document.nodes.find((candidate) => candidate.nodeId === nodeId);
    if (!node) continue;
    for (const childId of node.childIds) {
      if (!removedNodeIds.has(childId)) {
        removedNodeIds.add(childId);
        pendingRemoval.push(childId);
      }
    }
  }
  return rebasePending(
    {
      ...document,
      nodes:
        serverNode === null
          ? document.nodes
              .filter((node) => !removedNodeIds.has(node.nodeId))
              .map((node) => ({
                ...node,
                childIds: node.childIds.filter((childId) => !removedNodeIds.has(childId)),
              }))
          : document.nodes.map((node) => (node.nodeId === conflict.nodeId ? serverNode : node)),
      pages:
        serverNode === null
          ? document.pages.map((page) => ({
              ...page,
              nodeIds: page.nodeIds.filter((nodeId) => !removedNodeIds.has(nodeId)),
            }))
          : document.pages,
      conflicts: remaining,
      syncState: remaining.length > 0 ? "conflict" : "local",
    },
    pendingOperations,
  );
}
