import * as Schema from "effect/Schema";
import { createInitialDesignDocument, DesignDocument, type DesignNode } from "./designDocument";
import { contentAddressedDesignAssetId } from "./designAssetStore";
const decodeDocument = Schema.decodeSync(DesignDocument);

function sourceFiles(markup: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(markup);
  } catch {
    parsed = null;
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "kind" in parsed &&
    parsed.kind === "t3-react-source"
  ) {
    if (
      !("entry" in parsed) ||
      typeof parsed.entry !== "string" ||
      !("files" in parsed) ||
      typeof parsed.files !== "object" ||
      parsed.files === null ||
      Array.isArray(parsed.files) ||
      Object.values(parsed.files).some((value) => typeof value !== "string")
    )
      throw new Error("The React source package needs an entry and text source files.");
    return { entry: parsed.entry, files: parsed.files as Record<string, string> };
  }
  const code = /^\s*</u.test(markup)
    ? `export default function App(){return (${markup});}`
    : markup;
  return { entry: "App.tsx", files: { "App.tsx": code } };
}

export async function createDesignDocumentFromReact(
  markup: string,
  options: {
    signal?: AbortSignal | undefined;
    viewport?: { width: number; height: number } | undefined;
  } = {},
): Promise<DesignDocument> {
  const { signal } = options;
  const viewport = options.viewport ?? { width: 640, height: 420 };
  if (
    ![viewport.width, viewport.height].every(
      (value) => Number.isFinite(value) && value >= 16 && value <= 8192,
    )
  )
    throw new Error("Use a viewport between 16 and 8192 pixels.");
  const source = sourceFiles(markup);
  const { default: runtime } = await import("virtual:design-react-runtime");
  signal?.throwIfAborted();
  const nonce = crypto.getRandomValues(new Uint32Array(4)).join("");
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  frame.style.cssText = `position:fixed;left:0;top:0;width:${viewport.width}px;height:${viewport.height}px;border:0;opacity:0;pointer-events:none;z-index:-1`;
  const channel = new MessageChannel();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  let started = false;
  try {
    const nodes = await new Promise<readonly DesignNode[]>((resolve, reject) => {
      abort = () => reject(signal?.reason ?? new Error("React import cancelled."));
      signal?.addEventListener("abort", abort, { once: true });
      timeout = setTimeout(
        () =>
          reject(
            new Error("The React frame did not finish rendering. Check its effects and resources."),
          ),
        15000,
      );
      channel.port1.onmessage = (
        event: MessageEvent<{ nodes?: readonly DesignNode[]; error?: string }>,
      ) => {
        if (event.data.error) reject(new Error(event.data.error));
        else if (Array.isArray(event.data.nodes)) resolve(event.data.nodes);
        else reject(new Error("The React sandbox returned an invalid capture."));
      };
      frame.onload = () => {
        started = true;
        frame.contentWindow?.postMessage({ type: "t3-design-react", ...source }, "*", [
          channel.port2,
        ]);
      };
      frame.srcdoc = `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob: http: https:; font-src data: blob: http: https:; connect-src blob:; base-uri 'none'; form-action 'none'"><style>html,body,#root{margin:0;width:100%;min-height:100%}*{box-sizing:border-box}</style></head><body><div id="root"></div><script nonce="${nonce}">${runtime.replace(/<\/script/giu, "<\\/script")}</script></body></html>`;
      document.body.append(frame);
    });
    signal?.throwIfAborted();
    const documentModel = createInitialDesignDocument();
    const provenance = {
      mode: "snapshot" as const,
      route: "react:clipboard",
      sourceRevision: await contentAddressedDesignAssetId(new Blob([markup])),
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      colorScheme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      capturedAt: new Date().toISOString(),
      browserEngine: navigator.userAgent,
      stateFixture: "React mount snapshot",
    };
    signal?.throwIfAborted();
    return decodeDocument({
      ...documentModel,
      title: "Pasted React frame",
      provenance,
      nodes: [
        {
          ...documentModel.nodes[0]!,
          x: 0,
          y: 0,
          width: viewport.width,
          height: viewport.height,
          provenance,
          childIds: nodes
            .filter((node) => node.parentId === "frame-home")
            .map((node) => node.nodeId),
        },
        ...nodes.map((node) => ({ ...node, provenance })),
      ],
    });
  } finally {
    clearTimeout(timeout);
    if (abort) signal?.removeEventListener("abort", abort);
    if (started)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1000);
        channel.port1.onmessage = (event: MessageEvent<{ disposed?: boolean }>) => {
          if (!event.data?.disposed) return;
          clearTimeout(timer);
          resolve();
        };
        try {
          channel.port1.postMessage({ dispose: true });
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });
    channel.port1.close();
    channel.port2.close();
    frame.remove();
  }
}
