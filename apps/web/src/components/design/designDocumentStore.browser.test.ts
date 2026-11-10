import { expect, it, vi } from "vite-plus/test";

import { createInitialDesignDocument, updateDesignNode } from "./designDocument";
import {
  createDesignDocumentRepository,
  DesignDocumentLibrary,
  DesignStorageConflictError,
} from "./designDocumentStore";

function repositoryFixture(legacy: string | null = null) {
  const databaseName = `design-store-test-${Array.from(crypto.getRandomValues(new Uint32Array(4))).join("-")}`;
  const legacyStorage = { getItem: vi.fn(() => legacy), removeItem: vi.fn() };
  const repository = createDesignDocumentRepository({ databaseName, legacyStorage });
  return {
    repository,
    legacyStorage,
    async [Symbol.asyncDispose]() {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(databaseName);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("Test left a database connection open."));
      });
    },
  };
}

function deferred() {
  let complete = () => {};
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: () => complete() };
}

it("migrates the document and unsent operations only after a committed transaction", async () => {
  const document = updateDesignNode(createInitialDesignDocument(), "text-welcome", {
    text: "Offline edit",
  });
  const second = { ...document, documentId: "second-file" };
  await using fixture = repositoryFixture(JSON.stringify([document, second]));
  using writes = vi.spyOn(IDBObjectStore.prototype, "put");
  const realPut = writes.getMockImplementation()!;
  writes.mockImplementationOnce(realPut).mockImplementationOnce(() => {
    throw new DOMException("Disk is full", "QuotaExceededError");
  });
  await expect(fixture.repository.load()).rejects.toThrow("Disk is full");
  expect(fixture.legacyStorage.removeItem).not.toHaveBeenCalled();
  writes.mockRestore();
  const records = await fixture.repository.load();
  expect(records).toHaveLength(2);
  expect(
    records.find((record) => record.document.documentId === document.documentId)?.document,
  ).toEqual(document);
  expect(fixture.legacyStorage.removeItem).not.toHaveBeenCalled();
  const library = new DesignDocumentLibrary(fixture.repository);
  await library.load();
  const latest = updateDesignNode(document, "text-welcome", { text: "Second offline edit" });
  library.setDocument(latest);
  await library.flush();
  const restarted = new DesignDocumentLibrary(fixture.repository);
  await restarted.load();
  expect(
    restarted
      .getSnapshot()
      .records.find((record) => record.document.documentId === document.documentId)?.document,
  ).toEqual(latest);
  expect(
    restarted
      .getSnapshot()
      .records.find((record) => record.document.documentId === document.documentId)
      ?.document.nodes.find((node) => node.nodeId === "text-welcome")?.text,
  ).toBe("Second offline edit");
});

it("keeps the last unsaved edit after a write failure and retries that version", async () => {
  await using fixture = repositoryFixture();
  const library = new DesignDocumentLibrary(fixture.repository);
  await library.load();
  const original = library.getSnapshot().records[0]!.document;
  using write = vi
    .spyOn(fixture.repository, "write")
    .mockRejectedValueOnce(new DOMException("Disk is full", "QuotaExceededError"));
  library.setDocument(updateDesignNode(original, "text-welcome", { text: "First edit" }));
  const latest = updateDesignNode(library.getSnapshot().records[0]!.document, "text-welcome", {
    text: "Latest edit",
  });
  library.setDocument(latest);
  await expect(library.flush()).rejects.toThrow("Disk is full");
  expect(library.getSnapshot().records[0]!.document).toEqual(latest);
  expect(library.getSnapshot().errors.has(original.documentId)).toBe(true);
  expect((await fixture.repository.load())[0]!.document).toEqual(original);
  write.mockRestore();
  library.retry(original.documentId);
  await library.flush();
  expect((await fixture.repository.load())[0]!.document).toEqual(latest);
  expect(library.getSnapshot().errors.size).toBe(0);
});

