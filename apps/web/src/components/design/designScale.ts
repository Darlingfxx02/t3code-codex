import type { DesignNode } from "./designDocument";

export function scaleDesignMetrics<T extends Partial<DesignNode>>(node: T, factor: number): T {
  const scaled = <V extends object>(value: V, keys: readonly (keyof V)[]): V => ({
    ...value,
    ...Object.fromEntries(
      keys.flatMap((key) =>
        typeof value[key] === "number" ? [[key, Number(value[key]) * factor]] : [],
      ),
    ),
  });
  const implicitStroke =
    node.nodeId && (node.border || node.vector) && node.paint?.borderWidth === undefined;
  const paint =
    node.paint || implicitStroke
      ? { ...node.paint, ...(implicitStroke ? { borderWidth: node.vector ? 2 : 1 } : {}) }
      : undefined;
  return {
    ...scaled(node, ["x", "y", "width", "height", "fontSize"]),
    ...(paint ? { paint: scaled(paint, ["borderWidth", "radius"]) } : {}),
    ...(node.effects
      ? { effects: node.effects.map((effect) => scaled(effect, ["x", "y", "blur", "spread"])) }
      : {}),
    ...(node.typography
      ? {
          typography: scaled(node.typography, [
            "size",
            ...(node.typography.lineHeightUnit === "percent" ? [] : (["lineHeight"] as const)),
            ...(node.typography.letterSpacingUnit === "percent"
              ? []
              : (["letterSpacing"] as const)),
          ]),
        }
      : {}),
    ...(node.layoutModel
      ? {
          layoutModel: scaled(node.layoutModel, [
            "gap",
            "counterAxisSpacing",
            "padding",
            "paddingTop",
            "paddingRight",
            "paddingBottom",
            "paddingLeft",
            "resolvedX",
            "resolvedY",
            "resolvedWidth",
            "resolvedHeight",
          ]),
        }
      : {}),
    ...(node.layoutSizing
      ? {
          layoutSizing: scaled(node.layoutSizing, [
            "minWidth",
            "maxWidth",
            "minHeight",
            "maxHeight",
          ]),
        }
      : {}),
    ...(node.image?.mode === "tile"
      ? { image: { ...node.image, scale: (node.image.scale ?? 1) * factor } }
      : {}),
  };
}
