import { describe, expect, it } from "vite-plus/test";

import { addAssetMeta, createInitialDesignDocument, updateDesignNode } from "./designDocument";
import { applyDesignSyncResult, resolveDesignConflict } from "./designSync";

describe("Design sync result reducer", () => {
  it("marks accepted local operations as synced", () => {
    const document = updateDesignNode(createInitialDesignDocument(), "text-welcome", { x: 42 });
    const next = applyDesignSyncResult(document, {
      _tag: "accepted",
      documentId: document.documentId,
      revision: 1,
      acceptedOperationIds: ["op-1"],
    });
    expect(next.syncState).toBe("synced");
    expect(next.pendingOperations).toEqual([]);
  });

  it("preserves an explicit conflict for UI resolution", () => {
    const document = createInitialDesignDocument();
    const next = applyDesignSyncResult(document, {
      _tag: "conflict",
      documentId: document.documentId,
      revision: 2,
      conflicts: [
        {
          nodeId: "text-welcome",
          baseRevision: 1,
          serverRevision: 2,
          localValue: { x: 42 },
          serverValue: { x: 24 },
        },
      ],
    });
    expect(next.syncState).toBe("conflict");
    expect(next.conflicts[0]?.nodeId).toBe("text-welcome");
  });

  it("can keep the local value without hiding other conflicts", () => {
    const document = applyDesignSyncResult(createInitialDesignDocument(), {
      _tag: "conflict",
      documentId: "design-document-1",
      revision: 2,
      conflicts: [
        {
          nodeId: "text-welcome",
          baseRevision: 1,
          serverRevision: 2,
          localValue: { x: 42 },
          serverValue: { x: 24 },
        },
      ],
    });
    const next = resolveDesignConflict(document, document.conflicts[0]!, "keep-local");
    expect(next.conflicts).toEqual([]);
    expect(next.syncState).toBe("local");
    expect(next.nodes.find((node) => node.nodeId === "text-welcome")?.x).toBe(56);
  });

  it("can apply a typed server node during conflict resolution", () => {
    const document = applyDesignSyncResult(createInitialDesignDocument(), {
      _tag: "conflict",
      documentId: "design-document-1",
      revision: 2,
      conflicts: [
        {
          nodeId: "text-welcome",
          baseRevision: 1,
          serverRevision: 2,
          localValue: { x: 42 },
          serverValue: { ...createInitialDesignDocument().nodes[1], x: 24 },
        },
      ],
    });
    const next = resolveDesignConflict(document, document.conflicts[0]!, "use-server");
    expect(next.conflicts).toEqual([]);
    expect(next.nodes.find((node) => node.nodeId === "text-welcome")?.x).toBe(24);
  });

  it("can duplicate the server value instead of discarding the local layer", () => {
    const document = applyDesignSyncResult(createInitialDesignDocument(), {
      _tag: "conflict",
      documentId: "design-document-1",
      revision: 2,
      conflicts: [
        {
          nodeId: "text-welcome",
          baseRevision: 1,
          serverRevision: 2,
          localValue: { x: 42 },
          serverValue: { ...createInitialDesignDocument().nodes[1], x: 24 },
        },
      ],
    });
    const next = resolveDesignConflict(document, document.conflicts[0]!, "duplicate-node");
    expect(next.conflicts).toEqual([]);
    expect(next.nodes.some((node) => node.name === "Welcome heading copy")).toBe(true);
  });

  it("resolves document-level asset conflicts without a selected layer", () => {
    const document = addAssetMeta(createInitialDesignDocument(), {
      assetId: "asset-1",
      name: "hero.png",
      mimeType: "image/png",
      size: 10,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const conflicted = applyDesignSyncResult(document, {
      _tag: "conflict",
      documentId: document.documentId,
      revision: 2,
      conflicts: [
        {
          nodeId: null,
          baseRevision: 1,
          serverRevision: 2,
          localValue: { assetId: "asset-1" },
          serverValue: null,
        },
      ],
    });
    const next = resolveDesignConflict(conflicted, conflicted.conflicts[0]!, "use-server");
    expect(next.conflicts).toEqual([]);
    expect(next.syncState).toBe("local");
  });

  it("replaces the local document when using the server document-level snapshot", () => {
    const local = updateDesignNode(createInitialDesignDocument(), "text-welcome", { x: 420 });
    const server = updateDesignNode(createInitialDesignDocument(), "text-welcome", { x: 24 });
    const conflicted = applyDesignSyncResult(local, {
      _tag: "conflict",
      documentId: local.documentId,
      revision: 2,
      conflicts: [
        {
          nodeId: null,
          baseRevision: 1,
          serverRevision: 2,
          localValue: { pages: local.pages },
          serverValue: server,
        },
      ],
    });
    const next = resolveDesignConflict(conflicted, conflicted.conflicts[0]!, "use-server");
    expect(next.nodes.find((node) => node.nodeId === "text-welcome")?.x).toBe(24);
    expect(next.conflicts).toEqual([]);
  });

  it("removes a deleted root and its descendants from the active page", () => {
    const document = createInitialDesignDocument();
    const conflicted = applyDesignSyncResult(document, {
      _tag: "conflict",
      documentId: document.documentId,
      revision: 2,
      conflicts: [
        {
          nodeId: "frame-home",
          baseRevision: 1,
          serverRevision: 2,
          localValue: document.nodes[0],
          serverValue: null,
        },
      ],
    });
    const next = resolveDesignConflict(conflicted, conflicted.conflicts[0]!, "use-server");
    expect(next.nodes).toEqual([]);
    expect(next.pages[0]?.nodeIds).toEqual([]);
  });
});
