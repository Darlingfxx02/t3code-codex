import * as Schema from "effect/Schema";
import { reflowDesignLayout } from "./designLayout";
import { scaleDesignMetrics } from "./designScale";
import { designEffectOutset } from "./designEffects";
import {
  designNodeMatrix,
  designWorldMatrix,
  designMatrixPose,
  transformDesignPoint,
  invertDesignMatrix,
  multiplyDesignMatrices,
} from "./designGeometry";

export const DesignNodeKind = Schema.Literals([
  "frame",
  "group",
  "text",
  "vector",
  "image",
  "component",
  "instance",
]);
export type DesignNodeKind = typeof DesignNodeKind.Type;

export const DesignProvenance = Schema.Struct({
  mode: Schema.Literals(["snapshot", "linked", "generated", "patch"]),
  route: Schema.String,
  sourceRevision: Schema.NullOr(Schema.String),
  viewportWidth: Schema.NullOr(Schema.Number),
  viewportHeight: Schema.NullOr(Schema.Number),
  colorScheme: Schema.String,
  capturedAt: Schema.String,
  sourceThreadId: Schema.optional(Schema.String),
  sourceTabId: Schema.optional(Schema.String),
  browserEngine: Schema.optional(Schema.String),
  stateFixture: Schema.optional(Schema.String),
  captureTruncated: Schema.optional(Schema.Boolean),
});
export type DesignProvenance = typeof DesignProvenance.Type;

export const DesignLayoutModel = Schema.Struct({
  kind: Schema.Literals(["absolute", "flex", "grid", "auto-layout"]),
  direction: Schema.optional(Schema.Literals(["row", "column"])),
  gap: Schema.optional(Schema.Number),
  resolvedX: Schema.optional(Schema.Number),
  resolvedY: Schema.optional(Schema.Number),
  resolvedWidth: Schema.optional(Schema.Number),
  resolvedHeight: Schema.optional(Schema.Number),
  padding: Schema.optional(Schema.Number),
  paddingTop: Schema.optional(Schema.Number),
  paddingRight: Schema.optional(Schema.Number),
  paddingBottom: Schema.optional(Schema.Number),
  paddingLeft: Schema.optional(Schema.Number),
  wrap: Schema.optional(Schema.Boolean),
  align: Schema.optional(Schema.Literals(["start", "center", "end", "stretch"])),
  justify: Schema.optional(Schema.Literals(["start", "center", "end", "space-between"])),
  counterAxisSpacing: Schema.optional(Schema.Number),
  counterAxisAlign: Schema.optional(
    Schema.Literals(["min", "center", "max", "baseline", "stretch"]),
  ),
});
export type DesignLayoutModel = typeof DesignLayoutModel.Type;

export const DesignConstraints = Schema.Struct({
  horizontal: Schema.Literals(["left", "right", "left-right", "center", "scale"]),
  vertical: Schema.Literals(["top", "bottom", "top-bottom", "center", "scale"]),
});
export type DesignConstraints = typeof DesignConstraints.Type;

export const DesignGradientStop = Schema.Struct({
  color: Schema.String,
  position: Schema.Number,
});
export type DesignGradientStop = typeof DesignGradientStop.Type;

export const DesignFill = Schema.Struct({
  color: Schema.String,
  opacity: Schema.optional(Schema.Number),
  kind: Schema.optional(
    Schema.Literals([
      "solid",
      "linear-gradient",
      "radial-gradient",
      "angular-gradient",
      "diamond-gradient",
    ]),
  ),
  angle: Schema.optional(Schema.Number),
  stops: Schema.optional(Schema.Array(DesignGradientStop)),
});
export type DesignFill = typeof DesignFill.Type;

export const DesignStroke = Schema.Struct({
  color: Schema.String,
  width: Schema.Number,
  opacity: Schema.optional(Schema.Number),
  align: Schema.optional(Schema.Literals(["inside", "center", "outside"])),
  cap: Schema.optional(Schema.Literals(["butt", "round", "square"])),
  join: Schema.optional(Schema.Literals(["miter", "round", "bevel"])),
});
export type DesignStroke = typeof DesignStroke.Type;

export const DesignPaint = Schema.Struct({
  background: Schema.optional(Schema.String),
  borderColor: Schema.optional(Schema.String),
  borderWidth: Schema.optional(Schema.Number),
  radius: Schema.optional(Schema.Number),
  blendMode: Schema.optional(
    Schema.Literals([
      "normal",
      "multiply",
      "screen",
      "overlay",
      "darken",
      "lighten",
      "color-dodge",
      "color-burn",
      "hard-light",
      "soft-light",
      "difference",
      "exclusion",
      "hue",
      "saturation",
      "color",
      "luminosity",
    ]),
  ),
  fills: Schema.optional(Schema.Array(DesignFill)),
  strokes: Schema.optional(Schema.Array(DesignStroke)),
});
export type DesignPaint = typeof DesignPaint.Type;

export const DesignEffect = Schema.Struct({
  effectId: Schema.String,
  kind: Schema.Literals(["drop-shadow", "inner-shadow", "layer-blur", "background-blur"]),
  visible: Schema.Boolean,
  x: Schema.Number,
  y: Schema.Number,
  blur: Schema.Number,
  spread: Schema.Number,
  color: Schema.String,
  showBehindTransparentAreas: Schema.optional(Schema.Boolean),
});
export type DesignEffect = typeof DesignEffect.Type;

export const DesignComment = Schema.Struct({
  commentId: Schema.String,
  x: Schema.Number,
  y: Schema.Number,
  parentId: Schema.NullOr(Schema.String),
  text: Schema.String,
  resolved: Schema.Boolean,
});
export type DesignComment = typeof DesignComment.Type;

export const DesignTypography = Schema.Struct({
  family: Schema.optional(Schema.String),
  size: Schema.optional(Schema.Number),
  weight: Schema.optional(Schema.Number),
  fontStyle: Schema.optional(Schema.Literals(["normal", "italic", "oblique"])),
  lineHeight: Schema.optional(Schema.Number),
  lineHeightUnit: Schema.optional(Schema.Literals(["px", "percent"])),
  letterSpacing: Schema.optional(Schema.Number),
  letterSpacingUnit: Schema.optional(Schema.Literals(["px", "percent"])),
  decoration: Schema.optional(
    Schema.Literals(["none", "underline", "line-through", "underline line-through"]),
  ),
  letterCase: Schema.optional(
    Schema.Literals(["none", "uppercase", "lowercase", "capitalize", "small-caps"]),
  ),
  fontFeatureSettings: Schema.optional(Schema.String),
  fontVariationSettings: Schema.optional(Schema.String),
  wrap: Schema.optional(Schema.Literals(["auto", "balance", "pretty"])),
  color: Schema.optional(Schema.String),
  align: Schema.optional(Schema.Literals(["left", "center", "right", "justify"])),
  verticalAlign: Schema.optional(Schema.Literals(["top", "middle", "bottom"])),
  paragraphSpacing: Schema.optional(Schema.Number),
  indent: Schema.optional(Schema.Number),
  listStyle: Schema.optional(Schema.Literals(["none", "bulleted", "numbered"])),
  maxLines: Schema.optional(Schema.Number),
  truncation: Schema.optional(Schema.Literals(["none", "clip", "ellipsis"])),
});
export type DesignTypography = typeof DesignTypography.Type;

export const DesignInteraction = Schema.Struct({
  id: Schema.optional(Schema.String),
  trigger: Schema.String,
  action: Schema.String,
  targetNodeId: Schema.NullOr(Schema.String),
  url: Schema.optional(Schema.String),
  key: Schema.optional(Schema.String),
  delayMs: Schema.optional(Schema.Number),
  transition: Schema.optional(
    Schema.Literals(["instant", "dissolve", "slide-left", "slide-right"]),
  ),
  durationMs: Schema.optional(Schema.Number),
  overlay: Schema.optional(
    Schema.Struct({
      position: Schema.optional(
        Schema.Literals([
          "center",
          "top-left",
          "top-center",
          "top-right",
          "bottom-left",
          "bottom-center",
          "bottom-right",
          "manual",
        ]),
      ),
      x: Schema.optional(Schema.Number),
      y: Schema.optional(Schema.Number),
      dismissOnOutside: Schema.optional(Schema.Boolean),
      background: Schema.optional(Schema.Boolean),
      backgroundColor: Schema.optional(Schema.String),
      backgroundOpacity: Schema.optional(Schema.Number),
    }),
  ),
});
export type DesignInteraction = typeof DesignInteraction.Type;

export const DesignNode = Schema.Struct({
  nodeId: Schema.String,
  kind: DesignNodeKind,
  name: Schema.String,
  parentId: Schema.NullOr(Schema.String),
  childIds: Schema.Array(Schema.String),
  x: Schema.Number,
  y: Schema.Number,
  width: Schema.Number,
  height: Schema.Number,
  fill: Schema.NullOr(Schema.String),
  border: Schema.NullOr(Schema.String),
  text: Schema.NullOr(Schema.String),
  fontSize: Schema.NullOr(Schema.Number),
  fontWeight: Schema.NullOr(Schema.Number),
  opacity: Schema.Number,
  assetId: Schema.NullOr(Schema.String),
  sourceUrl: Schema.optional(Schema.String),
  image: Schema.optional(
    Schema.Struct({
      mode: Schema.optional(Schema.Literals(["fill", "fit", "crop", "tile"])),
      scale: Schema.optional(Schema.Number),
      offsetX: Schema.optional(Schema.Number),
      offsetY: Schema.optional(Schema.Number),
    }),
  ),
  provenance: Schema.NullOr(DesignProvenance),
  layoutModel: Schema.optional(DesignLayoutModel),
  paint: Schema.optional(DesignPaint),
  effects: Schema.optional(Schema.Array(DesignEffect)),
  typography: Schema.optional(DesignTypography),
  interactions: Schema.optional(Schema.Array(DesignInteraction)),
  componentId: Schema.optional(Schema.String),
  instanceOfNodeId: Schema.optional(Schema.String),
  instanceScale: Schema.optional(Schema.Number),
  overrides: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  rotation: Schema.optional(Schema.Number),
  flipX: Schema.optional(Schema.Boolean),
  flipY: Schema.optional(Schema.Boolean),
  aspectRatioLocked: Schema.optional(Schema.Boolean),
  visible: Schema.optional(Schema.Boolean),
  locked: Schema.optional(Schema.Boolean),
  section: Schema.optional(Schema.Boolean),
  slice: Schema.optional(Schema.Boolean),
  clipContent: Schema.optional(Schema.Boolean),
  constraints: Schema.optional(DesignConstraints),
  layoutSizing: Schema.optional(
    Schema.Struct({
      width: Schema.Literals(["fixed", "hug", "fill"]),
      height: Schema.Literals(["fixed", "hug", "fill"]),
      minWidth: Schema.optional(Schema.Number),
      minHeight: Schema.optional(Schema.Number),
      maxWidth: Schema.optional(Schema.Number),
      maxHeight: Schema.optional(Schema.Number),
      position: Schema.optional(Schema.Literals(["flow", "absolute"])),
    }),
  ),
  vector: Schema.optional(
    Schema.Struct({
      path: Schema.String,
      width: Schema.Number,
      height: Schema.Number,
      closed: Schema.Boolean,
      fillRule: Schema.optional(Schema.Literals(["nonzero", "evenodd"])),
      points: Schema.optional(
        Schema.Array(
          Schema.Struct({
            x: Schema.Number,
            y: Schema.Number,
            inHandle: Schema.optional(Schema.Struct({ x: Schema.Number, y: Schema.Number })),
            outHandle: Schema.optional(Schema.Struct({ x: Schema.Number, y: Schema.Number })),
          }),
        ),
      ),
    }),
  ),
});
export type DesignNode = typeof DesignNode.Type;
export type DesignVectorPoint = {
  x: number;
  y: number;
  inHandle?: { x: number; y: number };
  outHandle?: { x: number; y: number };
};

