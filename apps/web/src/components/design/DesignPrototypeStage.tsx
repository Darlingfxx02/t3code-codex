import { useEffect, useRef, useState, type ReactNode } from "react";
import type { DesignPrototypeSettings } from "./designDocument";
import { observeResize } from "../../lib/observeResize";

export function DesignPrototypeStage({
  width,
  height,
  settings,
  children,
}: {
  readonly width: number;
  readonly height: number;
  readonly settings: DesignPrototypeSettings;
  readonly children: ReactNode;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Fit the playback screen to the observed presentation viewport.
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    return observeResize(element, ([entry]) => {
      if (entry) setAvailable({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
  }, []);
  const bezel = settings.device && settings.device !== "none" ? 12 : 0;
  const outerWidth = width + bezel * 2;
  const outerHeight = height + bezel * 2;
  const scale =
    settings.scale !== "actual" && available.width > 0 && available.height > 0
      ? Math.max(0.01, Math.min(1, available.width / outerWidth, available.height / outerHeight))
      : 1;
  const radius =
    settings.device === "phone"
      ? 40
      : settings.device === "tablet"
        ? 24
        : settings.device === "browser"
          ? 12
          : 0;
  return (
    <div
      ref={host}
      className="relative flex min-h-0 flex-1 overflow-auto scrollbar-gutter-both p-8"
      style={{ background: settings.background ?? "#e5e7eb" }}
    >
      <div
        className="relative m-auto shrink-0"
        style={{ width: outerWidth * scale, height: outerHeight * scale }}
      >
        <div
          style={{
            width: outerWidth,
            height: outerHeight,
            padding: bezel,
            borderRadius: radius,
            background: bezel ? "#202124" : undefined,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <div
            role="region"
            aria-label="Prototype screen"
            className="relative overflow-hidden bg-white"
            style={{ width, height, borderRadius: Math.max(0, radius - bezel) }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
