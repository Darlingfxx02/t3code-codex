import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderOptionSelection,
  type ServerProviderModel,
} from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";
import { useState } from "react";
import { expect, it } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { ComposerEffortColumn, describeComposerEffort } from "./ComposerModelEffort";
import type { TraitsSelectionInput } from "./TraitsPicker";
import { DockedPickerContext } from "./ProviderModelPicker";

// Shaped like Devin over ACP: its session mode comes first, and its reasoning id is its own.
const models: ReadonlyArray<ServerProviderModel> = [
  {
    slug: "fusion",
    name: "Fusion (Claude Opus 5.5 Medium + SWE-2 High)",
    isCustom: false,
    capabilities: createModelCapabilities({
      optionDescriptors: [
        {
          id: "mode",
          label: "Session Mode",
          type: "select",
          currentValue: "bypass",
          options: [
            { id: "code", label: "Code" },
            { id: "plan", label: "Plan" },
            { id: "bypass", label: "Bypass Permissions" },
          ],
        },
        {
          id: "thought_level",
          label: "Thinking",
          type: "select",
          role: "reasoning",
          currentValue: "medium",
          options: [
            { id: "low", label: "Low" },
            { id: "medium", label: "Medium" },
            { id: "high", label: "High" },
          ],
        },
        {
          id: "speed",
          label: "Speed",
          type: "select",
          currentValue: "standard",
          options: [
            { id: "standard", label: "Standard" },
            { id: "fast", label: "Fast" },
          ],
        },
        { id: "auto_approve", label: "Auto-approve tools", type: "boolean", currentValue: false },
      ],
    }),
  },
];

function traitsInput(
  modelOptions: ReadonlyArray<ProviderOptionSelection>,
  onModelOptionsChange: (next: ReadonlyArray<ProviderOptionSelection> | undefined) => void,
): TraitsSelectionInput {
  return {
    provider: ProviderDriverKind.make("acpRegistry"),
    instanceId: ProviderInstanceId.make("devin"),
    models,
    model: "fusion",
    modelOptions,
    planModeEnabled: false,
    onModelOptionsChange,
  };
}

function Column() {
  const [options, setOptions] = useState<ReadonlyArray<ProviderOptionSelection>>([]);
  const traits = traitsInput(options, (next) => setOptions(next ?? []));
  return (
    <>
      <div data-model-picker-effort>
        <ComposerEffortColumn traits={traits} />
      </div>
      <p role="status">{describeComposerEffort(traits, "bars", "sm").suffix}</p>
    </>
  );
}

it("draws an agent's reasoning as bars and keeps its mode out of the levels", async () => {
  await using screen = await render(<Column />, { router: false }); // no routes involved
  const status = screen.getByRole("status");
  expect(status.element().querySelector("[data-composer-effort-glyph]")).not.toBeNull();
  await expect.element(status).toHaveTextContent("");

  const levels = screen.getByRole("radiogroup", { name: "Thinking" });
  await expect.element(levels.getByRole("radio")).toHaveLength(3);
  await expect.element(screen.getByRole("radio", { name: "Plan" })).not.toBeInTheDocument();

  // Up and Down walk from the levels through the option rows without opening their menus.
  await userEvent.tab();
  await expect.element(screen.getByRole("radio", { name: "Medium" })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
  const speed = screen.getByRole("button", { name: "Speed: Standard" });
  await expect.element(speed).toHaveFocus();
  await expect.element(page.getByRole("menuitemradio")).not.toBeInTheDocument();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(page.getByRole("menuitemradio", { name: "Standard" })).toHaveFocus();
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(page.getByRole("menuitemradio")).not.toBeInTheDocument();
  await expect.element(speed).toHaveFocus();

  await userEvent.click(screen.getByText("Auto-approve tools"));
  await expect
    .element(screen.getByRole("switch", { name: "Auto-approve tools" }))
    .toHaveAttribute("aria-checked", "true");

  await userEvent.click(screen.getByRole("button", { name: "Session Mode: Bypass Permissions" }));
  await userEvent.click(page.getByRole("menuitemradio", { name: "Plan" }));
  await expect
    .element(screen.getByRole("button", { name: "Session Mode: Plan" }))
    .toBeInTheDocument();
  await expect.element(page.getByRole("menuitemradio")).not.toBeInTheDocument();
});

it("persists compact reasoning changes and resets to the model's default", async () => {
  const model = {
    slug: "gpt-model",
    name: "GPT model",
    isCustom: false,
    capabilities: createModelCapabilities({
      optionDescriptors: [
        {
          id: "reasoningEffort",
          label: "Reasoning",
          type: "select",
          currentValue: "medium",
          options: [
            { id: "low", label: "Low" },
            { id: "medium", label: "Medium", isDefault: true },
            { id: "high", label: "High" },
          ],
        },
      ],
    }),
  };
  function Compact() {
    const [options, setOptions] = useState<ReadonlyArray<ProviderOptionSelection>>([]);
    return (
      <DockedPickerContext value={{ modelLabel: model.name, onChooseModel: () => {} }}>
        <ComposerEffortColumn
          traits={{
            provider: ProviderDriverKind.make("codex"),
            instanceId: ProviderInstanceId.make("codex"),
            models: [model],
            model: model.slug,
            modelOptions: options,
            planModeEnabled: false,
            onModelOptionsChange: (next) => setOptions(next ?? []),
          }}
        />
        <output aria-label="Saved reasoning">
          {options.find((option) => option.id === "reasoningEffort")?.value}
        </output>
      </DockedPickerContext>
    );
  }
  await using screen = await render(<Compact />, { router: false }); // only local option persistence
  const slider = screen.getByRole("slider", { name: "Reasoning" });
  await expect.element(slider).toHaveAttribute("aria-valuetext", "Medium");
  await slider.click();
  await userEvent.keyboard("{End}");
  await expect.element(slider).toHaveAttribute("aria-valuetext", "High");
  await expect
    .element(screen.getByRole("status", { name: "Saved reasoning" }))
    .toHaveTextContent("high");
  await screen.getByRole("button", { name: "Reset reasoning level" }).click();
  await expect.element(slider).toHaveAttribute("aria-valuetext", "Medium");
  await expect
    .element(screen.getByRole("status", { name: "Saved reasoning" }))
    .toHaveTextContent("medium");
});
