import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { DesignSyncRequest, DesignSyncResult } from "./design.js";

const decodeRequest = Schema.decodeUnknownSync(DesignSyncRequest);
const decodeResult = Schema.decodeUnknownSync(DesignSyncResult);

describe("Design sync contracts", () => {
  it("decodes a portable operation request", () => {
    const request = decodeRequest({
      documentId: "doc-1",
      baseRevision: 3,
      operations: [
        {
          operationId: "op-4",
          baseRevision: 3,
          kind: "update-node",
          nodeId: "text-1",
          payload: { x: 42 },
        },
      ],
      assetIds: ["asset-1"],
    });
    expect(request.operations[0]?.kind).toBe("update-node");
  });

  it("keeps conflict results explicit", () => {
    const result = decodeResult({
      _tag: "conflict",
      documentId: "doc-1",
      revision: 4,
      conflicts: [
        {
          nodeId: "text-1",
          baseRevision: 3,
          serverRevision: 4,
          localValue: { x: 42 },
          serverValue: { x: 24 },
        },
      ],
    });
    expect(result._tag).toBe("conflict");
  });
});
