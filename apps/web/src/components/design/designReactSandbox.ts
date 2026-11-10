import * as React from "react";
import * as ReactDOM from "react-dom";
import * as ReactClient from "react-dom/client";
import * as JSXRuntime from "react/jsx-runtime";
import { transform } from "sucrase";
import { captureDesignDom } from "./designDomCapture";
import { observeResize } from "../../lib/observeResize";

type Source = { entry: string; files: Record<string, string> };
const scriptNonce = (document.currentScript as HTMLScriptElement | null)?.nonce ?? "";

function pathName(path: string) {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error("An import points outside the supplied files.");
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

function renderSource(source: Source, fail: (error: unknown) => void) {
  const files: Record<string, string> = Object.create(null);
  for (const [name, code] of Object.entries(source.files)) {
    const path = pathName(name);
    if (Object.hasOwn(files, path)) throw new Error(`Two source files resolve to “${path}”.`);
    files[path] = code;
  }
  const builtins: Record<string, unknown> = {
    react: React,
    "react-dom": ReactDOM,
    "react-dom/client": ReactClient,
    "react/jsx-runtime": JSXRuntime,
  };
  const modules = new Map<string, { exports: Record<string, unknown> }>();
  const load = (requested: string, from = "") => {
    if (Object.hasOwn(builtins, requested)) return builtins[requested];
    if (from && !requested.startsWith("."))
      throw new Error(
        `Dependency “${requested}” is not included. Supply its source files or capture the running app in Preview.`,
      );
    const base = pathName(
      from ? `${from.slice(0, from.lastIndexOf("/") + 1)}${requested}` : requested,
    );
    const id = [
      base,
      `${base}.tsx`,
      `${base}.jsx`,
      `${base}.ts`,
      `${base}.js`,
      `${base}/index.tsx`,
      `${base}/index.jsx`,
      `${base}/index.ts`,
      `${base}/index.js`,
    ].find((file) => Object.hasOwn(files, file));
    if (!id) throw new Error(`Could not resolve “${requested}” from “${from || source.entry}”.`);
    const existing = modules.get(id);
    if (existing) return existing.exports;
    const module = { exports: {} as Record<string, unknown> };
    modules.set(id, module);
    const code = files[id]!;
    if (id.endsWith(".css")) {
      const style = document.createElement("style");
      style.textContent = code;
      document.head.append(style);
    } else if (id.endsWith(".json")) module.exports = JSON.parse(code);
    else if (id.endsWith(".svg") || /^data:image\//.test(code))
      module.exports = {
        default: id.endsWith(".svg")
          ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(code)}`
          : code,
        __esModule: true,
      };
    else {
      const output = transform(code, {
        transforms: ["typescript", "jsx", "imports"],
        production: true,
        filePath: id,
      }).code;
      const context = {
        require: (name: string): unknown => load(name, id),
        module,
        React,
        failed: false,
        error: undefined as unknown,
      };
      const script = document.createElement("script") as HTMLScriptElement & {
        designModule?: typeof context;
      };
      script.designModule = context;
      script.nonce = scriptNonce;
      script.textContent = `(()=>{"use strict";const context=document.currentScript.designModule;const {require,module,React}=context;const exports=module.exports;try{${output}\nif (!exports.default && typeof App !== 'undefined') exports.default = App;}catch(error){context.failed=true;context.error=error}})();`;
      document.head.append(script);
      script.remove();
      delete script.designModule;
      if (context.failed) throw context.error;
    }
    return module.exports;
  };
  const entry = load(source.entry) as Record<string, unknown>;
  const component = entry.default;
  if (typeof component !== "function" && typeof component !== "object")
    throw new Error("Export a default React component or name it App.");
  const root = ReactClient.createRoot(document.getElementById("root")!, { onUncaughtError: fail });
  ReactDOM.flushSync(() =>
    root.render(
      React.isValidElement(component)
        ? component
        : React.createElement(component as React.ComponentType),
    ),
  );
  return root;
}

window.addEventListener("message", async (event: MessageEvent<Source & { type: string }>) => {
  if (event.source !== parent || event.data?.type !== "t3-design-react" || !event.ports[0]) return;
  const port = event.ports[0];
  let failed = false;
  let disposed = false;
  let root: ReactClient.Root | null = null;
  let stopLayout: (() => void) | undefined;
  let captured: ReturnType<typeof captureDesignDom> | undefined;
  const fail = (error: unknown) => {
    if (failed) return;
    failed = true;
    port.postMessage({ error: error instanceof Error ? error.message : String(error) });
  };
  const unmount = () => {
    stopLayout?.();
    stopLayout = undefined;
    const current = root;
    root = null;
    current?.unmount();
  };
  port.onmessage = (message: MessageEvent<{ dispose?: boolean }>) => {
    if (!message.data?.dispose) return;
    disposed = true;
    try {
      unmount();
    } catch (error) {
      fail(error);
    }
    port.postMessage({ disposed: true });
  };
  window.addEventListener("error", (error) => fail(error.error ?? error.message));
  window.addEventListener("unhandledrejection", (error) => fail(error.reason));
  try {
    root = renderSource(event.data, fail);
    // Hidden frames do not receive animation frames; flush mount effects through the task queue instead.
    await new Promise<void>((resolve) => {
      const task = new MessageChannel();
      task.port1.onmessage = () => {
        task.port1.close();
        task.port2.close();
        resolve();
      };
      task.port2.postMessage(null);
    });
    ReactDOM.flushSync(() => undefined);
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, (image) => image.decode().catch(() => undefined)),
    );
    if (failed || disposed) return;
    // Embedded browsers may defer a new iframe's layout after load, even after React commits.
    await new Promise<void>((resolve) => {
      stopLayout = observeResize(document.getElementById("root")!, (entries) => {
        if (!entries.some((entry) => entry.contentRect.width > 0)) return;
        stopLayout?.();
        stopLayout = undefined;
        resolve();
      });
    });
    if (failed || disposed) return;
    captured = captureDesignDom(document.getElementById("root")!, "frame-home");
    for (const node of captured) {
      if (!node.sourceUrl?.startsWith("blob:")) continue;
      const blob = await (await fetch(node.sourceUrl)).blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      Object.assign(node, { sourceUrl: dataUrl });
    }
  } catch (error) {
    fail(error);
  } finally {
    try {
      unmount();
    } catch (error) {
      fail(error);
    }
  }
  if (!failed && !disposed && captured) port.postMessage({ nodes: captured });
});
