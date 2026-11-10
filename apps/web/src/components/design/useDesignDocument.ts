import { useBlocker } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";

import type { DesignDocument } from "./designDocument";
import { designDocumentLibrary } from "./designDocumentStore";

export function useDesignDocument(documentId?: string) {
  const snapshot = useSyncExternalStore(
    designDocumentLibrary.subscribe,
    designDocumentLibrary.getSnapshot,
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Hydrate the external IndexedDB store before mounting an editor.
  useEffect(() => {
    void designDocumentLibrary.load();
  }, []);
  useBlocker({
    shouldBlockFn: async () => {
      try {
        await designDocumentLibrary.flush();
        return false;
      } catch {
        return true;
      }
    },
    enableBeforeUnload: snapshot.pending.size > 0 || snapshot.errors.size > 0,
  });
  const documents = snapshot.records
    .filter((record) => record.trashedAt === null)
    .map((record) => record.document);
  const document =
    documentId === undefined
      ? (documents[0] ?? null)
      : (documents.find((item) => item.documentId === documentId) ?? null);
  return {
    ...snapshot,
    document,
    documents,
    trashed: snapshot.records
      .filter((record) => record.trashedAt !== null)
      .map((record) => record.document),
    setDocument: designDocumentLibrary.setDocument,
    createDocument: designDocumentLibrary.create,
    importDocument: designDocumentLibrary.importDocument,
    flush: designDocumentLibrary.flush,
    retry: designDocumentLibrary.retry,
    recoverCopy: designDocumentLibrary.recoverCopy,
    setTrashed: designDocumentLibrary.setTrashed,
    reload: designDocumentLibrary.reload,
  };
}

export async function importDesignDocument(document: DesignDocument): Promise<DesignDocument> {
  return designDocumentLibrary.importDocument(document);
}
