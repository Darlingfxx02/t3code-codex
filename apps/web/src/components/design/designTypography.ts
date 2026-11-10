import type { DesignNode, DesignTypography } from "./designDocument";
import { evaluateDesignExpression } from "./designExpression";

export function designTypographyStyle(
  node: Pick<DesignNode, "typography" | "fontSize" | "fontWeight">,
) {
  const type = node.typography;
  return {
    fontFamily: type?.family,
    fontSize: type?.size ?? node.fontSize ?? undefined,
    fontWeight: type?.weight ?? node.fontWeight ?? undefined,
    fontStyle: type?.fontStyle,
    lineHeight:
      type?.lineHeight === undefined
        ? "normal"
        : `${type.lineHeight}${type.lineHeightUnit === "percent" ? "%" : "px"}`,
    letterSpacing:
      type?.letterSpacingUnit === "percent"
        ? `${(type.letterSpacing ?? 0) / 100}em`
        : type?.letterSpacing,
    textDecorationLine: type?.decoration,
    textTransform: type?.letterCase === "small-caps" ? ("none" as const) : type?.letterCase,
    fontVariantCaps: type?.letterCase === "small-caps" ? ("small-caps" as const) : undefined,
    fontFeatureSettings: type?.fontFeatureSettings,
    fontVariationSettings: type?.fontVariationSettings,
    textWrap: type?.wrap,
    textAlign: type?.align,
    textIndent: type?.indent,
    ...(type?.truncation && type.truncation !== "none"
      ? { textOverflow: type.truncation, overflow: "hidden" }
      : {}),
    ...(type?.maxLines && type.maxLines > 0
      ? {
          display: "-webkit-box",
          WebkitBoxOrient: "vertical" as const,
          WebkitLineClamp: type.maxLines,
          overflow: "hidden",
        }
      : {}),
    ...(type?.paragraphSpacing !== undefined ? { marginBlockEnd: type.paragraphSpacing } : {}),
  };
}

export type DesignTypeMetric = "lineHeight" | "letterSpacing";

export function designTypeMetricUpdate(node: DesignNode, metric: DesignTypeMetric, input: string) {
  const source = input.trim(),
    type = node.typography;
  if (metric === "lineHeight" && /^(auto)?$/iu.test(source))
    return { typography: { ...type, lineHeight: undefined, lineHeightUnit: undefined } };
  const unitKey = metric === "lineHeight" ? "lineHeightUnit" : "letterSpacingUnit";
  const match = /^(.*?)(%|px)?$/iu.exec(source)!;
  const unit = match[2] === "%" ? "percent" : match[2] ? "px" : (type?.[unitKey] ?? "px");
  const value = evaluateDesignExpression(
    match[1]!,
    type?.[metric] ?? (metric === "letterSpacing" ? 0 : undefined),
  );
  if (value === null || (metric === "lineHeight" && value < 0)) return null;
  return { typography: { ...type, [metric]: value, [unitKey]: unit } };
}

export function convertDesignTypeMetric(
  node: DesignNode,
  metric: DesignTypeMetric,
  unit: "px" | "percent",
) {
  const type = node.typography,
    value = type?.[metric] ?? (metric === "letterSpacing" ? 0 : undefined);
  if (value === undefined) return null;
  const unitKey = metric === "lineHeight" ? "lineHeightUnit" : "letterSpacingUnit";
  const size = type?.size ?? node.fontSize ?? 16;
  if (!(size > 0)) return null;
  const converted =
    (type?.[unitKey] ?? "px") === unit
      ? value
      : unit === "percent"
        ? (value * 100) / size
        : (value * size) / 100;
  return { typography: { ...type, [metric]: Math.round(converted * 1e6) / 1e6, [unitKey]: unit } };
}

export function measureDesignNormalLineHeight(node: DesignNode) {
  const line = document.createElement("span");
  Object.assign(line.style, designTypographyStyle(node), {
    position: "fixed",
    visibility: "hidden",
    pointerEvents: "none",
    left: "0px",
    top: "0px",
    display: "block",
    width: "max-content",
    height: "auto",
    padding: "0",
    border: "0",
    lineHeight: "normal",
    fontSize: `${node.typography?.size ?? node.fontSize ?? 16}px`,
  });
  line.textContent = "M";
  document.body.append(line);
  const height = line.getBoundingClientRect().height;
  line.remove();
  return height;
}

