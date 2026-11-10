import * as Schema from "effect/Schema";
import { sha256 } from "@noble/hashes/sha2";

import {
  createInitialDesignDocument,
  DESIGN_DOCUMENTS_STORAGE_KEY,
  DesignDocument,
  DesignDocuments,
} from "./designDocument";

export const DESIGN_DATABASE_NAME = "t3code-design-documents";
const RECORDS = "documents";
const META = "metadata";
const decodeDocument = Schema.decodeUnknownSync(DesignDocument);
const decodeLegacy = Schema.decodeSync(Schema.fromJsonString(DesignDocuments));

function storageId() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), (value) =>
    value.toString(16).padStart(8, "0"),
  ).join("-");
}

function localCopy(document: DesignDocument): DesignDocument {
  const pendingOperations = document.pendingOperations.map((operation, index) => ({
    ...operation,
    operationId: `op-${index + 1}`,
    baseRevision: index,
  }));
  return {
    ...document,
    documentId: `design-document-${storageId()}`,
    revision: pendingOperations.length,
    pendingOperations,
    conflicts: [],
    syncState: "local",
  };
}

export type StoredDesignDocument = {
  readonly document: DesignDocument;
  readonly storageVersion: string;
  readonly trashedAt: string | null;
};

export class DesignStorageConflictError extends Error {
  constructor() {
    super(
      "This file changed in another window. Your edits are still here. Save a recovery copy to continue.",
    );
  }
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Local file storage is unavailable in this browser."));
      return;
    }
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(RECORDS);
      request.result.createObjectStore(META);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open local Design files."));
    request.onblocked = () =>
      reject(new Error("Close other Design windows to upgrade local file storage."));
  });
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Local file transaction was cancelled."));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Could not save the local file."));
  });
}

export function createDesignDocumentRepository({
  databaseName = DESIGN_DATABASE_NAME,
  legacyStorage,
}: {
  databaseName?: string;
  legacyStorage?: Pick<Storage, "getItem">;
} = {}) {
  return {
    async load(): Promise<ReadonlyArray<StoredDesignDocument>> {
      const database = await openDatabase(databaseName);
      try {
        // Older windows can still write this key; retain it and recover each new fingerprint once.
        const legacy = (legacyStorage ?? globalThis.localStorage).getItem(
          DESIGN_DOCUMENTS_STORAGE_KEY,
        );
        const fingerprint =
          legacy === null
            ? null
            : Array.from(sha256(new TextEncoder().encode(legacy)), (byte) =>
                byte.toString(16).padStart(2, "0"),
              ).join("");
        const transaction = database.transaction([RECORDS, META], "readwrite", {
          durability: "strict",
        });
        const done = transactionDone(transaction);
        try {
          const records = transaction.objectStore(RECORDS);
          const [rawRecords, initialized, migratedFingerprint] = await Promise.all([
            requestValue(records.getAll() as IDBRequest<StoredDesignDocument[]>),
            requestValue(transaction.objectStore(META).get("initialized")),
            requestValue(transaction.objectStore(META).get("legacyFingerprint")),
          ]);
          const result = rawRecords.map((record) => ({
            document: decodeDocument(record.document),
            storageVersion: record.storageVersion,
            trashedAt: record.trashedAt,
          }));
          if (!initialized || (legacy !== null && migratedFingerprint !== fingerprint)) {
            const documents =
              legacy === null ? [createInitialDesignDocument()] : decodeLegacy(legacy);
            for (const source of documents) {
              const existing = result.find(
                (record) => record.document.documentId === source.documentId,
              );
              if (existing && JSON.stringify(existing.document) === JSON.stringify(source))
                continue;
              const document = existing
                ? localCopy({ ...source, title: `${source.title} (legacy recovery)` })
                : source;
              const record = { document, storageVersion: storageId(), trashedAt: null };
              records.put(record, document.documentId);
              result.push(record);
            }
            transaction.objectStore(META).put(true, "initialized");
            transaction.objectStore(META).put(fingerprint, "legacyFingerprint");
          }
          await done;
          return result.toSorted((a, b) =>
            b.document.updatedAt.localeCompare(a.document.updatedAt),
          );
        } catch (error) {
          // Abort an invalid migration before marking it initialized.
          try {
            transaction.abort();
          } catch {
            /* Already completed or aborted. */
          }
          await done.catch(() => undefined);
          throw error;
        }
      } finally {
        database.close();
      }
    },
    async write(
      document: DesignDocument,
      expectedVersion: string | null,
      trashedAt: string | null = null,
    ): Promise<StoredDesignDocument> {
      const database = await openDatabase(databaseName);
      try {
        const transaction = database.transaction(RECORDS, "readwrite", { durability: "strict" });
        const done = transactionDone(transaction);
        const store = transaction.objectStore(RECORDS);
        try {
          const current = await requestValue(
            store.get(document.documentId) as IDBRequest<StoredDesignDocument | undefined>,
          );
          if ((current?.storageVersion ?? null) !== expectedVersion) {
            transaction.abort();
            throw new DesignStorageConflictError();
          }
          const next = { document, storageVersion: storageId(), trashedAt };
          store.put(next, document.documentId);
          await done;
          return next;
        } catch (error) {
          await done.catch(() => undefined);
          throw error;
        }
      } finally {
        database.close();
      }
    },
  };
}

