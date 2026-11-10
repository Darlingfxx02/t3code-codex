import type { DesignFill, DesignNode } from "./designDocument";
import { parseDesignCssEffects, readDesignEffectMetadata } from "./designEffects";
import { designTypographyFromCss } from "./designTypography";
import {
  designMatrixPose,
  designNodeMatrix,
  invertDesignMatrix,
  multiplyDesignMatrices,
  transformDesignPoint,
  type DesignMatrix,
} from "./designGeometry";

function numericStyle(style: CSSStyleDeclaration, key: string, fallback: number): number {
  const value = Number.parseFloat(style.getPropertyValue(key));
  return Number.isFinite(value) ? value : fallback;
}

function parseDomGradient(value: string): DesignFill | null {
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
  return stops.length >= 2 ? { color: stops[0]!.color, kind, angle, stops } : null;
}

function elementNode(
  element: Element,
  parentId: string,
  index: number,
  parentOffset: { readonly x: number; readonly y: number },
  parentMatrix: DesignMatrix,
): DesignNode {
  const style = element.ownerDocument.defaultView!.getComputedStyle(element);
  const nodeId = `paste-${index}`;
  const rect = element.getBoundingClientRect();
  const x = rect.left,
    y = rect.top;
  const width = rect.width,
    height = rect.height;
  let geometry: Partial<DesignNode> = {};
  const matrix = new DOMMatrixReadOnly(style.transform === "none" ? undefined : style.transform);
  const rigid =
    matrix.is2D &&
    Math.abs(Math.hypot(matrix.a, matrix.b) - 1) < 1e-6 &&
    Math.abs(Math.hypot(matrix.c, matrix.d) - 1) < 1e-6 &&
    Math.abs(matrix.a * matrix.c + matrix.b * matrix.d) < 1e-6;
  const transformed = [matrix.a, matrix.b, matrix.c, matrix.d, ...parentMatrix.slice(0, 4)].some(
    (value, index) => Math.abs(value - (index % 4 === 0 || index % 4 === 3 ? 1 : 0)) > 1e-9,
  );
  if (rigid && transformed && element instanceof element.ownerDocument.defaultView!.HTMLElement) {
    const boxSize = (axis: "width" | "height") =>
      numericStyle(style, axis, axis === "width" ? width : height) +
      (style.boxSizing === "border-box"
        ? 0
        : (axis === "width"
            ? ["padding-left", "padding-right", "border-left-width", "border-right-width"]
            : ["padding-top", "padding-bottom", "border-top-width", "border-bottom-width"]
          ).reduce((sum, key) => sum + numericStyle(style, key, 0), 0));
    const w = Math.max(0.000001, boxSize("width")),
      h = Math.max(0.000001, boxSize("height"));
    const center = transformDesignPoint(invertDesignMatrix(parentMatrix), {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    geometry = {
      width: w,
      height: h,
      ...designMatrixPose(
        [
          matrix.a,
          matrix.b,
          matrix.c,
          matrix.d,
          center.x - (matrix.a * w + matrix.c * h) / 2,
          center.y - (matrix.b * w + matrix.d * h) / 2,
        ],
        { width: w, height: h },
      ),
    };
  }
  const text =
    element.children.length === 0
      ? (style.whiteSpace.startsWith("pre") ? element.textContent : element.textContent?.trim()) ||
        null
      : null;
  const display = style.display;
  const layoutKind = display === "grid" ? "grid" : display === "flex" ? "flex" : "absolute";
  const background = style.backgroundColor === "rgba(0, 0, 0, 0)" ? null : style.backgroundColor;
  const backgroundGradient =
    style.backgroundImage && style.backgroundImage !== "none"
      ? parseDomGradient(style.backgroundImage)
      : null;
  const border = style.borderColor === "" ? null : style.borderColor;
  return {
    nodeId,
    kind: element.tagName.toLowerCase() === "img" ? "image" : text ? "text" : "group",
    name: element.getAttribute("aria-label") || element.tagName.toLowerCase(),
    parentId,
    childIds: [],
    x: x - parentOffset.x,
    y: y - parentOffset.y,
    width: Math.max(0.000001, width),
    height: Math.max(0.000001, height),
    ...geometry,
    fill: background,
    border,
    text,
    fontSize: numericStyle(style, "font-size", 16),
    fontWeight: Number.parseInt(style.fontWeight, 10) || 400,
    opacity: numericStyle(style, "opacity", 1),
    clipContent: style.overflowX !== "visible" || style.overflowY !== "visible",
    assetId: null,
    effects: element.hasAttribute("data-t3-design-effects")
      ? readDesignEffectMetadata(element.getAttribute("data-t3-design-effects")!)
      : parseDesignCssEffects(style),
    ...(element.tagName.toLowerCase() === "img"
      ? { sourceUrl: element.getAttribute("src") ?? "" }
      : {}),
    provenance: null,
    layoutModel: {
      kind: layoutKind,
      direction: style.flexDirection === "column" ? "column" : "row",
      gap: numericStyle(style, "gap", 0),
      paddingTop: numericStyle(style, "padding-top", 0),
      paddingRight: numericStyle(style, "padding-right", 0),
      paddingBottom: numericStyle(style, "padding-bottom", 0),
      paddingLeft: numericStyle(style, "padding-left", 0),
      ...(style.alignItems === "center" ||
      style.alignItems === "flex-end" ||
      style.alignItems === "flex-start"
        ? {
            align:
              style.alignItems === "center"
                ? ("center" as const)
                : style.alignItems === "flex-end"
                  ? ("end" as const)
                  : ("start" as const),
          }
        : {}),
      ...(style.justifyContent === "center" ||
      style.justifyContent === "flex-end" ||
      style.justifyContent === "flex-start" ||
      style.justifyContent === "space-between"
        ? {
            justify:
              style.justifyContent === "center"
                ? ("center" as const)
                : style.justifyContent === "flex-end"
                  ? ("end" as const)
                  : style.justifyContent === "space-between"
                    ? ("space-between" as const)
                    : ("start" as const),
          }
        : {}),
      wrap: style.flexWrap === "wrap",
      resolvedX: x,
      resolvedY: y,
      resolvedWidth: width,
      resolvedHeight: height,
    },
    paint: {
      ...(background === null ? {} : { background }),
      ...(backgroundGradient === null ? {} : { fills: [backgroundGradient] }),
      ...(border === null ? {} : { borderColor: border }),
      borderWidth: numericStyle(style, "border-top-width", 0),
      radius: numericStyle(style, "border-top-left-radius", 0),
    },
    typography: designTypographyFromCss(style, (element as HTMLElement).style),
    interactions: [],
  };
}

export function captureDesignDomWithMetadata(
  root: HTMLElement,
  frameId: string,
): { readonly nodes: readonly DesignNode[]; readonly truncated: boolean } {
  const nodes: DesignNode[] = [];
  let truncated = false;
  const visit = (
    element: Element,
    parentId: string,
    offset: { x: number; y: number },
    parentMatrix: DesignMatrix,
  ) => {
    if (
      element.hasAttribute("data-t3-design-effect-defs") ||
      [
        "SCRIPT",
        "STYLE",
        "LINK",
        "META",
        "TEMPLATE",
        "NOSCRIPT",
        "DEFS",
        "FILTER",
        "CLIPPATH",
        "MASK",
        "SYMBOL",
      ].includes(element.tagName.toUpperCase())
    )
      return;
    const style = element.ownerDocument.defaultView!.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return;
    if (nodes.length >= 10000) {
      truncated = true;
      return;
    }
    const node = elementNode(element, parentId, nodes.length, offset, parentMatrix);
    const matrix = multiplyDesignMatrices(parentMatrix, designNodeMatrix(node));
    const index = nodes.length;
    nodes.push(node);
    const rect = element.getBoundingClientRect();
    for (const child of element.childNodes) {
      if (child.nodeType === Node.ELEMENT_NODE)
        visit(child as Element, node.nodeId, { x: rect.left, y: rect.top }, matrix);
      else if (element.children.length && child.nodeType === Node.TEXT_NODE && child.textContent) {
        const range = element.ownerDocument.createRange();
        range.selectNodeContents(child);
        const box = range.getBoundingClientRect();
        if (!box.width || !box.height) continue;
        if (nodes.length >= 10000) {
          truncated = true;
          continue;
        }
        const text = style.whiteSpace.startsWith("pre")
          ? child.textContent
          : child.textContent.replace(/\s+/gu, " ");
        const center = transformDesignPoint(invertDesignMatrix(matrix), {
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
        });
        nodes.push({
          ...node,
          nodeId: `paste-${nodes.length}`,
          kind: "text",
          name: "Text",
          parentId: node.nodeId,
          childIds: [],
          x: center.x - box.width / 2,
          y: center.y - box.height / 2,
          width: box.width,
          height: box.height,
          text,
          opacity: 1,
          rotation: 0,
          flipX: false,
          flipY: false,
          fill: null,
          border: null,
          paint: {},
          layoutModel: { kind: "absolute" },
        });
      }
    }
    nodes[index] = {
      ...node,
      childIds: nodes
        .slice(index + 1)
        .filter((child) => child.parentId === node.nodeId)
        .map((child) => child.nodeId),
    };
  };
  const rect = root.getBoundingClientRect();
  for (const element of root.children)
    visit(element, frameId, { x: rect.left, y: rect.top }, [1, 0, 0, 1, rect.left, rect.top]);
  return { nodes, truncated };
}

export function captureDesignDom(root: HTMLElement, frameId: string): readonly DesignNode[] {
  return captureDesignDomWithMetadata(root, frameId).nodes;
}
