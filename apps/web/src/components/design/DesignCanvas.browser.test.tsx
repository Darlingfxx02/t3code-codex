import { useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import "~/index.css";
import { act, render } from "../../../test/render";
import { DesignCanvas, type DesignTool } from "./DesignCanvas";
import { isMacPlatform } from "../../lib/utils";
import { createDesignRotationOrigin, type DesignRotationOrigin } from "./designRotationOrigin";
import {
  addFrameNode,
  addVectorPath,
  createInitialDesignDocument,
  reparentDesignNode,
  updateDesignNode,
  type DesignDocument,
} from "./designDocument";

function CanvasHarness({
  commit,
  initial = createInitialDesignDocument(),
  selection = ["frame-home"],
}: {
  commit: (document: DesignDocument) => void;
  initial?: DesignDocument;
  selection?: readonly string[];
}) {
  const [document, setDocument] = useState(initial);
  const [selected, select] = useState<readonly string[]>(selection);
  const [tool, setTool] = useState<DesignTool>("select");
  const [rotationOrigin, setRotationOrigin] = useState<DesignRotationOrigin | null>(null);
  const [rotationOriginVisible, setRotationOriginVisible] = useState(false);
  return (
    <div style={{ width: 1100, height: 800, display: "flex" }}>
      <DesignCanvas
        document={document}
        selected={selected}
        onSelect={select}
        rotationOrigin={rotationOrigin}
        rotationOriginVisible={rotationOriginVisible}
        onRotationOriginToggle={() => setRotationOriginVisible((value) => !value)}
        onRotationOriginChange={(point, ids) =>
          setRotationOrigin(point ? createDesignRotationOrigin(document, ids, point) : null)
        }
        onCommit={(next) => {
          commit(next);
          setDocument(next);
        }}
        onKeyDown={() => undefined}
        onUndo={() => undefined}
        onRedo={() => undefined}
        canUndo={false}
        canRedo={false}
        onImport={() => undefined}
        tool={tool}
        onToolChange={setTool}
      />
    </div>
  );
}

it("changes ruler and pixel views without changing the design or consuming text input shortcuts", async () => {
  const commit = vi.fn();
  await using screen = await render(<CanvasHarness commit={commit} />, { router: "/design" });
  const surface = screen.getByLabelText("Canvas editing surface");
  await expect
    .element(screen.getByLabelText("Drag down to create a horizontal guide"))
    .not.toBeInTheDocument();
  await userEvent.click(surface, { position: { x: 30, y: 30 } });
  await userEvent.keyboard("{Shift>}r{/Shift}");
  await expect
    .element(screen.getByLabelText("Drag down to create a horizontal guide"))
    .toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Zoom and view options", exact: true }));
  const zoom = screen.getByRole("textbox", { name: "Canvas zoom", exact: true });
  await userEvent.fill(zoom, "400%");
  await userEvent.keyboard("{Enter}");
  await vi.waitFor(() =>
    expect(
      screen.container.querySelector<HTMLElement>("[data-design-pixel-grid]")?.style.backgroundSize,
    ).toBe("4px 4px"),
  );
  await userEvent.keyboard("{Escape}");
  await userEvent.click(surface, { position: { x: 30, y: 30 } });
  await userEvent.keyboard("{Shift>}'{/Shift}");
  await vi.waitFor(() =>
    expect(screen.container.querySelector("[data-design-pixel-grid]")).toBeNull(),
  );
  await userEvent.click(screen.getByRole("button", { name: "Zoom and view options", exact: true }));
  await userEvent.click(screen.getByRole("menuitem", { name: /^Pixel preview/u }));
  await userEvent.click(screen.getByRole("menuitemradio", { name: "1x", exact: true }));
  await vi.waitFor(() => {
    const raster = screen.container.querySelector<HTMLCanvasElement>(
      '[data-design-pixel-preview="1"]',
    );
    expect(raster?.width).toBeGreaterThan(0);
    expect(raster?.height).toBeGreaterThan(0);
    expect(getComputedStyle(screen.container.querySelector("[data-design-scene]")!).opacity).toBe(
      "0",
    );
  });
  await userEvent.click(screen.getByRole("button", { name: "Zoom and view options", exact: true }));
  await userEvent.click(screen.getByRole("menuitem", { name: /^Pixel preview/u }));
  await userEvent.click(screen.getByRole("menuitemradio", { name: "2x", exact: true }));
  await vi.waitFor(() => {
    const raster = screen.container.querySelector<HTMLCanvasElement>(
      '[data-design-pixel-preview="2"]',
    );
    expect(raster?.width).toBe(Number.parseFloat(raster!.style.width) * 2);
  });
  await userEvent.click(surface, { position: { x: 30, y: 30 } });
  await userEvent.keyboard(
    isMacPlatform(navigator.platform)
      ? "{Control>}p{/Control}"
      : "{Control>}{Alt>}p{/Alt}{/Control}",
  );
  await vi.waitFor(() =>
    expect(screen.container.querySelector("[data-design-pixel-preview]")).toBeNull(),
  );
  expect(commit).not.toHaveBeenCalled();
});

it("measures a canvas distance without creating a design layer", async () => {
  const commit = vi.fn();
  using _capture = vi
    .spyOn(HTMLElement.prototype, "setPointerCapture")
    .mockImplementation(() => undefined);
  await using screen = await render(<CanvasHarness commit={commit} />, { router: "/design" });
  await userEvent.click(screen.getByRole("button", { name: "Measure (M)", exact: true }));
  const surface = screen.getByLabelText("Canvas editing surface").element();
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 4, clientX: 120, clientY: 140 }),
    ),
  );
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, pointerId: 4, clientX: 200, clientY: 180 }),
    ),
  );
  await vi.waitFor(() =>
    expect(screen.container.querySelector('[aria-label^="Measurement "]')).not.toBeNull(),
  );
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 4, clientX: 200, clientY: 180 }),
    ),
  );
  expect(commit).not.toHaveBeenCalled();
});

