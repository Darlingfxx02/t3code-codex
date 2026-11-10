import type { DesignEffect, DesignNode } from "./designDocument";

// This reader also runs in the isolated React bundle, without the app's schema runtime.
export function readDesignEffectMetadata(value: string): readonly DesignEffect[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Invalid exported effect settings.");
  return parsed.map((raw: unknown) => {
    if (
      typeof raw !== "object" ||
      raw === null ||
      !("effectId" in raw) ||
      typeof raw.effectId !== "string" ||
      !("kind" in raw) ||
      !["drop-shadow", "inner-shadow", "layer-blur", "background-blur"].includes(
        String(raw.kind),
      ) ||
      !("visible" in raw) ||
      typeof raw.visible !== "boolean" ||
      !("x" in raw) ||
      typeof raw.x !== "number" ||
      !("y" in raw) ||
      typeof raw.y !== "number" ||
      !("blur" in raw) ||
      typeof raw.blur !== "number" ||
      !("spread" in raw) ||
      typeof raw.spread !== "number" ||
      !("color" in raw) ||
      typeof raw.color !== "string" ||
      ![raw.x, raw.y, raw.blur, raw.spread].every(Number.isFinite) ||
      raw.blur < 0
    )
      throw new Error("Invalid exported effect settings.");
    return {
      effectId: raw.effectId,
      kind: raw.kind as DesignEffect["kind"],
      visible: raw.visible,
      x: raw.x,
      y: raw.y,
      blur: raw.blur,
      spread: raw.spread,
      color: raw.color,
      ...("showBehindTransparentAreas" in raw && typeof raw.showBehindTransparentAreas === "boolean"
        ? { showBehindTransparentAreas: raw.showBehindTransparentAreas }
        : {}),
    };
  });
}

function tokens(value: string, delimiter: "," | " ") {
  const output: string[] = [];
  let depth = 0,
    start = 0;
  for (let index = 0; index <= value.length; index++) {
    const character = value[index];
    if (character === "(") depth++;
    if (character === ")") depth--;
    if (
      index === value.length ||
      (depth === 0 && (delimiter === " " ? /\s/u.test(character!) : character === delimiter))
    ) {
      const part = value.slice(start, index).trim();
      if (part) output.push(part);
      start = index + 1;
    }
  }
  return output;
}

export function parseDesignCssEffects(source: {
  boxShadow?: string | undefined;
  filter?: string | undefined;
  backdropFilter?: string | undefined;
}): readonly DesignEffect[] {
  const effects: DesignEffect[] = [];
  for (const shadow of tokens(source.boxShadow ?? "", ",")) {
    if (shadow === "none") continue;
    const parts = tokens(shadow, " ");
    const lengths = parts
      .filter((part) => /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/u.test(part))
      .map(Number.parseFloat);
    if (lengths.length < 2 || lengths.length > 4 || (lengths[2] ?? 0) < 0) continue;
    const color =
      parts
        .filter((part) => part !== "inset" && !/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/u.test(part))
        .join(" ") || "#000000";
    effects.push({
      effectId: `css-shadow-${effects.length}`,
      kind: parts.includes("inset") ? "inner-shadow" : "drop-shadow",
      visible: true,
      x: lengths[0]!,
      y: lengths[1]!,
      blur: lengths[2] ?? 0,
      spread: lengths[3] ?? 0,
      color,
    });
  }
  for (const [kind, value] of [
    ["layer-blur", source.filter],
    ["background-blur", source.backdropFilter],
  ] as const) {
    const blurs = Array.from(
      (value ?? "").matchAll(/(?:^|\s)blur\(\s*(\d+(?:\.\d+)?|\.\d+)(?:px)?\s*\)/gu),
      (match) => Number(match[1]),
    );
    if (blurs.length)
      effects.push({
        effectId: `css-${kind}`,
        kind,
        visible: true,
        x: 0,
        y: 0,
        blur: 2 * Math.hypot(...blurs),
        spread: 0,
        color: "#000000",
      });
  }
  return effects;
}

