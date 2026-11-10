import { expect, it } from "vite-plus/test";
import { createInitialDesignDocument } from "./designDocument";
import {
  designEffectOutset,
  designEffectsSvg,
  designEffectsStyle,
  parseDesignCssEffects,
} from "./designEffects";

it("normalizes computed CSS shadows and blurs without splitting color functions", () => {
  const effects = parseDesignCssEffects({
    boxShadow: "rgba(12, 34, 56, 0.5) 2px -3px 8px 4px, inset 0px 1px 6px rgb(0 0 0 / 20%)",
    filter: "brightness(1.2) blur(3px)",
    backdropFilter: "blur(4px)",
  });
  expect(effects).toMatchObject([
    { kind: "drop-shadow", x: 2, y: -3, blur: 8, spread: 4, color: "rgba(12, 34, 56, 0.5)" },
    { kind: "inner-shadow", x: 0, y: 1, blur: 6, spread: 0, color: "rgb(0 0 0 / 20%)" },
    { kind: "layer-blur", blur: 6 },
    { kind: "background-blur", blur: 8 },
  ]);
  expect(parseDesignCssEffects({ boxShadow: "none", filter: "none" })).toEqual([]);
  const node = { ...createInitialDesignDocument().nodes[0]!, effects };
  expect(designEffectOutset(node)).toBe(28);
  const svg = designEffectsSvg(node, "qa-filter");
  expect(svg).toContain('flood-color="rgba(12, 34, 56, 0.5)"');
  expect(svg).toContain('operator="out"');
  expect(svg.indexOf('in="effect-0-color"/>')).toBeLessThan(svg.indexOf('in="SourceGraphic"/>'));
  expect(designEffectsStyle(node, "qa-filter")).toEqual({
    filter: 'url("#qa-filter")',
    backdropFilter: "blur(4px)",
  });
  const disabled = { ...node, effects: effects.map((effect) => ({ ...effect, visible: false })) };
  expect(designEffectOutset(disabled)).toBe(0);
  expect(designEffectsSvg(disabled, "qa-filter")).toBe("");
  expect(designEffectsStyle(disabled, "qa-filter")).toEqual({});
});
