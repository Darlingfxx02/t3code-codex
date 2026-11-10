import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";
import { copyDesignSelection, readDesignSelection } from "./designClipboard";
import {
  previewDesignTransform,
  scaleDesignSelection,
  flipDesignSelection,
  rotateDesignSelection,
  setDesignNodeRotation,
  setDesignNodeRotations,
} from "./designTransform";
import { createDesignRotationOrigin, resolveDesignRotationOrigin } from "./designRotationOrigin";

import {
  absoluteNodePosition,
  addDesignPage,
  addImageNode,
  addTextNode,
  createInitialDesignDocument,
  descendants,
  DesignDocument,
  nodeForPage,
  updateDesignNode,
  updateDesignNodes,
  duplicateDesignNodes,
  deleteDesignNodes,
  reorderDesignNode,
  addFrameNode,
  reparentDesignNode,
  groupDesignNodes,
  ungroupDesignNode,
  addComponentNode,
  addInstanceNode,
  detachDesignInstance,
  restoreDesignContent,
  renameDesignPage,
  deleteDesignPage,
  alignDesignNodes,
  designWorldBounds,
  distributeDesignNodes,
  designNodeWorldFrame,
  designWorldToLocal,
  addVectorPath,
  booleanDesignSelection,
  addDesignComment,
  updateDesignComment,
  removeDesignComment,
  updateDesignVectorPoint,
  pasteDesignNodes,
  replaceDesignAsset,
  removeDesignAsset,
  addAssetMeta,
  setPrototypeStartFrame,
  updatePrototypeSettings,
} from "./designDocument";

const encodeDocument = Schema.encodeSync(Schema.fromJsonString(DesignDocument));
const decodeDocument = Schema.decodeSync(Schema.fromJsonString(DesignDocument));