it("creates a canvas section as an unclipped top-level container", async () => {
  const commit = vi.fn();
  using _capture = vi
    .spyOn(HTMLElement.prototype, "setPointerCapture")
    .mockImplementation(() => undefined);
  await using screen = await render(<CanvasHarness commit={commit} />, { router: "/design" });
  await userEvent.click(screen.getByRole("button", { name: "Section tool (S)", exact: true }));
  const surface = screen.getByLabelText("Canvas editing surface").element();
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 5, clientX: 160, clientY: 160 }),
    ),
  );
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 5, clientX: 320, clientY: 280 }),
    ),
  );
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0]?.[0].nodes.at(-1)).toMatchObject({
    kind: "frame",
    name: "Section",
    parentId: null,
    clipContent: false,
    section: true,
    width: 160,
    height: 120,
  });
});

it("creates a slice region with explicit export semantics", async () => {
  const commit = vi.fn();
  using _capture = vi
    .spyOn(HTMLElement.prototype, "setPointerCapture")
    .mockImplementation(() => undefined);
  await using screen = await render(<CanvasHarness commit={commit} />, { router: "/design" });
  await userEvent.click(screen.getByRole("button", { name: "Slice tool", exact: true }));
  const surface = screen.getByLabelText("Canvas editing surface").element();
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 6, clientX: 180, clientY: 180 }),
    ),
  );
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 6, clientX: 300, clientY: 260 }),
    ),
  );
  expect(commit.mock.calls[0]?.[0].nodes.at(-1)).toMatchObject({
    kind: "frame",
    name: "Slice",
    slice: true,
    clipContent: false,
  });
});