export const DesignPrototypeSettings = Schema.Struct({
  background: Schema.optional(Schema.String),
  device: Schema.optional(Schema.Literals(["none", "phone", "tablet", "browser"])),
  scale: Schema.optional(Schema.Literals(["fit", "actual"])),
  viewportWidth: Schema.optional(Schema.Number),
  viewportHeight: Schema.optional(Schema.Number),
});
export type DesignPrototypeSettings = typeof DesignPrototypeSettings.Type;

export const DesignPage = Schema.Struct({
  pageId: Schema.String,
  name: Schema.String,
  nodeIds: Schema.Array(Schema.String),
  background: Schema.optional(Schema.String),
  prototypeStartNodeId: Schema.optional(Schema.String),
  prototypeSettings: Schema.optional(DesignPrototypeSettings),
});
export type DesignPage = typeof DesignPage.Type;

export const DesignAssetMeta = Schema.Struct({
  assetId: Schema.String,
  name: Schema.String,
  mimeType: Schema.String,
  size: Schema.Number,
  createdAt: Schema.String,
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
});
export type DesignAssetMeta = typeof DesignAssetMeta.Type;

export const DesignOperation = Schema.Struct({
  operationId: Schema.String,
  baseRevision: Schema.Number,
  kind: Schema.Literals(["update-node", "add-node", "add-page", "add-asset"]),
  nodeId: Schema.NullOr(Schema.String),
  assetId: Schema.optional(Schema.String),
  fields: Schema.optional(Schema.Array(Schema.String)),
});
export type DesignOperation = typeof DesignOperation.Type;

export const DesignConflictRecord = Schema.Struct({
  nodeId: Schema.NullOr(Schema.String),
  assetId: Schema.optional(Schema.String),
  baseRevision: Schema.Number,
  serverRevision: Schema.Number,
  localValue: Schema.Unknown,
  serverValue: Schema.Unknown,
});
export type DesignConflictRecord = typeof DesignConflictRecord.Type;

export const DesignDocument = Schema.Struct({
  version: Schema.Literal(1),
  documentId: Schema.String,
  title: Schema.String,
  pages: Schema.Array(DesignPage),
  nodes: Schema.Array(DesignNode),
  activePageId: Schema.String,
  updatedAt: Schema.String,
  provenance: Schema.NullOr(DesignProvenance),
  assets: Schema.Array(DesignAssetMeta),
  revision: Schema.Number,
  pendingOperations: Schema.Array(DesignOperation),
  syncState: Schema.Literals(["local", "syncing", "synced", "conflict", "offline"]),
  conflicts: Schema.Array(DesignConflictRecord),
  comments: Schema.optional(Schema.Array(DesignComment)),
  guides: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: Schema.String,
        pageId: Schema.String,
        axis: Schema.Literals(["x", "y"]),
        position: Schema.Number,
      }),
    ),
  ),
});
export type DesignDocument = typeof DesignDocument.Type;

export const DesignDocuments = Schema.Array(DesignDocument);
export type DesignDocuments = typeof DesignDocuments.Type;

export const DESIGN_DOCUMENTS_STORAGE_KEY = "t3code:design:documents:v1";

const now = () => new Date().toISOString();

function recordOperation(
  document: DesignDocument,
  operation: Omit<DesignOperation, "operationId" | "baseRevision">,
): DesignDocument {
  return recordOperations(document, [operation]);
}

function recordOperations(
  document: DesignDocument,
  operations: readonly Omit<DesignOperation, "operationId" | "baseRevision">[],
): DesignDocument {
  const pendingOperations = [...document.pendingOperations];
  let revision = document.revision;
  for (const operation of operations) {
    const previous = pendingOperations.at(-1);
    if (
      document.syncState !== "syncing" &&
      previous?.kind === "update-node" &&
      operation.kind === "update-node" &&
      previous.nodeId === operation.nodeId
    ) {
      pendingOperations[pendingOperations.length - 1] = {
        ...previous,
        fields: [...new Set([...(previous.fields ?? []), ...(operation.fields ?? [])])],
      };
    } else {
      pendingOperations.push({
        ...operation,
        operationId: `op-${revision + 1}`,
        baseRevision: revision,
      });
      revision++;
    }
  }
  return {
    ...document,
    nodes: reflowDesignLayout(document.nodes),
    revision,
    pendingOperations,
    syncState: "local",
    updatedAt: now(),
  };
}

export function createInitialDesignDocument(): DesignDocument {
  const frameId = "frame-home";
  const textId = "text-welcome";
  const pageId = "page-home";
  return {
    version: 1,
    documentId: "design-document-1",
    title: "Untitled design",
    pages: [{ pageId, name: "Page 1", nodeIds: [frameId] }],
    activePageId: pageId,
    updatedAt: now(),
    provenance: null,
    assets: [],
    revision: 0,
    pendingOperations: [],
    syncState: "local",
    conflicts: [],
    comments: [],
    nodes: [
      {
        nodeId: frameId,
        kind: "frame",
        clipContent: true,
        name: "Home screen",
        parentId: null,
        childIds: [textId],
        x: 120,
        y: 96,
        width: 640,
        height: 420,
        fill: "#ffffff",
        border: "#d7dce5",
        text: null,
        fontSize: null,
        fontWeight: null,
        opacity: 1,
        assetId: null,
        provenance: null,
        layoutModel: {
          kind: "absolute",
          resolvedX: 120,
          resolvedY: 96,
          resolvedWidth: 640,
          resolvedHeight: 420,
        },
        paint: { background: "#ffffff", borderColor: "#d7dce5", borderWidth: 1, radius: 8 },
        interactions: [],
      },
      {
        nodeId: textId,
        kind: "text",
        name: "Welcome heading",
        parentId: frameId,
        childIds: [],
        x: 56,
        y: 54,
        width: 420,
        height: 64,
        fill: "#111827",
        border: null,
        text: "Design starts here",
        fontSize: 36,
        fontWeight: 700,
        opacity: 1,
        assetId: null,
        provenance: null,
        layoutModel: {
          kind: "absolute",
          resolvedX: 56,
          resolvedY: 54,
          resolvedWidth: 420,
          resolvedHeight: 64,
        },
        typography: { size: 36, weight: 700, color: "#111827" },
        interactions: [],
      },
    ],
  };
}

export function isDesignNodeLocked(
  document: DesignDocument,
  nodeId: string,
  nodes?: ReadonlyMap<string, DesignNode>,
): boolean {
  const seen = new Set<string>();
  let node = nodes
    ? nodes.get(nodeId)
    : document.nodes.find((candidate) => candidate.nodeId === nodeId);
  while (node && !seen.has(node.nodeId)) {
    if (node.locked) return true;
    seen.add(node.nodeId);
    node = nodes
      ? nodes.get(node.parentId ?? "")
      : document.nodes.find((candidate) => candidate.nodeId === node?.parentId);
  }
  return false;
}

export function isDesignNodeInFlow(
  document: DesignDocument,
  nodeId: string,
  nodes?: ReadonlyMap<string, DesignNode>,
): boolean {
  const node = nodes ? nodes.get(nodeId) : document.nodes.find((item) => item.nodeId === nodeId);
  if (!node?.parentId || node.layoutSizing?.position === "absolute") return false;
  const parent = nodes
    ? nodes.get(node.parentId)
    : document.nodes.find((item) => item.nodeId === node.parentId);
  return parent?.layoutModel !== undefined && parent.layoutModel.kind !== "absolute";
}

export function selectionRoots(
  document: DesignDocument,
  nodeIds: ReadonlyArray<string>,
): ReadonlyArray<DesignNode> {
  const selected = new Set(nodeIds);
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  return document.nodes.filter((node) => {
    if (!selected.has(node.nodeId)) return false;
    const seen = new Set<string>();
    let parentId = node.parentId;
    while (parentId !== null && !seen.has(parentId)) {
      if (selected.has(parentId)) return false;
      seen.add(parentId);
      parentId = nodes.get(parentId)?.parentId ?? null;
    }
    return true;
  });
}

function layoutChildren(
  nodes: ReadonlyArray<DesignNode>,
  before: DesignNode,
  after: DesignNode,
): ReadonlyArray<DesignNode> {
  const layout = after.layoutModel;
  const children = after.childIds
    .map((id) => nodes.find((node) => node.nodeId === id))
    .filter((node): node is DesignNode => node !== undefined);
  const updates = new Map<string, DesignNode>();
  const padding = Math.max(0, layout?.padding ?? 0);
  const gap = Math.max(0, layout?.gap ?? 0);
  const flow = layout?.kind !== undefined && layout.kind !== "absolute";
  const row = layout?.direction === "row";
  const columns = Math.max(
    1,
    Math.floor((after.width - 2 * padding + gap) / ((children[0]?.width ?? 1) + gap)),
  );
  let cursor = padding;
  const total =
    children.reduce((sum, child) => sum + (row ? child.width : child.height), 0) +
    gap * Math.max(0, children.length - 1);
  const available = (row ? after.width : after.height) - padding * 2;
  if (layout?.justify === "center") cursor += Math.max(0, (available - total) / 2);
  if (layout?.justify === "end") cursor += Math.max(0, available - total);
  const resolvedGap =
    layout?.justify === "space-between" && children.length > 1
      ? Math.max(gap, (available - total + gap * (children.length - 1)) / (children.length - 1))
      : gap;
  children.forEach((child, index) => {
    let next = { ...child };
    if (flow && child.layoutSizing?.position !== "absolute") {
      if (layout.kind === "grid") {
        next.x = padding + (index % columns) * (child.width + gap);
        next.y = padding + Math.floor(index / columns) * (child.height + gap);
      } else {
        next.x = row ? cursor : padding;
        next.y = row ? padding : cursor;
        const cross = (row ? after.height : after.width) - padding * 2;
        const size = row ? child.height : child.width;
        const offset =
          layout.align === "center"
            ? (cross - size) / 2
            : layout.align === "end"
              ? cross - size
              : 0;
        if (row) next.y += Math.max(0, offset);
        else next.x += Math.max(0, offset);
        if (layout.align === "stretch") {
          if (row) next.height = Math.max(1, cross);
          else next.width = Math.max(1, cross);
        }
        cursor += (row ? next.width : next.height) + resolvedGap;
      }
    } else {
      const dw = after.width - before.width;
      const dh = after.height - before.height;
      const horizontal = child.constraints?.horizontal;
      const vertical = child.constraints?.vertical;
      if (horizontal === "right") next.x += dw;
      if (horizontal === "center") next.x += dw / 2;
      if (horizontal === "left-right") next.width = Math.max(1, child.width + dw);
      if (horizontal === "scale" && before.width > 0) {
        next.x *= after.width / before.width;
        next.width *= after.width / before.width;
      }
      if (vertical === "bottom") next.y += dh;
      if (vertical === "center") next.y += dh / 2;
      if (vertical === "top-bottom") next.height = Math.max(1, child.height + dh);
      if (vertical === "scale" && before.height > 0) {
        next.y *= after.height / before.height;
        next.height *= after.height / before.height;
      }
    }
    updates.set(child.nodeId, next);
  });
  let result = nodes.map((node) => updates.get(node.nodeId) ?? node);
  for (const child of children) {
    const next = updates.get(child.nodeId)!;
    if (next.width !== child.width || next.height !== child.height)
      result = [...layoutChildren(result, child, next)];
  }
  return result;
}

