import { X } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

interface PanelTabCloseButtonProps {
  children?: ReactNode;
  label: string;
  onClick: () => void;
  placement?: "leading" | "trailing";
  tooltip?: string;
}

export function PanelTabCloseButton({
  children,
  label,
  onClick,
  placement = "leading",
  tooltip,
}: PanelTabCloseButtonProps) {
  const trailing = placement === "trailing";
  const button = (
    <button
      type="button"
      className={cn(
        "cursor-pointer group/close relative flex size-5 shrink-0 items-center justify-center rounded-sm hover:bg-interactive-row-hover",
        trailing &&
          "pointer-events-none absolute top-1/2 right-0.5 z-10 -translate-y-1/2 group-hover/tab:pointer-events-auto group-focus-visible/close:pointer-events-auto",
      )}
      aria-label={label}
      onClick={onClick}
    >
      {!trailing && (
        <span className="relative flex size-3.5 items-center justify-center group-hover/tab:hidden group-focus-visible/close:hidden">
          {children}
        </span>
      )}
      <X className="hidden size-3.5 group-hover/tab:block group-focus-visible/close:block" />
    </button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup>{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
