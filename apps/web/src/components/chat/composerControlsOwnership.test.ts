import { describe, expect, it } from "vite-plus/test";

import { resolveComposerControlsOwnership } from "./composerControlsOwnership";

describe("resolveComposerControlsOwnership", () => {
  it.each([false, true])(
    "keeps permissions out of overflow with Plan enabled: %s",
    (planModeUiEnabled) => {
      const result = resolveComposerControlsOwnership({
        planModeUiEnabled,
        measuredHiddenBlockCount: 0,
      });
      expect(result).toMatchObject({
        showModeBlock: planModeUiEnabled,
        hiddenBlockIds: [],
        showOverflow: false,
      });
    },
  );

  it("overflows only the Plan toggle when space runs out", () => {
    const result = resolveComposerControlsOwnership({
      planModeUiEnabled: true,
      measuredHiddenBlockCount: 1,
    });
    expect(result).toMatchObject({
      showModeBlock: true,
      hiddenBlockIds: ["mode"],
      hiddenBlockCount: 1,
      showOverflow: true,
    });
    expect(
      resolveComposerControlsOwnership({ planModeUiEnabled: false, measuredHiddenBlockCount: 1 })
        .showOverflow,
    ).toBe(false);
  });
});
