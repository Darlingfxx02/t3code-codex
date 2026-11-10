import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuCheckboxItem,
  MenuSeparator,
  MenuShortcut,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
} from "../ui/menu";
import { isMacPlatform } from "../../lib/utils";

export function DesignCanvasViewMenu({
  zoom,
  onZoom,
  onFit,
  rulers,
  onRulers,
  pixelGrid,
  onPixelGrid,
  pixelPreview,
  onPixelPreview,
  snap,
  onSnap,
  guides,
  onGuides,
  outlines,
  onOutlines,
  propertyLabels,
  onPropertyLabels,
}: {
  zoom: number;
  onZoom: (zoom: number) => void;
  onFit: (selection: boolean) => void;
  rulers: boolean;
  onRulers: (value: boolean) => void;
  pixelGrid: boolean;
  onPixelGrid: (value: boolean) => void;
  pixelPreview: 0 | 1 | 2;
  onPixelPreview: (value: 0 | 1 | 2) => void;
  snap: boolean;
  onSnap: (value: boolean) => void;
  guides: boolean;
  onGuides: (value: boolean) => void;
  outlines: boolean;
  onOutlines: (value: boolean) => void;
  propertyLabels: boolean;
  onPropertyLabels: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState("");
  const percent = Math.round(zoom * 10000) / 100;
  return (
    <Menu
      onOpenChange={(open) => {
        if (open) setDraft(`${percent}%`);
      }}
    >
      <MenuTrigger render={<Button size="xs" variant="ghost" aria-label="Zoom and view options" />}>
        <span className="tabular-nums">{Math.round(percent)}%</span>
        <ChevronDownIcon />
      </MenuTrigger>
      <MenuPopup align="end">
        <div className="p-2">
          <Input
            size="sm"
            aria-label="Canvas zoom"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const next = Number(draft.replace(/%$/u, "").trim());
              if (Number.isFinite(next) && next > 0) onZoom(next / 100);
            }}
          />
        </div>
        <MenuSeparator />
        <MenuItem onClick={() => onZoom(zoom * 1.2)}>
          Zoom in<MenuShortcut>⇧ +</MenuShortcut>
        </MenuItem>
        <MenuItem onClick={() => onZoom(zoom / 1.2)}>
          Zoom out<MenuShortcut>⇧ −</MenuShortcut>
        </MenuItem>
        <MenuItem onClick={() => onFit(false)}>
          Zoom to fit<MenuShortcut>⇧ 1</MenuShortcut>
        </MenuItem>
        <MenuItem onClick={() => onFit(true)}>
          Zoom to selection<MenuShortcut>⇧ 2</MenuShortcut>
        </MenuItem>
        {[50, 100, 200].map((value) => (
          <MenuItem key={value} onClick={() => onZoom(value / 100)}>
            Zoom to {value}%
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuSub>
          <MenuSubTrigger>
            Pixel preview
            <MenuShortcut>{isMacPlatform(navigator.platform) ? "⌃ P" : "Ctrl Alt P"}</MenuShortcut>
          </MenuSubTrigger>
          <MenuSubPopup>
            <MenuRadioGroup
              value={pixelPreview}
              onValueChange={(value) => onPixelPreview(value as 0 | 1 | 2)}
            >
              {([0, 1, 2] as const).map((value) => (
                <MenuRadioItem key={value} value={value} closeOnClick>
                  <span className="flex items-center justify-between gap-8">
                    {value === 0 ? "Disabled" : `${value}x`}
                    <MenuRadioItemIndicator />
                  </span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuSubPopup>
        </MenuSub>
        <MenuCheckboxItem checked={pixelGrid} onCheckedChange={onPixelGrid}>
          <span className="flex w-full items-center justify-between gap-6">
            <span>Pixel grid</span>
            <MenuShortcut>⇧ '</MenuShortcut>
          </span>
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={snap} onCheckedChange={onSnap}>
          <span className="flex w-full items-center justify-between gap-6">
            <span>Snap to pixel grid</span>
            <MenuShortcut>⇧ ⌘ '</MenuShortcut>
          </span>
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={guides} onCheckedChange={onGuides}>
          Guides
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={rulers} onCheckedChange={onRulers}>
          <span className="flex w-full items-center justify-between gap-6">
            <span>Rulers</span>
            <MenuShortcut>⇧ R</MenuShortcut>
          </span>
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={outlines} onCheckedChange={onOutlines}>
          <span className="flex w-full items-center justify-between gap-6">
            <span>Outlines</span>
            <MenuShortcut>⌘ Y</MenuShortcut>
          </span>
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={propertyLabels} onCheckedChange={onPropertyLabels}>
          Property labels
        </MenuCheckboxItem>
      </MenuPopup>
    </Menu>
  );
}
