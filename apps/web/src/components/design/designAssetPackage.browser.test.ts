import { expect, it, vi } from "vite-plus/test";
import {
  packageDesignAssets,
  restoreDesignPackageAssets,
  serializeDesignFile,
  deserializeDesignFile,
} from "./designAssetPackage";
import {
  contentAddressedDesignAssetId,
  readDesignAsset,
  saveDesignAsset,
} from "./designAssetStore";
import {
  addAssetMeta,
  addImageNode,
  createInitialDesignDocument,
  reparentDesignNode,
} from "./designDocument";
import {
  copyDesignSelection,
  portableDesignSelection,
  readDesignSelection,
} from "./designClipboard";
import { resetDesignStorage } from "../../../test/designStorage";
import { stubGlobal } from "../../../test/render";

it("packages selection image bytes and rejects a corrupted content hash", async () => {
  await resetDesignStorage();
  const blob = new Blob([new Uint8Array([10, 20, 30, 40])], { type: "image/png" });
  const assetId = await contentAddressedDesignAssetId(blob);
  using _crypto = stubGlobal("crypto", undefined);
  expect(await contentAddressedDesignAssetId(blob)).toBe(assetId);
  await saveDesignAsset(assetId, blob);
  const document = addAssetMeta(addImageNode(createInitialDesignDocument(), assetId), {
    assetId,
    name: "Package image",
    mimeType: "image/png",
    size: blob.size,
    createdAt: "2026-11-09T00:00:00Z",
  });
  const selection = readDesignSelection(
    await portableDesignSelection(copyDesignSelection(document, ["frame-home"])!),
  )!;
  expect(selection.assetPayloads).toHaveLength(1);
  expect(selection.assetPayloads?.[0]?.base64).toBe("ChQeKA==");
  const restored = await restoreDesignPackageAssets(selection.document, selection.assetPayloads!);
  expect(restored.nodes.at(-1)?.assetId).toBe(assetId);
  expect(await (await readDesignAsset(assetId))?.arrayBuffer()).toEqual(await blob.arrayBuffer());
  const nested = reparentDesignNode(document, document.nodes.at(-1)!.nodeId, "frame-home");
  const file = await serializeDesignFile(nested);
  const imported = await deserializeDesignFile(file);
  expect(imported).toEqual(nested);
  expect(imported.nodes.find((node) => node.nodeId === "frame-home")?.childIds).toContain(
    document.nodes.at(-1)!.nodeId,
  );
  await expect(
    deserializeDesignFile(JSON.stringify({ ...JSON.parse(file), assetPayloads: [] })),
  ).rejects.toThrow("missing an image");
  const prefix = new Blob(["Uncommitted package prefix"], { type: "image/png" });
  const prefixId = await contentAddressedDesignAssetId(prefix);
  const missing = {
    ...document,
    assets: document.assets.map((asset) => ({ ...asset, assetId: "missing-server-image" })),
    nodes: document.nodes.map((node) =>
      node.assetId ? { ...node, assetId: "missing-server-image" } : node,
    ),
  };
  await expect(
    restoreDesignPackageAssets(missing, [
      { assetId: prefixId, mimeType: prefix.type, base64: btoa(await prefix.text()) },
    ]),
  ).rejects.toThrow("missing");
  expect(await readDesignAsset(prefixId)).toBeNull();
  await expect(
    restoreDesignPackageAssets(selection.document, [
      { assetId: prefixId, mimeType: prefix.type, base64: btoa(await prefix.text()) },
      { ...selection.assetPayloads![0]!, base64: "AAAAAA==" },
    ]),
  ).rejects.toThrow("content hash");
  expect(await readDesignAsset(prefixId)).toBeNull();
  await expect(
    packageDesignAssets({
      ...document,
      assets: [{ ...document.assets[0]!, assetId: "missing-package-image" }],
    }),
  ).rejects.toThrow("missing");
});

it("closes the asset store after quota failures and allows a later save", async () => {
  await resetDesignStorage();
  const blob = new Blob(["quota recovery"], { type: "image/png" });
  const id = await contentAddressedDesignAssetId(blob);
  using close = vi.spyOn(IDBDatabase.prototype, "close");
  using put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
    throw new DOMException("Disk full", "QuotaExceededError");
  });
  await expect(saveDesignAsset(id, blob)).rejects.toThrow("Disk full");
  expect(close).toHaveBeenCalledOnce();
  put.mockRestore();
  await saveDesignAsset(id, blob);
  expect(await (await readDesignAsset(id))?.text()).toBe("quota recovery");
  const first = new Blob(["Atomic bundle first"], { type: "image/png" });
  const second = new Blob(["Atomic bundle second"], { type: "image/png" });
  const firstId = await contentAddressedDesignAssetId(first),
    secondId = await contentAddressedDesignAssetId(second);
  const nativePut = IDBObjectStore.prototype.put;
  using _batchPut = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
    this: IDBObjectStore,
    value,
    key,
  ) {
    if (key === secondId)
      throw new DOMException("Second image quota failure", "QuotaExceededError");
    return nativePut.call(this, value, key);
  });
  await expect(
    restoreDesignPackageAssets(createInitialDesignDocument(), [
      { assetId: firstId, mimeType: first.type, base64: btoa(await first.text()) },
      { assetId: secondId, mimeType: second.type, base64: btoa(await second.text()) },
    ]),
  ).rejects.toThrow("Second image quota failure");
  expect(await readDesignAsset(firstId)).toBeNull();
  expect(await readDesignAsset(secondId)).toBeNull();
  expect(await (await readDesignAsset(id))?.text()).toBe("quota recovery");
});
