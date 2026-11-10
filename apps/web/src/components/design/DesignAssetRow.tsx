import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { Button } from "../ui/button";
import type { DesignAssetMeta } from "./designDocument";
import { readDesignAsset } from "./designAssetStore";

export function DesignAssetRow({
  asset,
  uses,
  onPlace,
  onReplace,
  onRemove,
}: {
  asset: DesignAssetMeta;
  uses: number;
  onPlace: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const [source, setSource] = useState<{ id: string; url: string } | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Each local blob preview owns and releases its object URL.
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    void readDesignAsset(asset.assetId)
      .then((blob) => {
        if (!active || !blob) return;
        url = URL.createObjectURL(blob);
        setSource({ id: asset.assetId, url });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [asset.assetId]);
  return (
    <div className="space-y-2 rounded-lg border border-border p-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        aria-label={`Place ${asset.name}`}
        onClick={onPlace}
      >
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
          {source?.id === asset.assetId ? (
            <img
              src={source.url}
              alt=""
              className="size-full object-contain"
              onError={() => setSource(null)}
            />
          ) : (
            <ImageIcon className="size-4 text-muted-foreground" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs">{asset.name}</span>
          <span className="text-2xs text-muted-foreground">
            {uses === 0 ? "Not placed" : `Used in ${uses} ${uses === 1 ? "layer" : "layers"}`}
          </span>
        </span>
      </button>
      <div className="flex gap-1">
        <Button
          size="xs"
          variant="ghost-muted"
          onClick={onReplace}
          aria-label={`Replace ${asset.name}`}
        >
          Replace
        </Button>
        <Button
          size="xs"
          variant="ghost-muted"
          disabled={uses > 0}
          onClick={onRemove}
          aria-label={`Remove ${asset.name} from library`}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}
