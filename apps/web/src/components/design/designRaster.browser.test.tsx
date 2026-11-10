import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import interFont from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { render } from "../../../test/render";
import { DesignSceneNode } from "./DesignScene";
import { createInitialDesignDocument } from "./designDocument";
import { rasterizeDesignScene } from "./designRaster";
import { DesignPixelPreview } from "./DesignPixelPreview";

it("keeps visible content when resuming a suspended or disabled pixel preview", async () => {
  const document = createInitialDesignDocument();
  const view = (density: 0 | 1, suspended = false) => (
    <div style={{ position: "relative", width: 8, height: 8 }}>
      <DesignPixelPreview
        document={document}
        mode={{ density }}
        suspended={suspended}
        zoom={1}
        viewport={{ x: 0, y: 0, width: 8, height: 8 }}
        labels={null}
      >
        <div style={{ position: "absolute", width: 4, height: 4, background: "red" }} />
      </DesignPixelPreview>
    </div>
  );
  await using screen = await render(view(1), { router: "/design" });
  const ready = async () =>
    await vi.waitFor(() =>
      expect(screen.container.querySelector('[data-design-pixel-preview="1"]')).not.toBeNull(),
    );
  await ready();
  const visible = () => {
    const raster = screen.container.querySelector<HTMLCanvasElement>(
      '[data-design-pixel-preview="1"]',
    );
    if (raster) expect(raster.width).toBeGreaterThan(0);
    else
      expect(getComputedStyle(screen.container.querySelector("[data-design-scene]")!).opacity).toBe(
        "1",
      );
  };
  await screen.rerender(view(0));
  expect(screen.container.querySelector("canvas")!.width).toBe(0);
  await screen.rerender(view(1));
  visible();
  await ready();
  await screen.rerender(view(1, true));
  await screen.rerender(view(1));
  visible();
  await ready();
});

