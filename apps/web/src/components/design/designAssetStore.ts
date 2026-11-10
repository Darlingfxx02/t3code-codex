import { sha256 } from "@noble/hashes/sha2";

const DATABASE_NAME = "t3code-design-assets";
const STORE_NAME = "assets";

export async function contentAddressedDesignAssetId(file: Blob): Promise<string> {
  if (typeof crypto === "undefined" || crypto.subtle === undefined) {
    return `sha256-${Array.from(sha256(new Uint8Array(await file.arrayBuffer())), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256-${hash}`;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open Design asset store."));
  });
}

export async function saveDesignAsset(assetId: string, file: Blob): Promise<void> {
  return saveDesignAssets([{ assetId, file }]);
}

export async function saveDesignAssets(
  assets: readonly { assetId: string; file: Blob }[],
): Promise<void> {
  if (!assets.length) return;
  const database = await openDatabase();
  if (!database) throw new Error("Local image storage is unavailable in this browser.");
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not save Design assets."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Image saving was cancelled."));
      try {
        const store = transaction.objectStore(STORE_NAME);
        for (const asset of assets) store.put(asset.file, asset.assetId);
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    });
  } finally {
    database.close();
  }
}

export async function readDesignAsset(assetId: string): Promise<Blob | null> {
  const database = await openDatabase();
  if (!database) return null;
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const request = database
        .transaction(STORE_NAME, "readonly")
        .objectStore(STORE_NAME)
        .get(assetId);
      request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("Could not read Design asset."));
    });
  } finally {
    database.close();
  }
}
