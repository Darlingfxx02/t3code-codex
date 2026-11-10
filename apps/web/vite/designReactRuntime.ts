import * as NodeURL from "node:url";
import { rolldown } from "vite/rolldown";
import type { Plugin } from "vite-plus";

const moduleId = "virtual:design-react-runtime";
const resolvedId = `\0${moduleId}`;
const entry = NodeURL.fileURLToPath(
  new URL("../src/components/design/designReactSandbox.ts", import.meta.url),
);

export function designReactRuntimePlugin(): Plugin {
  let compiled: Promise<{ code: string; files: string[] }> | null = null;
  const compile = async () => {
    const bundle = await rolldown({
      input: entry,
      platform: "browser",
      transform: { define: { "process.env.NODE_ENV": JSON.stringify("production") } },
    });
    try {
      const result = await bundle.generate({ format: "iife", minify: true, codeSplitting: false });
      const chunk = result.output.find((item) => item.type === "chunk");
      if (!chunk) throw new Error("Could not bundle the Design React sandbox.");
      return { code: chunk.code, files: await bundle.watchFiles };
    } finally {
      await bundle.close();
    }
  };
  return {
    name: "t3-design-react-runtime",
    resolveId(id) {
      if (id === moduleId) return resolvedId;
    },
    async load(id) {
      if (id !== resolvedId) return;
      compiled ??= compile();
      const result = await compiled;
      for (const file of result.files) this.addWatchFile(file);
      return `export default ${JSON.stringify(result.code)};`;
    },
    handleHotUpdate(context) {
      if (
        !context.file.includes("/components/design/designReact") &&
        !context.file.endsWith("/designDomCapture.ts")
      )
        return;
      compiled = null;
      const module = context.server.moduleGraph.getModuleById(resolvedId);
      if (module) context.server.moduleGraph.invalidateModule(module);
      context.server.ws.send({ type: "full-reload" });
    },
  };
}
