import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DesignDocument } from "./designDocument";
import { rasterizeDesignScene } from "./designRaster";

type Box = { x: number; y: number; width: number; height: number };
export type DesignPixelPreviewMode = { density: 0 | 1 | 2 };
type Preview = {
  document: DesignDocument;
  viewport: Box;
  mode: DesignPixelPreviewMode;
  box?: Box;
  error?: string;
};

export function DesignPixelPreview({
  document,
  viewport,
  mode,
  suspended,
  zoom,
  children,
  labels,
}: {
  document: DesignDocument;
  viewport: Box;
  mode: DesignPixelPreviewMode;
  suspended: boolean;
  zoom: number;
  children: ReactNode;
  labels: ReactNode;
}) {
  const scene = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const { x, y, width, height } = viewport;
  const { density } = mode;
  const current =
    preview?.document === document &&
    preview.mode === mode &&
    preview.viewport.x === x &&
    preview.viewport.y === y &&
    preview.viewport.width === width &&
    preview.viewport.height === height;
  const ready = current && preview.box !== undefined && !suspended;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Rasterize the mounted scene and repaint when asynchronous image/font resources arrive; cancel obsolete work and release its observer.
  useEffect(() => {
    const source = scene.current,
      target = canvas.current;
    if (!source || !target) return;
    const { density } = mode;
    const area = { x, y, width, height };
    if (!density || area.width <= 0 || area.height <= 0) {
      target.width = 0;
      target.height = 0;
      return;
    }
    if (suspended) return;
    let controller = new AbortController();
    let queued = false,
      active = true;
    const paint = () => {
      if (!active) return;
      controller.abort();
      if (source.querySelector("textarea")) return;
      controller = new AbortController();
      const signal = controller.signal;
      void rasterizeDesignScene(source, area, density, signal)
        .then((raster) => {
          if (signal.aborted) return;
          target.width = raster.canvas.width;
          target.height = raster.canvas.height;
          const context = target.getContext("2d");
          if (!context) throw new Error("Pixel preview is unavailable in this browser.");
          context.drawImage(raster.canvas, 0, 0);
          setPreview({ document, viewport: area, mode, box: raster.box });
        })
        .catch((cause: unknown) => {
          if (!signal.aborted)
            setPreview({
              document,
              viewport: area,
              mode,
              error: cause instanceof Error ? cause.message : "Pixel preview is unavailable.",
            });
        });
    };
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        paint();
      });
    });
    observer.observe(source, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "style"],
      characterData: true,
    });
    paint();
    return () => {
      active = false;
      controller.abort();
      observer.disconnect();
    };
  }, [document, mode, suspended, x, y, width, height]);

  return (
    <div
      data-design-raster-ready={ready ? "" : undefined}
      className="absolute size-px [&:has(textarea)_[data-design-pixel-preview]]:hidden [&:has(textarea)_[data-design-raster-labels]]:hidden [&:has(textarea)_[data-design-scene]]:opacity-100"
    >
      <div
        ref={scene}
        data-design-scene=""
        className="absolute size-px in-data-[design-raster-ready]:opacity-0"
      >
        {children}
      </div>
      <canvas
        ref={canvas}
        aria-hidden="true"
        data-design-pixel-preview={ready ? density : undefined}
        className="pointer-events-none absolute [image-rendering:pixelated]"
        style={{
          display: ready ? undefined : "none",
          left: preview?.box?.x,
          top: preview?.box?.y,
          width: preview?.box?.width,
          height: preview?.box?.height,
        }}
      />
      {ready ? (
        <div data-design-raster-labels="" className="pointer-events-none absolute size-px">
          {labels}
        </div>
      ) : null}
      {current && preview.error && !suspended && density ? (
        <p
          role="status"
          className="pointer-events-none absolute w-max max-w-72 origin-top-left rounded-md bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-sm"
          style={{
            left: viewport.x + 12 / zoom,
            top: viewport.y + 12 / zoom,
            transform: `scale(${1 / zoom})`,
          }}
        >
          {preview.error} Showing vector view.
        </p>
      ) : null}
    </div>
  );
}
