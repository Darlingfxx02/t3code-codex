import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { useState } from "react";
import "~/index.css";
import { render } from "../../../test/render";
import { DesignReactPasteDialog } from "./DesignReactPasteDialog";
import type { DesignDocument } from "./designDocument";
import { createDesignDocumentFromMarkup } from "./previewToDesign";
import { materializeDesignDocumentImages } from "./designImage";
import { serializeDesignFile } from "./designAssetPackage";
import { readDesignAsset } from "./designAssetStore";
import { pasteDesignNodes, createInitialDesignDocument } from "./designDocument";

function CancellablePaste({ onImport }: { onImport: (document: DesignDocument) => void }) {
  const [open, setOpen] = useState(true);
  return open ? (
    <DesignReactPasteDialog
      viewport={{ width: 640, height: 420 }}
      onImport={onImport}
      onClose={() => setOpen(false)}
    />
  ) : (
    <p>Cancelled</p>
  );
}

it("unmounts a pending React root when the paste dialog is cancelled", async () => {
  const imported = vi.fn<(document: DesignDocument) => void>();
  await using screen = await render(<CancellablePaste onImport={imported} />, {
    router: "/design",
  });
  const milestones = new Map<string, () => void>();
  const mounted = new Promise<void>((resolve) => milestones.set("mounted", resolve));
  const cleaned = new Promise<void>((resolve) => milestones.set("cleaned", resolve));
  const listener = (event: MessageEvent<{ qaReact?: string }>) =>
    milestones.get(event.data?.qaReact ?? "")?.();
  window.addEventListener("message", listener);
  using _listener = {
    [Symbol.dispose]() {
      window.removeEventListener("message", listener);
    },
  };
  await userEvent.fill(
    screen.getByRole("textbox", { name: "React code" }),
    `import React,{useEffect} from 'react'; HTMLImageElement.prototype.decode=()=>new Promise(()=>{}); export default function App(){useEffect(()=>{parent.postMessage({qaReact:'mounted'},'*');return ()=>parent.postMessage({qaReact:'cleaned'},'*')},[]);return <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E"/>}`,
  );
  await userEvent.click(screen.getByRole("button", { name: "Import to canvas" }));
  await mounted;
  await userEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  await cleaned;
  await vi.waitFor(() =>
    expect(document.querySelector('iframe[sandbox="allow-scripts"]')).toBeNull(),
  );
  expect(imported).not.toHaveBeenCalled();
});

it("unmounts the React root and reports an effect cleanup error", async () => {
  await expect(
    createDesignDocumentFromMarkup({
      mode: "react",
      markup:
        "import React,{useEffect} from 'react'; export default function App(){useEffect(()=>()=>{throw new Error('Cleanup executed')},[]);return <p>Cleanup</p>}",
    }),
  ).rejects.toThrow("Cleanup executed");
  expect(document.querySelector('iframe[sandbox="allow-scripts"]')).toBeNull();
});

it("measures React inside the active paste modal while its controls are disabled", async () => {
  const imported = vi.fn<(document: DesignDocument) => void>();
  await using screen = await render(
    <DesignReactPasteDialog
      viewport={{ width: 640, height: 420 }}
      onImport={imported}
      onClose={() => undefined}
    />,
    { router: "/design" },
  );
  await userEvent.fill(
    screen.getByRole("textbox", { name: "React code" }),
    "export default function App(){return <main style={{width:320,height:180,position:'absolute',left:24,top:24}}>Modal capture</main>}",
  );
  await userEvent.click(screen.getByRole("button", { name: "Import to canvas" }));
  await vi.waitFor(() => expect(imported).toHaveBeenCalledOnce());
  expect(imported.mock.calls[0]![0].nodes.find((node) => node.name === "main")).toMatchObject({
    x: 24,
    y: 24,
    width: 320,
    height: 180,
    text: "Modal capture",
  });
  expect(document.querySelector('iframe[sandbox="allow-scripts"]')).toBeNull();
});

it("renders a supplied module graph with CSS and packages its local image", async () => {
  const source = JSON.stringify({
    kind: "t3-react-source",
    entry: "./src/App.tsx",
    files: {
      "./src/App.tsx": `import React from 'react'; import {Card} from './Card'; import './styles.css'; import data from './labels.json'; import logo from './logo.svg'; export default () => <main className="cards"><Card label={data.title}/><img aria-label="Local logo" src={logo} width={24} height={24}/></main>`,
      "src/Card.tsx": `import React from 'react'; export function Card({label}:{label:string}) {return <p className="card">Hello <strong>{label}</strong>!</p>}`,
      "src/styles.css":
        ".cards{position:absolute;left:32px;top:48px;display:flex;gap:12px;width:280px;height:64px;padding:8px;background:#224466;align-items:flex-start}.card{margin:0;font-size:18px;letter-spacing:1px;color:#fff}",
      "src/labels.json": JSON.stringify({ title: "Module" }),
      "src/logo.svg":
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="red"/></svg>',
    },
  });
  const captured = await createDesignDocumentFromMarkup({
    markup: source,
    mode: "react",
    viewport: { width: 800, height: 600 },
  });
  expect(captured.nodes[0]).toMatchObject({ width: 800, height: 600 });
  const main = captured.nodes.find((node) => node.name === "main")!;
  expect(main).toMatchObject({
    x: 32,
    y: 48,
    width: 280,
    height: 64,
    layoutModel: { kind: "flex", gap: 12, paddingLeft: 8 },
  });
  expect(captured.nodes.some((node) => node.text === "Hello ")).toBe(true);
  expect(captured.nodes.some((node) => node.text === "Module")).toBe(true);
  expect(captured.nodes.some((node) => node.text === "!")).toBe(true);
  const imported = await materializeDesignDocumentImages(captured);
  const asset = imported.assets[0]!;
  expect(asset).toMatchObject({ width: 24, height: 24, mimeType: "image/svg+xml" });
  expect(await (await readDesignAsset(asset.assetId))?.text()).toContain("<svg");
  const portable = JSON.parse(await serializeDesignFile(imported));
  expect(portable.assetPayloads).toHaveLength(1);
  expect(
    portable.document.nodes.some(
      (node: { assetId: string | null }) => node.assetId === asset.assetId,
    ),
  ).toBe(true);
  const pasted = pasteDesignNodes(createInitialDesignDocument(), imported, [
    imported.nodes[0]!.nodeId,
  ]);
  const copied = pasted.nodes.find((node) => node.name === "main")!;
  const card = pasted.nodes.find((node) => node.parentId === copied.nodeId && node.name === "p")!;
  expect(card).toMatchObject({ x: 8, y: 8 });
  expect(document.querySelector('iframe[sandbox="allow-scripts"]')).toBeNull();
  const abort = new AbortController();
  abort.abort(new Error("Import cancelled"));
  await expect(
    createDesignDocumentFromMarkup({
      markup: "<p>Cancelled</p>",
      mode: "react",
      signal: abort.signal,
    }),
  ).rejects.toThrow("Import cancelled");
  expect(document.querySelector('iframe[sandbox="allow-scripts"]')).toBeNull();
});
