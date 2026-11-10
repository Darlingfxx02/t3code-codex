import { PlusIcon, MinusIcon } from "lucide-react";
import { formatHex8, parse } from "culori";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { DesignNumberField } from "./DesignNumberField";
import { DesignInspectorColor } from "./DesignInspectorColor";
import { DesignEffectsPanel } from "./DesignEffectsPanel";
import { DesignAlignmentControls, type DesignAlignment } from "./DesignAlignmentControls";
import type { DesignNode } from "./designDocument";
import { evaluateDesignExpression } from "./designExpression";
import { DesignAspectRatioControl } from "./DesignAspectRatioControl";
import { designInspectorRotation } from "./designTransform";
import { DesignRotationControls } from "./DesignRotationControls";
import { DesignTypographyPanel } from "./DesignTypographyPanel";

const shared = <T,>(nodes: readonly DesignNode[], read: (node: DesignNode) => T) => {
  const value = read(nodes[0]!);
  return { value, mixed: nodes.some((node) => !Object.is(read(node), value)) };
};
const fill = (node: DesignNode) =>
  node.kind === "text"
    ? (node.typography?.color ?? node.fill)
    : (node.paint?.background ?? node.fill);
const colorKey = (value: string | null | undefined) =>
  value ? (formatHex8(parse(value)) ?? value) : null;
const stroke = (node: DesignNode) => node.paint?.borderWidth ?? (node.border ? 1 : 0);
const newEffectId = () => `effect-${crypto.getRandomValues(new Uint32Array(2)).join("-")}`;

