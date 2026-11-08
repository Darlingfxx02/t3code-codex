import {
  ANTIGRAVITY_DEFAULT_MODEL,
  type ProviderInstanceId,
  type EnvironmentId,
  type ProviderDriverKind,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import {
  createContext,
  memo,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ClaudeAI, OpenAI } from "../Icons";
import { Button } from "../ui/button";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Badge } from "../ui/badge";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { ModelPickerContent, resolveModelPickerSelectedModel } from "./ModelPickerContent";
import { ChatGptSharingControl } from "./ChatGptSharingControl";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { ModelEsque, getDisplayModelName, getTriggerDisplayModelName } from "./providerIconUtils";
import { shouldShowInstanceBadge, type ProviderInstanceEntry } from "../../providerInstances";
import { ComposerControl, type ComposerControlSize } from "./ComposerControl";
import { takeOpenTarget, useComposerMenuProps } from "./composerEventScope";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../../keybindings";
import { registerModelPickerContent } from "../../modelPickerVisibility";

/** Holds the page still behind the open picker; its lifetime is the popup element's. */
function lockBackgroundScroll(popup: HTMLElement | null) {
  if (!popup) return;
  const { documentElement, body } = document;
  const previousDocumentOverscrollBehavior = documentElement.style.overscrollBehavior;
  const previousBodyOverflow = body.style.overflow;
  const previousBodyPaddingRight = body.style.paddingRight;
  const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

  documentElement.style.overscrollBehavior = "contain";
  body.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }

  const shouldAllowOverlayScroll = (target: EventTarget | null) => {
    return (
      target instanceof Element &&
      target.closest(
        "[data-model-picker-content], [data-model-picker-effort], [data-model-picker-option-menu]",
      )
    );
  };
  const preventBackgroundWheel = (event: WheelEvent) => {
    if (shouldAllowOverlayScroll(event.target)) {
      return;
    }
    event.preventDefault();
  };
  const preventBackgroundTouchMove = (event: TouchEvent) => {
    if (shouldAllowOverlayScroll(event.target)) {
      return;
    }
    event.preventDefault();
  };

  document.addEventListener("wheel", preventBackgroundWheel, { capture: true, passive: false });
  document.addEventListener("touchmove", preventBackgroundTouchMove, {
    capture: true,
    passive: false,
  });

  return () => {
    document.removeEventListener("wheel", preventBackgroundWheel, { capture: true });
    document.removeEventListener("touchmove", preventBackgroundTouchMove, { capture: true });
    documentElement.style.overscrollBehavior = previousDocumentOverscrollBehavior;
    body.style.overflow = previousBodyOverflow;
    body.style.paddingRight = previousBodyPaddingRight;
  };
}

/** What a docked effort column needs from its picker: the model it serves. */
export const DockedPickerContext = createContext<{
  modelLabel: string;
  onChooseModel?: () => void;
}>({ modelLabel: "" });

const COMPOSER_SUBSCRIPTIONS = [
  { driver: "codex", label: "ChatGPT / Codex", Icon: OpenAI },
  { driver: "claudeAgent", label: "Claude", Icon: ClaudeAI },
] as const;

function CompactPickerRegistration() {
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- registers the overview while the model list is unmounted
  useLayoutEffect(() => registerModelPickerContent(), []);
  return null;
}