it("edits text through pixel preview and repaints the committed change", async () => {
  const commit = vi.fn();
  await using screen = await render(
    <CanvasHarness commit={commit} selection={["text-welcome"]} />,
    { router: "/design" },
  );
  await act(() => screen.getByLabelText("Canvas editing surface").element().focus());
  await userEvent.keyboard(
    isMacPlatform(navigator.platform)
      ? "{Control>}p{/Control}"
      : "{Control>}{Alt>}p{/Alt}{/Control}",
  );
  await vi.waitFor(() =>
    expect(screen.container.querySelector('[data-design-pixel-preview="1"]')).not.toBeNull(),
  );
  await userEvent.dblClick(screen.getByRole("button", { name: "Welcome heading", exact: true }));
  const editor = screen.getByRole("textbox", { name: "Edit Welcome heading", exact: true });
  await expect.element(editor).toBeVisible();
  expect(getComputedStyle(screen.container.querySelector("[data-design-scene]")!).opacity).toBe(
    "1",
  );
  expect(getComputedStyle(screen.container.querySelector("canvas")!).display).toBe("none");
  await userEvent.fill(editor, "Raster edited");
  expect(commit).not.toHaveBeenCalled();
  await userEvent.keyboard("{Control>}{Enter}{/Control}");
  await vi.waitFor(() => expect(commit).toHaveBeenCalledTimes(1));
  expect(
    commit.mock.calls[0]![0].nodes.find(
      (node: DesignDocument["nodes"][number]) => node.nodeId === "text-welcome",
    )?.text,
  ).toBe("Raster edited");
  await vi.waitFor(() => {
    expect(screen.container.querySelector('[data-design-pixel-preview="1"]')).not.toBeNull();
    expect(getComputedStyle(screen.container.querySelector("[data-design-scene]")!).opacity).toBe(
      "0",
    );
  });
});

it.each(["Resize", "Scale"] as const)(
  "previews every %s against gesture origin and commits once on release",
  async (kind) => {
    const commit = vi.fn();
    using _capture = vi
      .spyOn(HTMLElement.prototype, "setPointerCapture")
      .mockImplementation(() => undefined);
    await using screen = await render(<CanvasHarness commit={commit} />, { router: "/design" });
    if (kind === "Scale") {
      await act(() => screen.getByLabelText("Canvas editing surface").element().focus());
      await userEvent.keyboard("k");
    }
    const handle = screen.getByRole("button", { name: `${kind} se`, exact: true }).element();
    const surface = screen.getByLabelText("Canvas editing surface").element();
    await act(() =>
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 1,
          clientX: 400,
          clientY: 400,
        }),
      ),
    );
    await act(() =>
      surface.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientX: 420,
          clientY: 430,
        }),
      ),
    );
    expect(commit).not.toHaveBeenCalled();
    await act(() =>
      surface.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientX: 440,
          clientY: 460,
        }),
      ),
    );
    await act(() =>
      surface.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 440, clientY: 460 }),
      ),
    );
    expect(commit).toHaveBeenCalledTimes(1);
    const next = commit.mock.calls[0]?.[0] as DesignDocument;
    if (kind === "Resize") expect(next.nodes[0]).toMatchObject({ width: 680, height: 480 });
    else {
      const factor = 1 + (40 * 640 + 60 * 420) / (640 ** 2 + 420 ** 2);
      expect(next.nodes[0]!.width).toBeCloseTo(640 * factor);
      expect(next.nodes[0]!.height).toBeCloseTo(420 * factor);
      expect(next.nodes[1]!.fontSize).toBeCloseTo(36 * factor);
    }
  },
);

