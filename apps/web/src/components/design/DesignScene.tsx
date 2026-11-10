import { ImageOffIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import {
  isDesignNodeInFlow,
  designEffectRegion,
  type DesignDocument,
  type DesignNode,
  type DesignInteraction,
} from "./designDocument";
import { designEffectsSvg, designEffectsStyle } from "./designEffects";
import { readDesignAsset } from "./designAssetStore";
import { designImageStyle, designImageBorderStyle } from "./designImage";
import { designNodeCssTransform } from "./designGeometry";
import { designTypographyStyle } from "./designTypography";
import {
  designPaintBackground,
  designPaintFillLayers,
  designPaintStroke,
  designPaintStrokeBoxShadow,
  designGradientSvgRotation,
  designPaintGradientCss,
} from "./designPaint";

export function DesignSceneNode({
  document,
  node,
  selected,
  tool,
  onStart,
  onTextChange,
  onVectorHandleStart,
  onGradientHandleStart,
  onActivate,
  onInteraction,
  onHoverEnd,
  visited = new Set<string>(),
  nodeMap,
  parentLocked = false,
  visibleNodeIds,
  outlines = false,
  canvasZoom = 1,
}: {
  document: DesignDocument;
  node: DesignNode;
  selected: readonly string[];
  tool?: string | undefined;
  onStart?: ((event: PointerEvent, nodeId: string) => void) | undefined;
  onTextChange?: ((nodeId: string, text: string) => void) | undefined;
  onVectorHandleStart?: (
    event: PointerEvent,
    nodeId: string,
    index: number,
    kind: "inHandle" | "outHandle" | "anchor",
  ) => void;
  onGradientHandleStart?: (event: PointerEvent, nodeId: string, fillIndex: number) => void;
  onActivate?: ((nodeId: string) => void) | undefined;
  onInteraction?: ((interaction: DesignInteraction, sourceNodeId?: string) => void) | undefined;
  onHoverEnd?: ((nodeId: string) => void) | undefined;
  visited?: ReadonlySet<string>;
  nodeMap?: ReadonlyMap<string, DesignNode>;
  parentLocked?: boolean;
  visibleNodeIds?: ReadonlySet<string> | undefined;
  outlines?: boolean;
  canvasZoom?: number;
}) {
  const [editing, setEditing] = useState(false);
  const effectId = `design-filter-${useId().replace(/[^a-zA-Z0-9_-]/gu, "")}`;
  const cancelEdit = useRef(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [asset, setAsset] = useState<{ id: string; url: string | null } | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- IndexedDB blobs need object URLs owned and released by the mounted scene node.
  useEffect(() => {
    if (!node.assetId) return;
    let active = true;
    let url: string | undefined;
    void readDesignAsset(node.assetId)
      .then((blob) => {
        if (!active) return;
        if (!blob) {
          setAsset({ id: node.assetId!, url: null });
          return;
        }
        url = URL.createObjectURL(blob);
        setAsset({ id: node.assetId!, url });
      })
      .catch(() => {
        if (active) setAsset({ id: node.assetId!, url: null });
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [node.assetId]);
  if (node.visible === false || visited.has(node.nodeId)) return null;
  const nextVisited = new Set([...visited, node.nodeId]);
  const navigate = (trigger: string) => {
    const interaction = node.interactions?.find((item) => item.trigger === trigger);
    if (!onInteraction || !interaction) return false;
    onInteraction(interaction, node.nodeId);
    return true;
  };
  const locked = !onInteraction && (parentLocked || node.locked === true);
  const nodes = nodeMap ?? new Map(document.nodes.map((item) => [item.nodeId, item]));
  const children = node.childIds
    .filter((id) => !visibleNodeIds || visibleNodeIds.has(id))
    .flatMap((id) => nodes.get(id) ?? []);
  const image = asset?.id === node.assetId ? asset?.url : node.sourceUrl;
  const imageMeta =
    node.kind === "image"
      ? document.assets.find((item) => item.assetId === node.assetId)
      : undefined;
  const hasEffects = !outlines && node.effects?.some((effect) => effect.visible) === true;
  const effectMarkup = hasEffects
    ? designEffectsSvg(node, effectId, designEffectRegion(document, node.nodeId, nodes))
    : "";
  const paintBackground = designPaintBackground(node);
  const paintFillLayers = designPaintFillLayers(node);
  const paintStroke = designPaintStroke(node);
  const paintStrokeBoxShadow = designPaintStrokeBoxShadow(node);
  const visual = (
    <>
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          overflow: node.vector ? "visible" : undefined,
          background:
            outlines || node.vector
              ? "transparent"
              : node.kind === "text"
                ? "transparent"
                : (paintBackground ?? "transparent"),
          border: outlines
            ? "1px solid var(--foreground)"
            : node.vector || node.kind === "image"
              ? undefined
              : paintStroke
                ? undefined
                : `${node.paint?.borderWidth ?? (node.border ? 1 : 0)}px solid ${node.paint?.borderColor ?? node.border ?? "transparent"}`,
          boxShadow: !outlines && !node.vector ? paintStrokeBoxShadow || undefined : undefined,
          borderRadius: node.paint?.radius ?? 0,
          mixBlendMode: node.paint?.blendMode ?? "normal",
          color:
            node.typography?.color ??
            (node.kind === "text" ? (node.fill ?? "transparent") : "inherit"),
          ...designTypographyStyle(node),
          ...(node.kind === "text" && node.typography?.verticalAlign
            ? ({
                display: "flex",
                flexDirection: "column",
                justifyContent:
                  node.typography.verticalAlign === "middle"
                    ? "center"
                    : node.typography.verticalAlign === "bottom"
                      ? "flex-end"
                      : "flex-start",
              } as const)
            : {}),
          whiteSpace: "pre-wrap",
          visibility: outlines && node.kind === "image" ? "hidden" : undefined,
        }}
      >
        {node.vector ? (
          <svg
            className="size-full overflow-visible"
            viewBox={`0 0 ${node.vector.width} ${node.vector.height}`}
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {!outlines && node.vector.closed
              ? paintFillLayers.map((fill, index) => (
                  <path
                    key={JSON.stringify(fill)}
                    d={node.vector!.path}
                    fill={
                      fill.kind === "linear-gradient" || fill.kind === "radial-gradient"
                        ? `url(#design-gradient-${node.nodeId}-${index})`
                        : fill.color
                    }
                    fillOpacity={fill.opacity}
                    fillRule={node.vector!.fillRule}
                    stroke="none"
                    vectorEffect="non-scaling-stroke"
                  />
                ))
              : null}
            {paintFillLayers.some((fill) => fill.kind !== "solid" && fill.stops?.length) ? (
              <defs>
                {paintFillLayers.map((fill, index) =>
                  (fill.kind === "linear-gradient" || fill.kind === "radial-gradient") &&
                  fill.stops?.length ? (
                    fill.kind === "radial-gradient" ? (
                      <radialGradient
                        key={JSON.stringify(fill)}
                        id={`design-gradient-${node.nodeId}-${index}`}
                        cx=".5"
                        cy=".5"
                        r=".5"
                      >
                        {fill.stops.map((stop) => (
                          <stop
                            key={JSON.stringify(stop)}
                            offset={stop.position}
                            stopColor={stop.color}
                            stopOpacity={fill.opacity}
                          />
                        ))}
                      </radialGradient>
                    ) : (
                      <linearGradient
                        key={JSON.stringify(fill)}
                        id={`design-gradient-${node.nodeId}-${index}`}
                        x1="0"
                        y1="0"
                        x2="1"
                        y2="0"
                        gradientTransform={`rotate(${designGradientSvgRotation(fill.angle)} .5 .5)`}
                      >
                        {fill.stops.map((stop) => (
                          <stop
                            key={JSON.stringify(stop)}
                            offset={stop.position}
                            stopColor={stop.color}
                            stopOpacity={fill.opacity}
                          />
                        ))}
                      </linearGradient>
                    )
                  ) : null,
                )}
                {paintFillLayers.map((fill, index) =>
                  (fill.kind === "angular-gradient" || fill.kind === "diamond-gradient") &&
                  fill.stops?.length ? (
                    <mask
                      key={`mask-${JSON.stringify(fill)}`}
                      id={`design-mask-${node.nodeId}-${index}`}
                    >
                      <path d={node.vector!.path} fill="var(--color-zinc-25)" />
                    </mask>
                  ) : null,
                )}
              </defs>
            ) : null}
            {!outlines
              ? paintFillLayers.map((fill, index) =>
                  (fill.kind === "angular-gradient" || fill.kind === "diamond-gradient") &&
                  fill.stops?.length ? (
                    <foreignObject
                      key={`foreign-${JSON.stringify(fill)}`}
                      x="0"
                      y="0"
                      width={node.vector!.width}
                      height={node.vector!.height}
                      mask={`url(#design-mask-${node.nodeId}-${index})`}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background: designPaintGradientCss(fill),
                        }}
                      />
                    </foreignObject>
                  ) : null,
                )
              : null}
            {(node.paint?.strokes?.length ? node.paint.strokes : [paintStroke]).map((stroke) =>
              stroke ? (
                <path
                  key={JSON.stringify(stroke)}
                  d={node.vector!.path}
                  fill="none"
                  stroke={outlines ? "var(--foreground)" : stroke.color}
                  strokeWidth={stroke.width}
                  strokeLinecap={stroke.cap}
                  strokeLinejoin={stroke.join}
                  strokeOpacity={stroke.opacity}
                  vectorEffect="non-scaling-stroke"
                />
              ) : null,
            )}
          </svg>
        ) : null}
        {node.vector?.points && selected.length === 1 && selected[0] === node.nodeId ? (
          <svg
            className="pointer-events-none absolute inset-0 size-full overflow-visible"
            aria-label="Vector curve handles"
          >
            {node.vector.points.map((point, index) => {
              const handles = [
                point.inHandle ? { kind: "inHandle" as const, value: point.inHandle } : null,
                point.outHandle ? { kind: "outHandle" as const, value: point.outHandle } : null,
              ].filter(
                (
                  handle,
                ): handle is { kind: "inHandle" | "outHandle"; value: { x: number; y: number } } =>
                  handle !== null,
              );
              return (
                <g key={JSON.stringify(point)}>
                  {handles.map(({ kind, value }) => (
                    <line
                      key={kind}
                      x1={point.x}
                      y1={point.y}
                      x2={point.x + value.x}
                      y2={point.y + value.y}
                      stroke="var(--primary)"
                      strokeWidth={1}
                    />
                  ))}
                  {handles.map(({ kind, value }) => (
                    <circle
                      key={`${kind}-handle`}
                      role="button"
                      tabIndex={0}
                      aria-label={`${kind === "inHandle" ? "Incoming" : "Outgoing"} curve handle`}
                      cx={point.x + value.x}
                      cy={point.y + value.y}
                      r={4}
                      fill="var(--background)"
                      stroke="var(--primary)"
                      className="pointer-events-auto"
                      onPointerDown={(event) =>
                        onVectorHandleStart?.(event, node.nodeId, index, kind)
                      }
                    />
                  ))}
                  <circle
                    role="button"
                    tabIndex={0}
                    aria-label="Vector point"
                    cx={point.x}
                    cy={point.y}
                    r={4}
                    fill="var(--background)"
                    stroke="var(--primary)"
                    className="pointer-events-auto"
                    onPointerDown={(event) =>
                      onVectorHandleStart?.(event, node.nodeId, index, "anchor")
                    }
                  />
                </g>
              );
            })}
          </svg>
        ) : node.kind === "image" && image && imageError !== image ? (
          node.image?.mode === "tile" ? (
            <div role="img" aria-label={node.name} style={designImageStyle(node, image, imageMeta)}>
              <img src={image} alt="" className="hidden" onError={() => setImageError(image)} />
            </div>
          ) : (
            <img
              src={image}
              alt=""
              style={designImageStyle(node, image, imageMeta)}
              draggable={false}
              onError={() => setImageError(image)}
            />
          )
        ) : node.kind === "image" ? (
          <div
            role="img"
            aria-label={`Image unavailable: ${node.name}`}
            className="flex size-full flex-col items-center justify-center gap-2 bg-muted text-xs text-muted-foreground"
          >
            <ImageOffIcon className="size-5" />
            <span>
              {node.assetId && asset?.id !== node.assetId ? "Loading image…" : "Image unavailable"}
            </span>
          </div>
        ) : editing ? null : node.text && node.typography?.listStyle === "bulleted" ? (
          <ul className="m-0 list-inside p-0">
            {node.text.split("\n").map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : editing ? null : node.text && node.typography?.listStyle === "numbered" ? (
          <ol className="m-0 list-inside p-0">
            {node.text.split("\n").map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        ) : (
          node.text
        )}
        {node.kind === "image" ? (
          <span aria-hidden="true" style={designImageBorderStyle(node)} />
        ) : null}
      </div>
      {selected.length === 1 && selected[0] === node.nodeId
        ? (() => {
            const gradient = paintFillLayers.find(
              (fill) => fill.kind !== "solid" && Boolean(fill.stops?.length),
            );
            if (!gradient) return null;
            const fillIndex = paintFillLayers.indexOf(gradient);
            const angle = ((gradient.angle ?? 0) - 90) * (Math.PI / 180);
            const center = { x: node.width / 2, y: node.height / 2 };
            const length = Math.max(16, Math.min(node.width, node.height) / 2);
            const end = {
              x: center.x + Math.cos(angle) * length,
              y: center.y + Math.sin(angle) * length,
            };
            return (
              <svg
                className="pointer-events-none absolute inset-0 size-full overflow-visible"
                aria-label="Gradient handles"
              >
                <line
                  x1={center.x}
                  y1={center.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="var(--primary)"
                  strokeWidth={1}
                  strokeDasharray="3 2"
                />
                <circle
                  role="button"
                  tabIndex={0}
                  aria-label="Gradient direction handle"
                  cx={end.x}
                  cy={end.y}
                  r={5}
                  fill="var(--background)"
                  stroke="var(--primary)"
                  className="pointer-events-auto"
                  onPointerDown={(event) => onGradientHandleStart?.(event, node.nodeId, fillIndex)}
                />
              </svg>
            );
          })()
        : null}
      {children.length ? (
        <div
          className="absolute inset-0"
          style={{
            overflow: node.clipContent ? "hidden" : "visible",
            borderRadius: node.clipContent ? (node.paint?.radius ?? 0) : undefined,
          }}
        >
          {children.map((child) => (
            <DesignSceneNode
              key={child.nodeId}
              document={document}
              node={child}
              selected={selected}
              tool={tool}
              onStart={onStart}
              onTextChange={onTextChange}
              {...(onVectorHandleStart ? { onVectorHandleStart } : {})}
              {...(onGradientHandleStart ? { onGradientHandleStart } : {})}
              onActivate={onActivate}
              onInteraction={onInteraction}
              onHoverEnd={onHoverEnd}
              visited={nextVisited}
              nodeMap={nodes}
              visibleNodeIds={visibleNodeIds}
              parentLocked={locked}
              outlines={outlines}
              canvasZoom={canvasZoom}
            />
          ))}
        </div>
      ) : null}
    </>
  );
  return (
    <div
      role={onStart || node.interactions?.length ? "button" : undefined}
      tabIndex={locked || (!onStart && !node.interactions?.length) ? -1 : 0}
      aria-label={node.name}
      aria-pressed={selected.includes(node.nodeId)}
      aria-disabled={locked}
      data-design-node={node.nodeId}
      data-design-slice={node.slice ? "true" : undefined}
      className="absolute outline-none focus-visible:outline-2 focus-visible:outline-primary"
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        transform: designNodeCssTransform(node),
        opacity: node.opacity,
        outline: node.slice
          ? "1px dashed var(--primary)"
          : outlines && node.kind === "image"
            ? "1px solid var(--foreground)"
            : undefined,
        cursor:
          tool === "hand"
            ? "grab"
            : locked || isDesignNodeInFlow(document, node.nodeId, nodes)
              ? "default"
              : "move",
      }}
      onPointerDown={(event) => {
        if (editing) event.stopPropagation();
        else if (!locked && (tool === "select" || tool === "scale")) onStart?.(event, node.nodeId);
      }}
      onClick={(event) => {
        if (navigate("click")) event.stopPropagation();
      }}
      onPointerEnter={() => navigate("hover")}
      onPointerLeave={() => onHoverEnd?.(node.nodeId)}
      onDoubleClick={(event) => {
        if (!locked && node.kind === "text" && onTextChange) {
          event.stopPropagation();
          cancelEdit.current = false;
          setEditing(true);
        }
      }}
      onKeyDown={(event) => {
        if (editing || event.key !== "Enter") return;
        event.stopPropagation();
        if (!navigate("click")) onActivate?.(node.nodeId);
      }}
    >
      {effectMarkup ? (
        <span
          aria-hidden="true"
          data-t3-design-effect-defs=""
          dangerouslySetInnerHTML={{ __html: effectMarkup }}
        />
      ) : null}
      {hasEffects ? (
        <div
          data-design-effect-surface=""
          className="absolute inset-0"
          style={{ ...designEffectsStyle(node, effectId), borderRadius: node.paint?.radius ?? 0 }}
        >
          {visual}
        </div>
      ) : (
        visual
      )}
      {editing ? (
        <textarea
          aria-label={`Edit ${node.name}`}
          autoFocus
          defaultValue={node.text ?? ""}
          className="absolute inset-0 size-full resize-none border-0 bg-transparent p-0 text-inherit outline-2 outline-primary"
          style={{
            ...designTypographyStyle(node),
            fontSize: node.typography?.size ?? node.fontSize ?? 16,
            color: node.typography?.color ?? node.fill ?? "inherit",
          }}
          onBlur={(event) => {
            if (!cancelEdit.current && event.target.value !== (node.text ?? ""))
              onTextChange?.(node.nodeId, event.target.value);
            setEditing(false);
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              cancelEdit.current = true;
              setEditing(false);
            }
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
              event.currentTarget.blur();
          }}
        />
      ) : null}
      {!onInteraction && node.parentId === null && node.kind === "frame" ? (
        <span
          data-design-frame-label=""
          className="pointer-events-none absolute whitespace-nowrap text-muted-foreground"
          style={{
            left: node.flipX ? node.width : 0,
            top: node.flipY ? node.height + 24 / canvasZoom : -24 / canvasZoom,
            transform: `scale(${node.flipX ? -1 : 1}, ${node.flipY ? -1 : 1})`,
            transformOrigin: "0 0",
            fontSize: 12 / canvasZoom,
            lineHeight: `${16 / canvasZoom}px`,
          }}
        >
          {node.name}
        </span>
      ) : null}
    </div>
  );
}
