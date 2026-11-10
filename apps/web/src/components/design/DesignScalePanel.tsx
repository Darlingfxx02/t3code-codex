import { useState } from "react";
import { Input } from "../ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Button } from "../ui/button";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { selectionRoots, type DesignDocument } from "./designDocument";
import { designScalableRoots, designSelectionFrame, scaleDesignSelection } from "./designTransform";

function ScaleField({
  label,
  value,
  onApply,
}: {
  label: string;
  value: number;
  onApply: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = Number(draft ?? value);
        if (Number.isFinite(parsed) && parsed > 0) onApply(parsed);
        setDraft(null);
      }}
    >
      <label className="grid min-w-0 gap-1 text-2xs text-muted-foreground">
        {label}
        <Input
          size="sm"
          type="number"
          step="any"
          min={0.000001}
          value={draft ?? Number(value.toFixed(6))}
          onFocus={() => setDraft(String(Number(value.toFixed(6))))}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setDraft(null);
            event.currentTarget.blur();
          }}
        />
      </label>
    </form>
  );
}

export function DesignScalePanel({
  document,
  selected,
  onCommit,
}: {
  document: DesignDocument;
  selected: readonly string[];
  onCommit: (next: DesignDocument) => void;
}) {
  const [anchor, setAnchor] = useState({ x: 0, y: 0 });
  const roots = designScalableRoots(document, selected);
  const frame = designSelectionFrame(
    document,
    roots.map((node) => node.nodeId),
  );
  const apply = (factor: number) => {
    const next = scaleDesignSelection(document, selected, factor, anchor);
    if (next !== document) onCommit(next);
  };
  return (
    <aside
      aria-label="Inspector"
      className="flex min-h-0 w-60 min-w-60 flex-col overflow-y-auto border-l border-border/70 bg-sidebar"
    >
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3 text-xs font-medium">
        Scale
      </div>
      {frame ? (
        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-2">
            <ScaleField
              label="Scale width"
              value={frame.width}
              onApply={(value) => apply(value / frame.width)}
            />
            <ScaleField
              label="Scale height"
              value={frame.height}
              onApply={(value) => apply(value / frame.height)}
            />
          </div>
          <div className="flex items-end gap-1">
            <div className="min-w-0 flex-1">
              <ScaleField label="Multiplier" value={1} onApply={apply} />
            </div>
            <Menu>
              <MenuTrigger
                render={<Button size="icon-sm" variant="outline" aria-label="Scale presets" />}
              >
                <ChevronDownIcon />
              </MenuTrigger>
              <MenuPopup>
                {[0.25, 0.5, 1, 2, 4].map((factor) => (
                  <MenuItem key={factor} onClick={() => apply(factor)}>
                    {factor}×
                  </MenuItem>
                ))}
              </MenuPopup>
            </Menu>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-2xs text-muted-foreground">Anchor point</legend>
            <div className="grid w-fit grid-cols-3 gap-1" role="group" aria-label="Scale anchor">
              {[0, 0.5, 1].flatMap((y, row) =>
                [0, 0.5, 1].map((x, column) => (
                  <button
                    key={`${x}-${y}`}
                    type="button"
                    aria-label={`Anchor ${["top", "middle", "bottom"][row]} ${["left", "center", "right"][column]}`}
                    aria-pressed={anchor.x === x && anchor.y === y}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-md border border-border hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                      anchor.x === x &&
                        anchor.y === y &&
                        "border-primary bg-primary/10 text-primary",
                    )}
                    onClick={() => setAnchor({ x, y })}
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                  </button>
                )),
              )}
            </div>
          </fieldset>
          <p className="text-2xs leading-5 text-muted-foreground">
            Scales contents, text, strokes and spacing together. Press Enter to apply.
          </p>
          {roots.length < selectionRoots(document, selected).length ? (
            <p role="status" className="text-2xs leading-5 text-muted-foreground">
              Locked layers and layers inside instances are excluded.
            </p>
          ) : null}
        </div>
      ) : (
        <p role="status" className="p-4 text-xs leading-5 text-muted-foreground">
          {selected.length
            ? "Locked layers and layers inside instances cannot be scaled."
            : "Select a layer to scale."}
        </p>
      )}
    </aside>
  );
}