it("rasterizes the scene at document pixel density and keeps cropped previews on the same pixel grid", async () => {
  const base = createInitialDesignDocument();
  const node = {
    ...base.nodes[0]!,
    kind: "vector" as const,
    x: 1.25,
    y: 1.25,
    width: 3,
    height: 3,
    childIds: [],
    fill: "#ff0000",
    border: null,
    paint: { radius: 0, borderWidth: 0 },
    vector: { path: "M0.25 0.25H2.75V2.75H0.25Z", width: 3, height: 3, closed: true },
    effects: [
      {
        effectId: "raster-shadow",
        kind: "drop-shadow" as const,
        visible: true,
        x: 2,
        y: 2,
        blur: 0,
        spread: 0,
        color: "#0000ff",
      },
    ],
  };
  const document = { ...base, nodes: [node] };
  await using screen = await render(
    <div data-raster-scene="" style={{ position: "relative", width: 1, height: 1 }}>
      <DesignSceneNode document={document} node={node} selected={[]} />
    </div>,
    { router: "/design" },
  );
  const scene = screen.container.querySelector<HTMLElement>("[data-raster-scene]")!;
  const signal = new AbortController().signal;
  const one = await rasterizeDesignScene(scene, { x: 0, y: 0, width: 8, height: 8 }, 1, signal);
  scene.style.opacity = "0";
  const two = await rasterizeDesignScene(scene, { x: 0, y: 0, width: 8, height: 8 }, 2, signal);
  const crop = await rasterizeDesignScene(
    scene,
    { x: 1.2, y: 1.2, width: 4, height: 4 },
    1,
    signal,
  );
  expect([one.canvas.width, one.canvas.height]).toEqual([8, 8]);
  expect([two.canvas.width, two.canvas.height]).toEqual([16, 16]);
  expect(crop.box).toEqual({ x: 1, y: 1, width: 5, height: 5 });
  const pixel = (canvas: HTMLCanvasElement, x: number, y: number) => [
    ...canvas.getContext("2d")!.getImageData(x, y, 1, 1).data,
  ];
  expect(pixel(one.canvas, 2, 2)).toEqual([255, 0, 0, 255]);
  expect(pixel(two.canvas, 4, 4)).toEqual([255, 0, 0, 255]);
  expect(pixel(one.canvas, 5, 5).slice(0, 3)).toEqual([0, 0, 255]);
  expect(pixel(one.canvas, 5, 5)[3]).toBeGreaterThan(0);
  expect(pixel(one.canvas, 7, 7)).toEqual([0, 0, 0, 0]);
  expect(pixel(one.canvas, 1, 1)).toEqual(pixel(crop.canvas, 0, 0));
  expect(pixel(one.canvas, 1, 1)[3]).toBeGreaterThan(0);
  expect(pixel(one.canvas, 1, 1)[3]).toBeLessThan(255);
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    rasterizeDesignScene(scene, { x: 0, y: 0, width: 8, height: 8 }, 1, cancelled.signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  await expect(
    rasterizeDesignScene(scene, { x: 0, y: 0, width: 20000, height: 20000 }, 2, signal),
  ).rejects.toThrow("Zoom in to use pixel preview");
});

it("embeds blob images and loaded webfonts while preserving the scene's clipping", async () => {
  const unusedFont = URL.createObjectURL(new Blob([], { type: "font/woff2" }));
  URL.revokeObjectURL(unusedFont);
  const image = new OffscreenCanvas(2, 1);
  const imageContext = image.getContext("2d")!;
  imageContext.fillStyle = "red";
  imageContext.fillRect(0, 0, 1, 1);
  imageContext.fillStyle = "blue";
  imageContext.fillRect(1, 0, 1, 1);
  using resource = {
    url: URL.createObjectURL(await image.convertToBlob()),
    [Symbol.dispose]() {
      URL.revokeObjectURL(this.url);
    },
  };
  await using screen = await render(
    <>
      <style>{`@font-face {font-family: "Raster QA"; src: url("${interFont}") format("woff2"); font-weight:100 900;} @font-face {font-family: "Raster QA"; src: url("${unusedFont}"); font-weight:700;}`}</style>
      <div data-raster-scene="" style={{ position: "relative", width: 1, height: 1 }}>
        <div style={{ position: "absolute", width: 20, height: 20, overflow: "hidden" }}>
          <img
            src={resource.url}
            alt="QA"
            style={{ position: "absolute", width: 40, height: 20, maxWidth: "none" }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            top: 24,
            width: 150,
            height: 32,
            fontFamily: "Raster QA",
            fontSize: 24,
            lineHeight: "32px",
            color: "black",
          }}
        >
          MMMM
        </div>
        <div
          style={{
            position: "absolute",
            top: 64,
            width: 40,
            height: 20,
            background: "linear-gradient(to right, red 50%, blue 50%)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,.1)",
              backdropFilter: "blur(4px)",
            }}
          />
        </div>
      </div>
    </>,
    { router: "/design" },
  );
  const scene = screen.container.querySelector<HTMLElement>("[data-raster-scene]")!;
  expect((await scene.ownerDocument.fonts.load('24px "Raster QA"', "MMMM")).length).toBe(1);
  await scene.querySelector("img")!.decode();
  const raster = await rasterizeDesignScene(
    scene,
    { x: 0, y: 0, width: 160, height: 96 },
    1,
    new AbortController().signal,
  );
  const context = raster.canvas.getContext("2d")!;
  expect([...context.getImageData(4, 4, 1, 1).data]).toEqual([255, 0, 0, 255]);
  expect([...context.getImageData(24, 4, 1, 1).data]).toEqual([0, 0, 0, 0]);
  const blur = context.getImageData(18, 74, 1, 1).data;
  expect(blur[0]).toBeGreaterThan(40);
  expect(blur[2]).toBeGreaterThan(40);
  const ink = context.getImageData(0, 24, 150, 32).data;
  expect([...ink].filter((_, index) => index % 4 === 3 && ink[index]! > 0).length).toBeGreaterThan(
    400,
  );
});