export function designEffectOutset(node: Pick<DesignNode, "effects">) {
  let outset = 0,
    blur = 0;
  for (const effect of node.effects ?? []) {
    if (!effect.visible) continue;
    if (effect.kind === "drop-shadow")
      outset = Math.max(
        outset,
        Math.max(Math.abs(effect.x), Math.abs(effect.y)) +
          Math.max(0, effect.spread) +
          effect.blur * 1.5,
      );
    if (effect.kind === "layer-blur") blur += effect.blur * 1.5;
  }
  return outset + blur;
}

export function designEffectFilterId(nodeId: string) {
  return `design-effects-${Array.from(nodeId, (character) => character.codePointAt(0)!.toString(16)).join("-")}`;
}

const escaped = (value: string) =>
  value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );

export function designEffectsSvg(
  node: DesignNode,
  id: string,
  region = { x: 0, y: 0, width: node.width, height: node.height },
) {
  const effects =
    node.effects?.filter((effect) => effect.visible && effect.kind !== "background-blur") ?? [];
  if (!effects.length) return "";
  const primitives: string[] = [];
  const shadows: string[] = [],
    inner: string[] = [];
  primitives.push(
    '<feComponentTransfer in="SourceAlpha" result="solid"><feFuncA type="linear" slope="100000"/></feComponentTransfer>',
  );
  for (const [index, effect] of effects.entries()) {
    if (effect.kind !== "drop-shadow" && effect.kind !== "inner-shadow") continue;
    const prefix = `effect-${index}`;
    const spread = node.kind === "text" ? 0 : effect.spread;
    const radius = Math.abs(spread);
    const operator =
      effect.kind === "inner-shadow"
        ? spread >= 0
          ? "erode"
          : "dilate"
        : spread >= 0
          ? "dilate"
          : "erode";
    primitives.push(
      `<feMorphology in="SourceAlpha" operator="${operator}" radius="${radius}" result="${prefix}-spread"/><feGaussianBlur in="${prefix}-spread" stdDeviation="${effect.blur / 2}" result="${prefix}-blur"/><feOffset in="${prefix}-blur" dx="${effect.x}" dy="${effect.y}" result="${prefix}-offset"/>`,
    );
    const input = effect.kind === "inner-shadow" ? `${prefix}-mask` : `${prefix}-offset`;
    if (effect.kind === "inner-shadow")
      primitives.push(
        `<feComposite in="solid" in2="${prefix}-offset" operator="out" result="${input}"/>`,
      );
    primitives.push(
      `<feFlood flood-color="${escaped(effect.color)}"/><feComposite in2="${input}" operator="in" result="${prefix}-color"/>`,
    );
    if (effect.kind === "drop-shadow" && !effect.showBehindTransparentAreas)
      primitives.push(
        `<feComposite in="${prefix}-color" in2="solid" operator="out" result="${prefix}-color"/>`,
      );
    (effect.kind === "inner-shadow" ? inner : shadows).unshift(`${prefix}-color`);
  }
  primitives.push(
    `<feMerge result="composed">${[...shadows, "SourceGraphic", ...inner].map((result) => `<feMergeNode in="${result}"/>`).join("")}</feMerge>`,
  );
  let previous = "composed";
  for (const [index, effect] of effects.entries())
    if (effect.kind === "layer-blur") {
      primitives.push(
        `<feGaussianBlur in="${previous}" stdDeviation="${effect.blur / 2}" result="blur-${index}"/>`,
      );
      previous = `blur-${index}`;
    }
  const outset = designEffectOutset(node) + 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" data-t3-design-effect-defs="" style="position:absolute;pointer-events:none"><defs><filter id="${escaped(id)}" x="${region.x - outset}" y="${region.y - outset}" width="${region.width + 2 * outset}" height="${region.height + 2 * outset}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${primitives.join("")}</filter></defs></svg>`;
}

export function designEffectsStyle(node: DesignNode, id: string) {
  const visible = node.effects?.filter((effect) => effect.visible) ?? [];
  const background = visible.find((effect) => effect.kind === "background-blur");
  return {
    ...(visible.some((effect) => effect.kind !== "background-blur")
      ? { filter: `url("#${id}")` }
      : {}),
    ...(background ? { backdropFilter: `blur(${background.blur / 2}px)` } : {}),
  };
}