it("rejects a stale writer and recovers its latest edits without overwriting the other window", async () => {
  await using fixture = repositoryFixture();
  const first = new DesignDocumentLibrary(fixture.repository);
  const second = new DesignDocumentLibrary(fixture.repository);
  await first.load();
  await second.load();
  const original = first.getSnapshot().records[0]!.document;
  const firstEdit = updateDesignNode(original, "text-welcome", { text: "First window" });
  first.setDocument(firstEdit);
  await first.flush();
  const secondEdit = updateDesignNode(original, "text-welcome", { text: "Second window" });
  second.setDocument(secondEdit);
  await expect(second.flush()).rejects.toThrow("another window");
  await expect(fixture.repository.write(secondEdit, "stale-version")).rejects.toBeInstanceOf(
    DesignStorageConflictError,
  );
  second.retry(original.documentId);
  await expect(second.flush()).rejects.toThrow("another window");
  const started = deferred();
  const resume = deferred();
  const write = fixture.repository.write;
  using heldWrite = vi
    .spyOn(fixture.repository, "write")
    .mockImplementationOnce(async (...args) => {
      started.resolve();
      await resume.promise;
      return write(...args);
    });
  const interruptedRecovery = second.recoverCopy(original.documentId);
  await started.promise;
  const latest = updateDesignNode(secondEdit, "text-welcome", { text: "New edit during recovery" });
  second.setDocument(latest);
  resume.resolve();
  await expect(interruptedRecovery).rejects.toThrow("Newer edits are still open");
  expect(
    second
      .getSnapshot()
      .records.find((record) => record.document.documentId === original.documentId)?.document,
  ).toEqual(latest);
  heldWrite.mockRestore();
  const copy = await second.recoverCopy(original.documentId);
  const stored = await fixture.repository.load();
  expect(
    stored.find((record) => record.document.documentId === original.documentId)?.document,
  ).toEqual(firstEdit);
  expect(
    stored.find((record) => record.document.documentId === copy.documentId)?.document.nodes,
  ).toEqual(latest.nodes);
  expect(
    stored.find((record) => record.document.documentId === copy.documentId)?.document
      .pendingOperations,
  ).toHaveLength(latest.pendingOperations.length);
  expect(second.getSnapshot().errors.size).toBe(0);
});

it("retains deleted files and their operations across restart and restores them", async () => {
  await using fixture = repositoryFixture();
  const library = new DesignDocumentLibrary(fixture.repository);
  await library.load();
  const document = updateDesignNode(library.getSnapshot().records[0]!.document, "text-welcome", {
    text: "Keep me",
  });
  library.setDocument(document);
  await library.setTrashed(document.documentId, true);
  const restarted = new DesignDocumentLibrary(fixture.repository);
  await restarted.load();
  expect(restarted.getSnapshot().records[0]!.trashedAt).not.toBeNull();
  await restarted.setTrashed(document.documentId, false);
  expect((await fixture.repository.load())[0]).toMatchObject({ document, trashedAt: null });
});

it("keeps unreadable legacy data intact instead of silently creating a blank file", async () => {
  await using fixture = repositoryFixture("invalid JSON");
  const library = new DesignDocumentLibrary(fixture.repository);
  await library.load();
  expect(library.getSnapshot().phase).toBe("error");
  expect(library.getSnapshot().records).toEqual([]);
  expect(fixture.legacyStorage.removeItem).not.toHaveBeenCalled();
});

it("recovers a later write from an older window without overwriting the migrated file", async () => {
  const document = createInitialDesignDocument();
  await using fixture = repositoryFixture(JSON.stringify([document]));
  await fixture.repository.load();
  const lateEdit = updateDesignNode(document, "text-welcome", { text: "Older window edit" });
  fixture.legacyStorage.getItem.mockReturnValue(JSON.stringify([lateEdit]));
  const recovered = await fixture.repository.load();
  expect(recovered).toHaveLength(2);
  expect(
    recovered.find((record) => record.document.documentId === document.documentId)?.document,
  ).toEqual(document);
  expect(
    recovered.find((record) => record.document.documentId !== document.documentId)?.document.nodes,
  ).toEqual(lateEdit.nodes);
  expect(await fixture.repository.load()).toHaveLength(2);
});
