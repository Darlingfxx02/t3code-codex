import {
  CircleIcon,
  ChevronDownIcon,
  PenToolIcon,
  PencilIcon,
  MinusIcon as LineIcon,
  FrameIcon,
  HandIcon,
  ImageIcon,
  MousePointer2Icon,
  ScalingIcon,
  Redo2Icon,
  SquareIcon,
  TypeIcon,
  RulerIcon,
  PanelsTopLeftIcon,
  CropIcon,
  Undo2Icon,
  MessageCircleIcon,
  CheckIcon,
  Trash2Icon,
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type KeyboardEventHandler,
} from "react";
import { DesignCanvasViewMenu } from "./DesignCanvasViewMenu";
import { DesignPixelPreview, type DesignPixelPreviewMode } from "./DesignPixelPreview";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { cn, isMacPlatform } from "../../lib/utils";
import { useStableCallback } from "../../hooks/useStableCallback";
import { observeResize } from "../../lib/observeResize";
import { designCanvasGeometry, designViewportNodes } from "./designVisibility";
import { workspaceAreaProps } from "../../lib/workspaceFocus";
import {
  absoluteNodePosition,
  commitDesignNodeTransforms,
  addFrameNode,
  addImageNode,
  addVectorPath,
  designWorldToLocal,
  designInsertionParent,
  isDesignNodeVisible,
  reparentDesignNode,
  addShapeNode,
  addTextNode,
  isDesignNodeLocked,
  isDesignNodeInFlow,
  nodeForPage,
  selectionRoots,
  updateDesignNode,
  updateDesignVectorPoint,
  updateDesignGuides,
  type DesignDocument,
  type DesignComment,
  type DesignNode,
  type DesignVectorPoint,
} from "./designDocument";
import {
  designScalableRoots,
  designSelectionFrame,
  previewDesignTransform,
} from "./designTransform";
import { DesignSceneNode } from "./DesignScene";
import { DesignRotationOriginHandle } from "./DesignRotationOriginHandle";
import { resolveDesignRotationOrigin, type DesignRotationOrigin } from "./designRotationOrigin";
import {
  imagePlacementBox,
  type DesignImagePlacement,
  type DesignImageTarget,
} from "./designImage";

export type DesignTool =
  | "select"
  | "scale"
  | "hand"
  | "frame"
  | "rectangle"
  | "ellipse"
  | "text"
  | "line"
  | "arrow"
  | "pen"
  | "pencil"
  | "measure"
  | "section"
  | "slice"
  | "comment";

type GuideLines = { x: { id: string; value: number }[]; y: { id: string; value: number }[] };
type Point = { x: number; y: number };
type PenPoint = DesignVectorPoint & { id: number };
type Box = Point & { width: number; height: number };
type Gesture = {
  kind:
    | "move"
    | "resize"
    | "rotate"
    | "scale"
    | "pan"
    | "marquee"
    | "create"
    | "guide"
    | "origin"
    | "place-image"
    | "measure";
  origin?: Point;
  originBox?: NonNullable<ReturnType<typeof designSelectionFrame>>;
  start: Point;
  point: Point;
  base: DesignDocument;
  ids: readonly string[];
  additive: boolean;
  handle?: string;
  pan: Point;
  points?: readonly Point[] | undefined;
  shift?: boolean;
  alt?: boolean;
  control?: boolean;
  guide?: { axis: "x" | "y"; index: number };
};
type VectorDrag = {
  nodeId: string;
  index: number;
  kind: "inHandle" | "outHandle" | "anchor";
  start: Point;
  point: Point;
  base: DesignDocument;
};
type GradientDrag = {
  nodeId: string;
  fillIndex: number;
  point: Point;
  base: DesignDocument;
};
const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
const rotationCursor = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M18 8a7 7 0 1 0 1 7M18 3v5h-5" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 8a7 7 0 1 0 1 7M18 3v5h-5" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>')}") 12 12, crosshair`;
const positions = {
  nw: [0, 0],
  n: [50, 0],
  ne: [100, 0],
  e: [100, 50],
  se: [100, 100],
  s: [50, 100],
  sw: [0, 100],
  w: [0, 50],
} as const;

function bounds(document: DesignDocument, ids: readonly string[]): Box | null {
  return designSelectionFrame(document, ids, true);
}

function fittedCamera(target: Box, viewport: { width: number; height: number }, maxZoom: number) {
  const zoom = Math.min(
    maxZoom,
    Math.max(
      0.1,
      Math.min(
        (viewport.width - 100) / Math.max(1, target.width),
        (viewport.height - 140) / Math.max(1, target.height),
      ),
    ),
  );
  return {
    zoom,
    pan: {
      x: (viewport.width - target.width * zoom) / 2 - target.x * zoom,
      y: (viewport.height - target.height * zoom) / 2 - target.y * zoom,
    },
  };
}

function previewGesture(gesture: Gesture, zoom: number, snap: boolean): DesignDocument {
  const kind = gesture.kind;
  if (kind !== "move" && kind !== "resize" && kind !== "rotate" && kind !== "scale")
    return gesture.base;
  const divisor = kind === "rotate" ? 1 : zoom;
  return previewDesignTransform({
    document: gesture.base,
    ids: gesture.ids,
    kind,
    start: { x: gesture.start.x / divisor, y: gesture.start.y / divisor },
    point: { x: gesture.point.x / divisor, y: gesture.point.y / divisor },
    ...(gesture.handle ? { handle: gesture.handle } : {}),
    ...(gesture.origin ? { origin: gesture.origin } : {}),
    shift: gesture.shift ?? false,
    alt: gesture.alt ?? false,
    control: gesture.control ?? false,
    snap,
  });
}

function originDragPoint(gesture: Gesture, zoom: number, snap: boolean): Point {
  const origin = gesture.origin!;
  const dx = (gesture.point.x - gesture.start.x) / zoom,
    dy = (gesture.point.y - gesture.start.y) / zoom;
  const horizontal = gesture.shift && Math.abs(dx) >= Math.abs(dy),
    vertical = gesture.shift && !horizontal;
  let point = { x: origin.x + (vertical ? 0 : dx), y: origin.y + (horizontal ? 0 : dy) };
  const frame = gesture.originBox;
  const probe = point;
  let nearest = 6 / zoom;
  if (frame) {
    const angle = (frame.rotation * Math.PI) / 180,
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    for (const x of [0, 0.5, 1])
      for (const y of [0, 0.5, 1]) {
        const dx = (x - 0.5) * frame.width,
          dy = (y - 0.5) * frame.height;
        const target = {
          x: frame.x + frame.width / 2 + dx * cos - dy * sin,
          y: frame.y + frame.height / 2 + dx * sin + dy * cos,
        };
        const distance = Math.hypot(probe.x - target.x, probe.y - target.y);
        if (distance < nearest) {
          point = target;
          nearest = distance;
        }
      }
  }
  if (nearest === 6 / zoom && snap) point = { x: Math.round(point.x), y: Math.round(point.y) };
  return { x: vertical ? origin.x : point.x, y: horizontal ? origin.y : point.y };
}

function ToolButton({
  label,
  active,
  onClick,
  children,
  disabled = false,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            aria-label={label}
            aria-pressed={active}
            size="icon-sm"
            variant={active ? "secondary" : "ghost"}
            disabled={disabled}
            onClick={onClick}
          >
            {children}
          </Button>
        }
      />
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip>
  );
}

