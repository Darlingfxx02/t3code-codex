import { ProviderDriverKind, ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import { useState } from "react";
import { createModelCapabilities } from "@t3tools/shared/model";
import { compileResolvedKeybindingsConfig } from "@t3tools/shared/keybindings";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import "~/index.css";

import { render } from "../../../test/render";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { ComposerEffortColumn } from "./ComposerModelEffort";

it("keeps each registry image when adding a model from another ACP agent", async () => {
  const icons = [
    "https://cdn.agentclientprotocol.com/registry/icons/picker-explicit.svg",
    "https://cdn.agentclientprotocol.com/registry/v1/latest/picker-by-id.svg",
  ];
  const cache = await caches.open("t3-acp-registry-icons-v1");
  await using _cachedIcons = {
    async [Symbol.asyncDispose]() {
      await Promise.all(icons.map((url) => cache.delete(url)));
    },
  };
  for (const [index, url] of icons.entries()) {
    await cache.put(
      url,
      new Response(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${11 + index * 6}" height="10"><path d="M0 0h10v10H0z"/></svg>`,
        { headers: { "content-type": "image/svg+xml" } },
      ),
    );
  }
  const entries = deriveProviderInstanceEntries(
    ["First", "Second"].map((name) => ({
      instanceId: ProviderInstanceId.make(name.toLowerCase()),
      driver: ProviderDriverKind.make("acpRegistry"),
      displayName: `${name} agent`,
      enabled: true,
      installed: true,
      version: null,
      status: "ready" as const,
      auth: { status: "authenticated" as const },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [
        { slug: name.toLowerCase(), name: `${name} model`, isCustom: false, capabilities: {} },
      ],
      slashCommands: [],
      skills: [],
    })),
  ).map((entry, index) => ({
    ...entry,
    ...(index === 0 ? { acpRegistryIconUrl: icons[0] } : { acpRegistryAgentId: "picker-by-id" }),
  }));
  const first = { instanceId: entries[0]!.instanceId, model: "first" };
  const options = new Map(entries.map((entry) => [entry.instanceId, entry.models]));

  function Picker() {
    const [selection, setSelection] = useState<ReadonlyArray<ModelSelection>>([first]);
    return (
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={first.instanceId}
        model={first.model}
        {...(selection.length > 1 ? { selectedModels: selection } : {})}
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={options}
        onToggleModel={(instanceId, model) => setSelection([...selection, { instanceId, model }])}
        onInstanceModelChange={(instanceId, model) => setSelection([{ instanceId, model }])}
      />
    );
  }

  await using screen = await render(<Picker />);
  const imageWidths = () =>
    Array.from(
      screen.container.querySelectorAll<HTMLImageElement>("[data-chat-provider-model-picker] img"),
      (image) => image.naturalWidth,
    );
  await vi.waitFor(() => expect(imageWidths()).toEqual([11]));
  await screen.getByRole("button", { name: "First model", exact: true }).click();
  await page.getByRole("button", { name: "Second agent", exact: true }).click();
  await userEvent.keyboard("{Shift>}");
  try {
    await page.getByRole("option", { name: /Second model/ }).click();
  } finally {
    await userEvent.keyboard("{/Shift}");
  }
  await userEvent.keyboard("{Escape}");
  await vi.waitFor(() => expect(imageWidths()).toEqual([11, 17]));
});

it("keeps a docked picker open after a pick and hands focus to that model's effort", async () => {
  const instanceId = ProviderInstanceId.make("codex");
  const entries = deriveProviderInstanceEntries([
    {
      instanceId,
      driver: ProviderDriverKind.make("codex"),
      enabled: true,
      installed: true,
      version: null,
      status: "ready",
      auth: { status: "authenticated" },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [],
      slashCommands: [],
      skills: [],
    },
  ]);
  const options = new Map([
    [
      instanceId,
      [
        { slug: "original", name: "Original model" },
        { slug: "second", name: "Second model" },
        { slug: "plain", name: "Plain model" },
      ],
    ],
  ]);
  // The last level is the selected one; "plain" has no effort to pick.
  const levels: Record<string, ReadonlyArray<string>> = {
    original: ["Low", "High"],
    second: ["Medium"],
    plain: [],
  };

  function Picker() {
    const [model, setModel] = useState("original");
    return (
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={instanceId}
        model={model}
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={options}
        triggerAriaLabel="Choose model"
        onInstanceModelChange={(_, selected) => setModel(selected)}
        effortColumn={(levels[model] ?? []).map((level, index, all) => (
          <button
            key={level}
            type="button"
            role="radio"
            aria-checked={index === all.length - 1}
            data-effort-row
            data-effort-level
          >
            {level}
          </button>
        ))}
      />
    );
  }

  await using screen = await render(<Picker />);
  await screen.getByRole("button", { name: "Choose model" }).click();
  const search = page.getByPlaceholder("Search models...");
  await expect.element(search).toHaveFocus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.element(page.getByRole("radio", { name: "High" })).toHaveFocus();
  await userEvent.keyboard("{ArrowLeft}");
  await expect.element(search).toHaveFocus();

  await page.getByRole("option", { name: /Second model/ }).click();
  await expect.element(page.getByRole("radio", { name: "Medium" })).toHaveFocus();

  await page.getByRole("option", { name: /Plain model/ }).click();
  await page.getByRole("option", { name: /Second model/ }).click();
  await expect.element(page.getByRole("radio", { name: "Medium" })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(search).not.toBeInTheDocument();
});

it("chooses a model in two steps and only offers the two subscriptions in the composer", async () => {
  const entries = deriveProviderInstanceEntries(
    ["codex", "claudeAgent", "cursor"].map((driver) => ({
      instanceId: ProviderInstanceId.make(driver),
      driver: ProviderDriverKind.make(driver),
      enabled: true,
      installed: true,
      version: null,
      status: "ready" as const,
      auth: { status: "authenticated" as const },
      checkedAt: "2026-01-01T00:00:00.000Z",
      models: [
        {
          slug: driver,
          name: `${driver} model`,
          isCustom: false,
          capabilities: createModelCapabilities({
            optionDescriptors: [
              {
                id: "reasoningEffort",
                label: "Reasoning",
                type: "select",
                currentValue: "high",
                options: [
                  { id: "low", label: "Low" },
                  { id: "medium", label: "Medium", isDefault: true },
                  { id: "high", label: "High" },
                  { id: "xhigh", label: "Extra High" },
                  { id: "max", label: "Max" },
                ],
              },
            ],
          }),
        },
      ],
      slashCommands: [],
      skills: [],
    })),
  );
  function Picker({ locked = false }: { locked?: boolean }) {
    const [selection, setSelection] = useState({
      instanceId: entries[0]!.instanceId,
      model: "codex",
    });
    return (
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={selection.instanceId}
        model={selection.model}
        lockedProvider={locked ? entries[0]!.driverKind : null}
        instanceEntries={entries}
        modelOptionsByInstance={new Map(entries.map((entry) => [entry.instanceId, entry.models]))}
        isComposerOwned
        triggerAriaLabel="Model settings"
        keybindings={compileResolvedKeybindingsConfig([
          { key: "alt+arrowright", command: "modelPicker.nextProvider", when: "modelPickerOpen" },
        ])}
        onInstanceModelChange={(instanceId, model) => setSelection({ instanceId, model })}
        effortColumn={
          <ComposerEffortColumn
            traits={{
              provider: entries.find((entry) => entry.instanceId === selection.instanceId)!
                .driverKind,
              instanceId: selection.instanceId,
              models: entries.find((entry) => entry.instanceId === selection.instanceId)!.models,
              model: selection.model,
              planModeEnabled: false,
              onModelOptionsChange: () => {},
            }}
          />
        }
      />
    );
  }

  await using screen = await render(<Picker />);
  await screen.getByRole("button", { name: "Model settings" }).click();
  await expect.element(page.getByPlaceholder("Search models...")).not.toBeInTheDocument();
  await expect.element(page.getByRole("group", { name: "Subscriptions" })).not.toBeInTheDocument();
  await expect.element(page.getByRole("button", { name: "cursor" })).not.toBeInTheDocument();
  await page.getByRole("button", { name: "Choose model: codex model", exact: true }).click();
  await expect.element(page.getByPlaceholder("Search models...")).not.toBeInTheDocument();
  await expect.element(page.getByRole("option", { name: /codex model/ })).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Favorites", exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: "Claude", exact: true }).click();
  await expect.element(page.getByRole("option", { name: /codex model/ })).not.toBeInTheDocument();
  await page.getByRole("option", { name: /claudeAgent model/ }).click();
  await expect.element(page.getByRole("slider", { name: "Reasoning" })).toHaveFocus();
  await expect
    .element(page.getByRole("button", { name: "Choose model: claudeAgent model", exact: true }))
    .toBeVisible();
  await expect.element(page.getByPlaceholder("Search models...")).not.toBeInTheDocument();
  await userEvent.keyboard("{Alt>}{ArrowRight}{/Alt}");
  await expect.element(page.getByRole("option", { name: /codex model/ })).toBeVisible();
  await page.getByRole("button", { name: "Back to reasoning" }).click();
  await userEvent.keyboard("{Escape}");
  await screen.getByRole("button", { name: "Model settings" }).click();
  await page.getByRole("button", { name: "Choose model: claudeAgent model", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "Claude", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("slider", { name: "Reasoning" })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await screen.rerender(<Picker locked />);
  await screen.getByRole("button", { name: "Model settings" }).click();
  await page.getByRole("button", { name: "Choose model: claudeAgent model", exact: true }).click();
  await expect.element(page.getByRole("button", { name: "Claude", exact: true })).toBeDisabled();
});