describe("Design document IR", () => {
  it("unions simple closed vector paths into one editable vector", () => {
    let document = createInitialDesignDocument();
    document = addVectorPath(
      document,
      [
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ],
      true,
    );
    document = addVectorPath(
      document,
      [
        { x: 10, y: 10 },
        { x: 30, y: 10 },
        { x: 30, y: 30 },
        { x: 10, y: 30 },
      ],
      true,
    );
    const ids = document.nodes.filter((node) => node.kind === "vector").map((node) => node.nodeId);
    const merged = booleanDesignSelection(document, ids, "union");
    expect(merged.nodes.filter((node) => node.kind === "vector")).toHaveLength(1);
    expect(merged.nodes.find((node) => node.kind === "vector")).toMatchObject({
      name: "Union",
      width: 30,
      height: 30,
    });
    const subtract = booleanDesignSelection(document, ids, "subtract");
    expect(subtract.nodes.find((node) => node.kind === "vector")?.vector).toMatchObject({
      fillRule: "evenodd",
    });
    const intersect = booleanDesignSelection(document, ids, "intersect");
    expect(intersect.nodes.find((node) => node.kind === "vector")).toMatchObject({
      name: "Intersect",
      width: 10,
      height: 10,
    });
  });

  it("persists editable canvas comments independently from design layers", () => {
    const added = addDesignComment(createInitialDesignDocument(), { x: 32, y: 48 }, "frame-home");
    expect(added.document.comments).toMatchObject([
      { commentId: added.commentId, x: 32, y: 48, parentId: "frame-home", text: "New comment" },
    ]);
    const edited = updateDesignComment(added.document, added.commentId, {
      text: "Align this card",
      resolved: true,
    });
    expect(edited.comments?.[0]).toMatchObject({ text: "Align this card", resolved: true });
    expect(removeDesignComment(edited, added.commentId).comments).toEqual([]);
  });

  it("preserves reflected nested geometry through serialization, reparenting, grouping and clipboard", () => {
    const source = updateDesignNode(
      updateDesignNode(createInitialDesignDocument(), "frame-home", {
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        rotation: 90,
        flipX: true,
        clipContent: false,
      }),
      "text-welcome",
      { x: 20, y: 10, width: 40, height: 20, rotation: 30, flipY: true },
    );
    expect(decodeDocument(encodeDocument(source)).nodes[0]?.flipX).toBe(true);
    const frame = designNodeWorldFrame(source, "text-welcome")!;
    expect(frame.x).toBeCloseTo(210);
    expect(frame.y).toBeCloseTo(200);
    const local = designWorldToLocal(source, "text-welcome", { x: 230, y: 210 });
    expect(local.x).toBeCloseTo(20);
    expect(local.y).toBeCloseTo(10);
    const original = designWorldBounds(source, "text-welcome")!;
    expect(original.width).toBeCloseTo(20 + 10 * Math.sqrt(3));
    expect(original.height).toBeCloseTo(20 * Math.sqrt(3) + 10);
    const reflected = flipDesignSelection(source, ["frame-home", "text-welcome"], "horizontal");
    const reflectedFrame = designNodeWorldFrame(reflected, "text-welcome")!;
    expect(reflectedFrame.x).toBeCloseTo(150);
    expect(reflectedFrame.y).toBeCloseTo(200);
    const reversed = flipDesignSelection(reflected, ["frame-home"], "horizontal");
    for (const key of ["x", "y", "width", "height"] as const)
      expect(designWorldBounds(reversed, "text-welcome")![key]).toBeCloseTo(original[key], 4);
    const rotated = rotateDesignSelection(source, ["text-welcome"], 90);
    expect(designNodeWorldFrame(rotated, "text-welcome")?.rotation).toBeCloseTo(-30);
    expect(designNodeWorldFrame(rotated, "text-welcome")?.x).toBeCloseTo(210);
    expect(designNodeWorldFrame(rotated, "text-welcome")?.y).toBeCloseTo(200);
    const origin = { x: 200, y: 150 };
    const orbit = rotateDesignSelection(source, ["text-welcome"], 90, origin);
    expect(designNodeWorldFrame(orbit, "text-welcome")?.x).toBeCloseTo(120);
    expect(designNodeWorldFrame(orbit, "text-welcome")?.y).toBeCloseTo(170);
    const preview = previewDesignTransform({
      document: source,
      ids: ["text-welcome"],
      kind: "rotate",
      start: { x: 300, y: 150 },
      point: { x: 200, y: 250 },
      origin,
    });
    expect(designNodeWorldFrame(preview, "text-welcome")?.x).toBeCloseTo(120);
    expect(designNodeWorldFrame(preview, "text-welcome")?.y).toBeCloseTo(170);
    const reference = createDesignRotationOrigin(source, ["text-welcome"], origin)!;
    expect(reference).not.toBeNull();
    const resolved = resolveDesignRotationOrigin(orbit, ["text-welcome"], reference)!;
    expect(resolved.x).toBeCloseTo(origin.x);
    expect(resolved.y).toBeCloseTo(origin.y);
    const angle = setDesignNodeRotation(source, "text-welcome", -60, origin);
    expect(angle.nodes.find((node) => node.nodeId === "text-welcome")).toMatchObject({
      rotation: -60,
      flipY: true,
    });
    expect(designNodeWorldFrame(angle, "text-welcome")?.x).toBeCloseTo(120);
    expect(
      resolveDesignRotationOrigin(restoreDesignContent(orbit, source), ["text-welcome"], reference)
        ?.x,
    ).toBeCloseTo(origin.x);
    const translated = updateDesignNode(source, "frame-home", { x: 110, y: 105 });
    const movedOrigin = resolveDesignRotationOrigin(translated, ["text-welcome"], reference)!;
    expect(movedOrigin.x).toBeCloseTo(210);
    expect(movedOrigin.y).toBeCloseTo(155);
    expect(resolveDesignRotationOrigin(source, ["frame-home"], reference)).toBeNull();
    expect(createDesignRotationOrigin(source, ["text-welcome"], { x: NaN, y: 0 })).toBeNull();
    const hierarchy = setDesignNodeRotations(
      source,
      new Map([
        ["frame-home", 180],
        ["text-welcome", 90],
      ]),
      origin,
    );
    expect(hierarchy.nodes.find((node) => node.nodeId === "text-welcome")?.rotation).toBe(90);
    expect(designNodeWorldFrame(hierarchy, "text-welcome")?.rotation).toBeCloseTo(-90);
    expect(designNodeWorldFrame(hierarchy, "text-welcome")?.x).toBeCloseTo(
      180 + 15 * Math.sqrt(3) - 30,
    );
    expect(designNodeWorldFrame(hierarchy, "text-welcome")?.y).toBeCloseTo(
      140 + 15 + 30 * Math.sqrt(3),
    );
    const moved = reparentDesignNode(source, "text-welcome", null);
    for (const key of ["x", "y", "width", "height"] as const)
      expect(designWorldBounds(moved, "text-welcome")![key]).toBeCloseTo(original[key], 4);
    const grouped = groupDesignNodes(source, ["text-welcome"]);
    expect(grouped.nodes.at(-1)!.width).toBeCloseTo(20 * Math.sqrt(3) + 10);
    expect(grouped.nodes.at(-1)!.height).toBeCloseTo(20 + 10 * Math.sqrt(3));
    for (const key of ["x", "y", "width", "height"] as const)
      expect(designWorldBounds(grouped, "text-welcome")![key]).toBeCloseTo(original[key], 4);
    const groupId = grouped.nodes.at(-1)!.nodeId;
    const flippedGroup = updateDesignNode(grouped, groupId, { flipX: true, rotation: 15 });
    const before = designWorldBounds(flippedGroup, "text-welcome")!;
    const ungrouped = ungroupDesignNode(flippedGroup, groupId);
    for (const key of ["x", "y", "width", "height"] as const)
      expect(designWorldBounds(ungrouped, "text-welcome")![key]).toBeCloseTo(before[key], 4);
    const clipboard = readDesignSelection(copyDesignSelection(source, ["text-welcome"])!)!;
    for (const key of ["x", "y", "width", "height"] as const)
      expect(designWorldBounds(clipboard.document, "text-welcome")![key]).toBeCloseTo(
        original[key],
        4,
      );
  });
  it("applies simultaneous properties atomically and keeps explicit instance fields ahead of inheritance", () => {
    const main = addComponentNode(createInitialDesignDocument());
    const mainId = main.nodes.at(-1)!.nodeId;
    const first = addInstanceNode(main, mainId);
    const firstId = first.nodes.at(-1)!.nodeId;
    const second = addInstanceNode(first, mainId);
    const secondId = second.nodes.at(-1)!.nodeId;
    const overridden = updateDesignNode(second, secondId, { paint: { background: "blue" } });
    const document = {
      ...overridden,
      nodes: overridden.nodes.toReversed(),
      pendingOperations: [],
      syncState: "synced" as const,
    };
    const updated = updateDesignNodes(
      document,
      new Map([
        [mainId, { paint: { background: "red" }, opacity: 0.4 }],
        [firstId, { opacity: 0.8 }],
      ]),
    );
    expect(updated.nodes.find((node) => node.nodeId === firstId)).toMatchObject({
      paint: { background: "red" },
      opacity: 0.8,
    });
    expect(updated.nodes.find((node) => node.nodeId === secondId)).toMatchObject({
      paint: { background: "blue" },
      opacity: 0.4,
    });
    expect(new Set(updated.pendingOperations.map((operation) => operation.nodeId))).toEqual(
      new Set([mainId, firstId, secondId]),
    );
    const firstFrame = designNodeWorldFrame(updated, firstId)!;
    const angles = setDesignNodeRotations(
      updated,
      new Map([
        [mainId, 90],
        [firstId, 180],
        [secondId, 45],
      ]),
      { x: 0, y: 0 },
    );
    expect(angles.nodes.find((node) => node.nodeId === firstId)).toMatchObject({
      rotation: 180,
      paint: { background: "red" },
      opacity: 0.8,
    });
    expect(angles.nodes.find((node) => node.nodeId === secondId)).toMatchObject({
      rotation: 45,
      paint: { background: "blue" },
    });
    expect(designNodeWorldFrame(angles, firstId)?.x).toBeCloseTo(-firstFrame.x - firstFrame.width);
    expect(designNodeWorldFrame(angles, firstId)?.y).toBeCloseTo(-firstFrame.y - firstFrame.height);
    expect(
      setDesignNodeRotations(
        updated,
        new Map([
          [mainId, 90],
          [firstId, NaN],
        ]),
        { x: 0, y: 0 },
      ),
    ).toBe(updated);
    expect(
      updateDesignNodes(
        document,
        new Map([
          [mainId, { opacity: 0.2 }],
          [firstId, { width: NaN }],
        ]),
      ),
    ).toBe(document);
  });
  it("snaps moves and resizes to individual pixels instead of an eight pixel grid", () => {
    const document = createInitialDesignDocument();
    const transform = {
      document,
      ids: ["frame-home"],
      handle: "se",
      start: { x: 0, y: 0 },
      point: { x: 3.2, y: 2.7 },
      snap: true,
    };
    expect(previewDesignTransform({ ...transform, kind: "move" }).nodes[0]).toMatchObject({
      x: 123,
      y: 99,
    });
    expect(previewDesignTransform({ ...transform, kind: "resize" }).nodes[0]).toMatchObject({
      width: 643,
      height: 423,
    });
  });
  it("scales a rotated subtree around its anchor without applying child constraints", () => {
    const base = createInitialDesignDocument();
    const document = {
      ...base,
      nodes: [
        { ...base.nodes[0]!, rotation: 30 },
        {
          ...base.nodes[1]!,
          constraints: { horizontal: "right" as const, vertical: "bottom" as const },
          paint: { borderWidth: 2, radius: 8 },
          typography: { size: 36, lineHeight: 48, letterSpacing: -1 },
          effects: [
            {
              effectId: "shadow-qa",
              kind: "drop-shadow" as const,
              x: 2,
              y: 4,
              blur: 8,
              spread: 2,
              color: "#00000040",
              visible: true,
            },
          ],
        },
      ],
    };
    const scaled = scaleDesignSelection(document, ["frame-home", "text-welcome"], 0.5, {
      x: 0.5,
      y: 0.5,
    });
    expect(scaled.nodes[0]).toMatchObject({
      x: 280,
      y: 201,
      width: 320,
      height: 210,
      rotation: 30,
    });
    expect(scaled.nodes[1]).toMatchObject({
      x: 28,
      y: 27,
      width: 210,
      height: 32,
      fontSize: 18,
      paint: { borderWidth: 1, radius: 4 },
      typography: { size: 18, lineHeight: 24, letterSpacing: -0.5 },
      effects: [
        {
          effectId: "shadow-qa",
          kind: "drop-shadow",
          x: 1,
          y: 2,
          blur: 4,
          spread: 1,
          color: "#00000040",
          visible: true,
        },
      ],
    });
    expect(scaled.pendingOperations.length).toBeGreaterThan(document.pendingOperations.length);
    const relative = {
      ...document,
      nodes: document.nodes.map((node) =>
        node.kind !== "text"
          ? node
          : {
              ...node,
              typography: {
                ...node.typography,
                lineHeight: 150,
                lineHeightUnit: "percent" as const,
                letterSpacing: 10,
                letterSpacingUnit: "percent" as const,
                fontStyle: "italic" as const,
              },
            },
      ),
    };
    const relativeScaled = scaleDesignSelection(relative, ["frame-home"], 0.5);
    expect(decodeDocument(encodeDocument(relativeScaled)).nodes[1]?.typography).toMatchObject({
      size: 18,
      lineHeight: 150,
      lineHeightUnit: "percent",
      letterSpacing: 10,
      letterSpacingUnit: "percent",
      fontStyle: "italic",
    });
    expect(scaled.pendingOperations.map((operation) => operation.nodeId)).toEqual([
      "frame-home",
      "text-welcome",
    ]);
    const tiny = scaleDesignSelection(document, ["frame-home"], 0.001);
    expect(tiny.nodes[0]!.width).toBeCloseTo(0.64);
    expect(tiny.nodes[1]!.height).toBeCloseTo(0.064);
    const flow = updateDesignNode(
      updateDesignNode(document, "frame-home", {
        layoutModel: { kind: "auto-layout", direction: "row" },
      }),
      "text-welcome",
      { layoutSizing: { width: "fill", height: "fill" } },
    );
    const tinyFlow = scaleDesignSelection(flow, ["frame-home"], 0.001);
    expect(tinyFlow.nodes[1]).toMatchObject({ width: 0.64, height: 0.42 });
    expect(scaleDesignSelection(document, ["frame-home"], Number.NaN)).toBe(document);
    expect(scaleDesignSelection(document, ["frame-home"], 1)).toBe(document);
  });

  it("keeps scaled instances linked and scales new inherited metrics only once", () => {
    const component = addComponentNode(createInitialDesignDocument());
    const mainId = component.nodes.at(-1)!.nodeId;
    const main = reparentDesignNode(component, "text-welcome", mainId);
    const document = addInstanceNode(main, mainId);
    const instance = document.nodes.find((node) => node.kind === "instance")!;
    const child = document.nodes.find((node) => node.parentId === instance.nodeId)!;
    const scaled = scaleDesignSelection(document, [instance.nodeId], 2);
    expect(scaled.nodes.find((node) => node.nodeId === child.nodeId)).toMatchObject({
      fontSize: 72,
    });
    const changed = updateDesignNode(scaled, "text-welcome", {
      fontSize: 20,
      typography: { size: 20, weight: 600 },
      text: "Changed main",
    });
    expect(changed.nodes.find((node) => node.nodeId === child.nodeId)).toMatchObject({
      fontSize: 40,
      typography: { size: 40, weight: 600 },
      text: "Changed main",
    });
    expect(scaleDesignSelection(changed, [child.nodeId], 2)).toBe(changed);
    const mainScaled = scaleDesignSelection(changed, [mainId], 0.5);
    expect(mainScaled.nodes.find((node) => node.nodeId === child.nodeId)).toMatchObject({
      fontSize: 20,
      typography: { size: 20 },
    });
    expect(mainScaled.nodes.find((node) => node.nodeId === instance.nodeId)!.width).toBeCloseTo(
      mainScaled.nodes.find((node) => node.nodeId === mainId)!.width * 2,
    );
    const locked = updateDesignNode(mainScaled, instance.nodeId, { locked: true });
    expect(scaleDesignSelection(locked, [instance.nodeId], 2)).toBe(locked);
    const peers = addInstanceNode(document, mainId);
    const peer = peers.nodes.filter((node) => node.kind === "instance").at(-1)!;
    const peerBefore = [peer, ...peers.nodes.filter((node) => node.parentId === peer.nodeId)];
    const oneScaled = scaleDesignSelection(peers, [instance.nodeId], 2);
    expect(
      oneScaled.nodes.filter((node) => peerBefore.some((before) => before.nodeId === node.nodeId)),
    ).toEqual(peerBefore);
    const both = addComponentNode(main);
    const secondId = both.nodes.at(-1)!.nodeId;
    const nested = addInstanceNode(both, mainId, secondId);
    const inner = nested.nodes.find((node) => node.parentId === secondId)!;
    const nestedScaled = scaleDesignSelection(nested, [inner.nodeId], 2);
    const outer = addInstanceNode(nestedScaled, secondId);
    const outerRoot = outer.nodes.find((node) => node.instanceOfNodeId === secondId)!;
    const copiedInner = outer.nodes.find((node) => node.parentId === outerRoot.nodeId)!;
    const copiedText = outer.nodes.find((node) => node.parentId === copiedInner.nodeId)!;
    const updated = updateDesignNode(outer, "text-welcome", { fontSize: 30 });
    expect(updated.nodes.find((node) => node.nodeId === copiedText.nodeId)!.fontSize).toBe(60);
    const detached = detachDesignInstance(updated, outerRoot.nodeId);
    const again = updateDesignNode(detached, "text-welcome", { fontSize: 40 });
    expect(again.nodes.find((node) => node.nodeId === copiedText.nodeId)!.fontSize).toBe(80);
  });

  it("keeps node identities unique across page and frame creation", () => {
    const withFrames = addFrameNode(addFrameNode(createInitialDesignDocument()));
    const next = addDesignPage(addDesignPage(withFrames));
    expect(new Set(next.nodes.map((node) => node.nodeId)).size).toBe(next.nodes.length);
    expect(new Set(next.pages.map((page) => page.pageId)).size).toBe(next.pages.length);
    const renamed = renameDesignPage(next, next.activePageId, "Checkout");
    const frame = nodeForPage(renamed)[0]!;
    const removed = deleteDesignPage(renamed, renamed.activePageId);
    expect(removed.nodes.some((node) => node.nodeId === frame.nodeId)).toBe(false);
    expect(removed.pages.some((page) => page.pageId === removed.activePageId)).toBe(true);
    const initial = createInitialDesignDocument();
    expect(deleteDesignPage(initial, initial.activePageId)).toBe(initial);
  });

  it("aligns selection roots without moving a selected descendant twice", () => {
    const document = addFrameNode(createInitialDesignDocument());
    const root = document.nodes.at(-1)!;
    const next = alignDesignNodes(document, ["frame-home", "text-welcome", root.nodeId], "right");
    expect(next.nodes[1]?.x).toBe(56);
    expect(next.nodes[0]?.x).toBe(root.x);
    const single = alignDesignNodes(document, ["text-welcome"], "right");
    expect(single.nodes[1]?.x).toBe(document.nodes[0]!.width - document.nodes[1]!.width);
    expect(single.nodes[1]?.y).toBe(document.nodes[1]!.y);
    const rotated = updateDesignNodes(
      document,
      new Map([
        ["frame-home", { rotation: 90, clipContent: false }],
        ["text-welcome", { x: 20, y: 10, width: 80, height: 40 }],
        [root.nodeId, { x: 500, y: 100, width: 40, height: 40 }],
      ]),
    );
    const before = designWorldBounds(rotated, "text-welcome")!;
    const aligned = alignDesignNodes(rotated, ["text-welcome", root.nodeId], "left");
    expect(designWorldBounds(aligned, "text-welcome")?.x).toBeCloseTo(500);
    expect(designWorldBounds(aligned, root.nodeId)?.x).toBeCloseTo(500);
    expect(designWorldBounds(aligned, "text-welcome")?.y).toBeCloseTo(before.y);
    const third = addFrameNode(rotated);
    const thirdId = third.nodes.at(-1)!.nodeId;
    const uneven = updateDesignNodes(
      third,
      new Map([
        [thirdId, { x: 700, y: 100, width: 40, height: 40 }],
        ["text-welcome", { y: 35 }],
      ]),
    );
    const distributed = distributeDesignNodes(
      uneven,
      [root.nodeId, "text-welcome", thirdId],
      "horizontal",
    );
    expect(designWorldBounds(distributed, root.nodeId)?.x).toBeCloseTo(500);
    expect(designWorldBounds(distributed, "text-welcome")?.x).toBeCloseTo(600);
    expect(designWorldBounds(distributed, thirdId)?.x).toBeCloseTo(700);
  });

  it("normalizes vector paths and retains them through serialization", () => {
    const next = addVectorPath(createInitialDesignDocument(), [
      { x: -20, y: 40 },
      { x: 80, y: 20 },
    ]);
    expect(decodeDocument(encodeDocument(next)).nodes.at(-1)).toMatchObject({
      x: -20,
      y: 20,
      width: 100,
      height: 20,
      vector: { path: "M 0 20 L 100 0", closed: false },
    });
  });

  it("stores editable bezier handles and rebuilds the path after a handle move", () => {
    const next = addVectorPath(createInitialDesignDocument(), [
      { x: 0, y: 0, outHandle: { x: 40, y: 0 } },
      { x: 100, y: 100, inHandle: { x: -40, y: 0 } },
    ]);
    const node = next.nodes.at(-1)!;
    expect(node.vector?.path).toContain("C 40 0 60 100 100 100");
    expect(decodeDocument(encodeDocument(next)).nodes.at(-1)?.vector?.points).toEqual([
      { x: 0, y: 0, outHandle: { x: 40, y: 0 } },
      { x: 100, y: 100, inHandle: { x: -40, y: 0 } },
    ]);
    const moved = updateDesignVectorPoint(next, node.nodeId, 0, { outHandle: { x: 20, y: 30 } });
    expect(moved.nodes.at(-1)?.vector?.path).toContain("C 20 30 60 100 100 100");
  });

  it("expands vector bounds when a Bézier control point leaves the anchor box", () => {
    const next = addVectorPath(createInitialDesignDocument(), [
      { x: 0, y: 0, outHandle: { x: -20, y: -30 } },
      { x: 100, y: 100 },
    ]);
    const node = next.nodes.at(-1)!;
    expect(node).toMatchObject({ x: -20, y: -30, width: 120, height: 130 });
    expect(node.vector?.points?.[0]).toMatchObject({ x: 20, y: 30, outHandle: { x: -20, y: -30 } });
    const moved = updateDesignVectorPoint(next, node.nodeId, 0, {
      outHandle: { x: -40, y: -50 },
    });
    expect(moved.nodes.at(-1)).toMatchObject({ x: -40, y: -50, width: 140, height: 150 });
  });

  it("resolves text Hug sizing from content while preserving Fill in auto layout", () => {
    const initial = addTextNode(createInitialDesignDocument());
    const textId = initial.nodes.at(-1)!.nodeId;
    const hugged = updateDesignNode(initial, textId, {
      text: "A much longer heading that should hug its contents",
      layoutSizing: { width: "hug", height: "hug" },
    });
    expect(hugged.nodes.at(-1)!.width).toBeGreaterThan(initial.nodes.at(-1)!.width);
    expect(hugged.nodes.at(-1)!.height).toBeGreaterThan(0);
    const flow = updateDesignNode(hugged, "frame-home", {
      layoutModel: { kind: "auto-layout", direction: "row", padding: 16 },
    });
    const fill = updateDesignNode(flow, textId, {
      layoutSizing: { width: "fill", height: "hug" },
    });
    expect(fill.nodes.find((node) => node.nodeId === textId)?.layoutSizing).toMatchObject({
      width: "fill",
      height: "hug",
    });
    expect(fill.nodes.find((node) => node.nodeId === textId)!.width).toBeGreaterThan(0);
  });

  it("attaches root text to an empty page and prevents nesting inside text", () => {
    const initial = createInitialDesignDocument();
    const empty = { ...initial, nodes: [], pages: [{ ...initial.pages[0]!, nodeIds: [] }] };
    const next = addTextNode(empty);
    expect(nodeForPage(next).map((node) => node.nodeId)).toEqual([next.nodes[0]!.nodeId]);
    expect(reparentDesignNode(initial, "frame-home", "text-welcome")).toBe(initial);
  });

  it("groups and ungroups without moving children, and rejects parent cycles", () => {
    const initial = addTextNode(createInitialDesignDocument());
    const ids = initial.nodes[0]!.childIds;
    const positions = ids.map((id) =>
      absoluteNodePosition(
        initial,
        initial.nodes.find((n) => n.nodeId === id)!,
      ),
    );
    const grouped = groupDesignNodes(initial, ids);
    const group = grouped.nodes.at(-1)!;
    expect(
      ids.map((id) =>
        absoluteNodePosition(
          grouped,
          grouped.nodes.find((n) => n.nodeId === id)!,
        ),
      ),
    ).toEqual(positions);
    expect(reparentDesignNode(grouped, group.nodeId, ids[0]!)).toBe(grouped);
    const ungrouped = ungroupDesignNode(grouped, group.nodeId);
    expect(ungrouped.nodes).toEqual(initial.nodes);
    const rotated = updateDesignNode(grouped, group.nodeId, { rotation: 90, opacity: 0.5 });
    expect(ungroupDesignNode(rotated, group.nodeId).nodes[1]).toMatchObject({
      x: 72,
      y: 70,
      rotation: 90,
      opacity: 0.5,
    });
  });

  it("preserves the image appearance when reparenting into a rotated frame", () => {
    const document = updateDesignNode(
      addImageNode(createInitialDesignDocument(), "asset", null, {
        x: 150,
        y: 150,
        width: 100,
        height: 50,
      }),
      "frame-home",
      { x: 100, y: 100, width: 200, height: 200, rotation: 90 },
    );
    const imageId = document.nodes.at(-1)!.nodeId;
    const nested = reparentDesignNode(document, imageId, "frame-home");
    expect(nested.nodes.find((node) => node.nodeId === imageId)).toMatchObject({
      x: 25,
      y: 75,
      rotation: -90,
    });
    expect(
      reparentDesignNode(nested, imageId, null).nodes.find((node) => node.nodeId === imageId),
    ).toMatchObject({ x: 150, y: 150, rotation: 0 });
  });

  it("propagates component child styles without overwriting instance overrides", () => {
    const component = addComponentNode(createInitialDesignDocument());
    const root = component.nodes.at(-1)!;
    const nested = reparentDesignNode(component, "text-welcome", root.nodeId);
    const withContainer = addFrameNode(nested);
    const containerId = withContainer.nodes.at(-1)!.nodeId;
    const instance = addInstanceNode(withContainer, root.nodeId, containerId);
    expect(instance.nodes.find((node) => node.kind === "instance")?.parentId).toBe(containerId);
    expect(addInstanceNode(nested, root.nodeId, root.nodeId)).toBe(nested);
    const child = instance.nodes.find((node) => node.instanceOfNodeId === "text-welcome")!;
    const changed = updateDesignNode(instance, "text-welcome", { text: "Master" });
    expect(changed.nodes.find((node) => node.nodeId === child.nodeId)?.text).toBe("Master");
    const overridden = updateDesignNode(changed, child.nodeId, { text: "Local" });
    expect(
      updateDesignNode(overridden, "text-welcome", { text: "Master 2" }).nodes.find(
        (node) => node.nodeId === child.nodeId,
      )?.text,
    ).toBe("Local");
    const restored = restoreDesignContent(overridden, nested);
    expect(restored.revision).toBeGreaterThanOrEqual(overridden.revision);
    expect(restored.nodes).toEqual(nested.nodes);
    const other = { ...createInitialDesignDocument(), documentId: "other-document" };
    const rootInstance = instance.nodes.find((node) => node.kind === "instance")!;
    const pasted = pasteDesignNodes(other, instance, [rootInstance.nodeId]);
    const pastedRoot = nodeForPage(pasted).at(-1)!;
    expect(pastedRoot.kind).toBe("frame");
    expect(pastedRoot.instanceOfNodeId).toBeUndefined();
  });

  it("detaches inherited children while retaining independent nested component links", () => {
    const first = addComponentNode(createInitialDesignDocument());
    const firstId = first.nodes.at(-1)!.nodeId;
    const source = reparentDesignNode(first, "text-welcome", firstId);
    const direct = addInstanceNode(source, firstId);
    const root = direct.nodes.find((node) => node.kind === "instance")!;
    const copy = direct.nodes.find((node) => node.parentId === root.nodeId)!;
    const locked = updateDesignNode(direct, root.nodeId, { locked: true });
    expect(detachDesignInstance(locked, root.nodeId)).toBe(locked);
    const detached = detachDesignInstance(direct, root.nodeId);
    expect(
      updateDesignNode(detached, "text-welcome", { text: "Changed main" }).nodes.find(
        (node) => node.nodeId === copy.nodeId,
      )?.text,
    ).toBe("Design starts here");
    expect(
      detached.nodes.find((node) => node.nodeId === copy.nodeId)?.instanceOfNodeId,
    ).toBeUndefined();
    const both = addComponentNode(source);
    const secondId = both.nodes.at(-1)!.nodeId;
    const nested = addInstanceNode(both, firstId, secondId);
    const outer = addInstanceNode(nested, secondId);
    const outerRoot = outer.nodes.find((node) => node.instanceOfNodeId === secondId)!;
    const inner = outer.nodes.find((node) => node.parentId === outerRoot.nodeId)!;
    const innerText = outer.nodes.find((node) => node.parentId === inner.nodeId)!;
    const nestedDetached = detachDesignInstance(outer, outerRoot.nodeId);
    expect(nestedDetached.nodes.find((node) => node.nodeId === inner.nodeId)).toMatchObject({
      kind: "instance",
      instanceOfNodeId: firstId,
      componentId: firstId,
    });
    expect(
      nestedDetached.nodes.find((node) => node.nodeId === innerText.nodeId)?.instanceOfNodeId,
    ).toBe("text-welcome");
    expect(
      updateDesignNode(nestedDetached, "text-welcome", { text: "Changed nested main" }).nodes.find(
        (node) => node.nodeId === innerText.nodeId,
      )?.text,
    ).toBe("Changed nested main");
  });

  it("rejects indirect component cycles when nesting instances", () => {
    const first = addComponentNode(createInitialDesignDocument());
    const firstId = first.nodes.at(-1)!.nodeId;
    const both = addComponentNode(first);
    const secondId = both.nodes.at(-1)!.nodeId;
    const nested = addInstanceNode(both, firstId, secondId);
    expect(nested.nodes.find((node) => node.kind === "instance")?.parentId).toBe(secondId);
    expect(addInstanceNode(nested, secondId, firstId)).toBe(nested);
  });

  it("duplicates complete subtrees with independent identities", () => {
    const document = createInitialDesignDocument();
    const next = duplicateDesignNodes(document, ["frame-home", "text-welcome"]);
    const copy = next.nodes.find((node) => node.name === "Home screen copy")!;
    expect(next.nodes).toHaveLength(4);
    const child = next.nodes.find((node) => node.nodeId === copy.childIds[0])!;
    expect(child.parentId).toBe(copy.nodeId);
    expect(child.text).toBe("Design starts here");
    expect(child.nodeId).not.toBe("text-welcome");
    expect(deleteDesignNodes(next, [copy.nodeId]).nodes).toHaveLength(2);
    const encoded = copyDesignSelection(document, ["text-welcome"]);
    const copied = readDesignSelection(encoded!)!;
    expect(copied.document.nodes).toHaveLength(1);
    expect(copied.document.nodes[0]).toMatchObject({ parentId: null, x: 176, y: 150 });
    expect(readDesignSelection('{"kind":"t3-design-selection","document":{}}')).toBeNull();
    expect(readDesignSelection("<script>ignored</script>")).toBeNull();
  });

  it("honors child constraints when its frame resizes", () => {
    const initial = updateDesignNode(createInitialDesignDocument(), "text-welcome", {
      constraints: { horizontal: "left-right", vertical: "bottom" },
    });
    const next = updateDesignNode(initial, "frame-home", { width: 740, height: 520 });
    expect(next.nodes[1]).toMatchObject({ x: 56, y: 154, width: 520, height: 64 });
    const locked = updateDesignNode(initial, "frame-home", { aspectRatioLocked: true });
    expect(decodeDocument(encodeDocument(locked)).nodes[0]?.aspectRatioLocked).toBe(true);
    const resized = updateDesignNode(locked, "frame-home", { width: 320 });
    expect(resized.nodes[0]).toMatchObject({ width: 320, height: 210 });
    expect(resized.nodes[1]).toMatchObject({ width: 100, y: -156, fontSize: 36 });
    expect(updateDesignNode(resized, "frame-home", { height: 105 }).nodes[0]).toMatchObject({
      width: 160,
      height: 105,
    });
    const minimum = updateDesignNode(locked, "frame-home", {
      layoutSizing: { width: "fixed", height: "fixed", minWidth: 320 },
    });
    expect(minimum.nodes[0]?.layoutSizing).toMatchObject({ minWidth: 320, minHeight: 210 });
    const limited = updateDesignNode(minimum, "frame-home", { width: 160 });
    expect(limited.nodes[0]).toMatchObject({ width: 320, height: 210 });
    expect(limited.nodes[1]).toMatchObject({ width: 100, y: -156 });
    const maximum = updateDesignNode(minimum, "frame-home", {
      layoutSizing: { ...minimum.nodes[0]!.layoutSizing!, maxHeight: 420 },
    });
    expect(maximum.nodes[0]?.layoutSizing).toMatchObject({ maxWidth: 640, maxHeight: 420 });
    expect(
      updateDesignNode(locked, "frame-home", {
        layoutSizing: { width: "fixed", height: "fixed", minWidth: Infinity },
      }),
    ).toBe(locked);
    const transform = {
      document: locked,
      ids: ["frame-home"],
      kind: "resize" as const,
      handle: "e",
      start: { x: 0, y: 0 },
      point: { x: 64, y: 0 },
    };
    expect(previewDesignTransform(transform).nodes[0]).toMatchObject({
      width: 704,
      height: 462,
      x: 120,
      y: 75,
    });
    expect(previewDesignTransform({ ...transform, control: true }).nodes[0]).toMatchObject({
      width: 704,
      height: 420,
    });
    const fractional = updateDesignNode(locked, "frame-home", { width: 0.64 });
    const tiny = previewDesignTransform({
      ...transform,
      document: fractional,
      point: { x: 0.64, y: 0 },
    }).nodes[0]!;
    expect(tiny.width).toBeCloseTo(1.28);
    expect(tiny.height).toBeCloseTo(0.84);
  });

  it("reflows children using auto layout padding and gap", () => {
    const initial = addTextNode(createInitialDesignDocument());
    const next = updateDesignNode(initial, "frame-home", {
      layoutModel: { kind: "auto-layout", direction: "column", padding: 16, gap: 12 },
    });
    expect(next.nodes[1]).toMatchObject({ x: 16, y: 16 });
    expect(next.nodes[2]).toMatchObject({ x: 16, y: 92 });
    const hugging = updateDesignNode(next, "frame-home", {
      layoutSizing: { width: "hug", height: "hug" },
    });
    expect(hugging.nodes[0]).toMatchObject({ width: 452, height: 148 });
    const filling = updateDesignNode(
      updateDesignNode(initial, initial.nodes[2]!.nodeId, {
        layoutSizing: { width: "fill", height: "fixed" },
      }),
      "frame-home",
      {
        layoutModel: {
          kind: "auto-layout",
          direction: "row",
          paddingLeft: 20,
          paddingRight: 30,
          gap: 10,
        },
      },
    );
    expect(filling.nodes[2]).toMatchObject({ x: 450, width: 160 });
    const wrapped = updateDesignNode(next, "frame-home", {
      layoutModel: { kind: "auto-layout", direction: "row", padding: 16, gap: 12, wrap: true },
    });
    expect(wrapped.nodes[2]).toMatchObject({ x: 16, y: 92 });
    const wrappedWithCounterSpacing = updateDesignNode(next, "frame-home", {
      layoutModel: {
        kind: "auto-layout",
        direction: "row",
        padding: 16,
        gap: 12,
        counterAxisSpacing: 28,
        wrap: true,
      },
    });
    expect(wrappedWithCounterSpacing.nodes[2]?.y).toBe(108);
    const floating = updateDesignNode(initial, initial.nodes[2]!.nodeId, {
      x: 210,
      y: 190,
      layoutSizing: { width: "fixed", height: "fixed", position: "absolute" },
    });
    expect(
      updateDesignNode(floating, "frame-home", {
        layoutModel: { kind: "auto-layout", direction: "row" },
      }).nodes[2],
    ).toMatchObject({ x: 210, y: 190 });
  });

  it("reorders nested siblings and keeps locked subtrees protected", () => {
    const initial = addTextNode(createInitialDesignDocument());
    const childId = initial.nodes[2]!.nodeId;
    const next = reorderDesignNode(initial, childId, "up");
    expect(next.nodes[0]?.childIds).toEqual([childId, "text-welcome"]);
    const locked = updateDesignNode(next, "frame-home", { locked: true });
    expect(deleteDesignNodes(locked, [childId])).toBe(locked);
  });
  it("starts with a portable frame and text layer", () => {
    const document = createInitialDesignDocument();
    expect(nodeForPage(document).map((node) => node.kind)).toEqual(["frame"]);
    expect(descendants(document, "frame-home").map((node) => node.text)).toEqual([
      "Design starts here",
    ]);
  });

  it("updates visual properties without changing node identity", () => {
    const document = createInitialDesignDocument();
    const next = updateDesignNode(document, "text-welcome", {
      text: "Canvas ready",
      x: 72,
    });
    const node = next.nodes.find(({ nodeId }) => nodeId === "text-welcome");
    expect(node).toMatchObject({ nodeId: "text-welcome", text: "Canvas ready", x: 72 });
    expect(next.documentId).toBe(document.documentId);
    expect(next.revision).toBe(1);
    expect(next.pendingOperations[0]?.kind).toBe("update-node");
  });

  it("coalesces consecutive updates to one layer into one pending operation", () => {
    const document = createInitialDesignDocument();
    const next = updateDesignNode(
      updateDesignNode(document, "text-welcome", { x: 72 }),
      "text-welcome",
      {
        y: 84,
      },
    );
    expect(next.pendingOperations).toHaveLength(1);
    expect(next.pendingOperations[0]?.fields).toEqual(["x", "y"]);
  });

  it("resolves child geometry against its parent frame", () => {
    const document = createInitialDesignDocument();
    expect(absoluteNodePosition(document, document.nodes[1]!)).toEqual({ x: 176, y: 150 });
  });

  it("adds a text layer to the active frame", () => {
    const document = addTextNode(createInitialDesignDocument());
    expect(document.nodes.at(-1)).toMatchObject({ kind: "text", text: "New text" });
    expect(document.nodes[0]?.childIds).toContain(document.nodes.at(-1)?.nodeId);
  });

  it("adds and activates a new page with its own frame", () => {
    const document = addDesignPage(createInitialDesignDocument());
    expect(document.pages).toHaveLength(2);
    expect(document.activePageId).toBe("page-2");
    expect(document.nodes.at(-1)).toMatchObject({ nodeId: "frame-2", kind: "frame" });
    const started = setPrototypeStartFrame(document, document.nodes.at(-1)!.nodeId);
    expect(decodeDocument(encodeDocument(started)).pages.at(-1)?.prototypeStartNodeId).toBe(
      "frame-2",
    );
    expect(
      setPrototypeStartFrame(started, null).pages.at(-1)?.prototypeStartNodeId,
    ).toBeUndefined();
    const configured = updatePrototypeSettings(started, {
      background: "#123456",
      device: "phone",
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(decodeDocument(encodeDocument(configured)).pages.at(-1)?.prototypeSettings).toEqual({
      background: "#123456",
      device: "phone",
      viewportWidth: 390,
      viewportHeight: 844,
    });
    expect(configured.pages[0]?.prototypeSettings).toBeUndefined();
    expect(configured.nodes).toEqual(started.nodes);
    expect(configured.pendingOperations.at(-1)?.fields).toContain("prototypeSettings");
  });

  it("adds an image layer referencing a local asset", () => {
    const document = addImageNode(createInitialDesignDocument(), "asset-1");
    expect(document.nodes.at(-1)).toMatchObject({ kind: "image", assetId: "asset-1" });
    const asset = {
      assetId: "asset-1",
      name: "Logo",
      size: 4,
      mimeType: "image/png",
      createdAt: "2026-11-09T00:00:00Z",
    };
    const stored = addAssetMeta(document, asset);
    expect(removeDesignAsset(stored, asset.assetId)).toBe(stored);
    const replacement = replaceDesignAsset(stored, asset.assetId, { ...asset, assetId: "asset-2" });
    expect(replacement.nodes.at(-1)?.assetId).toBe("asset-2");
    expect(replacement.assets.map((item) => item.assetId)).toEqual(["asset-2"]);
    const pasted = pasteDesignNodes(replacement, replacement, ["frame-home", "text-welcome"]);
    expect(pasted.documentId).toBe(replacement.documentId);
    expect(pasted.pages[0]?.nodeIds).toHaveLength(2);
    const copy = nodeForPage(pasted).at(-1)!;
    expect(pasted.nodes.find((node) => node.nodeId === copy.childIds.at(-1))?.assetId).toBe(
      "asset-2",
    );
  });

  it("round-trips through the JSON schema", () => {
    const base = createInitialDesignDocument();
    const document = {
      ...base,
      nodes: base.nodes.map((node) =>
        node.kind === "text"
          ? {
              ...node,
              typography: {
                family: "Arial",
                align: "center" as const,
                verticalAlign: "middle" as const,
              },
            }
          : node,
      ),
    };
    const withEffect = {
      ...document,
      nodes: document.nodes.map((node) => ({
        ...node,
        effects: [
          {
            effectId: "blur-qa",
            kind: "layer-blur" as const,
            x: 0,
            y: 0,
            blur: 8,
            spread: 0,
            color: "#000000",
            visible: true,
          },
        ],
      })),
    };
    const encoded = encodeDocument(withEffect);
    expect(decodeDocument(encoded)).toEqual(withEffect);
  });

  it("round-trips multiple fills and strokes with vector stroke geometry", () => {
    const base = createInitialDesignDocument();
    const document = updateDesignNode(base, "frame-home", {
      paint: {
        ...base.nodes[0]!.paint,
        fills: [{ color: "#ff0000" }, { color: "#0000ff", opacity: 0.5 }],
        strokes: [
          { color: "#111111", width: 2, cap: "round", join: "bevel", align: "outside" },
          { color: "#ffffff", width: 1, cap: "square", join: "miter", align: "inside" },
        ],
      },
    });
    expect(decodeDocument(encodeDocument(document)).nodes[0]?.paint).toMatchObject({
      fills: [{ color: "#ff0000" }, { color: "#0000ff", opacity: 0.5 }],
      strokes: [
        { color: "#111111", width: 2, cap: "round", join: "bevel", align: "outside" },
        { color: "#ffffff", width: 1, cap: "square", join: "miter", align: "inside" },
      ],
    });
  });
});
