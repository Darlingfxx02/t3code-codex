type Box = { x: number; y: number; width: number; height: number };

const properties = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "width",
  "height",
  "box-sizing",
  "margin",
  "padding",
  "overflow",
  "border",
  "border-radius",
  "background",
  "background-image",
  "background-size",
  "background-position",
  "background-repeat",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "font-kerning",
  "font-variant",
  "line-height",
  "letter-spacing",
  "white-space",
  "text-align",
  "text-decoration",
  "text-transform",
  "word-break",
  "overflow-wrap",
  "opacity",
  "visibility",
  "transform",
  "transform-origin",
  "filter",
  "backdrop-filter",
  "object-fit",
  "object-position",
  "fill",
  "stroke",
  "stroke-width",
  "vector-effect",
  "flex-direction",
  "justify-content",
  "align-items",
  "gap",
] as const;

const resources = new Map<string, string>();
async function inlineResource(url: string, signal: AbortSignal) {
  if (url.startsWith("data:")) return url;
  const cached = resources.get(url);
  if (cached) return cached;
  const response = await fetch(url, { signal, cache: "force-cache" });
  if (!response.ok) throw new Error("Could not load a preview image or font.");
  const blob = await response.blob();
  signal.throwIfAborted();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  const data = `data:${blob.type};base64,${btoa(binary)}`;
  if (data.length <= 16_777_216) {
    resources.set(url, data);
    while (
      resources.size > 32 ||
      [...resources.values()].reduce((size, value) => size + value.length, 0) > 16_777_216
    )
      resources.delete(resources.keys().next().value!);
  }
  return data;
}

async function inlineUrls(value: string, base: string, signal: AbortSignal) {
  let output = "",
    previous = 0;
  for (const match of value.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gu)) {
    const source = (match[1] ?? match[2] ?? match[3] ?? "").trim();
    const url = new URL(source, base);
    const fragment =
      source.startsWith("#") ||
      (url.hash && url.href.slice(0, -url.hash.length) === base.split("#")[0]);
    const resolved = fragment ? url.hash : await inlineResource(url.href, signal);
    output += value.slice(previous, match.index) + `url("${resolved}")`;
    previous = match.index + match[0].length;
  }
  return output + value.slice(previous);
}

const familyName = (value: string) =>
  value
    .trim()
    .replace(/^["']|["']$/gu, "")
    .toLowerCase();
async function embeddedFonts(owner: Document, families: ReadonlySet<string>, signal: AbortSignal) {
  const faces: { rule: CSSFontFaceRule; base: string }[] = [];
  const loaded = [...owner.fonts].filter((face) => face.status === "loaded");
  const range = (value: string) => value.replace(/\s/gu, "").toLowerCase() || "u+0-10ffff";
  const loadedRule = (rule: CSSFontFaceRule) =>
    loaded.some(
      (face) =>
        familyName(face.family) === familyName(rule.style.fontFamily) &&
        face.style === (rule.style.fontStyle || "normal") &&
        face.weight === (rule.style.fontWeight || "normal") &&
        face.stretch === (rule.style.fontStretch || "normal") &&
        range(face.unicodeRange) === range(rule.style.getPropertyValue("unicode-range")),
    );
  const visit = (rules: CSSRuleList, base: string) => {
    for (const rule of rules) {
      if (
        rule instanceof CSSFontFaceRule &&
        families.has(familyName(rule.style.fontFamily)) &&
        loadedRule(rule)
      )
        faces.push({ rule, base });
      else if (rule instanceof CSSImportRule && rule.styleSheet) {
        try {
          visit(rule.styleSheet.cssRules, rule.href);
        } catch {
          /* Cross-origin CSS is opaque. */
        }
      } else if (rule instanceof CSSGroupingRule) visit(rule.cssRules, base);
    }
  };
  for (const sheet of owner.styleSheets) {
    try {
      visit(sheet.cssRules, sheet.href ?? owner.baseURI);
    } catch {
      /* Cross-origin CSS is opaque. */
    }
  }
  for (const face of loaded) {
    const family = familyName(face.family);
    if (
      families.has(family) &&
      !faces.some(({ rule }) => familyName(rule.style.fontFamily) === family)
    )
      throw new Error("This font cannot be embedded in pixel preview.");
  }
  const styles: string[] = [];
  for (const { rule, base } of faces) styles.push(await inlineUrls(rule.cssText, base, signal));
  return styles.join("\n");
}

export async function rasterizeDesignScene(
  scene: HTMLElement,
  viewport: Box,
  density: 1 | 2,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  const x = Math.floor(viewport.x * density) / density;
  const y = Math.floor(viewport.y * density) / density;
  const width = Math.ceil((viewport.x + viewport.width) * density) - x * density;
  const height = Math.ceil((viewport.y + viewport.height) * density) - y * density;
  if (width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 16_777_216)
    throw new Error("Zoom in to use pixel preview in this area.");
  const owner = scene.ownerDocument;
  await owner.fonts.ready;
  signal.throwIfAborted();
  const clone = scene.cloneNode(true) as HTMLElement;
  const originals = [scene, ...scene.querySelectorAll("*")];
  const copies = [clone, ...clone.querySelectorAll("*")];
  const families = new Set<string>();
  for (const [index, element] of originals.entries()) {
    if (index > 0 && index % 64 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      signal.throwIfAborted();
    }
    const copy = copies[index]!;
    if (element.hasAttribute("data-design-frame-label")) {
      copy.remove();
      continue;
    }
    const style = owner.defaultView!.getComputedStyle(element);
    for (const family of style.fontFamily.split(",")) families.add(familyName(family));
    const css = properties
      .map((property) => `${property}:${style.getPropertyValue(property)}`)
      .join(";");
    copy.setAttribute("style", await inlineUrls(css, owner.baseURI, signal));
    copy.removeAttribute("class");
    if (element instanceof HTMLImageElement) {
      copy.removeAttribute("srcset");
      copy.setAttribute("loading", "eager");
      const source = element.currentSrc || element.getAttribute("src");
      if (source)
        copy.setAttribute("src", await inlineResource(new URL(source, owner.baseURI).href, signal));
    }
    signal.throwIfAborted();
  }
  clone.style.opacity = "1";
  const box = { x, y, width: width / density, height: height / density };
  const body = owner.createElement("div");
  body.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  body.style.cssText = `position:relative;width:${box.width}px;height:${box.height}px;overflow:hidden`;
  const content = owner.createElement("div");
  content.style.cssText = `position:absolute;left:${-x}px;top:${-y}px`;
  content.append(clone);
  const fonts = owner.createElement("style");
  fonts.textContent = await embeddedFonts(owner, families, signal);
  body.append(fonts, content);
  const markup = new XMLSerializer().serializeToString(body);
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: unknown) => {
      signal.removeEventListener("abort", abort);
      image.onload = null;
      image.onerror = null;
      if (error) reject(error);
      else resolve();
    };
    const abort = () => {
      finish(signal.reason);
      image.src = "";
    };
    signal.addEventListener("abort", abort, { once: true });
    image.onload = () => finish();
    image.onerror = () => finish(new Error("Could not render pixel preview."));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${box.width} ${box.height}"><foreignObject width="${box.width}" height="${box.height}">${markup}</foreignObject></svg>`)}`;
  });
  signal.throwIfAborted();
  const canvas = owner.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Pixel preview is unavailable in this browser.");
  context.drawImage(image, 0, 0);
  return { canvas, box };
}
