import type {
  ModelSelection,
  ProviderInstanceId,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { BotIcon, CheckIcon, PencilRulerIcon } from "lucide-react";
import { type ComponentProps, memo, useId } from "react";

import type { ContextWindowSnapshot } from "../../lib/contextWindow";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerControl, ComposerControlIcon } from "./ComposerControl";
import { ComposerPrimaryActions } from "./ComposerPrimaryActions";
import { ContextWindowMeter, ContextWindowMeterPlaceholder } from "./ContextWindowMeter";
import { resolveModelPickerSelectedModel } from "./ModelPickerContent";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { runtimeModeConfig } from "./runtimeModeConfig";

export type RuntimeModeOption = {
  mode: RuntimeMode;
  disabledReason?: string;
} & (typeof runtimeModeConfig)[RuntimeMode];
export const ComposerFooterModeControls = memo(function ComposerFooterModeControls(props: {
  showInteractionModeToggle: boolean;
  interactionMode: ProviderInteractionMode;
  size?: "sm" | "xs";
  onToggleInteractionMode: () => void;
}) {
  const size = props.size ?? "sm";
  const interactionModeTooltip =
    props.interactionMode === "plan"
      ? "Plan mode. Click to return to normal build mode"
      : "Default mode. Click to enter plan mode";

  const interactionModeToggle = props.showInteractionModeToggle ? (
    <Tooltip>
      <TooltipTrigger
        render={
          <ComposerControl
            size={size}
            className="shrink-0 whitespace-nowrap"
            aria-pressed={props.interactionMode === "plan"}
            type="button"
            onClick={props.onToggleInteractionMode}
            aria-label={interactionModeTooltip}
          />
        }
      >
        {props.interactionMode === "plan" ? (
          <ComposerControlIcon
            icon={PencilRulerIcon}
            size={size}
            className="text-current opacity-100"
          />
        ) : (
          <ComposerControlIcon
            icon={BotIcon}
            size={size}
            opticalSize={size === "xs" ? "default" : "large"}
          />
        )}
        {/* The compacted row (xs) keeps this icon-only, like the other controls there. */}
        <span
          data-composer-control-label
          className={size === "xs" ? "sr-only" : "sr-only sm:not-sr-only"}
        >
          {props.interactionMode === "plan" ? "Plan" : "Build"}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="top">{interactionModeTooltip}</TooltipPopup>
    </Tooltip>
  ) : null;

  return interactionModeToggle;
});

export function ComposerPermissionsSection(props: {
  runtimeMode: RuntimeMode;
  runtimeModeOptions: ReadonlyArray<RuntimeModeOption>;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
}) {
  const descriptionId = useId();
  return (
    <div
      data-composer-permissions
      className="w-[min(40rem,calc(100vw-3rem))] max-w-[calc(100vw-3rem)]"
    >
      <div className="px-3 pt-2 pb-1 text-muted-foreground text-sm">Permissions</div>
      <MenuPrimitive.RadioGroup
        aria-label="Permissions"
        value={props.runtimeMode}
        onValueChange={(value: RuntimeMode) => {
          if (value !== props.runtimeMode) props.onRuntimeModeChange(value);
        }}
        className="grid gap-0.5"
      >
        {props.runtimeModeOptions.map((option) => {
          const OptionIcon = option.icon;
          return (
            <MenuPrimitive.RadioItem
              key={option.mode}
              value={option.mode}
              disabled={option.disabledReason !== undefined}
              label={option.label}
              aria-label={option.label}
              aria-describedby={`${descriptionId}-${option.mode}`}
              closeOnClick
              data-full-access={option.mode === "full-access" || undefined}
              className="flex cursor-pointer items-center gap-3 rounded-(--floating-item-radius) px-3 py-1.5 text-foreground outline-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-highlighted:bg-interactive-row-hover data-checked:data-full-access:text-permission-full-access focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <OptionIcon aria-hidden="true" className="size-4 shrink-0" />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-base">{option.label}</span>
                <span
                  id={`${descriptionId}-${option.mode}`}
                  className="truncate text-muted-foreground text-sm leading-5 in-data-checked:in-data-full-access:text-permission-full-access"
                >
                  {option.disabledReason ?? option.description}
                </span>
              </span>
              <span className="flex size-4 shrink-0 items-center justify-center">
                <MenuPrimitive.RadioItemIndicator>
                  <CheckIcon aria-hidden="true" className="size-4" />
                </MenuPrimitive.RadioItemIndicator>
              </span>
            </MenuPrimitive.RadioItem>
          );
        })}
      </MenuPrimitive.RadioGroup>
    </div>
  );
}

