import { expect, it } from "vite-plus/test";
import { createInitialDesignDocument } from "./designDocument";
import { designCanvasGeometry, designPageGeometry, designViewportNodes } from "./designVisibility";

it("retains an offscreen ancestor of visible content and honors clipping, visibility and pinned editing", () => {
  const base = createInitialDesignDocument();
  const source = {
    ...base,
    nodes: [
      { ...base.nodes[0]!, x: -10000, y: 0, width: 100, height: 100, clipContent: false },
      { ...base.nodes[1]!, x: 10100, y: 10, width: 80, height: 40 },
    ],
  };
  const viewport = { x: 0, y: 0, width: 500, height: 500 };
  const index = designCanvasGeometry(source);
  designViewportNodes(index.entries, { x: 8000, y: 0, width: 500, height: 500 }, []);
  expect(designCanvasGeometry(source)).toBe(index);
  expect(designCanvasGeometry({ ...source, nodes: [...source.nodes] })).not.toBe(index);

  const geometry = (document: typeof source) =>
    designPageGeometry(document, new Map(document.nodes.map((node) => [node.nodeId, node])));
  expect([...designViewportNodes(geometry(source), viewport, [])]).toEqual([
    "text-welcome",
    "frame-home",
  ]);
  const clipped = {
    ...source,
    nodes: source.nodes.map((node) =>
      node.nodeId === "frame-home" ? { ...node, clipContent: true } : node,
    ),
  };
  expect(designViewportNodes(geometry(clipped), viewport, []).size).toBe(0);
  expect([...designViewportNodes(geometry(clipped), viewport, ["text-welcome"])]).toEqual([
    "text-welcome",
    "frame-home",
  ]);
  const hidden = {
    ...clipped,
    nodes: clipped.nodes.map((node) =>
      node.nodeId === "frame-home" ? { ...node, visible: false } : node,
    ),
  };
  expect(designViewportNodes(geometry(hidden), viewport, ["text-welcome"]).size).toBe(0);
  const rotated = {
    ...source,
    nodes: [
      { ...source.nodes[0]!, x: 100, y: 100, width: 200, height: 100, rotation: 90 },
      { ...source.nodes[1]!, x: 0, y: 0, width: 20, height: 10 },
    ],
  };
  const rotatedGeometry = geometry(rotated);
  expect(rotatedGeometry.get("text-welcome")?.bounds).toMatchObject({
    x: 240,
    y: 50,
    width: 10,
    height: 20,
  });
  expect(
    designViewportNodes(rotatedGeometry, { x: 242, y: 55, width: 2, height: 2 }, []).has(
      "text-welcome",
    ),
  ).toBe(true);
  const stroked = {
    ...source,
    nodes: [
      { ...source.nodes[0]!, x: 0 },
      {
        ...source.nodes[1]!,
        x: 600,
        y: 100,
        width: 20,
        height: 10,
        vector: { path: "M 0 0 L 20 10", width: 20, height: 10, closed: false },
        paint: { borderWidth: 400 },
      },
    ],
  };
  expect(designViewportNodes(geometry(stroked), viewport, []).has("text-welcome")).toBe(true);
  const shadowed = {
    ...source,
    nodes: [
      { ...source.nodes[0]!, x: 0 },
      {
        ...source.nodes[1]!,
        x: 600,
        width: 20,
        effects: [
          {
            effectId: "shadow",
            kind: "drop-shadow" as const,
            x: -150,
            y: 0,
            blur: 8,
            spread: 0,
            color: "#000000",
            visible: true,
          },
        ],
      },
    ],
  };
  expect(
    designViewportNodes(geometry(shadowed), { x: 450, y: 0, width: 50, height: 500 }, []).has(
      "text-welcome",
    ),
  ).toBe(true);
});
