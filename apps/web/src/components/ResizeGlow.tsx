import type { PointerEvent as ReactPointerEvent } from "react";
import { forwardRef, useRef } from "react";

import { cn } from "~/lib/utils";

export type ResizeGlowAxis = "vertical" | "horizontal" | "diagonal";

const MIN_POSITION = 0.16;
const MAX_POSITION = 0.84;

export interface ResizeGlowHandlers {
  readonly onPointerCancel: () => void;
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerEnter: () => void;
  readonly onPointerLeave: () => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: () => void;
  readonly ref: (node: HTMLSpanElement | null) => void;
}

function clampPosition(position: number): number {
  return Math.max(MIN_POSITION, Math.min(MAX_POSITION, position));
}

export function useResizeGlow(axis: ResizeGlowAxis): ResizeGlowHandlers {
  const glowRef = useRef<HTMLSpanElement | null>(null);
  const activeRef = useRef(false);
  const hoveringRef = useRef(false);

  const setOpacity = (opacity: number) => {
    glowRef.current?.style.setProperty("--resize-glow-opacity", `${opacity}`);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const position =
      axis === "vertical"
        ? (event.clientY - rect.top) / rect.height
        : axis === "horizontal"
          ? (event.clientX - rect.left) / rect.width
          : ((event.clientX - rect.left) / rect.width + (event.clientY - rect.top) / rect.height) /
            2;
    if (!Number.isFinite(position)) return;
    glowRef.current?.style.setProperty(
      "--resize-glow-position",
      `${clampPosition(position) * 100}%`,
    );
    setOpacity(1);
  };

  return {
    ref: (node) => {
      glowRef.current = node;
    },
    onPointerCancel: () => {
      activeRef.current = false;
      if (!hoveringRef.current) setOpacity(0);
    },
    onPointerDown: () => {
      activeRef.current = true;
      setOpacity(1);
    },
    onPointerEnter: () => {
      hoveringRef.current = true;
      setOpacity(1);
    },
    onPointerLeave: () => {
      hoveringRef.current = false;
      if (!activeRef.current) setOpacity(0);
    },
    onPointerMove,
    onPointerUp: () => {
      activeRef.current = false;
      if (!hoveringRef.current) setOpacity(0);
    },
  };
}

export const ResizeGlow = forwardRef<
  HTMLSpanElement,
  { readonly axis: ResizeGlowAxis; readonly className?: string }
>(function ResizeGlow({ axis, className }, ref) {
  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-resize-glow-axis={axis}
      className={cn("resize-glow", className)}
    />
  );
});
