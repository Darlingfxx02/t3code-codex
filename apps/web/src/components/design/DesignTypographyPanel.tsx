import { useState, type ReactNode } from "react";
import {
  ChevronDownIcon,
  AlignLeftIcon,
  AlignCenterIcon,
  AlignRightIcon,
  AlignJustifyIcon,
  ArrowUpToLineIcon,
  ArrowDownToLineIcon,
  FoldVerticalIcon,
  SlidersHorizontalIcon,
  UnderlineIcon,
  StrikethroughIcon,
  TextCursorInputIcon,
} from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { Popover, PopoverTrigger, PopoverPopup } from "../ui/popover";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { DesignNumberField } from "./DesignNumberField";
import type { DesignNode, DesignTypography } from "./designDocument";
import { evaluateDesignExpression } from "./designExpression";
import {
  designTypeMetricUpdate,
  convertDesignTypeMetric,
  measureDesignNormalLineHeight,
  type DesignTypeMetric,
} from "./designTypography";

const weights = [
  [100, "Thin"],
  [200, "Extra Light"],
  [300, "Light"],
  [400, "Regular"],
  [500, "Medium"],
  [600, "Semi Bold"],
  [700, "Bold"],
  [800, "Extra Bold"],
  [900, "Black"],
] as const;
const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 32, 36, 40, 48, 64, 96, 128];
const common = <T,>(nodes: readonly DesignNode[], read: (node: DesignNode) => T) => {
  const value = read(nodes[0]!);
  return { value, mixed: nodes.some((node) => !Object.is(value, read(node))) };
};

