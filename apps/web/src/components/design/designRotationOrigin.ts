import {
  isDesignNodeInFlow,
  isDesignNodeLocked,
  selectionRoots,
  type DesignDocument,
  type DesignNode,
} from "./designDocument";
import { designWorldMatrix, invertDesignMatrix, transformDesignPoint } from "./designGeometry";

export type DesignRotationOrigin = {
  documentId: string;
  selection: readonly string[];
  nodeId: string;
  x: number;
  y: number;
};

export function createDesignRotationOrigin(
  document: DesignDocument,
  selection: readonly string[],
  point: { x: number; y: number },
): DesignRotationOrigin | null {
  if (![point.x, point.y].every(Number.isFinite)) return null;
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const roots = selectionRoots(document, selection).filter(
    (node) => !isDesignNodeLocked(document, node.nodeId, nodes),
  );
  if (roots.some((node) => isDesignNodeInFlow(document, node.nodeId, nodes))) return null;
  const node = roots[0];
  if (!node || node.width <= 0 || node.height <= 0) return null;
  const local = transformDesignPoint(
    invertDesignMatrix(designWorldMatrix(nodes, node.nodeId)),
    point,
  );
  const x = local.x / node.width,
    y = local.y / node.height;
  return [x, y].every(Number.isFinite)
    ? { documentId: document.documentId, selection, nodeId: node.nodeId, x, y }
    : null;
}

export function resolveDesignRotationOrigin(
  document: DesignDocument,
  selection: readonly string[],
  origin: DesignRotationOrigin | null,
  nodes?: ReadonlyMap<string, DesignNode>,
) {
  if (
    !origin ||
    origin.documentId !== document.documentId ||
    origin.selection.length !== selection.length
  )
    return null;
  if (origin.selection !== selection) {
    const selected = new Set(selection);
    if (origin.selection.some((id) => !selected.has(id))) return null;
  }
  const byId = nodes ?? new Map(document.nodes.map((node) => [node.nodeId, node]));
  const node = byId.get(origin.nodeId);
  if (!node || isDesignNodeLocked(document, node.nodeId, byId)) return null;
  if (
    selection.some((id) => isDesignNodeInFlow(document, id, byId)) &&
    selectionRoots(document, selection).some((root) =>
      isDesignNodeInFlow(document, root.nodeId, byId),
    )
  )
    return null;
  const point = transformDesignPoint(designWorldMatrix(byId, node.nodeId), {
    x: origin.x * node.width,
    y: origin.y * node.height,
  });
  return [point.x, point.y].every(Number.isFinite) ? point : null;
}