export const ComposerFooterPrimaryActions = memo(function ComposerFooterPrimaryActions(props: {
  compact: boolean;
  canOperateThread: boolean;
  activeContextWindow: ContextWindowSnapshot | null;
  reserveContextWindowMeter: boolean;
  activeThreadModelDisplayName: string | null;
  isPreparingWorktree: boolean;
  pendingAction: {
    questionIndex: number;
    isLastQuestion: boolean;
    canAdvance: boolean;
    isResponding: boolean;
    isComplete: boolean;
  } | null;
  isRunning: boolean;
  canInterrupt: boolean;
  followUpBehavior: "queue" | "steer";
  canSteer: boolean;
  alternateShortcutLabel: string | null;
  showPlanFollowUpPrompt: boolean;
  promptHasText: boolean;
  isSendBusy: boolean;
  sendDisabledReason: string | null;
  isEnvironmentUnavailable: boolean;
  hasSendableContent: boolean;
  canResume: boolean;
  preserveComposerFocusOnPointerDown?: boolean;
  isEditingQueuedMessage: boolean;
  onSubmitMessage: React.MouseEventHandler<HTMLButtonElement>;
  onResume: () => void;
  onPreviousPendingQuestion: () => void;
  onInterrupt: () => void;
  onImplementPlanInNewThread: () => void;
  onCompactContext?: (() => void) | undefined;
  compactDisabled: boolean;
  compactDisabledReason: string | null;
  compactBeforeSendTokens: number | null;
  keepFullHistory: boolean;
  onToggleKeepFullHistory: () => void;
}) {
  return (
    <>
      {props.activeContextWindow ? (
        <ContextWindowMeter
          usage={props.activeContextWindow}
          modelDisplayName={props.activeThreadModelDisplayName}
          onCompact={props.onCompactContext}
          compactDisabled={props.compactDisabled}
          compactDisabledReason={props.compactDisabledReason}
        />
      ) : props.reserveContextWindowMeter ? (
        <ContextWindowMeterPlaceholder />
      ) : null}
      <ComposerPrimaryActions
        compact={props.compact}
        canOperateThread={props.canOperateThread}
        pendingAction={props.pendingAction}
        isRunning={props.isRunning}
        canInterrupt={props.canInterrupt}
        followUpBehavior={props.followUpBehavior}
        canSteer={props.canSteer}
        alternateShortcutLabel={props.alternateShortcutLabel}
        showPlanFollowUpPrompt={props.showPlanFollowUpPrompt}
        promptHasText={props.promptHasText}
        isSendBusy={props.isSendBusy}
        sendDisabledReason={props.sendDisabledReason}
        isEnvironmentUnavailable={props.isEnvironmentUnavailable}
        isPreparingWorktree={props.isPreparingWorktree}
        hasSendableContent={props.hasSendableContent}
        canResume={props.canResume}
        preserveComposerFocusOnPointerDown={props.preserveComposerFocusOnPointerDown ?? false}
        isEditingQueuedMessage={props.isEditingQueuedMessage}
        onSubmitMessage={props.onSubmitMessage}
        onResume={props.onResume}
        onPreviousPendingQuestion={props.onPreviousPendingQuestion}
        onInterrupt={props.onInterrupt}
        onImplementPlanInNewThread={props.onImplementPlanInNewThread}
        compactBeforeSendTokens={props.compactBeforeSendTokens}
        keepFullHistory={props.keepFullHistory}
        onToggleKeepFullHistory={props.onToggleKeepFullHistory}
      />
    </>
  );
});

/**
 * The composer's model picker. It owns the single- and multi-model selection
 * handlers so they are cached against the selection state, not rebuilt on
 * every ChatComposer render.
 */
export function ComposerModelPicker({
  multipleModelsEnabled,
  multipleModelSelections,
  onMultipleModelSelectionsChange,
  selectedModelSelection,
  onProviderModelSelect,
  ...pickerProps
}: Omit<
  ComponentProps<typeof ProviderModelPicker>,
  "selectedModels" | "onToggleModel" | "onInstanceModelChange"
> & {
  readonly multipleModelsEnabled: boolean;
  readonly multipleModelSelections: ReadonlyArray<ModelSelection> | null;
  readonly onMultipleModelSelectionsChange: (
    selections: ReadonlyArray<ModelSelection> | null,
  ) => void;
  readonly selectedModelSelection: ModelSelection;
  readonly onProviderModelSelect: (
    instanceId: ProviderInstanceId,
    model: string,
    options?: { focusComposer?: boolean },
  ) => void;
}) {
  const { instanceEntries, modelOptionsByInstance } = pickerProps;
  const toggleModel = (instanceId: ProviderInstanceId, model: string) => {
    const current = multipleModelSelections ?? [selectedModelSelection];
    const matchesModel = (selection: ModelSelection) => {
      if (selection.instanceId !== instanceId) return false;
      const entry = instanceEntries.find((entry) => entry.instanceId === selection.instanceId);
      const resolvedModel = resolveModelPickerSelectedModel({
        driverKind: entry?.driverKind,
        model: selection.model,
        options: modelOptionsByInstance?.get(selection.instanceId) ?? [],
      });
      return (resolvedModel?.slug ?? selection.model) === model;
    };
    const exists = current.some(matchesModel);
    const next = exists
      ? current.filter((selection) => !matchesModel(selection))
      : [...current, createModelSelection(instanceId, model)];
    if (next.length > 1) {
      onMultipleModelSelectionsChange(next);
    } else {
      onMultipleModelSelectionsChange(null);
      const remaining = next[0] ?? selectedModelSelection;
      onProviderModelSelect(remaining.instanceId, remaining.model, {
        focusComposer: false,
      });
    }
  };
  return (
    <ProviderModelPicker
      {...pickerProps}
      {...(multipleModelsEnabled
        ? {
            ...(multipleModelSelections !== null
              ? { selectedModels: multipleModelSelections }
              : {}),
            onToggleModel: toggleModel,
          }
        : {})}
      onInstanceModelChange={(instanceId, model) => {
        onMultipleModelSelectionsChange(null);
        onProviderModelSelect(instanceId, model);
      }}
    />
  );
}