export function updateDesignNode(
  document: DesignDocument,
  nodeId: string,
  update: Partial<DesignNode>,
): DesignDocument {
  return updateDesignNodes(document, new Map([[nodeId, update]]));
}

export function updateDesignNodes(
  document: DesignDocument,
  updates: ReadonlyMap<string, Partial<DesignNode>>,
): DesignDocument {
  const originals = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const changes = new Map<string, Partial<DesignNode>>();
  const numeric = [
    "x",
    "y",
    "width",
    "height",
    "rotation",
    "opacity",
    "fontSize",
    "fontWeight",
  ] as const;
  for (const [id, rawUpdate] of updates) {
    const original = originals.get(id);
    if (!original) continue;
    const update = constrainDesignDimensions(original, rawUpdate);
    if (
      numeric.some(
        (field) => typeof update[field] === "number" && !Number.isFinite(update[field]),
      ) ||
      (["minWidth", "minHeight", "maxWidth", "maxHeight"] as const).some(
        (field) =>
          update.layoutSizing?.[field] !== undefined &&
          !Number.isFinite(update.layoutSizing[field]),
      ) ||
      update.effects?.some(
        (effect) =>
          ![effect.x, effect.y, effect.blur, effect.spread].every(Number.isFinite) ||
          effect.blur < 0,
      )
    )
      return document;
    const normalized = {
      ...update,
      ...("width" in update ? { width: Math.max(0.000001, update.width ?? original.width) } : {}),
      ...("height" in update
        ? { height: Math.max(0.000001, update.height ?? original.height) }
        : {}),
      ...("opacity" in update
        ? { opacity: Math.max(0, Math.min(1, update.opacity ?? original.opacity)) }
        : {}),
    };
    const fields = Object.entries(normalized).filter(
      ([key, value]) =>
        (original.instanceOfNodeId && original.overrides?.[key] !== true) ||
        (value !== original[key as keyof DesignNode] &&
          JSON.stringify(value) !== JSON.stringify(original[key as keyof DesignNode])),
    );
    if (fields.length) changes.set(id, Object.fromEntries(fields));
  }
  if (!changes.size) return document;
  let nodes = document.nodes.map((node) => {
    const update = changes.get(node.nodeId);
    return update
      ? {
          ...node,
          ...update,
          overrides: {
            ...node.overrides,
            ...Object.fromEntries(Object.keys(update).map((field) => [field, true])),
          },
        }
      : node;
  });
  for (const next of nodes) {
    const original = originals.get(next.nodeId)!;
    if (
      next.width !== original.width ||
      next.height !== original.height ||
      changes.get(next.nodeId)?.layoutModel !== undefined
    )
      nodes = [...layoutChildren(nodes, original, next)];
  }
  nodes = nodes.map((node) =>
    changes.has(node.nodeId) ? { ...node, ...changes.get(node.nodeId) } : node,
  );
  nodes = [...reflowDesignLayout(inheritDesignNodeUpdates(nodes, changes))];
  return recordOperations(
    { ...document, nodes },
    nodes.flatMap((node) => {
      const original = originals.get(node.nodeId)!;
      const fields = [
        ...new Set([
          ...Object.keys(changes.get(node.nodeId) ?? {}),
          ...Object.keys(node).filter((key) => {
            const field = key as keyof DesignNode;
            return (
              key !== "overrides" &&
              node[field] !== original[field] &&
              JSON.stringify(node[field]) !== JSON.stringify(original[field])
            );
          }),
        ]),
      ];
      return fields.length ? [{ kind: "update-node" as const, nodeId: node.nodeId, fields }] : [];
    }),
  );
}

function constrainDesignDimensions(node: DesignNode, update: Partial<DesignNode>) {
  if (!(update.aspectRatioLocked ?? node.aspectRatioLocked) || node.width <= 0 || node.height <= 0)
    return update;
  let next = update;
  const ratio = node.width / node.height;
  if (update.layoutSizing) {
    const sizing = { ...update.layoutSizing };
    for (const [width, height] of [
      ["minWidth", "minHeight"],
      ["maxWidth", "maxHeight"],
    ] as const) {
      const changedWidth = sizing[width] !== node.layoutSizing?.[width];
      const changedHeight = sizing[height] !== node.layoutSizing?.[height];
      if (changedWidth && !changedHeight)
        sizing[height] = sizing[width] === undefined ? undefined : sizing[width] / ratio;
      else if (changedHeight && !changedWidth)
        sizing[width] = sizing[height] === undefined ? undefined : sizing[height] * ratio;
    }
    next = { ...next, layoutSizing: sizing };
  }
  if (
    (update.width === undefined || update.height === undefined) &&
    (update.width !== undefined || update.height !== undefined || update.layoutSizing)
  ) {
    const sizing = next.layoutSizing ?? node.layoutSizing;
    const minimum = Math.max(
      Math.max(0.000001, sizing?.minWidth ?? 0) / node.width,
      Math.max(0.000001, sizing?.minHeight ?? 0) / node.height,
    );
    const maximum = Math.min(
      (sizing?.maxWidth ?? Infinity) / node.width,
      (sizing?.maxHeight ?? Infinity) / node.height,
    );
    const requested =
      update.width !== undefined
        ? update.width / node.width
        : update.height !== undefined
          ? update.height / node.height
          : 1;
    const factor = Math.max(minimum, Math.min(maximum, requested));
    next = { ...next, width: node.width * factor, height: node.height * factor };
  }
  return next;
}

function inheritDesignNodeUpdates(
  input: readonly DesignNode[],
  changes: ReadonlyMap<string, Partial<DesignNode>>,
): readonly DesignNode[] {
  const nodes = new Map(input.map((node) => [node.nodeId, node]));
  const instances = new Map<string, string[]>();
  for (const node of input) {
    if (!node.instanceOfNodeId) continue;
    const ids = instances.get(node.instanceOfNodeId) ?? [];
    ids.push(node.nodeId);
    instances.set(node.instanceOfNodeId, ids);
  }
  const affected = new Set(changes.keys());
  const discovered = [...affected];
  for (let index = 0; index < discovered.length; index++)
    for (const id of instances.get(discovered[index]!) ?? [])
      if (!affected.has(id)) {
        affected.add(id);
        discovered.push(id);
      }
  const pending = new Map(changes);
  const queue = discovered.filter((id) => !affected.has(nodes.get(id)?.instanceOfNodeId ?? ""));
  const visited = new Set<string>();
  for (let index = 0; index < queue.length; index++) {
    const sourceId = queue[index]!;
    if (visited.has(sourceId)) continue;
    visited.add(sourceId);
    const update = pending.get(sourceId) ?? {};
    for (const id of instances.get(sourceId) ?? []) {
      const node = nodes.get(id)!;
      const fields = Object.fromEntries(
        Object.entries(update).filter(
          ([key]) =>
            ![
              "nodeId",
              "name",
              "childIds",
              "parentId",
              "overrides",
              "instanceScale",
              "instanceOfNodeId",
              "componentId",
            ].includes(key) &&
            !(node.kind === "instance" && (key === "x" || key === "y")) &&
            !Object.hasOwn(changes.get(id) ?? {}, key) &&
            node.overrides?.[key] !== true,
        ),
      );
      const inherited = scaleDesignMetrics(fields, node.instanceScale ?? 1);
      nodes.set(id, { ...node, ...inherited });
      pending.set(id, { ...inherited, ...changes.get(id) });
      queue.push(id);
    }
  }
  return input.map((node) => nodes.get(node.nodeId)!);
}

export function commitDesignNodeTransforms(
  document: DesignDocument,
  preview: DesignDocument,
): DesignDocument {
  const originals = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const changes = new Map(
    preview.nodes.flatMap((node) => {
      const original = originals.get(node.nodeId);
      if (!original || original === node) return [];
      const fields = Object.fromEntries(
        Object.entries(node).filter(([key, value]) => value !== original[key as keyof DesignNode]),
      );
      return Object.keys(fields).length ? [[node.nodeId, fields] as const] : [];
    }),
  );
  if (!changes.size) return document;
  const nodes = inheritDesignNodeUpdates(preview.nodes, changes);
  const operations = nodes.flatMap((node) => {
    const original = originals.get(node.nodeId);
    if (!original || original === node) return [];
    const fields = Object.keys(node).filter(
      (key) => node[key as keyof DesignNode] !== original[key as keyof DesignNode],
    );
    return fields.length ? [{ kind: "update-node" as const, nodeId: node.nodeId, fields }] : [];
  });
  return recordOperations({ ...document, nodes }, operations);
}

export function restoreDesignContent(
  document: DesignDocument,
  previous: DesignDocument,
): DesignDocument {
  return recordOperation(
    {
      ...document,
      pages: previous.pages,
      nodes: previous.nodes,
      assets: previous.assets,
      activePageId: previous.activePageId,
      guides: previous.guides,
      title: previous.title,
      provenance: previous.provenance,
      comments: previous.comments,
    },
    { kind: "update-node", nodeId: null, fields: ["history"] },
  );
}