export function DesignCanvas({
  document,
  selected,
  onSelect,
  onCommit,
  onKeyDown,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onImport,
  tool,
  onToolChange: setTool,
  imagePlacement = null,
  placementCount = 0,
  onImagePlaced,
  onCancelPlacement,
  onDropImages,
  onPlaceAllImages,
  onBoolean,
  comments = [],
  onAddComment,
  onUpdateComment,
  onResolveComment,
  onDeleteComment,
  propertyLabels = false,
  onPropertyLabels = () => undefined,
  rotationOrigin,
  rotationOriginVisible,
  onRotationOriginChange,
  onRotationOriginToggle,
  pageBackground,
  showTools = true,
}: {
  document: DesignDocument;
  selected: readonly string[];
  onSelect: (ids: readonly string[]) => void;
  onCommit: (next: DesignDocument) => void;
  onKeyDown: KeyboardEventHandler<HTMLElement>;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onImport: () => void;
  tool: DesignTool;
  onToolChange: (tool: DesignTool) => void;
  imagePlacement?: DesignImagePlacement | null;
  placementCount?: number;
  onImagePlaced?: () => void;
  onCancelPlacement?: () => void;
  onDropImages?: (files: readonly File[], target: DesignImageTarget) => void;
  onPlaceAllImages?: (target: DesignImageTarget) => void;
  onBoolean?: (operation: "union" | "flatten" | "subtract" | "intersect" | "exclude") => void;
  comments?: readonly DesignComment[];
  onAddComment?: (point: Point, parentId: string | null) => void;
  onUpdateComment?: (commentId: string, text: string) => void;
  onResolveComment?: (commentId: string, resolved: boolean) => void;
  onDeleteComment?: (commentId: string) => void;
  propertyLabels?: boolean;
  onPropertyLabels?: (value: boolean) => void;
  rotationOrigin: DesignRotationOrigin | null;
  rotationOriginVisible: boolean;
  onRotationOriginChange: (point: Point | null, ids: readonly string[]) => void;
  onRotationOriginToggle: () => void;
  pageBackground?: string;
  showTools?: boolean;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const guideSequence = useRef(0);
  const [zoom, setZoom] = useState(1);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 56, y: 56 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [initialTarget] = useState(() =>
    bounds(document, selected.length ? selected : nodeForPage(document).map((node) => node.nodeId)),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Measure the mounted surface for opening camera fit and keep culling in sync with its observed size.
  useLayoutEffect(() => {
    const element = surface.current;
    if (!element) return;
    const viewport = element.getBoundingClientRect();
    setViewportSize({ width: viewport.width, height: viewport.height });
    if (initialTarget && viewport.width && viewport.height) {
      const camera = fittedCamera(initialTarget, viewport, 1);
      setZoom(camera.zoom);
      setPan(camera.pan);
    }
    return observeResize(element, ([entry]) => {
      if (entry)
        setViewportSize((current) =>
          current.width === entry.contentRect.width && current.height === entry.contentRect.height
            ? current
            : { width: entry.contentRect.width, height: entry.contentRect.height },
        );
    });
  }, [initialTarget]);
  const [placementCursor, setPlacementCursor] = useState<Point | null>(null);
  const placementAssetId = imagePlacement?.assetId;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Staged files need canvas keyboard focus for placement cancellation and shortcuts.
  useEffect(() => {
    if (placementAssetId) surface.current?.focus({ preventScroll: true });
  }, [placementAssetId]);
  const [space, setSpace] = useState(false);
  const [snap, setSnap] = useState(false);
  const [showRulers, setShowRulers] = useState(false);
  const [showPixelGrid, setShowPixelGrid] = useState(true);
  const [pixelPreview, setPixelPreview] = useState<DesignPixelPreviewMode>({ density: 0 });
  const changePixelPreview = (value: 0 | 1 | 2) => {
    setPixelPreview({ density: value });
    toastManager.add({
      id: "design-pixel-preview",
      title: value ? `Pixel preview ${value}x` : "Pixel preview disabled",
      timeout: 1500,
      data: { hideCopyButton: true },
    });
  };
  const [outlines, setOutlines] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const savedGuides: GuideLines = { x: [], y: [] };
  for (const guide of document.guides ?? []) {
    if (guide.pageId === document.activePageId)
      savedGuides[guide.axis].push({ id: guide.id, value: guide.position });
  }
  const [guideDraft, setGuideDraft] = useState<GuideLines | null>(null);
  const guides = guideDraft ?? savedGuides;
  const setGuides = (updater: (current: GuideLines) => GuideLines) =>
    setGuideDraft((current) => updater(current ?? savedGuides));
  const commitGuides = (next: GuideLines) => {
    onCommit(
      updateDesignGuides(document, [
        ...(document.guides ?? []).filter((guide) => guide.pageId !== document.activePageId),
        ...(["x", "y"] as const).flatMap((axis) =>
          next[axis].map((guide) => ({
            id: guide.id,
            pageId: document.activePageId,
            axis,
            position: guide.value,
          })),
        ),
      ]),
    );
    setGuideDraft(null);
  };
  const [penPoints, setPenPoints] = useState<readonly PenPoint[]>([]);
  const pointSequence = useRef(0);
  const [penHover, setPenHover] = useState<Point | null>(null);
  const [penDrag, setPenDrag] = useState<{ id: number; pointerId: number; anchor: Point } | null>(
    null,
  );
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [vectorDrag, setVectorDrag] = useState<VectorDrag | null>(null);
  const [gradientDrag, setGradientDrag] = useState<GradientDrag | null>(null);
  const activeTool = space ? "hand" : imagePlacement ? "image" : tool;
  const updateGradientAngle = (base: DesignDocument, drag: GradientDrag, point: Point) => {
    const node = base.nodes.find((candidate) => candidate.nodeId === drag.nodeId);
    if (!node) return base;
    const fills = [...(node.paint?.fills ?? [{ color: node.fill ?? "transparent" }])];
    const fill = fills[drag.fillIndex];
    if (!fill || fill.kind === "solid") return base;
    const angle =
      (Math.atan2(point.y - node.height / 2, point.x - node.width / 2) * 180) / Math.PI + 90;
    fills[drag.fillIndex] = { ...fill, angle: Math.round(((angle + 360) % 360) * 100) / 100 };
    return updateDesignNode(base, drag.nodeId, {
      paint: { ...node.paint, fills },
    });
  };
  const shown = vectorDrag
    ? updateDesignVectorPoint(
        vectorDrag.base,
        vectorDrag.nodeId,
        vectorDrag.index,
        vectorDrag.kind === "anchor"
          ? { x: vectorDrag.point.x, y: vectorDrag.point.y }
          : {
              [vectorDrag.kind]: {
                x: vectorDrag.point.x - vectorDrag.start.x,
                y: vectorDrag.point.y - vectorDrag.start.y,
              },
            },
      )
    : gradientDrag
      ? updateGradientAngle(gradientDrag.base, gradientDrag, gradientDrag.point)
      : gesture && ["move", "resize", "rotate", "scale"].includes(gesture.kind)
        ? previewGesture(gesture, zoom, snap)
        : document;
  const box = designSelectionFrame(
    shown,
    tool === "scale" ? designScalableRoots(shown, selected).map((node) => node.nodeId) : selected,
  );
  const pageGeometry = designCanvasGeometry(shown);
  const sceneNodes = pageGeometry.nodes;
  const geometry = pageGeometry.entries;
  const rotationIds = selected.filter((id) => !isDesignNodeLocked(shown, id, sceneNodes));
  const rotationBox =
    rotationIds.length === selected.length ? box : designSelectionFrame(shown, rotationIds);
  const canMoveOrigin =
    !rotationIds.some((id) => isDesignNodeInFlow(shown, id, sceneNodes)) ||
    !selectionRoots(shown, rotationIds).some((node) =>
      isDesignNodeInFlow(shown, node.nodeId, sceneNodes),
    );
  const originPoint =
    gesture?.kind === "rotate" && gesture.origin
      ? gesture.origin
      : (resolveDesignRotationOrigin(shown, selected, rotationOrigin, sceneNodes) ??
        (rotationBox
          ? { x: rotationBox.x + rotationBox.width / 2, y: rotationBox.y + rotationBox.height / 2 }
          : null));
  const visibleNodeIds = designViewportNodes(
    geometry,
    {
      x: (-pan.x - 150) / zoom,
      y: (-pan.y - 150) / zoom,
      width: (viewportSize.width + 300) / zoom,
      height: (viewportSize.height + 300) / zoom,
    },
    selected.length === 1 ? selected : [],
  );

  const worldPoint = (point: Point) => ({
    x: (point.x - pan.x) / zoom,
    y: (point.y - pan.y) / zoom,
  });
  const localPoint = (event: PointerEvent): Point => {
    const rect = surface.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const startVectorHandle = (
    event: PointerEvent,
    nodeId: string,
    index: number,
    kind: "inHandle" | "outHandle" | "anchor",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const point = designWorldToLocal(document, nodeId, worldPoint(localPoint(event)), sceneNodes);
    const node = document.nodes.find((candidate) => candidate.nodeId === nodeId);
    const anchor = node?.vector?.points?.[index];
    if (!node || !anchor) return;
    surface.current?.setPointerCapture(event.pointerId);
    setVectorDrag({
      nodeId,
      index,
      kind,
      start: { x: anchor.x, y: anchor.y },
      point,
      base: document,
    });
  };
  const startGradientHandle = (event: PointerEvent, nodeId: string, fillIndex: number) => {
    event.preventDefault();
    event.stopPropagation();
    const point = designWorldToLocal(document, nodeId, worldPoint(localPoint(event)), sceneNodes);
    if (!document.nodes.some((candidate) => candidate.nodeId === nodeId)) return;
    surface.current?.setPointerCapture(event.pointerId);
    setGradientDrag({ nodeId, fillIndex, point, base: document });
  };
  const start = (
    event: PointerEvent,
    kind: Gesture["kind"],
    ids: readonly string[],
    handle?: string,
  ) => {
    if (event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    surface.current?.focus({ preventScroll: true });
    if (kind === "move") event.currentTarget.setPointerCapture(event.pointerId);
    else surface.current?.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    setGesture({
      kind,
      start: kind === "rotate" || kind === "measure" ? worldPoint(point) : point,
      point: kind === "rotate" || kind === "measure" ? worldPoint(point) : point,
      base: document,
      ids,
      additive: event.shiftKey,
      shift: event.shiftKey,
      alt: event.altKey,
      control: event.ctrlKey,
      points: [point],
      pan,
      ...(handle ? { handle } : {}),
      ...((kind === "rotate" || kind === "origin") && originPoint ? { origin: originPoint } : {}),
      ...(kind === "origin" && rotationBox ? { originBox: rotationBox } : {}),
    });
  };
  const frameAtPoint = (point: Point) => {
    const containers = Array.from(geometry.values())
      .filter((entry) => entry.bounds !== null)
      .map((entry) => entry.node)
      .filter(
        (candidate) =>
          ["frame", "component", "group"].includes(candidate.kind) &&
          designInsertionParent(document, [candidate.nodeId], sceneNodes) === candidate.nodeId &&
          isDesignNodeVisible(document, candidate.nodeId, sceneNodes) &&
          !isDesignNodeLocked(document, candidate.nodeId),
      );
    return containers.findLast((candidate) => {
      const local = designWorldToLocal(document, candidate.nodeId, point, sceneNodes);
      return (
        local.x >= -0.001 &&
        local.y >= -0.001 &&
        local.x <= candidate.width + 0.001 &&
        local.y <= candidate.height + 0.001
      );
    });
  };
  const placeInsideFrame = (next: DesignDocument, nodeId: string, point: Point) => {
    const parent = frameAtPoint(point);
    return parent ? reparentDesignNode(next, nodeId, parent.nodeId) : next;
  };
  const imageTarget = (point: Point): DesignImageTarget => ({
    worldX: point.x,
    worldY: point.y,
    pageId: document.activePageId,
    parentId: frameAtPoint(point)?.nodeId ?? null,
  });
  const startNode = (event: PointerEvent, nodeId: string) => {
    if (event.shiftKey) {
      onSelect(
        selected.includes(nodeId) ? selected.filter((id) => id !== nodeId) : [...selected, nodeId],
      );
      event.stopPropagation();
      return;
    }
    const ids = selected.includes(nodeId) ? selected : [nodeId];
    onSelect(ids);
    if (ids.some((id) => isDesignNodeInFlow(document, id, sceneNodes))) {
      event.preventDefault();
      event.stopPropagation();
      surface.current?.focus({ preventScroll: true });
      return;
    }
    start(event, "move", ids);
  };
  const move = (event: PointerEvent) => {
    const point = localPoint(event);
    if (imagePlacement) setPlacementCursor(point);
    if (tool === "pen") setPenHover(worldPoint(point));
    if (penDrag && activeTool === "pen") {
      const current = worldPoint(point);
      const dx = current.x - penDrag.anchor.x;
      const dy = current.y - penDrag.anchor.y;
      setPenPoints((points) =>
        points.map((candidate) =>
          candidate.id === penDrag.id
            ? { ...candidate, outHandle: { x: dx, y: dy }, inHandle: { x: -dx, y: -dy } }
            : candidate,
        ),
      );
      return;
    }
    if (vectorDrag) {
      const local = designWorldToLocal(document, vectorDrag.nodeId, worldPoint(point), sceneNodes);
      setVectorDrag((current) => (current ? { ...current, point: local } : current));
      return;
    }
    if (gradientDrag) {
      const local = designWorldToLocal(
        document,
        gradientDrag.nodeId,
        worldPoint(point),
        sceneNodes,
      );
      setGradientDrag((current) => (current ? { ...current, point: local } : current));
      return;
    }
    if (!gesture) return;
    const previous = gesture.points?.at(-1);
    const points =
      tool === "pencil" &&
      (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 2)
        ? [...(gesture.points ?? []), point]
        : gesture.points;
    const next = {
      ...gesture,
      point: gesture.kind === "rotate" ? worldPoint(point) : point,
      points,
      shift: event.shiftKey,
      alt: event.altKey,
      control: event.ctrlKey,
    };
    if (gesture.kind === "pan")
      setPan({
        x: gesture.pan.x + point.x - gesture.start.x,
        y: gesture.pan.y + point.y - gesture.start.y,
      });
    if (gesture.guide) {
      const coordinate = worldPoint(point)[gesture.guide.axis];
      setGuides((current) => ({
        ...current,
        [gesture.guide!.axis]: current[gesture.guide!.axis].map((value, index) =>
          index === gesture.guide!.index ? { ...value, value: Math.round(coordinate) } : value,
        ),
      }));
    }
    setGesture(next);
  };
  const finish = (event: PointerEvent) => {
    if (penDrag) {
      setPenDrag(null);
      if (surface.current?.hasPointerCapture(event.pointerId))
        surface.current.releasePointerCapture(event.pointerId);
      return;
    }
    if (vectorDrag) {
      const point = designWorldToLocal(
        document,
        vectorDrag.nodeId,
        worldPoint(localPoint(event)),
        sceneNodes,
      );
      const update =
        vectorDrag.kind === "anchor"
          ? { x: point.x, y: point.y }
          : {
              [vectorDrag.kind]: {
                x: point.x - vectorDrag.start.x,
                y: point.y - vectorDrag.start.y,
              },
            };
      const next = updateDesignVectorPoint(document, vectorDrag.nodeId, vectorDrag.index, update);
      if (next !== document) onCommit(next);
      if (surface.current?.hasPointerCapture(event.pointerId))
        surface.current.releasePointerCapture(event.pointerId);
      setVectorDrag(null);
      return;
    }
    if (gradientDrag) {
      const local = designWorldToLocal(
        document,
        gradientDrag.nodeId,
        worldPoint(localPoint(event)),
        sceneNodes,
      );
      const next = updateGradientAngle(document, gradientDrag, local);
      if (next !== document) onCommit(next);
      if (surface.current?.hasPointerCapture(event.pointerId))
        surface.current.releasePointerCapture(event.pointerId);
      setGradientDrag(null);
      return;
    }
    if (!gesture) return;
    if (gesture.kind === "measure") {
      if (surface.current?.hasPointerCapture(event.pointerId))
        surface.current.releasePointerCapture(event.pointerId);
      setGesture(null);
      return;
    }
    const point = localPoint(event);
    const latest = {
      ...gesture,
      point: gesture.kind === "rotate" ? worldPoint(point) : point,
      shift: event.shiftKey,
      alt: event.altKey,
      control: event.ctrlKey,
    };
    if (gesture.kind === "origin") {
      onRotationOriginChange(originDragPoint(latest, zoom, snap), gesture.ids);
      surface.current
        ?.querySelector<HTMLButtonElement>("[data-design-rotation-origin]")
        ?.focus({ preventScroll: true });
    }
    if (gesture.kind === "place-image" && imagePlacement) {
      const origin = worldPoint(gesture.start);
      const size = imagePlacementBox(
        imagePlacement,
        origin,
        worldPoint(point),
        zoom,
        event.shiftKey,
      );
      let next = addImageNode(document, imagePlacement.assetId, null, {
        ...size,
        name: imagePlacement.name,
      });
      const nodeId = next.nodes.at(-1)!.nodeId;
      next = placeInsideFrame(next, nodeId, origin);
      onCommit(next);
      onSelect([nodeId]);
      onImagePlaced?.();
      setTool("select");
    }
    if (
      ["move", "resize", "rotate"].includes(gesture.kind) &&
      (point.x !== gesture.start.x || point.y !== gesture.start.y)
    ) {
      const preview = previewGesture(latest, zoom, snap);
      let next = document;
      for (const node of selectionRoots(preview, gesture.ids)) {
        if (isDesignNodeLocked(next, node.nodeId)) continue;
        const original = gesture.base.nodes.find((candidate) => candidate.nodeId === node.nodeId)!;
        if (!next.nodes.some((candidate) => candidate.nodeId === node.nodeId)) continue;
        const change = Object.fromEntries(
          (["x", "y", "width", "height", "rotation", "layoutSizing"] as const)
            .filter((key) => node[key] !== original[key])
            .map((key) => [key, node[key]]),
        );
        if (gesture.kind === "resize") {
          change.width = node.width;
          change.height = node.height;
        }
        if (Object.keys(change).length) next = updateDesignNode(next, node.nodeId, change);
      }
      if (gesture.kind === "move") {
        const parent = frameAtPoint(worldPoint(point));
        if (parent) {
          for (const node of selectionRoots(next, gesture.ids)) {
            if (node.parentId !== parent.nodeId)
              next = reparentDesignNode(next, node.nodeId, parent.nodeId);
          }
        }
      }
      if (next !== document) onCommit(next);
    }
    if (gesture.kind === "scale") {
      const next = commitDesignNodeTransforms(document, previewGesture(latest, zoom, false));
      if (next !== document) onCommit(next);
    }
    if (gesture.kind === "marquee") {
      const a = worldPoint(gesture.start);
      const b = worldPoint(point);
      const x = Math.min(a.x, b.x),
        y = Math.min(a.y, b.y),
        right = Math.max(a.x, b.x),
        bottom = Math.max(a.y, b.y);
      const ids = Array.from(geometry.values())
        .filter(
          ({ node, bounds: p }) =>
            p &&
            !isDesignNodeLocked(document, node.nodeId, sceneNodes) &&
            p.x >= x &&
            p.y >= y &&
            p.x + p.width <= right &&
            p.y + p.height <= bottom,
        )
        .map(({ node }) => node.nodeId);
      onSelect(gesture.additive ? [...new Set([...selected, ...ids])] : ids);
    }
    if (gesture.kind === "create" && ["line", "arrow", "pencil"].includes(tool)) {
      const a = worldPoint(gesture.start);
      let b = worldPoint(point);
      if (event.shiftKey && tool !== "pencil") {
        const angle = (Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * Math.PI) / 4;
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        b = { x: a.x + Math.cos(angle) * length, y: a.y + Math.sin(angle) * length };
      }
      const points =
        tool === "pencil"
          ? [...(gesture.points ?? [gesture.start]), point].map(worldPoint)
          : [a, b];
      let next = addVectorPath(document, points);
      const node = next.nodes.at(-1)!;
      if (tool === "arrow" && node.vector) {
        const angle = Math.atan2(b.y - a.y, b.x - a.x);
        const head = [Math.PI / 6, -Math.PI / 6].map((delta) => ({
          x: b.x - Math.cos(angle + delta) * 12 - node.x,
          y: b.y - Math.sin(angle + delta) * 12 - node.y,
        }));
        next = updateDesignNode(next, node.nodeId, {
          name: "Arrow",
          vector: {
            ...node.vector,
            path: `${node.vector.path} M ${head[0]!.x} ${head[0]!.y} L ${b.x - node.x} ${b.y - node.y} L ${head[1]!.x} ${head[1]!.y}`,
          },
        });
      }
      next = placeInsideFrame(next, node.nodeId, a);
      onCommit(next);
      onSelect([node.nodeId]);
      setTool("select");
    } else if (gesture.kind === "create") {
      let next =
        tool === "frame" || tool === "section" || tool === "slice"
          ? addFrameNode(document)
          : tool === "text"
            ? addTextNode(document, null)
            : addShapeNode(document);
      const node = next.nodes.at(-1)!;
      const a = worldPoint(gesture.start);
      const b = worldPoint(point);
      // Text creation uses the active frame's local coordinates; other tools create canvas roots.
      const parent =
        node.parentId === null
          ? { x: 0, y: 0 }
          : absoluteNodePosition(
              next,
              next.nodes.find((item) => item.nodeId === node.parentId)!,
            );
      next = updateDesignNode(next, node.nodeId, {
        x: Math.min(a.x, b.x) - parent.x,
        y: Math.min(a.y, b.y) - parent.y,
        width: Math.abs(a.x - b.x) > 3 ? Math.abs(a.x - b.x) : node.width,
        height: Math.abs(a.y - b.y) > 3 ? Math.abs(a.y - b.y) : node.height,
        ...(tool === "ellipse" ? { name: "Ellipse", paint: { ...node.paint, radius: 9999 } } : {}),
        ...(tool === "section" ? { name: "Section", clipContent: false, section: true } : {}),
        ...(tool === "slice" ? { name: "Slice", clipContent: false, slice: true } : {}),
      });
      if (tool !== "frame" && tool !== "section" && tool !== "slice")
        next = placeInsideFrame(next, node.nodeId, a);
      onCommit(next);
      onSelect([node.nodeId]);
      setTool("select");
    }
    if (gesture.guide) {
      const { axis, index } = gesture.guide;
      const rect = surface.current!.getBoundingClientRect();
      const outside = point.x < 20 || point.y < 20 || point.x > rect.width || point.y > rect.height;
      commitGuides({
        ...guides,
        [axis]: outside
          ? guides[axis].filter((_, i) => i !== index)
          : guides[axis].map((guide, i) =>
              i === index ? { ...guide, value: Math.round(worldPoint(point)[axis]) } : guide,
            ),
      });
    }
    if (surface.current?.hasPointerCapture(event.pointerId))
      surface.current.releasePointerCapture(event.pointerId);
    setGesture(null);
  };
  const finishPen = (closed = false) => {
    if (penPoints.length > 1) {
      let next = addVectorPath(document, penPoints, closed);
      const nodeId = next.nodes.at(-1)!.nodeId;
      next = placeInsideFrame(next, nodeId, penPoints[0]!);
      onCommit(next);
      onSelect([nodeId]);
    }
    setPenPoints([]);
    setPenHover(null);
    setTool("select");
  };
  const chooseTool = (next: DesignTool) => {
    if (imagePlacement) onCancelPlacement?.();
    setTool(next);
    setPenPoints([]);
    surface.current?.focus({ preventScroll: true });
  };
  const fit = (ids: readonly string[]) => {
    const target = bounds(document, ids);
    const rect = surface.current?.getBoundingClientRect();
    if (!target || !rect) return;
    const camera = fittedCamera(target, rect, 4);
    setZoom(camera.zoom);
    setPan(camera.pan);
  };
  const changeZoom = (value: number) => {
    const next = Math.min(256, Math.max(0.01, value));
    setPan({
      x: viewportSize.width / 2 - ((viewportSize.width / 2 - pan.x) * next) / zoom,
      y: viewportSize.height / 2 - ((viewportSize.height / 2 - pan.y) * next) / zoom,
    });
    setZoom(next);
  };

  const handleToolKey = useStableCallback((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.repeat || event.isComposing) return;
    const target = event.target;
    if (
      !(target instanceof HTMLElement) ||
      target.closest(
        "input,textarea,select,[contenteditable=true],[role=combobox],[role=dialog],[role=menu],[role=listbox]",
      )
    )
      return;
    if (
      event.code === "KeyR" &&
      event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      setGesture((current) => (current?.kind === "origin" ? null : current));
      onRotationOriginToggle();
      return;
    }
    if (
      event.code === "KeyP" &&
      event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      event.altKey === !isMacPlatform(navigator.platform)
    ) {
      event.preventDefault();
      event.stopPropagation();
      changePixelPreview(pixelPreview.density === 0 ? 1 : 0);
      return;
    }
    if (event.altKey) return;
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.code === "KeyK") {
      event.preventDefault();
      event.stopPropagation();
      chooseTool("select");
      onImport();
      return;
    }
    if (event.code === "Quote" && (event.shiftKey || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.stopPropagation();
      if (event.shiftKey && (event.metaKey || event.ctrlKey)) setSnap((value) => !value);
      else setShowPixelGrid((value) => !value);
      return;
    }
    if (event.shiftKey && event.code === "KeyR" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      event.stopPropagation();
      setShowRulers((value) => !value);
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.code === "KeyY") {
      event.preventDefault();
      event.stopPropagation();
      setOutlines((value) => !value);
      return;
    }
    if (event.shiftKey && (event.code === "Equal" || event.code === "Minus")) {
      event.preventDefault();
      event.stopPropagation();
      changeZoom(zoom * (event.code === "Equal" ? 1.2 : 1 / 1.2));
      return;
    }
    if (event.metaKey || event.ctrlKey) return;
    if (
      event.shiftKey &&
      (["KeyH", "KeyV"].includes(event.code) || ["h", "v"].includes(event.key.toLowerCase()))
    )
      return;
    const tools: Record<string, DesignTool> = {
      v: "select",
      k: "scale",
      h: "hand",
      f: "frame",
      s: "section",
      r: "rectangle",
      o: "ellipse",
      t: "text",
      m: "measure",
      c: "comment",
      l: "line",
      p: event.shiftKey ? "pencil" : "pen",
    };
    const key = event.key.toLowerCase();
    const next =
      tools[key] ??
      (event.code.startsWith("Key") ? tools[event.code.slice(3).toLowerCase()] : undefined);
    if (next) {
      event.preventDefault();
      event.stopPropagation();
      chooseTool(next);
    } else if (event.shiftKey && (event.code === "Digit1" || event.code === "Digit2")) {
      event.preventDefault();
      event.stopPropagation();
      fit(event.code === "Digit1" ? nodeForPage(document).map((node) => node.nodeId) : selected);
    }
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Tool shortcuts belong to this editor's DOM scope and are removed with the canvas.
  useEffect(() => {
    const element =
      surface.current?.closest<HTMLElement>("[data-design-workspace]") ?? surface.current;
    if (!element) return;
    element.addEventListener("keydown", handleToolKey);
    return () => element.removeEventListener("keydown", handleToolKey);
  }, [handleToolKey]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- non-passive wheel input prevents browser page zoom while the canvas handles it.
  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    const listener = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        const next = Math.min(256, Math.max(0.01, zoom * Math.exp(-event.deltaY * 0.01)));
        setPan({
          x: point.x - ((point.x - pan.x) * next) / zoom,
          y: point.y - ((point.y - pan.y) * next) / zoom,
        });
        setZoom(next);
      } else setPan({ x: pan.x - event.deltaX, y: pan.y - event.deltaY });
    };
    element.addEventListener("wheel", listener, { passive: false });
    return () => element.removeEventListener("wheel", listener);
  }, [pan.x, pan.y, zoom, surface]);
  const transientBox =
    gesture && (gesture.kind === "marquee" || gesture.kind === "create")
      ? {
          x: (Math.min(gesture.start.x, gesture.point.x) - pan.x) / zoom,
          y: (Math.min(gesture.start.y, gesture.point.y) - pan.y) / zoom,
          width: Math.abs(gesture.point.x - gesture.start.x) / zoom,
          height: Math.abs(gesture.point.y - gesture.start.y) / zoom,
        }
      : null;
  const imageBox = imagePlacement
    ? gesture?.kind === "place-image"
      ? imagePlacementBox(
          imagePlacement,
          worldPoint(gesture.start),
          worldPoint(gesture.point),
          zoom,
          gesture.shift,
        )
      : placementCursor
        ? {
            ...worldPoint(placementCursor),
            width: imagePlacement.width,
            height: imagePlacement.height,
          }
        : null
    : null;
  const imageDraft: DesignNode | null =
    imagePlacement && imageBox
      ? {
          nodeId: "design-image-placement-preview",
          kind: "image",
          name: imagePlacement.name,
          parentId: null,
          childIds: [],
          ...imageBox,
          x: 0,
          y: 0,
          fill: "transparent",
          border: null,
          text: null,
          fontSize: null,
          fontWeight: null,
          opacity: 0.65,
          assetId: imagePlacement.assetId,
          provenance: null,
          paint: { borderWidth: 0, radius: 0 },
        }
      : null;
  const beginGuide = (event: PointerEvent, axis: "x" | "y", index?: number) => {
    start(event, "guide", []);
    const point = worldPoint(localPoint(event));
    const position = index ?? guides[axis].length;
    const id = `guide-${document.revision}-${++guideSequence.current}`;
    if (index === undefined)
      setGuides((current) => ({
        ...current,
        [axis]: [...current[axis], { id, value: Math.round(point[axis]) }],
      }));
    setGesture((current) => (current ? { ...current, guide: { axis, index: position } } : null));
  };
  const viewMenu = (
    <DesignCanvasViewMenu
      zoom={zoom}
      onZoom={changeZoom}
      onFit={(selection) =>
        fit(
          selection && selected.length
            ? selected
            : nodeForPage(document).map((node) => node.nodeId),
        )
      }
      rulers={showRulers}
      onRulers={setShowRulers}
      pixelGrid={showPixelGrid}
      onPixelGrid={setShowPixelGrid}
      pixelPreview={pixelPreview.density}
      onPixelPreview={changePixelPreview}
      snap={snap}
      onSnap={setSnap}
      guides={showGuides}
      onGuides={setShowGuides}
      outlines={outlines}
      onOutlines={setOutlines}
      propertyLabels={propertyLabels}
      onPropertyLabels={onPropertyLabels}
    />
  );
  return (
    <main
      {...workspaceAreaProps("design-canvas", 1, "Design canvas")}
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/30"
      style={pageBackground ? { background: pageBackground } : undefined}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        const files = Array.from(event.dataTransfer.files);
        if (!files.length) return;
        event.preventDefault();
        const rect = surface.current?.getBoundingClientRect();
        if (rect)
          onDropImages?.(
            files,
            imageTarget(worldPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top })),
          );
      }}
    >
      <div
        ref={surface}
        data-design-surface=""
        tabIndex={0}
        aria-label="Canvas editing surface"
        className={cn(
          "absolute inset-0 touch-none overflow-hidden outline-none",
          activeTool === "hand"
            ? "cursor-grab"
            : activeTool === "select" || activeTool === "scale"
              ? "cursor-default"
              : "cursor-crosshair",
        )}
        onKeyDown={(event) => {
          if (
            event.target instanceof HTMLElement &&
            event.target.closest("input,textarea,select,[contenteditable=true],[role=combobox]")
          )
            return;
          if (event.code === "Space") {
            event.preventDefault();
            setSpace(true);
            return;
          }
          if (event.key === "Escape") {
            if (gesture?.kind === "origin" || gesture?.kind === "rotate") {
              event.preventDefault();
              event.stopPropagation();
              setGesture(null);
              return;
            }
            if (rotationOriginVisible && activeTool === "select" && originPoint) {
              event.preventDefault();
              event.stopPropagation();
              onRotationOriginToggle();
              return;
            }
            onCancelPlacement?.();
            setGesture(null);
            setPenPoints([]);
            setGuideDraft(null);
            setTool("select");
            onSelect([]);
            return;
          }
          if (
            imagePlacement &&
            (["Delete", "Backspace"].includes(event.key) ||
              ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z"))
          ) {
            event.preventDefault();
            chooseTool("select");
            setGesture(null);
            return;
          }
          if (event.key === "Enter" && tool === "pen") {
            event.preventDefault();
            finishPen();
            return;
          }
          onKeyDown(event);
        }}
        onKeyUp={(event) => {
          if (event.code === "Space") setSpace(false);
        }}
        onBlur={() => setSpace(false)}
        onPointerDown={(event) => {
          if (event.button === 1 || activeTool === "hand") start(event, "pan", []);
          else if (activeTool === "image") start(event, "place-image", []);
          else if (activeTool === "measure") start(event, "measure", []);
          else if (activeTool === "comment") {
            const point = worldPoint(localPoint(event));
            onAddComment?.(point, frameAtPoint(point)?.nodeId ?? null);
            setTool("select");
          } else if (activeTool === "pen") {
            event.preventDefault();
            surface.current?.focus({ preventScroll: true });
            const point = worldPoint(localPoint(event));
            if (
              penPoints.length > 2 &&
              Math.hypot(point.x - penPoints[0]!.x, point.y - penPoints[0]!.y) * zoom < 8
            )
              finishPen(true);
            else {
              const id = ++pointSequence.current;
              setPenPoints((points) => {
                const last = points.at(-1);
                return last && Math.hypot(point.x - last.x, point.y - last.y) < 0.5
                  ? points
                  : [...points, { ...point, id }];
              });
              setPenDrag({ id, pointerId: event.pointerId, anchor: point });
              surface.current?.setPointerCapture(event.pointerId);
            }
          } else if (activeTool === "select" || activeTool === "scale") start(event, "marquee", []);
          else start(event, "create", []);
        }}
        onDoubleClick={() => {
          if (tool === "pen") finishPen();
        }}
        onPointerMove={move}
        onPointerLeave={() => {
          if (!gesture) setPlacementCursor(null);
        }}
        onPointerUp={finish}
        onPointerCancel={() => {
          setPenDrag(null);
          setGradientDrag(null);
          setGesture(null);
          setGuideDraft(null);
        }}
        onLostPointerCapture={() => {
          setPenDrag(null);
          setGradientDrag(null);
          setGesture(null);
        }}
      >
        <div
          className="absolute h-px w-px origin-top-left"
          data-design-world=""
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          <DesignPixelPreview
            document={shown}
            mode={pixelPreview}
            suspended={gesture !== null || outlines}
            zoom={zoom}
            viewport={{
              x: -pan.x / zoom,
              y: -pan.y / zoom,
              width: viewportSize.width / zoom,
              height: viewportSize.height / zoom,
            }}
            labels={nodeForPage(shown)
              .filter(
                (node) =>
                  (node.kind === "frame" || node.section === true) &&
                  visibleNodeIds.has(node.nodeId),
              )
              .map((node) => (
                <div
                  key={node.nodeId}
                  className="absolute"
                  style={{
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                    transform: `rotate(${node.rotation ?? 0}deg)`,
                    opacity: node.opacity,
                  }}
                >
                  <span
                    className="absolute start-0 whitespace-nowrap text-muted-foreground"
                    style={{ top: -24 / zoom, fontSize: 12 / zoom, lineHeight: `${16 / zoom}px` }}
                  >
                    {node.name}
                  </span>
                </div>
              ))}
          >
            {nodeForPage(shown)
              .filter((node) => visibleNodeIds.has(node.nodeId))
              .map((node) => (
                <DesignSceneNode
                  key={node.nodeId}
                  document={shown}
                  nodeMap={sceneNodes}
                  visibleNodeIds={visibleNodeIds}
                  node={node}
                  selected={selected}
                  tool={activeTool}
                  outlines={outlines}
                  canvasZoom={zoom}
                  onStart={startNode}
                  onActivate={(id) => onSelect([id])}
                  onTextChange={(id, text) => onCommit(updateDesignNode(document, id, { text }))}
                  onVectorHandleStart={startVectorHandle}
                  onGradientHandleStart={startGradientHandle}
                />
              ))}
          </DesignPixelPreview>
          {comments.map((comment) => (
            <div
              key={comment.commentId}
              className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full"
              style={{ left: comment.x, top: comment.y }}
            >
              <button
                type="button"
                className="pointer-events-auto flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                aria-label={`Comment: ${comment.text}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => setEditingCommentId(comment.commentId)}
              >
                <span aria-hidden="true" className="size-2 rounded-full bg-current" />
              </button>
              {editingCommentId === comment.commentId ? (
                <div className="pointer-events-auto absolute start-0 top-7 w-56 rounded-md border border-border bg-background p-2 shadow-lg">
                  <textarea
                    autoFocus
                    aria-label="Comment text"
                    className="w-full resize-none bg-transparent p-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    value={comment.text}
                    onPointerDown={(event) => event.stopPropagation()}
                    onChange={(event) => onUpdateComment?.(comment.commentId, event.target.value)}
                    rows={3}
                  />
                  <div className="mt-1 flex items-center justify-end gap-1 border-t border-border pt-1">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={comment.resolved ? "Reopen comment" : "Resolve comment"}
                      title={comment.resolved ? "Reopen comment" : "Resolve comment"}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => onResolveComment?.(comment.commentId, !comment.resolved)}
                    >
                      <CheckIcon className={cn("size-3.5", comment.resolved && "text-primary")} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Delete comment"
                      title="Delete comment"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => {
                        onDeleteComment?.(comment.commentId);
                        setEditingCommentId(null);
                      }}
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {gesture?.kind === "measure" ? (
            <svg
              className="pointer-events-none absolute overflow-visible"
              style={{
                width: Math.max(1, viewportSize.width / zoom),
                height: Math.max(1, viewportSize.height / zoom),
              }}
              role="img"
              aria-label={`Measurement ${Math.round(Math.abs(gesture.point.x - gesture.start.x))} × ${Math.round(Math.abs(gesture.point.y - gesture.start.y))}`}
            >
              <line
                x1={gesture.start.x}
                y1={gesture.start.y}
                x2={gesture.point.x}
                y2={gesture.point.y}
                stroke="var(--primary)"
                strokeWidth={1 / zoom}
                strokeDasharray={`${4 / zoom} ${3 / zoom}`}
              />
              <circle
                cx={gesture.start.x}
                cy={gesture.start.y}
                r={3 / zoom}
                fill="var(--primary)"
              />
              <circle
                cx={gesture.point.x}
                cy={gesture.point.y}
                r={3 / zoom}
                fill="var(--primary)"
              />
              <text
                x={(gesture.start.x + gesture.point.x) / 2}
                y={Math.min(gesture.start.y, gesture.point.y) - 8 / zoom}
                fill="var(--primary)"
                fontSize={12 / zoom}
                textAnchor="middle"
              >
                {Math.round(Math.abs(gesture.point.x - gesture.start.x))} ×{" "}
                {Math.round(Math.abs(gesture.point.y - gesture.start.y))}
              </text>
            </svg>
          ) : null}
          {imageDraft && imageBox && activeTool === "image" ? (
            <div
              data-design-image-preview=""
              aria-hidden="true"
              className="pointer-events-none absolute outline outline-primary"
              style={{
                left: imageBox.x,
                top: imageBox.y,
                width: imageBox.width,
                height: imageBox.height,
              }}
            >
              <DesignSceneNode
                document={document}
                node={imageDraft}
                nodeMap={sceneNodes}
                selected={[]}
              />
            </div>
          ) : null}
          {tool === "pen" && !imagePlacement && penPoints.length ? (
            <svg
              className="pointer-events-none absolute overflow-visible"
              style={{ width: 1, height: 1 }}
              aria-hidden="true"
            >
              <polyline
                points={[...penPoints, ...(penHover ? [penHover] : [])]
                  .map((point) => `${point.x},${point.y}`)
                  .join(" ")}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={1 / zoom}
              />
              {penPoints.map((point) => (
                <rect
                  key={point.id}
                  x={point.x - 3 / zoom}
                  y={point.y - 3 / zoom}
                  width={6 / zoom}
                  height={6 / zoom}
                  fill="var(--background)"
                  stroke="var(--primary)"
                  strokeWidth={1 / zoom}
                />
              ))}
            </svg>
          ) : null}
          {box ? (
            <div
              data-design-selection=""
              className="pointer-events-none absolute"
              style={{
                left: box.x,
                top: box.y,
                width: box.width,
                height: box.height,
                transform: `rotate(${box.rotation}deg)`,
              }}
            >
              <svg aria-hidden="true" className="absolute inset-0 size-full overflow-visible">
                <rect
                  width="100%"
                  height="100%"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth={1 / zoom}
                />
              </svg>
              {selected.some((id) => !isDesignNodeLocked(shown, id))
                ? HANDLES.map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      aria-label={`${tool === "scale" ? "Scale" : "Resize"} ${handle}`}
                      className="pointer-events-auto absolute size-2 -translate-x-1/2 -translate-y-1/2 border border-primary bg-background"
                      style={{
                        left: `${positions[handle][0]}%`,
                        top: `${positions[handle][1]}%`,
                        transform: `scale(${1 / zoom})`,
                      }}
                      onPointerDown={(event) =>
                        start(event, tool === "scale" ? "scale" : "resize", selected, handle)
                      }
                    />
                  ))
                : null}
              {tool !== "scale" && selected.some((id) => !isDesignNodeLocked(shown, id))
                ? (["nw", "ne", "se", "sw"] as const).map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      aria-label={
                        handle === "ne" ? "Rotate selection" : `Rotate selection ${handle}`
                      }
                      className="pointer-events-auto absolute outline-none focus-visible:outline-2 focus-visible:outline-primary"
                      style={{
                        left: positions[handle][0] === 0 ? -20 / zoom : box.width + 4 / zoom,
                        top: positions[handle][1] === 0 ? -20 / zoom : box.height + 4 / zoom,
                        width: 16 / zoom,
                        height: 16 / zoom,
                        cursor: rotationCursor,
                      }}
                      onPointerDown={(event) => start(event, "rotate", selected)}
                    />
                  ))
                : null}
            </div>
          ) : null}
          {rotationOriginVisible && originPoint && rotationBox && activeTool === "select" ? (
            <DesignRotationOriginHandle
              point={
                gesture?.kind === "origin" ? originDragPoint(gesture, zoom, snap) : originPoint
              }
              zoom={zoom}
              disabled={!canMoveOrigin}
              onStart={(event) => start(event, "origin", selected)}
              onChange={(point) => onRotationOriginChange(point, selected)}
              onReset={() => onRotationOriginChange(null, selected)}
            />
          ) : null}
          {transientBox ? (
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute overflow-visible"
              style={{
                left: transientBox.x,
                top: transientBox.y,
                width: transientBox.width,
                height: transientBox.height,
              }}
            >
              <rect
                width="100%"
                height="100%"
                fill="var(--primary)"
                fillOpacity={0.1}
                stroke="var(--primary)"
                strokeWidth={1 / zoom}
              />
            </svg>
          ) : null}
          {showGuides ? (
            <>
              {guides.x.map((guide, index) => (
                <div
                  key={guide.id}
                  aria-label={`Vertical guide ${guide.value}`}
                  className="absolute -top-[100000px] h-[200000px] w-px cursor-ew-resize bg-primary/60"
                  style={{ left: guide.value, width: 1 / zoom }}
                  onPointerDown={(event) => beginGuide(event, "x", index)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    commitGuides({ ...guides, x: guides.x.filter((item) => item.id !== guide.id) });
                  }}
                />
              ))}
              {guides.y.map((guide, index) => (
                <div
                  key={guide.id}
                  aria-label={`Horizontal guide ${guide.value}`}
                  className="absolute -start-[100000px] h-px w-[200000px] cursor-ns-resize bg-primary/60"
                  style={{ top: guide.value, height: 1 / zoom }}
                  onPointerDown={(event) => beginGuide(event, "y", index)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    commitGuides({ ...guides, y: guides.y.filter((item) => item.id !== guide.id) });
                  }}
                />
              ))}
            </>
          ) : null}
        </div>
      </div>
      {showPixelGrid && zoom >= 4 ? (
        <div
          data-design-pixel-grid=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, color-mix(in srgb, var(--foreground) 12%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--foreground) 12%, transparent) 1px, transparent 1px)",
            backgroundSize: `${zoom}px ${zoom}px`,
            backgroundPosition: `${pan.x}px ${pan.y}px`,
          }}
        />
      ) : null}
      {showRulers ? (
        <>
          <div
            className="absolute inset-x-0 top-0 h-5 overflow-hidden border-b border-border bg-background/90"
            aria-label="Drag down to create a horizontal guide"
            onPointerDown={(event) => beginGuide(event, "y")}
          >
            {Array.from({ length: 40 }, (_, i) => i - 10).map((i) => (
              <span
                key={i}
                className="absolute h-full border-s border-border ps-1 text-4xs text-muted-foreground"
                style={{ left: pan.x + i * 100 * zoom }}
              >
                {i * 100}
              </span>
            ))}
          </div>
          <div
            className="absolute inset-y-0 start-0 w-5 overflow-hidden border-e border-border bg-background/90"
            aria-label="Drag right to create a vertical guide"
            onPointerDown={(event) => beginGuide(event, "x")}
          >
            {Array.from({ length: 40 }, (_, i) => i - 10).map((i) => (
              <span
                key={i}
                className="absolute w-full border-t border-border text-4xs text-muted-foreground"
                style={{ top: pan.y + i * 100 * zoom }}
              >
                {i * 100}
              </span>
            ))}
          </div>
        </>
      ) : null}
      <div className="absolute end-3 top-3">{viewMenu}</div>
      <div
        className={
          showTools
            ? "absolute bottom-4 start-1/2 flex max-w-[calc(100%-3rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-xl border border-border bg-background p-1 shadow-lg"
            : "hidden"
        }
        aria-label="Design tools"
        role="toolbar"
      >
        <ToolButton
          label={tool === "scale" ? "Scale (K)" : "Move (V)"}
          active={tool === "select" || tool === "scale"}
          onClick={() => chooseTool(tool === "scale" ? "scale" : "select")}
        >
          {tool === "scale" ? <ScalingIcon /> : <MousePointer2Icon />}
        </ToolButton>
        <Menu>
          <MenuTrigger
            render={<Button size="icon-xs" variant="ghost" aria-label="Move and scale tools" />}
          >
            <ChevronDownIcon />
          </MenuTrigger>
          <MenuPopup side="top" align="start">
            <MenuItem onClick={() => chooseTool("select")}>
              <MousePointer2Icon /> Move <span className="ms-auto text-muted-foreground">V</span>
            </MenuItem>
            <MenuItem onClick={() => chooseTool("scale")}>
              <ScalingIcon /> Scale <span className="ms-auto text-muted-foreground">K</span>
            </MenuItem>
          </MenuPopup>
        </Menu>
        <ToolButton
          label="Hand (H / Space)"
          active={tool === "hand"}
          onClick={() => chooseTool("hand")}
        >
          <HandIcon />
        </ToolButton>
        <ToolButton
          label="Measure (M)"
          active={tool === "measure"}
          onClick={() => chooseTool("measure")}
        >
          <RulerIcon />
        </ToolButton>
        <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        <ToolButton
          label="Frame tool (F)"
          active={tool === "frame"}
          onClick={() => chooseTool("frame")}
        >
          <FrameIcon />
        </ToolButton>
        <ToolButton
          label="Section tool (S)"
          active={tool === "section"}
          onClick={() => chooseTool("section")}
        >
          <PanelsTopLeftIcon />
        </ToolButton>
        <ToolButton
          label="Slice tool"
          active={tool === "slice"}
          onClick={() => chooseTool("slice")}
        >
          <CropIcon />
        </ToolButton>
        <ToolButton
          label="Comment tool (C)"
          active={tool === "comment"}
          onClick={() => chooseTool("comment")}
        >
          <MessageCircleIcon />
        </ToolButton>
        <Menu>
          <Tooltip>
            <TooltipTrigger
              render={
                <MenuTrigger
                  render={
                    <Button
                      size="sm"
                      variant={
                        ["rectangle", "ellipse", "line", "arrow"].includes(tool)
                          ? "secondary"
                          : "ghost"
                      }
                      aria-label="Shape tools"
                    />
                  }
                />
              }
            >
              {tool === "ellipse" ? (
                <CircleIcon />
              ) : tool === "line" || tool === "arrow" ? (
                <LineIcon />
              ) : (
                <SquareIcon />
              )}
              <ChevronDownIcon />
            </TooltipTrigger>
            <TooltipPopup>Shape tools</TooltipPopup>
          </Tooltip>
          <MenuPopup side="top">
            {(["rectangle", "ellipse", "line", "arrow"] as const).map((value) => (
              <MenuItem key={value} onClick={() => chooseTool(value)}>
                {value === "rectangle"
                  ? "Rectangle (R)"
                  : value === "ellipse"
                    ? "Ellipse (O)"
                    : value === "line"
                      ? "Line (L)"
                      : "Arrow"}
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
        <Menu>
          <Tooltip>
            <TooltipTrigger
              render={
                <MenuTrigger
                  render={
                    <Button
                      size="sm"
                      variant={tool === "pen" || tool === "pencil" ? "secondary" : "ghost"}
                      aria-label="Drawing tools"
                    />
                  }
                />
              }
            >
              {tool === "pencil" ? <PencilIcon /> : <PenToolIcon />}
              <ChevronDownIcon />
            </TooltipTrigger>
            <TooltipPopup>Drawing tools</TooltipPopup>
          </Tooltip>
          <MenuPopup side="top">
            <MenuItem onClick={() => chooseTool("pen")}>Pen (P)</MenuItem>
            <MenuItem onClick={() => chooseTool("pencil")}>Pencil (Shift P)</MenuItem>
          </MenuPopup>
        </Menu>
        {selected.length > 1 && onBoolean ? (
          <Menu>
            <Tooltip>
              <TooltipTrigger
                render={
                  <MenuTrigger
                    render={<Button size="sm" variant="ghost" aria-label="Boolean operations" />}
                  />
                }
              >
                <PanelsTopLeftIcon />
                <ChevronDownIcon />
              </TooltipTrigger>
              <TooltipPopup>Boolean operations</TooltipPopup>
            </Tooltip>
            <MenuPopup side="top">
              <MenuItem onClick={() => onBoolean("union")}>Union selection</MenuItem>
              <MenuItem onClick={() => onBoolean("flatten")}>Flatten selection</MenuItem>
              <MenuItem onClick={() => onBoolean("subtract")}>Subtract selection</MenuItem>
              <MenuItem onClick={() => onBoolean("intersect")}>Intersect selection</MenuItem>
              <MenuItem onClick={() => onBoolean("exclude")}>Exclude selection</MenuItem>
            </MenuPopup>
          </Menu>
        ) : null}
        <ToolButton label="Text (T)" active={tool === "text"} onClick={() => chooseTool("text")}>
          <TypeIcon />
        </ToolButton>
        <ToolButton
          label="Place image"
          active={imagePlacement !== null}
          onClick={() => {
            setTool("select");
            setPenPoints([]);
            onImport();
          }}
        >
          <ImageIcon />
        </ToolButton>
        <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        <ToolButton
          label="Undo"
          disabled={!canUndo}
          onClick={() => {
            onUndo();
            surface.current?.focus({ preventScroll: true });
          }}
        >
          <Undo2Icon />
        </ToolButton>
        <ToolButton
          label="Redo"
          disabled={!canRedo}
          onClick={() => {
            onRedo();
            surface.current?.focus({ preventScroll: true });
          }}
        >
          <Redo2Icon />
        </ToolButton>
      </div>
      {imagePlacement ? (
        <div
          role="status"
          className="absolute bottom-20 left-1/2 z-10 flex max-w-[90%] -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 shadow-sm"
        >
          <p className="min-w-0 text-xs">
            <span className="block truncate font-medium">
              Place {imagePlacement.name}
              {placementCount > 1 ? ` · ${placementCount} remaining` : ""}
            </span>
            <span className="text-2xs text-muted-foreground">
              Click for original size · Drag to resize · Shift for free sizing
            </span>
          </p>
          {placementCount > 1 && onPlaceAllImages ? (
            <Button
              size="xs"
              variant="secondary"
              onClick={() => {
                const rect = surface.current?.getBoundingClientRect();
                if (rect)
                  onPlaceAllImages(
                    imageTarget(worldPoint({ x: rect.width / 2, y: rect.height / 2 })),
                  );
              }}
            >
              Place all
            </Button>
          ) : null}
          <Button size="xs" variant="ghost-muted" onClick={() => chooseTool("select")}>
            Cancel
          </Button>
        </div>
      ) : null}
    </main>
  );
}
