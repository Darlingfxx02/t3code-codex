import {
  designNodeWorldFrame,
  designWorldBounds,
  designWorldToLocal,
  commitDesignNodeTransforms,
  isDesignNodeLocked,
  selectionRoots,
  type DesignDocument,
  type DesignNode,
  updateDesignNodes,
} from "./designDocument";
import { scaleDesignMetrics } from "./designScale";
import {
  designWorldMatrix,
  designMatrixPose,
  invertDesignMatrix,
  multiplyDesignMatrices,
  designIdentityMatrix,
  type DesignMatrix,
  transformDesignPoint,
} from "./designGeometry";

type Point = { x: number; y: number };
type Frame = Point & { width: number; height: number; rotation: number };

export function designSelectionFrame(
  document: DesignDocument,
  ids: readonly string[],
  axisAligned = false,
): Frame | null {
  const roots = selectionRoots(document, ids);
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  if (!roots.length) return null;
  if (roots.length === 1 && !axisAligned)
    return designNodeWorldFrame(document, roots[0]!.nodeId, nodes);
  const boxes = roots.flatMap((node) => designWorldBounds(document, node.nodeId, nodes) ?? []);
  const x = Math.min(...boxes.map((box) => box.x)),
    y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((box) => box.x + box.width)) - x,
    height: Math.max(...boxes.map((box) => box.y + box.height)) - y,
    rotation: 0,
  };
}