function nextNodeId(document: DesignDocument, prefix = "text"): string {
  const existing = new Set(document.nodes.map(({ nodeId }) => nodeId));
  let index = document.nodes.length + 1;
  while (existing.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

export function addFrameNode(document: DesignDocument): DesignDocument {
  const page = document.pages.find(({ pageId }) => pageId === document.activePageId);
  if (!page) return document;
  const nodeId = nextNodeId(document, "frame");
  const frame: DesignNode = {
    nodeId,
    kind: "frame",
    clipContent: true,
    name: `Frame ${document.nodes.filter((node) => node.kind === "frame").length + 1}`,
    parentId: null,
    childIds: [],
    x: 120 + page.nodeIds.length * 32,
    y: 96 + page.nodeIds.length * 32,
    width: 640,
    height: 420,
    fill: "#ffffff",
    border: "#d7dce5",
    text: null,
    fontSize: null,
    fontWeight: null,
    opacity: 1,
    assetId: null,
    provenance: null,
    layoutModel: { kind: "absolute", resolvedWidth: 640, resolvedHeight: 420 },
    paint: { background: "#ffffff", borderColor: "#d7dce5", borderWidth: 1, radius: 8 },
    interactions: [],
  };
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((candidate) =>
        candidate.pageId === page.pageId
          ? { ...candidate, nodeIds: [...candidate.nodeIds, nodeId] }
          : candidate,
      ),
      nodes: [...document.nodes, frame],
    },
    { kind: "add-node", nodeId },
  );
}

export function addTextNode(document: DesignDocument, parentId?: string | null): DesignDocument {
  const page = document.pages.find(({ pageId }) => pageId === document.activePageId);
  if (!page) return document;
  const frame =
    parentId === undefined
      ? nodeForPage(document).find((node) =>
          ["frame", "component", "instance", "group"].includes(node.kind),
        )
      : parentId === null
        ? undefined
        : document.nodes.find(
            (node) =>
              node.nodeId === parentId &&
              ["frame", "component", "instance", "group"].includes(node.kind),
          );
  if (parentId && (!frame || isDesignNodeLocked(document, frame.nodeId))) return document;
  const nodeId = nextNodeId(document, "text");
  const node: DesignNode = {
    nodeId,
    kind: "text",
    name: "Text layer",
    parentId: frame?.nodeId ?? null,
    childIds: [],
    x: 56,
    y: (frame?.childIds.length ?? 0) * 56 + 54,
    width: 360,
    height: 40,
    fill: "#111827",
    border: null,
    text: "New text",
    fontSize: 24,
    fontWeight: 500,
    opacity: 1,
    assetId: null,
    provenance: null,
    layoutModel: { kind: "absolute", resolvedWidth: 360, resolvedHeight: 40 },
    typography: { size: 24, weight: 500, color: "#111827" },
    interactions: [],
  };
  return recordOperation(
    {
      ...document,
      pages: frame
        ? document.pages
        : document.pages.map((candidate) =>
            candidate.pageId === page.pageId
              ? { ...candidate, nodeIds: [...candidate.nodeIds, nodeId] }
              : candidate,
          ),
      nodes: document.nodes
        .map((candidate) =>
          candidate.nodeId === frame?.nodeId
            ? { ...candidate, childIds: [...candidate.childIds, nodeId] }
            : candidate,
        )
        .concat(node),
    },
    { kind: "add-node", nodeId },
  );
}

export function addShapeNode(
  document: DesignDocument,
  kind: "vector" | "frame" = "vector",
): DesignDocument {
  const page = document.pages.find(({ pageId }) => pageId === document.activePageId);
  if (!page) return document;
  const nodeId = nextNodeId(document, kind === "vector" ? "shape" : "frame");
  const node: DesignNode = {
    nodeId,
    kind,
    name: kind === "vector" ? "Rectangle" : "Frame",
    parentId: null,
    childIds: [],
    x: 140 + page.nodeIds.length * 24,
    y: 110 + page.nodeIds.length * 24,
    width: 240,
    height: 160,
    fill: "#e2e8f0",
    border: "#64748b",
    text: null,
    fontSize: null,
    fontWeight: null,
    opacity: 1,
    assetId: null,
    provenance: null,
    rotation: 0,
    visible: true,
    locked: false,
    layoutModel: { kind: "absolute", resolvedWidth: 240, resolvedHeight: 160 },
    paint: { background: "#e2e8f0", borderColor: "#64748b", borderWidth: 1, radius: 8 },
    interactions: [],
  };
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((candidate) =>
        candidate.pageId === page.pageId
          ? { ...candidate, nodeIds: [...candidate.nodeIds, nodeId] }
          : candidate,
      ),
      nodes: [...document.nodes, node],
    },
    { kind: "add-node", nodeId },
  );
}

export function deleteDesignNodes(
  document: DesignDocument,
  nodeIds: ReadonlyArray<string>,
): DesignDocument {
  const roots = selectionRoots(document, nodeIds).filter(
    (node) => !isDesignNodeLocked(document, node.nodeId),
  );
  if (!roots.length) return document;
  const removed = new Set(
    roots.flatMap((node) => [
      node.nodeId,
      ...descendants(document, node.nodeId).map((child) => child.nodeId),
    ]),
  );
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((page) => ({
        ...page,
        nodeIds: page.nodeIds.filter((id) => !removed.has(id)),
      })),
      nodes: document.nodes
        .filter((node) => !removed.has(node.nodeId))
        .map((node) => ({ ...node, childIds: node.childIds.filter((id) => !removed.has(id)) })),
    },
    { kind: "update-node", nodeId: null, fields: ["delete", ...removed] },
  );
}

export function duplicateDesignNodes(
  document: DesignDocument,
  nodeIds: ReadonlyArray<string>,
): DesignDocument {
  const roots = selectionRoots(document, nodeIds);
  if (!roots.length) return document;
  const originals = roots.flatMap((node) => [node, ...descendants(document, node.nodeId)]);
  const ids = new Map(
    originals.map((node, index) => [
      node.nodeId,
      `${node.nodeId}-copy-${document.revision}-${document.nodes.length + index + 1}`,
    ]),
  );
  const rootIds = new Set(roots.map((node) => node.nodeId));
  const copies = originals.map((node) => ({
    ...node,
    nodeId: ids.get(node.nodeId)!,
    ...(node.componentId && ids.has(node.componentId)
      ? { componentId: ids.get(node.componentId)! }
      : {}),
    name: `${node.name} copy`,
    parentId: node.parentId === null ? null : (ids.get(node.parentId) ?? node.parentId),
    childIds: node.childIds.flatMap((id) => ids.get(id) ?? []),
    x: node.x + (rootIds.has(node.nodeId) ? 24 : 0),
    y: node.y + (rootIds.has(node.nodeId) ? 24 : 0),
  }));
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((page) => ({
        ...page,
        nodeIds: page.nodeIds.flatMap((id) => (rootIds.has(id) ? [id, ids.get(id)!] : [id])),
      })),
      nodes: [
        ...document.nodes.map((node) => ({
          ...node,
          childIds: node.childIds.flatMap((id) => (rootIds.has(id) ? [id, ids.get(id)!] : [id])),
        })),
        ...copies,
      ],
    },
    { kind: "add-node", nodeId: copies[0]!.nodeId },
  );
}

export function renameDesignNode(
  document: DesignDocument,
  nodeId: string,
  name: string,
): DesignDocument {
  return updateDesignNode(document, nodeId, { name: name.trim() || "Untitled layer" });
}

export function reorderDesignNode(
  document: DesignDocument,
  nodeId: string,
  direction: "up" | "down",
): DesignDocument {
  const node = document.nodes.find((candidate) => candidate.nodeId === nodeId);
  if (!node || isDesignNodeLocked(document, nodeId)) return document;
  const page = document.pages.find((candidate) => candidate.nodeIds.includes(nodeId));
  const parent = document.nodes.find((candidate) => candidate.nodeId === node.parentId);
  const siblings = parent?.childIds ?? page?.nodeIds;
  if (!siblings) return document;
  const index = siblings.indexOf(nodeId);
  const nextIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= siblings.length) return document;
  const ids = [...siblings];
  [ids[index], ids[nextIndex]] = [ids[nextIndex]!, ids[index]!];
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((candidate) =>
        candidate === page ? { ...candidate, nodeIds: ids } : candidate,
      ),
      nodes: document.nodes.map((candidate) =>
        candidate === parent ? { ...candidate, childIds: ids } : candidate,
      ),
    },
    { kind: "update-node", nodeId, fields: ["zIndex"] },
  );
}

export function addImageNode(
  document: DesignDocument,
  assetId: string,
  parentId?: string | null,
  placement: {
    readonly x?: number;
    readonly y?: number;
    readonly width?: number;
    readonly height?: number;
    readonly name?: string;
  } = {},
): DesignDocument {
  const page = document.pages.find(({ pageId }) => pageId === document.activePageId);
  if (!page) return document;
  const frame =
    parentId === undefined
      ? nodeForPage(document).find((node) =>
          ["frame", "component", "instance", "group"].includes(node.kind),
        )
      : parentId === null
        ? undefined
        : document.nodes.find(
            (node) =>
              node.nodeId === parentId &&
              ["frame", "component", "instance", "group"].includes(node.kind),
          );
  if (parentId && (!frame || isDesignNodeLocked(document, frame.nodeId))) return document;
  const nodeId = nextNodeId(document, "image");
  const asset = document.assets.find((candidate) => candidate.assetId === assetId);
  const width = Math.max(1, placement.width ?? asset?.width ?? 240);
  const height = Math.max(1, placement.height ?? asset?.height ?? 160);
  const node: DesignNode = {
    nodeId,
    kind: "image",
    name: placement.name ?? asset?.name ?? "Image layer",
    parentId: frame?.nodeId ?? null,
    childIds: [],
    x: placement.x ?? 56,
    y: placement.y ?? (frame?.childIds.length ?? 0) * 56 + 54,
    width,
    height,
    fill: "transparent",
    border: null,
    text: null,
    fontSize: null,
    fontWeight: null,
    opacity: 1,
    assetId,
    provenance: null,
    layoutModel: { kind: "absolute", resolvedWidth: width, resolvedHeight: height },
    paint: { background: "transparent", borderWidth: 0, radius: 0 },
    image: { mode: "fill" },
    interactions: [],
  };
  return recordOperation(
    {
      ...document,
      pages: frame
        ? document.pages
        : document.pages.map((candidate) =>
            candidate.pageId === page.pageId
              ? { ...candidate, nodeIds: [...candidate.nodeIds, nodeId] }
              : candidate,
          ),
      nodes: document.nodes
        .map((candidate) =>
          candidate.nodeId === frame?.nodeId
            ? { ...candidate, childIds: [...candidate.childIds, nodeId] }
            : candidate,
        )
        .concat(node),
    },
    { kind: "add-node", nodeId },
  );
}

export function addComponentNode(document: DesignDocument): DesignDocument {
  const page = document.pages.find(({ pageId }) => pageId === document.activePageId);
  if (!page) return document;
  const nodeId = nextNodeId(document, "component");
  const component: DesignNode = {
    nodeId,
    kind: "component",
    clipContent: true,
    name: "Component",
    parentId: null,
    childIds: [],
    x: 120 + page.nodeIds.length * 32,
    y: 96 + page.nodeIds.length * 32,
    width: 240,
    height: 120,
    fill: "#f8fafc",
    border: "#94a3b8",
    text: null,
    fontSize: null,
    fontWeight: null,
    opacity: 1,
    assetId: null,
    provenance: null,
    componentId: nodeId,
    layoutModel: { kind: "auto-layout", resolvedWidth: 240, resolvedHeight: 120 },
    paint: { background: "#f8fafc", borderColor: "#94a3b8", borderWidth: 1, radius: 8 },
    interactions: [],
  };
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((candidate) =>
        candidate.pageId === page.pageId
          ? { ...candidate, nodeIds: [...candidate.nodeIds, nodeId] }
          : candidate,
      ),
      nodes: [...document.nodes, component],
    },
    { kind: "add-node", nodeId },
  );
}

