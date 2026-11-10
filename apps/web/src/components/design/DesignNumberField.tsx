import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Input } from "../ui/input";

export function DesignNumberField({
  label,
  value,
  onChange,
  min,
  max,
  compact = false,
  prefix,
  propertyLabels = false,
  trailing,
  displayLabel,
  mixed = false,
  onExpression,
  disabled,
  placeholder,
  suffix = "",
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number) => void;
  min?: number | undefined;
  max?: number | undefined;
  compact?: boolean;
  prefix?: ReactNode;
  propertyLabels?: boolean;
  trailing?: ReactNode;
  displayLabel?: string;
  mixed?: boolean;
  onExpression?: (value: string) => boolean;
  disabled?: boolean;
  placeholder?: string | undefined;
  suffix?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [scrubValue, setScrubValue] = useState<number | null>(null);
  const [invalid, setInvalid] = useState(false);
  const errorId = useId();
  const skipBlur = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const scrubRef = useRef<{
    pointerId: number;
    startX: number;
    startValue: number;
    step: number;
    lastValue: number;
  } | null>(null);
  const displayed = mixed
    ? "Mixed"
    : value === null || value === undefined
      ? ""
      : `${value}${suffix}`;
  const displayedValue = scrubValue === null ? displayed : `${scrubValue}${suffix}`;
  const clamp = (next: number) => Math.max(min ?? -Infinity, Math.min(max ?? Infinity, next));
  const finishScrub = (event: PointerEvent<HTMLSpanElement>) => {
    const active = scrubRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    scrubRef.current = null;
    setScrubValue(null);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Synthetic pointer events do not have a browser pointer to release.
    }
    skipBlur.current = true;
    inputRef.current?.blur();
  };
  const scrubHandlers = {
    onPointerDown: (event: PointerEvent<HTMLSpanElement>) => {
      if (disabled || mixed || value === null || value === undefined || !Number.isFinite(value))
        return;
      event.preventDefault();
      inputRef.current?.focus({ preventScroll: true });
      const step = event.shiftKey ? 0.1 : 1;
      scrubRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startValue: value,
        step,
        lastValue: value,
      };
      setScrubValue(value);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointer events do not have a browser pointer to capture.
      }
    },
    onPointerMove: (event: PointerEvent<HTMLSpanElement>) => {
      const active = scrubRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const next = clamp(
        Math.round(
          (active.startValue + (event.clientX - active.startX) * active.step) / active.step,
        ) * active.step,
      );
      if (next === active.lastValue) return;
      active.lastValue = next;
      setScrubValue(next);
      setInvalid(false);
      if (onExpression) onExpression(`${next}${suffix}`);
      else onChange(next);
    },
    onPointerUp: finishScrub,
    onPointerCancel: finishScrub,
  };
  const commit = () => {
    if (draft === null || !onExpression) return true;
    const valid = onExpression(draft);
    setInvalid(!valid);
    if (valid) setDraft(null);
    return valid;
  };
  const props = {
    type: onExpression ? ("text" as const) : ("number" as const),
    role: onExpression ? ("spinbutton" as const) : undefined,
    inputMode: "decimal" as const,
    "aria-valuenow": mixed ? undefined : (value ?? undefined),
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-valuetext": mixed
      ? "Mixed"
      : suffix && value !== null && value !== undefined
        ? `${value}${suffix}`
        : undefined,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? errorId : undefined,
    disabled,
    placeholder,
    step: "any",
    min,
    max,
    ref: inputRef,
    value: draft ?? displayedValue,
    onFocus: () => {
      skipBlur.current = false;
      setDraft(displayed);
    },
    onBlur: () => {
      if (skipBlur.current) {
        skipBlur.current = false;
        setDraft(null);
        return;
      }
      if (onExpression) commit();
      else setDraft(null);
    },
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const raw = event.target.value;
      setDraft(raw);
      setInvalid(false);
      if (onExpression) return;
      if (raw === "") return;
      const parsed = Number(raw);
      if (Number.isFinite(parsed))
        onChange(Math.max(min ?? -Infinity, Math.min(max ?? Infinity, parsed)));
    },
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
      if (!onExpression) return;
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (event.key === "Escape") {
          setDraft(null);
          setInvalid(false);
        }
        if (event.key === "Escape" || commit()) {
          skipBlur.current = true;
          event.currentTarget.blur();
        }
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        const source = draft || (mixed ? "Mixed" : String(value ?? 0));
        const metric = /^(.*?)(%|px)?$/iu.exec(source)!;
        const valid = onExpression(
          `(${metric[1]})${event.key === "ArrowUp" ? "+" : "-"}${event.shiftKey ? 10 : 1}${metric[2] ?? suffix}`,
        );
        setInvalid(!valid);
        if (valid) setDraft(null);
      }
    },
  };
  const error = invalid ? (
    <span id={errorId} role="alert" className="sr-only">
      Enter a valid number or equation.
    </span>
  ) : null;
  if (compact)
    return (
      <label className="grid min-w-0 gap-1 text-xs">
        {propertyLabels ? (
          <span className="text-2xs text-muted-foreground">{displayLabel ?? label}</span>
        ) : null}
        <span
          data-invalid={invalid || undefined}
          className="relative flex h-6 min-w-0 items-center gap-1.5 rounded-md bg-input/25 px-2 outline-none focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring data-invalid:ring-1 data-invalid:ring-destructive"
        >
          <span
            aria-label={`Adjust ${label}`}
            aria-description={`Drag horizontally to adjust ${label}; hold Shift for precision`}
            data-design-scrub-handle={label}
            className={`flex max-w-16 shrink-0 cursor-ew-resize select-none items-center truncate text-2xs text-muted-foreground ${prefix === "" ? "absolute inset-y-0 left-0 w-2" : ""}`}
            {...scrubHandlers}
          >
            {prefix ?? label}
          </span>
          <input
            {...props}
            aria-label={label}
            className="w-full min-w-0 bg-transparent text-xs tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {trailing}
        </span>
        {error}
      </label>
    );
  return (
    <label className="grid min-w-0 gap-1 text-2xs text-muted-foreground">
      <span>{label}</span>
      <Input size="sm" {...props} />
      {error}
    </label>
  );
}
