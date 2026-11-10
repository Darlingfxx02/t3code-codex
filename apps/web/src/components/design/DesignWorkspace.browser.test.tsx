import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";
import { act, fakeTimers, render } from "../../../test/render";
import { resetDesignStorage, storedDesignDocuments } from "../../../test/designStorage";
import {
  createInitialDesignDocument,
  addFrameNode,
  updateDesignNode,
  addTextNode,
  updatePrototypeSettings,
} from "./designDocument";
import { DesignPresentation } from "./DesignPresentation";
import { DesignWorkspace } from "./DesignWorkspace";
import { createDesignDocumentFromMarkup } from "./previewToDesign";
import { serializeDesignFile } from "./designAssetPackage";

it("moves and resets a rotation origin while rotating and undoing around the same point", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  using _capture = vi
    .spyOn(HTMLElement.prototype, "setPointerCapture")
    .mockImplementation(() => undefined);
  const layers = screen.getByRole("region", { name: "Design layers" });
  await userEvent.click(layers.getByRole("button", { name: "Home screen", exact: true }));
  await userEvent.keyboard("{Alt>}r{/Alt}");
  const origin = screen.getByRole("button", { name: "Rotation origin", exact: true });
  await expect.element(origin).toBeVisible();
  const before = (await storedDesignDocuments())[0]!;
  const surface = screen.getByLabelText("Canvas editing surface").element();
  const marker = origin.element(),
    start = marker.getBoundingClientRect();
  const frame = screen.container
    .querySelector<HTMLElement>('[data-design-node="frame-home"]')!
    .getBoundingClientRect();
  await act(() =>
    marker.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        clientX: start.left + start.width / 2,
        clientY: start.top + start.height / 2,
      }),
    ),
  );
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientX: frame.left,
        clientY: frame.top,
      }),
    ),
  );
  await act(() =>
    surface.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 1,
        clientX: frame.left,
        clientY: frame.top,
      }),
    ),
  );
  expect((await storedDesignDocuments())[0]!.nodes).toEqual(before.nodes);
  expect((await storedDesignDocuments())[0]!.pendingOperations).toEqual(before.pendingOperations);
  for (const [target, type, x, y] of [
    [marker, "pointerdown", frame.left, frame.top],
    [surface, "pointermove", frame.left + 80, frame.top + 40],
  ] as const)
    await act(() =>
      target.dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: x, clientY: y }),
      ),
    );
  expect(origin.element().getBoundingClientRect().left + start.width / 2).toBeCloseTo(
    frame.left + 80,
    1,
  );
  await userEvent.keyboard("{Escape}");
  expect(origin.element().getBoundingClientRect().left + start.width / 2).toBeCloseTo(
    frame.left,
    1,
  );
  expect((await storedDesignDocuments())[0]!.pendingOperations).toEqual(before.pendingOperations);
  await userEvent.click(screen.getByRole("button", { name: "Rotate 90° clockwise", exact: true }));
  expect((await storedDesignDocuments())[0]!.nodes[0]).toMatchObject({
    x: -410,
    y: 206,
    width: 640,
    height: 420,
    rotation: 90,
  });
  let point = origin.element().getBoundingClientRect();
  let painted = screen.container
    .querySelector<HTMLElement>('[data-design-node="frame-home"]')!
    .getBoundingClientRect();
  expect(point.left + point.width / 2).toBeCloseTo(painted.right, 1);
  expect(point.top + point.height / 2).toBeCloseTo(painted.top, 1);
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await userEvent.fill(screen.getByRole("spinbutton", { name: "Rotation", exact: true }), "90");
  await userEvent.keyboard("{Tab}");
  expect((await storedDesignDocuments())[0]!.nodes[0]).toMatchObject({
    x: 10,
    y: -434,
    width: 640,
    height: 420,
    rotation: -90,
  });
  point = origin.element().getBoundingClientRect();
  painted = screen.container
    .querySelector<HTMLElement>('[data-design-node="frame-home"]')!
    .getBoundingClientRect();
  expect(point.left + point.width / 2).toBeCloseTo(painted.left, 1);
  expect(point.top + point.height / 2).toBeCloseTo(painted.bottom, 1);
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await userEvent.click(origin);
  await userEvent.keyboard("{Home}");
  point = origin.element().getBoundingClientRect();
  painted = screen.container
    .querySelector<HTMLElement>('[data-design-node="frame-home"]')!
    .getBoundingClientRect();
  expect(point.left + point.width / 2).toBeCloseTo(painted.left + painted.width / 2, 1);
  expect(point.top + point.height / 2).toBeCloseTo(painted.top + painted.height / 2, 1);
  const revision = (await storedDesignDocuments())[0]!.revision;
  await userEvent.keyboard("{Shift>}{ArrowRight}{/Shift}");
  const shifted = origin.element().getBoundingClientRect();
  expect(shifted.left - point.left).toBeCloseTo(10, 1);
  expect((await storedDesignDocuments())[0]!.revision).toBe(revision);
  await userEvent.keyboard("{Home}");
  await userEvent.click(layers.getByRole("button", { name: "Welcome heading", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Layer properties", exact: true }));
  await userEvent.click(screen.getByRole("textbox", { name: "Content", exact: true }));
  await userEvent.keyboard("{Alt>}r{/Alt}");
  await expect.element(origin).toBeVisible();
  await userEvent.click(layers.getByRole("button", { name: "Home screen", exact: true }));
  point = origin.element().getBoundingClientRect();
  painted = screen.container
    .querySelector<HTMLElement>('[data-design-node="frame-home"]')!
    .getBoundingClientRect();
  expect(point.left + point.width / 2).toBeCloseTo(painted.left + painted.width / 2, 1);
  await userEvent.keyboard("{Alt>}r{/Alt}");
  await expect.element(origin).not.toBeInTheDocument();
});

it("scrubs inspector numbers from the prefix and keeps the gesture as one undo", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  await userEvent.click(
    screen
      .getByRole("region", { name: "Design layers" })
      .getByRole("button", { name: "Home screen", exact: true }),
  );
  const width = screen.getByRole("spinbutton", { name: "Width", exact: true });
  const handle = screen.container.querySelector<HTMLElement>('[data-design-scrub-handle="Width"]')!;
  const dispatch = async (
    type: "pointerdown" | "pointermove" | "pointerup",
    clientX: number,
    shiftKey = false,
  ) =>
    act(() =>
      handle.dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerId: 11, clientX, shiftKey }),
      ),
    );

  await dispatch("pointerdown", 100);
  await dispatch("pointermove", 140);
  await dispatch("pointermove", 150);
  await dispatch("pointerup", 150);
  await expect.element(width).toHaveValue(690);
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await expect.element(width).toHaveValue(640);

  await dispatch("pointerdown", 100, true);
  await dispatch("pointermove", 110, true);
  await dispatch("pointerup", 110, true);
  await expect.element(width).toHaveValue(641);
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await expect.element(width).toHaveValue(640);
});

