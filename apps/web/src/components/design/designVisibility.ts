import {
  designWorldBounds,
  nodeForPage,
  type DesignDocument,
  type DesignNode,
} from "./designDocument";
import { designEffectOutset } from "./designEffects";

type Box = { x: number; y: number; width: number; height: number };
type Entry = { node: DesignNode; bounds: Box | null };

function intersection(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x),
    y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return right >= x && bottom >= y ? { x, y, width: right - x, height: bottom - y } : null;
}

export function designPageGeometry(
  document: DesignDocument,
  nodes: ReadonlyMap<string, DesignNode>,
) {
  const entries = new Map<string, Entry>();
  const stack: { node: DesignNode; clip?: Box; inheritedOutset: number }[] = nodeForPage(document)
    .toReversed()
    .map((node) => ({ node, inheritedOutset: 0 }));
  while (stack.length) {
    const { node, clip, inheritedOutset } = stack.pop()!;
    if (node.visible === false || entries.has(node.nodeId)) continue;
    const box = designWorldBounds(document, node.nodeId, nodes);
    if (!box) continue;
    const pad = designEffectOutset(node) * Math.SQRT2 + inheritedOutset;
    const visual = {
      x: box.x - pad,
      y: box.y - pad,
      width: box.width + 2 * pad,
      height: box.height + 2 * pad,
    };
    const visibleClip = clip
      ? {
          x: clip.x - inheritedOutset,
          y: clip.y - inheritedOutset,
          width: clip.width + 2 * inheritedOutset,
          height: clip.height + 2 * inheritedOutset,
        }
      : null;
    const bounds = visibleClip ? intersection(visual, visibleClip) : visual;
    entries.set(node.nodeId, { node, bounds });
    if (node.clipContent && !bounds) continue;
    const childClip = node.clipContent
      ? clip
        ? (intersection(box, clip) ?? undefined)
        : box
      : clip;
    for (const id of node.childIds.toReversed()) {
      const child = nodes.get(id);
      if (child)
        stack.push({
          node: child,
          inheritedOutset: pad,
          ...(childClip ? { clip: childClip } : {}),
        });
    }
  }
  return entries;
}

type CanvasGeometry = {
  nodes: ReadonlyMap<string, DesignNode>;
  entries: ReadonlyMap<string, Entry>;
};
// Bound derived indexes independently of the document's undo history.
const geometryCache = new Map<DesignDocument, CanvasGeometry>();

export function designCanvasGeometry(document: DesignDocument): CanvasGeometry {
  const cached = geometryCache.get(document);
  if (cached) return cached;
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const geometry = { nodes, entries: designPageGeometry(document, nodes) };
  geometryCache.set(document, geometry);
  if (geometryCache.size > 2) {
    const oldest = geometryCache.keys().next().value;
    if (oldest) geometryCache.delete(oldest);
  }
  return geometry;
}

export function designViewportNodes(
  geometry: ReadonlyMap<string, Entry>,
  viewport: Box,
  pinned: readonly string[],
) {
  const visible = new Set<string>();
  const include = (id: string) => {
    let entry = geometry.get(id);
    while (entry && !visible.has(entry.node.nodeId)) {
      visible.add(entry.node.nodeId);
      entry = entry.node.parentId ? geometry.get(entry.node.parentId) : undefined;
    }
  };
  for (const [id, entry] of geometry)
    if (entry.bounds && intersection(entry.bounds, viewport)) include(id);
  for (const id of pinned) include(id);
  return visible;
}
