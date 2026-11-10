/* oxlint-disable react/no-array-index-key -- Paint entries have positional identity; value-based keys remount focused inputs. */
import { ChevronDownIcon, MinusIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { formatHex, parse } from "culori";
import { designPaintGradientCss } from "./designPaint";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "../ui/menu";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { DesignInspectorColor } from "./DesignInspectorColor";
import { DesignNumberField } from "./DesignNumberField";
import type { DesignFill, DesignNode, DesignStroke } from "./designDocument";

const opaqueColor = (color: string) => {
  const parsed = parse(color);
  return parsed ? formatHex({ ...parsed, alpha: 1 }) : color;
};
const paintOpacity = (paint: Pick<DesignFill, "color" | "opacity">) =>
  (parse(paint.color)?.alpha ?? 1) * (paint.opacity ?? 1);

const fillKinds = {
  solid: "Solid",
  "linear-gradient": "Linear gradient",
  "radial-gradient": "Radial gradient",
  "angular-gradient": "Angular gradient",
  "diamond-gradient": "Diamond gradient",
} as const;

function PaintOpacity({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="w-16 shrink-0">
      <DesignNumberField
        compact
        label={label}
        prefix=""
        value={Math.round(value * 10000) / 100}
        min={0}
        max={100}
        onChange={(value) => onChange(value / 100)}
        trailing={
          <span aria-hidden="true" className="text-2xs text-muted-foreground">
            %
          </span>
        }
      />
    </div>
  );
}

function StrokeChoice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-2xs text-muted-foreground">
      <span>{label}</span>
      <Select
        value={value}
        onValueChange={(value) => {
          if (value !== null) onChange(value);
        }}
      >
        <SelectTrigger size="xs" width="fluid" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectPopup>
          {options.map((value) => (
            <SelectItem key={value} value={value}>
              {value}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </label>
  );
}

export function DesignPaintPanel({
  node,
  onChange,
}: {
  node: DesignNode;
  onChange: (patch: Partial<DesignNode>) => void;
}) {
  const text = node.kind === "text";
  const color = text
    ? (node.typography?.color ?? node.fill)
    : (node.paint?.background ?? node.fill);
  const fills = node.paint?.fills ?? (color && !text ? [{ color }] : []);
  const strokeWidth = node.paint?.borderWidth ?? (node.border ? 1 : 0);
  const strokes =
    node.paint?.strokes ??
    (strokeWidth > 0
      ? [{ color: node.paint?.borderColor ?? node.border ?? "#000000", width: strokeWidth }]
      : []);
  const saveFills = (next: readonly DesignFill[]) =>
    onChange({
      fill: next[0]?.color ?? null,
      paint: { ...node.paint, background: next[0]?.color, fills: next },
    });
  const saveStrokes = (next: readonly DesignStroke[]) =>
    onChange({
      border: next[0]?.color ?? null,
      paint: {
        ...node.paint,
        borderColor: next[0]?.color,
        borderWidth: next[0]?.width ?? 0,
        strokes: next,
      },
    });
  const updateFill = (index: number, patch: Partial<DesignFill>) =>
    saveFills(fills.map((fill, i) => (i === index ? { ...fill, ...patch } : fill)));
  const updateStroke = (index: number, patch: Partial<DesignStroke>) =>
    saveStrokes(strokes.map((stroke, i) => (i === index ? { ...stroke, ...patch } : stroke)));
  const move = <T,>(items: readonly T[], index: number, delta: number) => {
    const next = [...items];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item!);
    return next;
  };
  return (
    <>
      <section aria-label="Fill" className="space-y-2 border-b border-border/60 px-3 py-2.5">
        <div className="flex h-6 items-center justify-between">
          <h3 className="text-xs font-medium">Fill</h3>
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Add fill"
            disabled={text && !!color}
            onClick={() =>
              text
                ? onChange({
                    fill: "#000000",
                    typography: { ...node.typography, color: "#000000" },
                  })
                : saveFills([...fills, { color: "#d9d9d9" }])
            }
          >
            <PlusIcon />
          </Button>
        </div>
        {text ? (
          color ? (
            <div className="flex min-w-0 items-center gap-1">
              <div className="min-w-0 flex-1">
                <DesignInspectorColor
                  label="Text color"
                  value={color}
                  onChange={(color) =>
                    onChange({ fill: color, typography: { ...node.typography, color } })
                  }
                />
              </div>
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label="Remove fill"
                onClick={() =>
                  onChange({ fill: null, typography: { ...node.typography, color: undefined } })
                }
              >
                <MinusIcon />
              </Button>
            </div>
          ) : null
        ) : (
          fills.map((fill, index) => (
            <div key={index} className="flex min-w-0 items-center gap-1">
              <div className="min-w-0 flex-1">
                {fill.kind && fill.kind !== "solid" ? (
                  <div className="flex h-6 min-w-0 items-center gap-1.5 rounded-md bg-input/25 px-2 text-xs">
                    <span
                      className="size-4 shrink-0 rounded-xs"
                      style={{ background: designPaintGradientCss(fill) }}
                    />
                    <span className="truncate">{fillKinds[fill.kind]}</span>
                  </div>
                ) : (
                  <DesignInspectorColor
                    label={`Fill ${index + 1}`}
                    value={opaqueColor(fill.color)}
                    onChange={(color) => updateFill(index, { color, opacity: paintOpacity(fill) })}
                  />
                )}
              </div>
              <PaintOpacity
                label={`Fill ${index + 1} opacity %`}
                value={
                  fill.kind && fill.kind !== "solid" ? (fill.opacity ?? 1) : paintOpacity(fill)
                }
                onChange={(opacity) =>
                  updateFill(index, {
                    opacity,
                    ...(fill.kind && fill.kind !== "solid"
                      ? {}
                      : { color: opaqueColor(fill.color) }),
                  })
                }
              />
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost-muted"
                      aria-label={`Fill ${index + 1} settings`}
                    />
                  }
                >
                  <MoreHorizontalIcon />
                </PopoverTrigger>
                <PopoverPopup side="left" align="start" width="sm" padding="compact">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-medium">Fill {index + 1}</h4>
                      <Menu>
                        <MenuTrigger
                          render={
                            <Button
                              size="xs"
                              variant="ghost-muted"
                              aria-label={`Fill ${index + 1} type`}
                            />
                          }
                        >
                          {fillKinds[fill.kind ?? "solid"]}
                          <ChevronDownIcon />
                        </MenuTrigger>
                        <MenuPopup>
                          {Object.entries(fillKinds).map(([kind, label]) => (
                            <MenuItem
                              key={kind}
                              onClick={() =>
                                updateFill(index, {
                                  kind: kind as DesignFill["kind"],
                                  ...(kind === "solid"
                                    ? {}
                                    : {
                                        angle: fill.angle ?? 0,
                                        stops: fill.stops ?? [
                                          { color: fill.color, position: 0 },
                                          { color: "#ffffff", position: 1 },
                                        ],
                                      }),
                                })
                              }
                            >
                              {label}
                            </MenuItem>
                          ))}
                        </MenuPopup>
                      </Menu>
                    </div>
                    {fill.kind && fill.kind !== "solid" ? (
                      <>
                        {(fill.stops ?? []).map((stop, stopIndex) => (
                          <div
                            key={stopIndex}
                            className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2"
                          >
                            <DesignInspectorColor
                              label={`Fill ${index + 1} stop ${stopIndex + 1}`}
                              value={stop.color}
                              onChange={(color) =>
                                updateFill(index, {
                                  stops: fill.stops!.map((item, i) =>
                                    i === stopIndex ? { ...item, color } : item,
                                  ),
                                })
                              }
                            />
                            <DesignNumberField
                              compact
                              label={`Fill ${index + 1} stop ${stopIndex + 1} position %`}
                              prefix="%"
                              min={0}
                              max={100}
                              value={stop.position * 100}
                              onChange={(value) =>
                                updateFill(index, {
                                  stops: fill.stops!.map((item, i) =>
                                    i === stopIndex ? { ...item, position: value / 100 } : item,
                                  ),
                                })
                              }
                            />
                          </div>
                        ))}
                        <DesignNumberField
                          compact
                          label={`Fill ${index + 1} angle`}
                          prefix="∠"
                          value={fill.angle ?? 0}
                          onChange={(angle) => updateFill(index, { angle })}
                        />
                      </>
                    ) : null}
                    <Menu>
                      <MenuTrigger
                        render={
                          <Button
                            size="xs"
                            variant="ghost-muted"
                            aria-label={`Reorder fill ${index + 1}`}
                          />
                        }
                      >
                        Layer order
                        <ChevronDownIcon />
                      </MenuTrigger>
                      <MenuPopup>
                        <MenuItem
                          disabled={index === 0}
                          onClick={() => saveFills(move(fills, index, -1))}
                        >
                          Move up
                        </MenuItem>
                        <MenuItem
                          disabled={index === fills.length - 1}
                          onClick={() => saveFills(move(fills, index, 1))}
                        >
                          Move down
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem onClick={() => saveFills(fills.filter((_, i) => i !== index))}>
                          Remove fill
                        </MenuItem>
                      </MenuPopup>
                    </Menu>
                  </div>
                </PopoverPopup>
              </Popover>
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label={`Remove fill ${index + 1}`}
                onClick={() => saveFills(fills.filter((_, i) => i !== index))}
              >
                <MinusIcon />
              </Button>
            </div>
          ))
        )}
      </section>
      <section aria-label="Stroke" className="space-y-2 border-b border-border/60 px-3 py-2.5">
        <div className="flex h-6 items-center justify-between">
          <h3 className="text-xs font-medium">Stroke</h3>
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label="Add stroke"
            onClick={() => saveStrokes([...strokes, { color: "#000000", width: 1 }])}
          >
            <PlusIcon />
          </Button>
        </div>
        {strokes.map((stroke, index) => (
          <div key={index} className="space-y-2">
            <div className="flex min-w-0 items-center gap-1">
              <div className="min-w-0 flex-1">
                <DesignInspectorColor
                  label={`Stroke ${index + 1}`}
                  value={opaqueColor(stroke.color)}
                  onChange={(color) =>
                    updateStroke(index, { color, opacity: paintOpacity(stroke) })
                  }
                />
              </div>
              <PaintOpacity
                label={`Stroke ${index + 1} opacity %`}
                value={paintOpacity(stroke)}
                onChange={(opacity) =>
                  updateStroke(index, { opacity, color: opaqueColor(stroke.color) })
                }
              />
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      size="icon-xs"
                      variant="ghost-muted"
                      aria-label={`Stroke ${index + 1} settings`}
                    />
                  }
                >
                  <MoreHorizontalIcon />
                </PopoverTrigger>
                <PopoverPopup side="left" align="start" width="sm" padding="compact">
                  <div className="grid grid-cols-2 gap-2">
                    <StrokeChoice
                      label={`Stroke ${index + 1} cap`}
                      value={stroke.cap ?? "butt"}
                      options={["butt", "round", "square"]}
                      onChange={(cap) => updateStroke(index, { cap: cap as DesignStroke["cap"] })}
                    />
                    <StrokeChoice
                      label={`Stroke ${index + 1} join`}
                      value={stroke.join ?? "miter"}
                      options={["miter", "round", "bevel"]}
                      onChange={(join) =>
                        updateStroke(index, { join: join as DesignStroke["join"] })
                      }
                    />
                    <Button
                      size="xs"
                      variant="ghost-muted"
                      disabled={index === 0}
                      onClick={() => saveStrokes(move(strokes, index, -1))}
                    >
                      Move up
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost-muted"
                      disabled={index === strokes.length - 1}
                      onClick={() => saveStrokes(move(strokes, index, 1))}
                    >
                      Move down
                    </Button>
                  </div>
                </PopoverPopup>
              </Popover>
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label={`Remove stroke ${index + 1}`}
                onClick={() => saveStrokes(strokes.filter((_, i) => i !== index))}
              >
                <MinusIcon />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select
                value={stroke.align ?? "center"}
                onValueChange={(align) => {
                  if (align !== null) updateStroke(index, { align });
                }}
              >
                <SelectTrigger
                  size="xs"
                  variant="ghost"
                  width="fluid"
                  aria-label={`Stroke ${index + 1} alignment`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {(["inside", "center", "outside"] as const).map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <DesignNumberField
                compact
                label={`Stroke ${index + 1} width`}
                prefix="☰"
                value={stroke.width}
                min={0}
                onChange={(width) => updateStroke(index, { width })}
              />
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
