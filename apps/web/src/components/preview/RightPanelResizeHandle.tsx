import type { ComponentProps } from "react";
import { ResizeGlow, useResizeGlow } from "~/components/ResizeGlow";
import type { ResizableWidthHandlers } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";

interface Props extends Pick<
  ComponentProps<"div">,
  "tabIndex" | "onKeyDown" | "aria-valuenow" | "aria-valuemin" | "aria-valuemax"
> {
  handlers: ResizableWidthHandlers;
  className?: string;
  label?: string;
}

export function RightPanelResizeHandle({ handlers, className, label, ...separatorProps }: Props) {
  const {
    ref: glowRef,
    onPointerCancel: cancelGlow,
    onPointerDown: showGlow,
    onPointerEnter: enterGlow,
    onPointerLeave: leaveGlow,
    onPointerMove: moveGlow,
    onPointerUp: endGlow,
  } = useResizeGlow("vertical");
  const {
    ref: resizeRef,
    onPointerDown: resizePointerDown,
    onPointerMove: resizePointerMove,
    onPointerUp: resizePointerUp,
    onPointerCancel: resizePointerCancel,
    onLostPointerCapture: resizeLostPointerCapture,
  } = handlers;

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      {...separatorProps}
      className={cn(
        "group absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize select-none",
        className,
      )}
      ref={resizeRef}
      onPointerDown={(event) => {
        showGlow(event);
        resizePointerDown(event);
      }}
      onPointerEnter={enterGlow}
      onPointerLeave={leaveGlow}
      onPointerMove={(event) => {
        moveGlow(event);
        resizePointerMove(event);
      }}
      onPointerUp={(event) => {
        endGlow();
        resizePointerUp(event);
      }}
      onPointerCancel={(event) => {
        cancelGlow();
        resizePointerCancel(event);
      }}
      onLostPointerCapture={(event) => {
        endGlow();
        resizeLostPointerCapture(event);
      }}
    >
      <ResizeGlow ref={glowRef} axis="vertical" />
    </div>
  );
}
