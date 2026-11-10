import * as Schema from "effect/Schema";
import { DesignAssetPayload } from "@t3tools/contracts";
import { packageDesignAssets } from "./designAssetPackage";
import { descendants, DesignDocument, selectionRoots } from "./designDocument";
import { designWorldMatrix, designMatrixPose } from "./designGeometry";

const ClipboardSelection = Schema.Struct({
  kind: Schema.Literal("t3-design-selection"),
  document: DesignDocument,
  nodeIds: Schema.Array(Schema.String),
  assetPayloads: Schema.optional(Schema.Array(DesignAssetPayload)),
});
const decode = Schema.decodeUnknownSync(Schema.fromJsonString(ClipboardSelection));

export function copyDesignSelection(
  document: DesignDocument,
  nodeIds: readonly string[],
): string | null {
  const roots = selectionRoots(document, nodeIds);
  if (!roots.length) return null;
  const rootIds = new Set(roots.map((node) => node.nodeId));
  const byId = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const included = new Set(
    roots.flatMap((node) => [
      node.nodeId,
      ...descendants(document, node.nodeId).map((child) => child.nodeId),
    ]),
  );
  const nodes = document.nodes
    .filter((node) => included.has(node.nodeId))
    .map((node) =>
      rootIds.has(node.nodeId)
        ? {
            ...node,
            ...designMatrixPose(designWorldMatrix(byId, node.nodeId), node),
            parentId: null,
          }
        : node,
    );
  const assets = document.assets.filter((asset) =>
    nodes.some((node) => node.assetId === asset.assetId),
  );
  return JSON.stringify({
    kind: "t3-design-selection",
    document: {
      ...document,
      pages: [{ pageId: document.activePageId, name: "Selection", nodeIds: [...rootIds] }],
      nodes,
      assets,
      conflicts: [],
      pendingOperations: [],
    },
    nodeIds: [...rootIds],
  });
}

export function readDesignSelection(text: string) {
  try {
    return decode(text);
  } catch {
    return null;
  }
}

export async function portableDesignSelection(text: string): Promise<string> {
  const selection = decode(text);
  return JSON.stringify({
    ...selection,
    assetPayloads: await packageDesignAssets(selection.document),
  });
}
