import { DesignAssetPayload } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import {
  contentAddressedDesignAssetId,
  readDesignAsset,
  saveDesignAssets,
} from "./designAssetStore";
import { DesignDocument } from "./designDocument";

const DesignFile = Schema.Struct({
  kind: Schema.Literal("t3-design-file"),
  version: Schema.Literal(1),
  document: DesignDocument,
  assetPayloads: Schema.Array(DesignAssetPayload),
});
const decodeDesignFile = Schema.decodeSync(Schema.fromJsonString(DesignFile));

export async function serializeDesignFile(document: DesignDocument): Promise<string> {
  return JSON.stringify({
    kind: "t3-design-file",
    version: 1,
    document,
    assetPayloads: await packageDesignAssets(document),
  });
}

export async function deserializeDesignFile(contents: string): Promise<DesignDocument> {
  const file = decodeDesignFile(contents);
  const included = new Set(file.assetPayloads.map((asset) => asset.assetId));
  if (file.document.assets.some((asset) => !included.has(asset.assetId)))
    throw new Error(
      "This file is missing an image. Export the complete Design file from the original device.",
    );
  return restoreDesignPackageAssets(file.document, file.assetPayloads);
}

export async function packageDesignAssets(
  document: DesignDocument,
): Promise<readonly DesignAssetPayload[]> {
  const payloads: DesignAssetPayload[] = [];
  for (const asset of document.assets) {
    const blob = await readDesignAsset(asset.assetId);
    if (!blob)
      throw new Error(
        `The local image “${asset.name}” is missing. Replace it before copying the package.`,
      );
    if (blob.size > 8 * 1024 * 1024)
      throw new Error(`The image “${asset.name}” exceeds the 8 MB package limit.`);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    payloads.push({ assetId: asset.assetId, mimeType: asset.mimeType, base64: btoa(binary) });
  }
  return payloads;
}

export async function restoreDesignPackageAssets(
  document: DesignDocument,
  payloads: readonly DesignAssetPayload[],
): Promise<DesignDocument> {
  const ids = new Map<string, string>();
  const assets: { assetId: string; file: Blob }[] = [];
  for (const payload of payloads) {
    const bytes = Uint8Array.from(atob(payload.base64), (character) => character.charCodeAt(0));
    const blob = new Blob([bytes], { type: payload.mimeType });
    const id = await contentAddressedDesignAssetId(blob);
    if (payload.assetId.startsWith("sha256-") && payload.assetId !== id)
      throw new Error("An image in the package does not match its content hash.");
    assets.push({ assetId: id, file: blob });
    ids.set(payload.assetId, id);
  }
  const required = new Set([
    ...document.assets.map((asset) => asset.assetId),
    ...document.nodes.flatMap((node) => node.assetId ?? []),
  ]);
  for (const assetId of required) {
    if (!ids.has(assetId) && !(await readDesignAsset(assetId)))
      throw new Error("The Design package is missing an image. Local edits have been preserved.");
  }
  await saveDesignAssets(assets);
  return {
    ...document,
    assets: document.assets.map((asset) => ({
      ...asset,
      assetId: ids.get(asset.assetId) ?? asset.assetId,
    })),
    nodes: document.nodes.map((node) =>
      node.assetId && ids.has(node.assetId) ? { ...node, assetId: ids.get(node.assetId)! } : node,
    ),
  };
}
