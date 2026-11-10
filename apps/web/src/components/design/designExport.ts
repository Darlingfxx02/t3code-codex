import {
  designEffectRegion,
  type DesignDocument,
  type DesignNode,
  type DesignAssetMeta,
  type DesignFill,
} from "./designDocument";
import { designPageGeometry } from "./designVisibility";
import { designWorldMatrix } from "./designGeometry";
import { designEffectFilterId, designEffectsSvg } from "./designEffects";
import { designExportStyle, designExportCss } from "./designExportStyle";
import { readDesignAsset } from "./designAssetStore";
import { designImageStyle, designImageBorderStyle } from "./designImage";
import { packageDesignAssets } from "./designAssetPackage";
import { designGradientSvgRotation, designPaintFillLayers, designPaintStroke } from "./designPaint";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function gradientColorAt(
  stops: readonly { color: string; position: number }[],
  position: number,
): string {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const next = sorted.find((stop) => stop.position >= position);
  const previous = [...sorted].reverse().find((stop) => stop.position <= position);
  if (!previous) return next?.color ?? "transparent";
  if (!next || next.position === previous.position) return previous.color;
  const from = /^#([\da-f]{3}|[\da-f]{6})$/iu.exec(previous.color.trim());
  const to = /^#([\da-f]{3}|[\da-f]{6})$/iu.exec(next.color.trim());
  if (!from || !to) return previous.color;
  const expand = (value: string) =>
    value.length === 3 ? value.split("").map((part) => `${part}${part}`) : value.match(/../gu)!;
  const fromRgb = expand(from[1]!).map((part) => Number.parseInt(part, 16));
  const toRgb = expand(to[1]!).map((part) => Number.parseInt(part, 16));
  const ratio = (position - previous.position) / (next.position - previous.position);
  const channels = fromRgb.map((channel, index) =>
    Math.round(channel + (toRgb[index]! - channel) * ratio),
  );
  return `rgb(${channels.join(" ")})`;
}

function nativeComplexGradientMarkup(
  node: DesignNode,
  path: string,
  width: number,
  height: number,
  fill: DesignFill,
  index: number,
): string {
  if (!fill.stops?.length)
    return `<path d="${escapeHtml(path)}" fill="${escapeHtml(fill.color)}" />`;
  const clipId = `design-slice-clip-${node.nodeId}-${index}`;
  const clip = `<clipPath id="${escapeHtml(clipId)}"><path d="${escapeHtml(path)}" /></clipPath>`;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.max(width, height) * 2 + 1;
  const stopCount = Math.max(24, fill.stops.length * 16);
  if (fill.kind === "angular-gradient") {
    const start = ((fill.angle ?? 0) - 90) * (Math.PI / 180);
    const wedges = Array.from({ length: stopCount }, (_, segment) => {
      const a0 = start + (segment / stopCount) * Math.PI * 2;
      const a1 = start + ((segment + 1) / stopCount) * Math.PI * 2;
      const color = gradientColorAt(fill.stops!, (segment + 0.5) / stopCount);
      return `<polygon points="${centerX},${centerY} ${centerX + Math.cos(a0) * radius},${centerY + Math.sin(a0) * radius} ${centerX + Math.cos(a1) * radius},${centerY + Math.sin(a1) * radius}" fill="${escapeHtml(color)}" fill-opacity="${fill.opacity ?? 1}" />`;
    }).join("");
    return `${clip}<g clip-path="url(#${escapeHtml(clipId)})">${wedges}</g>`;
  }
  const rings = Array.from({ length: stopCount }, (_, segment) => {
    const outer = 1 - segment / stopCount;
    const inner = 1 - (segment + 1) / stopCount;
    const outerPoints = `${centerX},${centerY - radius * outer} ${centerX + radius * outer},${centerY} ${centerX},${centerY + radius * outer} ${centerX - radius * outer},${centerY}`;
    const innerPoints = `${centerX},${centerY - radius * inner} ${centerX - radius * inner},${centerY} ${centerX},${centerY + radius * inner} ${centerX + radius * inner},${centerY}`;
    const color = gradientColorAt(fill.stops!, (segment + 0.5) / stopCount);
    return `<path d="M ${outerPoints} Z M ${innerPoints} Z" fill="${escapeHtml(color)}" fill-opacity="${fill.opacity ?? 1}" fill-rule="evenodd" />`;
  }).join("");
  return `${clip}<g clip-path="url(#${escapeHtml(clipId)})">${rings}</g>`;
}

