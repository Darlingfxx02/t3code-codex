import { useState, useEffect, type CSSProperties } from "react";
import { ArrowLeftIcon, RotateCcwIcon } from "lucide-react";
import { useStableCallback } from "../../hooks/useStableCallback";
import { Button } from "../ui/button";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { DesignSceneNode } from "./DesignScene";
import { DesignPrototypeStage } from "./DesignPrototypeStage";
import { descendants, type DesignDocument, type DesignInteraction } from "./designDocument";
import "./designPresentation.css";

export function DesignPresentation({
  document,
  startId,
  onClose,
}: {
  document: DesignDocument;
  startId: string;
  onClose: () => void;
}) {
  const [frames, setFrames] = useState<readonly string[]>([startId]);
  const [overlays, setOverlays] = useState<
    readonly { nodeId: string; interaction: DesignInteraction }[]
  >([]);
  const [hover, setHover] = useState<{
    sourceId: string;
    targetId: string;
    overlay: boolean;
    interaction: DesignInteraction;
  } | null>(null);
  const [transition, setTransition] = useState({ name: "instant", duration: 200 });
  const current = document.nodes.find((node) => node.nodeId === frames.at(-1));
  const settings =
    document.pages.find((page) => page.pageId === document.activePageId)?.prototypeSettings ?? {};
  const dimension = (value: number | undefined, fallback: number) =>
    Number.isFinite(value) ? Math.max(1, Math.min(16384, value!)) : fallback;
  const viewportWidth = dimension(settings.viewportWidth, current?.width ?? 640);
  const viewportHeight = dimension(settings.viewportHeight, current?.height ?? 480);
  const back = () => {
    setHover(null);
    if (overlays.length) setOverlays((items) => items.slice(0, -1));
    else setFrames((items) => (items.length > 1 ? items.slice(0, -1) : items));
  };
  const perform = useStableCallback((interaction: DesignInteraction, sourceNodeId?: string) => {
    if (interaction.trigger === "hover") {
      if (
        interaction.targetNodeId &&
        document.nodes.some(
          (node) => node.nodeId === interaction.targetNodeId && node.kind === "frame",
        )
      )
        setHover({
          sourceId: sourceNodeId ?? "",
          targetId: interaction.targetNodeId,
          overlay: ["open-overlay", "swap-overlay"].includes(interaction.action),
          interaction,
        });
      return;
    }
    setHover(null);
    setTransition({
      name: interaction.transition ?? "instant",
      duration: Math.max(0, interaction.durationMs ?? 200),
    });
    if (interaction.action === "back") {
      back();
      return;
    }
    if (interaction.action === "close-overlay") {
      setOverlays((items) => items.slice(0, -1));
      return;
    }
    if (interaction.action === "open-url") {
      try {
        const url = new URL(interaction.url ?? "");
        if (["https:", "http:", "mailto:"].includes(url.protocol))
          window.open(url.href, "_blank", "noopener,noreferrer");
      } catch {
        /* Invalid destinations remain inert. */
      }
      return;
    }
    const destination = document.nodes.find(
      (node) => node.nodeId === interaction.targetNodeId && node.kind === "frame",
    );
    if (!destination) return;
    if (["open-overlay", "swap-overlay"].includes(interaction.action))
      setOverlays((items) => {
        const base = interaction.action === "swap-overlay" ? items.slice(0, -1) : items;
        return [
          ...base.filter((item) => item.nodeId !== destination.nodeId),
          { nodeId: destination.nodeId, interaction },
        ];
      });
    else {
      setOverlays([]);
      setFrames((items) => [...items, destination.nodeId]);
    }
  });
  const visibleId = overlays.at(-1)?.nodeId ?? current?.nodeId;
  const visibleNodes = visibleId
    ? [
        document.nodes.find((node) => node.nodeId === visibleId)!,
        ...descendants(document, visibleId),
      ]
    : [];
  const endHover = useStableCallback((nodeId: string) =>
    setHover((current) => (current?.sourceId === nodeId ? null : current)),
  );
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- One cancellable timer owns the earliest transition in the currently presented frame.
  useEffect(() => {
    if (!visibleId) return;
    const visibleNodes = [
      document.nodes.find((node) => node.nodeId === visibleId)!,
      ...descendants(document, visibleId),
    ];
    const delayed = visibleNodes
      .filter((node) => node.visible !== false)
      .flatMap((node) => node.interactions ?? [])
      .filter((item) => item.trigger === "after-delay")
      .toSorted((a, b) => (a.delayMs ?? 800) - (b.delayMs ?? 800))[0];
    if (!delayed) return;
    const timer = window.setTimeout(() => perform(delayed), Math.max(0, delayed.delayMs ?? 800));
    return () => window.clearTimeout(timer);
  }, [document, visibleId, perform]);
  const hoverFrame = document.nodes.find((node) => node.nodeId === hover?.targetId);
  const sceneNodes = new Map(document.nodes.map((node) => [node.nodeId, node]));
  const handleKey = useStableCallback((event: KeyboardEvent) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const interaction = visibleNodes
      .flatMap((node) => node.interactions ?? [])
      .find(
        (item) =>
          item.trigger === "key-press" && item.key?.toLowerCase() === event.key.toLowerCase(),
      );
    if (interaction) {
      event.preventDefault();
      event.stopPropagation();
      perform(interaction);
    } else if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      setFrames([startId]);
      setOverlays([]);
      setHover(null);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (overlays.length) return;
      const pageFrames =
        document.pages
          .find((page) => page.pageId === document.activePageId)
          ?.nodeIds.flatMap(
            (id) =>
              document.nodes.find((node) => node.nodeId === id && node.kind === "frame") ?? [],
          ) ?? [];
      const next = pageFrames[pageFrames.findIndex((node) => node.nodeId === current?.nodeId) + 1];
      if (next) perform({ trigger: "click", action: "navigate", targetNodeId: next.nodeId });
    } else if (event.key === "ArrowLeft" || (event.key === "Escape" && overlays.length)) {
      event.preventDefault();
      event.stopPropagation();
      back();
    }
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Modal playback keeps keyboard navigation when a disabled Back button releases focus to the body.
  useEffect(() => {
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [handleKey]);
  const renderOverlay = (
    entry: { nodeId: string; interaction: DesignInteraction },
    preview = false,
  ) => {
    const overlay = sceneNodes.get(entry.nodeId);
    if (!overlay) return null;
    const options = entry.interaction.overlay ?? {};
    const position = options.position ?? "center";
    const left =
      position === "manual"
        ? (options.x ?? 0)
        : position.endsWith("left")
          ? 0
          : position.endsWith("right")
            ? viewportWidth - overlay.width
            : (viewportWidth - overlay.width) / 2;
    const top =
      position === "manual"
        ? (options.y ?? 0)
        : position.startsWith("top")
          ? 0
          : position.startsWith("bottom")
            ? viewportHeight - overlay.height
            : (viewportHeight - overlay.height) / 2;
    const backdrop = {
      background:
        options.background === false ? "transparent" : (options.backgroundColor ?? "#000000"),
      opacity: Math.max(0, Math.min(1, options.backgroundOpacity ?? 0.3)),
    };
    return (
      <div
        key={entry.nodeId}
        role="group"
        aria-label={`Overlay: ${overlay.name}`}
        aria-hidden={preview || undefined}
        inert={!preview && entry !== overlays.at(-1)}
        className={preview ? "pointer-events-none absolute inset-0" : "absolute inset-0"}
      >
        {options.dismissOnOutside !== false && !preview ? (
          <button
            type="button"
            className="absolute inset-0"
            style={backdrop}
            aria-label="Dismiss overlay"
            onClick={() => setOverlays((items) => items.slice(0, -1))}
          />
        ) : (
          <div aria-hidden="true" className="absolute inset-0" style={backdrop} />
        )}
        <div
          data-design-prototype-frame=""
          data-design-overlay=""
          className="absolute"
          data-transition={transition.name}
          style={
            {
              left,
              top,
              width: overlay.width,
              height: overlay.height,
              "--design-transition-duration": `${transition.duration}ms`,
            } as CSSProperties
          }
        >
          <DesignSceneNode
            document={document}
            node={{ ...overlay, x: 0, y: 0 }}
            nodeMap={sceneNodes}
            selected={[]}
            onInteraction={preview ? undefined : perform}
            onHoverEnd={endHover}
          />
        </div>
      </div>
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup variant="media" className="h-[85vh] w-[90vw]" bottomStickOnMobile={false}>
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-background text-foreground">
          <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 pe-12">
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Previous frame"
              disabled={frames.length < 2 && !overlays.length}
              onClick={back}
            >
              <ArrowLeftIcon />
            </Button>
            <DialogTitle>{current?.name ?? "Prototype"}</DialogTitle>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Restart prototype"
              onClick={() => {
                setFrames([startId]);
                setOverlays([]);
                setHover(null);
              }}
            >
              <RotateCcwIcon />
            </Button>
            <span className="text-xs text-muted-foreground">
              Click connected layers to navigate · ← Back
            </span>
          </div>
          <DesignPrototypeStage width={viewportWidth} height={viewportHeight} settings={settings}>
            <div className="absolute inset-0 overflow-auto" inert={overlays.length > 0}>
              {current ? (
                <div
                  key={current.nodeId}
                  data-design-prototype-frame=""
                  className="relative"
                  data-transition={transition.name}
                  style={
                    {
                      width: current.width,
                      height: current.height,
                      "--design-transition-duration": `${transition.duration}ms`,
                    } as CSSProperties
                  }
                >
                  <div style={{ opacity: hover && !hover.overlay ? 0 : 1 }}>
                    <DesignSceneNode
                      document={document}
                      node={{ ...current, x: 0, y: 0 }}
                      nodeMap={sceneNodes}
                      selected={[]}
                      onInteraction={overlays.length ? undefined : perform}
                      onHoverEnd={endHover}
                    />
                  </div>
                  {hoverFrame && hover && !hover.overlay && !overlays.length ? (
                    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                      <DesignSceneNode
                        document={document}
                        node={{ ...hoverFrame, x: 0, y: 0 }}
                        nodeMap={sceneNodes}
                        selected={[]}
                      />
                    </div>
                  ) : null}
                </div>
              ) : (
                <p role="status">This frame is unavailable.</p>
              )}
            </div>
            {overlays.map((entry) => renderOverlay(entry))}
            {hover?.overlay && !overlays.length
              ? renderOverlay({ nodeId: hover.targetId, interaction: hover.interaction }, true)
              : null}
          </DesignPrototypeStage>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
