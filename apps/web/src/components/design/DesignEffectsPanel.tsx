import { useState } from "react";
import { EyeIcon, EyeOffIcon, MinusIcon, PlusIcon, SquareStackIcon, XIcon } from "lucide-react";
import { formatRgb, parse } from "culori";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverTrigger, PopoverPopup, PopoverClose } from "../ui/popover";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { DesignInspectorColor } from "./DesignInspectorColor";
import { DesignNumberField } from "./DesignNumberField";
import type { DesignEffect, DesignNode } from "./designDocument";

const names = {
  "drop-shadow": "Drop shadow",
  "inner-shadow": "Inner shadow",
  "layer-blur": "Layer blur",
  "background-blur": "Background blur",
} as const;
const kinds = Object.keys(names) as (keyof typeof names)[];
const limit = (kind: DesignEffect["kind"]) => (kind.endsWith("shadow") ? 8 : 1);

export function DesignEffectsPanel({
  node,
  onChange,
}: {
  node: DesignNode;
  onChange: (effects: readonly DesignEffect[]) => void;
}) {
  const effects = node.effects ?? [];
  const supportsSpread =
    (node.kind === "vector" && !node.vector) ||
    (["frame", "component", "instance"].includes(node.kind) &&
      node.clipContent === true &&
      (parse(node.paint?.background ?? node.fill ?? "transparent")?.alpha ?? 1) >= 0.01);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const update = (id: string, patch: Partial<DesignEffect>) =>
    onChange(effects.map((effect) => (effect.effectId === id ? { ...effect, ...patch } : effect)));
  const canAdd = (kind: DesignEffect["kind"], except?: string) =>
    effects.filter((effect) => effect.kind === kind && effect.effectId !== except).length <
    limit(kind);
  const addKind = kinds.find((kind) => canAdd(kind));
  const reorder = (from: string, target: string) => {
    const source = effects.findIndex((effect) => effect.effectId === from),
      destination = effects.findIndex((effect) => effect.effectId === target);
    if (source < 0 || destination < 0 || source === destination) return;
    const next = [...effects];
    const [effect] = next.splice(source, 1);
    next.splice(destination, 0, effect!);
    onChange(next);
  };
  return (
    <section className="space-y-2 border-b border-border/60 px-3 py-2.5" aria-label="Effects">
      <div className="flex h-6 items-center justify-between">
        <h3 className="text-xs font-medium">Effects</h3>
        <Button
          size="icon-xs"
          variant="ghost-muted"
          aria-label="Add effect"
          disabled={!addKind}
          onClick={() => {
            if (!addKind) return;
            const effectId = `effect-${crypto.getRandomValues(new Uint32Array(2)).join("-")}`;
            onChange([
              ...effects,
              {
                effectId,
                kind: addKind,
                visible: true,
                x: 0,
                y: 4,
                blur: 4,
                spread: 0,
                color: "rgba(0, 0, 0, 0.25)",
              },
            ]);
          }}
        >
          <PlusIcon />
        </Button>
      </div>
      {effects.map((effect, index) => (
        <div
          key={effect.effectId}
          className="flex min-w-0 items-center gap-1"
          role="group"
          draggable
          tabIndex={0}
          aria-label={`${names[effect.kind]} effect ${index + 1}`}
          onDragStart={(event) => {
            event.dataTransfer.setData("application/x-t3-design-effect", effect.effectId);
            setDraggedId(effect.effectId);
          }}
          onDragOver={(event) => {
            if (draggedId) event.preventDefault();
          }}
          onDragEnd={() => setDraggedId(null)}
          onDrop={(event) => {
            event.preventDefault();
            reorder(event.dataTransfer.getData("application/x-t3-design-effect"), effect.effectId);
            setDraggedId(null);
          }}
          onKeyDown={(event) => {
            if (
              !event.altKey ||
              (event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
              event.target !== event.currentTarget
            )
              return;
            const target = effects[index + (event.key === "ArrowUp" ? -1 : 1)];
            if (target) {
              event.preventDefault();
              reorder(effect.effectId, target.effectId);
            }
          }}
        >
          <Popover>
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <Button
                        size="icon-xs"
                        variant="ghost-muted"
                        aria-label={`Effect settings ${index + 1}`}
                      />
                    }
                  />
                }
              >
                <SquareStackIcon />
              </TooltipTrigger>
              <TooltipPopup>Effect settings</TooltipPopup>
            </Tooltip>
            <PopoverPopup side="left" align="start" width="sm" padding="compact">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium">{names[effect.kind]}</h4>
                  <PopoverClose
                    render={
                      <Button
                        size="icon-xs"
                        variant="ghost-muted"
                        aria-label="Close effect settings"
                      />
                    }
                  >
                    <XIcon />
                  </PopoverClose>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {effect.kind.endsWith("shadow") ? (
                    <>
                      <DesignNumberField
                        compact
                        label="Shadow X"
                        displayLabel="X"
                        prefix="X"
                        value={effect.x}
                        onChange={(x) => update(effect.effectId, { x })}
                      />
                      <DesignNumberField
                        compact
                        label="Shadow Y"
                        displayLabel="Y"
                        prefix="Y"
                        value={effect.y}
                        onChange={(y) => update(effect.effectId, { y })}
                      />
                    </>
                  ) : null}
                  <DesignNumberField
                    compact
                    label="Effect blur"
                    displayLabel="Blur"
                    prefix="Blur"
                    min={0}
                    value={effect.blur}
                    onChange={(blur) => update(effect.effectId, { blur })}
                  />
                  {effect.kind.endsWith("shadow") && supportsSpread ? (
                    <DesignNumberField
                      compact
                      label="Shadow spread"
                      displayLabel="Spread"
                      prefix="Spread"
                      value={effect.spread}
                      onChange={(spread) => update(effect.effectId, { spread })}
                    />
                  ) : null}
                </div>
                {effect.kind.endsWith("shadow") ? (
                  <>
                    <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-end gap-2">
                      <div className="min-w-0 space-y-1">
                        <p className="text-2xs text-muted-foreground">Color</p>
                        <DesignInspectorColor
                          label="Effect color"
                          value={effect.color}
                          onChange={(color) => update(effect.effectId, { color })}
                        />
                      </div>
                      <DesignNumberField
                        compact
                        propertyLabels
                        label="Effect opacity"
                        displayLabel="Opacity"
                        prefix="%"
                        min={0}
                        max={100}
                        value={Math.round((parse(effect.color)?.alpha ?? 1) * 10000) / 100}
                        onChange={(value) => {
                          const color = parse(effect.color);
                          if (color)
                            update(effect.effectId, {
                              color: formatRgb({ ...color, alpha: value / 100 }),
                            });
                        }}
                      />
                    </div>
                    {effect.kind === "drop-shadow" ? (
                      <label className="flex items-center gap-2 text-2xs">
                        <Checkbox
                          checked={effect.showBehindTransparentAreas === true}
                          onCheckedChange={(showBehindTransparentAreas) =>
                            update(effect.effectId, { showBehindTransparentAreas })
                          }
                        />
                        Show behind transparent areas
                      </label>
                    ) : null}
                  </>
                ) : null}
              </div>
            </PopoverPopup>
          </Popover>
          <div className={effect.visible ? "min-w-0 flex-1" : "min-w-0 flex-1 opacity-50"}>
            <Select
              value={effect.kind}
              onValueChange={(kind) => {
                if (kind !== null && canAdd(kind, effect.effectId))
                  update(effect.effectId, { kind });
              }}
            >
              <SelectTrigger size="sm" width="fluid" aria-label={`Effect type ${index + 1}`}>
                <SelectValue>{names[effect.kind]}</SelectValue>
              </SelectTrigger>
              <SelectPopup>
                {kinds.map((kind) => (
                  <SelectItem key={kind} value={kind} disabled={!canAdd(kind, effect.effectId)}>
                    {names[kind]}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          </div>
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label={`${effect.visible ? "Hide" : "Show"} effect ${index + 1}`}
            onClick={() => update(effect.effectId, { visible: !effect.visible })}
          >
            {effect.visible ? <EyeIcon /> : <EyeOffIcon />}
          </Button>
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label={`Remove effect ${index + 1}`}
            onClick={() =>
              onChange(effects.filter((candidate) => candidate.effectId !== effect.effectId))
            }
          >
            <MinusIcon />
          </Button>
        </div>
      ))}
    </section>
  );
}