function FontFamily({
  nodes,
  allNodes,
  onChange,
}: {
  nodes: readonly DesignNode[];
  allNodes: readonly DesignNode[];
  onChange: (update: (node: DesignNode) => Partial<DesignNode> | null) => boolean;
}) {
  const family = common(nodes, (node) => node.typography?.family ?? "system-ui");
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [fonts, setFonts] = useState<readonly string[]>([]);
  const apply = (value: string) => {
    if (!value.trim()) return;
    onChange((node) => ({ typography: { ...node.typography, family: value.trim() } }));
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) {
          setDraft("");
          const available = new Set<string>();
          document.fonts.forEach((face) => available.add(face.family.replace(/^["']|["']$/gu, "")));
          setFonts([
            ...new Set([
              "system-ui",
              "sans-serif",
              "serif",
              "monospace",
              ...available,
              ...allNodes.flatMap((node) =>
                node.typography?.family ? [node.typography.family] : [],
              ),
            ]),
          ]);
        }
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="Font family"
            className="flex h-6 w-full min-w-0 items-center justify-between rounded-md border border-input px-2 text-left text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          />
        }
      >
        <span className="truncate">{family.mixed ? "Mixed" : family.value}</span>
        <ChevronDownIcon className="size-3 shrink-0" />
      </PopoverTrigger>
      <PopoverPopup width="sm" align="end" padding="none">
        <div className="p-2">
          <Input
            size="sm"
            autoFocus
            aria-label="Find font"
            value={draft}
            placeholder="Search or enter a font family"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply(draft);
              }
            }}
          />
        </div>
        <div className="max-h-64 overflow-y-auto px-1 pb-1" role="group" aria-label="Font families">
          {fonts
            .filter((font) => font.toLowerCase().includes(draft.trim().toLowerCase()))
            .map((font) => (
              <button
                key={font}
                type="button"
                className="flex w-full rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                style={{ fontFamily: font }}
                onClick={() => apply(font)}
              >
                {font}
              </button>
            ))}
          {draft.trim() &&
          !fonts.some((font) => font.toLowerCase() === draft.trim().toLowerCase()) ? (
            <Button size="xs" variant="ghost" onClick={() => apply(draft)}>
              Use “{draft.trim()}”
            </Button>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

export function DesignTextSizingControl({
  nodes,
  allNodes,
  onChange,
  compact = false,
}: {
  nodes: readonly DesignNode[];
  allNodes: readonly DesignNode[];
  onChange: (update: (node: DesignNode) => Partial<DesignNode> | null) => boolean;
  compact?: boolean;
}) {
  const sizing = common(nodes, (node) => {
    const width = node.layoutSizing?.width ?? "fixed";
    const height = node.layoutSizing?.height ?? "fixed";
    if (width === "fill") return "fill-width";
    if (width === "hug" && height === "hug") return "auto-width";
    if (width === "fixed" && height === "hug") return "auto-height";
    return "fixed";
  });
  const canFill = nodes.every((node) => {
    const parent = node.parentId
      ? allNodes.find((candidate) => candidate.nodeId === node.parentId)
      : null;
    return (
      parent?.layoutModel !== undefined &&
      parent.layoutModel.kind !== "absolute" &&
      node.layoutSizing?.position !== "absolute"
    );
  });
  const sizingOptions = [
    ["auto-width", "Auto width"],
    ["auto-height", "Auto height"],
    ["fixed", "Fixed size"],
    ...(canFill ? [["fill-width", "Fill container"]] : []),
  ] as const;
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            size={compact ? "icon-xs" : "sm"}
            variant={compact ? "ghost-muted" : "secondary"}
            aria-label="Text sizing"
          />
        }
      >
        {compact ? (
          <TextCursorInputIcon />
        ) : (
          <>
            {sizing.mixed
              ? "Mixed"
              : (sizingOptions.find(([value]) => value === sizing.value)?.[1] ?? "Fixed size")}
            <ChevronDownIcon />
          </>
        )}
      </MenuTrigger>
      <MenuPopup align="start">
        {sizingOptions.map(([value, label]) => (
          <MenuItem
            key={value}
            onClick={() =>
              onChange((node) => {
                const current = node.layoutSizing ?? {
                  width: "fixed" as const,
                  height: "fixed" as const,
                };
                const next =
                  value === "auto-width"
                    ? { width: "hug" as const, height: "hug" as const }
                    : value === "auto-height"
                      ? { width: "fixed" as const, height: "hug" as const }
                      : value === "fill-width"
                        ? {
                            width: "fill" as const,
                            height:
                              current.height === "fill" ? ("fill" as const) : ("hug" as const),
                          }
                        : { width: "fixed" as const, height: "fixed" as const };
                return { layoutSizing: { ...current, ...next } };
              })
            }
          >
            {label}
            {!sizing.mixed && sizing.value === value ? " ✓" : ""}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

export function DesignTypographyPanel({
  nodes,
  allNodes,
  propertyLabels,
  onChange,
  showSizing = true,
}: {
  nodes: readonly DesignNode[];
  allNodes: readonly DesignNode[];
  propertyLabels: boolean;
  showSizing?: boolean;
  onChange: (update: (node: DesignNode) => Partial<DesignNode> | null) => boolean;
}) {
  const type = <K extends keyof DesignTypography>(key: K, value: DesignTypography[K]) =>
    onChange((node) => ({ typography: { ...node.typography, [key]: value } }));
  const weight = common(
    nodes,
    (node) =>
      `${node.typography?.weight ?? node.fontWeight ?? 400}:${node.typography?.fontStyle ?? "normal"}`,
  );
  const master = nodes[0]!;
  const size = common(nodes, (node) => node.typography?.size ?? node.fontSize ?? 16);
  const weightName =
    weights.find(
      ([value]) => value === (master.typography?.weight ?? master.fontWeight ?? 400),
    )?.[1] ?? String(master.typography?.weight ?? master.fontWeight ?? 400);
  const styleName =
    master.typography?.fontStyle === "italic"
      ? `${weightName === "Regular" ? "" : `${weightName} `}Italic`
      : master.typography?.fontStyle === "oblique"
        ? `${weightName} Oblique`
        : weightName;
  const metric = (name: string, key: DesignTypeMetric, prefix: string) => {
    const unitKey = key === "lineHeight" ? "lineHeightUnit" : "letterSpacingUnit";
    const value = common(
      nodes,
      (node) => node.typography?.[key] ?? (key === "letterSpacing" ? 0 : undefined),
    );
    const unit = common(nodes, (node) => node.typography?.[unitKey] ?? "px");
    return (
      <DesignNumberField
        label={name}
        prefix={prefix}
        value={value.value}
        mixed={value.mixed || unit.mixed}
        compact
        propertyLabels
        placeholder={key === "lineHeight" ? "Auto" : undefined}
        suffix={!unit.mixed && unit.value === "percent" ? "%" : ""}
        min={key === "lineHeight" ? 0 : undefined}
        onChange={() => undefined}
        onExpression={(expression) =>
          onChange((node) => designTypeMetricUpdate(node, key, expression))
        }
        trailing={
          <Menu>
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`${name} units`}
                  className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
                />
              }
            >
              <ChevronDownIcon className="size-3" />
            </MenuTrigger>
            <MenuPopup align="end">
              {key === "lineHeight" ? (
                <MenuItem
                  onClick={() => onChange((node) => designTypeMetricUpdate(node, key, "Auto"))}
                >
                  Auto
                </MenuItem>
              ) : null}
              {(["px", "percent"] as const).map((next) => (
                <MenuItem
                  key={next}
                  onClick={() =>
                    onChange((node) =>
                      convertDesignTypeMetric(
                        key === "lineHeight" && node.typography?.lineHeight === undefined
                          ? {
                              ...node,
                              typography: {
                                ...node.typography,
                                lineHeight: measureDesignNormalLineHeight(node),
                                lineHeightUnit: "px",
                              },
                            }
                          : node,
                        key,
                        next,
                      ),
                    )
                  }
                >
                  {next === "px" ? "Pixels" : "Percent"}
                </MenuItem>
              ))}
            </MenuPopup>
          </Menu>
        }
      />
    );
  };
  const alignment = (vertical: boolean, expanded = false) => {
    const key = vertical ? "verticalAlign" : "align";
    const state = common(nodes, (node) => node.typography?.[key] ?? (vertical ? "top" : "left"));
    const options = vertical
      ? ([
          ["top", ArrowUpToLineIcon],
          ["middle", FoldVerticalIcon],
          ["bottom", ArrowDownToLineIcon],
        ] as const)
      : expanded
        ? ([
            ["left", AlignLeftIcon],
            ["center", AlignCenterIcon],
            ["right", AlignRightIcon],
            ["justify", AlignJustifyIcon],
          ] as const)
        : ([
            ["left", AlignLeftIcon],
            ["center", AlignCenterIcon],
            ["right", AlignRightIcon],
            ["justify", AlignJustifyIcon],
          ] as const);
    return (
      <div
        className="flex min-w-0 rounded-md bg-input/25 p-0.5"
        role="group"
        aria-label={`Text ${vertical ? "vertical" : "horizontal"} alignment${expanded ? " settings" : ""}`}
      >
        {options.map(([value, Icon]) => (
          <Tooltip key={value}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`Text align ${value}`}
                  aria-pressed={!state.mixed && state.value === value}
                  className={cn(
                    "flex h-6 min-w-0 flex-1 items-center justify-center rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
                    !state.mixed && state.value === value && "bg-background shadow-xs",
                  )}
                  onClick={() => type(key, value)}
                >
                  <Icon className="size-3.5" />
                </button>
              }
            />
            <TooltipPopup>Align {value}</TooltipPopup>
          </Tooltip>
        ))}
      </div>
    );
  };
  const settingsRow = (label: string, children: ReactNode) => (
    <div className="grid gap-2">
      <span className="text-2xs text-muted-foreground">{label}</span>
      {children}
    </div>
  );
  const decoration = common(nodes, (node) => node.typography?.decoration ?? "none");
  const letterCase = common(nodes, (node) => node.typography?.letterCase ?? "none");
  const wrap = common(nodes, (node) => node.typography?.wrap ?? "auto");
  const indent = common(nodes, (node) => node.typography?.indent ?? 0);
  const paragraphSpacing = common(nodes, (node) => node.typography?.paragraphSpacing ?? 0);
  const maxLines = common(nodes, (node) => node.typography?.maxLines ?? 0);
  const truncation = common(nodes, (node) => node.typography?.truncation ?? "none");
  const listStyle = common(nodes, (node) => node.typography?.listStyle ?? "none");
  const fontFeatureSettings = common(
    nodes,
    (node) => node.typography?.fontFeatureSettings ?? "normal",
  );
  const fontVariationSettings = common(
    nodes,
    (node) => node.typography?.fontVariationSettings ?? "normal",
  );
  return (
    <section aria-label="Typography" className="space-y-2 border-b border-border/60 px-3 py-2.5">
      <h3 className="text-xs font-medium">Typography</h3>
      {showSizing ? (
        <DesignTextSizingControl nodes={nodes} allNodes={allNodes} onChange={onChange} />
      ) : null}
      <FontFamily nodes={nodes} allNodes={allNodes} onChange={onChange} />
      <div className="grid grid-cols-2 gap-2">
        <Menu>
          <MenuTrigger
            render={
              <button
                type="button"
                aria-label="Font style"
                className="flex h-6 min-w-0 items-center justify-between gap-1 rounded-md bg-input/25 px-2 text-xs"
              />
            }
          >
            <span className="truncate">{weight.mixed ? "Mixed" : styleName}</span>
            <ChevronDownIcon className="size-3 shrink-0" />
          </MenuTrigger>
          <MenuPopup align="start">
            {(["normal", "italic"] as const).flatMap((fontStyle) =>
              weights.map(([value, label]) => (
                <MenuItem
                  key={`${fontStyle}-${value}`}
                  onClick={() =>
                    onChange((node) => ({
                      fontWeight: value,
                      typography: { ...node.typography, weight: value, fontStyle },
                    }))
                  }
                >
                  {fontStyle === "normal"
                    ? label
                    : `${label === "Regular" ? "" : `${label} `}Italic`}
                </MenuItem>
              )),
            )}
          </MenuPopup>
        </Menu>
        <DesignNumberField
          label="Font size"
          prefix=""
          value={size.value}
          mixed={size.mixed}
          compact
          propertyLabels={propertyLabels}
          min={0.000001}
          onChange={() => undefined}
          onExpression={(expression) =>
            onChange((node) => {
              const value = evaluateDesignExpression(
                expression,
                node.typography?.size ?? node.fontSize ?? 16,
              );
              return value === null || value <= 0
                ? null
                : { fontSize: value, typography: { ...node.typography, size: value } };
            })
          }
          trailing={
            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="Font size presets"
                    className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
                  />
                }
              >
                <ChevronDownIcon className="size-3" />
              </MenuTrigger>
              <MenuPopup align="end">
                {fontSizes.map((value) => (
                  <MenuItem
                    key={value}
                    onClick={() =>
                      onChange((node) => ({
                        fontSize: value,
                        typography: { ...node.typography, size: value },
                      }))
                    }
                  >
                    {value}
                  </MenuItem>
                ))}
              </MenuPopup>
            </Menu>
          }
        />
        {metric("Line height", "lineHeight", "↕")}
        {metric("Letter spacing", "letterSpacing", "|A|")}
      </div>
      <div className="grid gap-2">
        <span className="text-2xs text-muted-foreground">Alignment</span>
        <div className="flex items-center gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
            {alignment(false)}
            {alignment(true)}
          </div>
          <Popover>
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <Button size="icon-xs" variant="ghost-muted" aria-label="Type settings" />
                    }
                  />
                }
              >
                <SlidersHorizontalIcon />
              </TooltipTrigger>
              <TooltipPopup>Type settings</TooltipPopup>
            </Tooltip>
            <PopoverPopup width="sm" side="left" align="start">
              <div className="grid gap-4" role="group" aria-label="Type settings">
                <h4 className="text-xs font-medium">Type settings</h4>
                {settingsRow(
                  "Decoration",
                  <div className="flex gap-1">
                    {(
                      [
                        ["underline", UnderlineIcon],
                        ["line-through", StrikethroughIcon],
                      ] as const
                    ).map(([value, Icon]) => (
                      <Button
                        key={value}
                        size="icon-xs"
                        variant={
                          decoration.mixed || !decoration.value.includes(value)
                            ? "ghost-muted"
                            : "secondary"
                        }
                        aria-label={value === "underline" ? "Underline" : "Strikethrough"}
                        aria-pressed={!decoration.mixed && decoration.value.includes(value)}
                        onClick={() => {
                          onChange((node) => {
                            const parts = new Set(
                              (node.typography?.decoration ?? "none")
                                .split(" ")
                                .filter((item) => item !== "none"),
                            );
                            if (parts.has(value)) parts.delete(value);
                            else parts.add(value);
                            const next =
                              ["underline", "line-through"]
                                .filter((item) => parts.has(item))
                                .join(" ") || "none";
                            return {
                              typography: {
                                ...node.typography,
                                decoration: next as DesignTypography["decoration"],
                              },
                            };
                          });
                        }}
                      >
                        <Icon />
                      </Button>
                    ))}
                  </div>,
                )}
                {settingsRow(
                  "Letter case",
                  <Menu>
                    <MenuTrigger
                      render={<Button size="xs" variant="secondary" aria-label="Letter case" />}
                    >
                      {letterCase.mixed
                        ? "Mixed"
                        : {
                            none: "Original",
                            uppercase: "UPPERCASE",
                            lowercase: "lowercase",
                            capitalize: "Capitalize",
                            "small-caps": "Small caps",
                          }[letterCase.value]}
                      <ChevronDownIcon />
                    </MenuTrigger>
                    <MenuPopup>
                      {(
                        ["none", "uppercase", "lowercase", "capitalize", "small-caps"] as const
                      ).map((value) => (
                        <MenuItem key={value} onClick={() => type("letterCase", value)}>
                          {
                            {
                              none: "Original",
                              uppercase: "UPPERCASE",
                              lowercase: "lowercase",
                              capitalize: "Capitalize",
                              "small-caps": "Small caps",
                            }[value]
                          }
                        </MenuItem>
                      ))}
                    </MenuPopup>
                  </Menu>,
                )}
                {settingsRow(
                  "Wrap style",
                  <Menu>
                    <MenuTrigger
                      render={<Button size="xs" variant="secondary" aria-label="Wrap style" />}
                    >
                      {wrap.mixed
                        ? "Mixed"
                        : wrap.value === "auto"
                          ? "Auto"
                          : wrap.value === "balance"
                            ? "Balance"
                            : "Pretty"}
                      <ChevronDownIcon />
                    </MenuTrigger>
                    <MenuPopup>
                      {(["auto", "balance", "pretty"] as const).map((value) => (
                        <MenuItem key={value} onClick={() => type("wrap", value)}>
                          {value === "auto" ? "Auto" : value === "balance" ? "Balance" : "Pretty"}
                        </MenuItem>
                      ))}
                    </MenuPopup>
                  </Menu>,
                )}
                {settingsRow(
                  "OpenType features",
                  <Input
                    size="sm"
                    aria-label="OpenType features"
                    placeholder='e.g. "kern", "liga"'
                    value={fontFeatureSettings.mixed ? "Mixed" : fontFeatureSettings.value}
                    onChange={(event) => type("fontFeatureSettings", event.target.value)}
                  />,
                )}
                {settingsRow(
                  "Variable font axes",
                  <Input
                    size="sm"
                    aria-label="Variable font axes"
                    placeholder='e.g. "wght" 650, "wdth" 90'
                    value={fontVariationSettings.mixed ? "Mixed" : fontVariationSettings.value}
                    onChange={(event) => type("fontVariationSettings", event.target.value)}
                  />,
                )}
                {settingsRow(
                  "Paragraph",
                  <div className="grid grid-cols-2 gap-2">
                    <DesignNumberField
                      compact
                      label="Indent"
                      displayLabel="Indent"
                      prefix="↦"
                      value={indent.value}
                      mixed={indent.mixed}
                      min={0}
                      onChange={(value) => type("indent", value)}
                    />
                    <DesignNumberField
                      compact
                      label="Paragraph spacing"
                      displayLabel="Spacing"
                      prefix="↕"
                      value={paragraphSpacing.value}
                      mixed={paragraphSpacing.mixed}
                      min={0}
                      onChange={(value) => type("paragraphSpacing", value)}
                    />
                  </div>,
                )}
                {settingsRow(
                  "List style",
                  <Menu>
                    <MenuTrigger
                      render={<Button size="xs" variant="secondary" aria-label="List style" />}
                    >
                      {listStyle.mixed
                        ? "Mixed"
                        : listStyle.value === "bulleted"
                          ? "Bulleted"
                          : listStyle.value === "numbered"
                            ? "Numbered"
                            : "None"}
                      <ChevronDownIcon />
                    </MenuTrigger>
                    <MenuPopup>
                      {(["none", "bulleted", "numbered"] as const).map((value) => (
                        <MenuItem key={value} onClick={() => type("listStyle", value)}>
                          {value === "none"
                            ? "None"
                            : value === "bulleted"
                              ? "Bulleted"
                              : "Numbered"}
                        </MenuItem>
                      ))}
                    </MenuPopup>
                  </Menu>,
                )}
                {settingsRow(
                  "Truncation",
                  <div className="grid gap-2">
                    <Menu>
                      <MenuTrigger
                        render={<Button size="xs" variant="secondary" aria-label="Truncation" />}
                      >
                        {truncation.mixed
                          ? "Mixed"
                          : truncation.value === "ellipsis"
                            ? "Ellipsis"
                            : truncation.value === "clip"
                              ? "Clip"
                              : "None"}
                        <ChevronDownIcon />
                      </MenuTrigger>
                      <MenuPopup>
                        {(["none", "clip", "ellipsis"] as const).map((value) => (
                          <MenuItem key={value} onClick={() => type("truncation", value)}>
                            {value === "none" ? "None" : value === "clip" ? "Clip" : "Ellipsis"}
                          </MenuItem>
                        ))}
                      </MenuPopup>
                    </Menu>
                    {truncation.value !== "none" ? (
                      <DesignNumberField
                        compact
                        label="Max lines"
                        displayLabel="Max lines"
                        prefix="#"
                        value={maxLines.value || undefined}
                        mixed={maxLines.mixed}
                        min={1}
                        onChange={(value) => type("maxLines", Math.max(1, Math.round(value)))}
                      />
                    ) : null}
                  </div>,
                )}
              </div>
            </PopoverPopup>
          </Popover>
        </div>
      </div>
    </section>
  );
}