export function DesignMultiInspector({
  nodes,
  allNodes,
  onChange,
  onAlign,
  propertyLabels,
  canAlign,
  onDistribute,
  onFlip,
  onRotate,
  canTransform,
}: {
  nodes: readonly DesignNode[];
  allNodes: readonly DesignNode[];
  onChange: (update: (node: DesignNode) => Partial<DesignNode> | null) => boolean;
  onAlign: (alignment: DesignAlignment) => void;
  propertyLabels: boolean;
  canAlign: boolean;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  onFlip: (axis: "horizontal" | "vertical") => void;
  onRotate: () => void;
  canTransform: boolean;
}) {
  const byId = new Map(allNodes.map((node) => [node.nodeId, node]));
  const positionControlled = nodes.some((node) => {
    const parent = byId.get(node.parentId ?? "");
    return (
      parent?.layoutModel &&
      parent.layoutModel.kind !== "absolute" &&
      node.layoutSizing?.position !== "absolute"
    );
  });
  const number = (
    label: string,
    read: (node: DesignNode) => number | undefined,
    write: (node: DesignNode, value: number) => Partial<DesignNode>,
    min?: number,
    max?: number,
    disabled = false,
    placeholder?: string,
  ) => {
    const common = shared(nodes, read);
    return (
      <DesignNumberField
        label={label}
        value={common.value}
        mixed={common.mixed}
        disabled={disabled}
        compact
        propertyLabels={propertyLabels}
        min={min}
        max={max}
        placeholder={placeholder}
        prefix={
          (
            {
              Width: "W",
              Height: "H",
              Rotation: "∠",
              "Opacity %": "◌",
              Radius: "⌜",
              "Font size": "Size",
              "Line height": "↕",
              "Letter spacing": "↔",
              "Stroke width": "☰",
            } as Record<string, string>
          )[label]
        }
        onChange={(value) => {
          onChange((node) => write(node, value));
        }}
        onExpression={(expression) =>
          onChange((node) => {
            const value = evaluateDesignExpression(expression, read(node));
            return value === null
              ? null
              : write(node, Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value)));
          })
        }
      />
    );
  };
  const section = (title: string, children: ReactNode, action?: ReactNode) => (
    <section className="space-y-2 border-b border-border/60 px-3 py-2.5">
      <div className="flex h-6 items-center justify-between">
        <h3 className="text-xs font-medium">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
  const fillValue = shared(nodes, (node) => colorKey(fill(node)));
  const strokeValue = shared(nodes, (node) =>
    stroke(node) > 0 ? colorKey(node.paint?.borderColor ?? node.border) : null,
  );
  const hasFill = nodes.some((node) => fill(node) !== null && fill(node) !== undefined);
  const hasStroke = nodes.some((node) => stroke(node) > 0);
  const allText = nodes.every((node) => node.kind === "text");
  const master = nodes[0]!;
  const effectsKey = (node: DesignNode) =>
    JSON.stringify(node.effects ?? [], (key, value: unknown) =>
      key === "effectId" ? undefined : value,
    );
  const effectsMixed = shared(nodes, effectsKey).mixed;
  return (
    <fieldset className="min-w-0">
      <div className="flex h-12 items-center justify-between border-b border-border/60 px-3">
        <h2 className="text-xs font-semibold">Selection</h2>
        <span className="text-2xs text-muted-foreground">{nodes.length} layers</span>
      </div>
      {section(
        "Position",
        <>
          <DesignAlignmentControls
            onAlign={onAlign}
            disabled={positionControlled || !canAlign}
            onDistribute={onDistribute}
            distributeDisabled={positionControlled || !canAlign}
          />
          <div className="grid grid-cols-2 gap-2">
            {number(
              "X",
              (node) => node.x,
              (_node, x) => ({ x }),
              undefined,
              undefined,
              positionControlled,
            )}
            {number(
              "Y",
              (node) => node.y,
              (_node, y) => ({ y }),
              undefined,
              undefined,
              positionControlled,
            )}
            {number(
              "Rotation",
              (node) => designInspectorRotation(node.rotation ?? 0),
              (_node, rotation) => ({ rotation: -rotation }),
            )}
            <DesignRotationControls onRotate={onRotate} onFlip={onFlip} disabled={!canTransform} />
          </div>
          {positionControlled ? (
            <p className="text-2xs text-muted-foreground">Position controlled by auto layout.</p>
          ) : null}
        </>,
      )}
      {section(
        "Layout",
        <div className="flex items-end gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
            {number(
              "Width",
              (node) => node.width,
              (node, width) => ({
                width,
                layoutSizing: {
                  ...node.layoutSizing,
                  width: "fixed",
                  height: node.aspectRatioLocked ? "fixed" : (node.layoutSizing?.height ?? "fixed"),
                },
              }),
              0.000001,
            )}
            {number(
              "Height",
              (node) => node.height,
              (node, height) => ({
                height,
                layoutSizing: {
                  ...node.layoutSizing,
                  width: node.aspectRatioLocked ? "fixed" : (node.layoutSizing?.width ?? "fixed"),
                  height: "fixed",
                },
              }),
              0.000001,
            )}
          </div>
          <div className="flex h-7 shrink-0 items-center">
            <DesignAspectRatioControl
              nodes={nodes}
              allNodes={allNodes}
              onChange={(aspectRatioLocked) => {
                onChange(() => ({ aspectRatioLocked }));
              }}
            />
          </div>
        </div>,
      )}
      {section(
        "Appearance",
        <div className="grid grid-cols-2 gap-2">
          {number(
            "Opacity %",
            (node) => node.opacity * 100,
            (_node, value) => ({ opacity: value / 100 }),
            0,
            100,
          )}
          {nodes.every((node) => node.kind !== "text")
            ? number(
                "Radius",
                (node) => node.paint?.radius ?? 0,
                (node, radius) => ({ paint: { ...node.paint, radius } }),
                0,
              )
            : null}
        </div>,
      )}
      {allText ? (
        <DesignTypographyPanel
          nodes={nodes}
          allNodes={allNodes}
          propertyLabels={propertyLabels}
          onChange={onChange}
        />
      ) : null}
      {section(
        "Fill",
        hasFill ? (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <DesignInspectorColor
                label="Fill"
                mixed={fillValue.mixed}
                value={fillValue.value ?? "#000000"}
                onChange={(color) => {
                  onChange((node) => ({
                    fill: color,
                    ...(node.kind === "text"
                      ? { typography: { ...node.typography, color } }
                      : { paint: { ...node.paint, background: color } }),
                  }));
                }}
              />
            </div>
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label="Remove fill"
              onClick={() => {
                onChange((node) => ({
                  fill: null,
                  ...(node.kind === "text"
                    ? { typography: { ...node.typography, color: undefined } }
                    : { paint: { ...node.paint, background: undefined } }),
                }));
              }}
            >
              <MinusIcon />
            </Button>
          </div>
        ) : null,
        !hasFill ? (
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Add fill"
            onClick={() => {
              onChange((node) => ({
                fill: node.kind === "text" ? "#000000" : "#d9d9d9",
                ...(node.kind === "text"
                  ? { typography: { ...node.typography, color: "#000000" } }
                  : { paint: { ...node.paint, background: "#d9d9d9" } }),
              }));
            }}
          >
            <PlusIcon />
          </Button>
        ) : undefined,
      )}
      {section(
        "Stroke",
        hasStroke ? (
          <>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <DesignInspectorColor
                  label="Stroke"
                  mixed={strokeValue.mixed}
                  value={strokeValue.value ?? "#000000"}
                  onChange={(color) => {
                    onChange((node) => ({
                      border: color,
                      paint: { ...node.paint, borderColor: color, borderWidth: stroke(node) || 1 },
                    }));
                  }}
                />
              </div>
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label="Remove stroke"
                onClick={() => {
                  onChange((node) => ({
                    border: null,
                    paint: { ...node.paint, borderColor: undefined, borderWidth: 0 },
                  }));
                }}
              >
                <MinusIcon />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {number(
                "Stroke width",
                stroke,
                (node, borderWidth) => ({
                  border: node.paint?.borderColor ?? node.border ?? "#000000",
                  paint: {
                    ...node.paint,
                    borderWidth,
                    borderColor: node.paint?.borderColor ?? node.border ?? "#000000",
                  },
                }),
                0,
              )}
            </div>
          </>
        ) : null,
        !hasStroke ? (
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Add stroke"
            onClick={() => {
              onChange((node) => ({
                border: "#000000",
                paint: { ...node.paint, borderColor: "#000000", borderWidth: 1 },
              }));
            }}
          >
            <PlusIcon />
          </Button>
        ) : undefined,
      )}
      {!effectsMixed ? (
        <DesignEffectsPanel
          node={master}
          onChange={(effects) => {
            const indices = new Map(
              (master.effects ?? []).map((effect, index) => [effect.effectId, index]),
            );
            onChange((node) => ({
              effects: effects.map((effect) => ({
                ...effect,
                effectId:
                  node.effects?.[indices.get(effect.effectId) ?? -1]?.effectId ?? newEffectId(),
              })),
            }));
          }}
        />
      ) : (
        section(
          "Effects",
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            Mixed
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label="Remove effects"
              onClick={() => {
                onChange(() => ({ effects: [] }));
              }}
            >
              <MinusIcon />
            </Button>
          </div>,
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Add effect"
            disabled={nodes.some(
              (node) =>
                (node.effects ?? []).filter((effect) => effect.kind === "drop-shadow").length >= 8,
            )}
            onClick={() => {
              onChange((node) => ({
                effects: [
                  ...(node.effects ?? []),
                  {
                    effectId: newEffectId(),
                    kind: "drop-shadow",
                    visible: true,
                    x: 0,
                    y: 4,
                    blur: 4,
                    spread: 0,
                    color: "rgba(0,0,0,.25)",
                  },
                ],
              }));
            }}
          >
            <PlusIcon />
          </Button>,
        )
      )}
    </fieldset>
  );
}
