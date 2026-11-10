import { parseDesignCssEffects, readDesignEffectMetadata } from "./designEffects";
import type {
  DesktopPreviewDesignCapture,
  PreviewAppearancePreference,
  PreviewViewportSetting,
} from "@t3tools/contracts";

import { captureDesignDomWithMetadata } from "./designDomCapture";
import { designTextAppearance } from "./designTypography";
import {
  designNodeMatrix,
  designIdentityMatrix,
  invertDesignMatrix,
  multiplyDesignMatrices,
  transformDesignPoint,
  type DesignMatrix,
} from "./designGeometry";

import {
  createInitialDesignDocument,
  type DesignAssetMeta,
  type DesignDocument,
  type DesignFill,
  type DesignNode,
} from "./designDocument";
import type { PreviewDesignNodeSnapshot } from "@t3tools/contracts";

function captureGeometry(
  captured: PreviewDesignNodeSnapshot,
  parentMatrix: DesignMatrix,
): { x: number; y: number; matrix: DesignMatrix } {
  const center = transformDesignPoint(invertDesignMatrix(parentMatrix), {
    x: captured.x + captured.width / 2,
    y: captured.y + captured.height / 2,
  });
  const x = center.x - captured.width / 2;
  const y = center.y - captured.height / 2;
  const matrix = multiplyDesignMatrices(
    parentMatrix,
    designNodeMatrix({
      x,
      y,
      width: captured.width,
      height: captured.height,
      rotation: captured.rotation,
      flipX: captured.flipX,
      flipY: captured.flipY,
    } as DesignNode),
  );
  return { x, y, matrix };
}

function captureGeometryById(nodes: readonly PreviewDesignNodeSnapshot[]) {
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const resolved = new Map<string, { x: number; y: number; matrix: DesignMatrix }>();
  const resolve = (nodeId: string): { x: number; y: number; matrix: DesignMatrix } => {
    const existing = resolved.get(nodeId);
    if (existing) return existing;
    const node = byId.get(nodeId)!;
    const parentMatrix =
      node.parentId === null ? designIdentityMatrix : resolve(node.parentId).matrix;
    const geometry = captureGeometry(node, parentMatrix);
    resolved.set(nodeId, geometry);
    return geometry;
  };
  for (const node of nodes) resolve(node.nodeId);
  return resolved;
}

function capturePaint(captured: PreviewDesignNodeSnapshot) {
  const gradient = captured.backgroundImage
    ? parseCapturedGradient(captured.backgroundImage)
    : null;
  const blendModes = [
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
  ] as const;
  const blendMode = blendModes.includes(captured.mixBlendMode as (typeof blendModes)[number])
    ? (captured.mixBlendMode as (typeof blendModes)[number])
    : undefined;
  return {
    ...(captured.fill === null ? {} : { background: captured.fill }),
    ...(captured.border === null ? {} : { borderColor: captured.border }),
    radius: captured.borderRadius,
    ...(blendMode === undefined ? {} : { blendMode }),
    ...(gradient === null ? {} : { fills: [gradient] }),
    ...(captured.fill === null || captured.vectorFillOpacity === undefined
      ? {}
      : { fills: [{ color: captured.fill, opacity: captured.vectorFillOpacity }] }),
    ...(captured.border === null ||
    (captured.vectorStrokeWidth === undefined && captured.vectorStrokeOpacity === undefined)
      ? {}
      : {
          strokes: [
            {
              color: captured.border ?? "currentColor",
              width: captured.vectorStrokeWidth ?? 1,
              ...(captured.vectorStrokeOpacity === undefined
                ? {}
                : { opacity: captured.vectorStrokeOpacity }),
              ...(captured.vectorStrokeCap === undefined
                ? {}
                : { cap: captured.vectorStrokeCap as "butt" | "round" | "square" }),
              ...(captured.vectorStrokeJoin === undefined
                ? {}
                : { join: captured.vectorStrokeJoin as "miter" | "round" | "bevel" }),
            },
          ],
        }),
  };
}

