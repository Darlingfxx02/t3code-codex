export function resolveComposerControlsOwnership(input: {
  readonly planModeUiEnabled: boolean;
  readonly measuredHiddenBlockCount: number;
}) {
  const modeHidden = input.planModeUiEnabled && input.measuredHiddenBlockCount > 0;
  const hiddenBlockIds = modeHidden ? (["mode"] as const) : ([] as const);
  return {
    showModeBlock: input.planModeUiEnabled,
    hiddenBlockCount: hiddenBlockIds.length,
    hiddenBlockIds,
    showOverflow: modeHidden,
  };
}