it("exposes Figma text auto width, auto height and fixed sizing modes", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  await userEvent.click(
    screen
      .getByRole("region", { name: "Design layers" })
      .getByRole("button", { name: "Welcome heading", exact: true }),
  );
  const sizing = screen.getByRole("button", { name: "Text sizing", exact: true });
  await userEvent.click(sizing);
  await userEvent.click(screen.getByRole("menuitem", { name: "Auto height", exact: true }));
  expect((await storedDesignDocuments())[0]!.nodes[1]!.layoutSizing).toMatchObject({
    width: "fixed",
    height: "hug",
  });
  await userEvent.click(sizing);
  await userEvent.click(screen.getByRole("menuitem", { name: "Auto width", exact: true }));
  expect((await storedDesignDocuments())[0]!.nodes[1]!.layoutSizing).toMatchObject({
    width: "hug",
    height: "hug",
  });
  await userEvent.click(sizing);
  await userEvent.click(screen.getByRole("menuitem", { name: "Fixed size", exact: true }));
  expect((await storedDesignDocuments())[0]!.nodes[1]!.layoutSizing).toMatchObject({
    width: "fixed",
    height: "fixed",
  });
});

it("preserves relative type metrics across font size changes, unit conversion and undo", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  await userEvent.click(
    screen
      .getByRole("region", { name: "Design layers" })
      .getByRole("button", { name: "Welcome heading", exact: true }),
  );
  const height = screen.getByRole("spinbutton", { name: "Line height", exact: true });
  const spacing = screen.getByRole("spinbutton", { name: "Letter spacing", exact: true });
  await userEvent.fill(height, "150%");
  await userEvent.keyboard("{Enter}");
  await userEvent.fill(spacing, "10%");
  await userEvent.keyboard("{Enter}");
  await userEvent.fill(screen.getByRole("spinbutton", { name: "Font size", exact: true }), "20*2");
  await userEvent.keyboard("{Enter}");
  let node = (await storedDesignDocuments())[0]!.nodes[1]!;
  expect(node.typography).toMatchObject({
    size: 40,
    lineHeight: 150,
    lineHeightUnit: "percent",
    letterSpacing: 10,
    letterSpacingUnit: "percent",
  });
  const text = screen.container.querySelector<HTMLElement>(
    '[data-design-node="text-welcome"] > div',
  )!;
  expect(getComputedStyle(text).lineHeight).toBe("60px");
  expect(getComputedStyle(text).letterSpacing).toBe("4px");
  await userEvent.click(screen.getByRole("button", { name: "Line height units", exact: true }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Pixels", exact: true }));
  await expect.element(height).toHaveValue("60");
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await expect.element(height).toHaveValue("150%");
  await userEvent.click(height);
  await userEvent.keyboard("{ArrowUp}");
  await expect.element(height).toHaveValue("151%");
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("button", { name: "Line height units", exact: true }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Auto", exact: true }));
  await expect.element(height).toHaveValue("");
  expect(getComputedStyle(text).lineHeight).toBe("normal");
  await userEvent.click(screen.getByRole("button", { name: "Font style", exact: true }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Bold Italic", exact: true }));
  await userEvent.click(
    screen
      .getByRole("group", { name: "Text horizontal alignment", exact: true })
      .getByRole("button", { name: "Text align justify", exact: true }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Type settings", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Underline", exact: true }));
  await userEvent.fill(
    screen.getByRole("textbox", { name: "OpenType features", exact: true }),
    '"liga" 1, "kern" 1',
  );
  await userEvent.fill(
    screen.getByRole("textbox", { name: "Variable font axes", exact: true }),
    '"wght" 650, "wdth" 90',
  );
  node = (await storedDesignDocuments())[0]!.nodes[1]!;
  expect(node.typography).toMatchObject({
    weight: 700,
    fontStyle: "italic",
    decoration: "underline",
    align: "justify",
    fontFeatureSettings: '"liga" 1, "kern" 1',
    fontVariationSettings: '"wght" 650, "wdth" 90',
  });
  expect(getComputedStyle(text).fontStyle).toBe("italic");
  expect(getComputedStyle(text).textDecorationLine).toBe("underline");
});

it("edits mixed properties for every selected layer and undoes the transaction", async () => {
  const source = addFrameNode(createInitialDesignDocument());
  const secondId = source.nodes.at(-1)!.nodeId;
  const document = updateDesignNode(source, secondId, {
    width: 320,
    opacity: 0.8,
    fill: "#e0f2fe",
    paint: { background: "#e0f2fe", radius: 12 },
  });
  await resetDesignStorage(JSON.stringify([document]));
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  await userEvent.click(screen.getByLabelText("Canvas editing surface"), {
    position: { x: 30, y: 30 },
  });
  await userEvent.keyboard("{Control>}a{/Control}");
  const opacity = screen.getByRole("spinbutton", { name: "Opacity %", exact: true });
  await expect.element(opacity).toHaveValue("Mixed");
  await userEvent.fill(opacity, "50");
  await userEvent.keyboard("{Enter}");
  let stored = (await storedDesignDocuments())[0]!;
  expect(stored.nodes.filter((node) => node.parentId === null).map((node) => node.opacity)).toEqual(
    [0.5, 0.5],
  );
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await expect.element(opacity).toHaveValue("Mixed");
  const width = screen.getByRole("spinbutton", { name: "Width", exact: true });
  await userEvent.fill(width, "Mixed*2");
  await userEvent.keyboard("{Enter}");
  stored = (await storedDesignDocuments())[0]!;
  expect(stored.nodes.filter((node) => node.parentId === null).map((node) => node.width)).toEqual([
    1280, 640,
  ]);
  expect(stored.nodes.find((node) => node.nodeId === "text-welcome")?.fontSize).toBe(36);
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  stored = (await storedDesignDocuments())[0]!;
  expect(stored.nodes.filter((node) => node.parentId === null).map((node) => node.width)).toEqual([
    640, 320,
  ]);
  await userEvent.fill(width, "Mixed/0");
  await userEvent.keyboard("{Enter}");
  await expect.element(width).toHaveAttribute("aria-invalid", "true");
  expect(
    (await storedDesignDocuments())[0]!.nodes
      .filter((node) => node.parentId === null)
      .map((node) => node.width),
  ).toEqual([640, 320]);
  await userEvent.keyboard("{Escape}");
  await expect.element(width).toHaveValue("Mixed");
  await userEvent.fill(screen.getByRole("textbox", { name: "Fill", exact: true }), "FF0000");
  await userEvent.keyboard("{Tab}");
  stored = (await storedDesignDocuments())[0]!;
  expect(stored.nodes.filter((node) => node.parentId === null).map((node) => node.fill)).toEqual([
    "#ff0000",
    "#ff0000",
  ]);
  expect(stored.nodes.find((node) => node.nodeId === secondId)?.paint?.radius).toBe(12);
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  expect(
    (await storedDesignDocuments())[0]!.nodes.find((node) => node.nodeId === secondId)?.fill,
  ).toBe("#e0f2fe");
  await userEvent.click(screen.getByRole("button", { name: "Lock aspect ratio", exact: true }));
  await userEvent.fill(width, "Mixed/2");
  await userEvent.keyboard("{Enter}");
  stored = (await storedDesignDocuments())[0]!;
  expect(
    stored.nodes.filter((node) => node.parentId === null).map((node) => [node.width, node.height]),
  ).toEqual([
    [320, 210],
    [160, 210],
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  expect(
    (await storedDesignDocuments())[0]!.nodes
      .filter((node) => node.parentId === null)
      .map((node) => [node.width, node.height]),
  ).toEqual([
    [640, 420],
    [320, 420],
  ]);
});

it("edits selected text styles, removes fills and preserves independent effect identities", async () => {
  const source = addTextNode(createInitialDesignDocument());
  const document = {
    ...source,
    nodes: source.nodes.map((node) =>
      node.kind !== "text"
        ? node
        : {
            ...node,
            typography: {
              ...node.typography,
              lineHeight: node.nodeId === "text-welcome" ? 150 : 30,
              lineHeightUnit:
                node.nodeId === "text-welcome" ? ("percent" as const) : ("px" as const),
            },
          },
    ),
  };
  const secondId = document.nodes.at(-1)!.nodeId;
  await resetDesignStorage(JSON.stringify([document]));
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  const layers = screen.getByRole("region", { name: "Design layers" });
  await userEvent.click(layers.getByRole("button", { name: "Welcome heading", exact: true }));
  await userEvent.keyboard("{Shift>}");
  await userEvent.click(layers.getByRole("button", { name: "Text layer", exact: true }));
  await userEvent.keyboard("{/Shift}");
  const size = screen.getByRole("spinbutton", { name: "Font size", exact: true });
  await expect.element(size).toHaveValue("Mixed");
  await userEvent.fill(size, "48");
  await userEvent.keyboard("{Enter}");
  let stored = (await storedDesignDocuments())[0]!;
  expect(stored.nodes.filter((node) => node.kind === "text").map((node) => node.fontSize)).toEqual([
    48, 48,
  ]);
  expect(
    stored.nodes.filter((node) => node.kind === "text").map((node) => node.fontWeight),
  ).toEqual([700, 500]);
  const lineHeight = screen.getByRole("spinbutton", { name: "Line height", exact: true });
  await expect.element(lineHeight).toHaveValue("Mixed");
  await userEvent.fill(lineHeight, "Mixed*2");
  await userEvent.keyboard("{Enter}");
  stored = (await storedDesignDocuments())[0]!;
  expect(
    stored.nodes
      .filter((node) => node.kind === "text")
      .map((node) => [node.typography?.lineHeight, node.typography?.lineHeightUnit]),
  ).toEqual([
    [300, "percent"],
    [60, "px"],
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  stored = (await storedDesignDocuments())[0]!;
  expect(
    stored.nodes.filter((node) => node.kind === "text").map((node) => node.typography?.lineHeight),
  ).toEqual([150, 30]);
  await userEvent.click(screen.getByRole("button", { name: "Remove fill", exact: true }));
  await expect.element(screen.getByRole("button", { name: "Add fill", exact: true })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Add fill", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Add effect", exact: true }));
  stored = (await storedDesignDocuments())[0]!;
  const ids = stored.nodes
    .filter((node) => node.kind === "text")
    .map((node) => node.effects![0]!.effectId);
  expect(new Set(ids).size).toBe(2);
  await userEvent.click(screen.getByRole("button", { name: "Effect settings 1", exact: true }));
  await userEvent.fill(screen.getByRole("spinbutton", { name: "Shadow Y", exact: true }), "16");
  await userEvent.click(screen.getByRole("button", { name: "Close effect settings", exact: true }));
  stored = (await storedDesignDocuments())[0]!;
  expect(stored.nodes.find((node) => node.nodeId === "text-welcome")?.effects?.[0]).toMatchObject({
    effectId: ids[0],
    y: 16,
  });
  expect(stored.nodes.find((node) => node.nodeId === secondId)?.effects?.[0]).toMatchObject({
    effectId: ids[1],
    y: 16,
  });
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  expect(
    (await storedDesignDocuments())[0]!.nodes
      .filter((node) => node.kind === "text")
      .map((node) => node.effects![0]!.y),
  ).toEqual([4, 4]);
});

it("edits, hides and restores persisted effects independently of their parameter popover", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  await userEvent.click(screen.getByRole("button", { name: "Add effect", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Effect settings 1", exact: true }));
  await userEvent.fill(screen.getByRole("spinbutton", { name: "Shadow Y", exact: true }), "16");
  await userEvent.fill(screen.getByRole("spinbutton", { name: "Effect blur", exact: true }), "24");
  await userEvent.click(screen.getByRole("button", { name: "Close effect settings", exact: true }));
  let stored = (await storedDesignDocuments())[0]!;
  expect(stored.nodes[0]!.effects).toMatchObject([
    { kind: "drop-shadow", y: 16, blur: 24, visible: true },
  ]);
  const surface = screen.container.querySelector<HTMLElement>(
    '[data-design-node="frame-home"] [data-design-effect-surface]',
  )!;
  expect(getComputedStyle(surface).filter).toContain("url(");
  await userEvent.click(screen.getByRole("button", { name: "Hide effect 1", exact: true }));
  await vi.waitFor(() =>
    expect(
      screen.container.querySelector(
        '[data-design-node="frame-home"] [data-design-effect-surface]',
      ),
    ).toBeNull(),
  );
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await expect
    .element(screen.getByRole("button", { name: "Hide effect 1", exact: true }))
    .toBeInTheDocument();
  stored = (await storedDesignDocuments())[0]!;
  expect(JSON.parse(await serializeDesignFile(stored)).document.nodes[0].effects).toMatchObject([
    { kind: "drop-shadow", y: 16, blur: 24, visible: true },
  ]);
  await userEvent.click(screen.getByRole("button", { name: "Remove effect 1", exact: true }));
  expect((await storedDesignDocuments())[0]!.nodes[0]!.effects).toEqual([]);
});

it("renders the canvas shell and edits a selected layer locally", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );

  await expect
    .element(screen.getByRole("heading", { name: "Untitled design" }))
    .toBeInTheDocument();
  await expect.element(screen.getByRole("region", { name: "Design layers" })).toBeInTheDocument();
  await expect.element(screen.getByRole("region", { name: "Design canvas" })).toBeInTheDocument();
  await expect
    .element(screen.getByRole("complementary", { name: "Inspector" }))
    .toBeInTheDocument();

  await userEvent.click(
    screen.getByRole("region", { name: "Design layers" }).getByRole("button", {
      name: "Welcome heading",
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Layer properties", exact: true }));
  const content = screen.getByRole("textbox", { name: "Content" });
  await userEvent.clear(content);
  await userEvent.type(content, "Updated canvas title");
  await expect
    .element(screen.getByText("Updated canvas title", { exact: true }))
    .toBeInTheDocument();
  expect(
    (await storedDesignDocuments())[0]!.nodes.find((node) => node.nodeId === "text-welcome")?.text,
  ).toBe("Updated canvas title");
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Layer properties", exact: true }));
  await expect.element(content).toHaveValue("Design starts here");
  await userEvent.click(screen.getByRole("button", { name: "Redo", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Layer properties", exact: true }));
  await expect.element(content).toHaveValue("Updated canvas title");
  const width = screen.getByRole("spinbutton", { name: "Width", exact: true });
  await userEvent.clear(width);
  await userEvent.type(width, "0.64");
  await expect.element(width).toHaveValue(0.64);
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await expect.element(width).toHaveValue(420);
  await userEvent.fill(screen.getByRole("spinbutton", { name: "Rotation", exact: true }), "90");
  await userEvent.keyboard("{Tab}");
  expect(
    (await storedDesignDocuments())[0]!.nodes.find((node) => node.nodeId === "text-welcome")
      ?.rotation,
  ).toBe(-90);
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Flip horizontal", exact: true }));
  expect(
    (await storedDesignDocuments())[0]!.nodes.find((node) => node.nodeId === "text-welcome")?.flipX,
  ).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await userEvent.click(
    screen
      .getByRole("region", { name: "Design layers" })
      .getByRole("button", { name: "Welcome heading", exact: true }),
  );
  await userEvent.keyboard("{Shift>}v{/Shift}");
  const flipped = (await storedDesignDocuments())[0]!.nodes.find(
    (node) => node.nodeId === "text-welcome",
  )!;
  expect(flipped.flipX).toBe(true);
  expect(Math.abs(flipped.rotation!)).toBe(180);
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await act(() =>
    screen
      .getByRole("region", { name: "Design layers" })
      .getByRole("button", { name: "Welcome heading", exact: true })
      .element()
      .dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, code: "KeyH", key: "Р", shiftKey: true }),
      ),
  );
  expect(
    (await storedDesignDocuments())[0]!.nodes.find((node) => node.nodeId === "text-welcome")?.flipX,
  ).toBe(true);
  await expect
    .element(screen.getByRole("button", { name: "Move (V)", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await userEvent.fill(
    screen.getByRole("textbox", { name: "Text color", exact: true }),
    "FFAA0080",
  );
  expect(
    (await storedDesignDocuments())[0]!.nodes.find((node) => node.nodeId === "text-welcome")
      ?.typography?.color,
  ).toBe("#ffaa0080");
  await userEvent.click(screen.getByRole("button", { name: "Text align center", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Text align middle", exact: true }));
  expect(
    (await storedDesignDocuments())[0]!.nodes.find((node) => node.nodeId === "text-welcome")
      ?.typography,
  ).toMatchObject({ align: "center", verticalAlign: "middle" });
  await userEvent.click(
    screen
      .getByRole("region", { name: "Design layers" })
      .getByRole("button", { name: "Welcome heading", exact: true }),
  );
  await userEvent.keyboard("k");
  await userEvent.click(screen.getByRole("button", { name: "Anchor middle center" }));
  const multiplier = screen.getByRole("spinbutton", { name: "Multiplier", exact: true });
  await userEvent.clear(multiplier);
  await userEvent.type(multiplier, "2{Enter}");
  await expect.element(screen.getByRole("spinbutton", { name: "Scale width" })).toHaveValue(840);
  expect(
    (await storedDesignDocuments())[0]!.nodes.find((node) => node.nodeId === "text-welcome"),
  ).toMatchObject({ width: 840, height: 128, fontSize: 72, text: "Updated canvas title" });
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await expect.element(screen.getByRole("spinbutton", { name: "Scale width" })).toHaveValue(420);
});

it.each([false, true])(
  "edits properties through Layers while preserving inherited canvas locks (own lock %s)",
  async (ownLocked) => {
    const document = updateDesignNode(
      updateDesignNode(createInitialDesignDocument(), "text-welcome", { locked: ownLocked }),
      "frame-home",
      { locked: true },
    );
    await resetDesignStorage(JSON.stringify([document]));
    await using screen = await render(
      <div style={{ width: 1280, height: 800 }}>
        <DesignWorkspace />
      </div>,
      { router: "/design" },
    );
    await userEvent.click(
      screen
        .getByRole("region", { name: "Design layers" })
        .getByRole("button", { name: "Welcome heading", exact: true }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Layer properties", exact: true }));
    const content = screen.getByRole("textbox", { name: "Content", exact: true });
    expect(content.element().matches(":disabled")).toBe(false);
    await expect
      .element(screen.getByRole("button", { name: "Locked by parent", exact: true }))
      .toBeDisabled();
    await userEvent.clear(content);
    await userEvent.type(content, "Edited while locked");
    const stored = (await storedDesignDocuments())[0]!;
    expect(stored.nodes.find((node) => node.nodeId === "text-welcome")?.text).toBe(
      "Edited while locked",
    );
    expect(stored.nodes.find((node) => node.nodeId === "frame-home")?.locked).toBe(true);
    expect(stored.nodes.find((node) => node.nodeId === "text-welcome")?.locked).toBe(ownLocked);
  },
);

it("adds a layer from the layers panel", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );

  await userEvent.click(screen.getByRole("button", { name: "Layer actions", exact: true }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Add layer", exact: true }));
  await expect
    .element(
      screen
        .getByRole("region", { name: "Design layers" })
        .getByRole("button", { name: "Text layer" }),
    )
    .toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Layer properties", exact: true }));
  await expect.element(screen.getByRole("textbox", { name: "Content" })).toHaveValue("New text");
});

it("finds layers by name or text without losing their hierarchy", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  const layers = screen.getByRole("region", { name: "Design layers" });
  await userEvent.click(layers.getByRole("button", { name: "Find layers", exact: true }));
  const search = screen.getByRole("searchbox", { name: "Find layers", exact: true });
  await userEvent.type(search, "Welcome");
  await expect
    .element(layers.getByRole("button", { name: "Home screen", exact: true }))
    .toBeVisible();
  await expect
    .element(layers.getByRole("button", { name: "Welcome heading", exact: true }))
    .toBeVisible();
  await expect
    .element(layers.getByRole("button", { name: "Rotated frame", exact: true }))
    .not.toBeInTheDocument();
  await userEvent.clear(search);
  await userEvent.type(search, "missing-layer");
  await expect.element(layers.getByText("No layers found.", { exact: true })).toBeVisible();
});

it("adds and switches pages from the layers panel", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );

  await userEvent.click(screen.getByRole("button", { name: "Add page" }));
  await expect
    .element(screen.getByRole("button", { name: "Page 2" }))
    .toHaveAttribute("aria-pressed", "true");
  await expect
    .element(
      screen
        .getByRole("region", { name: "Design layers" })
        .getByRole("button", { name: "Frame 2" }),
    )
    .toBeInTheDocument();
  await userEvent.dblClick(screen.getByRole("button", { name: "Page 2", exact: true }));
  const pageName = screen.getByRole("textbox", { name: "Page name" });
  await userEvent.clear(pageName);
  await userEvent.type(pageName, "Checkout{Enter}");
  await expect
    .element(screen.getByRole("button", { name: "Checkout", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
});

it("adds frames and supports additive selection", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );

  await userEvent.click(screen.getByRole("button", { name: "Layer actions", exact: true }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Add frame", exact: true }));
  await expect
    .element(
      screen
        .getByRole("region", { name: "Design layers" })
        .getByRole("button", { name: "Frame 2" }),
    )
    .toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Layer actions", exact: true }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Add layer", exact: true }));
  const stored = (await storedDesignDocuments())[0]!;
  expect(stored.nodes.at(-1)?.parentId).toBe(
    stored.nodes.find((node) => node.name === "Frame 2")!.nodeId,
  );
  await userEvent.click(
    screen
      .getByRole("region", { name: "Design layers" })
      .getByRole("button", { name: "Welcome heading" }),
  );
  await userEvent.click(
    screen
      .getByRole("region", { name: "Design layers" })
      .getByRole("button", { name: "Home screen" }),
    { modifiers: ["Shift"] },
  );
  await expect
    .element(
      screen
        .getByRole("complementary", { name: "Inspector" })
        .getByRole("spinbutton", { name: "X", exact: true }),
    )
    .toHaveValue("Mixed");
});

function imageFile(name: string, width: number, height: number) {
  const canvas = window.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#f43f5e";
  context.fillRect(0, 0, width, height);
  const bytes = Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]!), (character) =>
    character.charCodeAt(0),
  );
  return new File([bytes], name, { type: "image/png" });
}

function deferred() {
  let complete = () => {};
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: () => complete() };
}

it("stores an imported asset as local document metadata", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  const file = imageFile("logo.png", 80, 40);

  const started = deferred();
  const resume = deferred();
  using _release = { [Symbol.dispose]: () => resume.resolve() };
  const decode = HTMLImageElement.prototype.decode;
  using _decode = vi
    .spyOn(HTMLImageElement.prototype, "decode")
    .mockImplementationOnce(async function (this: HTMLImageElement) {
      started.resolve();
      await resume.promise;
      await decode.call(this);
    });

  await userEvent.upload(screen.getByLabelText("Design asset file"), file);
  await started.promise;
  await userEvent.click(screen.getByLabelText("Canvas editing surface"), {
    position: { x: 30, y: 30 },
  });
  await userEvent.keyboard("{Escape}");
  resume.resolve();
  await expect
    .element(screen.getByText("Preparing images…", { exact: true }))
    .not.toBeInTheDocument();
  await vi.waitFor(async () =>
    expect((await storedDesignDocuments())[0]!.assets[0]?.name).toBe("logo.png"),
  );
  expect(
    (await storedDesignDocuments())[0]!.nodes.filter((node) => node.kind === "image"),
  ).toHaveLength(0);
  await expect.element(screen.getByText(/Click for original size/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("tab", { name: "Assets", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Place logo.png", exact: true }));
  const surface = screen.getByLabelText("Canvas editing surface");
  const surfaceBounds = surface.element().getBoundingClientRect();
  const frameBounds = screen
    .getByRole("region", { name: "Design canvas" })
    .getByRole("button", { name: "Home screen", exact: true })
    .element()
    .getBoundingClientRect();
  const point = {
    x: frameBounds.left - surfaceBounds.left + 20,
    y: frameBounds.top - surfaceBounds.top + 150,
  };
  await userEvent.click(surface, { position: point });
  let placed = (await storedDesignDocuments())[0]!.nodes.filter((node) => node.kind === "image");
  expect(placed).toHaveLength(1);
  expect(placed[0]).toMatchObject({ parentId: "frame-home", x: 20, y: 150, width: 80, height: 40 });
  await userEvent.upload(screen.getByLabelText("Design asset file"), [
    file,
    imageFile("portrait.png", 40, 80),
  ]);
  await expect.element(screen.getByText(/2 remaining/)).toBeInTheDocument();
  expect(
    (await storedDesignDocuments())[0]!.nodes.filter((node) => node.kind === "image"),
  ).toHaveLength(1);
  await userEvent.click(surface, { position: { x: point.x + 100, y: point.y } });
  await expect.element(screen.getByText("Place portrait.png", { exact: true })).toBeInTheDocument();
  const element = surface.element();
  using _capture = vi
    .spyOn(HTMLElement.prototype, "setPointerCapture")
    .mockImplementation(() => undefined);
  const currentFrameBounds = screen
    .getByRole("region", { name: "Design canvas" })
    .getByRole("button", { name: "Home screen", exact: true })
    .element()
    .getBoundingClientRect();
  const start = { x: currentFrameBounds.left + 240, y: currentFrameBounds.top + 200 };
  await act(() =>
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 1,
        clientX: start.x,
        clientY: start.y,
      }),
    ),
  );
  await act(() =>
    element.dispatchEvent(
      new PointerEvent("pointermove", {
        bubbles: true,
        pointerId: 1,
        clientX: start.x - 60,
        clientY: start.y - 60,
      }),
    ),
  );
  expect(
    (await storedDesignDocuments())[0]!.nodes.filter((node) => node.kind === "image"),
  ).toHaveLength(2);
  await act(() =>
    element.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerId: 1 })),
  );
  expect(
    (await storedDesignDocuments())[0]!.nodes.filter((node) => node.kind === "image"),
  ).toHaveLength(2);
  await act(() =>
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 2,
        clientX: start.x,
        clientY: start.y,
      }),
    ),
  );
  await act(() =>
    element.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 2,
        clientX: start.x - 60,
        clientY: start.y - 60,
      }),
    ),
  );
  placed = (await storedDesignDocuments())[0]!.nodes.filter((node) => node.kind === "image");
  expect(placed).toHaveLength(3);
  expect(placed[2]).toMatchObject({
    parentId: "frame-home",
    x: 180,
    y: 80,
    width: 60,
    height: 120,
  });
  const dropStarted = deferred();
  const dropResume = deferred();
  using _releaseDrop = { [Symbol.dispose]: () => dropResume.resolve() };
  _decode.mockImplementationOnce(async function (this: HTMLImageElement) {
    dropStarted.resolve();
    await dropResume.promise;
    await decode.call(this);
  });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  const dropFrame = screen
    .getByRole("region", { name: "Design canvas" })
    .getByRole("button", { name: "Home screen", exact: true })
    .element()
    .getBoundingClientRect();
  await act(() =>
    surface.element().dispatchEvent(
      new DragEvent("drop", {
        bubbles: true,
        dataTransfer: transfer,
        clientX: dropFrame.left + 30,
        clientY: dropFrame.top + 160,
      }),
    ),
  );
  await dropStarted.promise;
  await userEvent.click(screen.getByRole("tab", { name: "File", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Add page" }));
  dropResume.resolve();
  await expect
    .element(screen.getByText("Preparing images…", { exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(
      screen.getByText("The target changed. Choose a new place on the canvas.", { exact: true }),
    )
    .toBeInTheDocument();
  expect(
    (await storedDesignDocuments())[0]!.nodes.filter((node) => node.kind === "image"),
  ).toHaveLength(3);
  await userEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  await userEvent.click(screen.getByRole("tab", { name: "Assets", exact: true }));
  await expect.element(screen.getByText("Used in 2 layers", { exact: true })).toBeInTheDocument();
  await expect
    .element(screen.getByRole("button", { name: "Remove logo.png from library" }))
    .toBeDisabled();
});

it("edits canvas text as one undoable action without consuming typing shortcuts", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  const canvas = screen.getByRole("region", { name: "Design canvas" });
  await userEvent.dblClick(canvas.getByRole("button", { name: "Welcome heading", exact: true }));
  const editor = screen.getByRole("textbox", { name: "Edit Welcome heading" });
  await expect.element(editor).toBeVisible();
  await userEvent.clear(editor);
  await userEvent.type(editor, "Canvas text");
  await userEvent.click(screen.getByLabelText("Canvas editing surface"), {
    position: { x: 30, y: 30 },
  });
  await expect.element(canvas.getByText("Canvas text", { exact: true })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  await expect.element(canvas.getByText("Design starts here", { exact: true })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Redo", exact: true }));
  await expect.element(canvas.getByText("Canvas text", { exact: true })).toBeInTheDocument();
});

it("presents connected frames and returns to the editor without changing the document", async () => {
  const document = addFrameNode(createInitialDesignDocument());
  const overlayDocument = addFrameNode(document);
  const overlayId = overlayDocument.nodes.at(-1)!.nodeId;
  const withOverlay = updateDesignNode(
    addTextNode(
      updateDesignNode(overlayDocument, overlayId, { width: 120, height: 80 }),
      document.nodes.at(-1)!.nodeId,
    ),
    document.nodes.at(-1)!.nodeId,
    {
      interactions: [
        {
          trigger: "key-press",
          key: "o",
          action: "open-overlay",
          targetNodeId: overlayId,
          overlay: { position: "bottom-right", background: false },
        },
        {
          trigger: "key-press",
          key: "p",
          action: "open-overlay",
          targetNodeId: overlayId,
          overlay: {
            position: "manual",
            x: 12,
            y: 18,
            dismissOnOutside: false,
            backgroundColor: "#123456",
            backgroundOpacity: 0.6,
          },
        },
      ],
    },
  );
  const interactionDocument = updateDesignNode(withOverlay, "text-welcome", {
    interactions: [
      { trigger: "click", action: "navigate", targetNodeId: document.nodes.at(-1)!.nodeId },
      { trigger: "hover", action: "navigate", targetNodeId: document.nodes.at(-1)!.nodeId },
    ],
  });
  const next = updatePrototypeSettings(
    updateDesignNode(interactionDocument, overlayId, {
      interactions: [
        { trigger: "key-press", key: "s", action: "swap-overlay", targetNodeId: "frame-home" },
      ],
    }),
    { viewportWidth: 480, viewportHeight: 320, scale: "actual", background: "#987654" },
  );
  await resetDesignStorage(JSON.stringify([next]));
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  await userEvent.click(screen.getByRole("button", { name: "Present", exact: true }));
  const dialog = page.getByRole("dialog");
  await userEvent.hover(dialog.getByRole("button", { name: "Welcome heading", exact: true }));
  await expect.element(dialog.getByText("New text", { exact: true })).toBeVisible();
  await userEvent.hover(dialog.getByRole("button", { name: "Restart prototype" }));
  await expect.element(dialog.getByText("New text", { exact: true })).not.toBeInTheDocument();
  await userEvent.click(dialog.getByRole("button", { name: "Welcome heading", exact: true }));
  await expect
    .element(dialog.getByRole("heading", { name: "Frame 2", exact: true }))
    .toBeInTheDocument();
  await userEvent.keyboard("o");
  await expect.element(dialog.getByRole("button", { name: "Dismiss overlay" })).toBeInTheDocument();
  const screenBounds = dialog
    .getByRole("region", { name: "Prototype screen" })
    .element()
    .getBoundingClientRect();
  const overlayBounds = window.document
    .querySelector("[data-design-overlay]")!
    .getBoundingClientRect();
  expect(screenBounds.width).toBe(480);
  expect(screenBounds.height).toBe(320);
  expect(overlayBounds.right).toBeCloseTo(screenBounds.right, 0);
  expect(overlayBounds.bottom).toBeCloseTo(screenBounds.bottom, 0);
  await userEvent.click(dialog.getByRole("button", { name: "Dismiss overlay" }), {
    position: { x: 8, y: 8 },
  });
  await userEvent.keyboard("p");
  const persistentOverlay = dialog.getByRole("group", { name: "Overlay: Frame 3" });
  await expect.element(persistentOverlay).toBeInTheDocument();
  await expect
    .element(dialog.getByRole("button", { name: "Dismiss overlay" }))
    .not.toBeInTheDocument();
  const manualBounds = persistentOverlay
    .element()
    .querySelector("[data-design-overlay]")!
    .getBoundingClientRect();
  const manualScreenBounds = dialog
    .getByRole("region", { name: "Prototype screen" })
    .element()
    .getBoundingClientRect();
  expect(manualBounds.left - manualScreenBounds.left).toBeCloseTo(12, 0);
  expect(manualBounds.top - manualScreenBounds.top).toBeCloseTo(18, 0);
  await userEvent.click(dialog.getByRole("region", { name: "Prototype screen" }), {
    position: { x: 5, y: 5 },
  });
  await expect.element(persistentOverlay).toBeInTheDocument();
  await userEvent.keyboard("{ArrowRight}");
  await expect
    .element(dialog.getByRole("heading", { name: "Frame 2", exact: true }))
    .toBeInTheDocument();
  await userEvent.keyboard("s");
  await expect.element(persistentOverlay).not.toBeInTheDocument();
  await expect
    .element(dialog.getByRole("group", { name: "Overlay: Home screen" }))
    .toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  await expect
    .element(dialog.getByRole("group", { name: "Overlay: Home screen" }))
    .not.toBeInTheDocument();
  await userEvent.click(dialog.getByRole("button", { name: "Previous frame" }));
  await expect
    .element(dialog.getByRole("heading", { name: "Home screen", exact: true }))
    .toBeInTheDocument();
  await userEvent.keyboard("{ArrowRight}");
  await expect
    .element(dialog.getByRole("heading", { name: "Frame 2", exact: true }))
    .toBeInTheDocument();
  await userEvent.keyboard("r");
  await expect
    .element(dialog.getByRole("heading", { name: "Home screen", exact: true }))
    .toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  await expect.element(dialog).not.toBeInTheDocument();
  expect((await storedDesignDocuments())[0]).toEqual(next);
});
it("executes one earliest delayed transition without competing layer timers", async () => {
  const document = addFrameNode(addFrameNode(createInitialDesignDocument()));
  const first = document.nodes[2]!,
    second = document.nodes[3]!;
  const next = updateDesignNode(
    updateDesignNode(document, "frame-home", {
      interactions: [
        { trigger: "after-delay", action: "navigate", targetNodeId: first.nodeId, delayMs: 20 },
      ],
    }),
    "text-welcome",
    {
      interactions: [
        { trigger: "after-delay", action: "navigate", targetNodeId: second.nodeId, delayMs: 20 },
      ],
    },
  );
  using _timers = fakeTimers();
  await using _screen = await render(
    <DesignPresentation document={next} startId="frame-home" onClose={() => undefined} />,
    { router: "/design" },
  );
  await act(() => vi.advanceTimersByTimeAsync(20));
  const dialog = page.getByRole("dialog");
  await expect
    .element(dialog.getByRole("heading", { name: first.name, exact: true }))
    .toBeInTheDocument();
  await userEvent.click(dialog.getByRole("button", { name: "Previous frame" }));
  await expect
    .element(dialog.getByRole("heading", { name: "Home screen", exact: true }))
    .toBeInTheDocument();
});

it("converts pasted markup into dependency-free editable layers", async () => {
  const document = await createDesignDocumentFromMarkup({
    mode: "html",
    markup:
      '<main style="position:absolute;left:100px;top:60px;width:320px;height:180px"><h1 style="position:absolute;left:20px;top:30px;margin:0;font-size:24px">Hello</h1></main>',
  });
  expect(document.title).toBe("Pasted HTML frame");
  expect(document.nodes[1]).toMatchObject({ x: 100, y: 60 });
  expect(document.nodes.find((node) => node.text === "Hello")).toMatchObject({ x: 20, y: 30 });
  expect(document.nodes.some((node) => node.text === "Hello")).toBe(true);
  expect(document.nodes.every((node) => node.provenance === null)).toBe(true);
  const react = await createDesignDocumentFromMarkup({
    mode: "react",
    markup: `
    import React, {useState, useEffect} from 'react';
    type CardProps = {label: string};
    function Card({label}: CardProps) { return <p style={{margin:0,fontSize:24}}>{label}</p> }
    export default function App() {
      const [ready, setReady] = useState(false);
      useEffect(() => setReady(true), []);
      let isolated = false;
      try { parent.document.body.dataset.reactImportEscaped = 'yes' } catch { isolated = true }
      return <main style={{position:'absolute',left:100,top:60,width:320,height:180}}>
        {['First','Second'].map(label => <Card key={label} label={(ready ? 'Ready ' : 'Loading ') + label} />)}
        <span>{isolated ? 'Isolated' : 'Unsafe'}</span>
      </main>
    }
  `,
  });
  expect(react.nodes.find((node) => node.text === "Ready First")).toMatchObject({ fontSize: 24 });
  expect(react.nodes.some((node) => node.text === "Ready Second")).toBe(true);
  expect(
    react.nodes.find((node) => node.text === "Ready First")?.typography?.lineHeight,
  ).toBeUndefined();
  expect(react.nodes.some((node) => node.text === "Isolated")).toBe(true);
  expect(react.nodes.some((node) => node.text === "Unsafe")).toBe(false);
  expect(window.document.body.dataset.reactImportEscaped).toBeUndefined();
  expect(react.provenance?.mode).toBe("snapshot");
  expect(JSON.stringify(react)).not.toContain("useEffect");
  await expect(
    createDesignDocumentFromMarkup({
      mode: "react",
      markup: "export default function App(){throw new Error('Broken component')}",
    }),
  ).rejects.toThrow("Broken component");
  await expect(
    createDesignDocumentFromMarkup({
      mode: "react",
      markup: "import {Button} from 'missing-package'; export default () => <Button />",
    }),
  ).rejects.toThrow("missing-package");
});

it("windows a long layer list and keeps keyboard navigation across offscreen rows", async () => {
  const base = createInitialDesignDocument();
  const children = Array.from({ length: 600 }, (_, index) => ({
    ...base.nodes[1]!,
    nodeId: `layer-${index}`,
    name: `Layer ${index}`,
    text: `Layer ${index}`,
    x: index * 200,
    y: 100,
    width: 100,
    height: 30,
  }));
  await resetDesignStorage(
    JSON.stringify([
      {
        ...base,
        nodes: [
          { ...base.nodes[0]!, clipContent: false, childIds: children.map((node) => node.nodeId) },
          ...children,
        ],
      },
    ]),
  );
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  const layers = screen.getByRole("region", { name: "Design layers" });
  await expect
    .element(layers.getByRole("button", { name: "Home screen", exact: true }))
    .toBeInTheDocument();
  await expect
    .element(layers.getByRole("button", { name: "Layer 12", exact: true }))
    .toBeInTheDocument();
  expect(layers.element().querySelectorAll("button").length).toBeLessThan(250);
  await userEvent.click(layers.getByRole("button", { name: "Home screen", exact: true }));
  await userEvent.keyboard("{End}");
  await expect
    .element(layers.getByRole("button", { name: "Layer 599", exact: true }))
    .toHaveFocus();
  expect(layers.element().querySelectorAll("button").length).toBeLessThan(250);
  await userEvent.keyboard("{Home}");
  await expect
    .element(layers.getByRole("button", { name: "Home screen", exact: true }))
    .toHaveFocus();
  await userEvent.dblClick(layers.getByRole("button", { name: "Layer 0", exact: true }));
  const name = layers.getByRole("textbox", { name: "Layer name", exact: true });
  await userEvent.clear(name);
  await userEvent.type(name, "Uncommitted draft");
  const viewport = layers.element().querySelector<HTMLElement>("[data-design-layer-viewport]")!;
  await act(() => {
    viewport.scrollTop = viewport.scrollHeight;
    viewport.dispatchEvent(new Event("scroll"));
  });
  await expect
    .element(layers.getByRole("button", { name: "Layer 599", exact: true }))
    .toBeInTheDocument();
  await expect.element(name).toHaveValue("Uncommitted draft");
  await expect.element(name).toHaveFocus();
  await userEvent.keyboard("{Escape}");
});

it("switches drawing tools from Layers while preserving text entry in Inspector", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  const layers = screen.getByRole("region", { name: "Design layers" });
  await userEvent.click(layers.getByRole("button", { name: "Welcome heading", exact: true }));
  await userEvent.keyboard("r");
  const surface = screen.getByLabelText("Canvas editing surface");
  await expect.element(surface).toHaveFocus();
  await userEvent.click(surface, { position: { x: 300, y: 300 } });
  await expect
    .element(layers.getByRole("button", { name: "Rectangle", exact: true }))
    .toBeInTheDocument();
  await userEvent.click(layers.getByRole("button", { name: "Welcome heading", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Layer properties", exact: true }));
  const content = screen.getByRole("textbox", { name: "Content", exact: true });
  await userEvent.clear(content);
  await userEvent.type(content, "Frame Tool");
  await expect.element(content).toHaveValue("Frame Tool");
  expect((await storedDesignDocuments())[0]!.nodes).toHaveLength(3);
});

it("keeps paint inputs focused while editing and preserves gradient settings through undo", async () => {
  const initial = createInitialDesignDocument();
  await resetDesignStorage(
    JSON.stringify([
      {
        ...initial,
        nodes: initial.nodes.map((node, i) =>
          i === 0 ? { ...node, paint: { ...node.paint, fills: [{ color: "#ffffff80" }] } } : node,
        ),
      },
    ]),
  );
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  const layers = screen.getByRole("region", { name: "Design layers" });
  await userEvent.click(layers.getByRole("button", { name: "Home screen", exact: true }));
  const opacity = screen.getByRole("spinbutton", { name: "Fill 1 opacity %", exact: true });
  await expect.element(opacity).toHaveValue(50.2);
  await userEvent.fill(opacity, "25");
  await expect.element(opacity).toHaveFocus();
  await userEvent.keyboard("{Tab}");
  expect((await storedDesignDocuments())[0]!.nodes[0]!.paint!.fills![0]!.opacity).toBe(0.25);
  await userEvent.click(screen.getByRole("button", { name: "Fill 1 settings", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Fill 1 type", exact: true }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Linear gradient", exact: true }));
  const angle = screen.getByRole("spinbutton", { name: "Fill 1 angle", exact: true });
  await userEvent.fill(angle, "45");
  await userEvent.keyboard("{Tab}");
  expect((await storedDesignDocuments())[0]!.nodes[0]!.paint!.fills![0]).toMatchObject({
    kind: "linear-gradient",
    opacity: 0.25,
    angle: 45,
    stops: [{ position: 0 }, { position: 1 }],
  });
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("button", { name: "Undo", exact: true }));
  expect((await storedDesignDocuments())[0]!.nodes[0]!.paint!.fills![0]).toMatchObject({
    kind: "linear-gradient",
    opacity: 0.25,
    angle: 0,
  });
});

it("offers layout sizing according to a frame's own layout and its child's positioning", async () => {
  await resetDesignStorage();
  await using screen = await render(
    <div style={{ width: 1280, height: 800 }}>
      <DesignWorkspace />
    </div>,
    { router: "/design" },
  );
  const layers = screen.getByRole("region", { name: "Design layers" });
  await userEvent.click(layers.getByRole("button", { name: "Home screen", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Width sizing", exact: true }));
  await expect
    .element(screen.getByRole("menuitem", { name: "Hug contents", exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(screen.getByRole("menuitem", { name: "Fill container", exact: true }))
    .not.toBeInTheDocument();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("button", { name: "Vertical layout", exact: true }));
  await userEvent.click(
    screen.getByRole("button", { name: "Align layout bottom right", exact: true }),
  );
  await userEvent.fill(
    screen.getByRole("spinbutton", { name: "Horizontal padding", exact: true }),
    "12",
  );
  await userEvent.fill(
    screen.getByRole("spinbutton", { name: "Vertical padding", exact: true }),
    "8",
  );
  await userEvent.keyboard("{Tab}");
  expect((await storedDesignDocuments())[0]!.nodes[0]!.layoutModel).toMatchObject({
    kind: "auto-layout",
    direction: "column",
    align: "end",
    justify: "end",
    counterAxisAlign: "max",
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 8,
    paddingBottom: 8,
  });
  await userEvent.click(screen.getByRole("button", { name: "Width sizing", exact: true }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Hug contents", exact: true }));
  expect((await storedDesignDocuments())[0]!.nodes[0]!.layoutSizing!.width).toBe("hug");
  await userEvent.click(layers.getByRole("button", { name: "Welcome heading", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Width sizing", exact: true }));
  await expect
    .element(screen.getByRole("menuitem", { name: "Fill container", exact: true }))
    .toBeVisible();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("combobox", { name: "Positioning", exact: true }));
  await userEvent.click(screen.getByRole("option", { name: "absolute", exact: true }));
  await userEvent.click(screen.getByRole("button", { name: "Width sizing", exact: true }));
  await expect
    .element(screen.getByRole("menuitem", { name: "Fill container", exact: true }))
    .not.toBeInTheDocument();
});
