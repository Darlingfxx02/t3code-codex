import { useEffect, useRef } from "react";

import { observeResize } from "~/lib/observeResize";
import { cn } from "~/lib/utils";
import { textDirection } from "~/textDirection";

export function SidebarThreadTitle({ title, className }: { title: string; className: string }) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- owns the row's DOM hover/focus listeners, resize subscription, and finite text animation
  useEffect(() => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    const row = viewport?.closest<HTMLElement>("[data-sidebar-row]");
    if (!viewport || !text || !row) return;

    let hovered = row.matches(":hover");
    let focused = row.matches(":focus-visible") || row.querySelector(":focus-visible") !== null;
    let animation: Animation | null = null;
    let stopObserving: (() => void) | undefined;
    let lastOverflow = -1;
    const reveal = () => {
      viewport.setAttribute("data-revealing", "");
      const overflow = Math.max(0, text.scrollWidth - viewport.clientWidth);
      if (overflow === lastOverflow && animation !== null) return;
      lastOverflow = overflow;
      animation?.cancel();
      animation = null;
      if (overflow <= 1) {
        viewport.removeAttribute("data-revealing");
        return;
      }
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const direction = textDirection(title) ?? getComputedStyle(viewport).direction;
      const distance = direction === "rtl" ? overflow : -overflow;
      animation = text.animate(
        [{ transform: "translateX(0)" }, { transform: `translateX(${distance}px)` }],
        {
          duration: reducedMotion ? 0 : (overflow / 36) * 1000,
          delay: reducedMotion ? 0 : 200,
          easing: "linear",
          fill: "forwards",
        },
      );
    };
    const reset = () => {
      stopObserving?.();
      stopObserving = undefined;
      animation?.cancel();
      animation = null;
      lastOverflow = -1;
      viewport.removeAttribute("data-revealing");
    };
    const sync = () => {
      if (!hovered && !focused) {
        reset();
      } else if (!stopObserving) {
        reveal();
        stopObserving = observeResize(viewport, reveal);
      }
    };
    const enter = () => {
      hovered = true;
      sync();
    };
    const leave = () => {
      hovered = false;
      sync();
    };
    const focus = () => {
      focused = row.matches(":focus-visible") || row.querySelector(":focus-visible") !== null;
      sync();
    };
    const blur = (event: FocusEvent) => {
      focused =
        event.relatedTarget instanceof HTMLElement &&
        row.contains(event.relatedTarget) &&
        event.relatedTarget.matches(":focus-visible");
      sync();
    };
    row.addEventListener("pointerenter", enter);
    row.addEventListener("pointerleave", leave);
    row.addEventListener("focusin", focus);
    row.addEventListener("focusout", blur);
    sync();
    return () => {
      reset();
      row.removeEventListener("pointerenter", enter);
      row.removeEventListener("pointerleave", leave);
      row.removeEventListener("focusin", focus);
      row.removeEventListener("focusout", blur);
    };
  }, [title]);

  return (
    <span
      ref={viewportRef}
      aria-hidden
      data-sidebar-title
      dir={textDirection(title)}
      className={cn("truncate data-revealing:text-clip", className)}
    >
      <span
        ref={textRef}
        className="in-data-revealing:inline-block in-data-revealing:w-max in-data-revealing:min-w-full"
      >
        {title}
      </span>
    </span>
  );
}
