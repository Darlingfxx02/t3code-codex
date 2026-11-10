import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { addTextNode, createInitialDesignDocument, updateDesignNode } from "./designDocument";
import { exportDesignHtml, exportDesignReact } from "./designExport";
import { DesignSceneNode } from "./DesignScene";
import { createDesignDocumentFromMarkup } from "./previewToDesign";
import { addAssetMeta, addImageNode } from "./designDocument";
import { contentAddressedDesignAssetId, saveDesignAsset } from "./designAssetStore";

it("keeps effect settings editable when importing generated HTML and React", async () => {
  const base = createInitialDesignDocument();
  const effects = [
    {
      effectId: "shadow-qa",
      kind: "drop-shadow" as const,
      visible: true,
      x: 3,
      y: 12,
      blur: 24,
      spread: 2,
      color: "rgba(0,0,0,.25)",
    },
    {
      effectId: "blur-qa",
      kind: "layer-blur" as const,
      visible: false,
      x: 0,
      y: 0,
      blur: 8,
      spread: 0,
      color: "#000000",
    },
  ];
  const document = {
    ...base,
    nodes: [
      { ...base.nodes[0]!, effects, rotation: 30, flipX: true },
      {
        ...base.nodes[1]!,
        rotation: 15,
        flipY: true,
        typography: {
          ...base.nodes[1]!.typography,
          fontStyle: "italic" as const,
          lineHeight: 150,
          lineHeightUnit: "percent" as const,
          letterSpacing: 10,
          letterSpacingUnit: "percent" as const,
          decoration: "underline line-through" as const,
          letterCase: "uppercase" as const,
          wrap: "balance" as const,
        },
      },
    ],
  };
  for (const mode of ["html", "react"] as const) {
    const captured = await createDesignDocumentFromMarkup({
      mode,
      markup: mode === "html" ? exportDesignHtml(document) : exportDesignReact(document),
    });
    expect(captured.nodes.find((node) => node.effects?.length === 2)?.effects).toEqual(effects);
    const root = captured.nodes.find((node) => node.effects?.length === 2)!;
    expect(root).toMatchObject({
      width: 640,
      height: 420,
      flipX: true,
    });
    expect(root.rotation).toBeCloseTo(30, 3);
    const text = captured.nodes.find((node) => node.text === "Design starts here")!;
    expect(text).toMatchObject({ width: 420, height: 64, flipX: true });
    expect(text.rotation).toBeCloseTo(-165, 3);
    expect(text.x).toBeCloseTo(56, 3);
    expect(text.y).toBeCloseTo(54, 3);
    expect(text.typography).toMatchObject({
      fontStyle: "italic",
      lineHeight: 150,
      lineHeightUnit: "percent",
      letterSpacingUnit: "percent",
      decoration: "underline line-through",
      letterCase: "uppercase",
      wrap: "balance",
    });
    expect(text.typography?.letterSpacing).toBeCloseTo(10, 3);
    expect(
      captured.nodes.some((node) => node.name === "filter" || node.name.startsWith("fe")),
    ).toBe(false);
    expect(captured.nodes.some((node) => node.text === "null")).toBe(false);
  }
});

it("exports fill and constraints as layout that responds to frame resizing", async () => {
  const source = addTextNode(createInitialDesignDocument());
  const document = updateDesignNode(
    updateDesignNode(source, source.nodes[2]!.nodeId, {
      layoutSizing: { width: "fill", height: "fixed" },
    }),
    "frame-home",
    { layoutModel: { kind: "auto-layout", direction: "row", padding: 20, gap: 12 } },
  );
  await using screen = await render(
    <div dangerouslySetInnerHTML={{ __html: exportDesignHtml(document) }} />,
    { router: "/design" },
  );
  const frame = screen.container.querySelector<HTMLElement>('[data-design-node="frame-home"]')!;
  const child = screen.container.querySelector<HTMLElement>(
    `[data-design-node="${source.nodes[2]!.nodeId}"]`,
  )!;
  const initial = child.getBoundingClientRect().width;
  frame.style.width = "740px";
  await expect.poll(() => child.getBoundingClientRect().width).toBeCloseTo(initial + 100, 1);
  const constrained = updateDesignNode(
    updateDesignNode(createInitialDesignDocument(), "text-welcome", {
      constraints: { horizontal: "left-right", vertical: "bottom" },
    }),
    "frame-home",
    { paint: {} },
  );
  await screen.rerender(
    <div dangerouslySetInnerHTML={{ __html: exportDesignHtml(constrained) }} />,
  );
  const root = screen.container.querySelector<HTMLElement>('[data-design-node="frame-home"]')!;
  const text = screen.container.querySelector<HTMLElement>('[data-design-node="text-welcome"]')!;
  root.style.width = "740px";
  root.style.height = "520px";
  await expect.poll(() => text.getBoundingClientRect().width).toBeCloseTo(520, 1);
  await expect
    .poll(() => text.getBoundingClientRect().top - root.getBoundingClientRect().top)
    .toBeCloseTo(154, 1);
  const grid = updateDesignNode(
    updateDesignNode(
      updateDesignNode(source, "text-welcome", { width: 100 }),
      source.nodes[2]!.nodeId,
      { width: 100 },
    ),
    "frame-home",
    { layoutModel: { kind: "grid", padding: 20, gap: 12 } },
  );
  await screen.rerender(<div dangerouslySetInnerHTML={{ __html: exportDesignHtml(grid) }} />);
  const gridRoot = screen.container.querySelector<HTMLElement>('[data-design-node="frame-home"]')!;
  const gridFirst = screen.container.querySelector<HTMLElement>(
    '[data-design-node="text-welcome"]',
  )!;
  const gridSecond = screen.container.querySelector<HTMLElement>(
    `[data-design-node="${source.nodes[2]!.nodeId}"]`,
  )!;
  expect(gridSecond.getBoundingClientRect().top).toBe(gridFirst.getBoundingClientRect().top);
  gridRoot.style.width = "250px";
  await expect
    .poll(() => gridSecond.getBoundingClientRect().top - gridFirst.getBoundingClientRect().top)
    .toBeCloseTo(76, 1);
});

