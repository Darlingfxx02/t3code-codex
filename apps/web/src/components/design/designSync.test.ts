import { describe, expect, it } from "vite-plus/test";

import { createInitialDesignDocument, updateDesignNode } from "./designDocument";
import {
  applyDesignSyncResult,
  createDesignSyncRequest,
  resolveDesignConflict,
} from "./designSync";

describe("Design sync adapter", () => {
  it("creates a revision-guarded request without executable code", () => {
    const document = updateDesignNode(createInitialDesignDocument(), "text-welcome", { x: 42 });
    const request = createDesignSyncRequest(document);
    expect(request).toMatchObject({ documentId: document.documentId, baseRevision: 0 });
    expect(request.operations[0]).toMatchObject({
      operationId: "op-1",
      baseRevision: 0,
      kind: "update-node",
      nodeId: "text-welcome",
    });
    expect(request.operations[0]?.payload).toMatchObject({ x: 42 });
    expect(JSON.parse(request.snapshot!)).toMatchObject({
      documentId: document.documentId,
      pendingOperations: [],
      syncState: "synced",
    });
    const editedDuringSync = updateDesignNode(
      { ...document, syncState: "syncing" },
      "text-welcome",
      { x: 84 },
    );
    const accepted = applyDesignSyncResult(editedDuringSync, {
      _tag: "accepted",
      documentId: document.documentId,
      revision: 1,
      acceptedOperationIds: [request.operations[0]!.operationId],
    });
    expect(accepted.pendingOperations).toHaveLength(1);
    expect(createDesignSyncRequest(accepted).operations[0]?.payload).toMatchObject({ x: 84 });
  });

  it("rebases kept-local operations onto the server revision", () => {
    const document = updateDesignNode(createInitialDesignDocument(), "text-welcome", { x: 42 });
    const resolved = resolveDesignConflict(
      document,
      {
        nodeId: "text-welcome",
        baseRevision: 0,
        serverRevision: 4,
        localValue: { x: 42 },
        serverValue: { x: 24 },
      },
      "keep-local",
    );
    expect(resolved.revision).toBe(5);
    expect(resolved.pendingOperations[0]?.baseRevision).toBe(4);
  });
});