it.each([false, true])(
  "selects layers without writing canceled moves or flow-child moves (flow %s)",
  async (flow) => {
    const commit = vi.fn();
    using _capture = vi
      .spyOn(HTMLElement.prototype, "setPointerCapture")
      .mockImplementation(() => undefined);
    const initial = flow
      ? updateDesignNode(createInitialDesignDocument(), "frame-home", {
          layoutModel: { kind: "auto-layout", direction: "row" },
        })
      : createInitialDesignDocument();
    await using screen = await render(<CanvasHarness commit={commit} initial={initial} />, {
      router: "/design",
    });
    const node = screen.getByRole("button", { name: "Welcome heading", exact: true });
    await userEvent.click(node);
    await expect.element(node).toHaveAttribute("aria-pressed", "true");
    const surface = screen.getByLabelText("Canvas editing surface").element();
    await act(() =>
      node.element().dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 1,
          clientX: 200,
          clientY: 200,
        }),
      ),
    );
    await act(() =>
      surface.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientX: 230,
          clientY: 230,
        }),
      ),
    );
    await act(() =>
      surface.dispatchEvent(
        new PointerEvent(flow ? "pointerup" : "pointercancel", {
          bubbles: true,
          pointerId: 1,
          clientX: 230,
          clientY: 230,
        }),
      ),
    );
    expect(commit).not.toHaveBeenCalled();
  },
);

it("places a drawn vector in the frame at the gesture origin", async () => {
  const commit = vi.fn();
  using _capture = vi
    .spyOn(HTMLElement.prototype, "setPointerCapture")
    .mockImplementation(() => undefined);
  await using screen = await render(<CanvasHarness commit={commit} />, { router: "/design" });
  const surface = screen.getByLabelText("Canvas editing surface").element();
  await userEvent.click(screen.getByLabelText("Canvas editing surface"), {
    position: { x: 30, y: 30 },
  });
  await userEvent.keyboard("l");
  const rect = screen
    .getByRole("button", { name: "Home screen", exact: true })
    .element()
    .getBoundingClientRect();
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        clientX: rect.left + 84,
        clientY: rect.top + 108,
      }),
    ),
  );
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        clientX: rect.left + 164,
        clientY: rect.top + 148,
      }),
    ),
  );
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0]?.[0].nodes.at(-1)).toMatchObject({
    kind: "vector",
    parentId: "frame-home",
    x: 84,
    y: 108,
    width: 80,
    height: 40,
  });
});

it("edits a bezier handle on the selected vector and commits once", async () => {
  const source = addVectorPath(createInitialDesignDocument(), [
    { x: 140, y: 140, outHandle: { x: 36, y: 0 } },
    { x: 240, y: 220, inHandle: { x: -36, y: 0 } },
  ]);
  const vectorId = source.nodes.at(-1)!.nodeId;
  const commit = vi.fn();
  using _capture = vi
    .spyOn(HTMLElement.prototype, "setPointerCapture")
    .mockImplementation(() => undefined);
  await using screen = await render(
    <CanvasHarness commit={commit} initial={source} selection={[vectorId]} />,
    { router: "/design" },
  );
  const handle = screen
    .getByRole("button", { name: "Outgoing curve handle", exact: true })
    .element();
  const surface = screen.getByLabelText("Canvas editing surface").element();
  await act(() =>
    handle.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 11, clientX: 200, clientY: 140 }),
    ),
  );
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointermove", { bubbles: true, pointerId: 11, clientX: 220, clientY: 160 }),
    ),
  );
  expect(commit).not.toHaveBeenCalled();
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 11, clientX: 220, clientY: 160 }),
    ),
  );
  expect(commit).toHaveBeenCalledTimes(1);
  expect(
    commit.mock.calls[0]?.[0].nodes.find(
      (node: DesignDocument["nodes"][number]) => node.nodeId === vectorId,
    )?.vector?.path,
  ).toContain("C");
});