export function designTypographyFromCss(
  style: CSSStyleDeclaration,
  authored?: CSSStyleDeclaration,
): DesignTypography {
  const fixedLine = Number.parseFloat(style.lineHeight);
  const linePercent = authored?.lineHeight.endsWith("%")
    ? Number.parseFloat(authored.lineHeight)
    : NaN;
  const spacingEm =
    authored?.letterSpacing.endsWith("em") && !authored.letterSpacing.endsWith("rem")
      ? Number.parseFloat(authored.letterSpacing)
      : NaN;
  return {
    family: style.fontFamily,
    size: Number.parseFloat(style.fontSize) || 16,
    weight: Number.parseInt(style.fontWeight, 10) || 400,
    ...(Number.isFinite(linePercent)
      ? { lineHeight: linePercent, lineHeightUnit: "percent" as const }
      : Number.isFinite(fixedLine)
        ? { lineHeight: fixedLine }
        : {}),
    letterSpacing: Number.isFinite(spacingEm)
      ? spacingEm * 100
      : Number.parseFloat(style.letterSpacing) || 0,
    ...(Number.isFinite(spacingEm) ? { letterSpacingUnit: "percent" as const } : {}),
    ...designTextAppearance(style),
    ...(style.fontFeatureSettings && style.fontFeatureSettings !== "normal"
      ? { fontFeatureSettings: style.fontFeatureSettings }
      : {}),
    ...(style.fontVariationSettings && style.fontVariationSettings !== "normal"
      ? { fontVariationSettings: style.fontVariationSettings }
      : {}),
    color: style.color,
    ...(Number.isFinite(Number.parseFloat(style.textIndent))
      ? { indent: Number.parseFloat(style.textIndent) }
      : {}),
    ...(style.textOverflow === "ellipsis" || style.textOverflow === "clip"
      ? { truncation: style.textOverflow }
      : {}),
  };
}

export function designTextAppearance(style: {
  fontStyle?: string | undefined;
  textDecorationLine?: string | undefined;
  fontVariantCaps?: string | undefined;
  textTransform?: string | undefined;
  textWrapStyle?: string | undefined;
  textAlign?: string | undefined;
  textIndent?: number | string | undefined;
  textOverflow?: string | undefined;
  maxLines?: number | undefined;
}): Pick<
  DesignTypography,
  | "fontStyle"
  | "decoration"
  | "letterCase"
  | "wrap"
  | "align"
  | "indent"
  | "truncation"
  | "maxLines"
> {
  const textWrapStyle = style.textWrapStyle;
  const decoration = ["underline", "line-through"]
    .filter((value) => (style.textDecorationLine ?? "").includes(value))
    .join(" ") as DesignTypography["decoration"];
  return {
    fontStyle: (style.fontStyle ?? "").startsWith("oblique")
      ? "oblique"
      : style.fontStyle === "italic"
        ? "italic"
        : "normal",
    ...(decoration ? { decoration } : {}),
    ...(style.fontVariantCaps === "small-caps"
      ? { letterCase: "small-caps" as const }
      : ["none", "uppercase", "lowercase", "capitalize"].includes(style.textTransform ?? "")
        ? { letterCase: style.textTransform as DesignTypography["letterCase"] }
        : {}),
    ...(["auto", "balance", "pretty"].includes(textWrapStyle ?? "")
      ? { wrap: textWrapStyle as DesignTypography["wrap"] }
      : {}),
    ...(["left", "center", "right", "justify"].includes(style.textAlign ?? "")
      ? { align: style.textAlign as DesignTypography["align"] }
      : {}),
    ...(style.textIndent !== undefined
      ? {
          indent:
            typeof style.textIndent === "number"
              ? style.textIndent
              : Number.parseFloat(style.textIndent),
        }
      : {}),
    ...(style.textOverflow === "ellipsis" || style.textOverflow === "clip"
      ? { truncation: style.textOverflow }
      : {}),
    ...(style.maxLines !== undefined && style.maxLines > 0 ? { maxLines: style.maxLines } : {}),
  };
}