export const ProviderModelPicker = memo(function ProviderModelPicker(props: {
  environmentId: EnvironmentId | null;
  activeInstanceId: ProviderInstanceId;
  model: string;
  selectedModels?: ReadonlyArray<{ instanceId: ProviderInstanceId; model: string }>;
  onToggleModel?: (instanceId: ProviderInstanceId, model: string) => void;
  lockedProvider: ProviderDriverKind | null;
  lockedContinuationGroupKey?: string | null;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  keybindings?: ResolvedKeybindingsConfig;
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  activeProviderIconClassName?: string;
  instanceIndicatorBackground?: string;
  size?: ComposerControlSize;
  compact?: boolean;
  isComposerOwned?: boolean;
  disabled?: boolean;
  terminalOpen?: boolean;
  open?: boolean;
  popupAlign?: "start" | "end";
  triggerClassName?: string;
  triggerLabel?: string;
  triggerAriaLabel?: string;
  onOpenChange?: (open: boolean) => void;
  onOpenProviderSetup?: (instanceId: ProviderInstanceId) => void;
  getModelDisabledReason?: (instanceId: ProviderInstanceId, model: string) => string | null;
  onInstanceModelChange: (instanceId: ProviderInstanceId, model: string) => void;
  /** Shown after the model name inside the same trigger, such as the effort level. */
  triggerSuffix?: ReactNode;
  /** Names the suffix for the tooltip and screen readers. */
  triggerDetail?: string | null;
  /** Composer shortcuts this trigger answers besides the picker's own. */
  triggerShortcuts?: string;
  /**
   * Docks an effort column beside the list and a footer under both. The popup then stays open
   * until Escape or an outside press, and picking a model moves focus to its levels.
   */
  effortColumn?: ReactNode;
  footer?: ReactNode;
}) {
  const composerFloatingLayerProps = useComposerMenuProps();
  const [uncontrolledIsMenuOpen, setUncontrolledIsMenuOpen] = useState(false);
  const isMenuOpen = props.open ?? uncontrolledIsMenuOpen;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const size = props.size ?? "sm";
  const docked = props.effortColumn !== undefined;
  const compactPicker = docked && props.isComposerOwned === true;
  const [choosingModel, setChoosingModel] = useState(false);
  const [providerTab, setBrowsedProvider] = useState<string | null>(null);
  const compactStageRef = useRef<HTMLDivElement | null>(null);
  const compactStageAnimationRef = useRef<Animation | null>(null);
  const compactPopupAnimationRef = useRef<Animation | null>(null);
  const compactPreviousPopupRectRef = useRef<DOMRectReadOnly | null>(null);
  const previousCompactStageRef = useRef<string | null>(null);

  const activeEntry =
    props.instanceEntries.find((entry) => entry.instanceId === props.activeInstanceId) ?? null;
  const supportedActiveProvider = COMPOSER_SUBSCRIPTIONS.find(
    (subscription) => subscription.driver === activeEntry?.driverKind,
  );
  const browsedProvider = providerTab ?? supportedActiveProvider?.driver ?? "codex";

  const activeInstanceId = props.activeInstanceId;
  const selectedInstanceOptions = props.modelOptionsByInstance.get(activeInstanceId) ?? [];
  const selectedModel =
    resolveModelPickerSelectedModel({
      driverKind: activeEntry?.driverKind,
      model: props.model,
      options: selectedInstanceOptions,
    }) ??
    (activeEntry?.driverKind === "opencode" || activeEntry?.driverKind === "antigravity"
      ? undefined
      : selectedInstanceOptions[0]);
  const triggerTitle = selectedModel
    ? getTriggerDisplayModelName(selectedModel, activeEntry?.driverKind)
    : props.model === ANTIGRAVITY_DEFAULT_MODEL
      ? "Choose model"
      : props.model || "Choose model";
  const triggerLabel = selectedModel
    ? `${getDisplayModelName(selectedModel)}${selectedModel.isUnavailable ? " (Unavailable)" : ""}`
    : triggerTitle;
  const showInstanceBadge =
    activeEntry !== null && shouldShowInstanceBadge(activeEntry, props.instanceEntries);

  const setIsMenuOpen = (open: boolean) => {
    if (open && !isMenuOpen && compactPicker) {
      const supported = COMPOSER_SUBSCRIPTIONS.some(
        (subscription) => subscription.driver === activeEntry?.driverKind,
      );
      setChoosingModel(!supported);
      setBrowsedProvider(supported ? activeEntry!.driverKind : "codex");
    }
    props.onOpenChange?.(open);
    if (props.open === undefined) {
      setUncontrolledIsMenuOpen(open);
    }
  };

  const setCompactChoosingModel = (next: boolean) => {
    if (next !== choosingModel) {
      const rect = popupRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        compactPreviousPopupRectRef.current = rect;
      }
    }
    setChoosingModel(next);
  };

  /**
   * Focuses the selected reasoning level, else the first level. With `rows: "any"` it falls back
   * to the column's first enabled option. False when nothing took focus.
   */
  const focusEffort = (rows: "levels" | "any") => {
    const column = popupRef.current?.querySelector("[data-model-picker-effort]");
    const level =
      column?.querySelector<HTMLElement>(
        '[data-effort-level][aria-checked="true"]:not(:disabled)',
      ) ?? column?.querySelector<HTMLElement>("[data-effort-level]:not(:disabled)");
    // No aria-checked here: an On switch is checked but is not where focus belongs.
    const row =
      level ??
      column?.querySelector<HTMLElement>('input[type="range"]:not(:disabled)') ??
      (rows === "any"
        ? column?.querySelector<HTMLElement>(
            "[data-effort-row]:not(:disabled), [data-choose-model]",
          )
        : null);
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest" });
    return row != null;
  };
  const focusModel = () => {
    const row = popupRef.current?.querySelector<HTMLElement>(
      "[data-choose-model]:not([data-disabled])",
    );
    row?.focus({ preventScroll: true });
    row?.scrollIntoView({ block: "nearest" });
    return row != null;
  };
  const focusEffortAfterCompactTransition = useEffectEvent(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusEffort("any"));
    });
  });
  const handleCompactEscape = useEffectEvent(() => {
    setCompactChoosingModel(false);
    setBrowsedProvider(activeEntry?.driverKind ?? "codex");
    focusEffortAfterCompactTransition();
  });
  const openEffort = () => {
    if (compactPicker && choosingModel) {
      setCompactChoosingModel(false);
      setBrowsedProvider(activeEntry?.driverKind ?? "codex");
      focusEffortAfterCompactTransition();
      return;
    }
    focusEffort("any");
  };

  // Keep the popup mounted while its compact content changes so Floating UI can animate the
  // shared geometry instead of measuring a new popup for every picker state.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- animates committed compact popup DOM geometry before paint
  useLayoutEffect(() => {
    if (!compactPicker) {
      previousCompactStageRef.current = null;
      compactStageAnimationRef.current?.cancel();
      compactStageAnimationRef.current = null;
      compactPopupAnimationRef.current?.cancel();
      compactPopupAnimationRef.current = null;
      compactPreviousPopupRectRef.current = null;
      return;
    }

    const stage = compactStageRef.current;
    const nextStage = choosingModel ? "models" : "reasoning";
    const previousStage = previousCompactStageRef.current;
    previousCompactStageRef.current = nextStage;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const popup = popupRef.current;
    const previousRect = compactPreviousPopupRectRef.current;
    compactPreviousPopupRectRef.current = null;

    if (stage && previousStage !== null && previousStage !== nextStage && !reduceMotion) {
      if (typeof stage.animate === "function") {
        compactStageAnimationRef.current?.cancel();
        const animation = stage.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 180,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        });
        compactStageAnimationRef.current = animation;
        void animation.finished
          .catch(() => undefined)
          .then(() => {
            if (compactStageAnimationRef.current === animation) {
              compactStageAnimationRef.current = null;
            }
          });
      }
    }

    if (!popup || !previousRect || reduceMotion || typeof popup.animate !== "function") {
      compactPopupAnimationRef.current?.cancel();
      compactPopupAnimationRef.current = null;
      return;
    }
    const nextRect = popup.getBoundingClientRect();
    if (nextRect.width <= 0 || nextRect.height <= 0) return;

    // The popup's background owns the transition. Its content is already in its final layout,
    // so FLIP the outer rectangle from the previous state and let the new content fade in.
    compactPopupAnimationRef.current?.cancel();
    const popupAnimation = popup.animate(
      [
        {
          width: `${previousRect.width}px`,
          height: `${previousRect.height}px`,
          transform: `translate3d(${previousRect.left - nextRect.left}px, ${previousRect.top - nextRect.top}px, 0)`,
        },
        {
          width: `${nextRect.width}px`,
          height: `${nextRect.height}px`,
          transform: "translate3d(0, 0, 0)",
        },
      ],
      { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    compactPopupAnimationRef.current = popupAnimation;
    void popupAnimation.finished
      .catch(() => undefined)
      .then(() => {
        if (compactPopupAnimationRef.current === popupAnimation) {
          compactPopupAnimationRef.current = null;
        }
      });
  }, [choosingModel, compactPicker]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- keeps the window Escape listener in sync with the open popup state
  useEffect(() => {
    if (!isMenuOpen || !compactPicker || !choosingModel) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      handleCompactEscape();
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [choosingModel, compactPicker, isMenuOpen]);

  const handleInstanceModelChange = (instanceId: ProviderInstanceId, model: string) => {
    if (props.disabled) return;
    props.onInstanceModelChange(instanceId, model);
    if (!docked) {
      setIsMenuOpen(false);
      return;
    }
    if (compactPicker) setCompactChoosingModel(false);
    // The column renders the new model's levels on commit.
    if (compactPicker) {
      focusEffortAfterCompactTransition();
    } else {
      window.requestAnimationFrame(() => focusEffort("levels"));
    }
  };

  const shortcutLabel = props.keybindings
    ? shortcutLabelForCommand(props.keybindings, "modelPicker.toggle")
    : null;
  const selectedEntries = props.selectedModels?.map((selection) => {
    const entry = props.instanceEntries.find(
      (candidate) => candidate.instanceId === selection.instanceId,
    );
    const model = resolveModelPickerSelectedModel({
      driverKind: entry?.driverKind,
      model: selection.model,
      options: props.modelOptionsByInstance.get(selection.instanceId) ?? [],
    });
    const unavailable = model?.isUnavailable ? " (Unavailable)" : "";
    return {
      ...selection,
      entry,
      label: model
        ? `${getTriggerDisplayModelName(model, entry?.driverKind)}${unavailable}`
        : selection.model,
      fullLabel: model ? `${getDisplayModelName(model)}${unavailable}` : selection.model,
    };
  });
  const multipleLabel = selectedEntries
    ? selectedEntries.length === 0
      ? "Choose models"
      : `${selectedEntries
          .slice(0, 2)
          .map((selection) => selection.label)
          .join(", ")}${selectedEntries.length > 2 ? `, ${selectedEntries.length - 2} more` : ""}`
    : undefined;
  const allModelNames = selectedEntries
    ? selectedEntries.map((selection) => selection.fullLabel).join(", ") || "Choose models"
    : undefined;
  const triggerTooltipContent = [
    props.triggerLabel ?? allModelNames ?? triggerLabel,
    props.triggerDetail,
    shortcutLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const triggerText = props.triggerLabel ?? multipleLabel ?? triggerTitle;
  const triggerTextProps = {
    className: cn(
      "min-w-0 flex-1 overflow-hidden truncate",
      // Long names such as "Fusion (Claude Opus 5.5 Medium + SWE-2 High)" would push the composer.
      props.isComposerOwned && "max-w-56",
    ),
    "data-chat-provider-model-picker-label": "true",
  } as const;

  const picker = (
    <ModelPickerContent
      searchInputRef={searchInputRef}
      environmentId={props.environmentId}
      activeInstanceId={activeInstanceId}
      model={props.model}
      {...(props.selectedModels !== undefined ? { selectedModels: props.selectedModels } : {})}
      {...(props.onToggleModel
        ? {
            onToggleModel: (instanceId: ProviderInstanceId, model: string) => {
              if (!props.disabled) props.onToggleModel?.(instanceId, model);
            },
          }
        : {})}
      lockedProvider={props.lockedProvider}
      lockedContinuationGroupKey={props.lockedContinuationGroupKey ?? null}
      instanceEntries={
        compactPicker
          ? props.instanceEntries.filter((entry) => entry.driverKind === browsedProvider)
          : props.instanceEntries
      }
      simplified={compactPicker}
      {...(props.keybindings ? { keybindings: props.keybindings } : {})}
      modelOptionsByInstance={props.modelOptionsByInstance}
      terminalOpen={props.terminalOpen ?? false}
      onRequestClose={() => {
        if (compactPicker && choosingModel) {
          setCompactChoosingModel(false);
          setBrowsedProvider(activeEntry?.driverKind ?? "codex");
          focusEffortAfterCompactTransition();
        } else {
          setIsMenuOpen(false);
        }
      }}
      {...(props.onOpenProviderSetup ? { onOpenProviderSetup: props.onOpenProviderSetup } : {})}
      getModelDisabledReason={(instanceId, model) =>
        props.disabled
          ? "Model picker is disabled"
          : (props.getModelDisabledReason?.(instanceId, model) ?? null)
      }
      onInstanceModelChange={handleInstanceModelChange}
      {...(docked && !compactPicker
        ? {
            docked,
            onFocusEffort: () => void focusEffort("any"),
            // Inside the fixed height, so switching to or from a ChatGPT plan never resizes it.
            ...(props.selectedModels === undefined
              ? { listFooter: <ChatGptSharingControl provider={activeEntry?.snapshot ?? null} /> }
              : {}),
          }
        : {})}
    />
  );

  return (
    <Popover
      open={isMenuOpen}
      onOpenChange={(open) => {
        if (props.disabled) {
          setIsMenuOpen(false);
          return;
        }
        setIsMenuOpen(open);
      }}
      onOpenChangeComplete={(open) => {
        const target = takeOpenTarget(triggerRef.current);
        if (open && docked && target === "effort") openEffort();
        else if (open && compactPicker && choosingModel) window.requestAnimationFrame(focusModel);
      }}
    >
      <PopoverTrigger
        render={
          <ComposerControl
            ref={triggerRef}
            aria-label={[
              props.triggerAriaLabel ?? props.triggerLabel ?? allModelNames ?? triggerLabel,
              props.triggerDetail,
            ]
              .filter(Boolean)
              .join(", ")}
            size={size}
            data-chat-provider-model-picker="true"
            data-composer-shortcut={props.triggerShortcuts}
            onClick={(event) => {
              if (!isMenuOpen || !docked) return;
              const target = takeOpenTarget(triggerRef.current);
              if (target !== "effort") return;
              // A shortcut aimed at the open picker moves within it instead of closing it.
              (
                event as typeof event & { preventBaseUIHandler?: () => void }
              ).preventBaseUIHandler?.();
              openEffort();
            }}
            className={cn(
              "min-w-0 shrink justify-between whitespace-nowrap",
              props.compact
                ? "max-w-42 shrink-0"
                : !props.isComposerOwned && "max-w-48 sm:max-w-56",
              props.triggerClassName,
            )}
            disabled={props.disabled}
          />
        }
      >
        <span
          className={cn("flex min-w-0 flex-1 items-center", size === "xs" ? "gap-1" : "gap-1.5")}
        >
          {selectedEntries && props.triggerLabel === undefined ? (
            <span
              data-chat-provider-model-picker-icon
              className="flex shrink-0 items-center -space-x-1"
              aria-hidden="true"
            >
              {selectedEntries
                .slice(0, 3)
                .map((selection) =>
                  selection.entry ? (
                    <ProviderInstanceIcon
                      key={`${selection.instanceId}:${selection.model}`}
                      driverKind={selection.entry.driverKind}
                      displayName={selection.entry.displayName}
                      accentColor={selection.entry.accentColor}
                      acpRegistryAgentId={selection.entry.acpRegistryAgentId}
                      acpRegistryIconUrl={selection.entry.acpRegistryIconUrl}
                      className="size-4 rounded-full bg-(--chat-composer-glass-surface,var(--background)) ring-2 ring-(--chat-composer-glass-surface,var(--background))"
                      iconClassName="size-4"
                    />
                  ) : null,
                )}
              {selectedEntries.length > 3 ? (
                <span className="relative z-30 flex size-4 items-center justify-center rounded-full bg-(--chat-composer-glass-surface,var(--background)) text-3xs ring-2 ring-(--chat-composer-glass-surface,var(--background))">
                  +{selectedEntries.length - 3}
                </span>
              ) : null}
            </span>
          ) : activeEntry && props.triggerLabel === undefined ? (
            // Narrow compacted composers hide the provider icon before truncating the name.
            <span data-chat-provider-model-picker-icon className="contents">
              <ProviderInstanceIcon
                driverKind={activeEntry.driverKind}
                displayName={activeEntry.displayName}
                accentColor={activeEntry.accentColor}
                acpRegistryAgentId={activeEntry.acpRegistryAgentId}
                acpRegistryIconUrl={activeEntry.acpRegistryIconUrl}
                showBadge={showInstanceBadge}
                className="size-4"
                iconClassName={cn("size-4", props.activeProviderIconClassName)}
                indicatorBackground={props.instanceIndicatorBackground ?? "var(--contrast-input)"}
                badgeClassName={cn(
                  "right-[-0.125rem] bottom-[-0.125rem] h-3 min-w-3 px-0.5 text-5xs",
                  size === "xs" && "shadow-none",
                )}
              />
            </span>
          ) : null}
          {props.isComposerOwned ? (
            <span {...triggerTextProps}>{triggerText}</span>
          ) : (
            <Tooltip>
              <TooltipTrigger render={<span {...triggerTextProps} />}>{triggerText}</TooltipTrigger>
              <TooltipPopup side="top">{triggerTooltipContent}</TooltipPopup>
            </Tooltip>
          )}
          {props.triggerSuffix}
          {selectedModel?.isUnavailable && !selectedEntries && props.triggerLabel === undefined ? (
            <Badge variant="outline" size="sm">
              Unavailable
            </Badge>
          ) : null}
        </span>
      </PopoverTrigger>
      <PopoverPopup
        {...(props.isComposerOwned ? composerFloatingLayerProps : {})}
        ref={(popup) => {
          popupRef.current = popup;
          const unlock = lockBackgroundScroll(popup);
          return () => {
            popupRef.current = null;
            unlock?.();
          };
        }}
        initialFocus={compactPicker ? undefined : searchInputRef}
        align={props.popupAlign ?? "start"}
        // Docked, the popup opens above the composer and slides over it when that space is short,
        // so a short window gets its full height (Floating UI sizes to the viewport) instead of a sliver.
        {...(docked
          ? {
              side: "top" as const,
              collisionAvoidance: {
                side: compactPicker ? ("flip" as const) : ("shift" as const),
                align: "shift" as const,
              },
            }
          : {})}
        className="before:hidden"
        padding="none"
        touchBackdrop
      >
        {compactPicker ? (
          <div
            className="flex w-80 max-w-[calc(100vw-2rem)] flex-col"
            data-compact-model-picker
            onKeyDownCapture={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "Escape" && choosingModel) {
                event.preventDefault();
                event.stopPropagation();
                setCompactChoosingModel(false);
                setBrowsedProvider(activeEntry?.driverKind ?? "codex");
                focusEffortAfterCompactTransition();
                return;
              }
              const command = resolveShortcutCommand(event.nativeEvent, props.keybindings ?? [], {
                platform: navigator.platform,
                context: {
                  modelPickerOpen: true,
                  terminalFocus: false,
                  terminalOpen: props.terminalOpen ?? false,
                },
              });
              if (
                command !== "modelPicker.previousProvider" &&
                command !== "modelPicker.nextProvider"
              )
                return;
              const subscriptions = COMPOSER_SUBSCRIPTIONS.filter(
                ({ driver }) =>
                  (props.lockedProvider === null || props.lockedProvider === driver) &&
                  props.instanceEntries.some(
                    (entry) => entry.driverKind === driver && entry.enabled,
                  ),
              );
              if (subscriptions.length === 0) return;
              event.preventDefault();
              event.stopPropagation();
              const index = subscriptions.findIndex(({ driver }) => driver === browsedProvider);
              const direction = command === "modelPicker.nextProvider" ? 1 : -1;
              const next =
                subscriptions[(index + direction + subscriptions.length) % subscriptions.length]!;
              setBrowsedProvider(next.driver);
              setCompactChoosingModel(true);
              window.requestAnimationFrame(() => focusModel());
            }}
          >
            <CompactPickerRegistration />
            <div ref={compactStageRef} className="will-change-[opacity]">
              {choosingModel ? (
                <>
                  <div className="px-3 pt-3 pb-1">
                    <Button
                      variant="ghost-muted"
                      size="compact"
                      aria-label="Back to reasoning"
                      onClick={() => {
                        setCompactChoosingModel(false);
                        setBrowsedProvider(activeEntry?.driverKind ?? "codex");
                        focusEffortAfterCompactTransition();
                      }}
                    >
                      Back
                    </Button>
                  </div>
                  <div className="px-3 pt-3 pb-1">
                    <ToggleGroup
                      aria-label="Subscriptions"
                      variant="segmented"
                      size="default"
                      className="w-full"
                      value={[browsedProvider]}
                      onValueChange={(values) => {
                        const next = values[0];
                        if (!next) return;
                        setBrowsedProvider(next);
                        setCompactChoosingModel(true);
                        window.requestAnimationFrame(() => focusModel());
                      }}
                    >
                      {COMPOSER_SUBSCRIPTIONS.map(({ driver, label, Icon }) => {
                        const entries = props.instanceEntries.filter(
                          (entry) => entry.driverKind === driver,
                        );
                        const locked =
                          props.lockedProvider !== null && props.lockedProvider !== driver;
                        return (
                          <Toggle
                            key={driver}
                            value={driver}
                            className="flex-1"
                            aria-label={label}
                            title={locked ? "Start a new thread to switch subscriptions" : label}
                            disabled={locked || !entries.some((entry) => entry.enabled)}
                          >
                            <Icon className="size-5" aria-hidden />
                          </Toggle>
                        );
                      })}
                    </ToggleGroup>
                  </div>
                  {picker}
                  {props.selectedModels === undefined ? (
                    <ChatGptSharingControl provider={activeEntry?.snapshot ?? null} />
                  ) : null}
                </>
              ) : (
                <DockedPickerContext
                  value={{
                    modelLabel: selectedModel ? getDisplayModelName(selectedModel) : triggerTitle,
                    onChooseModel: () => {
                      setCompactChoosingModel(true);
                      window.requestAnimationFrame(() => focusModel());
                    },
                  }}
                >
                  <div data-model-picker-effort>{props.effortColumn}</div>
                </DockedPickerContext>
              )}
            </div>
          </div>
        ) : props.effortColumn ? (
          <DockedPickerContext value={{ modelLabel: triggerTitle }}>
            <div className="flex max-h-(--available-height) flex-col">
              {/* One fixed height, so a model with more options never resizes the popup. Short
                  windows shrink it and keep the footer. */}
              <div className="flex h-86.5 min-h-0 max-sm:h-auto max-sm:flex-col">
                {picker}
                <div
                  data-model-picker-effort
                  className="flex min-h-0 w-48 flex-col sm:shrink-0 border-l border-border/70 bg-muted/40 max-sm:h-64 max-sm:w-full max-sm:border-t max-sm:border-l-0"
                  onKeyDown={(event) => {
                    if (event.key !== "ArrowLeft" || event.altKey || event.ctrlKey || event.metaKey)
                      return;
                    event.preventDefault();
                    event.stopPropagation();
                    searchInputRef.current?.focus();
                  }}
                >
                  {props.effortColumn}
                </div>
              </div>
              {props.footer}
            </div>
          </DockedPickerContext>
        ) : (
          picker
        )}
        {props.selectedModels === undefined && !docked ? (
          <ChatGptSharingControl provider={activeEntry?.snapshot ?? null} />
        ) : null}
      </PopoverPopup>
    </Popover>
  );
});