it("edits a gradient direction handle on the selected vector", async () => {
  const source = updateDesignNode(createInitialDesignDocument(), "frame-home", {
    kind: "vector",
    childIds: [],
    vector: { path: "M 0 0 L 640 0 L 640 420 L 0 420 Z", width: 640, height: 420, closed: true },
    paint: {
      fills: [
        {
          color: "#ffffff",
          kind: "linear-gradient",
          angle: 0,
          stops: [
            { color: "#ffffff", position: 0 },
            { color: "#000000", position: 1 },
          ],
        },
      ],
    },
  });
  const commit = vi.fn();
  using _capture = vi
    .spyOn(HTMLElement.prototype, "setPointerCapture")
    .mockImplementation(() => undefined);
  await using screen = await render(
    <CanvasHarness commit={commit} initial={source} selection={["frame-home"]} />,
    { router: "/design" },
  );
  const handle = screen
    .getByRole("button", { name: "Gradient direction handle", exact: true })
    .element();
  const surface = screen.getByLabelText("Canvas editing surface").element();
  await act(() =>
    handle.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 21, clientX: 500, clientY: 300 }),
    ),
  );
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 21, clientX: 300, clientY: 500 }),
    ),
  );
  expect(commit).toHaveBeenCalledTimes(1);
  expect(commit.mock.calls[0]?.[0].nodes[0]?.paint?.fills?.[0]?.angle).not.toBe(0);
});

it("creates editable Bézier handles when a Pen point is dragged", async () => {
  const commit = vi.fn();
  using _capture = vi
    .spyOn(HTMLElement.prototype, "setPointerCapture")
    .mockImplementation(() => undefined);
  await using screen = await render(<CanvasHarness commit={commit} />, { router: "/design" });
  const surface = screen.getByLabelText("Canvas editing surface").element();
  await act(() => surface.focus());
  await userEvent.keyboard("p");
  const rect = surface.getBoundingClientRect();
  const point = (type: "pointerdown" | "pointermove" | "pointerup", x: number, y: number) =>
    act(() =>
      surface.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 7,
          clientX: rect.left + x,
          clientY: rect.top + y,
        }),
      ),
    );
  await point("pointerdown", 180, 180);
  await point("pointermove", 210, 200);
  await point("pointerup", 210, 200);
  await point("pointerdown", 300, 180);
  await point("pointerup", 300, 180);
  await userEvent.keyboard("{Enter}");
  expect(commit).toHaveBeenCalledTimes(1);
  const vector = commit.mock.calls[0]?.[0].nodes.at(-1)?.vector;
  expect(vector?.points?.[0]).toMatchObject({
    inHandle: { x: -30, y: -20 },
    outHandle: { x: 30, y: 20 },
  });
});

it("keeps a manually resized fill axis fixed while preserving the other fill axis", async () => {
  const initial = updateDesignNode(
    updateDesignNode(createInitialDesignDocument(), "frame-home", {
      layoutModel: { kind: "auto-layout", direction: "row", padding: 20 },
    }),
    "text-welcome",
    { layoutSizing: { width: "fill", height: "fill" } },
  );
  const original = initial.nodes.find((node) => node.nodeId === "text-welcome")!;
  const commit = vi.fn();
  using _capture = vi
    .spyOn(HTMLElement.prototype, "setPointerCapture")
    .mockImplementation(() => undefined);
  await using screen = await render(
    <CanvasHarness commit={commit} initial={initial} selection={["text-welcome"]} />,
    { router: "/design" },
  );
  const handle = screen.getByRole("button", { name: "Resize e", exact: true }).element();
  const surface = screen.getByLabelText("Canvas editing surface").element();
  await act(() =>
    handle.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, clientX: 200, clientY: 200 }),
    ),
  );
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: 240, clientY: 200 }),
    ),
  );
  expect(commit).toHaveBeenCalledTimes(1);
  expect(
    commit.mock.calls[0]?.[0].nodes.find(
      (node: DesignDocument["nodes"][number]) => node.nodeId === "text-welcome",
    ),
  ).toMatchObject({
    width: original.width + 40,
    height: original.height,
    layoutSizing: { width: "fixed", height: "fill" },
  });
});