function parseCapturedGradient(value: string): DesignFill | null {
  const match = /^(linear|radial|conic)-gradient\((.*)\)$/iu.exec(value.trim());
  if (!match) return null;
  const kind =
    match[1]!.toLowerCase() === "radial"
      ? "radial-gradient"
      : match[1]!.toLowerCase() === "conic"
        ? "angular-gradient"
        : "linear-gradient";
  const body = match[2]!;
  const angle = Number.parseFloat(/(?:from|^)(-?\d+(?:\.\d+)?)deg/iu.exec(body)?.[1] ?? "0");
  const stops = [
    ...body.matchAll(/(#[\da-f]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-z]+)\s*(\d+(?:\.\d+)?)%?/giu),
  ].map((entry, index, all) => ({
    color: entry[1]!,
    position: entry[2] === undefined ? index / Math.max(1, all.length - 1) : Number(entry[2]) / 100,
  }));
  if (stops.length < 2) return null;
  return { color: stops[0]!.color, kind, angle, stops };
}

function viewportSize(viewport: PreviewViewportSetting) {
  return viewport._tag === "fill"
    ? { width: null, height: null }
    : { width: viewport.width, height: viewport.height };
}

export function createDesignDocumentFromPreview(input: {
  readonly url: string;
  readonly title: string;
  readonly viewport: PreviewViewportSetting;
  readonly colorScheme: PreviewAppearancePreference;
  readonly sourceRevision: string;
  readonly sourceThreadId?: string;
  readonly sourceTabId?: string;
  readonly capture?: DesktopPreviewDesignCapture;
  readonly assetIdsByNodeId?: ReadonlyMap<string, string>;
  readonly assetMetadata?: ReadonlyArray<DesignAssetMeta>;
}): DesignDocument {
  const document = createInitialDesignDocument();
  const size = viewportSize(input.viewport);
  const provenance = {
    mode: "snapshot" as const,
    route: input.url,
    sourceRevision: input.capture?.sourceRevision ?? input.sourceRevision,
    viewportWidth: size.width,
    viewportHeight: size.height,
    colorScheme: input.colorScheme,
    capturedAt: new Date().toISOString(),
    ...(input.capture?.browserEngine === undefined
      ? {}
      : { browserEngine: input.capture.browserEngine }),
    ...(input.capture?.stateFixture === undefined
      ? {}
      : { stateFixture: input.capture.stateFixture }),
    ...(input.capture?.truncated ? { captureTruncated: true } : {}),
    ...(input.sourceThreadId === undefined ? {} : { sourceThreadId: input.sourceThreadId }),
    ...(input.sourceTabId === undefined ? {} : { sourceTabId: input.sourceTabId }),
  };
  const base = {
    ...document,
    title: input.title || "Preview snapshot",
    provenance,
    ...(input.assetMetadata === undefined ? {} : { assets: input.assetMetadata }),
    nodes: document.nodes.map((node) => ({ ...node, provenance })),
  };
  if (!input.capture || input.capture.nodes.length === 0) return base;

  const capturedGeometry = captureGeometryById(input.capture.nodes);
  const frameId = "frame-preview";
  const nodes = input.capture.nodes.map((captured) => {
    const geometry = capturedGeometry.get(captured.nodeId)!;
    const kind: DesignNode["kind"] =
      captured.kind === "text"
        ? "text"
        : captured.kind === "image"
          ? "image"
          : captured.kind === "vector"
            ? "vector"
            : "group";
    return {
      nodeId: `preview-${captured.nodeId}`,
      kind,
      name: captured.name,
      parentId: captured.parentId === null ? frameId : `preview-${captured.parentId}`,
      childIds: input
        .capture!.nodes.filter((candidate) => candidate.parentId === captured.nodeId)
        .map((candidate) => `preview-${candidate.nodeId}`),
      x: geometry.x,
      y: geometry.y,
      width: captured.width,
      height: captured.height,
      fill: captured.fill,
      border: captured.border,
      text: captured.text,
      fontSize: captured.fontSize,
      fontWeight: captured.fontWeight,
      opacity: captured.opacity,
      clipContent: captured.clipContent,
      ...(captured.rotation === undefined ? {} : { rotation: captured.rotation }),
      ...(captured.flipX === undefined ? {} : { flipX: captured.flipX }),
      ...(captured.flipY === undefined ? {} : { flipY: captured.flipY }),
      ...(captured.boxShadow !== undefined ||
      captured.filter !== undefined ||
      captured.backdropFilter !== undefined ||
      captured.designEffects !== undefined
        ? {
            effects: captured.designEffects
              ? readDesignEffectMetadata(captured.designEffects)
              : parseDesignCssEffects(captured),
          }
        : {}),
      assetId: input.assetIdsByNodeId?.get(captured.nodeId) ?? null,
      ...(captured.assetUrl === undefined ? {} : { sourceUrl: captured.assetUrl }),
      provenance,
      ...(captured.rotation === undefined ? {} : { rotation: captured.rotation }),
      ...(captured.flipX === undefined ? {} : { flipX: captured.flipX }),
      ...(captured.flipY === undefined ? {} : { flipY: captured.flipY }),
      layoutModel: {
        kind: "absolute" as const,
        resolvedX: geometry.x,
        resolvedY: geometry.y,
        resolvedWidth: captured.width,
        resolvedHeight: captured.height,
      },
      paint: capturePaint(captured),
      ...(captured.vectorPath === undefined
        ? {}
        : {
            vector: {
              path: captured.vectorPath,
              width: captured.width,
              height: captured.height,
              closed: captured.vectorClosed === true,
            },
          }),
      typography: {
        ...designTextAppearance(captured),
        ...(captured.fontFamily === null ? {} : { family: captured.fontFamily }),
        ...(captured.fontSize === null ? {} : { size: captured.fontSize }),
        ...(captured.fontWeight === null ? {} : { weight: captured.fontWeight }),
        ...(captured.lineHeight === null ? {} : { lineHeight: captured.lineHeight }),
        ...(captured.letterSpacing === null ? {} : { letterSpacing: captured.letterSpacing }),
        ...(captured.fontFeatureSettings
          ? { fontFeatureSettings: captured.fontFeatureSettings }
          : {}),
        ...(captured.fontVariationSettings
          ? { fontVariationSettings: captured.fontVariationSettings }
          : {}),
        ...(captured.color === null ? {} : { color: captured.color }),
      },
      interactions: [],
    };
  });
  const frame = {
    ...base.nodes[0]!,
    nodeId: frameId,
    name: "Preview frame",
    width: input.capture.viewportWidth,
    height: input.capture.viewportHeight,
    childIds: input.capture.nodes
      .filter((node) => node.parentId === null)
      .map((node) => `preview-${node.nodeId}`),
    provenance,
    layoutModel: {
      kind: "absolute" as const,
      resolvedWidth: input.capture.viewportWidth,
      resolvedHeight: input.capture.viewportHeight,
    },
  };
  return {
    ...base,
    title: input.capture.title || base.title,
    pages: [{ ...base.pages[0]!, nodeIds: [frameId] }],
    nodes: [frame, ...nodes],
  };
}

export async function materializePreviewAssets(capture: DesktopPreviewDesignCapture): Promise<{
  readonly assetIdsByNodeId: ReadonlyMap<string, string>;
  readonly assets: ReadonlyArray<DesignAssetMeta>;
}> {
  const { prepareDesignImage } = await import("./designImage");
  const assetIds = new Map<string, string>();
  const assets: DesignAssetMeta[] = [];
  for (const node of capture.nodes) {
    if (node.kind !== "image") continue;
    if (node.assetUrl === undefined)
      throw new Error(`The captured image “${node.name}” has no source.`);
    const response = await fetch(node.assetUrl, { credentials: "include" });
    if (!response.ok) throw new Error(`Could not download the captured image “${node.name}”.`);
    const blob = await response.blob();
    if (blob.size > 8 * 1024 * 1024)
      throw new Error(`The image “${node.name}” exceeds the 8 MB package limit.`);
    const asset = await prepareDesignImage(new File([blob], node.name, { type: blob.type }));
    assetIds.set(node.nodeId, asset.assetId);
    if (!assets.some((item) => item.assetId === asset.assetId)) assets.push(asset);
  }
  return { assetIdsByNodeId: assetIds, assets };
}

export function linkDesignDocument(document: DesignDocument): DesignDocument {
  if (!document.provenance?.sourceThreadId || !document.provenance.sourceTabId) return document;
  const provenance = { ...document.provenance, mode: "linked" as const };
  return {
    ...document,
    provenance,
    nodes: document.nodes.map((node) => ({ ...node, provenance })),
    syncState: "local",
  };
}

export function refreshLinkedDesignDocument(
  document: DesignDocument,
  source: Pick<
    NonNullable<DesignDocument["provenance"]>,
    | "sourceRevision"
    | "route"
    | "colorScheme"
    | "viewportWidth"
    | "viewportHeight"
    | "browserEngine"
    | "stateFixture"
  > & {
    readonly capture?: DesktopPreviewDesignCapture;
    readonly assetIdsByNodeId?: ReadonlyMap<string, string>;
    readonly assetMetadata?: ReadonlyArray<DesignAssetMeta>;
  },
): DesignDocument {
  if (document.provenance?.mode !== "linked") return document;
  for (const node of source.capture?.nodes ?? []) {
    if (node.kind !== "image") continue;
    const assetId = source.assetIdsByNodeId?.get(node.nodeId);
    if (
      !assetId ||
      ![...document.assets, ...(source.assetMetadata ?? [])].some(
        (asset) => asset.assetId === assetId,
      )
    )
      throw new Error(
        `The image “${node.name}” is not stored locally. Your design has been preserved.`,
      );
  }

  const provenance = {
    mode: "linked" as const,
    route: source.route,
    sourceRevision: source.sourceRevision,
    viewportWidth: source.viewportWidth,
    viewportHeight: source.viewportHeight,
    colorScheme: source.colorScheme,
    ...(document.provenance.sourceThreadId
      ? { sourceThreadId: document.provenance.sourceThreadId }
      : {}),
    ...(document.provenance.sourceTabId ? { sourceTabId: document.provenance.sourceTabId } : {}),
    ...((source.browserEngine ?? document.provenance.browserEngine)
      ? { browserEngine: source.browserEngine ?? document.provenance.browserEngine }
      : {}),
    ...((source.stateFixture ?? document.provenance.stateFixture)
      ? { stateFixture: source.stateFixture ?? document.provenance.stateFixture }
      : {}),
    ...(source.capture?.truncated || document.provenance.captureTruncated
      ? { captureTruncated: true }
      : {}),
    capturedAt: new Date().toISOString(),
  };
  const pendingNodes = new Set(
    document.pendingOperations
      .filter((operation) => operation.kind === "update-node" && operation.nodeId !== null)
      .map((operation) => operation.nodeId),
  );
  const sourceNodes = new Map(
    source.capture?.nodes.map((node) => [`preview-${node.nodeId}`, node]),
  );
  const capturedGeometry = source.capture ? captureGeometryById(source.capture.nodes) : new Map();
  const previewNodeIds = source.capture === undefined ? null : new Set(sourceNodes.keys());
  const staleNodeIds = new Set(
    previewNodeIds === null
      ? []
      : document.nodes
          .filter((node) => node.nodeId.startsWith("preview-") && !previewNodeIds.has(node.nodeId))
          .filter((node) => !pendingNodes.has(node.nodeId))
          .map((node) => node.nodeId),
  );
  const nodeFromCapture = (
    captured: NonNullable<typeof source.capture>["nodes"][number],
  ): DesignNode => {
    const geometry = capturedGeometry.get(captured.nodeId)!;
    return {
      nodeId: `preview-${captured.nodeId}`,
      kind:
        captured.kind === "text"
          ? "text"
          : captured.kind === "image"
            ? "image"
            : captured.kind === "vector"
              ? "vector"
              : "group",
      name: captured.name,
      parentId: captured.parentId === null ? "frame-preview" : `preview-${captured.parentId}`,
      childIds: source
        .capture!.nodes.filter((candidate) => candidate.parentId === captured.nodeId)
        .map((candidate) => `preview-${candidate.nodeId}`),
      x: geometry.x,
      y: geometry.y,
      width: captured.width,
      height: captured.height,
      fill: captured.fill,
      border: captured.border,
      text: captured.text,
      fontSize: captured.fontSize,
      fontWeight: captured.fontWeight,
      opacity: captured.opacity,
      clipContent: captured.clipContent,
      ...(captured.rotation === undefined ? {} : { rotation: captured.rotation }),
      ...(captured.flipX === undefined ? {} : { flipX: captured.flipX }),
      ...(captured.flipY === undefined ? {} : { flipY: captured.flipY }),
      ...(captured.boxShadow !== undefined ||
      captured.filter !== undefined ||
      captured.backdropFilter !== undefined ||
      captured.designEffects !== undefined
        ? {
            effects: captured.designEffects
              ? readDesignEffectMetadata(captured.designEffects)
              : parseDesignCssEffects(captured),
          }
        : {}),
      assetId: source.assetIdsByNodeId?.get(captured.nodeId) ?? null,
      ...(captured.assetUrl === undefined ? {} : { sourceUrl: captured.assetUrl }),
      provenance,
      ...(captured.rotation === undefined ? {} : { rotation: captured.rotation }),
      ...(captured.flipX === undefined ? {} : { flipX: captured.flipX }),
      ...(captured.flipY === undefined ? {} : { flipY: captured.flipY }),
      layoutModel: {
        kind: "absolute",
        resolvedX: geometry.x,
        resolvedY: geometry.y,
        resolvedWidth: captured.width,
        resolvedHeight: captured.height,
      },
      paint: capturePaint(captured),
      ...(captured.vectorPath === undefined
        ? {}
        : {
            vector: {
              path: captured.vectorPath,
              width: captured.width,
              height: captured.height,
              closed: captured.vectorClosed === true,
            },
          }),
      typography: {
        ...designTextAppearance(captured),
        ...(captured.fontFamily === null ? {} : { family: captured.fontFamily }),
        ...(captured.fontSize === null ? {} : { size: captured.fontSize }),
        ...(captured.fontWeight === null ? {} : { weight: captured.fontWeight }),
        ...(captured.lineHeight === null ? {} : { lineHeight: captured.lineHeight }),
        ...(captured.letterSpacing === null ? {} : { letterSpacing: captured.letterSpacing }),
        ...(captured.fontFeatureSettings
          ? { fontFeatureSettings: captured.fontFeatureSettings }
          : {}),
        ...(captured.fontVariationSettings
          ? { fontVariationSettings: captured.fontVariationSettings }
          : {}),
        ...(captured.color === null ? {} : { color: captured.color }),
      },
      interactions: [],
    };
  };
  const refreshedNodes = document.nodes
    .filter((node) => !staleNodeIds.has(node.nodeId))
    .map((node) => {
      const captured = sourceNodes.get(node.nodeId);
      if (!captured || pendingNodes.has(node.nodeId)) return { ...node, provenance };
      const refreshed = nodeFromCapture(captured);
      const merged = { ...node, ...refreshed, nodeId: node.nodeId, provenance };
      for (const field of Object.keys(node.overrides ?? {})) {
        if (field in node) {
          (merged as unknown as Record<string, unknown>)[field] = (
            node as unknown as Record<string, unknown>
          )[field];
        }
      }
      return merged;
    });
  const addedNodes =
    source.capture?.nodes
      .filter(
        (captured) => !document.nodes.some((node) => node.nodeId === `preview-${captured.nodeId}`),
      )
      .map(nodeFromCapture) ?? [];
  const nodes = [...refreshedNodes, ...addedNodes].map((node) => ({
    ...node,
    childIds: node.childIds.filter((childId) => !staleNodeIds.has(childId)),
  }));
  const frame = nodes.find((node) => node.nodeId === "frame-preview");
  const finalNodes =
    frame && source.capture
      ? nodes.map((node) =>
          node.nodeId === frame.nodeId
            ? {
                ...node,
                width: source.capture!.viewportWidth,
                height: source.capture!.viewportHeight,
                childIds: source
                  .capture!.nodes.filter((candidate) => candidate.parentId === null)
                  .map((candidate) => `preview-${candidate.nodeId}`),
              }
            : node,
        )
      : nodes;
  return {
    ...document,
    provenance,
    assets:
      source.assetMetadata === undefined
        ? document.assets
        : [
            ...document.assets.filter(
              (asset) =>
                !source.assetMetadata?.some((candidate) => candidate.assetId === asset.assetId),
            ),
            ...source.assetMetadata,
          ],
    nodes: finalNodes,
    syncState: "local",
  };
}

/**
 * HTML stays inert; React is rendered in an opaque sandbox and only its captured layers return.
 */
export async function createDesignDocumentFromMarkup(input: {
  readonly markup: string;
  readonly mode: "html" | "react";
  readonly viewport?: { width: number; height: number };
  readonly signal?: AbortSignal;
}): Promise<DesignDocument> {
  if (input.markup.length > 500_000) throw new Error("Pasted markup is too large to import.");
  if (input.mode === "react") {
    const { createDesignDocumentFromReact } = await import("./designReactImport");
    return createDesignDocumentFromReact(input.markup, {
      viewport: input.viewport,
      signal: input.signal,
    });
  }
  const normalized = input.markup;
  // oxlint-disable-next-line react/iframe-missing-sandbox -- The sandbox is applied before srcdoc and before the iframe is mounted.
  const iframe = window.document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:absolute;left:-100000px;top:0;width:640px;height:420px;border:0;visibility:hidden";
  const ready = new Promise<void>((resolve) => {
    iframe.onload = () => resolve();
  });
  iframe.srcdoc = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob: http: https:; font-src data: blob:"><style>html,body{margin:0}*{box-sizing:border-box}</style></head><body>${normalized}</body></html>`;
  window.document.body.append(iframe);
  try {
    await ready;
    const parsed = iframe.contentDocument;
    if (!parsed) throw new Error("Could not render the pasted markup.");
    const document = createInitialDesignDocument();
    const frame = document.nodes[0];
    if (!frame) return document;
    const capturedDom = captureDesignDomWithMetadata(parsed.body, frame.nodeId);
    const nodes = [frame, ...capturedDom.nodes];
    return {
      ...document,
      title: "Pasted HTML frame",
      pages: [{ ...document.pages[0]!, nodeIds: [frame.nodeId] }],
      nodes: [
        {
          ...frame,
          childIds: nodes
            .slice(1)
            .filter((node) => node.parentId === frame.nodeId)
            .map((node) => node.nodeId),
        },
        ...nodes.slice(1),
      ],
      revision: 0,
      pendingOperations: [],
      syncState: "local",
      conflicts: [],
      provenance: capturedDom.truncated
        ? {
            mode: "generated",
            route: "pasted-html",
            sourceRevision: null,
            viewportWidth: 640,
            viewportHeight: 420,
            colorScheme: "light",
            capturedAt: new Date().toISOString(),
            captureTruncated: true,
          }
        : document.provenance,
    };
  } finally {
    iframe.remove();
  }
}
