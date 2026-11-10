import { DesignAssetPayload, ThreadId } from "@t3tools/contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import {
  CloudUploadIcon,
  CopyIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  ChevronsUpIcon,
  BlendIcon,
  Grid2X2Icon,
  LayersIcon,
  LockIcon,
  UnlockIcon,
  PlusIcon,
  MoreHorizontalIcon,
  PlayIcon,
  SquareDashedIcon,
  TypeIcon,
  AlignStartVerticalIcon,
  AlignStartHorizontalIcon,
  MinusIcon,
  SearchIcon,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type KeyboardEvent,
  type DragEvent,
} from "react";
import { createPortal } from "react-dom";

import { workspaceAreaProps } from "../../lib/workspaceFocus";
import { cn } from "../../lib/utils";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useEnvironmentQuery } from "../../state/query";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { useEnvironments } from "../../state/environments";
import { useProjects } from "../../state/entities";
import { Button } from "../ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
  MenuGroup,
  MenuGroupLabel,
} from "../ui/menu";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
} from "../ui/dialog";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import {
  addAssetMeta,
  pasteDesignNodes,
  renameDesignDocument,
  setPrototypeStartFrame,
  updatePrototypeSettings,
  removeDesignAsset,
  replaceDesignAsset,
  addComponentNode,
  addFrameNode,
  addDesignPage,
  renameDesignPage,
  deleteDesignPage,
  alignDesignNodes,
  distributeDesignNodes,
  addImageNode,
  addInstanceNode,
  detachDesignInstance,
  addTextNode,
  deleteDesignNodes,
  designInsertionParent,
  duplicateDesignNodes,
  nodeForPage,
  isDesignNodeLocked,
  isDesignNodeInFlow,
  restoreDesignContent,
  selectionRoots,
  renameDesignNode,
  reparentDesignNode,
  groupDesignNodes,
  ungroupDesignNode,
  reorderDesignNode,
  setActiveDesignPage,
  updateDesignNode,
  updateDesignNodes,
  booleanDesignSelection,
  addDesignComment,
  updateDesignComment,
  removeDesignComment,
  type DesignDocument,
  type DesignConflictRecord,
  type DesignNode,
  type DesignPrototypeSettings,
} from "./designDocument";
import {
  restoreDesignPackageAssets,
  packageDesignAssets,
  serializeDesignFile,
  deserializeDesignFile,
} from "./designAssetPackage";
import { DesignAssetRow } from "./DesignAssetRow";
import {
  copyDesignSelection,
  readDesignSelection,
  portableDesignSelection,
} from "./designClipboard";
import { DesignCanvas, type DesignTool } from "./DesignCanvas";
import { DesignScalePanel } from "./DesignScalePanel";
import { DesignNumberField } from "./DesignNumberField";
import { DesignInspectorColor } from "./DesignInspectorColor";
import { DesignMultiInspector } from "./DesignMultiInspector";
import { DesignAlignmentControls } from "./DesignAlignmentControls";
import { DesignAspectRatioControl } from "./DesignAspectRatioControl";
import {
  designInspectorRotation,
  flipDesignSelection,
  rotateDesignSelection,
  setDesignNodeRotation,
  setDesignNodeRotations,
} from "./designTransform";
import {
  createDesignRotationOrigin,
  resolveDesignRotationOrigin,
  type DesignRotationOrigin,
} from "./designRotationOrigin";
import { DesignRotationControls } from "./DesignRotationControls";
import { DesignTypographyPanel, DesignTextSizingControl } from "./DesignTypographyPanel";
import { DesignAutoLayoutPanel } from "./DesignAutoLayoutPanel";
import { DesignPaintPanel } from "./DesignPaintPanel";
import { DesignEffectsPanel } from "./DesignEffectsPanel";
import { DesignReactPasteDialog } from "./DesignReactPasteDialog";
import { DesignPresentation } from "./DesignPresentation";
import { DesignDocument as DesignDocumentSchema } from "./designDocument";
import { readDesignAsset } from "./designAssetStore";
import {
  prepareDesignImage,
  readImageDimensions,
  type DesignImagePlacement,
  type DesignImageTarget,
  materializeDesignDocumentImages,
} from "./designImage";
import {
  applyDesignSyncResult,
  createDesignSyncRequest,
  resolveDesignConflict,
} from "./designSync";
import { useDesignDocument } from "./useDesignDocument";
import {
  exportDesignHtmlPortable,
  exportDesignPatchPortable,
  exportDesignReactPortable,
  exportDesignSliceHtml,
  exportDesignSliceSvg,
} from "./designExport";
import {
  createDesignDocumentFromMarkup,
  linkDesignDocument,
  materializePreviewAssets,
  refreshLinkedDesignDocument,
} from "./previewToDesign";

import { DesignLayerList, flattenDesignLayers, type DesignLayerEntry } from "./DesignLayerList";

const DESIGN_SIDEBAR_WIDTH = "w-(--design-sidebar-width)";
const decodeDesignDocument = Schema.decodeUnknownSync(DesignDocumentSchema);
const decodeDesignAssetPayloads = Schema.decodeUnknownSync(Schema.Array(DesignAssetPayload));

type ServerDesignPackage = {
  readonly document: DesignDocument;
  readonly assetPayloads: ReadonlyArray<{
    readonly assetId: string;
    readonly mimeType: string;
    readonly base64: string;
  }>;
};

function decodeServerDesignPackage(
  contents: string | null | undefined,
):
  | { readonly status: "missing" }
  | { readonly status: "malformed" }
  | { readonly status: "valid"; readonly package: ServerDesignPackage } {
  if (!contents) return { status: "missing" };
  try {
    const stored = JSON.parse(contents) as {
      readonly snapshot?: unknown;
      readonly assetPayloads?: unknown;
    };
    if (typeof stored.snapshot !== "string") return { status: "malformed" };
    return {
      status: "valid",
      package: {
        document: decodeDesignDocument(JSON.parse(stored.snapshot)),
        assetPayloads:
          stored.assetPayloads === undefined ? [] : decodeDesignAssetPayloads(stored.assetPayloads),
      },
    };
  } catch {
    return { status: "malformed" };
  }
}

function LayerRow({
  node,
  selected,
  onSelect,
  depth,
  expanded,
  hasChildren,
  onToggleExpand,
  onToggleVisibility,
  onToggleLock,
  onRename,
  onAction,
  onDropLayer,
  locked,
  parentLocked,
}: {
  node: DesignNode;
  selected: boolean;
  onSelect: (nodeId: string, additive: boolean) => void;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
  onToggleExpand: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onRename: (name: string) => void;
  onAction: (action: string) => void;
  onDropLayer: (id: string, position: "before" | "inside" | "after") => void;
  locked: boolean;
  parentLocked: boolean;
}) {
  const [dropPosition, setDropPosition] = useState<"before" | "inside" | "after" | null>(null);
  const dropAt = (event: DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = (event.clientY - rect.top) / rect.height;
    const container = ["frame", "component", "instance", "group"].includes(node.kind);
    return container && (event.shiftKey || (position > 0.25 && position < 0.75))
      ? "inside"
      : position > 0.5
        ? "after"
        : "before";
  };
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(node.name);
  const cancelled = useRef(false);
  const finishName = () => {
    if (!cancelled.current) onRename(name);
    setRenaming(false);
  };
  return (
    <div
      className={cn(
        "group relative flex h-7 w-full items-center gap-1 rounded-lg pe-1 text-left text-xs transition-colors",
        selected ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted/70",
        dropPosition === "inside" && "outline-2 -outline-offset-2 outline-primary",
      )}
      style={{ paddingInlineStart: `${8 + depth * 14}px` }}
      draggable={!renaming && !locked}
      onDragStart={(event) =>
        event.dataTransfer.setData("application/x-t3-design-layer", node.nodeId)
      }
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDropPosition(dropAt(event));
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Element) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDropPosition(null);
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = event.dataTransfer.getData("application/x-t3-design-layer");
        if (id) onDropLayer(id, dropAt(event));
        setDropPosition(null);
      }}
    >
      {dropPosition === "before" || dropPosition === "after" ? (
        <span
          className={cn(
            "pointer-events-none absolute inset-x-0 h-px bg-primary",
            dropPosition === "before" ? "top-0" : "bottom-0",
          )}
        />
      ) : null}
      {dropPosition === "inside" ? (
        <span className="pointer-events-none absolute end-1 top-0 bg-primary px-1 text-3xs text-primary-foreground">
          Inside
        </span>
      ) : null}
      <button
        type="button"
        className="size-4 shrink-0"
        aria-label={expanded ? "Collapse layer" : "Expand layer"}
        aria-expanded={hasChildren ? expanded : undefined}
        onClick={onToggleExpand}
        disabled={!hasChildren}
        tabIndex={hasChildren ? 0 : -1}
      >
        {hasChildren ? (
          expanded ? (
            <ChevronDownIcon className="size-3" />
          ) : (
            <ChevronRightIcon className="size-3" />
          )
        ) : null}
      </button>
      {renaming ? (
        <div className="min-w-0 flex-1">
          <Input
            size="sm"
            aria-label="Layer name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={finishName}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                cancelled.current = true;
                setRenaming(false);
              }
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onDoubleClick={() => {
            setName(node.name);
            cancelled.current = false;
            setRenaming(true);
          }}
          data-design-layer-name=""
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-pressed={selected}
          onClick={(event) => onSelect(node.nodeId, event.shiftKey)}
        >
          {node.kind === "frame" ? (
            <SquareDashedIcon className="size-3.5 shrink-0" />
          ) : node.kind === "text" ? (
            <TypeIcon className="size-3.5 shrink-0" />
          ) : node.kind === "component" ? (
            <LayersIcon className="size-3.5 shrink-0" />
          ) : node.kind === "instance" ? (
            <CopyIcon className="size-3.5 shrink-0" />
          ) : (
            <ChevronRightIcon className="size-3.5 shrink-0" />
          )}
          <span className="min-w-0 truncate">{node.name}</span>
        </button>
      )}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 end-1 flex items-center gap-1 ps-2 opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
          selected ? "bg-accent" : "bg-sidebar",
          (node.visible === false || locked) && "pointer-events-auto opacity-100",
        )}
      >
        <button
          type="button"
          aria-label={node.visible === false ? "Show layer" : "Hide layer"}
          className="inline-flex size-5 shrink-0 items-center justify-center "
          onClick={onToggleVisibility}
        >
          {node.visible === false ? (
            <EyeOffIcon className="size-3" />
          ) : (
            <EyeIcon className="size-3" />
          )}
        </button>
        <Tooltip>
          <TooltipTrigger
            render={<span className="inline-flex" tabIndex={parentLocked ? 0 : undefined} />}
          >
            <button
              type="button"
              aria-label={
                parentLocked
                  ? "Locked by parent"
                  : node.locked === true
                    ? "Unlock layer"
                    : "Lock layer"
              }
              disabled={parentLocked}
              className="inline-flex size-5 shrink-0 items-center justify-center"
              onClick={onToggleLock}
            >
              {locked ? <LockIcon className="size-3" /> : <UnlockIcon className="size-3" />}
            </button>
          </TooltipTrigger>
          <TooltipPopup>
            {parentLocked
              ? "Unlock the parent to unlock this layer"
              : node.locked
                ? "Unlock layer"
                : "Lock layer"}
          </TooltipPopup>
        </Tooltip>
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label={`Actions for ${node.name}`}
              />
            }
          >
            <MoreHorizontalIcon />
          </MenuTrigger>
          <MenuPopup align="start">
            {locked ? (
              <p className="px-2 py-1 text-2xs text-muted-foreground">
                Unlock the layer to move, group or delete it.
              </p>
            ) : null}
            <MenuItem
              onClick={() => {
                setName(node.name);
                cancelled.current = false;
                setRenaming(true);
              }}
            >
              Rename
            </MenuItem>
            <MenuItem onClick={() => onAction("duplicate")}>Duplicate</MenuItem>
            <MenuItem disabled={locked} onClick={() => onAction("up")}>
              Move up
            </MenuItem>
            <MenuItem disabled={locked} onClick={() => onAction("down")}>
              Move down
            </MenuItem>
            <MenuItem disabled={locked} onClick={() => onAction("flip-horizontal")}>
              Flip horizontal
            </MenuItem>
            <MenuItem disabled={locked} onClick={() => onAction("flip-vertical")}>
              Flip vertical
            </MenuItem>
            <MenuItem disabled={locked} onClick={() => onAction("group")}>
              Group selection
            </MenuItem>
            {node.kind === "group" ? (
              <MenuItem disabled={locked} onClick={() => onAction("ungroup")}>
                Ungroup
              </MenuItem>
            ) : null}
            {node.kind === "instance" ? (
              <MenuItem disabled={locked} onClick={() => onAction("detach")}>
                Detach instance
              </MenuItem>
            ) : null}
            <MenuItem disabled={locked} onClick={() => onAction("delete")}>
              Delete
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </div>
  );
}

