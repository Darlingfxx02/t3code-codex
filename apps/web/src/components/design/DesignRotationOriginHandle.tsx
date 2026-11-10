import type { PointerEvent } from "react";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

export function DesignRotationOriginHandle({
  point,
  zoom,
  disabled,
  onStart,
  onChange,
  onReset,
}: {
  point: { x: number; y: number };
  zoom: number;
  disabled: boolean;
  onStart: (event: PointerEvent<HTMLButtonElement>) => void;
  onChange: (point: { x: number; y: number }) => void;
  onReset: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            data-design-rotation-origin=""
            aria-label="Rotation origin"
            aria-description={
              disabled
                ? "Auto layout controls this layer’s position. Use absolute positioning to move its rotation origin."
                : "Drag or use arrow keys to move the rotation origin. Press Home or Enter, or double-click to reset."
            }
            aria-disabled={disabled}
            className="group pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 cursor-move outline-none aria-disabled:cursor-default aria-disabled:opacity-50"
            style={{ left: point.x, top: point.y, width: 20 / zoom, height: 20 / zoom }}
            onPointerDown={(event) => {
              if (disabled) {
                event.preventDefault();
                event.stopPropagation();
              } else onStart(event);
            }}
            onDoubleClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!disabled) onReset();
            }}
            onKeyDown={(event) => {
              if (disabled) {
                if (
                  [
                    "Home",
                    "Enter",
                    " ",
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                  ].includes(event.key)
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                }
                return;
              }
              if (event.altKey || event.ctrlKey || event.metaKey) return;
              const step = event.shiftKey ? 10 : 1;
              const direction = (
                {
                  ArrowLeft: { x: -step, y: 0 },
                  ArrowRight: { x: step, y: 0 },
                  ArrowUp: { x: 0, y: -step },
                  ArrowDown: { x: 0, y: step },
                } as Record<string, { x: number; y: number }>
              )[event.key];
              if (direction) {
                event.preventDefault();
                event.stopPropagation();
                onChange({ x: point.x + direction.x, y: point.y + direction.y });
              } else if (["Home", "Enter", " "].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                onReset();
              }
            }}
          />
        }
      >
        <svg viewBox="0 0 20 20" className="size-full" fill="none" aria-hidden="true">
          <circle
            cx="10"
            cy="10"
            r="8"
            stroke="var(--primary)"
            className="opacity-0 group-focus-visible:opacity-100"
          />
          <path d="M10 2v4m0 8v4M2 10h4m8 0h4" stroke="var(--background)" strokeWidth="3" />
          <path d="M10 2v4m0 8v4M2 10h4m8 0h4" stroke="var(--primary)" />
          <circle cx="10" cy="10" r="4" fill="var(--background)" stroke="var(--primary)" />
          <circle cx="10" cy="10" r="1" fill="var(--primary)" />
        </svg>
      </TooltipTrigger>
      <TooltipPopup>
        {disabled
          ? "Auto layout controls this layer’s position. Use absolute positioning to move its rotation origin."
          : "Rotation origin · double-click to reset"}
      </TooltipPopup>
    </Tooltip>
  );
}
