import type { ChatFileAttachment } from "../../types";
import { BlocksIcon, DownloadIcon, SparklesIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { formatBytes } from "../../lib/formatBytes";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export type ResourceAttachmentKind = "plugin" | "skill";

export function resourceAttachmentKindForFileName(
  name: Pick<ChatFileAttachment, "name">["name"],
): ResourceAttachmentKind | null {
  const basename = name.split(/[\\/]/).at(-1)?.toLowerCase() ?? name.toLowerCase();

  if (basename.endsWith("skill.md")) return "skill";
  if (
    basename.endsWith("plugin.json") ||
    (basename.includes("plugin") && basename.endsWith(".json"))
  ) {
    return "plugin";
  }
  return null;
}

const RESOURCE_ATTACHMENT_META: Record<
  ResourceAttachmentKind,
  { description: string; label: string; Icon: typeof BlocksIcon }
> = {
  plugin: { description: "Plugin manifest", label: "Plugin", Icon: BlocksIcon },
  skill: { description: "Instruction resource", label: "Skill", Icon: SparklesIcon },
};

export function ResourceAttachmentCard({
  file,
  kind,
  copyMarkdown,
  onOpen,
  onDownload,
}: {
  readonly file: ChatFileAttachment;
  readonly kind: ResourceAttachmentKind;
  readonly copyMarkdown?: string | undefined;
  readonly onOpen: () => void;
  readonly onDownload: () => void;
}) {
  const meta = RESOURCE_ATTACHMENT_META[kind];
  const label = file.source?._tag === "pasted-text" ? "Pasted text" : file.name;
  const isPending = file.downloadable === false;
  const Icon = meta.Icon;

  return (
    <div
      data-chat-resource-attachment={kind}
      data-markdown-copy={copyMarkdown}
      className="flex w-[min(100%,18rem)] max-w-full items-center gap-2 rounded-2xl border border-border/70 bg-message px-2.5 py-2 text-message-foreground"
    >
      <button
        type="button"
        aria-label={`Preview ${label}`}
        disabled={isPending}
        onClick={onOpen}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2.5 rounded-xl text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70 focus-visible:outline-none",
          !isPending && "group/resource cursor-pointer",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/70 text-secondary-label">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium group-hover/resource:underline">
            {label}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Badge size="sm" variant="secondary">
              {meta.label}
            </Badge>
            <span className="truncate">
              {isPending ? "Sending…" : `${meta.description} · ${formatBytes(file.sizeBytes)}`}
            </span>
          </span>
        </span>
      </button>
      {isPending ? (
        <Button size="icon-xs" variant="ghost-muted" disabled aria-label="Sending attachment">
          <DownloadIcon />
        </Button>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost-muted"
                aria-label={`Download ${label}`}
                onClick={onDownload}
              />
            }
          >
            <DownloadIcon />
          </TooltipTrigger>
          <TooltipPopup side="top">Download {label}</TooltipPopup>
        </Tooltip>
      )}
    </div>
  );
}