function referencedComponent(
  nodes: ReadonlyMap<string, DesignNode>,
  node: DesignNode,
): string | null {
  const visited = new Set<string>();
  while (!visited.has(node.nodeId)) {
    if (node.kind === "component") return node.nodeId;
    visited.add(node.nodeId);
    const source = node.instanceOfNodeId ? nodes.get(node.instanceOfNodeId) : undefined;
    if (!source) return null;
    node = source;
  }
  return null;
}

function componentContains(
  nodes: ReadonlyMap<string, DesignNode>,
  componentId: string,
  target: string,
): boolean {
  const pending = [componentId];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === target) return true;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = nodes.get(id);
    if (!node) continue;
    pending.push(...node.childIds);
    if (node.kind === "instance") {
      const source = referencedComponent(nodes, node);
      if (source) pending.push(source);
    }
  }
  return false;
}

export function addInstanceNode(
  document: DesignDocument,
  componentNodeId?: string,
  parentId: string | null = null,
): DesignDocument {
  const component = document.nodes.find(
    (node) =>
      node.kind === "component" &&
      (componentNodeId === undefined || node.nodeId === componentNodeId),
  );
  const page = document.pages.find((item) => item.pageId === document.activePageId);
  if (!component || !page) return document;
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const ancestry = parentId ? nodeAncestry(nodes, parentId) : [];
  const parent = parentId ? nodes.get(parentId) : undefined;
  if (
    parentId &&
    (!parent ||
      !["frame", "group", "component"].includes(parent.kind) ||
      isDesignNodeLocked(document, parentId) ||
      !page.nodeIds.includes(ancestry.at(-1)!.nodeId))
  )
    return document;
  if (
    ancestry.some(
      (node) =>
        node.kind === "instance" ||
        (node.kind === "component" && componentContains(nodes, component.nodeId, node.nodeId)),
    )
  )
    return document;
  const originals = [component, ...descendants(document, component.nodeId)];
  const used = new Set(nodes.keys());
  const rootId = nextNodeId(document, "instance");
  const ids = new Map(
    originals.map((node, index) => {
      let id = index === 0 ? rootId : `${rootId}-${index}`;
      while (used.has(id)) id += "-copy";
      used.add(id);
      return [node.nodeId, id];
    }),
  );
  const center = designLocalToWorld(nodes, component.nodeId, {
    x: component.width / 2,
    y: component.height / 2,
  });
  const worldPose = designMatrixPose(designWorldMatrix(nodes, component.nodeId), component);
  const copies = originals.map((node, index): DesignNode => ({
    ...node,
    nodeId: ids.get(node.nodeId)!,
    parentId: index === 0 ? parentId : ids.get(node.parentId!)!,
    childIds: node.childIds.flatMap((id) => ids.get(id) ?? []),
    kind: index === 0 ? "instance" : node.kind,
    name: index === 0 ? `${component.name} instance` : node.name,
    instanceOfNodeId: node.nodeId,
    instanceScale: 1,
    componentId: component.nodeId,
    overrides: {},
    ...(index === 0
      ? {
          locked: false,
          ...(ancestry.length ? {} : worldPose),
          x: parent ? 24 : center.x - node.width / 2 + 24,
          y: parent ? 24 : center.y - node.height / 2 + 24,
        }
      : {}),
  }));
  return recordOperation(
    {
      ...document,
      pages: parent
        ? document.pages
        : document.pages.map((item) =>
            item === page ? { ...item, nodeIds: [...item.nodeIds, rootId] } : item,
          ),
      nodes: [
        ...document.nodes.map((node) =>
          node.nodeId === parentId ? { ...node, childIds: [...node.childIds, rootId] } : node,
        ),
        ...copies,
      ],
    },
    { kind: "add-node", nodeId: rootId },
  );
}

export function detachDesignInstance(document: DesignDocument, nodeId: string): DesignDocument {
  const root = document.nodes.find((node) => node.nodeId === nodeId && node.kind === "instance");
  if (!root || isDesignNodeLocked(document, nodeId)) return document;
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const detachedIds = new Set([
    nodeId,
    ...descendants(document, nodeId).map((node) => node.nodeId),
  ]);
  const detached = document.nodes.map((node) => {
    if (!detachedIds.has(node.nodeId)) return node;
    const source = node.instanceOfNodeId ? nodes.get(node.instanceOfNodeId) : undefined;
    const nestedSource =
      node.nodeId !== nodeId && source?.instanceOfNodeId
        ? nodes.get(source.instanceOfNodeId)
        : undefined;
    return {
      ...node,
      kind:
        node.nodeId === nodeId || (node.kind === "instance" && !nestedSource)
          ? ("frame" as const)
          : node.kind,
      instanceOfNodeId: nestedSource?.nodeId,
      instanceScale: nestedSource
        ? (node.instanceScale ?? 1) * (source?.instanceScale ?? 1)
        : undefined,
      componentId: nestedSource ? source?.componentId : undefined,
      overrides: nestedSource ? { ...source?.overrides, ...node.overrides } : {},
    };
  });
  return recordOperation(
    { ...document, nodes: detached },
    {
      kind: "update-node",
      nodeId,
      fields: ["kind", "instanceOfNodeId", "componentId", "overrides"],
    },
  );
}

export function reparentDesignNode(
  document: DesignDocument,
  nodeId: string,
  parentId: string | null,
  beforeId?: string,
): DesignDocument {
  const node = document.nodes.find((candidate) => candidate.nodeId === nodeId);
  const parent = document.nodes.find((candidate) => candidate.nodeId === parentId);
  if (!node || isDesignNodeLocked(document, nodeId) || nodeId === parentId) return document;
  if (
    parentId !== null &&
    (!parent ||
      !["frame", "group", "component", "instance"].includes(parent.kind) ||
      isDesignNodeLocked(document, parentId) ||
      descendants(document, nodeId).some((child) => child.nodeId === parentId))
  )
    return document;
  const nodesById = new Map(document.nodes.map((item) => [item.nodeId, item]));
  const world = designWorldMatrix(nodesById, node.nodeId);
  const local = parent
    ? multiplyDesignMatrices(invertDesignMatrix(designWorldMatrix(nodesById, parent.nodeId)), world)
    : world;
  const pose = designMatrixPose(local, node);
  const insert = (ids: readonly string[]) => {
    const filtered = ids.filter((id) => id !== nodeId);
    const index = beforeId === undefined ? filtered.length : filtered.indexOf(beforeId);
    filtered.splice(index < 0 ? filtered.length : index, 0, nodeId);
    return filtered;
  };
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((page) => ({
        ...page,
        nodeIds:
          parentId === null && page.pageId === document.activePageId
            ? insert(page.nodeIds)
            : page.nodeIds.filter((id) => id !== nodeId),
      })),
      nodes: document.nodes.map((candidate) => ({
        ...candidate,
        ...(candidate.nodeId === nodeId
          ? {
              parentId,
              ...pose,
            }
          : {}),
        childIds:
          candidate.nodeId === parentId
            ? insert(candidate.childIds)
            : candidate.childIds.filter((id) => id !== nodeId),
      })),
    },
    { kind: "update-node", nodeId, fields: ["parentId", "childIds", ...Object.keys(pose)] },
  );
}

export function groupDesignNodes(
  document: DesignDocument,
  nodeIds: readonly string[],
): DesignDocument {
  const roots = selectionRoots(document, nodeIds).filter(
    (node) => !isDesignNodeLocked(document, node.nodeId),
  );
  if (!roots.length || roots.some((node) => node.parentId !== roots[0]!.parentId)) return document;
  const corners = roots.flatMap((node) => {
    const matrix = designNodeMatrix(node);
    return [
      { x: 0, y: 0 },
      { x: node.width, y: 0 },
      { x: 0, y: node.height },
      { x: node.width, y: node.height },
    ].map((point) => transformDesignPoint(matrix, point));
  });
  const x = Math.min(...corners.map((point) => point.x));
  const y = Math.min(...corners.map((point) => point.y));
  const nodeId = nextNodeId(document, "group");
  const group: DesignNode = {
    ...roots[0]!,
    nodeId,
    kind: "group",
    name: "Group",
    clipContent: false,
    x,
    y,
    width: Math.max(...corners.map((point) => point.x)) - x,
    height: Math.max(...corners.map((point) => point.y)) - y,
    childIds: roots.map((node) => node.nodeId),
    fill: null,
    border: null,
    text: null,
    paint: {},
    opacity: 1,
    layoutModel: { kind: "absolute" },
    overrides: {},
    rotation: 0,
    flipX: false,
    flipY: false,
    aspectRatioLocked: false,
    effects: [],
    componentId: undefined,
    instanceOfNodeId: undefined,
    assetId: null,
    vector: undefined,
    interactions: [],
  };
  const grouped = new Set(group.childIds);
  const replace = (ids: readonly string[]) => {
    const result = ids.filter((id) => !grouped.has(id));
    const index = ids.findIndex((id) => grouped.has(id));
    result.splice(Math.max(0, index), 0, nodeId);
    return result;
  };
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((page) =>
        group.parentId === null && page.pageId === document.activePageId
          ? { ...page, nodeIds: replace(page.nodeIds) }
          : page,
      ),
      nodes: [
        ...document.nodes.map((node) =>
          grouped.has(node.nodeId)
            ? { ...node, parentId: nodeId, x: node.x - x, y: node.y - y }
            : node.nodeId === group.parentId
              ? { ...node, childIds: replace(node.childIds) }
              : node,
        ),
        group,
      ],
    },
    { kind: "add-node", nodeId },
  );
}

export function ungroupDesignNode(document: DesignDocument, nodeId: string): DesignDocument {
  const group = document.nodes.find((node) => node.nodeId === nodeId && node.kind === "group");
  if (!group || isDesignNodeLocked(document, nodeId)) return document;
  const childGeometry = (child: DesignNode) => {
    return {
      parentId: group.parentId,
      ...designMatrixPose(
        multiplyDesignMatrices(designNodeMatrix(group), designNodeMatrix(child)),
        child,
      ),
      opacity: child.opacity * group.opacity,
    };
  };
  const replace = (ids: readonly string[]) =>
    ids.flatMap((id) => (id === nodeId ? group.childIds : [id]));
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((page) => ({ ...page, nodeIds: replace(page.nodeIds) })),
      nodes: document.nodes
        .filter((node) => node.nodeId !== nodeId)
        .map((node) => ({
          ...node,
          ...(group.childIds.includes(node.nodeId) ? childGeometry(node) : {}),
          childIds: replace(node.childIds),
        })),
    },
    { kind: "update-node", nodeId: null, fields: ["ungroup"] },
  );
}