type SaveError = { readonly message: string; readonly conflict: boolean };
type LibrarySnapshot = {
  readonly phase: "loading" | "ready" | "error";
  readonly records: ReadonlyArray<StoredDesignDocument>;
  readonly pending: ReadonlySet<string>;
  readonly errors: ReadonlyMap<string, SaveError>;
  readonly loadError: string | null;
};

export class DesignDocumentLibrary {
  private snapshot: LibrarySnapshot = {
    phase: "loading",
    records: [],
    pending: new Set(),
    errors: new Map(),
    loadError: null,
  };
  private listeners = new Set<() => void>();
  private queue = Promise.resolve();
  private loading: Promise<void> | null = null;
  private versions = new Map<string, string>();
  private generations = new Map<string, number>();

  constructor(private readonly repository = createDesignDocumentRepository()) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(next: Partial<LibrarySnapshot>) {
    this.snapshot = { ...this.snapshot, ...next };
    for (const listener of this.listeners) listener();
  }
  load = async () => {
    if (this.snapshot.phase === "ready") return;
    if (this.loading) return this.loading;
    this.loading = this.reload();
    await this.loading;
    this.loading = null;
  };
  reload = async () => {
    await this.flush();
    this.publish({ phase: "loading", loadError: null });
    try {
      const records = await this.repository.load();
      this.versions = new Map(
        records.map((record) => [record.document.documentId, record.storageVersion]),
      );
      this.publish({ phase: "ready", records });
    } catch (error) {
      this.publish({
        phase: "error",
        loadError: error instanceof Error ? error.message : "Could not read local Design files.",
      });
    }
  };
  setDocument = (document: DesignDocument) => {
    const existing = this.snapshot.records.find(
      (record) => record.document.documentId === document.documentId,
    );
    if (existing?.trashedAt) throw new Error("Restore this file before editing it.");
    const record = existing
      ? { ...existing, document }
      : { document, storageVersion: "", trashedAt: null };
    this.publish({
      records: existing
        ? this.snapshot.records.map((item) => (item === existing ? record : item))
        : [record, ...this.snapshot.records],
    });
    this.enqueue(record);
  };
  private enqueue(record: StoredDesignDocument) {
    const id = record.document.documentId;
    const generation = (this.generations.get(id) ?? 0) + 1;
    this.generations.set(id, generation);
    this.publish({ pending: new Set([...this.snapshot.pending, id]) });
    this.queue = this.queue.then(async () => {
      if (!this.snapshot.errors.has(id)) {
        try {
          const saved = await this.repository.write(
            record.document,
            this.versions.get(id) ?? null,
            record.trashedAt,
          );
          this.versions.set(id, saved.storageVersion);
        } catch (error) {
          this.publish({
            errors: new Map(this.snapshot.errors).set(id, {
              message: error instanceof Error ? error.message : "Could not save this Design file.",
              conflict: error instanceof DesignStorageConflictError,
            }),
          });
        }
      }
      if (this.generations.get(id) === generation) {
        const pending = new Set(this.snapshot.pending);
        pending.delete(id);
        this.publish({ pending });
      }
    });
  }
  flush = async () => {
    await this.queue;
    if (this.snapshot.errors.size > 0)
      throw new Error([...this.snapshot.errors.values()][0]!.message);
  };
  retry = (id: string) => {
    if (this.snapshot.errors.get(id)?.conflict) return;
    const errors = new Map(this.snapshot.errors);
    errors.delete(id);
    this.publish({ errors });
    const record = this.snapshot.records.find((item) => item.document.documentId === id);
    if (record) this.enqueue(record);
  };
  create = async () => {
    return this.importDocument(createInitialDesignDocument());
  };
  importDocument = async (source: DesignDocument) => {
    await this.load();
    if (this.snapshot.phase !== "ready")
      throw new Error(this.snapshot.loadError ?? "Could not open local Design files.");
    const document = localCopy(source);
    this.setDocument(document);
    await this.flush();
    return document;
  };
  recoverCopy = async (id: string) => {
    await this.queue;
    const original = this.snapshot.records.find((record) => record.document.documentId === id);
    if (!original) throw new Error("This file is unavailable.");
    const generation = this.generations.get(id);
    const copy = localCopy({
      ...original.document,
      title: `${original.document.title} (recovery)`,
    });
    const saved = await this.repository.write(copy, null);
    const records = await this.repository.load();
    this.versions.set(copy.documentId, saved.storageVersion);
    if (this.generations.get(id) !== generation) {
      this.publish({ records: [saved, ...this.snapshot.records] });
      throw new Error(
        "A recovery copy was saved. Newer edits are still open; save another copy before leaving.",
      );
    }
    const storedOriginal = records.find((record) => record.document.documentId === id);
    if (storedOriginal) this.versions.set(id, storedOriginal.storageVersion);
    else this.versions.delete(id);
    const errors = new Map(this.snapshot.errors);
    errors.delete(id);
    this.publish({
      records: [
        saved,
        ...this.snapshot.records.filter(
          (record) =>
            record.document.documentId !== id && record.document.documentId !== copy.documentId,
        ),
        ...records.filter((record) => record.document.documentId === id),
      ],
      errors,
    });
    return copy;
  };
  setTrashed = async (id: string, trashed: boolean) => {
    await this.flush();
    const record = this.snapshot.records.find((item) => item.document.documentId === id);
    if (!record) return;
    const next = { ...record, trashedAt: trashed ? new Date().toISOString() : null };
    this.publish({ records: this.snapshot.records.map((item) => (item === record ? next : item)) });
    this.enqueue(next);
    await this.flush();
  };
}

export const designDocumentLibrary = new DesignDocumentLibrary();
