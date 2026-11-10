import { describe, expect, it } from "vite-plus/test";

import { createInitialDesignDocument, updateDesignNode, addVectorPath } from "./designDocument";
import {
  exportDesignHtml,
  exportDesignPatch,
  exportDesignReact,
  exportDesignSliceHtml,
  exportDesignSliceSvg,
} from "./designExport";

describe("Design exports", () => {
  it("emits dependency-free HTML and React", () => {
    const document = createInitialDesignDocument();
    expect(exportDesignHtml(document)).toContain("data-design-document");
    expect(exportDesignHtml(document)).toContain("Design starts here");
    expect(exportDesignReact(document)).toContain("export function Untitleddesign");
    const aligned = updateDesignNode(document, "text-welcome", {
      typography: { align: "right", verticalAlign: "middle" },
    });
    expect(exportDesignHtml(aligned)).toContain("text-align:right");
    expect(exportDesignHtml(aligned)).toContain("justify-content:center");
    const transformed = addVectorPath(
      updateDesignNode(document, "frame-home", { x: 1200, rotation: 15 }),
      [
        { x: -20, y: 30 },
        { x: 40, y: 80 },
      ],
    );
    expect(exportDesignHtml(transformed)).toContain('viewBox="0 0 60 50"');
    expect(exportDesignHtml(transformed)).toContain("rotate(15deg)");
    expect(
      Number(exportDesignHtml(transformed).match(/overflow:hidden;width:([0-9.]+)px/u)?.[1]),
    ).toBeGreaterThan(1860);
    expect(exportDesignReact(transformed)).toContain("<svg");
    expect(exportDesignReact(transformed)).toContain('{"Design starts here"}');
  });

  it("emits an explicit patch envelope", () => {
    const patch = JSON.parse(
      exportDesignPatch(updateDesignNode(createInitialDesignDocument(), "text-welcome", { x: 80 })),
    ) as {
      kind: string;
      operations: ReadonlyArray<{ kind: string }>;
      snapshot: { nodes: ReadonlyArray<{ x: number }> };
    };
    expect(patch.kind).toBe("t3-design-patch");
    expect(patch.operations[0]?.kind).toBe("update-node");
    expect(patch.snapshot.nodes[1]?.x).toBe(80);
  });

  it("exports multiple vector fills and strokes with stroke geometry", () => {
    const document = updateDesignNode(createInitialDesignDocument(), "frame-home", {
      kind: "vector",
      childIds: [],
      fill: "#ff0000",
      vector: { path: "M 0 0 L 20 0 L 20 20 Z", width: 20, height: 20, closed: true },
      paint: {
        fills: [{ color: "#ff0000" }, { color: "#0000ff", opacity: 0.5 }],
        strokes: [
          { color: "#111111", width: 2, cap: "round", join: "bevel" },
          { color: "#ffffff", width: 1, cap: "square", join: "miter" },
        ],
      },
    });
    const html = exportDesignHtml(document);
    expect(html).toContain('fill-opacity="0.5"');
    expect(html).toContain('stroke-linecap="round"');
    expect(html).toContain('stroke-linejoin="bevel"');
    expect(html.match(/stroke-width="/gu)?.length).toBe(2);
  });

  it("exports gradient paint stops and blend mode without flattening the vector", () => {
    const document = updateDesignNode(createInitialDesignDocument(), "frame-home", {
      kind: "vector",
      childIds: [],
      fill: "#ff0000",
      vector: { path: "M 0 0 L 20 0 L 20 20 Z", width: 20, height: 20, closed: true },
      paint: {
        blendMode: "multiply",
        fills: [
          {
            color: "#ff0000",
            kind: "linear-gradient",
            angle: 0,
            opacity: 0.75,
            stops: [
              { color: "#ff0000", position: 0 },
              { color: "#0000ff", position: 0.35 },
              { color: "#ffffff", position: 1 },
            ],
          },
        ],
      },
    });
    const html = exportDesignHtml(document);
    const react = exportDesignReact(document);
    expect(html).toContain("<linearGradient");
    expect(html).toContain('gradientTransform="rotate(90 .5 .5)"');
    expect(html).toContain('offset="0.35"');
    expect(html).toContain("url(#design-gradient-frame-home-0)");
    expect(html).toContain("mix-blend-mode:multiply");
    expect(react).toContain("<linearGradient");
    expect(react).toContain("stopColor");
    expect(react).toContain("mixBlendMode");
  });

  it("keeps radial gradients as radial SVG paint", () => {
    const document = updateDesignNode(createInitialDesignDocument(), "frame-home", {
      kind: "vector",
      childIds: [],
      fill: "#ff0000",
      vector: { path: "M 0 0 L 20 0 L 20 20 Z", width: 20, height: 20, closed: true },
      paint: {
        fills: [
          {
            color: "#ff0000",
            kind: "radial-gradient",
            stops: [
              { color: "#ffffff", position: 0 },
              { color: "#ff0000", position: 1 },
            ],
          },
        ],
      },
    });
    expect(exportDesignHtml(document)).toContain("<radialGradient");
    expect(exportDesignReact(document)).toContain("<radialGradient");
  });

  it("exports angular and diamond fills through native SVG paint", () => {
    const document = updateDesignNode(createInitialDesignDocument(), "frame-home", {
      kind: "vector",
      childIds: [],
      fill: "#ff0000",
      vector: { path: "M 0 0 L 20 0 L 20 20 Z", width: 20, height: 20, closed: true },
      paint: {
        fills: [
          {
            color: "#ff0000",
            kind: "angular-gradient",
            angle: 30,
            stops: [
              { color: "#ffffff", position: 0 },
              { color: "#ff0000", position: 1 },
            ],
          },
          {
            color: "#0000ff",
            kind: "diamond-gradient",
            stops: [
              { color: "#0000ff", position: 0 },
              { color: "#00ff00", position: 1 },
            ],
          },
        ],
      },
    });
    const html = exportDesignHtml(document);
    const react = exportDesignReact(document);
    expect(html).toContain("<polygon");
    expect(html).toContain('fill-rule="evenodd"');
    expect(html).not.toContain("<foreignObject");
    expect(react).toContain("dangerouslySetInnerHTML");
    expect(react).toContain("<polygon");
    expect(react).not.toContain("foreignObject");
  });

  it("keeps slices as export metadata and excludes them from rendered content", () => {
    const document = updateDesignNode(createInitialDesignDocument(), "frame-home", {
      slice: true,
      name: "Hero slice",
      width: 320,
      height: 180,
    });
    const html = exportDesignHtml(document);
    const react = exportDesignReact(document);
    expect(html).toContain("data-design-slices");
    expect(html).toContain("Hero slice");
    expect(html).not.toContain('data-design-node="frame-home"');
    expect(react).toContain("data-design-slices");
    expect(react).toContain("Hero slice");
    expect(react).not.toContain('data-design-node={"frame-home"}');
    expect(exportDesignSliceHtml(document, "frame-home")).toContain(
      'data-design-slice="frame-home"',
    );
    expect(exportDesignSliceHtml(document, "frame-home")).toContain("Design starts here");
    expect(exportDesignSliceSvg(document, "frame-home")).toContain("<clipPath");
    expect(exportDesignSliceSvg(document, "frame-home")).toContain("Design starts here");
    expect(exportDesignSliceSvg(document, "frame-home")).toContain("matrix(1 0 0 1 56 54)");
    expect(exportDesignSliceSvg(document, "frame-home")).not.toContain("<foreignObject");
  });

  it("keeps angular and diamond slice fills in native SVG", () => {
    const document = updateDesignNode(createInitialDesignDocument(), "frame-home", {
      slice: true,
      kind: "vector",
      childIds: [],
      fill: "#ff0000",
      vector: { path: "M 0 0 L 40 0 L 40 40 L 0 40 Z", width: 40, height: 40, closed: true },
      paint: {
        fills: [
          {
            color: "#ff0000",
            kind: "angular-gradient",
            angle: 20,
            stops: [
              { color: "#ff0000", position: 0 },
              { color: "#0000ff", position: 1 },
            ],
          },
          {
            color: "#0000ff",
            kind: "diamond-gradient",
            stops: [
              { color: "#0000ff", position: 0 },
              { color: "#00ff00", position: 1 },
            ],
          },
        ],
      },
    });
    const svg = exportDesignSliceSvg(document, "frame-home");
    expect(svg).toContain("<polygon");
    expect(svg).toContain('fill-rule="evenodd"');
    expect(svg).toContain("design-slice-clip-frame-home-0");
    expect(svg).not.toContain("<foreignObject");
  });

  it("keeps slice effects and text presentation in native SVG", () => {
    const document = updateDesignNode(
      updateDesignNode(createInitialDesignDocument(), "frame-home", {
        slice: true,
        effects: [
          {
            effectId: "shadow",
            kind: "drop-shadow",
            visible: true,
            x: 4,
            y: 6,
            blur: 12,
            spread: 2,
            color: "#000000",
          },
        ],
      }),
      "text-welcome",
      {
        typography: {
          family: "Inter",
          size: 24,
          weight: 700,
          align: "center",
          verticalAlign: "middle",
          fontStyle: "italic",
          letterSpacing: 2,
          letterSpacingUnit: "px",
          decoration: "underline",
        },
      },
    );
    const svg = exportDesignSliceSvg(document, "frame-home");
    expect(svg).toContain("<filter");
    expect(svg).toContain('filter="url(#design-effects-');
    expect(svg).toContain('font-style="italic"');
    expect(svg).toContain('text-anchor="middle"');
    expect(svg).toContain('text-decoration="underline"');
  });
});