it("keeps offscreen descendants out of the DOM and reveals them when panning", async () => {
  const base = createInitialDesignDocument();
  const template = base.nodes[1]!;
  const children = Array.from({ length: 600 }, (_, index) => ({
    ...template,
    nodeId: `item-${index}`,
    name: `Item ${index}`,
    x: index * 200,
    y: 100,
    width: 100,
    height: 30,
  }));
  const initial = {
    ...base,
    nodes: [
      { ...base.nodes[0]!, clipContent: false, childIds: children.map((node) => node.nodeId) },
      ...children,
    ],
  };
  await using screen = await render(<CanvasHarness initial={initial} commit={() => undefined} />, {
    router: "/design",
  });
  const count = () => screen.container.querySelectorAll("[data-design-node]").length;
  expect(count()).toBeLessThan(30);
  await expect
    .element(screen.getByRole("button", { name: "Item 0", exact: true }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Item 40", exact: true }))
    .not.toBeInTheDocument();
  const surface = screen.getByLabelText("Canvas editing surface").element();
  await act(() =>
    surface.dispatchEvent(
      new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaX: 8000 }),
    ),
  );
  await expect
    .element(screen.getByRole("button", { name: "Item 40", exact: true }))
    .toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Item 0", exact: true }))
    .not.toBeInTheDocument();
  expect(count()).toBeLessThan(30);
});

it.each(
  [false, true].flatMap((parentFlipped) =>
    (["move", "resize", "rotate", "resize locked", "resize unlocked with Control"] as const).map(
      (kind) => ({ kind, parentFlipped }),
    ),
  ),
)(
  "keeps nested $kind in world coordinates (reflected parent: $parentFlipped)",
  async ({ kind, parentFlipped }) => {
    const initial = updateDesignNode(
      updateDesignNode(createInitialDesignDocument(), "frame-home", {
        rotation: 90,
        flipX: parentFlipped,
        clipContent: false,
      }),
      "text-welcome",
      {
        x: 20,
        y: 10,
        width: 80,
        height: 40,
        rotation: 30,
        aspectRatioLocked: kind.startsWith("resize "),
      },
    );
    const commit = vi.fn();
    using _capture = vi
      .spyOn(HTMLElement.prototype, "setPointerCapture")
      .mockImplementation(() => undefined);
    await using screen = await render(
      <CanvasHarness initial={initial} selection={["text-welcome"]} commit={commit} />,
      { router: "/design" },
    );
    const node = screen.getByRole("button", { name: "Welcome heading", exact: true }).element();
    const painted = node.getBoundingClientRect();
    const overlay = screen.container
      .querySelector<HTMLElement>("[data-design-selection]")!
      .getBoundingClientRect();
    for (const field of ["left", "top", "width", "height"] as const)
      expect(overlay[field]).toBeCloseTo(painted[field], 3);
    const surface = screen.getByLabelText("Canvas editing surface").element();
    const handle =
      kind === "move"
        ? node
        : screen
            .getByRole("button", {
              name: kind.startsWith("resize") ? "Resize e" : "Rotate selection",
              exact: true,
            })
            .element();
    const center = { x: painted.left + painted.width / 2, y: painted.top + painted.height / 2 };
    const start = kind === "rotate" ? { x: center.x + 100, y: center.y } : { x: 100, y: 100 };
    const end =
      kind === "rotate"
        ? { x: center.x, y: center.y + 100 }
        : kind.startsWith("resize")
          ? { x: parentFlipped ? 120 : 80, y: 100 + 20 * Math.sqrt(3) }
          : { x: 140, y: 100 };
    await act(() =>
      handle.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId: 1,
          clientX: start.x,
          clientY: start.y,
          ctrlKey: kind === "resize unlocked with Control",
        }),
      ),
    );
    await act(() =>
      surface.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId: 1,
          clientX: end.x,
          clientY: end.y,
          ctrlKey: kind === "resize unlocked with Control",
        }),
      ),
    );
    expect(commit).not.toHaveBeenCalled();
    await act(() =>
      surface.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: 1,
          clientX: end.x,
          clientY: end.y,
          ctrlKey: kind === "resize unlocked with Control",
        }),
      ),
    );
    expect(commit).toHaveBeenCalledTimes(1);
    const changed = (commit.mock.calls[0]![0] as DesignDocument).nodes.find(
      (node) => node.nodeId === "text-welcome",
    )!;
    if (kind === "move") {
      expect(changed.x).toBeCloseTo(20, 4);
      expect(changed.y).toBeCloseTo(-30, 4);
    } else if (kind.startsWith("resize")) {
      expect(changed.width).toBeCloseTo(120, 4);
      expect(changed.height).toBeCloseTo(kind === "resize locked" ? 60 : 40, 4);
      expect(changed.x).toBeCloseTo((parentFlipped ? -1 : 1) * 10 * Math.sqrt(3), 4);
      expect(changed.y).toBeCloseTo(
        (kind === "resize locked" ? 10 : 20) - (parentFlipped ? 20 : 0),
        4,
      );
    } else {
      expect(changed.rotation).toBeCloseTo(parentFlipped ? -60 : 120, 4);
      expect(changed.x).toBeCloseTo(20, 4);
      expect(changed.y).toBeCloseTo(10, 4);
    }
  },
);