function PageRow({
  name,
  active,
  canDelete,
  onSelect,
  onRename,
  onDelete,
}: {
  name: string;
  active: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const cancelled = useRef(false);
  const save = () => {
    if (!cancelled.current) onRename(draft);
    setEditing(false);
  };
  return (
    <div
      className={cn(
        "group flex items-center rounded-md",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {editing ? (
        <Input
          size="sm"
          aria-label="Page name"
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              cancelled.current = true;
              setEditing(false);
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-xs"
          aria-pressed={active}
          onClick={onSelect}
          onDoubleClick={() => {
            setDraft(name);
            cancelled.current = false;
            setEditing(true);
          }}
        >
          {name}
        </button>
      )}
      <Menu>
        <MenuTrigger
          render={
            <Button size="icon-xs" variant="ghost-muted" aria-label={`Actions for page ${name}`} />
          }
        >
          <MoreHorizontalIcon />
        </MenuTrigger>
        <MenuPopup align="start">
          <MenuItem
            onClick={() => {
              setDraft(name);
              cancelled.current = false;
              setEditing(true);
            }}
          >
            Rename page
          </MenuItem>
          <MenuItem disabled={!canDelete} onClick={onDelete}>
            Delete page
          </MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );
}

function LayersPanel({
  document,
  selectedNodeIds,
  onSelect,
  onAddLayer,
  onAddFrame,
  onAddComponent,
  onAddInstance,
  onAddPage,
  onSelectPage,
  onRename,
  onToggleVisibility,
  onToggleLock,
  onAction,
  onDropLayer,
  onPageRename,
  onPageDelete,
  onEditorKeyDown,
  onInsertComponent,
  onPlaceAsset,
  onReplaceAsset,
  onRemoveAsset,
  onImportAsset,
}: {
  document: DesignDocument;
  selectedNodeIds: ReadonlyArray<string>;
  onSelect: (nodeId: string, additive: boolean) => void;
  onAddLayer: () => void;
  onAddFrame: () => void;
  onAddComponent: () => void;
  onAddInstance: (componentId: string) => void;
  onAddPage: () => void;
  onSelectPage: (pageId: string) => void;
  onRename: (nodeId: string, name: string) => void;
  onToggleVisibility: (nodeId: string) => void;
  onToggleLock: (nodeId: string) => void;
  onAction: (nodeId: string, action: string) => void;
  onDropLayer: (
    nodeId: string,
    target: DesignNode,
    position: "before" | "inside" | "after",
  ) => void;
  onPageRename: (pageId: string, name: string) => void;
  onPageDelete: (pageId: string) => void;
  onEditorKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
  onInsertComponent: (nodeId: string) => void;
  onPlaceAsset: (assetId: string) => void;
  onReplaceAsset: (assetId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  onImportAsset: () => void;
}) {
  const roots = nodeForPage(document);
  const [tab, setTab] = useState<"layers" | "assets">("layers");
  const [layerQuery, setLayerQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(true);
  const [assetQuery, setAssetQuery] = useState("");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(roots.map((node) => node.nodeId)),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = flattenDesignLayers(document, expanded);
  const assetUses = new Map<string, number>();
  for (const node of document.nodes)
    if (node.assetId) assetUses.set(node.assetId, (assetUses.get(node.assetId) ?? 0) + 1);
  const layerRows = (() => {
    const query = layerQuery.trim().toLocaleLowerCase();
    if (!query) return rows;
    const byId = new Map(document.nodes.map((node) => [node.nodeId, node]));
    const matches = new Set(
      document.nodes
        .filter((node) => `${node.name} ${node.text ?? ""}`.toLocaleLowerCase().includes(query))
        .map((node) => node.nodeId),
    );
    const visible = new Set(matches);
    for (const id of matches) {
      let parentId = byId.get(id)?.parentId ?? null;
      while (parentId) {
        visible.add(parentId);
        parentId = byId.get(parentId)?.parentId ?? null;
      }
    }
    return rows.filter((row) => visible.has(row.node.nodeId));
  })();
  const toggleExpanded = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const renderRow = ({
    node,
    depth,
    locked,
    parentLocked,
    expanded: isExpanded,
    hasChildren,
  }: DesignLayerEntry) => (
    <LayerRow
      node={node}
      depth={depth}
      locked={locked}
      parentLocked={parentLocked}
      expanded={isExpanded}
      hasChildren={hasChildren}
      selected={selectedNodeIds.includes(node.nodeId)}
      onSelect={onSelect}
      onToggleExpand={() => toggleExpanded(node.nodeId)}
      onToggleVisibility={() => onToggleVisibility(node.nodeId)}
      onToggleLock={() => onToggleLock(node.nodeId)}
      onRename={(name) => onRename(node.nodeId, name)}
      onAction={(action) => onAction(node.nodeId, action)}
      onDropLayer={(id, position) => onDropLayer(id, node, position)}
    />
  );

  return (
    <aside
      {...workspaceAreaProps("design-layers", 0, "Design layers")}
      onKeyDown={(event) => {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest("input,textarea,[contenteditable=true]")
        )
          return;
        if (event.metaKey || event.ctrlKey || event.key === "Delete" || event.key === "Backspace")
          onEditorKeyDown(event);
      }}
      className={cn(
        DESIGN_SIDEBAR_WIDTH,
        "flex min-h-0 shrink-0 flex-col border-r border-border/70 bg-sidebar",
      )}
    >
      <div
        role="tablist"
        aria-label="Design resources"
        className="flex h-10 shrink-0 items-center gap-1 border-b border-sidebar-border/50 px-3"
      >
        {(["layers", "assets"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={cn(
              "rounded-md px-2 py-1 text-xs outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
              tab === value
                ? "bg-accent font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => setTab(value)}
          >
            {value === "layers" ? "File" : "Assets"}
          </button>
        ))}
      </div>
      {tab === "layers" ? (
        <>
          <section
            aria-label="Pages"
            className="shrink-0 border-b border-sidebar-border/50 px-2 py-2"
          >
            <div className="mb-1 flex h-6 items-center gap-1 px-1">
              <button
                type="button"
                aria-expanded={pagesOpen}
                aria-controls="design-pages"
                onClick={() => setPagesOpen(!pagesOpen)}
                className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs font-medium"
              >
                <ChevronDownIcon
                  className={cn("size-3 text-muted-foreground", !pagesOpen && "-rotate-90")}
                />
                Pages
              </button>
              <Button
                aria-label="Find layers"
                size="icon-xs"
                variant="ghost-muted"
                aria-pressed={searchOpen}
                onClick={() => {
                  setSearchOpen(!searchOpen);
                  setLayerQuery("");
                }}
              >
                <SearchIcon />
              </Button>
              <Button
                aria-label="Add page"
                size="icon-xs"
                variant="ghost-muted"
                onClick={() => {
                  setPagesOpen(true);
                  onAddPage();
                }}
              >
                <PlusIcon />
              </Button>
            </div>
            {pagesOpen ? (
              <div id="design-pages" className="max-h-48 space-y-0.5 overflow-y-auto">
                {document.pages.map((page) => (
                  <PageRow
                    key={page.pageId}
                    name={page.name}
                    active={page.pageId === document.activePageId}
                    canDelete={document.pages.length > 1}
                    onSelect={() => onSelectPage(page.pageId)}
                    onRename={(name) => onPageRename(page.pageId, name)}
                    onDelete={() => onPageDelete(page.pageId)}
                  />
                ))}
              </div>
            ) : null}
          </section>
          <div className="flex h-10 shrink-0 items-center justify-between px-3">
            <h2 className="text-xs font-medium">Layers</h2>
            <div className="flex items-center gap-1">
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label="Collapse layers"
                onClick={() => setExpanded(new Set())}
              >
                <ChevronsUpIcon />
              </Button>
              <Menu>
                <MenuTrigger
                  render={
                    <Button size="icon-xs" variant="ghost-muted" aria-label="Layer actions" />
                  }
                >
                  <MoreHorizontalIcon />
                </MenuTrigger>
                <MenuPopup align="start">
                  <MenuItem onClick={onAddFrame}>Add frame</MenuItem>
                  <MenuItem onClick={onAddLayer}>Add layer</MenuItem>
                  <MenuItem onClick={onAddComponent}>Create component</MenuItem>
                  <MenuSeparator />
                  {document.nodes
                    .filter((node) => node.kind === "component")
                    .map((node) => (
                      <MenuItem key={node.nodeId} onClick={() => onAddInstance(node.nodeId)}>
                        Insert {node.name}
                      </MenuItem>
                    ))}
                  {!document.nodes.some((node) => node.kind === "component") ? (
                    <MenuItem disabled>Create a component to insert instances</MenuItem>
                  ) : null}
                </MenuPopup>
              </Menu>
            </div>
          </div>
        </>
      ) : (
        <div className="shrink-0 px-3 py-2">
          <Input
            size="sm"
            type="search"
            aria-label="Search assets"
            placeholder="Search assets"
            value={assetQuery}
            onChange={(event) => setAssetQuery(event.target.value)}
          />
        </div>
      )}
      <div
        ref={scrollRef}
        data-design-layer-viewport=""
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {tab === "layers" ? (
          <>
            {searchOpen ? (
              <label className="mb-2 block px-1">
                <Input
                  autoFocus
                  size="sm"
                  type="search"
                  aria-label="Find layers"
                  placeholder="Find layers"
                  value={layerQuery}
                  onChange={(event) => setLayerQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setLayerQuery("");
                      setSearchOpen(false);
                    }
                  }}
                />
              </label>
            ) : null}
            {layerQuery.trim() && layerRows.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">No layers found.</p>
            ) : null}
            <DesignLayerList
              rows={layerRows}
              scrollRef={scrollRef}
              selectedId={selectedNodeIds[0] ?? null}
              onSelect={onSelect}
              onToggleExpand={toggleExpanded}
              renderRow={renderRow}
            />
          </>
        ) : (
          <div className="space-y-2">
            {assetQuery.trim() &&
            !document.assets.some(
              (asset) =>
                asset.mimeType.startsWith("image/") &&
                asset.name.toLocaleLowerCase().includes(assetQuery.trim().toLocaleLowerCase()),
            ) &&
            !document.nodes.some(
              (node) =>
                node.kind === "component" &&
                node.name.toLocaleLowerCase().includes(assetQuery.trim().toLocaleLowerCase()),
            ) ? (
              <p role="status" className="px-2 py-2 text-xs text-muted-foreground">
                No assets found.
              </p>
            ) : null}
            <div className="flex items-center justify-between px-2">
              <p className="text-2xs text-muted-foreground">Images</p>
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label="Import images"
                onClick={onImportAsset}
              >
                <PlusIcon />
              </Button>
            </div>
            {document.assets
              .filter(
                (asset) =>
                  asset.mimeType.startsWith("image/") &&
                  asset.name.toLocaleLowerCase().includes(assetQuery.trim().toLocaleLowerCase()),
              )
              .map((asset) => (
                <DesignAssetRow
                  key={asset.assetId}
                  asset={asset}
                  uses={assetUses.get(asset.assetId) ?? 0}
                  onPlace={() => onPlaceAsset(asset.assetId)}
                  onReplace={() => onReplaceAsset(asset.assetId)}
                  onRemove={() => onRemoveAsset(asset.assetId)}
                />
              ))}
            {!document.assets.some((asset) => asset.mimeType.startsWith("image/")) ? (
              <p className="px-2 text-xs text-muted-foreground">
                Import images to reuse them in this file.
              </p>
            ) : null}
            <p className="px-2 text-2xs text-muted-foreground">Local components</p>
            {document.nodes
              .filter(
                (node) =>
                  node.kind === "component" &&
                  node.name.toLocaleLowerCase().includes(assetQuery.trim().toLocaleLowerCase()),
              )
              .map((node) => (
                <button
                  key={node.nodeId}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs hover:bg-accent"
                  onClick={() => onInsertComponent(node.nodeId)}
                >
                  <LayersIcon className="size-4 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{node.name}</span>
                  <PlusIcon className="size-3" />
                </button>
              ))}
            {!document.nodes.some((node) => node.kind === "component") ? (
              <p className="px-2 text-xs leading-5 text-muted-foreground">
                Create a component to reuse it across your design.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </aside>
  );
}

function flipShortcutAxis(event: KeyboardEvent<HTMLElement>) {
  if (!event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return null;
  const key = event.code.startsWith("Key")
    ? event.code.slice(3).toLowerCase()
    : event.key.toLowerCase();
  return key === "h" ? "horizontal" : key === "v" ? "vertical" : null;
}

function Inspector({
  node,
  selectionCount,
  selectedNodes,
  onChangeMany,
  canAlign,
  onDistribute,
  provenance,
  conflict,
  onChange,
  onResolveConflict,
  nodes,
  locked,
  onAlign,
  onFlip,
  onRotate,
  canTransform,
  onBeginEdit,
  onEndEdit,
  startNodeId,
  onSetStart,
  prototypeSettings,
  onPrototypeSettings,
  pageFrames,
  imageAsset,
  onReplaceImage,
  propertyLabels,
  page,
  onPageChange,
}: {
  node: DesignNode | null;
  selectionCount: number;
  selectedNodes: readonly DesignNode[];
  onChangeMany: (update: (node: DesignNode) => Partial<DesignNode> | null) => boolean;
  canAlign: boolean;
  onDistribute: (axis: "horizontal" | "vertical") => void;
  provenance: DesignDocument["provenance"];
  conflict: DesignConflictRecord | null;
  onChange: (update: Partial<DesignNode>) => void;
  onResolveConflict: (resolution: "keep-local" | "use-server" | "duplicate-node") => void;
  nodes: readonly DesignNode[];
  locked: boolean;
  onBeginEdit: () => void;
  onEndEdit: () => void;
  startNodeId: string | undefined;
  onSetStart: (nodeId: string | null) => void;
  prototypeSettings: DesignPrototypeSettings;
  onPrototypeSettings: (update: Partial<DesignPrototypeSettings>) => void;
  pageFrames: readonly DesignNode[];
  imageAsset: DesignDocument["assets"][number] | undefined;
  onReplaceImage: () => void;
  propertyLabels: boolean;
  page: DesignDocument["pages"][number];
  onPageChange: (update: Partial<DesignDocument["pages"][number]>) => void;
  onAlign: (alignment: "left" | "center" | "right" | "top" | "middle" | "bottom") => void;
  onFlip: (axis: "horizontal" | "vertical") => void;
  onRotate: () => void;
  canTransform: boolean;
}) {
  const interactionSequence = useRef(0);
  const parent = nodes.find((candidate) => candidate.nodeId === node?.parentId);
  const parentFlows = parent?.layoutModel !== undefined && parent.layoutModel.kind !== "absolute";
  const inFlow = parentFlows && node?.layoutSizing?.position !== "absolute";
  const isContainer =
    node !== null && ["frame", "component", "instance"].includes(node.kind) && !node.section;
  const autoLayout =
    isContainer && node.layoutModel !== undefined && node.layoutModel.kind !== "absolute";
  const sizing = node?.layoutSizing ?? { width: "fixed" as const, height: "fixed" as const };
  const [tab] = useState<"design" | "prototype">("design");
  const number = (
    label: string,
    value: number | undefined | null,
    change: (value: number) => void,
    min?: number,
    max?: number,
    trailing?: ReactNode,
  ) => (
    <DesignNumberField
      label={label}
      value={value}
      onChange={change}
      min={min}
      max={max}
      trailing={
        trailing ??
        (label === "Opacity %" ? (
          <span aria-hidden="true" className="text-2xs text-muted-foreground">
            %
          </span>
        ) : undefined)
      }
      compact
      propertyLabels={propertyLabels}
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
    />
  );
  const choice = (
    label: string,
    value: string,
    values: readonly string[],
    change: (value: string) => void,
    labels?: Readonly<Record<string, string>>,
  ) => (
    <label className="grid min-w-0 gap-1 text-2xs text-muted-foreground">
      <span>{label}</span>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next !== null) change(next);
        }}
      >
        <SelectTrigger size="sm" width="fluid" aria-label={label}>
          <SelectValue>{labels?.[value] ?? value}</SelectValue>
        </SelectTrigger>
        <SelectPopup>
          {values.map((option) => (
            <SelectItem key={option} value={option}>
              {labels?.[option] ?? option}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </label>
  );
  const sizeMenu = (axis: "width" | "height") =>
    node ? (
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label={`${axis === "width" ? "Width" : "Height"} sizing`}
              className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent"
            />
          }
        >
          <ChevronDownIcon className="size-3" />
        </MenuTrigger>
        <MenuPopup align="end">
          {[
            "fixed",
            ...(autoLayout || node.kind === "text" ? ["hug"] : []),
            ...(inFlow ? ["fill"] : []),
          ].map((value) => (
            <MenuItem
              key={value}
              onClick={() =>
                onChange({ layoutSizing: { ...sizing, [axis]: value as "fixed" | "hug" | "fill" } })
              }
            >
              {value === "fixed" ? "Fixed" : value === "hug" ? "Hug contents" : "Fill container"}
              {sizing[axis] === value ? " ✓" : ""}
            </MenuItem>
          ))}
          <MenuSeparator />
          <div className="grid grid-cols-2 gap-2 p-2">
            {(axis === "width"
              ? (["minWidth", "maxWidth"] as const)
              : (["minHeight", "maxHeight"] as const)
            ).map((field) => (
              <label key={field} className="grid gap-1 text-2xs text-muted-foreground">
                {field.startsWith("min") ? "Minimum" : "Maximum"}
                <Input
                  size="sm"
                  type="number"
                  step="any"
                  min={0.000001}
                  value={sizing[field] ?? ""}
                  onChange={(event) =>
                    onChange({
                      layoutSizing: {
                        ...sizing,
                        [field]:
                          event.target.value === ""
                            ? undefined
                            : Math.max(0.000001, Number(event.target.value)),
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </MenuPopup>
      </Menu>
    ) : null;
  const section = (label: string, content: ReactNode, action?: ReactNode) => (
    <section className="space-y-2 border-b border-border/60 px-3 py-2.5">
      <div className="flex h-6 items-center justify-between">
        <h3 className="text-xs font-medium">{label}</h3>
        {action}
      </div>
      {content}
    </section>
  );
  return (
    <aside
      aria-label="Inspector"
      className="flex min-h-0 w-60 min-w-60 flex-col border-l border-border/70 bg-sidebar"
    >
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onFocusCapture={(event) => {
          if (
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement
          )
            onBeginEdit();
        }}
        onBlurCapture={(event) => {
          if (
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement
          )
            onEndEdit();
        }}
      >
        {conflict ? (
          <div
            className="m-3 space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-2xs"
            role="status"
          >
            <p className="font-medium">
              {conflict.nodeId === null ? "Document sync conflict" : "Layer sync conflict"}
            </p>
            <div className="flex flex-wrap gap-1">
              <Button size="xs" variant="secondary" onClick={() => onResolveConflict("keep-local")}>
                Keep local
              </Button>
              <Button
                size="xs"
                variant="ghost-muted"
                onClick={() => onResolveConflict("use-server")}
              >
                Use server
              </Button>
              {conflict.nodeId !== null ? (
                <Button
                  size="xs"
                  variant="ghost-muted"
                  onClick={() => onResolveConflict("duplicate-node")}
                >
                  Duplicate
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {locked ? (
          <p
            role="status"
            className="border-b border-border px-4 py-3 text-xs text-muted-foreground"
          >
            {selectionCount > 1
              ? "Some layers are locked on canvas. Properties remain editable."
              : "Locked on canvas. You can edit properties here."}
          </p>
        ) : null}
        {node && selectionCount === 1 ? (
          <fieldset className="min-w-0">
            <div className="flex h-12 items-center justify-between border-b border-border/60 px-3">
              <h2 className="text-xs font-semibold capitalize">
                {node.section ? "section" : node.kind}
              </h2>
              <Menu modal={false}>
                <MenuTrigger
                  render={
                    <Button size="icon-xs" variant="ghost-muted" aria-label="Layer properties" />
                  }
                >
                  <MoreHorizontalIcon />
                </MenuTrigger>
                <MenuPopup align="end">
                  <div
                    className="w-48 p-2"
                    onKeyDown={(event) => {
                      if (event.key !== "Escape") event.stopPropagation();
                    }}
                  >
                    <label className="grid gap-1 text-2xs text-muted-foreground">
                      Name
                      <Input
                        size="sm"
                        value={node.name}
                        onChange={(event) => onChange({ name: event.target.value })}
                      />
                    </label>
                    {node.kind === "text" ? (
                      <label className="mt-2 grid gap-1 text-2xs text-muted-foreground">
                        Content
                        <Input
                          size="sm"
                          value={node.text ?? ""}
                          onChange={(event) => onChange({ text: event.target.value })}
                        />
                      </label>
                    ) : null}
                  </div>
                </MenuPopup>
              </Menu>
            </div>
            {node.instanceOfNodeId ? (
              <div className="border-b border-border/60 px-3 py-3 text-2xs text-muted-foreground">
                Main component:{" "}
                {nodes.find((candidate) => candidate.nodeId === node.instanceOfNodeId)?.name ??
                  "Unavailable"}
              </div>
            ) : null}
            {tab === "design" ? (
              <>
                {section(
                  "Position",
                  <>
                    <DesignAlignmentControls
                      onAlign={onAlign}
                      disabled={!canAlign}
                      onDistribute={onDistribute}
                      distributeDisabled
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {inFlow ? (
                        <p className="col-span-2 text-2xs text-muted-foreground">
                          Positioned by auto layout
                        </p>
                      ) : (
                        <>
                          {number("X", node.x, (value) => onChange({ x: value }))}
                          {number("Y", node.y, (value) => onChange({ y: value }))}
                        </>
                      )}
                      {number("Rotation", designInspectorRotation(node.rotation ?? 0), (value) =>
                        onChange({ rotation: -value }),
                      )}
                      <DesignRotationControls
                        onRotate={onRotate}
                        onFlip={onFlip}
                        disabled={!canTransform}
                      />
                    </div>
                  </>,
                )}
                {section(
                  "Layout",
                  <>
                    {isContainer ? (
                      <div
                        className="flex rounded-md bg-input/25 p-0.5"
                        role="group"
                        aria-label="Layout direction"
                      >
                        {(
                          [
                            ["absolute", "Freeform layout", SquareDashedIcon],
                            ["column", "Vertical layout", AlignStartHorizontalIcon],
                            ["row", "Horizontal layout", AlignStartVerticalIcon],
                            ["grid", "Grid layout", Grid2X2Icon],
                          ] as const
                        ).map(([value, label, Icon]) => (
                          <Tooltip key={value}>
                            <TooltipTrigger
                              render={
                                <button
                                  type="button"
                                  aria-label={label}
                                  aria-pressed={
                                    value === "absolute" || value === "grid"
                                      ? (node.layoutModel?.kind ?? "absolute") === value
                                      : node.layoutModel?.kind !== "absolute" &&
                                        node.layoutModel?.kind !== "grid" &&
                                        node.layoutModel?.direction === value
                                  }
                                  className={cn(
                                    "flex h-6 flex-1 items-center justify-center rounded-sm text-muted-foreground",
                                    (value === "absolute" || value === "grid"
                                      ? (node.layoutModel?.kind ?? "absolute") === value
                                      : node.layoutModel?.kind !== "absolute" &&
                                        node.layoutModel?.kind !== "grid" &&
                                        node.layoutModel?.direction === value) &&
                                      "bg-background text-foreground shadow-xs",
                                  )}
                                  onClick={() =>
                                    onChange({
                                      layoutModel: {
                                        ...node.layoutModel,
                                        kind:
                                          value === "absolute" || value === "grid"
                                            ? value
                                            : "auto-layout",
                                        ...(value === "row" || value === "column"
                                          ? { direction: value }
                                          : {}),
                                      },
                                    })
                                  }
                                >
                                  <Icon className="size-3.5" />
                                </button>
                              }
                            />
                            <TooltipPopup>{label}</TooltipPopup>
                          </Tooltip>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex items-end gap-2">
                      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2">
                        {number(
                          "Width",
                          node.width,
                          (value) =>
                            onChange({
                              width: value,
                              layoutSizing: {
                                ...sizing,
                                width: "fixed",
                                height: node.aspectRatioLocked ? "fixed" : sizing.height,
                              },
                            }),
                          0.000001,
                          undefined,
                          sizeMenu("width"),
                        )}
                        {number(
                          "Height",
                          node.height,
                          (value) =>
                            onChange({
                              height: value,
                              layoutSizing: {
                                ...sizing,
                                width: node.aspectRatioLocked ? "fixed" : sizing.width,
                                height: "fixed",
                              },
                            }),
                          0.000001,
                          undefined,
                          sizeMenu("height"),
                        )}
                      </div>
                      <div className="flex h-6 shrink-0 items-center">
                        {node.kind === "text" ? (
                          <DesignTextSizingControl
                            nodes={[node]}
                            allNodes={nodes}
                            compact
                            onChange={(update) => {
                              const patch = update(node);
                              if (!patch) return false;
                              onChange(patch);
                              return true;
                            }}
                          />
                        ) : (
                          <DesignAspectRatioControl
                            nodes={[node]}
                            allNodes={nodes}
                            onChange={(aspectRatioLocked) => onChange({ aspectRatioLocked })}
                          />
                        )}
                      </div>
                    </div>
                    {["frame", "component", "instance"].includes(node.kind) ? (
                      <label className="flex items-center gap-2 text-xs">
                        <Checkbox
                          aria-label="Clip content"
                          checked={node.clipContent === true}
                          onCheckedChange={(clipContent) => onChange({ clipContent })}
                        />
                        Clip content
                      </label>
                    ) : null}
                    {parentFlows
                      ? choice(
                          "Positioning",
                          sizing.position ?? "flow",
                          ["flow", "absolute"],
                          (position) =>
                            onChange({
                              layoutSizing: {
                                ...sizing,
                                position: position as "flow" | "absolute",
                              },
                            }),
                        )
                      : null}
                    {autoLayout ? (
                      <DesignAutoLayoutPanel
                        model={node.layoutModel}
                        onChange={(layoutModel) => onChange({ layoutModel })}
                      />
                    ) : null}
                    {node.parentId !== null && !inFlow ? (
                      <>
                        {choice(
                          "Horizontal constraint",
                          node.constraints?.horizontal ?? "left",
                          ["left", "right", "left-right", "center", "scale"],
                          (horizontal) =>
                            onChange({
                              constraints: {
                                vertical: node.constraints?.vertical ?? "top",
                                horizontal: horizontal as NonNullable<
                                  DesignNode["constraints"]
                                >["horizontal"],
                              },
                            }),
                        )}
                        {choice(
                          "Vertical constraint",
                          node.constraints?.vertical ?? "top",
                          ["top", "bottom", "top-bottom", "center", "scale"],
                          (vertical) =>
                            onChange({
                              constraints: {
                                horizontal: node.constraints?.horizontal ?? "left",
                                vertical: vertical as NonNullable<
                                  DesignNode["constraints"]
                                >["vertical"],
                              },
                            }),
                        )}
                      </>
                    ) : null}
                  </>,
                )}
                {section(
                  "Appearance",
                  <div className="grid grid-cols-2 gap-2">
                    {number(
                      "Opacity %",
                      node.opacity * 100,
                      (value) => onChange({ opacity: value / 100 }),
                      0,
                      100,
                    )}
                    {node.kind !== "text"
                      ? number(
                          "Radius",
                          node.paint?.radius ?? 0,
                          (radius) => onChange({ paint: { ...node.paint, radius } }),
                          0,
                        )
                      : null}
                  </div>,
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon-xs"
                      variant="ghost-muted"
                      aria-label={
                        node.visible === false ? "Show selected layer" : "Hide selected layer"
                      }
                      onClick={() => onChange({ visible: node.visible === false })}
                    >
                      {node.visible === false ? <EyeOffIcon /> : <EyeIcon />}
                    </Button>
                    <Menu>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <MenuTrigger
                              render={
                                <Button
                                  size="icon-xs"
                                  variant="ghost-muted"
                                  aria-label="Apply blend mode"
                                />
                              }
                            />
                          }
                        >
                          <BlendIcon />
                        </TooltipTrigger>
                        <TooltipPopup>Blend mode: {node.paint?.blendMode ?? "normal"}</TooltipPopup>
                      </Tooltip>
                      <MenuPopup align="end">
                        {[
                          "normal",
                          "darken",
                          "multiply",
                          "color-burn",
                          "lighten",
                          "screen",
                          "color-dodge",
                          "overlay",
                          "soft-light",
                          "hard-light",
                          "difference",
                          "exclusion",
                          "hue",
                          "saturation",
                          "color",
                          "luminosity",
                        ].map((blendMode) => (
                          <MenuItem
                            key={blendMode}
                            onClick={() =>
                              onChange({
                                paint: {
                                  ...node.paint,
                                  blendMode: blendMode as NonNullable<
                                    DesignNode["paint"]
                                  >["blendMode"],
                                },
                              })
                            }
                          >
                            {blendMode
                              .split("-")
                              .map((part) => part[0]!.toUpperCase() + part.slice(1))
                              .join(" ")}
                            {(node.paint?.blendMode ?? "normal") === blendMode ? " ✓" : ""}
                          </MenuItem>
                        ))}
                      </MenuPopup>
                    </Menu>
                  </div>,
                )}
                {node.kind === "image"
                  ? section(
                      "Image",
                      <>
                        {choice(
                          "Image mode",
                          node.image?.mode ?? "fill",
                          ["fill", "fit", "crop", "tile"],
                          (mode) =>
                            onChange({
                              image: {
                                ...node.image,
                                mode: mode as "fill" | "fit" | "crop" | "tile",
                              },
                            }),
                          { fill: "Fill", fit: "Fit", crop: "Crop", tile: "Tile" },
                        )}
                        {["crop", "tile"].includes(node.image?.mode ?? "")
                          ? number(
                              node.image?.mode === "tile" ? "Tile scale %" : "Crop zoom %",
                              (node.image?.scale ?? 1) * 100,
                              (value) => onChange({ image: { ...node.image, scale: value / 100 } }),
                              node.image?.mode === "tile" ? 1 : 100,
                              1000,
                            )
                          : null}
                        {node.image?.mode === "crop" ? (
                          <div className="grid grid-cols-2 gap-2">
                            {number(
                              "Crop X %",
                              node.image.offsetX ?? 0,
                              (offsetX) => onChange({ image: { ...node.image, offsetX } }),
                              -100,
                              100,
                            )}
                            {number(
                              "Crop Y %",
                              node.image.offsetY ?? 0,
                              (offsetY) => onChange({ image: { ...node.image, offsetY } }),
                              -100,
                              100,
                            )}
                          </div>
                        ) : null}
                        <p className="truncate text-2xs text-muted-foreground">
                          {imageAsset?.name ?? "Imported image"}
                          {imageAsset?.width && imageAsset.height
                            ? ` · ${imageAsset.width} × ${imageAsset.height}`
                            : ""}
                        </p>
                        <div className="flex flex-wrap gap-1">
                          <Button size="xs" variant="secondary" onClick={onReplaceImage}>
                            Replace image…
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost-muted"
                            disabled={!imageAsset?.width || !imageAsset.height}
                            onClick={() => {
                              if (imageAsset?.width && imageAsset.height)
                                onChange({
                                  width: imageAsset.width,
                                  height: imageAsset.height,
                                  layoutSizing: {
                                    ...node.layoutSizing,
                                    width: "fixed",
                                    height: "fixed",
                                  },
                                  image: { mode: "fill", scale: 1, offsetX: 0, offsetY: 0 },
                                });
                            }}
                          >
                            Original size
                          </Button>
                        </div>
                      </>,
                    )
                  : null}
                {node.kind === "text" ? (
                  <DesignTypographyPanel
                    showSizing={false}
                    nodes={[node]}
                    allNodes={nodes}
                    propertyLabels={propertyLabels}
                    onChange={(update) => {
                      const patch = update(node);
                      if (!patch) return false;
                      onChange(patch);
                      return true;
                    }}
                  />
                ) : null}
                <DesignPaintPanel node={node} onChange={onChange} />
                <DesignEffectsPanel node={node} onChange={(effects) => onChange({ effects })} />
              </>
            ) : (
              section(
                "Interactions",
                <>
                  {node.kind === "frame" ? (
                    <Button
                      size="xs"
                      variant={startNodeId === node.nodeId ? "secondary" : "ghost-muted"}
                      onClick={() => onSetStart(startNodeId === node.nodeId ? null : node.nodeId)}
                    >
                      {startNodeId === node.nodeId
                        ? "Remove starting point"
                        : "Set as starting point"}
                    </Button>
                  ) : null}
                  <p className="text-2xs leading-5 text-muted-foreground">
                    Connect a layer to a frame, then use Present to test navigation.
                  </p>
                  {(node.interactions ?? []).map((interaction, index) => (
                    <div
                      key={
                        interaction.id ??
                        `${node.nodeId}-${interaction.targetNodeId}-${interaction.trigger}`
                      }
                      className="space-y-2 rounded-lg border border-border p-2"
                    >
                      {choice(
                        "Trigger",
                        interaction.trigger,
                        ["click", "hover", "after-delay", "key-press"],
                        (trigger) =>
                          onChange({
                            interactions: node.interactions!.map((item, i) =>
                              i === index ? { ...item, trigger } : item,
                            ),
                          }),
                      )}
                      {interaction.trigger === "after-delay"
                        ? number(
                            "Delay (ms)",
                            interaction.delayMs ?? 800,
                            (delayMs) =>
                              onChange({
                                interactions: node.interactions!.map((item, i) =>
                                  i === index ? { ...item, delayMs } : item,
                                ),
                              }),
                            0,
                          )
                        : null}
                      {interaction.trigger === "key-press" ? (
                        <label className="grid gap-1 text-2xs text-muted-foreground">
                          Key
                          <Input
                            size="sm"
                            value={interaction.key ?? ""}
                            placeholder="Enter"
                            onChange={(event) =>
                              onChange({
                                interactions: node.interactions!.map((item, i) =>
                                  i === index ? { ...item, key: event.target.value } : item,
                                ),
                              })
                            }
                          />
                        </label>
                      ) : null}
                      {choice(
                        "Action",
                        interaction.action,
                        [
                          "navigate",
                          "back",
                          "open-overlay",
                          "swap-overlay",
                          "close-overlay",
                          "open-url",
                        ],
                        (action) =>
                          onChange({
                            interactions: node.interactions!.map((item, i) =>
                              i === index ? { ...item, action } : item,
                            ),
                          }),
                        {
                          navigate: "Navigate to",
                          back: "Back",
                          "open-overlay": "Open overlay",
                          "swap-overlay": "Swap overlay",
                          "close-overlay": "Close overlay",
                          "open-url": "Open link",
                        },
                      )}
                      {interaction.action === "open-url" ? (
                        <label className="grid gap-1 text-2xs text-muted-foreground">
                          URL
                          <Input
                            size="sm"
                            type="url"
                            value={interaction.url ?? ""}
                            placeholder="https://"
                            onChange={(event) =>
                              onChange({
                                interactions: node.interactions!.map((item, i) =>
                                  i === index ? { ...item, url: event.target.value } : item,
                                ),
                              })
                            }
                          />
                        </label>
                      ) : null}
                      {["navigate", "open-overlay", "swap-overlay"].includes(interaction.action) ? (
                        <>
                          {choice(
                            "Destination",
                            interaction.targetNodeId ?? "",
                            nodes
                              .filter((item) => item.kind === "frame")
                              .map((item) => item.nodeId),
                            (targetNodeId) =>
                              onChange({
                                interactions: node.interactions!.map((item, i) =>
                                  i === index ? { ...item, targetNodeId } : item,
                                ),
                              }),
                            Object.fromEntries(
                              nodes
                                .filter((item) => item.kind === "frame")
                                .map((item) => [item.nodeId, item.name]),
                            ),
                          )}
                          {choice(
                            "Transition",
                            interaction.transition ?? "instant",
                            ["instant", "dissolve", "slide-left", "slide-right"],
                            (transition) =>
                              onChange({
                                interactions: node.interactions!.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        transition: transition as
                                          | "instant"
                                          | "dissolve"
                                          | "slide-left"
                                          | "slide-right",
                                      }
                                    : item,
                                ),
                              }),
                          )}
                          {interaction.transition && interaction.transition !== "instant"
                            ? number(
                                "Duration (ms)",
                                interaction.durationMs ?? 200,
                                (durationMs) =>
                                  onChange({
                                    interactions: node.interactions!.map((item, i) =>
                                      i === index ? { ...item, durationMs } : item,
                                    ),
                                  }),
                                0,
                                10000,
                              )
                            : null}
                        </>
                      ) : null}
                      {["open-overlay", "swap-overlay"].includes(interaction.action)
                        ? (() => {
                            const overlay = interaction.overlay ?? {};
                            const changeOverlay = (
                              update: Partial<NonNullable<typeof interaction.overlay>>,
                            ) =>
                              onChange({
                                interactions: node.interactions!.map((item, i) =>
                                  i === index
                                    ? { ...item, overlay: { ...overlay, ...update } }
                                    : item,
                                ),
                              });
                            return (
                              <div className="space-y-2 border-t border-border/60 pt-2">
                                {choice(
                                  "Overlay position",
                                  overlay.position ?? "center",
                                  [
                                    "center",
                                    "top-left",
                                    "top-center",
                                    "top-right",
                                    "bottom-left",
                                    "bottom-center",
                                    "bottom-right",
                                    "manual",
                                  ],
                                  (position) =>
                                    changeOverlay({
                                      position: position as NonNullable<typeof overlay.position>,
                                    }),
                                  {
                                    center: "Center",
                                    "top-left": "Top left",
                                    "top-center": "Top center",
                                    "top-right": "Top right",
                                    "bottom-left": "Bottom left",
                                    "bottom-center": "Bottom center",
                                    "bottom-right": "Bottom right",
                                    manual: "Manual",
                                  },
                                )}
                                {overlay.position === "manual" ? (
                                  <div className="grid grid-cols-2 gap-2">
                                    {number("Overlay X", overlay.x ?? 0, (x) =>
                                      changeOverlay({ x }),
                                    )}
                                    {number("Overlay Y", overlay.y ?? 0, (y) =>
                                      changeOverlay({ y }),
                                    )}
                                  </div>
                                ) : null}
                                <label className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                                  <span>Close when clicking outside</span>
                                  <Switch
                                    checked={overlay.dismissOnOutside ?? true}
                                    onCheckedChange={(dismissOnOutside) =>
                                      changeOverlay({ dismissOnOutside })
                                    }
                                  />
                                </label>
                                <label className="flex items-center justify-between gap-2 text-2xs text-muted-foreground">
                                  <span>Background behind overlay</span>
                                  <Switch
                                    checked={overlay.background ?? true}
                                    onCheckedChange={(background) => changeOverlay({ background })}
                                  />
                                </label>
                                {overlay.background !== false ? (
                                  <div className="grid grid-cols-2 gap-2">
                                    <label className="grid gap-1 text-2xs text-muted-foreground">
                                      Backdrop color
                                      <Input
                                        size="sm"
                                        value={overlay.backgroundColor ?? "#000000"}
                                        onChange={(event) =>
                                          changeOverlay({ backgroundColor: event.target.value })
                                        }
                                      />
                                    </label>
                                    {number(
                                      "Backdrop opacity %",
                                      (overlay.backgroundOpacity ?? 0.3) * 100,
                                      (value) => changeOverlay({ backgroundOpacity: value / 100 }),
                                      0,
                                      100,
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })()
                        : null}
                      <Button
                        size="xs"
                        variant="ghost-muted"
                        onClick={() =>
                          onChange({
                            interactions: node.interactions!.filter((_, i) => i !== index),
                          })
                        }
                      >
                        Remove interaction
                      </Button>
                    </div>
                  ))}
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => {
                      let id: string;
                      do {
                        id = `${node.nodeId}-interaction-${++interactionSequence.current}`;
                      } while (node.interactions?.some((item) => item.id === id));
                      onChange({
                        interactions: [
                          ...(node.interactions ?? []),
                          {
                            id,
                            trigger: "click",
                            action: "navigate",
                            transition: "instant",
                            targetNodeId:
                              nodes.find(
                                (item) => item.kind === "frame" && item.nodeId !== node.nodeId,
                              )?.nodeId ?? null,
                          },
                        ],
                      });
                    }}
                  >
                    Add interaction
                  </Button>
                </>,
              )
            )}
          </fieldset>
        ) : selectionCount > 1 && tab === "design" ? (
          <DesignMultiInspector
            nodes={selectedNodes}
            allNodes={nodes}
            onChange={onChangeMany}
            onAlign={onAlign}
            propertyLabels={propertyLabels}
            canAlign={canAlign}
            onDistribute={onDistribute}
            onFlip={onFlip}
            onRotate={onRotate}
            canTransform={canTransform}
          />
        ) : selectionCount === 0 && tab === "prototype" ? (
          <>
            {section(
              "Prototype settings",
              <>
                {choice(
                  "Device frame",
                  prototypeSettings.device ?? "none",
                  ["none", "phone", "tablet", "browser"],
                  (device) =>
                    onPrototypeSettings({
                      device: device as NonNullable<DesignPrototypeSettings["device"]>,
                    }),
                  { none: "None", phone: "Phone", tablet: "Tablet", browser: "Browser" },
                )}
                {choice(
                  "Playback scale",
                  prototypeSettings.scale ?? "fit",
                  ["fit", "actual"],
                  (scale) => onPrototypeSettings({ scale: scale as "fit" | "actual" }),
                  { fit: "Fit to window", actual: "Actual size" },
                )}
                <label className="grid gap-1 text-2xs text-muted-foreground">
                  Presentation background
                  <Input
                    size="sm"
                    value={prototypeSettings.background ?? "#e5e7eb"}
                    onChange={(event) => onPrototypeSettings({ background: event.target.value })}
                  />
                </label>
              </>,
            )}
            {section(
              "Viewport",
              <>
                <p className="text-2xs leading-5 text-muted-foreground">
                  Uses the current frame size unless you set a custom viewport.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {number(
                    "Viewport width",
                    prototypeSettings.viewportWidth,
                    (viewportWidth) => onPrototypeSettings({ viewportWidth }),
                    1,
                    16384,
                  )}
                  {number(
                    "Viewport height",
                    prototypeSettings.viewportHeight,
                    (viewportHeight) => onPrototypeSettings({ viewportHeight }),
                    1,
                    16384,
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="xs"
                    variant="ghost-muted"
                    onClick={() =>
                      onPrototypeSettings({ viewportWidth: undefined, viewportHeight: undefined })
                    }
                  >
                    Use frame size
                  </Button>
                  {prototypeSettings.viewportWidth && prototypeSettings.viewportHeight ? (
                    <Button
                      size="xs"
                      variant="ghost-muted"
                      onClick={() =>
                        onPrototypeSettings({
                          viewportWidth: prototypeSettings.viewportHeight,
                          viewportHeight: prototypeSettings.viewportWidth,
                        })
                      }
                    >
                      Rotate
                    </Button>
                  ) : null}
                </div>
              </>,
            )}
            {section(
              "Flow starting point",
              choice(
                "Start frame",
                startNodeId ?? "",
                ["", ...pageFrames.map((frame) => frame.nodeId)],
                (id) => onSetStart(id || null),
                {
                  "": "First frame",
                  ...Object.fromEntries(pageFrames.map((frame) => [frame.nodeId, frame.name])),
                },
              ),
            )}
          </>
        ) : (
          section(
            "Canvas",
            <div className="space-y-2">
              <p className="text-2xs leading-5 text-muted-foreground">
                Page-level settings apply when no layer is selected.
              </p>
              {page.background ? (
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <DesignInspectorColor
                      label="Canvas background"
                      value={page.background}
                      onChange={(background) => onPageChange({ background })}
                    />
                  </div>
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label="Remove canvas background"
                    onClick={() => onPageChange({ background: undefined })}
                  >
                    <MinusIcon />
                  </Button>
                </div>
              ) : (
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => onPageChange({ background: "#1f232b" })}
                >
                  Add canvas background
                </Button>
              )}
            </div>,
          )
        )}
        {provenance
          ? section(
              "Source",
              <div className="space-y-1 text-2xs text-muted-foreground">
                <p className="truncate">{provenance.route}</p>
                <p>
                  {provenance.mode} · {provenance.colorScheme}
                </p>
              </div>,
            )
          : null}
      </div>
    </aside>
  );
}

type DesignWorkspaceProps = {
  readonly documentId?: string;
  readonly shellIntegrated?: boolean;
  readonly syncTarget?: {
    readonly environmentId: EnvironmentId;
    readonly cwd: string;
    readonly relativePath: string;
  } | null;
};

export function DesignWorkspace({
  documentId,
  shellIntegrated = false,
  syncTarget = null,
}: DesignWorkspaceProps) {
  const storage = useDesignDocument(documentId);
  const navigate = useNavigate();
  const [showTrash, setShowTrash] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const openDocument = (id: string) => navigate({ to: "/design", search: { documentId: id } });
  const run = (action: () => Promise<unknown>) => {
    if (working) return;
    setWorking(true);
    setActionError(null);
    void action().then(
      () => setWorking(false),
      (error: unknown) => {
        setActionError(error instanceof Error ? error.message : "The file could not be saved.");
        setWorking(false);
      },
    );
  };
  const saveError = [...storage.errors.entries()][0];
  const document = storage.document;
  const downloadFile = async (file: DesignDocument) => {
    const contents = await serializeDesignFile(file);
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = `${file.title}.design.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const trashDialog = (
    <Dialog open={showTrash} onOpenChange={setShowTrash}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Recently deleted</DialogTitle>
          <DialogDescription>Files stay on this device until you restore them.</DialogDescription>
        </DialogHeader>
        <DialogPanel>
          {storage.trashed.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deleted files.</p>
          ) : (
            <ul className="space-y-2">
              {storage.trashed.map((file) => (
                <li key={file.documentId} className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm">{file.title}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={working}
                    onClick={() =>
                      run(async () => {
                        await storage.setTrashed(file.documentId, false);
                        setShowTrash(false);
                        await openDocument(file.documentId);
                      })
                    }
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  );
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      {saveError ? (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs"
          role="alert"
        >
          <p className="min-w-0 flex-1">
            {saveError[1].message} Your latest changes have not been saved.
          </p>
          {!saveError[1].conflict ? (
            <Button
              size="xs"
              variant="secondary"
              disabled={working}
              onClick={() => {
                setActionError(null);
                storage.retry(saveError[0]);
              }}
            >
              Retry saving
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="secondary"
            disabled={working}
            onClick={() =>
              run(async () => {
                const copy = await storage.recoverCopy(saveError[0]);
                await openDocument(copy.documentId);
              })
            }
          >
            Save recovery copy
          </Button>
          <Button
            size="xs"
            variant="ghost"
            disabled={working}
            onClick={() =>
              run(async () => {
                const file = storage.records.find(
                  (record) => record.document.documentId === saveError[0],
                )?.document;
                if (!file) return;
                await downloadFile(file);
              })
            }
          >
            Download recovery file
          </Button>
        </div>
      ) : null}
      {actionError && !saveError ? (
        <p role="alert" className="shrink-0 border-b px-4 py-2 text-xs text-destructive">
          {actionError}
        </p>
      ) : null}
      {storage.phase !== "ready" ? (
        <div className="m-auto space-y-3 p-8 text-center">
          <p
            role={storage.phase === "error" ? "alert" : "status"}
            className="text-sm text-muted-foreground"
          >
            {storage.loadError ?? "Opening local Design files…"}
          </p>
          {storage.phase === "error" ? (
            <Button variant="secondary" size="sm" onClick={() => run(storage.reload)}>
              Try again
            </Button>
          ) : null}
        </div>
      ) : document ? (
        <div className="min-h-0 flex-1" inert={working}>
          <DesignEditor
            key={document.documentId}
            document={document}
            storage={storage}
            shellIntegrated={shellIntegrated}
            syncTarget={syncTarget}
            onOpenTrash={() => setShowTrash(true)}
            onOpenFile={() => fileInput.current?.click()}
            onDownload={() => run(() => downloadFile(document))}
            onTrash={() =>
              run(async () => {
                await storage.setTrashed(document.documentId, true);
                await navigate({ to: "/design", search: {} });
              })
            }
          />
        </div>
      ) : (
        <div className="m-auto max-w-md space-y-4 p-8 text-center">
          <h1 className="text-lg font-semibold">
            {documentId ? "This Design file is unavailable" : "Your Design files"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {documentId
              ? "It may have been deleted or saved on another device. Open a local file or check Recently deleted."
              : "Create a file to start designing."}
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              disabled={working}
              onClick={() =>
                run(async () => {
                  const file = await storage.createDocument();
                  await openDocument(file.documentId);
                })
              }
            >
              New design document
            </Button>
            <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
              Open Design file…
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setShowTrash(true)}>
              Recently deleted
            </Button>
          </div>
          {storage.documents.map((file) => (
            <Button
              key={file.documentId}
              variant="ghost"
              size="sm"
              onClick={() => void openDocument(file.documentId)}
            >
              {file.title}
            </Button>
          ))}
        </div>
      )}
      <input
        type="file"
        ref={fileInput}
        className="hidden"
        accept="application/json,.design.json"
        aria-label="Design document file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          run(async () => {
            const imported = await deserializeDesignFile(await file.text());
            const saved = await storage.importDocument(imported);
            await openDocument(saved.documentId);
          });
        }}
      />
      {trashDialog}
    </div>
  );
}

function DesignEditor({
  document,
  storage,
  shellIntegrated,
  syncTarget,
  onOpenTrash,
  onOpenFile,
  onDownload,
  onTrash,
}: {
  readonly document: DesignDocument;
  readonly storage: ReturnType<typeof useDesignDocument>;
  readonly shellIntegrated: boolean;
  readonly syncTarget: NonNullable<DesignWorkspaceProps["syncTarget"]> | null;
  readonly onOpenTrash: () => void;
  readonly onOpenFile: () => void;
  readonly onDownload: () => void;
  readonly onTrash: () => void;
}) {
  const { setDocument, documents, createDocument } = storage;
  const navigate = useNavigate();
  const projects = useProjects();
  const { environments } = useEnvironments();
  const [designChromeActions, setDesignChromeActions] = useState<HTMLElement | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- The external app shell mounts the Design action slot beside this workspace.
  useEffect(() => {
    if (!shellIntegrated) return;
    // oxlint-disable-next-line react/set-state-in-effect -- The portal target is owned by the external shell and is only available after mount.
    setDesignChromeActions(
      window.document.querySelector<HTMLElement>("[data-design-chrome-actions]"),
    );
    return () => setDesignChromeActions(null);
  }, [shellIntegrated]);
  const [selection, setSelection] = useState<{
    ids: readonly string[];
    origin: DesignRotationOrigin | null;
  }>(() => {
    const firstNode = nodeForPage(document)[0];
    return { ids: firstNode ? [firstNode.nodeId] : [], origin: null };
  });
  const selectedNodeIds = selection.ids;
  const setSelectedNodeIds = (
    update: readonly string[] | ((current: readonly string[]) => readonly string[]),
  ) => {
    setSelection((current) => {
      const ids = typeof update === "function" ? update(current.ids) : update;
      const selected = new Set(ids);
      return ids.length === current.ids.length && current.ids.every((id) => selected.has(id))
        ? current
        : { ids, origin: null };
    });
  };
  const [rotationOriginVisible, setRotationOriginVisible] = useState(false);
  const { copyToClipboard } = useCopyToClipboard({ target: "design export" });
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [designTool, setDesignTool] = useState<DesignTool>("select");
  const [propertyLabels, setPropertyLabels] = useState(false);
  const [reactPasteOpen, setReactPasteOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [renamingDocument, setRenamingDocument] = useState(false);
  const [documentTitle, setDocumentTitle] = useState(document.title);
  const cancelDocumentRename = useRef(false);
  const [presenting, setPresenting] = useState<string | null>(null);
  const documentRef = useRef(document);
  const [history, setHistory] = useState<ReadonlyArray<DesignDocument>>([]);
  const [future, setFuture] = useState<ReadonlyArray<DesignDocument>>([]);
  const propertyEditStart = useRef<{ initial: DesignDocument; recorded: boolean } | null>(null);
  const commitDocument = (next: DesignDocument, remember = true) => {
    const current = documentRef.current;
    if (next === current) return;
    if (remember) {
      const transaction = propertyEditStart.current;
      if (!transaction || !transaction.recorded) {
        setHistory((items) => [...items.slice(-49), transaction?.initial ?? current]);
        setFuture([]);
        if (transaction) transaction.recorded = true;
      }
    }
    documentRef.current = next;
    setDocument(next);
  };
  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    const current = documentRef.current;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [...items, current]);
    const restored = restoreDesignContent(current, previous);
    documentRef.current = restored;
    setDocument(restored);
  };
  const redo = () => {
    const next = future.at(-1);
    if (!next) return;
    const current = documentRef.current;
    setFuture((items) => items.slice(0, -1));
    setHistory((items) => [...items, current]);
    const restored = restoreDesignContent(current, next);
    documentRef.current = restored;
    setDocument(restored);
  };
  const syncInput = syncTarget
    ? {
        environmentId: syncTarget.environmentId,
        input: { cwd: syncTarget.cwd, relativePath: syncTarget.relativePath },
      }
    : null;
  const serverRead = useEnvironmentQuery(
    syncInput === null ? null : serverEnvironment.designRead(syncInput),
  );
  const serverPackageResult = decodeServerDesignPackage(serverRead.data?.contents);
  const serverPackage = serverPackageResult.status === "valid" ? serverPackageResult.package : null;
  const serverDocument = serverPackage?.document ?? null;
  const sync = useAtomCommand(serverEnvironment.designSync, { reportFailure: false });
  const captureServerDesignSnapshot = useAtomCommand(
    serverEnvironment.previewCaptureDesignSnapshot,
    "design source refresh",
  );
  const replacingAsset = useRef<{ assetId: string } | { nodeId: string } | null>(null);
  const [imageQueue, setImageQueue] = useState<readonly DesignImagePlacement[]>([]);
  const [importingImages, setImportingImages] = useState(false);
  const placementGeneration = useRef(0);
  const imageImports = useRef(Promise.resolve());
  const assetInputRef = useRef<HTMLInputElement | null>(null);
  const selectedNodeMap = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const selectedNodes = selectedNodeIds.flatMap((id) => selectedNodeMap.get(id) ?? []);
  const selectedNode = selectedNodes[0] ?? null;
  const selectedNodeId = selectedNode?.nodeId ?? null;
  const activePage =
    document.pages.find((page) => page.pageId === document.activePageId) ?? document.pages[0]!;
  const alignableRoots = selectionRoots(document, selectedNodeIds).filter(
    (node) =>
      !isDesignNodeLocked(document, node.nodeId, selectedNodeMap) &&
      !isDesignNodeInFlow(document, node.nodeId, selectedNodeMap),
  );
  const canAlignSelection =
    alignableRoots.length > 1 ||
    (alignableRoots.length === 1 && alignableRoots[0]!.parentId !== null);
  const selectedConflict =
    document.conflicts.find((conflict) => conflict.nodeId === selectedNodeId) ?? null;
  const activeConflict =
    selectedConflict ?? document.conflicts.find((conflict) => conflict.nodeId === null) ?? null;
  const clipboard = useRef<string | null>(null);
  const copyLayers = async (cut = false) => {
    const selection = copyDesignSelection(documentRef.current, selectedNodeIds);
    if (!selection) return;
    let text;
    try {
      text = await portableDesignSelection(selection);
    } catch (error) {
      setSyncMessage(
        error instanceof Error ? error.message : "Could not package the selected images",
      );
      return;
    }
    clipboard.current = text;
    let copiedExternally = false;
    try {
      await navigator.clipboard.writeText(text);
      copiedExternally = true;
    } catch {
      setSyncMessage("Layers copied inside this document");
    }
    if (cut && copiedExternally) {
      commitDocument(deleteDesignNodes(documentRef.current, selectedNodeIds));
      setSelectedNodeIds([]);
    }
  };
  const pasteLayers = async () => {
    let text = clipboard.current;
    try {
      text = await navigator.clipboard.readText();
    } catch {
      /* The in-editor clipboard remains usable without browser clipboard permission. */
    }
    if (!text) return;
    const selection = readDesignSelection(text);
    let source;
    let ids;
    if (selection) {
      try {
        source = await restoreDesignPackageAssets(
          selection.document,
          selection.assetPayloads ?? [],
        );
      } catch (error) {
        setSyncMessage(
          error instanceof Error ? error.message : "Could not restore the pasted images",
        );
        return;
      }
      ids = selection.nodeIds;
    } else if (text.trimStart().startsWith("<")) {
      try {
        source = await materializeDesignDocumentImages(
          await createDesignDocumentFromMarkup({ markup: text, mode: "html" }),
        );
        ids = nodeForPage(source).map((node) => node.nodeId);
      } catch (error) {
        setSyncMessage(error instanceof Error ? error.message : "Could not paste markup");
        return;
      }
    } else {
      setSyncMessage("Copy layers from Design, or use Open in Canvas to import a screen");
      return;
    }
    const current = documentRef.current;
    const next = pasteDesignNodes(current, source, ids);
    commitDocument(next);
    setSelectedNodeIds(
      nodeForPage(next)
        .filter((node) => !current.nodes.some((item) => item.nodeId === node.nodeId))
        .map((node) => node.nodeId),
    );
  };
  const onCanvasKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const modifier = event.metaKey || event.ctrlKey;
    const flipAxis = flipShortcutAxis(event);
    if (flipAxis) {
      event.preventDefault();
      event.stopPropagation();
      commitDocument(flipDesignSelection(documentRef.current, selectedNodeIds, flipAxis));
      return;
    }
    if (modifier && ["c", "x", "v"].includes(event.key.toLowerCase())) {
      event.preventDefault();
      event.stopPropagation();
      if (event.key.toLowerCase() === "v") void pasteLayers();
      else void copyLayers(event.key.toLowerCase() === "x");
      return;
    }
    if (modifier && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey) redo();
      else undo();
      return;
    }
    if (modifier && event.key.toLowerCase() === "d") {
      event.preventDefault();
      const before = documentRef.current;
      const next = duplicateDesignNodes(before, selectedNodeIds);
      commitDocument(next);
      const originalIds = new Set(before.nodes.map((node) => node.nodeId));
      setSelectedNodeIds(
        selectionRoots(
          next,
          next.nodes.filter((node) => !originalIds.has(node.nodeId)).map((node) => node.nodeId),
        ).map((node) => node.nodeId),
      );
      return;
    }
    if (modifier && event.key.toLowerCase() === "g") {
      event.preventDefault();
      if (event.shiftKey) {
        let next = documentRef.current;
        for (const id of selectedNodeIds) next = ungroupDesignNode(next, id);
        commitDocument(next);
        setSelectedNodeIds([]);
      } else {
        const current = documentRef.current;
        const next = groupDesignNodes(current, selectedNodeIds);
        commitDocument(next);
        if (next !== current) setSelectedNodeIds([next.nodes.at(-1)!.nodeId]);
      }
      return;
    }
    if (modifier && event.key.toLowerCase() === "a") {
      event.preventDefault();
      setSelectedNodeIds(
        nodeForPage(documentRef.current)
          .filter(
            (node) =>
              !isDesignNodeLocked(documentRef.current, node.nodeId) && node.visible !== false,
          )
          .map((node) => node.nodeId),
      );
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      commitDocument(deleteDesignNodes(documentRef.current, selectedNodeIds));
      setSelectedNodeIds([]);
      return;
    }
    if (modifier && (event.key === "[" || event.key === "]")) {
      event.preventDefault();
      const id = selectedNodeIds[0];
      if (id)
        commitDocument(
          reorderDesignNode(documentRef.current, id, event.key === "[" ? "up" : "down"),
        );
      return;
    }
    const shifts: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const shift = shifts[event.key];
    if (!shift) return;
    event.preventDefault();
    let next = documentRef.current;
    const distance = event.shiftKey ? 10 : 1;
    for (const node of selectionRoots(next, selectedNodeIds)) {
      if (isDesignNodeLocked(next, node.nodeId) || isDesignNodeInFlow(next, node.nodeId)) continue;
      next = updateDesignNode(next, node.nodeId, {
        x: node.x + shift[0] * distance,
        y: node.y + shift[1] * distance,
      });
    }
    commitDocument(next);
  };

  const updateNode = (update: Partial<DesignNode>) => {
    if (!selectedNode || selectedNodeIds.length !== 1) return;
    const current = documentRef.current;
    const origin = resolveDesignRotationOrigin(current, selectedNodeIds, selection.origin);
    commitDocument(
      origin && update.rotation !== undefined && Object.keys(update).length === 1
        ? setDesignNodeRotation(current, selectedNode.nodeId, update.rotation, origin)
        : updateDesignNode(current, selectedNode.nodeId, update),
    );
  };
  const updateMany = (update: (node: DesignNode) => Partial<DesignNode> | null) => {
    const current = documentRef.current;
    const selected = new Set(selectedNodeIds);
    const changes = new Map<string, Partial<DesignNode>>();
    for (const node of current.nodes) {
      if (!selected.has(node.nodeId)) continue;
      const patch = update(node);
      if (patch === null) return false;
      changes.set(node.nodeId, patch);
    }
    const origin = resolveDesignRotationOrigin(current, selectedNodeIds, selection.origin);
    const onlyRotation = [...changes.values()].every(
      (patch) => Object.keys(patch).length === 1 && patch.rotation !== undefined,
    );
    if (origin && onlyRotation) {
      if ([...changes.values()].some((patch) => !Number.isFinite(patch.rotation))) return false;
      commitDocument(
        setDesignNodeRotations(
          current,
          new Map([...changes].map(([id, patch]) => [id, patch.rotation!])),
          origin,
        ),
      );
    } else commitDocument(updateDesignNodes(current, changes));
    return true;
  };
  const resolveConflict = (resolution: "keep-local" | "use-server" | "duplicate-node") => {
    if (!activeConflict) return;
    commitDocument(resolveDesignConflict(document, activeConflict, resolution));
  };
  const selectNode = (nodeId: string, additive: boolean) => {
    setSelectedNodeIds((current) => {
      if (!additive) return [nodeId];
      return current.includes(nodeId)
        ? current.filter((candidate) => candidate !== nodeId)
        : [...current, nodeId];
    });
  };
  const renameNode = (nodeId: string, name: string) => {
    commitDocument(renameDesignNode(documentRef.current, nodeId, name));
  };
  const layerAction = (nodeId: string, action: string) => {
    const current = documentRef.current;
    const ids = selectedNodeIds.includes(nodeId) ? selectedNodeIds : [nodeId];
    if (action === "flip-horizontal" || action === "flip-vertical")
      commitDocument(
        flipDesignSelection(current, ids, action === "flip-horizontal" ? "horizontal" : "vertical"),
      );
    if (action === "delete") {
      commitDocument(deleteDesignNodes(current, ids));
      setSelectedNodeIds([]);
    }
    if (action === "duplicate") {
      const next = duplicateDesignNodes(current, ids);
      commitDocument(next);
      if (next !== current) {
        const existing = new Set(current.nodes.map((node) => node.nodeId));
        const added = new Set(
          next.nodes.filter((node) => !existing.has(node.nodeId)).map((node) => node.nodeId),
        );
        setSelectedNodeIds(
          next.nodes
            .filter(
              (node) => added.has(node.nodeId) && (!node.parentId || !added.has(node.parentId)),
            )
            .map((node) => node.nodeId),
        );
      }
    }
    if (action === "up" || action === "down")
      commitDocument(reorderDesignNode(current, nodeId, action));
    if (action === "group") {
      const next = groupDesignNodes(current, ids);
      commitDocument(next);
      if (next !== current) setSelectedNodeIds([next.nodes.at(-1)!.nodeId]);
    }
    if (action === "ungroup") {
      commitDocument(ungroupDesignNode(current, nodeId));
      setSelectedNodeIds([]);
    }
    if (action === "detach") commitDocument(detachDesignInstance(current, nodeId));
  };
  const toggleNodeVisibility = (nodeId: string) => {
    const node = documentRef.current.nodes.find((candidate) => candidate.nodeId === nodeId);
    if (node)
      commitDocument(
        updateDesignNode(documentRef.current, nodeId, { visible: node.visible === false }),
      );
  };
  const toggleNodeLock = (nodeId: string) => {
    const node = documentRef.current.nodes.find((candidate) => candidate.nodeId === nodeId);
    if (node?.parentId && isDesignNodeLocked(documentRef.current, node.parentId)) return;
    if (node)
      commitDocument(
        updateDesignNode(documentRef.current, nodeId, { locked: node.locked !== true }),
      );
  };
  const insertInstance = (componentId?: string) => {
    const current = documentRef.current;
    const selected =
      selectedNodeIds.length === 1
        ? current.nodes.find((node) => node.nodeId === selectedNodeIds[0])
        : null;
    const source = componentId ?? (selected?.kind === "component" ? selected.nodeId : undefined);
    let parentId = designInsertionParent(current, selectedNodeIds);
    if (parentId === source)
      parentId = current.nodes.find((node) => node.nodeId === source)?.parentId ?? null;
    const next = addInstanceNode(current, source, parentId);
    if (next === current) {
      setSyncMessage("Choose an unlocked frame outside this component to insert an instance.");
      return;
    }
    commitDocument(next);
    const ids = new Set(current.nodes.map((node) => node.nodeId));
    const instance = next.nodes.find((node) => node.kind === "instance" && !ids.has(node.nodeId));
    if (instance) setSelectedNodeIds([instance.nodeId]);
  };
  const openAssetPicker = (target: { assetId: string } | { nodeId: string } | null = null) => {
    replacingAsset.current = target;
    const input = assetInputRef.current;
    if (!input) return;
    input.multiple = target === null;
    input.click();
  };
  const cancelImagePlacement = () => {
    placementGeneration.current += 1;
    setImageQueue([]);
  };
  const stageAsset = async (assetId: string) => {
    const generation = ++placementGeneration.current;
    const current = documentRef.current;
    const asset = current.assets.find((item) => item.assetId === assetId);
    if (!asset) return;
    let dimensions =
      asset.width && asset.height && asset.width > 0 && asset.height > 0
        ? { width: asset.width, height: asset.height }
        : null;
    if (!dimensions) {
      const blob = await readDesignAsset(assetId);
      if (!blob) throw new Error("This local image is missing. Replace it before placing it.");
      dimensions = await readImageDimensions(blob);
      commitDocument(addAssetMeta(documentRef.current, { ...asset, ...dimensions }));
    }
    if (generation !== placementGeneration.current) return;
    setImageQueue([{ assetId, name: asset.name, ...dimensions }]);
    setSelectedNodeIds([]);
  };
  const placeImages = (images: readonly DesignImagePlacement[], target: DesignImageTarget) => {
    let next = documentRef.current;
    if (
      next.activePageId !== target.pageId ||
      (target.parentId !== null &&
        (!next.nodes.some((node) => node.nodeId === target.parentId) ||
          isDesignNodeLocked(next, target.parentId)))
    ) {
      setSyncMessage("The target changed. Choose a new place on the canvas.");
      return false;
    }
    const ids: string[] = [];
    for (const [index, image] of images.entries()) {
      next = addImageNode(next, image.assetId, null, {
        x: target.worldX + index * 24,
        y: target.worldY + index * 24,
        width: image.width,
        height: image.height,
        name: image.name,
      });
      const id = next.nodes.at(-1)!.nodeId;
      if (target.parentId) next = reparentDesignNode(next, id, target.parentId);
      ids.push(id);
    }
    commitDocument(next);
    setSelectedNodeIds(ids);
    return true;
  };
  const processImages = async (
    files: readonly File[],
    replacement: { assetId: string } | { nodeId: string } | null,
    generation: number,
    target?: DesignImageTarget,
  ) => {
    if (files.length === 0) return;
    setImportingImages(true);
    const staged: DesignImagePlacement[] = [];
    const failures: string[] = [];
    for (const file of replacement ? files.slice(0, 1) : files) {
      try {
        const metadata = await prepareDesignImage(file);
        const current = documentRef.current;
        const placement = {
          assetId: metadata.assetId,
          name: metadata.name,
          width: metadata.width!,
          height: metadata.height!,
        };
        if (replacement && "assetId" in replacement) {
          commitDocument(replaceDesignAsset(current, replacement.assetId, metadata));
          setImageQueue((items) =>
            items.map((item) => (item.assetId === replacement.assetId ? placement : item)),
          );
        } else {
          const existing = current.assets.find((asset) => asset.assetId === metadata.assetId);
          const next = addAssetMeta(
            current,
            existing ? { ...existing, width: metadata.width, height: metadata.height } : metadata,
          );
          if (replacement && "nodeId" in replacement) {
            commitDocument(
              updateDesignNode(next, replacement.nodeId, {
                assetId: metadata.assetId,
                sourceUrl: undefined,
              }),
            );
          } else {
            commitDocument(next);
            staged.push(placement);
          }
        }
      } catch (error) {
        failures.push(
          `${file.name}: ${error instanceof Error ? error.message : "Could not read this image"}`,
        );
      }
    }
    setImportingImages(false);
    let deferredPlacement = false;
    if (generation === placementGeneration.current && staged.length) {
      if (!target || !placeImages(staged, target)) {
        deferredPlacement = target !== undefined;
        setImageQueue((items) => [...items, ...staged]);
        setSelectedNodeIds([]);
      }
    }
    if (failures.length || (generation === placementGeneration.current && !deferredPlacement))
      setSyncMessage(failures.length ? `Could not import ${failures.join("; ")}` : null);
  };
  const importImages = (
    files: readonly File[],
    replacement: { assetId: string } | { nodeId: string } | null,
    target?: DesignImageTarget,
  ) => {
    const generation = placementGeneration.current;
    const job = imageImports.current.then(() =>
      processImages(files, replacement, generation, target),
    );
    imageImports.current = job.catch(() => undefined);
    return job;
  };
  const importAsset = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    const replacement = replacingAsset.current;
    replacingAsset.current = null;
    return importImages(files, replacement);
  };
  const syncDocument = async () => {
    if (syncTarget === null || syncing) return;
    setSyncing(true);
    setSyncMessage(null);
    const syncBase = documentRef.current;
    commitDocument({ ...documentRef.current, syncState: "syncing" }, false);
    let assetPayloads;
    try {
      assetPayloads = await packageDesignAssets(syncBase);
    } catch (error) {
      setSyncing(false);
      commitDocument({ ...documentRef.current, syncState: "offline" }, false);
      setSyncMessage(
        error instanceof Error ? error.message : "Could not prepare local assets for sync",
      );
      return;
    }
    const result = await sync({
      environmentId: syncTarget.environmentId,
      input: {
        cwd: syncTarget.cwd,
        relativePath: syncTarget.relativePath,
        request: createDesignSyncRequest(syncBase, assetPayloads),
      },
    });
    setSyncing(false);
    if (result._tag === "Success") {
      const next = applyDesignSyncResult(documentRef.current, result.value);
      commitDocument(next, false);
      setSyncMessage(
        result.value._tag === "conflict"
          ? "Resolve the conflicts before syncing again"
          : next.pendingOperations.length > 0
            ? "Submitted changes saved; newer local edits are waiting to sync"
            : "Synced to the connected environment",
      );
      return;
    }
    commitDocument({ ...documentRef.current, syncState: "offline" }, false);
    setSyncMessage("Could not reach the connected environment");
  };
  const pasteMarkup = async () => {
    if (!navigator.clipboard) {
      setSyncMessage("Clipboard access is unavailable in this browser");
      return;
    }
    try {
      const markup = await navigator.clipboard.readText();
      const imported = await materializeDesignDocumentImages(
        await createDesignDocumentFromMarkup({ markup, mode: "html" }),
      );
      const current = documentRef.current;
      const next = pasteDesignNodes(
        current,
        imported,
        nodeForPage(imported).map((node) => node.nodeId),
      );
      commitDocument(next);
      const roots = nodeForPage(next).filter(
        (node) => !current.nodes.some((item) => item.nodeId === node.nodeId),
      );
      setSelectedNodeIds(roots.map((node) => node.nodeId));
      setSyncMessage("Pasted HTML as editable Design layers");
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Could not paste markup");
    }
  };
  const copyPortableExport = async (format: "html" | "react") => {
    const value =
      format === "html"
        ? await exportDesignHtmlPortable(document)
        : await exportDesignReactPortable(document);
    copyToClipboard(value);
  };
  const selectedSlice = selectedNodeIds
    .map((nodeId) => document.nodes.find((node) => node.nodeId === nodeId))
    .find((node) => node?.slice);

  const serverSyncLabel =
    syncTarget === null
      ? "Local only"
      : serverRead.isPending && serverRead.data === null
        ? "Checking server…"
        : serverRead.error !== null
          ? "Server unavailable"
          : serverPackageResult.status === "malformed"
            ? "Malformed server copy"
            : serverRead.data?.found
              ? "Server copy available"
              : "Ready to sync";
  const projectOptions = projects.map((project) => ({
    value: `${project.environmentId}:${project.id}`,
    label: `${project.title} · ${environments.find((environment) => environment.environmentId === project.environmentId)?.label ?? project.environmentId}`,
    environmentId: project.environmentId,
    cwd: project.workspaceRoot,
  }));
  const searchForDocument = (nextDocumentId: string) => ({
    documentId: nextDocumentId,
    ...(syncTarget
      ? {
          environmentId: syncTarget.environmentId,
          cwd: syncTarget.cwd,
          relativePath: syncTarget.relativePath.replace(/[^/]+$/u, `${nextDocumentId}.json`),
        }
      : {}),
  });
  const openDocument = (value: string | null) => {
    if (!value) return;
    void navigate({ to: "/design", search: searchForDocument(value) });
  };
  const addDocument = () => {
    void createDocument().then(
      (next) => navigate({ to: "/design", search: searchForDocument(next.documentId) }),
      (error: unknown) =>
        setSyncMessage(error instanceof Error ? error.message : "Could not create the file."),
    );
  };
  const linkSource = () => {
    if (!syncTarget || !document.provenance?.sourceThreadId || !document.provenance.sourceTabId) {
      setSyncMessage("Open this screen in Canvas from its connected Preview to link the source");
      return;
    }
    commitDocument(linkDesignDocument(document));
    setSyncMessage("Source linked; local geometry remains authoritative in Design");
  };
  const refreshSource = async () => {
    const provenance = document.provenance;
    if (!provenance || provenance.mode !== "linked") return;
    if (!syncTarget || !provenance.sourceThreadId || !provenance.sourceTabId) {
      setSyncMessage("Reconnect the source project to refresh this frame");
      return;
    }
    let capture;
    let materializedAssets;
    if (
      syncTarget &&
      provenance.sourceThreadId !== undefined &&
      provenance.sourceTabId !== undefined
    ) {
      const result = await captureServerDesignSnapshot({
        environmentId: syncTarget.environmentId,
        input: {
          threadId: ThreadId.make(provenance.sourceThreadId),
          tabId: provenance.sourceTabId,
        },
      });
      if (result._tag === "Success") capture = result.value;
    }
    if (!capture) {
      setSyncMessage("Could not capture the source. Your design has been preserved.");
      return;
    }
    try {
      materializedAssets = await materializePreviewAssets(capture);
    } catch (error) {
      setSyncMessage(
        `${error instanceof Error ? error.message : "Could not collect source images."} Your design has been preserved.`,
      );
      return;
    }
    commitDocument(
      refreshLinkedDesignDocument(documentRef.current, {
        route: provenance.route,
        sourceRevision: capture?.sourceRevision ?? provenance.sourceRevision,
        colorScheme: provenance.colorScheme,
        viewportWidth: provenance.viewportWidth,
        viewportHeight: provenance.viewportHeight,
        ...(capture?.browserEngine === undefined ? {} : { browserEngine: capture.browserEngine }),
        ...(capture?.stateFixture === undefined ? {} : { stateFixture: capture.stateFixture }),
        ...(capture === undefined ? {} : { capture }),
        ...(materializedAssets === undefined
          ? {}
          : {
              assetIdsByNodeId: materializedAssets.assetIdsByNodeId,
              assetMetadata: materializedAssets.assets,
            }),
      }),
    );
    setSyncMessage(
      capture?.truncated
        ? "Source refreshed with the first 10,000 layers; local geometry overrides were preserved"
        : "Source refreshed; local geometry overrides were preserved",
    );
  };
  const connectProject = (value: string | null) => {
    const project = projectOptions.find((option) => option.value === value);
    if (!project) return;
    void navigate({
      to: "/design",
      search: {
        documentId: document.documentId,
        environmentId: project.environmentId,
        cwd: project.cwd,
        relativePath: `.t3/design/${document.documentId}.json`,
      },
    });
  };
  const loadServerCopy = async () => {
    if (!serverDocument) return;
    let restored;
    try {
      restored = await restoreDesignPackageAssets(
        serverDocument,
        serverPackage?.assetPayloads ?? [],
      );
    } catch {
      setSyncMessage("Could not restore the server images. Your local edits have been preserved.");
      return;
    }
    commitDocument({
      ...restored,
      pendingOperations: [],
      conflicts: [],
      syncState: "synced",
    });
    setSelectedNodeIds([]);
    setSyncMessage("Loaded the server copy; local edits were replaced");
  };
  const handleBoolean = (operation: "union" | "flatten" | "subtract" | "intersect" | "exclude") => {
    const next = booleanDesignSelection(documentRef.current, selectedNodeIds, operation);
    if (next === documentRef.current) {
      setSyncMessage("Boolean operations currently support closed polygon vectors only");
      return;
    }
    commitDocument(next);
    const resultName =
      operation === "union"
        ? "Union"
        : operation === "flatten"
          ? "Flatten selection"
          : operation[0]!.toUpperCase() + operation.slice(1);
    setSelectedNodeIds(
      next.nodes.filter((node) => node.name === resultName).map((node) => node.nodeId),
    );
  };

  const designFileMenuItems = (
    <>
      <MenuSub>
        <MenuSubTrigger>Switch file</MenuSubTrigger>
        <MenuSubPopup>
          {documents.map((candidate) => (
            <MenuItem key={candidate.documentId} onClick={() => openDocument(candidate.documentId)}>
              {candidate.title}
              {candidate.documentId === document.documentId ? " ✓" : ""}
            </MenuItem>
          ))}
        </MenuSubPopup>
      </MenuSub>
      <MenuSeparator />
      <MenuItem onClick={addDocument}>New design document</MenuItem>
      <MenuItem onClick={onOpenFile}>Open Design file…</MenuItem>
      <MenuItem onClick={onDownload}>Save a local copy…</MenuItem>
      <MenuItem
        onClick={() => {
          setDocumentTitle(document.title);
          cancelDocumentRename.current = false;
          setRenamingDocument(true);
        }}
      >
        Rename document
      </MenuItem>
      <MenuSub>
        <MenuSubTrigger>Import</MenuSubTrigger>
        <MenuSubPopup>
          <MenuItem
            onClick={() => {
              openAssetPicker();
            }}
          >
            Place image…
          </MenuItem>
          <MenuItem onClick={() => void pasteMarkup()}>Paste HTML…</MenuItem>
          <MenuItem onClick={() => setReactPasteOpen(true)}>Paste as React…</MenuItem>
        </MenuSubPopup>
      </MenuSub>
      <MenuSeparator />
      {document.provenance?.mode === "snapshot" ? (
        <MenuItem
          disabled={
            !syncTarget || !document.provenance?.sourceThreadId || !document.provenance.sourceTabId
          }
          onClick={linkSource}
        >
          Link source
        </MenuItem>
      ) : null}
      {document.provenance?.mode === "linked" ? (
        <MenuItem onClick={() => void refreshSource()}>Refresh from source</MenuItem>
      ) : null}
      {serverDocument && serverDocument.documentId === document.documentId ? (
        <MenuItem onClick={() => void loadServerCopy()}>Load server copy</MenuItem>
      ) : null}
      <MenuSub>
        <MenuSubTrigger>Project connection</MenuSubTrigger>
        <MenuSubPopup>
          {syncTarget ? (
            <>
              <MenuGroup>
                <MenuGroupLabel>
                  {document.syncState} · {serverSyncLabel}
                </MenuGroupLabel>
                <MenuItem disabled={syncing} onClick={() => void syncDocument()}>
                  <CloudUploadIcon />
                  {syncing ? "Syncing…" : "Sync now"}
                </MenuItem>
              </MenuGroup>
            </>
          ) : projectOptions.length > 0 ? (
            projectOptions.map((project) => (
              <MenuItem key={project.value} onClick={() => connectProject(project.value)}>
                {project.label}
              </MenuItem>
            ))
          ) : (
            <MenuItem disabled>No projects connected</MenuItem>
          )}
        </MenuSubPopup>
      </MenuSub>
      <MenuSeparator />
      <MenuItem onClick={onTrash}>Move file to trash</MenuItem>
      <MenuItem onClick={onOpenTrash}>Recently deleted</MenuItem>
    </>
  );

  const designFileToolbar = (
    <div
      role="group"
      aria-label="Design file toolbar"
      data-design-toolbar=""
      className={
        shellIntegrated
          ? "flex h-full min-w-0 flex-1 items-center gap-2"
          : "flex h-12 shrink-0 items-center gap-2 border-b border-border/70 px-3"
      }
    >
      {shellIntegrated ? (
        <>
          <span className="shrink-0 text-foreground/90">Design</span>
          <span aria-hidden="true" className="shrink-0 text-muted-foreground/50">
            /
          </span>
        </>
      ) : null}
      <div className={shellIntegrated ? "min-w-0 max-w-60 flex-1" : "w-44 shrink-0"}>
        {renamingDocument ? (
          <Input
            size="sm"
            autoFocus
            aria-label="Document name"
            value={documentTitle}
            onChange={(event) => setDocumentTitle(event.target.value)}
            onBlur={() => {
              if (!cancelDocumentRename.current)
                commitDocument(renameDesignDocument(documentRef.current, documentTitle));
              setRenamingDocument(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                cancelDocumentRename.current = true;
                setRenamingDocument(false);
              }
            }}
          />
        ) : shellIntegrated ? (
          <Menu>
            <MenuTrigger
              render={<Button size="sm" variant="ghost-muted" aria-label="Design file menu" />}
            >
              <span className="block max-w-44 truncate">{document.title}</span>
              <ChevronDownIcon />
            </MenuTrigger>
            <MenuPopup align="start">{designFileMenuItems}</MenuPopup>
          </Menu>
        ) : (
          <h1
            className="truncate text-sm font-semibold"
            onDoubleClick={() => {
              setDocumentTitle(document.title);
              cancelDocumentRename.current = false;
              setRenamingDocument(true);
            }}
          >
            {document.title}
          </h1>
        )}
        <p className={shellIntegrated ? "sr-only" : "text-2xs text-muted-foreground"}>
          {document.provenance?.mode === "snapshot" ? "Imported snapshot · " : ""}
          {storage.errors.has(document.documentId)
            ? "Changes not saved"
            : storage.pending.has(document.documentId)
              ? "Saving…"
              : "Saved on this device"}
        </p>
      </div>
      {shellIntegrated ? <span className="min-w-0 flex-1" /> : null}
      {!shellIntegrated ? (
        <Select value={document.documentId} onValueChange={openDocument}>
          <SelectTrigger size="xs" variant="ghost" aria-label="Design document">
            <SelectValue>Files</SelectValue>
          </SelectTrigger>
          <SelectPopup align="start" alignItemWithTrigger={false}>
            {documents.map((candidate) => (
              <SelectItem key={candidate.documentId} value={candidate.documentId}>
                {candidate.title}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      ) : null}
      {!shellIntegrated ? (
        <Menu>
          <MenuTrigger
            render={
              <Button
                size={shellIntegrated ? "sm" : "xs"}
                variant="ghost-muted"
                aria-label="File actions"
              />
            }
          >
            File <ChevronDownIcon />
          </MenuTrigger>
          <MenuPopup align="end">{designFileMenuItems}</MenuPopup>
        </Menu>
      ) : null}
      {shellIntegrated &&
      (document.syncState === "conflict" || document.syncState === "offline") ? (
        <Badge variant={document.syncState === "conflict" ? "destructive" : "outline"}>
          {document.syncState}
          {document.conflicts.length > 0 ? ` · ${document.conflicts.length}` : ""}
        </Badge>
      ) : null}
      {!shellIntegrated ? (
        <>
          {syncTarget ? (
            <span className="max-w-36 truncate text-2xs text-muted-foreground">
              {serverSyncLabel}
            </span>
          ) : null}
          {syncTarget ? (
            <Button
              size={shellIntegrated ? "sm" : "xs"}
              variant="ghost-muted"
              disabled={syncing}
              onClick={() => void syncDocument()}
            >
              <CloudUploadIcon /> {syncing ? "Syncing…" : "Sync"}
            </Button>
          ) : projectOptions.length > 0 ? (
            <Select onValueChange={connectProject}>
              <SelectTrigger
                size={shellIntegrated ? "sm" : "xs"}
                variant="ghost"
                aria-label="Connect Design to a project"
              >
                <SelectValue placeholder="Connect" />
              </SelectTrigger>
              <SelectPopup align="end" alignItemWithTrigger={false}>
                {projectOptions.map((project) => (
                  <SelectItem key={project.value} value={project.value}>
                    {project.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
          ) : null}
          {syncTarget || document.syncState !== "local" ? (
            <Badge variant={document.syncState === "conflict" ? "destructive" : "outline"}>
              {document.syncState}
              {document.conflicts.length > 0 ? ` · ${document.conflicts.length}` : ""}
            </Badge>
          ) : null}
        </>
      ) : null}
      <div
        role="group"
        aria-label="Design output actions"
        className="flex shrink-0 items-center gap-0.5"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size={shellIntegrated ? "icon-sm" : "xs"}
                variant={shellIntegrated ? "ghost-muted" : "secondary"}
                aria-label="Present"
                disabled={!nodeForPage(document).some((node) => node.kind === "frame")}
                onClick={() => {
                  const selectedFrame = document.nodes.find(
                    (node) => selectedNodeIds.includes(node.nodeId) && node.kind === "frame",
                  );
                  const startNodeId = document.pages.find(
                    (page) => page.pageId === document.activePageId,
                  )?.prototypeStartNodeId;
                  const frame =
                    document.nodes.find(
                      (node) => node.nodeId === startNodeId && node.kind === "frame",
                    ) ??
                    selectedFrame ??
                    nodeForPage(document).find((node) => node.kind === "frame");
                  if (frame) setPresenting(frame.nodeId);
                }}
              >
                <PlayIcon />
                {!shellIntegrated ? "Present" : null}
              </Button>
            }
          />
          <TooltipPopup>Present</TooltipPopup>
        </Tooltip>

        <Menu>
          <MenuTrigger
            render={
              <Button
                size={shellIntegrated ? "sm" : "xs"}
                variant={shellIntegrated ? "ghost-muted" : "default"}
              />
            }
          >
            Export <ChevronDownIcon />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem onClick={() => void copyPortableExport("html")}>Copy HTML</MenuItem>
            <MenuItem onClick={() => void copyPortableExport("react")}>Copy React</MenuItem>
            <MenuItem
              onClick={() => {
                void exportDesignPatchPortable(documentRef.current)
                  .then(copyToClipboard)
                  .catch((error: unknown) =>
                    setSyncMessage(
                      error instanceof Error ? error.message : "Could not package this design",
                    ),
                  );
              }}
            >
              Copy patch
            </MenuItem>
            {selectedSlice ? (
              <>
                <MenuItem
                  onClick={() => {
                    try {
                      copyToClipboard(exportDesignSliceHtml(document, selectedSlice.nodeId));
                      setSyncMessage(`Copied ${selectedSlice.name} slice HTML`);
                    } catch (error) {
                      setSyncMessage(
                        error instanceof Error ? error.message : "Could not export this slice",
                      );
                    }
                  }}
                >
                  Copy selected slice HTML
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    try {
                      copyToClipboard(exportDesignSliceSvg(document, selectedSlice.nodeId));
                      setSyncMessage(`Copied ${selectedSlice.name} slice SVG`);
                    } catch (error) {
                      setSyncMessage(
                        error instanceof Error ? error.message : "Could not export this slice",
                      );
                    }
                  }}
                >
                  Copy selected slice SVG
                </MenuItem>
              </>
            ) : null}
          </MenuPopup>
        </Menu>
      </div>
      <input
        ref={assetInputRef}
        type="file"
        accept="image/*"
        multiple
        aria-label="Design asset file"
        className="hidden"
        onChange={(event) => {
          void importAsset(event).catch((error: unknown) =>
            setSyncMessage(error instanceof Error ? error.message : "Could not import this image"),
          );
        }}
      />
    </div>
  );

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col bg-background"
      data-design-workspace=""
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          !(event.target instanceof HTMLElement) ||
          event.target.closest(
            "input,textarea,select,[contenteditable=true],[role=menu],[role=dialog],[role=combobox]",
          )
        )
          return;
        if (flipShortcutAxis(event)) onCanvasKeyDown(event);
      }}
    >
      {shellIntegrated
        ? designChromeActions
          ? createPortal(designFileToolbar, designChromeActions)
          : null
        : designFileToolbar}
      {importingImages ? (
        <p
          role="status"
          className="shrink-0 border-b border-border px-4 py-2 text-xs text-muted-foreground"
        >
          Preparing images…
        </p>
      ) : null}
      {presenting ? (
        <DesignPresentation
          document={document}
          startId={presenting}
          onClose={() => setPresenting(null)}
        />
      ) : null}
      {syncMessage ? (
        <div
          className="border-b border-border/60 px-4 py-1.5 text-2xs text-muted-foreground"
          role="status"
        >
          {syncMessage}
        </div>
      ) : null}
      <div className="flex min-h-0 flex-1">
        <LayersPanel
          document={document}
          selectedNodeIds={selectedNodeIds}
          onSelect={selectNode}
          onAddLayer={() => {
            const current = documentRef.current;
            const next = addTextNode(current, designInsertionParent(current, selectedNodeIds));
            commitDocument(next);
            const node = next.nodes.at(-1);
            setSelectedNodeIds(node ? [node.nodeId] : []);
          }}
          onAddFrame={() => {
            const next = addFrameNode(document);
            commitDocument(next);
            const node = next.nodes.at(-1);
            setSelectedNodeIds(node ? [node.nodeId] : []);
          }}
          onAddComponent={() => {
            const next = addComponentNode(document);
            commitDocument(next);
            const node = next.nodes.at(-1);
            setSelectedNodeIds(node ? [node.nodeId] : []);
          }}
          onAddInstance={insertInstance}
          onAddPage={() => {
            const next = addDesignPage(document);
            commitDocument(next);
            const node = next.nodes.at(-1);
            setSelectedNodeIds(node ? [node.nodeId] : []);
          }}
          onSelectPage={(pageId) => {
            commitDocument(setActiveDesignPage(document, pageId));
            setSelectedNodeIds([]);
          }}
          onPageRename={(pageId, name) =>
            commitDocument(renameDesignPage(documentRef.current, pageId, name))
          }
          onPageDelete={(pageId) => {
            commitDocument(deleteDesignPage(documentRef.current, pageId));
            setSelectedNodeIds([]);
          }}
          onEditorKeyDown={onCanvasKeyDown}
          onInsertComponent={insertInstance}
          onPlaceAsset={(assetId) => {
            void stageAsset(assetId).catch((error: unknown) =>
              setSyncMessage(error instanceof Error ? error.message : "Could not place this image"),
            );
          }}
          onReplaceAsset={(assetId) => openAssetPicker({ assetId })}
          onRemoveAsset={(assetId) => {
            commitDocument(removeDesignAsset(documentRef.current, assetId));
            setImageQueue((items) => items.filter((item) => item.assetId !== assetId));
          }}
          onImportAsset={() => openAssetPicker()}
          onRename={renameNode}
          onToggleVisibility={toggleNodeVisibility}
          onToggleLock={toggleNodeLock}
          onAction={layerAction}
          onDropLayer={(nodeId, target, position) => {
            const current = documentRef.current;
            const siblings = target.parentId
              ? (current.nodes.find((node) => node.nodeId === target.parentId)?.childIds ?? [])
              : (current.pages.find((page) => page.pageId === current.activePageId)?.nodeIds ?? []);
            const beforeId =
              position === "after"
                ? siblings[siblings.indexOf(target.nodeId) + 1]
                : position === "before"
                  ? target.nodeId
                  : undefined;
            commitDocument(
              reparentDesignNode(
                current,
                nodeId,
                position === "inside" ? target.nodeId : target.parentId,
                beforeId,
              ),
            );
          }}
        />
        <DesignCanvas
          key={document.activePageId}
          {...(activePage.background ? { pageBackground: activePage.background } : {})}
          propertyLabels={propertyLabels}
          onPropertyLabels={setPropertyLabels}
          document={document}
          selected={selectedNodeIds}
          onSelect={setSelectedNodeIds}
          rotationOrigin={selection.origin}
          rotationOriginVisible={rotationOriginVisible}
          onRotationOriginToggle={() => setRotationOriginVisible((value) => !value)}
          onRotationOriginChange={(point, ids) => {
            const selected = new Set(ids);
            setSelection((current) =>
              current.ids.length === ids.length && current.ids.every((id) => selected.has(id))
                ? {
                    ...current,
                    origin: point
                      ? createDesignRotationOrigin(documentRef.current, ids, point)
                      : null,
                  }
                : current,
            );
          }}
          onCommit={commitDocument}
          onKeyDown={onCanvasKeyDown}
          onUndo={undo}
          onRedo={redo}
          canUndo={history.length > 0}
          canRedo={future.length > 0}
          onImport={() => openAssetPicker()}
          tool={designTool}
          onToolChange={setDesignTool}
          imagePlacement={imageQueue[0] ?? null}
          placementCount={imageQueue.length}
          onImagePlaced={() => setImageQueue((items) => items.slice(1))}
          onCancelPlacement={cancelImagePlacement}
          onPlaceAllImages={(target) => {
            if (placeImages(imageQueue, target)) setImageQueue([]);
          }}
          onBoolean={handleBoolean}
          comments={document.comments ?? []}
          onAddComment={(point, parentId) => {
            const added = addDesignComment(documentRef.current, point, parentId);
            commitDocument(added.document);
            setSyncMessage("Comment added to the canvas");
          }}
          onUpdateComment={(commentId, text) => {
            commitDocument(updateDesignComment(documentRef.current, commentId, { text }));
          }}
          onResolveComment={(commentId, resolved) => {
            commitDocument(updateDesignComment(documentRef.current, commentId, { resolved }));
          }}
          onDeleteComment={(commentId) => {
            commitDocument(removeDesignComment(documentRef.current, commentId));
            setSyncMessage("Comment deleted");
          }}
          onDropImages={(files, target) => {
            void importImages(files, null, target).catch((error: unknown) =>
              setSyncMessage(
                error instanceof Error ? error.message : "Could not import these images",
              ),
            );
          }}
        />
        {designTool === "scale" ? (
          <DesignScalePanel
            document={document}
            selected={selectedNodeIds}
            onCommit={commitDocument}
          />
        ) : (
          <Inspector
            propertyLabels={propertyLabels}
            node={selectedNode}
            selectionCount={selectedNodes.length}
            selectedNodes={selectedNodes}
            onChangeMany={updateMany}
            canAlign={canAlignSelection}
            canTransform={selectedNodes.some(
              (node) => !isDesignNodeLocked(document, node.nodeId, selectedNodeMap),
            )}
            onFlip={(axis) =>
              commitDocument(flipDesignSelection(documentRef.current, selectedNodeIds, axis))
            }
            onRotate={() =>
              commitDocument(
                rotateDesignSelection(
                  documentRef.current,
                  selectedNodeIds,
                  90,
                  resolveDesignRotationOrigin(
                    documentRef.current,
                    selectedNodeIds,
                    selection.origin,
                  ),
                ),
              )
            }
            onDistribute={(axis) =>
              commitDocument(distributeDesignNodes(documentRef.current, selectedNodeIds, axis))
            }
            provenance={document.provenance}
            conflict={activeConflict}
            onChange={updateNode}
            imageAsset={document.assets.find((asset) => asset.assetId === selectedNode?.assetId)}
            onReplaceImage={() => {
              if (selectedNode?.kind === "image") openAssetPicker({ nodeId: selectedNode.nodeId });
            }}
            onResolveConflict={resolveConflict}
            nodes={document.nodes}
            locked={selectedNodes.some((node) =>
              isDesignNodeLocked(document, node.nodeId, selectedNodeMap),
            )}
            startNodeId={
              document.pages.find((page) => page.pageId === document.activePageId)
                ?.prototypeStartNodeId
            }
            onSetStart={(nodeId) =>
              commitDocument(setPrototypeStartFrame(documentRef.current, nodeId))
            }
            prototypeSettings={
              document.pages.find((page) => page.pageId === document.activePageId)
                ?.prototypeSettings ?? {}
            }
            onPrototypeSettings={(settings) =>
              commitDocument(updatePrototypeSettings(documentRef.current, settings))
            }
            pageFrames={nodeForPage(document).filter((node) => node.kind === "frame")}
            onBeginEdit={() => {
              if (!propertyEditStart.current)
                propertyEditStart.current = { initial: documentRef.current, recorded: false };
            }}
            onEndEdit={() => {
              propertyEditStart.current = null;
            }}
            onAlign={(alignment) =>
              commitDocument(alignDesignNodes(documentRef.current, selectedNodeIds, alignment))
            }
            page={activePage}
            onPageChange={(update) =>
              commitDocument({
                ...documentRef.current,
                pages: documentRef.current.pages.map((candidate) =>
                  candidate.pageId === activePage.pageId ? { ...candidate, ...update } : candidate,
                ),
              })
            }
          />
        )}
      </div>
      {reactPasteOpen ? (
        <DesignReactPasteDialog
          viewport={{
            width: selectedNode?.kind === "frame" ? selectedNode.width : 640,
            height: selectedNode?.kind === "frame" ? selectedNode.height : 420,
          }}
          onClose={() => setReactPasteOpen(false)}
          onImport={(imported) => {
            const current = documentRef.current;
            const next = pasteDesignNodes(
              current,
              imported,
              nodeForPage(imported).map((node) => node.nodeId),
            );
            commitDocument(next);
            const existing = new Set(current.nodes.map((node) => node.nodeId));
            setSelectedNodeIds(
              nodeForPage(next)
                .filter((node) => !existing.has(node.nodeId))
                .map((node) => node.nodeId),
            );
            setSyncMessage("Pasted React as editable Design layers");
          }}
        />
      ) : null}
    </div>
  );
}
