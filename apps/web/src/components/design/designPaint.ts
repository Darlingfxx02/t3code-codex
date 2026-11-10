import type { DesignFill, DesignNode } from "./designDocument";

/** Converts the CSS gradient angle convention to the SVG user-space rotation. */
export function designGradientSvgRotation(angle: number | undefined): number {
  return 90 - (angle ?? 0);
}

function gradientStops(fill: DesignFill): string {
  return [...(fill.stops ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((stop) => `${colorWithOpacity(stop.color, fill.opacity)} ${stop.position * 100}%`)
    .join(", ");
}

export function designPaintGradientCss(fill: DesignFill): string {
  const stops = gradientStops(fill);
  if (fill.kind === "radial-gradient") return `radial-gradient(circle, ${stops})`;
  if (fill.kind === "angular-gradient")
    return `conic-gradient(from ${fill.angle ?? 0}deg, ${stops})`;
  if (fill.kind === "diamond-gradient") return `radial-gradient(closest-corner, ${stops})`;
  return `linear-gradient(${fill.angle ?? 0}deg, ${stops})`;
}

function colorWithOpacity(color: string, opacity: number | undefined) {
  if (opacity === undefined || opacity >= 1) return color;
  return `color-mix(in srgb, ${color} ${Math.max(0, opacity) * 100}%, transparent)`;
}

export function designPaintFills(node: Pick<DesignNode, "paint" | "fill">): readonly string[] {
  const fills = node.paint?.fills;
  if (fills && fills.length > 0)
    return fills.map((fill) => {
      if (fill.kind !== "solid" && fill.stops?.length) {
        return designPaintGradientCss(fill);
      }
      return colorWithOpacity(fill.color, fill.opacity);
    });
  return (node.paint?.background ?? node.fill) ? [node.paint?.background ?? node.fill!] : [];
}

export function designPaintFillLayers(
  node: Pick<DesignNode, "paint" | "fill">,
): readonly DesignFill[] {
  const fills = node.paint?.fills;
  return fills && fills.length > 0
    ? fills
    : [{ color: node.paint?.background ?? node.fill ?? "transparent" }];
}

export function designPaintStroke(node: Pick<DesignNode, "paint" | "border">) {
  const stroke = node.paint?.strokes?.[0];
  return stroke
    ? {
        ...stroke,
        color: colorWithOpacity(stroke.color, stroke.opacity),
      }
    : (node.paint?.borderColor ?? node.border)
      ? {
          color: node.paint?.borderColor ?? node.border!,
          width: node.paint?.borderWidth ?? 1,
        }
      : null;
}

export function designPaintStrokeBoxShadow(node: Pick<DesignNode, "paint" | "border">) {
  const strokes = node.paint?.strokes?.length
    ? node.paint.strokes
    : designPaintStroke(node)
      ? [designPaintStroke(node)!]
      : [];
  let offset = 0;
  return strokes
    .map((stroke) => {
      const spread =
        stroke.align === "inside"
          ? offset + stroke.width
          : stroke.align === "outside"
            ? offset + stroke.width
            : offset + stroke.width / 2;
      offset += stroke.width;
      return `${stroke.align === "inside" ? "inset " : ""}0 0 0 ${spread}px ${colorWithOpacity(stroke.color, stroke.opacity)}`;
    })
    .join(", ");
}

export function designPaintBackground(node: Pick<DesignNode, "paint" | "fill">) {
  const fills = designPaintFills(node);
  if (fills.length === 0) return undefined;
  return fills.length === 1 ? fills[0] : fills.join(", ");
}