it("reparents a moved layer into the deepest frame under the drop point", async () => {
  let initial = reparentDesignNode(createInitialDesignDocument(), "text-welcome", null);
  initial = updateDesignNode(initial, "text-welcome", {
    x: 40,
    y: 40,
    width: 80,
    height: 32,
  });
  initial = addFrameNode(initial);
  const outerId = initial.nodes.at(-1)!.nodeId;
  initial = updateDesignNode(initial, outerId, {
    name: "Outer frame",
    x: 250,
    y: 220,
    width: 420,
    height: 320,
  });
  initial = addFrameNode(initial);
  const innerId = initial.nodes.at(-1)!.nodeId;
  initial = updateDesignNode(initial, innerId, {
    name: "Inner frame",
    x: 80,
    y: 60,
    width: 220,
    height: 180,
  });
  initial = reparentDesignNode(initial, innerId, outerId);

  const commit = vi.fn();
  using _capture = vi
    .spyOn(HTMLElement.prototype, "setPointerCapture")
    .mockImplementation(() => undefined);
  await using screen = await render(
    <CanvasHarness initial={initial} selection={["text-welcome"]} commit={commit} />,
    { router: "/design" },
  );
  const source = screen.getByRole("button", { name: "Welcome heading", exact: true }).element();
  const target = screen.getByRole("button", { name: "Inner frame", exact: true }).element();
  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const surface = screen.getByLabelText("Canvas editing surface").element();
  const start = {
    x: sourceRect.left + sourceRect.width / 2,
    y: sourceRect.top + sourceRect.height / 2,
  };
  const end = {
    x: targetRect.left + targetRect.width / 2,
    y: targetRect.top + targetRect.height / 2,
  };
  await act(() =>
    source.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        clientX: start.x,
        clientY: start.y,
      }),
    ),
  );
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientX: end.x,
        clientY: end.y,
      }),
    ),
  );
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        clientX: end.x,
        clientY: end.y,
      }),
    ),
  );

  expect(commit).toHaveBeenCalledOnce();
  const changed = commit.mock.calls[0]![0] as DesignDocument;
  expect(changed.nodes.find((node) => node.nodeId === "text-welcome")?.parentId).toBe(innerId);
  expect(changed.nodes.find((node) => node.nodeId === innerId)?.parentId).toBe(outerId);
  expect(changed.nodes.find((node) => node.nodeId === innerId)?.childIds).toContain("text-welcome");
});
