import { describe, expect, it } from "vite-plus/test";

import {
  createDesignDocumentFromPreview,
  linkDesignDocument,
  refreshLinkedDesignDocument,
} from "./previewToDesign";
import { updateDesignNode } from "./designDocument";

describe("Preview to Design import", () => {
  it("creates a dependency-free snapshot with provenance", () => {
    const document = createDesignDocumentFromPreview({
      url: "http://localhost:3000/dashboard",
      title: "Dashboard",
      viewport: { _tag: "freeform", width: 1280, height: 800 },
      colorScheme: "dark",
      sourceRevision: "preview-revision-1",
    });

    expect(document.title).toBe("Dashboard");
    expect(document.provenance).toMatchObject({
      mode: "snapshot",
      route: "http://localhost:3000/dashboard",
      sourceRevision: "preview-revision-1",
      viewportWidth: 1280,
      viewportHeight: 800,
      colorScheme: "dark",
    });
    expect(document.nodes.every((node) => node.provenance?.mode === "snapshot")).toBe(true);
  });

  it("supports linked provenance and refresh without replacing local layers", () => {
    const snapshot = createDesignDocumentFromPreview({
      url: "http://localhost:3000/dashboard",
      title: "Dashboard",
      viewport: { _tag: "freeform", width: 1280, height: 800 },
      colorScheme: "light",
      sourceRevision: "preview-1",
      sourceThreadId: "thread-1",
      sourceTabId: "tab-1",
    });
    const withoutTarget = {
      ...snapshot,
      provenance: { ...snapshot.provenance!, sourceThreadId: undefined, sourceTabId: undefined },
    };
    expect(linkDesignDocument(withoutTarget)).toBe(withoutTarget);
    const linked = linkDesignDocument(snapshot);
    const edited = { ...linked, nodes: linked.nodes.map((node) => ({ ...node, x: node.x + 10 })) };
    const refreshed = refreshLinkedDesignDocument(edited, {
      route: "http://localhost:3000/dashboard?fresh=1",
      sourceRevision: "preview-2",
      colorScheme: "dark",
      viewportWidth: 1280,
      viewportHeight: 800,
    });
    expect(refreshed.provenance?.mode).toBe("linked");
    expect(refreshed.provenance?.sourceRevision).toBe("preview-2");
    expect(refreshed.nodes[0]?.x).toBe(130);
  });

  it("turns a captured preview tree into editable layers", () => {
    const document = createDesignDocumentFromPreview({
      url: "http://localhost:3000/dashboard",
      title: "Dashboard",
      viewport: { _tag: "freeform", width: 800, height: 600 },
      colorScheme: "light",
      sourceRevision: "preview-3",
      capture: {
        url: "http://localhost:3000/dashboard",
        title: "Dashboard",
        viewportWidth: 800,
        viewportHeight: 600,
        nodes: [
          {
            nodeId: "root",
            parentId: null,
            kind: "group",
            name: "main",
            text: null,
            x: 12,
            y: 16,
            width: 400,
            height: 200,
            rotation: 15,
            flipX: true,
            fill: "rgb(255, 255, 255)",
            backgroundImage: "linear-gradient(90deg, #ffffff 0%, #000000 100%)",
            border: null,
            fontFamily: "Inter",
            fontSize: 16,
            fontWeight: 400,
            fontStyle: "italic",
            textDecorationLine: "underline line-through",
            textTransform: "uppercase",
            textWrapStyle: "balance",
            lineHeight: 20,
            letterSpacing: 0,
            color: "rgb(17, 24, 39)",
            opacity: 1,
            mixBlendMode: "multiply",
            borderRadius: 0,
            boxShadow: "rgba(0,0,0,.25) 0px 4px 8px 0px",
            filter: "blur(2px)",
          },
        ],
      },
    });
    expect(document.nodes[0]?.name).toBe("Preview frame");
    expect(document.nodes[1]?.parentId).toBe("frame-preview");
    expect(document.nodes[1]?.layoutModel?.resolvedWidth).toBe(400);
    expect(document.nodes[1]).toMatchObject({ rotation: 15, flipX: true });
    expect(document.nodes[1]?.typography).toMatchObject({
      fontStyle: "italic",
      decoration: "underline line-through",
      letterCase: "uppercase",
      wrap: "balance",
    });
    expect(document.nodes[1]?.paint?.blendMode).toBe("multiply");
    expect(document.nodes[1]?.paint?.fills).toMatchObject([
      { kind: "linear-gradient", stops: [{ position: 0 }, { position: 1 }] },
    ]);
    expect(document.nodes[1]?.effects).toMatchObject([
      { kind: "drop-shadow", y: 4, blur: 8 },
      { kind: "layer-blur", blur: 4 },
    ]);
  });

  it("refreshes an unedited linked layer while preserving a local override", () => {
    const capture = {
      url: "http://localhost:3000/dashboard",
      title: "Dashboard",
      viewportWidth: 800,
      viewportHeight: 600,
      nodes: [
        {
          nodeId: "root",
          parentId: null,
          kind: "group" as const,
          name: "main",
          text: null,
          x: 12,
          y: 16,
          width: 400,
          height: 200,
          fill: "rgb(255, 255, 255)",
          border: null,
          fontFamily: "Inter",
          fontSize: 16,
          fontWeight: 400,
          lineHeight: 20,
          letterSpacing: 0,
          color: "rgb(17, 24, 39)",
          opacity: 1,
          borderRadius: 0,
        },
      ],
    };
    const snapshot = createDesignDocumentFromPreview({
      url: capture.url,
      title: capture.title,
      viewport: { _tag: "freeform", width: 800, height: 600 },
      colorScheme: "light",
      sourceRevision: "preview-1",
      sourceThreadId: "thread-1",
      sourceTabId: "tab-1",
      capture,
    });
    const linked = linkDesignDocument(snapshot);
    const edited = updateDesignNode(linked, "preview-root", { x: 99 });
    const refreshed = refreshLinkedDesignDocument(edited, {
      ...linked.provenance!,
      sourceRevision: "preview-2",
      capture: {
        ...capture,
        nodes: [{ ...capture.nodes[0]!, x: 24, width: 420 }],
      },
    });
    expect(refreshed.nodes.find((node) => node.nodeId === "preview-root")?.x).toBe(99);
    expect(refreshed.nodes.find((node) => node.nodeId === "preview-root")?.width).toBe(400);
  });
  it("rejects a linked refresh with unmaterialized images instead of dropping local asset references", () => {
    const capture = {
      url: "http://localhost:3000/",
      title: "Image",
      viewportWidth: 800,
      viewportHeight: 600,
      nodes: [
        {
          nodeId: "image",
          parentId: null,
          kind: "image" as const,
          name: "Photo",
          text: null,
          x: 0,
          y: 0,
          width: 80,
          height: 40,
          fill: null,
          border: null,
          fontFamily: null,
          fontSize: null,
          fontWeight: null,
          lineHeight: null,
          letterSpacing: null,
          color: null,
          opacity: 1,
          borderRadius: 0,
          assetUrl: "https://example.com/image.png",
        },
      ],
    };
    const asset = {
      assetId: "local-image",
      name: "Photo",
      mimeType: "image/png",
      size: 200,
      createdAt: "2026-11-09T00:00:00Z",
    };
    const linked = linkDesignDocument(
      createDesignDocumentFromPreview({
        url: capture.url,
        title: capture.title,
        viewport: { _tag: "freeform", width: 800, height: 600 },
        colorScheme: "light",
        sourceRevision: "before",
        sourceThreadId: "thread-1",
        sourceTabId: "tab-1",
        capture,
        assetIdsByNodeId: new Map([["image", asset.assetId]]),
        assetMetadata: [asset],
      }),
    );
    const source = { ...linked.provenance!, sourceRevision: "after", capture };
    expect(() => refreshLinkedDesignDocument(linked, source)).toThrow(/image.*not.*stored/i);
    expect(linked.nodes.find((node) => node.nodeId === "preview-image")?.assetId).toBe(
      asset.assetId,
    );
    const nextAsset = { ...asset, assetId: "next-image" };
    const refreshed = refreshLinkedDesignDocument(linked, {
      ...source,
      assetIdsByNodeId: new Map([["image", nextAsset.assetId]]),
      assetMetadata: [nextAsset],
    });
    expect(refreshed.nodes.find((node) => node.nodeId === "preview-image")?.assetId).toBe(
      nextAsset.assetId,
    );
    expect(refreshed.provenance?.sourceRevision).toBe("after");
    expect(refreshed.provenance).not.toHaveProperty("capture");
    expect(refreshed.provenance).not.toHaveProperty("assetIdsByNodeId");
    expect(refreshed.provenance).not.toHaveProperty("assetMetadata");
  });
});