export function addAssetMeta(document: DesignDocument, asset: DesignAssetMeta): DesignDocument {
  return recordOperation(
    {
      ...document,
      assets: document.assets.some((item) => item.assetId === asset.assetId)
        ? document.assets.map((item) => (item.assetId === asset.assetId ? asset : item))
        : [...document.assets, asset],
    },
    { kind: "add-asset", nodeId: null, assetId: asset.assetId },
  );
}

export function designEffectRegion(
  document: DesignDocument,
  nodeId: string,
  nodes: ReadonlyMap<string, DesignNode>,
) {
  const root = nodes.get(nodeId)!;
  let left = 0,
    top = 0,
    right = root.width,
    bottom = root.height;
  const stack = [root];
  const seen = new Set<string>();
  while (stack.length) {
    const node = stack.pop()!;
    if (seen.has(node.nodeId) || node.visible === false) continue;
    seen.add(node.nodeId);
    const box = designWorldBounds(document, node.nodeId, nodes);
    if (!box) continue;
    const pad = node.nodeId === nodeId ? 0 : designEffectOutset(node) * Math.SQRT2;
    for (const x of [box.x - pad, box.x + box.width + pad])
      for (const y of [box.y - pad, box.y + box.height + pad]) {
        const point = designWorldToLocal(document, nodeId, { x, y }, nodes);
        left = Math.min(left, point.x);
        top = Math.min(top, point.y);
        right = Math.max(right, point.x);
        bottom = Math.max(bottom, point.y);
      }
    if (!node.clipContent)
      for (const id of node.childIds) {
        const child = nodes.get(id);
        if (child) stack.push(child);
      }
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function addDesignPage(document: DesignDocument): DesignDocument {
  let index = document.pages.length + 1;
  while (document.pages.some((page) => page.pageId === `page-${index}`)) index += 1;
  const pageId = `page-${index}`;
  let frameIndex = index;
  while (document.nodes.some((node) => node.nodeId === `frame-${frameIndex}`)) frameIndex += 1;
  const frameId = `frame-${frameIndex}`;
  const frame: DesignNode = {
    nodeId: frameId,
    kind: "frame",
    name: `Frame ${index}`,
    parentId: null,
    childIds: [],
    x: 120,
    y: 96,
    width: 640,
    height: 420,
    fill: "#ffffff",
    border: "#d7dce5",
    text: null,
    fontSize: null,
    fontWeight: null,
    opacity: 1,
    assetId: null,
    provenance: null,
    layoutModel: { kind: "absolute", resolvedWidth: 640, resolvedHeight: 420 },
    paint: { background: "#ffffff", borderColor: "#d7dce5", borderWidth: 1, radius: 8 },
    interactions: [],
  };
  return recordOperation(
    {
      ...document,
      pages: [...document.pages, { pageId, name: `Page ${index}`, nodeIds: [frameId] }],
      nodes: [...document.nodes, frame],
      activePageId: pageId,
    },
    { kind: "add-page", nodeId: frameId },
  );
}

export function setActiveDesignPage(document: DesignDocument, pageId: string): DesignDocument {
  return document.pages.some((page) => page.pageId === pageId)
    ? { ...document, activePageId: pageId, updatedAt: now() }
    : document;
}

export function nodeForPage(document: DesignDocument): ReadonlyArray<DesignNode> {
  const page = document.pages.find(({ pageId }) => pageId === document.activePageId);
  if (!page) return [];
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  return page.nodeIds.flatMap((id) => nodes.get(id) ?? []);
}

export function descendants(document: DesignDocument, nodeId: string): ReadonlyArray<DesignNode> {
  return descendantsFrom(document, nodeId, new Set([nodeId]));
}

function descendantsFrom(
  document: DesignDocument,
  nodeId: string,
  visited: Set<string>,
): ReadonlyArray<DesignNode> {
  const node = document.nodes.find((candidate) => candidate.nodeId === nodeId);
  if (!node) return [];
  return node.childIds.flatMap((childId) => {
    if (visited.has(childId)) return [];
    const child = document.nodes.find((candidate) => candidate.nodeId === childId);
    if (!child) return [];
    const nextVisited = new Set(visited);
    nextVisited.add(childId);
    return [child, ...descendantsFrom(document, childId, nextVisited)];
  });
}

function nodeAncestry(
  nodes: ReadonlyMap<string, DesignNode>,
  nodeId: string,
): readonly DesignNode[] {
  const chain: DesignNode[] = [];
  const visited = new Set<string>();
  let current = nodes.get(nodeId);
  while (current && !visited.has(current.nodeId)) {
    chain.push(current);
    visited.add(current.nodeId);
    current = current.parentId ? nodes.get(current.parentId) : undefined;
  }
  return chain;
}

function designLocalToWorld(
  nodes: ReadonlyMap<string, DesignNode>,
  nodeId: string,
  point: { x: number; y: number },
) {
  return transformDesignPoint(designWorldMatrix(nodes, nodeId), point);
}

export function designNodeWorldFrame(
  document: DesignDocument,
  nodeId: string,
  nodes: ReadonlyMap<string, DesignNode> = new Map(
    document.nodes.map((node) => [node.nodeId, node]),
  ),
) {
  const node = nodes.get(nodeId);
  if (!node) return null;
  const matrix = designWorldMatrix(nodes, nodeId);
  const center = transformDesignPoint(matrix, { x: node.width / 2, y: node.height / 2 });
  return {
    x: center.x - node.width / 2,
    y: center.y - node.height / 2,
    width: node.width,
    height: node.height,
    rotation: designMatrixPose(matrix, node).rotation ?? 0,
  };
}

export function designWorldBounds(
  document: DesignDocument,
  nodeId: string,
  nodes: ReadonlyMap<string, DesignNode> = new Map(
    document.nodes.map((node) => [node.nodeId, node]),
  ),
) {
  const node = nodes.get(nodeId);
  if (!node) return null;
  const stroke = node.vector ? Math.max(0, node.paint?.borderWidth ?? 2) / 2 : 0;
  const matrix = designWorldMatrix(nodes, nodeId);
  const corners = [
    { x: -stroke, y: -stroke },
    { x: node.width + stroke, y: -stroke },
    { x: -stroke, y: node.height + stroke },
    { x: node.width + stroke, y: node.height + stroke },
  ].map((point) => transformDesignPoint(matrix, point));
  const x = Math.min(...corners.map((point) => point.x)),
    y = Math.min(...corners.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(...corners.map((point) => point.x)) - x,
    height: Math.max(...corners.map((point) => point.y)) - y,
  };
}

export function designWorldToLocal(
  document: DesignDocument,
  nodeId: string,
  point: { x: number; y: number },
  nodes: ReadonlyMap<string, DesignNode> = new Map(
    document.nodes.map((node) => [node.nodeId, node]),
  ),
) {
  return transformDesignPoint(invertDesignMatrix(designWorldMatrix(nodes, nodeId)), point);
}

export function isDesignNodeVisible(
  document: DesignDocument,
  nodeId: string,
  nodes: ReadonlyMap<string, DesignNode> = new Map(
    document.nodes.map((node) => [node.nodeId, node]),
  ),
) {
  return nodeAncestry(nodes, nodeId).every((node) => node.visible !== false);
}

export function absoluteNodePosition(
  document: DesignDocument,
  node: Pick<DesignNode, "x" | "y" | "parentId">,
): { readonly x: number; readonly y: number } {
  let x = node.x;
  let y = node.y;
  let parentId = node.parentId;
  const visited = new Set<string>();
  while (parentId !== null) {
    if (visited.has(parentId)) break;
    visited.add(parentId);
    const parent = document.nodes.find((candidate) => candidate.nodeId === parentId);
    if (!parent) break;
    x += parent.x;
    y += parent.y;
    parentId = parent.parentId;
  }
  return { x, y };
}

export function renameDesignPage(
  document: DesignDocument,
  pageId: string,
  name: string,
): DesignDocument {
  const page = document.pages.find((item) => item.pageId === pageId);
  if (!page || !name.trim() || page.name === name.trim()) return document;
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((item) => (item === page ? { ...item, name: name.trim() } : item)),
    },
    { kind: "update-node", nodeId: null, fields: ["pages"] },
  );
}

export function deleteDesignPage(document: DesignDocument, pageId: string): DesignDocument {
  if (document.pages.length < 2) return document;
  const page = document.pages.find((item) => item.pageId === pageId);
  if (!page) return document;
  const removed = new Set(
    page.nodeIds.flatMap((id) => [id, ...descendants(document, id).map((node) => node.nodeId)]),
  );
  const pages = document.pages.filter((item) => item !== page);
  return recordOperation(
    {
      ...document,
      pages,
      nodes: document.nodes.filter((node) => !removed.has(node.nodeId)),
      activePageId: document.activePageId === pageId ? pages[0]!.pageId : document.activePageId,
    },
    { kind: "update-node", nodeId: null, fields: ["pages", "nodes"] },
  );
}

export function alignDesignNodes(
  document: DesignDocument,
  nodeIds: readonly string[],
  alignment: "left" | "center" | "right" | "top" | "middle" | "bottom",
): DesignDocument {
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const roots = selectionRoots(document, nodeIds).filter(
    (node) =>
      !isDesignNodeLocked(document, node.nodeId, nodes) &&
      !isDesignNodeInFlow(document, node.nodeId, nodes),
  );
  if (roots.length === 1) {
    const node = roots[0]!;
    const parent = document.nodes.find((candidate) => candidate.nodeId === node.parentId);
    if (!parent || isDesignNodeInFlow(document, node.nodeId)) return document;
    const radians = ((node.rotation ?? 0) * Math.PI) / 180;
    const width =
      Math.abs(node.width * Math.cos(radians)) + Math.abs(node.height * Math.sin(radians));
    const height =
      Math.abs(node.width * Math.sin(radians)) + Math.abs(node.height * Math.cos(radians));
    const x =
      alignment === "left"
        ? (width - node.width) / 2
        : alignment === "center"
          ? (parent.width - node.width) / 2
          : alignment === "right"
            ? parent.width - (width + node.width) / 2
            : node.x;
    const y =
      alignment === "top"
        ? (height - node.height) / 2
        : alignment === "middle"
          ? (parent.height - node.height) / 2
          : alignment === "bottom"
            ? parent.height - (height + node.height) / 2
            : node.y;
    return updateDesignNode(document, node.nodeId, { x, y });
  }
  if (roots.length === 0) return document;
  const boxes = roots.map((node) => designWorldBounds(document, node.nodeId, nodes)!);
  const left = Math.min(...boxes.map((box) => box.x)),
    right = Math.max(...boxes.map((box) => box.x + box.width));
  const top = Math.min(...boxes.map((box) => box.y)),
    bottom = Math.max(...boxes.map((box) => box.y + box.height));
  return translateDesignNodes(
    document,
    roots.map((node, index) => {
      const box = boxes[index]!;
      const dx =
        alignment === "left"
          ? left - box.x
          : alignment === "center"
            ? (left + right - box.width) / 2 - box.x
            : alignment === "right"
              ? right - box.width - box.x
              : 0;
      const dy =
        alignment === "top"
          ? top - box.y
          : alignment === "middle"
            ? (top + bottom - box.height) / 2 - box.y
            : alignment === "bottom"
              ? bottom - box.height - box.y
              : 0;
      return { node, dx, dy };
    }),
    nodes,
  );
}