it.each(
  [false, true].flatMap((flipped) =>
    (["crop", "tile"] as const).map((mode) => ({ mode, flipped })),
  ),
)(
  "keeps $mode image geometry consistent between canvas and HTML (reflected: $flipped)",
  async ({ mode, flipped }) => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="40" height="40" fill="red"/><rect x="40" width="40" height="40" fill="blue"/></svg>';
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const assetId = await contentAddressedDesignAssetId(blob);
    await saveDesignAsset(assetId, blob);
    const withImage = addImageNode(
      addAssetMeta(createInitialDesignDocument(), {
        assetId,
        name: "Test image",
        mimeType: blob.type,
        size: blob.size,
        createdAt: "2026-11-09T00:00:00Z",
        width: 80,
        height: 40,
      }),
      assetId,
      null,
      { x: 0, y: 0, width: 100, height: 100 },
    );
    const id = withImage.nodes.at(-1)!.nodeId;
    const document = updateDesignNode(withImage, id, {
      image: { mode, scale: mode === "crop" ? 2 : 0.5, offsetX: 25 },
      flipX: flipped,
      paint: { borderWidth: 10, borderColor: "black" },
    });
    const node = document.nodes.at(-1)!;
    const source = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    const sources = new Map([[assetId, source]]);
    await using screen = await render(
      <>
        <div data-image-renderer="canvas" style={{ position: "relative", width: 200, height: 200 }}>
          <DesignSceneNode document={document} node={node} selected={[]} />
        </div>
        <div
          data-image-renderer="html"
          dangerouslySetInnerHTML={{ __html: exportDesignHtml(document, sources) }}
        />
      </>,
      { router: "/design" },
    );
    const canvas = screen.container.querySelector('[data-image-renderer="canvas"]')!;
    await vi.waitFor(() => expect(canvas.querySelector("img")?.naturalWidth).toBe(80));
    for (const kind of ["canvas", "html"]) {
      const root = screen.container.querySelector<HTMLElement>(
        `[data-image-renderer="${kind}"] [data-design-node="${id}"]`,
      )!;
      const image = root.querySelector<HTMLElement>(mode === "crop" ? "img" : '[role="img"]')!;
      if (mode === "crop") {
        let bounds = image.getBoundingClientRect();
        expect(bounds.width).toBe(200);
        expect(bounds.left - root.getBoundingClientRect().left).toBe(flipped ? -75 : -25);
        root.style.width = "200px";
        bounds = image.getBoundingClientRect();
        expect(bounds.width).toBe(400);
        expect(bounds.left - root.getBoundingClientRect().left).toBe(flipped ? -150 : -50);
      } else {
        expect(getComputedStyle(image).backgroundSize).toBe("40px 20px");
        root.style.width = "200px";
        expect(image.getBoundingClientRect().width).toBe(200);
        expect(getComputedStyle(image).backgroundSize).toBe("40px 20px");
      }
    }
    const react = exportDesignReact(document, sources);
    expect(react).toContain(mode === "crop" ? "translate(25%, 0%) scale(2)" : "40px 20px");
  },
);

it.each([true, false])(
  "clips overflowing frame children in canvas and export when enabled (%s)",
  async (clipContent) => {
    const document = updateDesignNode(
      updateDesignNode(createInitialDesignDocument(), "frame-home", {
        width: 100,
        height: 100,
        clipContent,
      }),
      "text-welcome",
      { x: 80, y: 80, width: 50, height: 50 },
    );
    await using screen = await render(
      <div style={{ width: 900, height: 600 }}>
        <DesignSceneNode
          document={document}
          node={document.nodes[0]!}
          selected={[]}
          tool="select"
          onStart={() => undefined}
        />
      </div>,
      { router: "/design" },
    );
    const assertHit = () => {
      const frame = screen.container.querySelector<HTMLElement>('[data-design-node="frame-home"]')!;
      const rect = frame.getBoundingClientRect();
      const hit = globalThis.document
        .elementFromPoint(rect.left + 115, rect.top + 115)
        ?.closest("[data-design-node]");
      expect(hit?.getAttribute("data-design-node") === "text-welcome").toBe(!clipContent);
    };
    assertHit();
    await screen.rerender(<div dangerouslySetInnerHTML={{ __html: exportDesignHtml(document) }} />);
    assertHit();
  },
);
