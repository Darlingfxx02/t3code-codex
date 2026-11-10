import { useState } from "react";
import { formatHex8, parse } from "culori";

export function DesignInspectorColor({
  label,
  value,
  onChange,
  mixed = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  mixed?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const fullHex = formatHex8(parse(value));
  const hex = fullHex?.endsWith("ff") ? fullHex.slice(0, -2) : fullHex;
  const displayed = mixed ? "Mixed" : (hex?.slice(1).toUpperCase() ?? value);
  return (
    <label className="flex h-6 min-w-0 items-center gap-1.5 rounded-md bg-input/25 px-2 focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring">
      <input
        type="color"
        aria-label={`${label} picker`}
        value={fullHex?.slice(0, 7) ?? "#000000"}
        onChange={(event) => {
          const alpha = parse(value)?.alpha ?? 1;
          const hex = event.target.value;
          onChange(
            alpha === 1
              ? hex
              : `rgba(${Number.parseInt(hex.slice(1, 3), 16)}, ${Number.parseInt(hex.slice(3, 5), 16)}, ${Number.parseInt(hex.slice(5, 7), 16)}, ${alpha})`,
          );
        }}
        className="size-4 shrink-0 cursor-pointer overflow-hidden rounded-xs border-0 bg-transparent p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0"
      />
      <input
        aria-label={label}
        value={draft ?? displayed}
        spellCheck={false}
        onFocus={() => setDraft(displayed)}
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const parsed = parse(next.startsWith("#") ? next : `#${next}`) ?? parse(next);
          const color = parsed ? formatHex8(parsed) : undefined;
          if (color) onChange(color.endsWith("ff") ? color.slice(0, -2) : color);
        }}
        className={`w-full min-w-0 bg-transparent text-xs outline-none ${mixed ? "" : "uppercase"}`}
      />
    </label>
  );
}
