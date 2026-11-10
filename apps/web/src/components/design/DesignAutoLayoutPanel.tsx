import { useState } from "react";
import {
  Columns2Icon,
  Rows2Icon,
  ScanIcon,
  SlidersHorizontalIcon,
  WrapTextIcon,
} from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { DesignNumberField } from "./DesignNumberField";
import type { DesignLayoutModel } from "./designDocument";

export function DesignAutoLayoutPanel({
  model,
  onChange,
}: {
  model: DesignLayoutModel;
  onChange: (update: DesignLayoutModel) => void;
}) {
  const [individualPadding, setIndividualPadding] = useState(false);
  const patch = (update: Partial<DesignLayoutModel>) => onChange({ ...model, ...update });
  const row = model.direction === "row" || model.kind === "grid";
  const sides = {
    top: model.paddingTop ?? model.padding ?? 0,
    right: model.paddingRight ?? model.padding ?? 0,
    bottom: model.paddingBottom ?? model.padding ?? 0,
    left: model.paddingLeft ?? model.padding ?? 0,
  };
  const alignments = ["start", "center", "end"] as const;
  return (
    <div className="space-y-2" aria-label="Auto layout settings">
      <div className="flex items-start gap-2">
        <div
          role="group"
          aria-label="Auto layout alignment"
          className="grid size-16 shrink-0 grid-cols-3 grid-rows-3 rounded-md bg-input/25 p-1"
        >
          {alignments.flatMap((vertical) =>
            alignments.map((horizontal) => {
              const align = row ? vertical : horizontal;
              const justify = row ? horizontal : vertical;
              const selected =
                (model.align ?? "start") === align && (model.justify ?? "start") === justify;
              const name = `${{ start: "top", center: "center", end: "bottom" }[vertical]} ${{ start: "left", center: "center", end: "right" }[horizontal]}`;
              return (
                <button
                  key={`${vertical}-${horizontal}`}
                  type="button"
                  aria-label={`Align layout ${name}`}
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-0 items-center justify-center rounded-sm p-0 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                    selected
                      ? "bg-background text-primary shadow-xs"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                  onClick={() =>
                    patch({
                      align,
                      justify,
                      counterAxisAlign:
                        align === "start" ? "min" : align === "end" ? "max" : "center",
                    })
                  }
                >
                  <span
                    aria-hidden="true"
                    className={cn("rounded-xs", selected ? "h-2.5 w-1" : "size-0.5 bg-current")}
                    style={selected ? { background: "currentColor" } : undefined}
                  />
                </button>
              );
            }),
          )}
        </div>
        <div className="grid min-w-0 flex-1 gap-2">
          <DesignNumberField
            compact
            label="Gap"
            prefix={row ? <Columns2Icon className="size-3" /> : <Rows2Icon className="size-3" />}
            value={model.gap ?? 0}
            min={0}
            onChange={(gap) => patch({ gap })}
          />
          <div className="flex items-center justify-between">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label="Wrap auto layout"
                    aria-pressed={model.wrap === true}
                    onClick={() => patch({ wrap: !model.wrap })}
                  />
                }
              >
                <WrapTextIcon />
              </TooltipTrigger>
              <TooltipPopup>Wrap</TooltipPopup>
            </Tooltip>
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label="Auto layout advanced settings"
                  />
                }
              >
                <SlidersHorizontalIcon />
              </PopoverTrigger>
              <PopoverPopup side="left" align="start" width="sm" padding="compact">
                <div className="space-y-3">
                  <h4 className="text-xs font-medium">Auto layout</h4>
                  <label className="grid gap-1 text-2xs text-muted-foreground">
                    Spacing mode
                    <Select
                      value={model.justify === "space-between" ? "auto" : "packed"}
                      onValueChange={(value) => {
                        if (value !== null)
                          patch({ justify: value === "auto" ? "space-between" : "start" });
                      }}
                    >
                      <SelectTrigger size="xs" width="fluid" aria-label="Spacing mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectItem value="packed">Packed</SelectItem>
                        <SelectItem value="auto">Auto</SelectItem>
                      </SelectPopup>
                    </Select>
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <Checkbox
                      checked={model.align === "stretch"}
                      onCheckedChange={(stretch) =>
                        patch({
                          align: stretch ? "stretch" : "start",
                          counterAxisAlign: stretch ? "stretch" : "min",
                        })
                      }
                    />
                    Stretch children
                  </label>
                  <label className="grid gap-1 text-2xs text-muted-foreground">
                    Counter-axis alignment
                    <Select
                      value={model.counterAxisAlign ?? "min"}
                      onValueChange={(value) => {
                        if (value !== null) patch({ counterAxisAlign: value });
                      }}
                    >
                      <SelectTrigger size="xs" width="fluid" aria-label="Counter-axis alignment">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectPopup>
                        {(["min", "center", "max", "baseline", "stretch"] as const).map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </label>
                </div>
              </PopoverPopup>
            </Popover>
          </div>
        </div>
      </div>
      {model.wrap || model.kind === "grid" ? (
        <DesignNumberField
          compact
          label="Counter-axis spacing"
          prefix={<Rows2Icon className="size-3" />}
          value={model.counterAxisSpacing ?? model.gap ?? 0}
          min={0}
          onChange={(counterAxisSpacing) => patch({ counterAxisSpacing })}
        />
      ) : null}
      <div className="flex items-center gap-2">
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
          {individualPadding ? (
            (["top", "right", "bottom", "left"] as const).map((side) => (
              <DesignNumberField
                key={side}
                compact
                label={`Padding ${side}`}
                prefix={side[0]!.toUpperCase()}
                value={sides[side]}
                min={0}
                onChange={(value) =>
                  patch({ [`padding${side[0]!.toUpperCase()}${side.slice(1)}`]: value })
                }
              />
            ))
          ) : (
            <>
              <DesignNumberField
                compact
                label="Horizontal padding"
                prefix={<Columns2Icon className="size-3" />}
                value={sides.left}
                mixed={sides.left !== sides.right}
                min={0}
                onChange={(value) => patch({ paddingLeft: value, paddingRight: value })}
              />
              <DesignNumberField
                compact
                label="Vertical padding"
                prefix={<Rows2Icon className="size-3" />}
                value={sides.top}
                mixed={sides.top !== sides.bottom}
                min={0}
                onChange={(value) => patch({ paddingTop: value, paddingBottom: value })}
              />
            </>
          )}
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label="Individual padding"
                aria-pressed={individualPadding}
                onClick={() => setIndividualPadding(!individualPadding)}
              />
            }
          >
            <ScanIcon />
          </TooltipTrigger>
          <TooltipPopup>Individual padding</TooltipPopup>
        </Tooltip>
      </div>
    </div>
  );
}