function translateDesignNodes(
  document: DesignDocument,
  changes: readonly { node: DesignNode; dx: number; dy: number }[],
  nodes: ReadonlyMap<string, DesignNode>,
) {
  return updateDesignNodes(
    document,
    new Map(
      changes.map(({ node, dx, dy }) => {
        const frame = designNodeWorldFrame(document, node.nodeId, nodes)!;
        const world = { x: frame.x + frame.width / 2 + dx, y: frame.y + frame.height / 2 + dy };
        const local = node.parentId
          ? designWorldToLocal(document, node.parentId, world, nodes)
          : world;
        return [
          node.nodeId,
          {
            x: Math.round((local.x - node.width / 2) * 1e6) / 1e6,
            y: Math.round((local.y - node.height / 2) * 1e6) / 1e6,
          },
        ];
      }),
    ),
  );
}

export function distributeDesignNodes(
  document: DesignDocument,
  ids: readonly string[],
  axis: "horizontal" | "vertical",
) {
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const position = axis === "horizontal" ? "x" : "y",
    size = axis === "horizontal" ? "width" : "height";
  const roots = selectionRoots(document, ids)
    .filter(
      (node) =>
        !isDesignNodeLocked(document, node.nodeId, nodes) &&
        !isDesignNodeInFlow(document, node.nodeId, nodes),
    )
    .map((node) => ({ node, box: designWorldBounds(document, node.nodeId, nodes)! }))
    .sort((a, b) => a.box[position] - b.box[position]);
  if (roots.length < 3) return document;
  const first = roots[0]!.box,
    last = roots.at(-1)!.box;
  const gap =
    (last[position] +
      last[size] -
      first[position] -
      roots.reduce((sum, entry) => sum + entry.box[size], 0)) /
    (roots.length - 1);
  let cursor = first[position];
  return translateDesignNodes(
    document,
    roots.map(({ node, box }, index) => {
      const delta = index === 0 || index === roots.length - 1 ? 0 : cursor - box[position];
      cursor += box[size] + gap;
      return { node, dx: axis === "horizontal" ? delta : 0, dy: axis === "vertical" ? delta : 0 };
    }),
    nodes,
  );
}

export function addVectorPath(
  document: DesignDocument,
  points: readonly DesignVectorPoint[],
  closed = false,
): DesignDocument {
  if (
    points.length < 2 ||
    points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))
  )
    return document;
  const geometry = vectorGeometry(points);
  const next = addShapeNode(document);
  const node = next.nodes.at(-1)!;
  return updateDesignNode(next, node.nodeId, {
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    name: closed ? "Vector shape" : "Vector path",
    fill: closed ? "#e2e8f0" : null,
    paint: { background: closed ? "#e2e8f0" : "none", borderColor: "#64748b", borderWidth: 2 },
    vector: {
      path: vectorPath(geometry.points, closed),
      width: geometry.width,
      height: geometry.height,
      closed,
      points: geometry.points,
    },
  });
}

function translateSimpleVectorPath(path: string, dx: number, dy: number): string | null {
  const tokens = path.match(/[MLZ]|-?(?:\d+(?:\.\d*)?|\.\d+)/giu);
  if (!tokens) return null;
  const result: string[] = [];
  let command = "";
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;
    if (/^[MLZ]$/iu.test(token)) {
      command = token.toUpperCase();
      result.push(command);
      index += 1;
      continue;
    }
    if (command === "Z" || index + 1 >= tokens.length) return null;
    const x = Number(tokens[index]);
    const y = Number(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    result.push(String(x + dx), String(y + dy));
    index += 2;
  }
  return result.join(" ");
}