it("uses the inverse parent transform for nested preview layers", () => {
  const document = createDesignDocumentFromPreview({
    url: "http://localhost:3000/rotated",
    title: "Rotated",
    viewport: { _tag: "freeform", width: 800, height: 600 },
    colorScheme: "light",
    sourceRevision: "preview-transform",
    capture: {
      url: "http://localhost:3000/rotated",
      title: "Rotated",
      viewportWidth: 800,
      viewportHeight: 600,
      nodes: [
        {
          nodeId: "parent",
          parentId: null,
          kind: "group",
          name: "Parent",
          text: null,
          x: 100,
          y: 100,
          width: 200,
          height: 100,
          rotation: 90,
          fill: null,
          border: null,
          fontFamily: null,
          fontSize: null,
          fontWeight: null,
          lineHeight: null,
          letterSpacing: null,
          color: null,
          opacity: 1,
          borderRadius: 0,
        },
        {
          nodeId: "child",
          parentId: "parent",
          kind: "text",
          name: "Child",
          text: "Child",
          x: 210,
          y: 80,
          width: 40,
          height: 20,
          fill: null,
          border: null,
          fontFamily: null,
          fontSize: 16,
          fontWeight: 400,
          lineHeight: null,
          letterSpacing: null,
          color: null,
          opacity: 1,
          borderRadius: 0,
        },
      ],
    },
  });
  expect(document.nodes.find((node) => node.nodeId === "preview-child")).toMatchObject({
    x: 20,
    y: 10,
    width: 40,
    height: 20,
  });
});