function missingAssetPlaceholder(assetId: string | null): string {
  const text = assetId ? `Missing asset ${assetId}` : "Missing asset";
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="96"><rect width="100%" height="100%" fill="#e5e7eb"/><text x="8" y="52" font-size="12" fill="#6b7280">${text}</text></svg>`)}`;
}

function exportBounds(document: DesignDocument) {
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const boxes = [...designPageGeometry(document, nodes).entries()].flatMap(([nodeId, entry]) =>
    entry.bounds && !nodes.get(nodeId)?.slice ? [entry.bounds] : [],
  );
  const x = Math.min(0, ...boxes.map((box) => box.x)),
    y = Math.min(0, ...boxes.map((box) => box.y));
  return {
    x,
    y,
    width: Math.ceil(Math.max(1, ...boxes.map((box) => box.x + box.width)) - x),
    height: Math.ceil(Math.max(1, ...boxes.map((box) => box.y + box.height)) - y),
  };
}

function exportSlices(document: DesignDocument, nodes: ReadonlyMap<string, DesignNode>) {
  const geometry = designPageGeometry(document, nodes);
  return document.nodes
    .filter((node) => node.slice)
    .map((node) => {
      const bounds = geometry.get(node.nodeId)?.bounds;
      return {
        nodeId: node.nodeId,
        name: node.name,
        x: bounds?.x ?? node.x,
        y: bounds?.y ?? node.y,
        width: bounds?.width ?? node.width,
        height: bounds?.height ?? node.height,
      };
    });
}

