import { describe, expect, it } from "vite-plus/test";

import type { DesignSyncRequest } from "@t3tools/contracts";
import { applyDesignSyncRequest } from "./designSync.js";

const request: DesignSyncRequest = {
  documentId: "doc-1",
  baseRevision: 0,
  operations: [
    {
      operationId: "op-1",
      baseRevision: 0,
      kind: "update-node",
      nodeId: "text-1",
      payload: { x: 42 },
    },
  ],
  assetIds: [],
};

describe("Design sync algorithm", () => {
  it("accepts an operation transaction at the current revision", () => {
    const result = applyDesignSyncRequest(
      { documentId: "doc-1", revision: 0, nodes: new Map(), assetIds: new Set() },
      request,
    );
    expect(result.result._tag).toBe("accepted");
    expect(result.state.revision).toBe(1);
    expect(result.state.nodes.get("text-1")).toEqual({ x: 42 });
  });

  it("persists the latest serialized IR alongside operation state", () => {
    const result = applyDesignSyncRequest(
      { documentId: "doc-1", revision: 0, nodes: new Map(), assetIds: new Set() },
      { ...request, snapshot: '{"documentId":"doc-1","pages":[]}' },
    );
    expect(result.state.snapshot).toBe('{"documentId":"doc-1","pages":[]}');
    const restored = applyDesignSyncRequest(result.state, {
      ...request,
      baseRevision: 1,
      operations: [{ ...request.operations[0]!, nodeId: null, payload: null }],
      snapshot: JSON.stringify({
        documentId: "doc-1",
        nodes: [{ nodeId: "child-2", text: "Restored" }],
      }),
    });
    expect([...restored.state.nodes.keys()]).toEqual(["child-2"]);
    const conflict = applyDesignSyncRequest(restored.state, {
      ...request,
      operations: [{ ...request.operations[0]!, nodeId: "child-2" }],
    });
    expect(
      conflict.result._tag === "conflict" && conflict.result.conflicts[0]?.serverValue,
    ).toEqual({ nodeId: "child-2", text: "Restored" });
  });

  it("returns a conflict and never mutates server state for a stale base revision", () => {
    const state = {
      documentId: "doc-1",
      revision: 2,
      nodes: new Map([["text-1", { x: 24 }]]),
      assetIds: new Set<string>(),
    };
    const result = applyDesignSyncRequest(state, request);
    expect(result.result._tag).toBe("conflict");
    expect(result.state).toBe(state);
    expect(result.result._tag === "conflict" && result.result.conflicts[0]?.serverValue).toEqual({
      x: 24,
    });
  });

  it("returns the server snapshot for a stale document-level operation", () => {
    const snapshot = JSON.stringify({ documentId: "doc-1", pages: [], nodes: [] });
    const result = applyDesignSyncRequest(
      {
        documentId: "doc-1",
        revision: 2,
        nodes: new Map(),
        assetIds: new Set(),
        snapshot,
      },
      { ...request, operations: [{ ...request.operations[0]!, nodeId: null }] },
    );
    expect(result.result._tag === "conflict" && result.result.conflicts[0]?.serverValue).toEqual(
      JSON.parse(snapshot),
    );
  });
});