it("imports captured SVG paths as editable vector layers", () => {
  const document = createDesignDocumentFromPreview({
    url: "http://localhost:3000/icon",
    title: "Icon",
    viewport: { _tag: "freeform", width: 200, height: 200 },
    colorScheme: "light",
    sourceRevision: "vector-preview",
    capture: {
      url: "http://localhost:3000/icon",
      title: "Icon",
      viewportWidth: 200,
      viewportHeight: 200,
      nodes: [
        {
          nodeId: "path-1",
          parentId: null,
          kind: "vector",
          name: "path",
          text: null,
          x: 10,
          y: 20,
          width: 24,
          height: 24,
          fill: "rgb(0, 0, 0)",
          border: null,
          fontFamily: null,
          fontSize: null,
          fontWeight: null,
          lineHeight: null,
          letterSpacing: null,
          color: null,
          opacity: 1,
          borderRadius: 0,
          vectorPath: "M 0 0 L 24 0 L 24 24 Z",
          vectorClosed: true,
        },
      ],
    },
  });
  expect(document.nodes.find((node) => node.nodeId === "preview-path-1")).toMatchObject({
    kind: "vector",
    vector: {
      path: "M 0 0 L 24 0 L 24 24 Z",
      width: 24,
      height: 24,
      closed: true,
    },
  });
});