function htmlVector(node: DesignNode): string {
  if (!node.vector) return "";
  const stroke = designPaintStroke(node);
  const fillLayers = designPaintFillLayers(node);
  const gradientDefs = fillLayers
    .map((fill, index) =>
      (fill.kind === "linear-gradient" || fill.kind === "radial-gradient") && fill.stops?.length
        ? fill.kind === "radial-gradient"
          ? `<radialGradient id="design-gradient-${escapeHtml(node.nodeId)}-${index}" cx=".5" cy=".5" r=".5">${fill.stops.map((stop) => `<stop offset="${stop.position}" stop-color="${escapeHtml(stop.color)}"${fill.opacity === undefined ? "" : ` stop-opacity="${fill.opacity}"`} />`).join("")}</radialGradient>`
          : `<linearGradient id="design-gradient-${escapeHtml(node.nodeId)}-${index}" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(${designGradientSvgRotation(fill.angle)} .5 .5)">${fill.stops.map((stop) => `<stop offset="${stop.position}" stop-color="${escapeHtml(stop.color)}"${fill.opacity === undefined ? "" : ` stop-opacity="${fill.opacity}"`} />`).join("")}</linearGradient>`
        : "",
    )
    .join("");
  const complexFillMarkup = fillLayers
    .map((fill, index) =>
      fill.kind === "angular-gradient" || fill.kind === "diamond-gradient"
        ? nativeComplexGradientMarkup(
            node,
            node.vector!.path,
            node.vector!.width,
            node.vector!.height,
            fill,
            index,
          )
        : "",
    )
    .join("");
  const fillMarkup = node.vector.closed
    ? fillLayers
        .filter((fill) => fill.kind !== "angular-gradient" && fill.kind !== "diamond-gradient")
        .map(
          (fill, index) =>
            `<path d="${escapeHtml(node.vector!.path)}" fill="${escapeHtml((fill.kind === "linear-gradient" || fill.kind === "radial-gradient") && fill.stops?.length ? `url(#design-gradient-${node.nodeId}-${index})` : fill.color)}"${fill.opacity === undefined || (fill.kind !== "solid" && fill.stops?.length) ? "" : ` fill-opacity="${fill.opacity}"`} fill-rule="${node.vector!.fillRule ?? "nonzero"}" stroke="none" vector-effect="non-scaling-stroke" />`,
        )
        .join("")
    : "";
  const strokes = node.paint?.strokes?.length ? node.paint.strokes : stroke ? [stroke] : [];
  const strokeMarkup = strokes
    .map(
      (item) =>
        `<path d="${escapeHtml(node.vector!.path)}" fill="none" stroke="${escapeHtml(item.color)}" stroke-width="${item.width}"${item.cap ? ` stroke-linecap="${item.cap}"` : ""}${item.join ? ` stroke-linejoin="${item.join}"` : ""}${item.opacity === undefined ? "" : ` stroke-opacity="${item.opacity}"`} vector-effect="non-scaling-stroke" />`,
    )
    .join("");
  return `<svg width="100%" height="100%" viewBox="0 0 ${node.vector.width} ${node.vector.height}" preserveAspectRatio="none" style="overflow:visible">${gradientDefs ? `<defs>${gradientDefs}</defs>` : ""}${complexFillMarkup}${fillMarkup}${strokeMarkup}</svg>`;
}

function htmlText(node: DesignNode): string {
  const text = node.text ?? "";
  if (node.typography?.listStyle === "bulleted" || node.typography?.listStyle === "numbered") {
    const tag = node.typography.listStyle === "numbered" ? "ol" : "ul";
    return `<${tag} style="margin:0;padding-inline-start:1.2em">${text
      .split("\n")
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join("")}</${tag}>`;
  }
  return escapeHtml(text);
}

function nodeMarkup(
  document: DesignDocument,
  node: DesignNode,
  nodes: ReadonlyMap<string, DesignNode>,
  assetSources: ReadonlyMap<string, string>,
  assetMeta: ReadonlyMap<string, DesignAssetMeta>,
  visited = new Set<string>(),
): string {
  if (visited.has(node.nodeId) || node.visible === false || node.slice) return "";
  const nextVisited = new Set(visited);
  nextVisited.add(node.nodeId);
  const children = node.childIds
    .map((childId) => nodes.get(childId))
    .filter((child): child is DesignNode => child !== undefined)
    .map((child) => nodeMarkup(document, child, nodes, assetSources, assetMeta, nextVisited))
    .join("");
  const source =
    node.kind !== "image"
      ? ""
      : node.assetId
        ? (assetSources.get(node.assetId) ??
          (node.sourceUrl?.startsWith("data:")
            ? node.sourceUrl
            : missingAssetPlaceholder(node.assetId)))
        : node.sourceUrl?.startsWith("data:")
          ? node.sourceUrl
          : missingAssetPlaceholder(null);
  const imageStyle =
    node.kind === "image"
      ? escapeHtml(
          designExportCss(designImageStyle(node, source, assetMeta.get(node.assetId ?? ""))),
        )
      : "";
  const image =
    node.image?.mode === "tile"
      ? `<div role="img" aria-label="${escapeHtml(node.name)}" style="${imageStyle}"></div>`
      : `<img src="${escapeHtml(source)}" data-asset-id="${escapeHtml(node.assetId ?? "")}" alt="" style="${imageStyle}" />`;
  const content = node.vector
    ? htmlVector(node) + children
    : node.kind === "image"
      ? `${image}${children}<span aria-hidden="true" style="${escapeHtml(designExportCss(designImageBorderStyle(node)))}"></span>`
      : `${htmlText(node)}${children}`;
  const effectMarkup = node.effects?.some((effect) => effect.visible)
    ? designEffectsSvg(
        node,
        designEffectFilterId(node.nodeId),
        designEffectRegion(document, node.nodeId, nodes),
      )
    : "";
  return `<div data-design-node="${escapeHtml(node.nodeId)}" ${node.effects ? `data-t3-design-effects="${escapeHtml(JSON.stringify(node.effects))}" ` : ""}style="${escapeHtml(designExportCss(designExportStyle(node, nodes)))}">${effectMarkup}${content}</div>`;
}

export function exportDesignHtml(
  document: DesignDocument,
  assetSources: ReadonlyMap<string, string> = new Map(),
): string {
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const assetMeta = new Map(document.assets.map((asset) => [asset.assetId, asset]));
  const page = document.pages.find(({ pageId }) => pageId === document.activePageId);
  const roots = (page?.nodeIds ?? document.nodes.map(({ nodeId }) => nodeId))
    .map((nodeId) => nodes.get(nodeId))
    .filter((node): node is DesignNode => node !== undefined)
    .map((node) => nodeMarkup(document, node, nodes, assetSources, assetMeta))
    .join("");
  const box = exportBounds(document);
  const slices = exportSlices(document, nodes);
  return `<div data-design-document="${escapeHtml(document.documentId)}" data-design-slices="${escapeHtml(JSON.stringify(slices))}" style="position:relative;overflow:hidden;width:${box.width}px;height:${box.height}px;background:${escapeHtml(page?.background ?? "transparent")}"><div style="position:absolute;left:${-box.x}px;top:${-box.y}px;width:${box.width}px;height:${box.height}px">${roots}</div></div>`;
}

export function exportDesignSliceHtml(
  document: DesignDocument,
  sliceId: string,
  assetSources: ReadonlyMap<string, string> = new Map(),
): string {
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const slice = nodes.get(sliceId);
  if (!slice?.slice) throw new Error("Choose a slice layer before exporting it.");
  const geometry = designPageGeometry(document, nodes);
  const bounds = geometry.get(sliceId)?.bounds ?? {
    x: slice.x,
    y: slice.y,
    width: slice.width,
    height: slice.height,
  };
  const sliceBounds = {
    x: Number.isFinite(bounds.x) ? bounds.x : slice.x,
    y: Number.isFinite(bounds.y) ? bounds.y : slice.y,
    width: Number.isFinite(bounds.width) ? bounds.width : slice.width,
    height: Number.isFinite(bounds.height) ? bounds.height : slice.height,
  };
  const box = exportBounds(document);
  const sourceDocument = {
    ...document,
    nodes: document.nodes.map((node) =>
      node.nodeId === sliceId ? { ...node, slice: false } : node,
    ),
  };
  const source = exportDesignHtml(sourceDocument, assetSources);
  return `<div data-design-slice="${escapeHtml(sliceId)}" style="position:relative;overflow:hidden;width:${sliceBounds.width}px;height:${sliceBounds.height}px"><div style="position:absolute;left:${box.x - sliceBounds.x}px;top:${box.y - sliceBounds.y}px">${source}</div></div>`;
}

export function exportDesignSliceSvg(
  document: DesignDocument,
  sliceId: string,
  assetSources: ReadonlyMap<string, string> = new Map(),
): string {
  const originalNodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const slice = originalNodes.get(sliceId);
  if (!slice?.slice) throw new Error("Choose a slice layer before exporting it.");
  const sourceDocument = {
    ...document,
    nodes: document.nodes.map((node) =>
      node.nodeId === sliceId ? { ...node, slice: false } : node,
    ),
  };
  const nodes = new Map(sourceDocument.nodes.map((node) => [node.nodeId, node]));
  const geometry = designPageGeometry(document, nodes);
  const bounds = geometry.get(sliceId)?.bounds ?? {
    x: slice.x,
    y: slice.y,
    width: slice.width,
    height: slice.height,
  };
  const sliceBounds = {
    x: Number.isFinite(bounds.x) ? bounds.x : slice.x,
    y: Number.isFinite(bounds.y) ? bounds.y : slice.y,
    width: Number.isFinite(bounds.width) ? bounds.width : slice.width,
    height: Number.isFinite(bounds.height) ? bounds.height : slice.height,
  };
  const page = document.pages.find(({ pageId }) => pageId === document.activePageId);
  const defs: string[] = [];
  const children = (node: DesignNode): string =>
    node.childIds
      .map((childId) => nodes.get(childId))
      .filter((child): child is DesignNode => child !== undefined)
      .map((child) => renderNode(child))
      .join("");
  const renderNode = (node: DesignNode): string => {
    if (node.visible === false || node.slice) return "";
    const world = designWorldMatrix(nodes, node.nodeId);
    const transform = `matrix(${world[0]} ${world[1]} ${world[2]} ${world[3]} ${world[4] - sliceBounds.x} ${world[5] - sliceBounds.y})`;
    const fills = designPaintFillLayers(node);
    const fill = fills[0]?.color ?? "transparent";
    const complexFills = fills.filter(
      (paint) =>
        (paint.kind === "angular-gradient" || paint.kind === "diamond-gradient") &&
        paint.stops?.length,
    );
    const fillValue = (paint: (typeof fills)[number], index: number) => {
      if (
        (paint.kind === "linear-gradient" || paint.kind === "radial-gradient") &&
        paint.stops?.length
      ) {
        const id = `design-slice-gradient-${node.nodeId}-${index}`;
        defs.push(
          paint.kind === "radial-gradient"
            ? `<radialGradient id="${escapeHtml(id)}" cx=".5" cy=".5" r=".5">${paint.stops.map((stop) => `<stop offset="${stop.position}" stop-color="${escapeHtml(stop.color)}"${paint.opacity === undefined ? "" : ` stop-opacity="${paint.opacity}"`} />`).join("")}</radialGradient>`
            : `<linearGradient id="${escapeHtml(id)}" x1="0" y1="0" x2="1" y2="0" gradientTransform="rotate(${designGradientSvgRotation(paint.angle)} .5 .5)">${paint.stops.map((stop) => `<stop offset="${stop.position}" stop-color="${escapeHtml(stop.color)}"${paint.opacity === undefined ? "" : ` stop-opacity="${paint.opacity}"`} />`).join("")}</linearGradient>`,
        );
        return `url(#${id})`;
      }
      return paint.color;
    };
    const shape = node.vector
      ? fills
          .filter((paint) => !complexFills.includes(paint))
          .map(
            (paint, index) =>
              `<path d="${escapeHtml(node.vector!.path)}" fill="${escapeHtml(fillValue(paint, index))}" fill-opacity="${paint.opacity ?? 1}" fill-rule="${node.vector!.fillRule ?? "nonzero"}" />`,
          )
          .join("") +
        (node.paint?.strokes ?? (designPaintStroke(node) ? [designPaintStroke(node)!] : []))
          .map(
            (paint) =>
              `<path d="${escapeHtml(node.vector!.path)}" fill="none" stroke="${escapeHtml(paint.color)}" stroke-width="${paint.width}" stroke-opacity="${paint.opacity ?? 1}"${paint.cap ? ` stroke-linecap="${paint.cap}"` : ""}${paint.join ? ` stroke-linejoin="${paint.join}"` : ""} />`,
          )
          .join("")
      : node.kind === "text"
        ? `<text x="${node.typography?.align === "center" ? node.width / 2 : node.typography?.align === "right" ? node.width : 0}" y="${node.typography?.size ?? node.fontSize ?? 16}" text-anchor="${node.typography?.align === "center" ? "middle" : node.typography?.align === "right" ? "end" : "start"}" dominant-baseline="${node.typography?.verticalAlign === "middle" ? "middle" : node.typography?.verticalAlign === "bottom" ? "ideographic" : "hanging"}" fill="${escapeHtml(node.typography?.color ?? node.fill ?? "currentColor")}" font-family="${escapeHtml(node.typography?.family ?? "system-ui")}" font-size="${node.typography?.size ?? node.fontSize ?? 16}" font-weight="${node.typography?.weight ?? node.fontWeight ?? 400}" font-style="${escapeHtml(node.typography?.fontStyle ?? "normal")}"${node.typography?.letterSpacing === undefined ? "" : ` letter-spacing="${node.typography.letterSpacing}${node.typography.letterSpacingUnit === "percent" ? "%" : "px"}"`}${node.typography?.decoration ? ` text-decoration="${escapeHtml(node.typography.decoration)}"` : ""}>${escapeHtml(node.text ?? "")}</text>`
        : node.kind === "image"
          ? node.assetId && assetSources.get(node.assetId)
            ? `<image href="${escapeHtml(assetSources.get(node.assetId)!)}" width="${node.width}" height="${node.height}" preserveAspectRatio="none" />`
            : node.sourceUrl?.startsWith("data:")
              ? `<image href="${escapeHtml(node.sourceUrl)}" width="${node.width}" height="${node.height}" preserveAspectRatio="none" />`
              : `<rect width="${node.width}" height="${node.height}" fill="${escapeHtml(fill)}" />`
          : fills
              .filter((paint) => !complexFills.includes(paint))
              .map(
                (paint, index) =>
                  `<rect width="${node.width}" height="${node.height}" rx="${node.paint?.radius ?? 0}" fill="${escapeHtml(fillValue(paint, index))}" fill-opacity="${paint.opacity ?? 1}" />`,
              )
              .join("");
    const complexMarkup = complexFills
      .map((paint, index) =>
        nativeComplexGradientMarkup(
          node,
          node.vector?.path ?? `M 0 0 H ${node.width} V ${node.height} H 0 Z`,
          node.vector?.width ?? node.width,
          node.vector?.height ?? node.height,
          paint,
          index,
        ),
      )
      .join("");
    const blend =
      node.paint?.blendMode && node.paint.blendMode !== "normal"
        ? ` style="mix-blend-mode:${node.paint.blendMode}"`
        : "";
    const effectId = designEffectFilterId(node.nodeId);
    const effectMarkup = node.effects?.some((effect) => effect.visible)
      ? designEffectsSvg(node, effectId, {
          x: 0,
          y: 0,
          width: node.width,
          height: node.height,
        })
      : "";
    const filter = effectMarkup ? ` filter="url(#${escapeHtml(effectId)})"` : "";
    const filterMatch = effectMarkup.match(/<filter\b[\s\S]*?<\/filter>/u)?.[0];
    if (filterMatch) defs.push(filterMatch);
    return `<g transform="${transform}" opacity="${node.opacity}"${blend}${filter}>${complexMarkup}${shape}${children(node)}</g>`;
  };
  const roots = (
    page?.nodeIds ??
    document.nodes.filter((node) => node.parentId === null).map((node) => node.nodeId)
  )
    .map((nodeId) => nodes.get(nodeId))
    .filter((node): node is DesignNode => node !== undefined)
    .map((node) => renderNode(node))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sliceBounds.width}" height="${sliceBounds.height}" viewBox="0 0 ${sliceBounds.width} ${sliceBounds.height}">${defs.length ? `<defs>${defs.join("")}</defs>` : ""}<clipPath id="design-slice-clip"><rect width="${sliceBounds.width}" height="${sliceBounds.height}" /></clipPath><g clip-path="url(#design-slice-clip)">${roots}</g></svg>`;
}

function reactNode(
  document: DesignDocument,
  node: DesignNode,
  nodes: ReadonlyMap<string, DesignNode>,
  indent: string,
  assetSources: ReadonlyMap<string, string>,
  assetMeta: ReadonlyMap<string, DesignAssetMeta>,
  visited = new Set<string>(),
): string {
  if (visited.has(node.nodeId) || node.visible === false || node.slice) return "";
  const nextVisited = new Set(visited);
  nextVisited.add(node.nodeId);
  const children = node.childIds
    .map((childId) => nodes.get(childId))
    .filter((child): child is DesignNode => child !== undefined)
    .map((child) =>
      reactNode(document, child, nodes, `${indent}  `, assetSources, assetMeta, nextVisited),
    )
    .join("\n");
  const imageSource = node.assetId
    ? (assetSources.get(node.assetId) ??
      (node.sourceUrl?.startsWith("data:") ? node.sourceUrl : ""))
    : node.sourceUrl?.startsWith("data:")
      ? node.sourceUrl
      : "";
  const resolvedImageSource =
    node.kind === "image" ? imageSource || missingAssetPlaceholder(node.assetId) : "";
  const imageStyle = Object.entries(
    designImageStyle(node, resolvedImageSource, assetMeta.get(node.assetId ?? "")),
  )
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");
  const borderStyle = Object.entries(designImageBorderStyle(node))
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");
  const image =
    node.image?.mode === "tile"
      ? `<div role="img" aria-label={${JSON.stringify(node.name)}} style={{ ${imageStyle} }} />`
      : `<img src={${JSON.stringify(resolvedImageSource)}} data-asset-id={${JSON.stringify(node.assetId ?? "")}} alt="" style={{ ${imageStyle} }} />`;
  const vectorStroke = node.vector ? designPaintStroke(node) : null;
  const vectorStrokes = node.vector
    ? node.paint?.strokes?.length
      ? node.paint.strokes
      : vectorStroke
        ? [vectorStroke]
        : []
    : [];
  const vectorStrokeMarkup = node.vector
    ? vectorStrokes
        .map(
          (stroke) =>
            `<path d={${JSON.stringify(node.vector!.path)}} fill="none" stroke={${JSON.stringify(stroke.color)}} strokeWidth={${stroke.width}}${stroke.cap ? ` strokeLinecap={${JSON.stringify(stroke.cap)}}` : ""}${stroke.join ? ` strokeLinejoin={${JSON.stringify(stroke.join)}}` : ""}${stroke.opacity === undefined ? "" : ` strokeOpacity={${stroke.opacity}}`} vectorEffect="non-scaling-stroke" />`,
        )
        .join("")
    : "";
  const vectorFillLayers = node.vector ? designPaintFillLayers(node) : [];
  const vectorComplexFills = vectorFillLayers.filter(
    (fill) =>
      (fill.kind === "angular-gradient" || fill.kind === "diamond-gradient") && fill.stops?.length,
  );
  const vectorGradientMarkup = vectorFillLayers
    .map((fill, index) =>
      (fill.kind === "linear-gradient" || fill.kind === "radial-gradient") && fill.stops?.length
        ? fill.kind === "radial-gradient"
          ? `<radialGradient id={${JSON.stringify(`design-gradient-${node.nodeId}-${index}`)}} cx=".5" cy=".5" r=".5">${fill.stops.map((stop) => `<stop offset={${stop.position}} stopColor={${JSON.stringify(stop.color)}}${fill.opacity === undefined ? "" : ` stopOpacity={${fill.opacity}}`} />`).join("")}</radialGradient>`
          : `<linearGradient id={${JSON.stringify(`design-gradient-${node.nodeId}-${index}`)}} x1="0" y1="0" x2="1" y2="0" gradientTransform={${JSON.stringify(`rotate(${designGradientSvgRotation(fill.angle)} .5 .5)`)}}>${fill.stops.map((stop) => `<stop offset={${stop.position}} stopColor={${JSON.stringify(stop.color)}}${fill.opacity === undefined ? "" : ` stopOpacity={${fill.opacity}}`} />`).join("")}</linearGradient>`
        : "",
    )
    .join("");
  const vectorComplexFillMarkup = vectorFillLayers
    .map((fill, index) =>
      vectorComplexFills.includes(fill)
        ? `<g dangerouslySetInnerHTML={{__html:${JSON.stringify(nativeComplexGradientMarkup(node, node.vector!.path, node.vector!.width, node.vector!.height, fill, index))}}} />`
        : "",
    )
    .join("");
  const vectorFillMarkup = node.vector
    ? node.vector.closed
      ? vectorFillLayers
          .filter((fill) => !vectorComplexFills.includes(fill))
          .map(
            (fill, index) =>
              `<path d={${JSON.stringify(node.vector!.path)}} fill={${JSON.stringify((fill.kind === "linear-gradient" || fill.kind === "radial-gradient") && fill.stops?.length ? `url(#design-gradient-${node.nodeId}-${index})` : fill.color)}}${fill.opacity === undefined || (fill.kind !== "solid" && fill.stops?.length) ? "" : ` fillOpacity={${fill.opacity}}`} fillRule={${JSON.stringify(node.vector!.fillRule ?? "nonzero")}} stroke="none" vectorEffect="non-scaling-stroke" />`,
          )
          .join("")
      : ""
    : "";
  const content = node.vector
    ? `<svg width="100%" height="100%" viewBox={${JSON.stringify(`0 0 ${node.vector.width} ${node.vector.height}`)}} preserveAspectRatio="none" style={{ overflow: "visible" }}>${vectorGradientMarkup ? `<defs>${vectorGradientMarkup}</defs>` : ""}${vectorComplexFillMarkup}${vectorFillMarkup}${vectorStrokeMarkup}</svg>${children}`
    : node.kind === "image"
      ? `${image}${children}<span aria-hidden="true" style={{ ${borderStyle} }} />`
      : node.text
        ? node.typography?.listStyle === "bulleted" || node.typography?.listStyle === "numbered"
          ? `<${node.typography.listStyle === "numbered" ? "ol" : "ul"} style={{ margin: 0, paddingInlineStart: "1.2em" }}>{${JSON.stringify(node.text.split("\n").map((line) => line))}.map((line) => <li key={line}>{line}</li>)}</${node.typography.listStyle === "numbered" ? "ol" : "ul"}>${children}`
          : `{${JSON.stringify(node.text)}}${children}`
        : children.length > 0
          ? `\n${children}\n${indent}`
          : "";
  const style = Object.entries(designExportStyle(node, nodes))
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(", ");
  const effectMarkup = node.effects?.some((effect) => effect.visible)
    ? designEffectsSvg(
        node,
        designEffectFilterId(node.nodeId),
        designEffectRegion(document, node.nodeId, nodes),
      )
    : "";
  const definitions = effectMarkup
    ? `<span aria-hidden="true" data-t3-design-effect-defs="" dangerouslySetInnerHTML={{__html:${JSON.stringify(effectMarkup)}}} />`
    : "";
  return `${indent}<div key={${JSON.stringify(node.nodeId)}} data-design-node={${JSON.stringify(node.nodeId)}} ${node.effects ? `data-t3-design-effects={${JSON.stringify(JSON.stringify(node.effects))}} ` : ""}style={{ ${style} }}>${definitions}${content}</div>`;
}

export function exportDesignReact(
  document: DesignDocument,
  assetSources: ReadonlyMap<string, string> = new Map(),
): string {
  const nodesById = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const assetMeta = new Map(document.assets.map((asset) => [asset.assetId, asset]));
  const page = document.pages.find(({ pageId }) => pageId === document.activePageId);
  const nodes = (page?.nodeIds ?? document.nodes.map(({ nodeId }) => nodeId))
    .map((nodeId) => nodesById.get(nodeId))
    .filter((node): node is DesignNode => node !== undefined)
    .map((node) => reactNode(document, node, nodesById, "      ", assetSources, assetMeta))
    .join("\n");
  const box = exportBounds(document);
  const name = document.title.replace(/[^a-zA-Z0-9]+/gu, "");
  const exportName = /^[A-Za-z]/u.test(name) ? name : `Design${name || "Frame"}`;
  const slices = exportSlices(document, nodesById);
  return `export function ${exportName}() {\n  return (\n    <div data-design-slices={${JSON.stringify(JSON.stringify(slices))}} style={{ position: "relative", width: ${box.width}, height: ${box.height}, overflow: "hidden", background: ${JSON.stringify(page?.background ?? "transparent")} }}>\n      <div style={{ position: "absolute", left: ${-box.x}, top: ${-box.y}, width: ${box.width}, height: ${box.height} }}>\n${nodes}\n      </div>\n    </div>\n  );\n}\n\nexport default ${exportName};`;
}

async function assetSourcesFor(document: DesignDocument): Promise<ReadonlyMap<string, string>> {
  const sources = new Map<string, string>();
  for (const asset of document.assets) {
    const blob = await readDesignAsset(asset.assetId);
    if (blob === null) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    sources.set(asset.assetId, `data:${asset.mimeType};base64,${btoa(binary)}`);
  }
  return sources;
}

export async function exportDesignHtmlPortable(document: DesignDocument): Promise<string> {
  return exportDesignHtml(document, await assetSourcesFor(document));
}

export async function exportDesignReactPortable(document: DesignDocument): Promise<string> {
  return exportDesignReact(document, await assetSourcesFor(document));
}

function patchEnvelope(document: DesignDocument) {
  return {
    kind: "t3-design-patch",
    version: 1,
    documentId: document.documentId,
    baseRevision: Math.max(0, document.revision - document.pendingOperations.length),
    operations: document.pendingOperations.map((operation) => ({
      ...operation,
      payload: operation.nodeId
        ? (document.nodes.find((node) => node.nodeId === operation.nodeId) ?? null)
        : null,
    })),
    snapshot: { ...document, pendingOperations: [], syncState: "synced" },
  };
}

export function exportDesignPatch(document: DesignDocument): string {
  return JSON.stringify(patchEnvelope(document), null, 2);
}

export async function exportDesignPatchPortable(document: DesignDocument): Promise<string> {
  return JSON.stringify(
    {
      ...patchEnvelope(document),
      assetPayloads: await packageDesignAssets(document),
    },
    null,
    2,
  );
}
