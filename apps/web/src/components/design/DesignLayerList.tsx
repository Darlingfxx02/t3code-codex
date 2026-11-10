import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useStableCallback } from "../../hooks/useStableCallback";
import { observeResize } from "../../lib/observeResize";
import { nodeForPage, type DesignDocument, type DesignNode } from "./designDocument";

export type DesignLayerEntry = {
  node: DesignNode;
  depth: number;
  locked: boolean;
  parentLocked: boolean;
  expanded: boolean;
  hasChildren: boolean;
};

export function flattenDesignLayers(document: DesignDocument, expanded: ReadonlySet<string>) {
  const nodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const rows: DesignLayerEntry[] = [];
  const seen = new Set<string>();
  const stack = nodeForPage(document)
    .toReversed()
    .map((node) => ({ node, depth: 0, parentLocked: false }));
  while (stack.length) {
    const entry = stack.pop()!;
    const { node, depth, parentLocked } = entry;
    if (seen.has(node.nodeId)) continue;
    seen.add(node.nodeId);
    const locked = parentLocked || node.locked === true;
    rows.push({
      ...entry,
      locked,
      expanded: expanded.has(node.nodeId),
      hasChildren: node.childIds.some((id) => nodes.has(id)),
    });
    if (!expanded.has(node.nodeId)) continue;
    for (const id of node.childIds.toReversed()) {
      const child = nodes.get(id);
      if (child) stack.push({ node: child, depth: depth + 1, parentLocked: locked });
    }
  }
  return rows;
}

const ROW_HEIGHT = 28;
const OVERSCAN = 8;

export function DesignLayerList({
  rows,
  scrollRef,
  selectedId,
  onSelect,
  onToggleExpand,
  renderRow,
}: {
  rows: readonly DesignLayerEntry[];
  scrollRef: RefObject<HTMLDivElement | null>;
  selectedId: string | null;
  onSelect: (id: string, additive: boolean) => void;
  onToggleExpand: (id: string) => void;
  renderRow: (entry: DesignLayerEntry) => ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string } | null>(null);
  const lastSelected = useRef<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });
  const measure = useStableCallback(() => {
    const scroller = scrollRef.current,
      content = body.current;
    if (!scroller || !content) return;
    const offset =
      content.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    const top = Math.max(0, scroller.scrollTop - offset),
      height = scroller.clientHeight;
    setViewport((current) =>
      current.top === top && current.height === height ? current : { top, height },
    );
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- The virtual window follows the external scroll container and its measured viewport.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const stop = observeResize(element, measure);
    return () => {
      element.removeEventListener("scroll", measure);
      stop();
    };
  }, [scrollRef, measure]);
  const reveal = useStableCallback((index: number) => {
    const element = scrollRef.current,
      content = body.current;
    if (!element || !content) return;
    const offset =
      content.getBoundingClientRect().top - element.getBoundingClientRect().top + element.scrollTop;
    const top = offset + index * ROW_HEIGHT,
      bottom = top + ROW_HEIGHT;
    if (top < element.scrollTop) element.scrollTop = top;
    else if (bottom > element.scrollTop + element.clientHeight)
      element.scrollTop = bottom - element.clientHeight;
    measure();
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Reveal a newly selected canvas layer in the scroll viewport without resetting deliberate scrolling of an unchanged selection.
  useEffect(() => {
    if (selectedId === lastSelected.current) return;
    lastSelected.current = selectedId;
    const index = rows.findIndex((entry) => entry.node.nodeId === selectedId);
    if (index >= 0) reveal(index);
  }, [selectedId, rows, reveal]);
  const start = Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(
    rows.length,
    Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT) + OVERSCAN,
  );
  const indexes = new Set(Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i));
  for (const id of [focusedId, draggedId]) {
    const index = id ? rows.findIndex((entry) => entry.node.nodeId === id) : -1;
    if (index >= 0) indexes.add(index);
  }
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keyboard navigation can target an unmounted row; focus it after that row enters the virtual window.
  useLayoutEffect(() => {
    if (!focusRequest) return;
    body.current
      ?.querySelector<HTMLElement>(
        `[data-design-layer-row="${CSS.escape(focusRequest.id)}"] [data-design-layer-name]`,
      )
      ?.focus({ preventScroll: true });
  }, [focusRequest]);

  return (
    <div
      ref={body}
      role="list"
      aria-label="Design layer list"
      style={{ position: "relative", height: rows.length * ROW_HEIGHT }}
      onFocusCapture={(event) => {
        const id =
          event.target.closest<HTMLElement>("[data-design-layer-row]")?.dataset.designLayerRow;
        if (id) setFocusedId(id);
      }}
      onDragStartCapture={(event) => {
        const id = (event.target as HTMLElement).closest<HTMLElement>("[data-design-layer-row]")
          ?.dataset.designLayerRow;
        if (id) setDraggedId(id);
      }}
      onDragEndCapture={() => setDraggedId(null)}
      onDropCapture={() => setDraggedId(null)}
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest("input,textarea,[contenteditable=true]") ||
          event.metaKey ||
          event.ctrlKey ||
          event.altKey
        )
          return;
        const id = target.closest<HTMLElement>("[data-design-layer-row]")?.dataset.designLayerRow;
        const index = rows.findIndex((entry) => entry.node.nodeId === id);
        if (index < 0) return;
        const row = rows[index]!;
        let next = index;
        if (event.key === "ArrowDown") next++;
        else if (event.key === "ArrowUp") next--;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = rows.length - 1;
        else if (event.key === "ArrowRight") {
          if (row.hasChildren && !row.expanded) {
            event.preventDefault();
            onToggleExpand(row.node.nodeId);
            return;
          }
          if (rows[index + 1]?.depth === row.depth + 1) next++;
        } else if (event.key === "ArrowLeft") {
          if (row.expanded && row.hasChildren) {
            event.preventDefault();
            onToggleExpand(row.node.nodeId);
            return;
          }
          const parent = rows.findIndex((entry) => entry.node.nodeId === row.node.parentId);
          if (parent >= 0) next = parent;
        } else return;
        event.preventDefault();
        const node = rows[Math.max(0, Math.min(rows.length - 1, next))]?.node;
        if (!node) return;
        setFocusRequest({ id: node.nodeId });
        setFocusedId(node.nodeId);
        onSelect(node.nodeId, false);
        reveal(Math.max(0, Math.min(rows.length - 1, next)));
      }}
    >
      {Array.from(indexes)
        .sort((a, b) => a - b)
        .map((index) => {
          const entry = rows[index]!;
          return (
            <div
              key={entry.node.nodeId}
              data-design-layer-row={entry.node.nodeId}
              role="listitem"
              aria-posinset={index + 1}
              aria-setsize={rows.length}
              style={{
                position: "absolute",
                top: index * ROW_HEIGHT,
                height: ROW_HEIGHT,
                width: "100%",
              }}
            >
              {renderRow(entry)}
            </div>
          );
        })}
    </div>
  );
}
