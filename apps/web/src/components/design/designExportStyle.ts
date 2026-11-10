import type { DesignNode } from "./designDocument";
import { designEffectFilterId, designEffectsStyle } from "./designEffects";
import { designNodeCssTransform } from "./designGeometry";
import { designTypographyStyle } from "./designTypography";
import { designPaintBackground, designPaintStrokeBoxShadow } from "./designPaint";

export function designExportStyle(
  node: DesignNode,
  nodes: ReadonlyMap<string, DesignNode>,
): Readonly<Record<string, string | number>> {
  const parent = node.parentId ? nodes.get(node.parentId) : undefined;
  const flow =
    parent?.layoutModel !== undefined &&
    parent.layoutModel.kind !== "absolute" &&
    node.layoutSizing?.position !== "absolute";
  const paint = node.paint,
    type = node.typography,
    layout = node.layoutModel,
    sizing = node.layoutSizing;
  const paintBackground = designPaintBackground(node);
  const paintStrokeBoxShadow = designPaintStrokeBoxShadow(node);
  const style: Record<string, string | number> = {
    ...designEffectsStyle(node, designEffectFilterId(node.nodeId)),
    position: flow ? "relative" : "absolute",
    boxSizing: "border-box",
    whiteSpace: "pre-wrap",
    width: node.width,
    height: node.height,
    opacity: node.opacity,
  };
  if (paint?.blendMode && paint.blendMode !== "normal") style.mixBlendMode = paint.blendMode;
  const translations = ["0px", "0px"];
  if (!flow) {
    style.left = node.x;
    style.top = node.y;
    if (parent) {
      const horizontal = node.constraints?.horizontal,
        vertical = node.constraints?.vertical;
      if (horizontal === "right" || horizontal === "left-right") {
        style.right = parent.width - node.x - node.width;
        if (horizontal === "right") delete style.left;
        else delete style.width;
      }
      if (vertical === "bottom" || vertical === "top-bottom") {
        style.bottom = parent.height - node.y - node.height;
        if (vertical === "bottom") delete style.top;
        else delete style.height;
      }
      if (horizontal === "center") {
        style.left = `calc(50% + ${node.x + node.width / 2 - parent.width / 2}px)`;
        translations[0] = "-50%";
      }
      if (vertical === "center") {
        style.top = `calc(50% + ${node.y + node.height / 2 - parent.height / 2}px)`;
        translations[1] = "-50%";
      }
      if (horizontal === "scale" && parent.width) {
        style.left = `${(node.x / parent.width) * 100}%`;
        style.width = `${(node.width / parent.width) * 100}%`;
      }
      if (vertical === "scale" && parent.height) {
        style.top = `${(node.y / parent.height) * 100}%`;
        style.height = `${(node.height / parent.height) * 100}%`;
      }
    }
  } else {
    style.flexShrink = 0;
    const row = parent?.layoutModel?.direction === "row" || parent?.layoutModel?.kind === "grid";
    for (const axis of ["width", "height"] as const) {
      if (sizing?.[axis] !== "fill") continue;
      style[axis] = "auto";
      if ((axis === "width") === row) {
        style.flexGrow = 1;
        style.flexBasis = 0;
        style.flexShrink = 1;
        style[axis === "width" ? "minWidth" : "minHeight"] = 0;
      } else style.alignSelf = "stretch";
    }
  }
  for (const axis of ["width", "height"] as const)
    if (sizing?.[axis] === "hug") style[axis] = "max-content";
  for (const field of ["minWidth", "maxWidth", "minHeight", "maxHeight"] as const)
    if (sizing?.[field] !== undefined) style[field] = sizing[field];
  style.transform = `${translations.some((value) => value !== "0px") ? `translate(${translations.join(", ")}) ` : ""}${designNodeCssTransform(node)}`;
  if (node.kind !== "text" && !node.vector && paintBackground) style.background = paintBackground;
  if (!node.vector && paintStrokeBoxShadow) style.boxShadow = paintStrokeBoxShadow;
  if (paint?.radius !== undefined) style.borderRadius = paint.radius;
  if (node.kind === "image" || node.clipContent) style.overflow = "hidden";
  for (const [key, value] of Object.entries(designTypographyStyle(node)))
    if (value !== undefined) style[key] = value;
  if (node.kind === "text" && type?.verticalAlign) {
    style.display = "flex";
    style.flexDirection = "column";
    style.justifyContent =
      type.verticalAlign === "middle"
        ? "center"
        : type.verticalAlign === "bottom"
          ? "flex-end"
          : "flex-start";
  }
  if (type?.color ?? (node.kind === "text" ? node.fill : null))
    style.color = type?.color ?? node.fill!;
  else if (node.kind === "text") style.color = "transparent";
  if (layout && layout.kind !== "absolute") {
    const p = layout.padding ?? 0;
    const crossAlign =
      layout.counterAxisAlign === "min"
        ? "start"
        : layout.counterAxisAlign === "max"
          ? "end"
          : layout.counterAxisAlign === "baseline"
            ? "baseline"
            : (layout.counterAxisAlign ?? layout.align ?? "start");
    Object.assign(style, {
      display: layout.kind === "grid" ? "grid" : "flex",
      flexDirection: layout.direction ?? "column",
      flexWrap: layout.wrap ? "wrap" : "nowrap",
      alignContent: "start",
      gap: layout.gap ?? 0,
      ...(layout.counterAxisSpacing === undefined
        ? {}
        : {
            rowGap: layout.direction === "row" ? layout.counterAxisSpacing : (layout.gap ?? 0),
            columnGap: layout.direction === "row" ? (layout.gap ?? 0) : layout.counterAxisSpacing,
          }),
      paddingTop: layout.paddingTop ?? p,
      paddingRight: layout.paddingRight ?? p,
      paddingBottom: layout.paddingBottom ?? p,
      paddingLeft: layout.paddingLeft ?? p,
      alignItems:
        crossAlign === "start"
          ? "flex-start"
          : crossAlign === "end"
            ? "flex-end"
            : crossAlign === "baseline"
              ? "baseline"
              : crossAlign,
      justifyContent:
        layout.justify === "start" || !layout.justify
          ? "flex-start"
          : layout.justify === "end"
            ? "flex-end"
            : layout.justify,
    });
    if (layout.kind === "grid") {
      const cell = node.childIds.flatMap((id) => nodes.get(id) ?? [])[0]?.width ?? 160;
      style.gridTemplateColumns = `repeat(auto-fill, ${cell}px)`;
    }
  }
  return style;
}

const unitless = new Set([
  "opacity",
  "fontWeight",
  "flexGrow",
  "flexShrink",
  "order",
  "zIndex",
  "WebkitLineClamp",
]);
export function designExportCss(style: Readonly<Record<string, string | number>>): string {
  return Object.entries(style)
    .map(
      ([key, value]) =>
        `${key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)}:${typeof value === "number" && !unitless.has(key) ? `${value}px` : value}`,
    )
    .join(";");
}
