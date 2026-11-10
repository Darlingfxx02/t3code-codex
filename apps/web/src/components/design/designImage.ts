import type { CSSProperties } from "react";
import type { DesignAssetMeta, DesignNode, DesignDocument } from "./designDocument";
import {
  contentAddressedDesignAssetId,
  saveDesignAsset,
  saveDesignAssets,
} from "./designAssetStore";

export async function materializeDesignDocumentImages(
  document: DesignDocument,
  signal?: AbortSignal,
): Promise<DesignDocument> {
  const assets = new Map(document.assets.map((asset) => [asset.assetId, asset]));
  const pending = new Map<string, Blob>();
  const nodes: DesignNode[] = [];
  for (const node of document.nodes) {
    if (node.kind !== "image" || node.assetId) {
      nodes.push(node);
      continue;
    }
    if (!node.sourceUrl) throw new Error(`The image “${node.name}” has no source.`);
    const response = await fetch(node.sourceUrl, {
      credentials: "omit",
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) throw new Error(`Could not download the image “${node.name}”.`);
    const blob = await response.blob();
    if (blob.size > 8 * 1024 * 1024)
      throw new Error(`The image “${node.name}” exceeds the 8 MB package limit.`);
    const dimensions = await readImageDimensions(blob);
    const assetId = await contentAddressedDesignAssetId(blob);
    assets.set(assetId, {
      assetId,
      name: node.name,
      mimeType: blob.type,
      size: blob.size,
      createdAt: new Date().toISOString(),
      ...dimensions,
    });
    pending.set(assetId, blob);
    nodes.push({ ...node, assetId });
  }
  signal?.throwIfAborted();
  await saveDesignAssets([...pending].map(([assetId, file]) => ({ assetId, file })));
  return { ...document, nodes, assets: [...assets.values()] };
}

export type DesignImagePlacement = {
  readonly assetId: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
};

export type DesignImageTarget = {
  readonly worldX: number;
  readonly worldY: number;
  readonly pageId: string;
  readonly parentId: string | null;
};

type Point = { readonly x: number; readonly y: number };

export async function readImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const source = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = source;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error("Image dimensions are unavailable.");
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(source);
  }
}

export async function prepareDesignImage(file: File): Promise<DesignAssetMeta> {
  const dimensions = await readImageDimensions(file);
  const assetId = await contentAddressedDesignAssetId(file);
  await saveDesignAsset(assetId, file);
  return {
    assetId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    createdAt: new Date(file.lastModified).toISOString(),
    ...dimensions,
  };
}

export function imagePlacementBox(
  image: Pick<DesignImagePlacement, "width" | "height">,
  start: Point,
  end: Point,
  zoom: number,
  freeResize = false,
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.hypot(dx, dy) * zoom < 3) return { ...start, width: image.width, height: image.height };
  const scale = Math.max(Math.abs(dx) / image.width, Math.abs(dy) / image.height);
  const width = Math.max(1, freeResize ? Math.abs(dx) : image.width * scale);
  const height = Math.max(1, freeResize ? Math.abs(dy) : image.height * scale);
  return {
    x: dx < 0 ? start.x - width : start.x,
    y: dy < 0 ? start.y - height : start.y,
    width,
    height,
  };
}

export function designImageStyle(
  node: DesignNode,
  source: string,
  asset?: DesignAssetMeta,
): CSSProperties & Readonly<Record<string, string | number>> {
  const mode = node.image?.mode ?? "fill";
  const scale = Math.max(mode === "crop" ? 1 : 0.01, Math.min(100, node.image?.scale ?? 1));
  if (mode === "tile")
    return {
      width: "100%",
      height: "100%",
      backgroundImage: `url(${JSON.stringify(source)})`,
      backgroundRepeat: "repeat",
      backgroundSize: `${(asset?.width ?? node.width) * scale}px ${(asset?.height ?? node.height) * scale}px`,
    };
  return {
    width: "100%",
    height: "100%",
    objectFit: mode === "fit" ? "contain" : "cover",
    objectPosition: "center",
    ...(mode === "crop"
      ? {
          transform: `translate(${node.image?.offsetX ?? 0}%, ${node.image?.offsetY ?? 0}%) scale(${scale})`,
          transformOrigin: "center",
        }
      : {}),
  };
}

export function designImageBorderStyle(
  node: DesignNode,
): CSSProperties & Readonly<Record<string, string | number>> {
  return {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    border: `${node.paint?.borderWidth ?? (node.border ? 1 : 0)}px solid ${node.paint?.borderColor ?? node.border ?? "transparent"}`,
    borderRadius: node.paint?.radius ?? 0,
  };
}