function simplePolygon(path: string, offsetX: number, offsetY: number) {
  const tokens = path.match(/[MLZ]|-?(?:\d+(?:\.\d*)?|\.\d+)/giu);
  if (!tokens) return null;
  const points: { x: number; y: number }[] = [];
  let command = "";
  for (let index = 0; index < tokens.length;) {
    const token = tokens[index]!;
    if (/^[MLZ]$/iu.test(token)) {
      command = token.toUpperCase();
      index += 1;
      continue;
    }
    if (command !== "M" && command !== "L") return null;
    const x = Number(tokens[index]);
    const y = Number(tokens[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push({ x: x + offsetX, y: y + offsetY });
    index += 2;
  }
  return points.length >= 3 ? points : null;
}

function clipConvexPolygon(
  subject: readonly { x: number; y: number }[],
  clip: readonly { x: number; y: number }[],
) {
  const orientation = clip.reduce((sum, point, index) => {
    const next = clip[(index + 1) % clip.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  const inside = (
    point: { x: number; y: number },
    edgeStart: { x: number; y: number },
    edgeEnd: { x: number; y: number },
  ) => {
    const cross =
      (edgeEnd.x - edgeStart.x) * (point.y - edgeStart.y) -
      (edgeEnd.y - edgeStart.y) * (point.x - edgeStart.x);
    return orientation >= 0 ? cross >= -1e-6 : cross <= 1e-6;
  };
  const intersection = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
    d: { x: number; y: number },
  ) => {
    const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
    if (Math.abs(denominator) < 1e-9) return b;
    const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denominator;
    return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
  };
  let output = [...subject];
  for (let index = 0; index < clip.length && output.length; index++) {
    const edgeStart = clip[index]!;
    const edgeEnd = clip[(index + 1) % clip.length]!;
    const input = output;
    output = [];
    let previous = input.at(-1)!;
    for (const current of input) {
      const currentInside = inside(current, edgeStart, edgeEnd);
      const previousInside = inside(previous, edgeStart, edgeEnd);
      if (currentInside !== previousInside)
        output.push(intersection(previous, current, edgeStart, edgeEnd));
      if (currentInside) output.push(current);
      previous = current;
    }
  }
  return output;
}

export function booleanDesignSelection(
  document: DesignDocument,
  nodeIds: ReadonlyArray<string>,
  operation: "union" | "flatten" | "subtract" | "intersect" | "exclude",
): DesignDocument {
  const roots = selectionRoots(document, nodeIds).filter(
    (node) => node.kind === "vector" && node.vector?.closed,
  );
  if (roots.length < 2 || roots.some((node) => !node.vector)) return document;
  const parentId = roots[0]!.parentId;
  if (roots.some((node) => node.parentId !== parentId)) return document;
  if (roots.some((node) => !/^[MLZ0-9\s,.-]+$/iu.test(node.vector!.path))) return document;
  const x = Math.min(...roots.map((node) => node.x));
  const y = Math.min(...roots.map((node) => node.y));
  const right = Math.max(...roots.map((node) => node.x + node.width));
  const bottom = Math.max(...roots.map((node) => node.y + node.height));
  const paths = roots
    .map((node) => translateSimpleVectorPath(node.vector!.path, node.x - x, node.y - y))
    .filter((path): path is string => path !== null);
  if (paths.length !== roots.length) return document;
  const [first, ...rest] = roots;
  if (!first) return document;
  const second = rest[0];
  const firstRight = first.x + first.width;
  const firstBottom = first.y + first.height;
  const secondRight = second ? second.x + second.width : firstRight;
  const secondBottom = second ? second.y + second.height : firstBottom;
  const overlap = second
    ? {
        x: Math.max(first.x, second.x),
        y: Math.max(first.y, second.y),
        right: Math.min(firstRight, secondRight),
        bottom: Math.min(firstBottom, secondBottom),
      }
    : { x: first.x, y: first.y, right: first.x, bottom: first.y };
  const hasOverlap = overlap.right > overlap.x && overlap.bottom > overlap.y;
  if (operation === "intersect" && !hasOverlap) return document;
  const rectanglePath = (
    left: number,
    top: number,
    width: number,
    height: number,
    reverse = false,
  ) => {
    const points = reverse
      ? [
          [left, top],
          [left, top + height],
          [left + width, top + height],
          [left + width, top],
        ]
      : [
          [left, top],
          [left + width, top],
          [left + width, top + height],
          [left, top + height],
        ];
    return `${points.map(([px, py], index) => `${index === 0 ? "M" : "L"} ${px} ${py}`).join(" ")} Z`;
  };
  let resultPath = paths.join(" ");
  let resultX = x;
  let resultY = y;
  let resultWidth = right - x;
  let resultHeight = bottom - y;
  let fillRule: "nonzero" | "evenodd" | undefined;
  if (second && operation === "intersect") {
    const firstPolygon = simplePolygon(first.vector!.path, first.x, first.y);
    const secondPolygon = simplePolygon(second.vector!.path, second.x, second.y);
    const clipped =
      firstPolygon && secondPolygon ? clipConvexPolygon(firstPolygon, secondPolygon) : [];
    if (clipped.length < 3) return document;
    resultX = Math.min(...clipped.map((point) => point.x));
    resultY = Math.min(...clipped.map((point) => point.y));
    const clippedRight = Math.max(...clipped.map((point) => point.x));
    const clippedBottom = Math.max(...clipped.map((point) => point.y));
    resultWidth = clippedRight - resultX;
    resultHeight = clippedBottom - resultY;
    resultPath = `${clipped.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x - resultX} ${point.y - resultY}`).join(" ")} Z`;
  } else if (second && operation === "subtract") {
    resultX = first.x;
    resultY = first.y;
    resultWidth = first.width;
    resultHeight = first.height;
    resultPath = rectanglePath(0, 0, first.width, first.height);
    if (hasOverlap)
      resultPath += ` ${rectanglePath(overlap.x - first.x, overlap.y - first.y, overlap.right - overlap.x, overlap.bottom - overlap.y, true)}`;
    fillRule = "evenodd";
  } else if (second && operation === "exclude") {
    resultPath = `${rectanglePath(first.x - x, first.y - y, first.width, first.height)} ${rectanglePath(second.x - x, second.y - y, second.width, second.height)}`;
    fillRule = "evenodd";
  }
  const removed = new Set(rest.map((node) => node.nodeId));
  const merged: DesignNode = {
    ...first,
    name:
      operation === "union"
        ? "Union"
        : operation === "flatten"
          ? "Flatten selection"
          : operation[0]!.toUpperCase() + operation.slice(1),
    x: resultX,
    y: resultY,
    width: resultWidth,
    height: resultHeight,
    vector: {
      ...first.vector!,
      path: resultPath,
      width: resultWidth,
      height: resultHeight,
      ...(fillRule ? { fillRule } : {}),
    },
  };
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((page) => ({
        ...page,
        nodeIds: page.nodeIds.filter((nodeId) => !removed.has(nodeId)),
      })),
      nodes: document.nodes
        .filter((node) => !removed.has(node.nodeId))
        .map((node) =>
          node.nodeId === first.nodeId
            ? merged
            : node.nodeId === parentId
              ? { ...node, childIds: node.childIds.filter((childId) => !removed.has(childId)) }
              : node,
        ),
    },
    { kind: "update-node", nodeId: first.nodeId, fields: [operation, ...removed] },
  );
}

export function addDesignComment(
  document: DesignDocument,
  point: { readonly x: number; readonly y: number },
  parentId: string | null = null,
): { document: DesignDocument; commentId: string } {
  const commentId = nextNodeId(document, "comment");
  const comment: DesignComment = {
    commentId,
    x: point.x,
    y: point.y,
    parentId,
    text: "New comment",
    resolved: false,
  };
  return {
    commentId,
    document: recordOperation(
      { ...document, comments: [...(document.comments ?? []), comment] },
      { kind: "update-node", nodeId: null, fields: ["add-comment", commentId] },
    ),
  };
}

export function updateDesignComment(
  document: DesignDocument,
  commentId: string,
  patch: Partial<Omit<DesignComment, "commentId">>,
): DesignDocument {
  if (!document.comments?.some((comment) => comment.commentId === commentId)) return document;
  return recordOperation(
    {
      ...document,
      comments: document.comments.map((comment) =>
        comment.commentId === commentId ? { ...comment, ...patch } : comment,
      ),
    },
    { kind: "update-node", nodeId: null, fields: ["update-comment", commentId] },
  );
}

export function removeDesignComment(document: DesignDocument, commentId: string): DesignDocument {
  if (!document.comments?.some((comment) => comment.commentId === commentId)) return document;
  return recordOperation(
    {
      ...document,
      comments: document.comments.filter((comment) => comment.commentId !== commentId),
    },
    { kind: "update-node", nodeId: null, fields: ["remove-comment", commentId] },
  );
}

function vectorGeometry(points: readonly DesignVectorPoint[]) {
  const extent = points.flatMap((point) => [
    { x: point.x, y: point.y },
    ...(point.inHandle ? [{ x: point.x + point.inHandle.x, y: point.y + point.inHandle.y }] : []),
    ...(point.outHandle
      ? [{ x: point.x + point.outHandle.x, y: point.y + point.outHandle.y }]
      : []),
  ]);
  const x = Math.min(...extent.map((point) => point.x));
  const y = Math.min(...extent.map((point) => point.y));
  return {
    x,
    y,
    width: Math.max(1, Math.max(...extent.map((point) => point.x)) - x),
    height: Math.max(1, Math.max(...extent.map((point) => point.y)) - y),
    points: points.map(({ x: pointX, y: pointY, inHandle, outHandle }) => ({
      x: pointX - x,
      y: pointY - y,
      ...(inHandle ? { inHandle } : {}),
      ...(outHandle ? { outHandle } : {}),
    })),
  };
}

function vectorPath(points: readonly DesignVectorPoint[], closed: boolean) {
  return (
    points
      .map((point, index) => {
        if (index === 0) return `M ${point.x} ${point.y}`;
        const previous = points[index - 1]!;
        const out = previous.outHandle;
        const incoming = point.inHandle;
        if (!out && !incoming) return `L ${point.x} ${point.y}`;
        const c1 = out ? { x: previous.x + out.x, y: previous.y + out.y } : previous;
        const c2 = incoming ? { x: point.x + incoming.x, y: point.y + incoming.y } : point;
        return `C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${point.x} ${point.y}`;
      })
      .join(" ") + (closed ? " Z" : "")
  );
}

export function updateDesignVectorPoint(
  document: DesignDocument,
  nodeId: string,
  index: number,
  update: Partial<DesignVectorPoint>,
): DesignDocument {
  const node = document.nodes.find((candidate) => candidate.nodeId === nodeId);
  const points = node?.vector?.points;
  if (!node?.vector || !points?.[index]) return document;
  const nextPoints = points.map((point, pointIndex) =>
    pointIndex === index ? { ...point, ...update } : point,
  );
  const absolutePoints: DesignVectorPoint[] = nextPoints.map((point) => {
    const absolute: DesignVectorPoint = { x: point.x + node.x, y: point.y + node.y };
    if (point.inHandle) absolute.inHandle = point.inHandle;
    if (point.outHandle) absolute.outHandle = point.outHandle;
    return absolute;
  });
  const geometry = vectorGeometry(absolutePoints);
  return updateDesignNode(document, nodeId, {
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    vector: {
      ...node.vector,
      path: vectorPath(geometry.points, node.vector.closed),
      width: geometry.width,
      height: geometry.height,
      points: geometry.points,
    },
  });
}

export function updateDesignGuides(
  document: DesignDocument,
  guides: NonNullable<DesignDocument["guides"]>,
): DesignDocument {
  if (guides.some((guide) => !Number.isFinite(guide.position))) return document;
  return recordOperation(
    { ...document, guides },
    { kind: "update-node", nodeId: null, fields: ["guides"] },
  );
}

export function removeDesignAsset(document: DesignDocument, assetId: string): DesignDocument {
  if (
    document.nodes.some((node) => node.assetId === assetId) ||
    !document.assets.some((asset) => asset.assetId === assetId)
  )
    return document;
  return recordOperation(
    { ...document, assets: document.assets.filter((asset) => asset.assetId !== assetId) },
    { kind: "update-node", nodeId: null, fields: ["assets"] },
  );
}

export function replaceDesignAsset(
  document: DesignDocument,
  assetId: string,
  replacement: DesignAssetMeta,
): DesignDocument {
  if (
    replacement.assetId === assetId ||
    !document.assets.some((asset) => asset.assetId === assetId)
  )
    return document;
  return recordOperation(
    {
      ...document,
      assets: [
        ...document.assets.filter(
          (asset) => asset.assetId !== assetId && asset.assetId !== replacement.assetId,
        ),
        replacement,
      ],
      nodes: document.nodes.map((node) =>
        node.assetId === assetId
          ? { ...node, assetId: replacement.assetId, sourceUrl: undefined }
          : node,
      ),
    },
    { kind: "add-asset", nodeId: null, assetId: replacement.assetId, fields: ["assets", "nodes"] },
  );
}

export function pasteDesignNodes(
  document: DesignDocument,
  source: DesignDocument,
  nodeIds: readonly string[],
): DesignDocument {
  const roots = selectionRoots(source, nodeIds);
  const originals = roots.flatMap((node) => [node, ...descendants(source, node.nodeId)]);
  if (!originals.length) return document;
  const occupied = new Set(document.nodes.map((node) => node.nodeId));
  let sequence = document.nodes.length;
  const ids = new Map(
    originals.map((node) => {
      let id: string;
      do {
        id = `pasted-${++sequence}`;
      } while (occupied.has(id));
      occupied.add(id);
      return [node.nodeId, id];
    }),
  );
  const rootIds = new Set(roots.map((node) => node.nodeId));
  const sourceNodes = new Map(source.nodes.map((node) => [node.nodeId, node]));
  const copies = originals.map((node) => {
    const root = rootIds.has(node.nodeId);
    const position = root
      ? designMatrixPose(designWorldMatrix(sourceNodes, node.nodeId), node)
      : node;
    const remapReference = (reference: string | undefined) =>
      reference
        ? (ids.get(reference) ??
          (document.documentId === source.documentId &&
          document.nodes.some((candidate) => candidate.nodeId === reference)
            ? reference
            : undefined))
        : undefined;
    const instanceOfNodeId = remapReference(node.instanceOfNodeId);
    return {
      ...node,
      ...(root ? position : {}),
      nodeId: ids.get(node.nodeId)!,
      kind: node.kind === "instance" && !instanceOfNodeId ? ("frame" as const) : node.kind,
      componentId: remapReference(node.componentId),
      instanceOfNodeId,
      parentId: root ? null : (ids.get(node.parentId!) ?? null),
      childIds: node.childIds.flatMap((id) => ids.get(id) ?? []),
      x: position.x + (root ? 24 : 0),
      y: position.y + (root ? 24 : 0),
      interactions: node.interactions?.map((interaction) => ({
        ...interaction,
        targetNodeId: interaction.targetNodeId
          ? (ids.get(interaction.targetNodeId) ??
            (document.documentId === source.documentId ? interaction.targetNodeId : null))
          : null,
      })),
    };
  });
  return recordOperation(
    {
      ...document,
      assets: [
        ...document.assets,
        ...source.assets.filter(
          (asset) => !document.assets.some((candidate) => candidate.assetId === asset.assetId),
        ),
      ],
      pages: document.pages.map((page) =>
        page.pageId === document.activePageId
          ? { ...page, nodeIds: [...page.nodeIds, ...roots.map((node) => ids.get(node.nodeId)!)] }
          : page,
      ),
      nodes: [...document.nodes, ...copies],
    },
    { kind: "add-node", nodeId: copies[0]!.nodeId },
  );
}

export function renameDesignDocument(document: DesignDocument, title: string): DesignDocument {
  if (!title.trim() || title.trim() === document.title) return document;
  return recordOperation(
    { ...document, title: title.trim() },
    { kind: "update-node", nodeId: null, fields: ["title"] },
  );
}

export function setPrototypeStartFrame(
  document: DesignDocument,
  nodeId: string | null,
): DesignDocument {
  const active = document.pages.find((page) => page.pageId === document.activePageId);
  if (!active) return document;
  const pageNodes = active.nodeIds.flatMap((id) => [
    id,
    ...descendants(document, id).map((node) => node.nodeId),
  ]);
  if (
    nodeId !== null &&
    (!pageNodes.includes(nodeId) ||
      !document.nodes.some((node) => node.nodeId === nodeId && node.kind === "frame"))
  )
    return document;
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((page) =>
        page === active ? { ...page, prototypeStartNodeId: nodeId ?? undefined } : page,
      ),
    },
    { kind: "update-node", nodeId: null, fields: ["prototypeStartNodeId"] },
  );
}

export function updatePrototypeSettings(
  document: DesignDocument,
  update: Partial<DesignPrototypeSettings>,
): DesignDocument {
  const active = document.pages.find((page) => page.pageId === document.activePageId);
  if (!active) return document;
  return recordOperation(
    {
      ...document,
      pages: document.pages.map((page) =>
        page === active
          ? { ...page, prototypeSettings: { ...page.prototypeSettings, ...update } }
          : page,
      ),
    },
    { kind: "update-node", nodeId: null, fields: ["prototypeSettings"] },
  );
}

export function designInsertionParent(
  document: DesignDocument,
  selection: readonly string[],
  nodes: ReadonlyMap<string, DesignNode> = new Map(
    document.nodes.map((node) => [node.nodeId, node]),
  ),
): string | null {
  if (selection.length !== 1) return null;
  const ancestry = nodeAncestry(nodes, selection[0]!);
  const instanceIndex = ancestry.findLastIndex((node) => node.kind === "instance");
  return (
    ancestry
      .slice(instanceIndex + 1)
      .find(
        (node) =>
          ["frame", "component", "group"].includes(node.kind) &&
          !nodeAncestry(nodes, node.nodeId).some((ancestor) => ancestor.locked),
      )?.nodeId ?? null
  );
}