function rotated(point: Point, degrees: number): Point {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

const precise = (value: number) => Math.round(value * 1e6) / 1e6;

export function designInspectorRotation(cssDegrees: number) {
  const degrees = -cssDegrees % 360;
  return (degrees > 180 ? degrees - 360 : degrees < -180 ? degrees + 360 : degrees) || 0;
}

function transformDesignSelection(
  document: DesignDocument,
  ids: readonly string[],
  transform: DesignMatrix,
) {
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  return updateDesignNodes(
    document,
    new Map(
      selectionRoots(document, ids)
        .filter((node) => !isDesignNodeLocked(document, node.nodeId, nodes))
        .map((node) => {
          const parent = node.parentId
            ? designWorldMatrix(nodes, node.parentId)
            : designIdentityMatrix;
          const world = multiplyDesignMatrices(transform, designWorldMatrix(nodes, node.nodeId));
          return [
            node.nodeId,
            designMatrixPose(multiplyDesignMatrices(invertDesignMatrix(parent), world), node),
          ];
        }),
    ),
  );
}

export function flipDesignSelection(
  document: DesignDocument,
  ids: readonly string[],
  axis: "horizontal" | "vertical",
) {
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const selected = selectionRoots(document, ids).filter(
    (node) => !isDesignNodeLocked(document, node.nodeId, nodes),
  );
  const frame = designSelectionFrame(
    document,
    selected.map((node) => node.nodeId),
  );
  if (!frame) return document;
  const x = frame.x + frame.width / 2,
    y = frame.y + frame.height / 2;
  return transformDesignSelection(
    document,
    ids,
    axis === "horizontal" ? [-1, 0, 0, 1, 2 * x, 0] : [1, 0, 0, -1, 0, 2 * y],
  );
}

export function rotateDesignSelection(
  document: DesignDocument,
  ids: readonly string[],
  degrees: number,
  origin?: Point | null,
) {
  if (!Number.isFinite(degrees) || degrees % 360 === 0) return document;
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const selected = selectionRoots(document, ids).filter(
    (node) => !isDesignNodeLocked(document, node.nodeId, nodes),
  );
  const frame = designSelectionFrame(
    document,
    selected.map((node) => node.nodeId),
  );
  if (!frame) return document;
  const center = origin ?? { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  if (![center.x, center.y].every(Number.isFinite)) return document;
  return updateDesignNodes(
    document,
    new Map(
      selected.map((node) => [
        node.nodeId,
        rotatedDesignNode(document, node, nodes, degrees, center),
      ]),
    ),
  );
}

function rotatedDesignNode(
  document: DesignDocument,
  node: DesignNode,
  nodes: ReadonlyMap<string, DesignNode>,
  degrees: number,
  center: Point,
) {
  const frame = designNodeWorldFrame(document, node.nodeId, nodes)!;
  const offset = rotated(
    { x: frame.x + frame.width / 2 - center.x, y: frame.y + frame.height / 2 - center.y },
    degrees,
  );
  const world = { x: center.x + offset.x, y: center.y + offset.y };
  const local = node.parentId ? designWorldToLocal(document, node.parentId, world, nodes) : world;
  const parent = node.parentId ? designWorldMatrix(nodes, node.parentId) : designIdentityMatrix;
  const handedness = parent[0] * parent[3] - parent[1] * parent[2] < 0 ? -1 : 1;
  return {
    x: precise(local.x - node.width / 2),
    y: precise(local.y - node.height / 2),
    rotation: precise((node.rotation ?? 0) + degrees * handedness),
  };
}

export function setDesignNodeRotation(
  document: DesignDocument,
  nodeId: string,
  degrees: number,
  origin?: Point | null,
) {
  return setDesignNodeRotations(document, new Map([[nodeId, degrees]]), origin);
}

export function setDesignNodeRotations(
  document: DesignDocument,
  rotations: ReadonlyMap<string, number>,
  origin?: Point | null,
) {
  if (
    [...rotations.values()].some((value) => !Number.isFinite(value)) ||
    (origin && ![origin.x, origin.y].every(Number.isFinite))
  )
    return document;
  if (!origin)
    return updateDesignNodes(
      document,
      new Map([...rotations].map(([id, rotation]) => [id, { rotation }])),
    );
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const deltas = new Map<string, number>();
  const deltaFor = (id: string | null) => {
    const chain: DesignNode[] = [],
      seen = new Set<string>();
    let node = nodes.get(id ?? "");
    while (node && !deltas.has(node.nodeId) && !seen.has(node.nodeId)) {
      seen.add(node.nodeId);
      chain.push(node);
      node = nodes.get(node.parentId ?? "");
    }
    let delta = node ? (deltas.get(node.nodeId) ?? 0) : 0;
    for (const item of chain.toReversed()) {
      const requested = rotations.get(item.nodeId);
      if (requested !== undefined) {
        const parent = item.parentId
          ? designWorldMatrix(nodes, item.parentId)
          : designIdentityMatrix;
        const sign = parent[0] * parent[3] - parent[1] * parent[2] < 0 ? -1 : 1;
        delta += (requested - (item.rotation ?? 0)) * sign;
      }
      deltas.set(item.nodeId, delta);
    }
    return id ? (deltas.get(id) ?? 0) : 0;
  };
  return updateDesignNodes(
    document,
    new Map(
      [...rotations].flatMap(([id, rotation]) => {
        const node = nodes.get(id);
        if (!node) return [];
        const frame = designNodeWorldFrame(document, id, nodes)!;
        const offset = rotated(
          { x: frame.x + frame.width / 2 - origin.x, y: frame.y + frame.height / 2 - origin.y },
          deltaFor(id),
        );
        let center = { x: origin.x + offset.x, y: origin.y + offset.y };
        if (node.parentId) {
          const parent = designWorldMatrix(nodes, node.parentId),
            delta = deltaFor(node.parentId);
          const xAxis = rotated({ x: 1, y: 0 }, delta);
          const around: DesignMatrix = [
            xAxis.x,
            xAxis.y,
            -xAxis.y,
            xAxis.x,
            origin.x - xAxis.x * origin.x + xAxis.y * origin.y,
            origin.y - xAxis.y * origin.x - xAxis.x * origin.y,
          ];
          center = transformDesignPoint(
            invertDesignMatrix(multiplyDesignMatrices(around, parent)),
            center,
          );
        }
        return [
          [
            id,
            {
              x: precise(center.x - node.width / 2),
              y: precise(center.y - node.height / 2),
              rotation,
            },
          ],
        ];
      }),
    ),
  );
}

export function designScalableRoots(document: DesignDocument, ids: readonly string[]) {
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  return selectionRoots(document, ids).filter((node) => {
    if (isDesignNodeLocked(document, node.nodeId, nodes)) return false;
    const seen = new Set<string>();
    let parent = nodes.get(node.parentId ?? "");
    while (parent && !seen.has(parent.nodeId)) {
      if (parent.kind === "instance") return false;
      seen.add(parent.nodeId);
      parent = nodes.get(parent.parentId ?? "");
    }
    return true;
  });
}

export function scaleDesignSelection(
  document: DesignDocument,
  ids: readonly string[],
  factor: number,
  anchor: Point = { x: 0, y: 0 },
  preview = false,
): DesignDocument {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return document;
  const roots = designScalableRoots(document, ids);
  const frame = designSelectionFrame(
    document,
    roots.map((node) => node.nodeId),
  );
  if (!frame || frame.width <= 0 || frame.height <= 0) return document;
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const delta = rotated(
    { x: (anchor.x - 0.5) * frame.width, y: (anchor.y - 0.5) * frame.height },
    frame.rotation,
  );
  const fixed = { x: frame.x + frame.width / 2 + delta.x, y: frame.y + frame.height / 2 + delta.y };
  const changes = new Map<string, DesignNode>();
  const visit = (node: DesignNode, root: boolean) => {
    if (changes.has(node.nodeId)) return;
    const scaled = scaleDesignMetrics(node, factor);
    const world = root ? designNodeWorldFrame(document, node.nodeId, nodes)! : null;
    const center = world
      ? {
          x: fixed.x + (world.x + world.width / 2 - fixed.x) * factor,
          y: fixed.y + (world.y + world.height / 2 - fixed.y) * factor,
        }
      : null;
    const local =
      center && node.parentId ? designWorldToLocal(document, node.parentId, center, nodes) : center;
    changes.set(node.nodeId, {
      ...scaled,
      ...(local ? { x: local.x - scaled.width / 2, y: local.y - scaled.height / 2 } : {}),
      ...(root && node.layoutSizing
        ? { layoutSizing: { ...scaled.layoutSizing!, width: "fixed", height: "fixed" } }
        : {}),
      ...(node.instanceOfNodeId ? { instanceScale: (node.instanceScale ?? 1) * factor } : {}),
    });
    for (const id of node.childIds) {
      const child = nodes.get(id);
      if (child) visit(child, false);
    }
  };
  roots.forEach((node) => visit(node, true));
  if (
    [...changes.values()].some(
      (node) =>
        [node.x, node.y, node.width, node.height].some(
          (value) => !Number.isFinite(value) || Math.abs(value) > 1e9,
        ) ||
        node.width < 0.000001 ||
        node.height < 0.000001,
    )
  )
    return document;
  const next = {
    ...document,
    nodes: document.nodes.map((node) => changes.get(node.nodeId) ?? node),
  };
  return preview ? next : commitDesignNodeTransforms(document, next);
}

export function previewDesignTransform({
  document,
  ids,
  kind,
  start,
  point,
  handle = "se",
  shift = false,
  alt = false,
  control = false,
  snap = false,
  origin,
}: {
  document: DesignDocument;
  ids: readonly string[];
  kind: "move" | "resize" | "rotate" | "scale";
  start: Point;
  point: Point;
  handle?: string;
  shift?: boolean;
  alt?: boolean;
  control?: boolean;
  snap?: boolean;
  origin?: Point;
}): DesignDocument {
  if (![start.x, start.y, point.x, point.y].every(Number.isFinite)) return document;
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const roots = (
    kind === "scale" ? designScalableRoots(document, ids) : selectionRoots(document, ids)
  ).filter((node) => !isDesignNodeLocked(document, node.nodeId, nodes));
  const box = designSelectionFrame(
    document,
    roots.map((node) => node.nodeId),
  );
  if (!box) return document;
  const changes = new Map<string, Partial<DesignNode>>();
  const place = (node: DesignNode, center: Point, width = node.width, height = node.height) => {
    const local = node.parentId
      ? designWorldToLocal(document, node.parentId, center, nodes)
      : center;
    return {
      x: precise(local.x - width / 2),
      y: precise(local.y - height / 2),
      width: precise(width),
      height: precise(height),
    };
  };
  const dx = point.x - start.x,
    dy = point.y - start.y;
  const round = (value: number) => (snap ? Math.round(value) : value);
  if (kind === "scale") {
    const horizontal = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
    const vertical = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;
    const anchor = alt ? { x: 0.5, y: 0.5 } : { x: (1 - horizontal) / 2, y: (1 - vertical) / 2 };
    const extent = rotated(
      { x: horizontal * box.width * (alt ? 0.5 : 1), y: vertical * box.height * (alt ? 0.5 : 1) },
      box.rotation,
    );
    const length = extent.x ** 2 + extent.y ** 2;
    const factor = length ? Math.max(0.000001, 1 + (dx * extent.x + dy * extent.y) / length) : 1;
    return scaleDesignSelection(document, ids, factor, anchor, true);
  }
  if (kind === "move") {
    const delta = {
      x: round(box.x + (shift && Math.abs(dy) > Math.abs(dx) ? 0 : dx)) - box.x,
      y: round(box.y + (shift && Math.abs(dx) >= Math.abs(dy) ? 0 : dy)) - box.y,
    };
    for (const node of roots) {
      const frame = designNodeWorldFrame(document, node.nodeId, nodes)!;
      changes.set(
        node.nodeId,
        place(node, {
          x: frame.x + frame.width / 2 + delta.x,
          y: frame.y + frame.height / 2 + delta.y,
        }),
      );
    }
  } else if (kind === "resize") {
    const horizontal = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
    const vertical = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;
    const local = rotated({ x: dx, y: dy }, -box.rotation);
    let width = horizontal
      ? Math.max(0.000001, round(box.width + horizontal * local.x * (alt ? 2 : 1)))
      : box.width;
    let height = vertical
      ? Math.max(0.000001, round(box.height + vertical * local.y * (alt ? 2 : 1)))
      : box.height;
    if (shift || (!control && roots.every((node) => node.aspectRatioLocked === true))) {
      let scale =
        Math.abs(width / box.width - 1) > Math.abs(height / box.height - 1)
          ? width / box.width
          : height / box.height;
      const node = roots.length === 1 ? roots[0] : undefined;
      const minimum = Math.max(
        0.000001 / box.width,
        0.000001 / box.height,
        (node?.layoutSizing?.minWidth ?? 0) / box.width,
        (node?.layoutSizing?.minHeight ?? 0) / box.height,
      );
      const maximum = Math.min(
        (node?.layoutSizing?.maxWidth ?? Infinity) / box.width,
        (node?.layoutSizing?.maxHeight ?? Infinity) / box.height,
      );
      scale = Math.max(minimum, Math.min(maximum, scale));
      width = box.width * scale;
      height = box.height * scale;
    }
    const centerShift = rotated(
      {
        x: alt ? 0 : (horizontal * (width - box.width)) / 2,
        y: alt ? 0 : (vertical * (height - box.height)) / 2,
      },
      box.rotation,
    );
    const center = {
      x: box.x + box.width / 2 + centerShift.x,
      y: box.y + box.height / 2 + centerShift.y,
    };
    for (const node of roots) {
      const frame = designNodeWorldFrame(document, node.nodeId, nodes)!;
      const nodeWidth =
        roots.length === 1 ? width : Math.max(0.000001, (node.width * width) / box.width);
      const nodeHeight =
        roots.length === 1 ? height : Math.max(0.000001, (node.height * height) / box.height);
      const nodeCenter =
        roots.length === 1
          ? center
          : {
              x:
                center.x +
                ((frame.x + frame.width / 2 - box.x - box.width / 2) * width) / box.width,
              y:
                center.y +
                ((frame.y + frame.height / 2 - box.y - box.height / 2) * height) / box.height,
            };
      const change: Partial<DesignNode> = {
        ...place(node, nodeCenter, nodeWidth, nodeHeight),
        ...(node.layoutSizing && (nodeWidth !== node.width || nodeHeight !== node.height)
          ? {
              layoutSizing: {
                ...node.layoutSizing,
                width: nodeWidth !== node.width ? ("fixed" as const) : node.layoutSizing.width,
                height: nodeHeight !== node.height ? ("fixed" as const) : node.layoutSizing.height,
              },
            }
          : {}),
      };
      changes.set(node.nodeId, change);
    }
  } else {
    const center = origin ?? { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    if (![center.x, center.y].every(Number.isFinite)) return document;
    const raw =
      ((Math.atan2(point.y - center.y, point.x - center.x) -
        Math.atan2(start.y - center.y, start.x - center.x)) *
        180) /
      Math.PI;
    const normalized = ((raw + 540) % 360) - 180;
    const delta = shift ? Math.round(normalized / 15) * 15 : normalized;
    for (const node of roots) {
      changes.set(node.nodeId, rotatedDesignNode(document, node, nodes, delta, center));
    }
  }
  return {
    ...document,
    nodes: document.nodes.map((node) => ({ ...node, ...changes.get(node.nodeId) })),
  };
}
