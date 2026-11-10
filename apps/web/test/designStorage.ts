import { DESIGN_DOCUMENTS_STORAGE_KEY } from "../src/components/design/designDocument";
import {
  DESIGN_DATABASE_NAME,
  designDocumentLibrary,
  createDesignDocumentRepository,
} from "../src/components/design/designDocumentStore";

export async function resetDesignStorage(legacy?: string) {
  await designDocumentLibrary.flush();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DESIGN_DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("A Design storage connection was not closed."));
  });
  window.localStorage.removeItem(DESIGN_DOCUMENTS_STORAGE_KEY);
  if (legacy !== undefined) window.localStorage.setItem(DESIGN_DOCUMENTS_STORAGE_KEY, legacy);
  await designDocumentLibrary.reload();
}

export async function storedDesignDocuments() {
  await designDocumentLibrary.flush();
  return (await createDesignDocumentRepository().load()).map((record) => record.document);
}
