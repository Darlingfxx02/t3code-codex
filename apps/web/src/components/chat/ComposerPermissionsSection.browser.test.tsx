import type { RuntimeMode } from "@t3tools/contracts";
import { type ReactNode, useRef, useState } from "react";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { ComposerHandleContext, type ComposerHandleRef } from "../../composerHandleContext";
import { ComposerPermissionsButton } from "./ComposerPermissionsButton";
import { Menu, MenuPopup, MenuRadioGroup, MenuRadioItem, MenuTrigger } from "../ui/menu";
import {
  focusRequestedPermission,
  markOpenToPermissions,
  useComposerMenuProps,
} from "./composerEventScope";
import { ComposerPermissionsSection } from "./ComposerFooterControls";
import { runtimeModeConfig, runtimeModeOptions } from "./runtimeModeConfig";

const options = runtimeModeOptions.map((mode) => ({ mode, ...runtimeModeConfig[mode] }));

// Mirrors the overflow menu: mode radio items first, then the Permissions section.
function OverflowMenu() {
  const [interaction, setInteraction] = useState("plan");
  const [mode, setMode] = useState<RuntimeMode>("full-access");
  const composerMenuProps = useComposerMenuProps();
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Menu onOpenChangeComplete={(open) => focusRequestedPermission(open, triggerRef.current)}>
        <MenuTrigger ref={triggerRef}>More</MenuTrigger>
        <MenuPopup {...composerMenuProps}>
          <MenuRadioGroup value={interaction} onValueChange={setInteraction}>
            <MenuRadioItem value="default">Chat</MenuRadioItem>
            <MenuRadioItem value="plan">Plan</MenuRadioItem>
          </MenuRadioGroup>
          <ComposerPermissionsSection
            runtimeMode={mode}
            runtimeModeOptions={options}
            onRuntimeModeChange={setMode}
          />
        </MenuPopup>
      </Menu>
      <p role="status">{mode}</p>
    </>
  );
}

it("reaches the labelled permission rows with arrow keys and picks with Enter", async () => {
  await using screen = await render(<OverflowMenu />, { router: false }); // no routes involved
  const trigger = screen.getByRole("button", { name: "More" });
  await userEvent.tab();
  await expect.element(trigger).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(page.getByRole("menuitemradio", { name: "Chat" })).toHaveFocus();

  await userEvent.keyboard("{ArrowDown}{ArrowDown}");
  const supervised = page.getByRole("menuitemradio", { name: "Supervised" });
  await expect.element(supervised).toHaveFocus();
  await expect
    .element(supervised)
    .toHaveAccessibleDescription("Always ask before running commands or changing files.");

  await userEvent.keyboard("{ArrowDown}");
  await expect
    .element(page.getByRole("menuitemradio", { name: "Auto-accept edits" }))
    .toHaveFocus();
  await userEvent.keyboard("{ArrowUp}");
  await expect.element(page.getByRole("menuitemradio", { name: "Supervised" })).toHaveFocus();

  await userEvent.keyboard("{ArrowUp}");
  await expect.element(page.getByRole("menuitemradio", { name: "Plan" })).toHaveFocus();

  await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  await expect.element(screen.getByRole("status")).toHaveTextContent("auto-accept-edits");
  await expect
    .element(page.getByRole("menuitemradio", { name: "Supervised" }))
    .not.toBeInTheDocument();
  await expect.element(trigger).toHaveFocus();
});

it("marks the current mode as checked and closes on Escape", async () => {
  await using screen = await render(<OverflowMenu />, { router: false }); // no routes involved
  await userEvent.tab();
  await userEvent.keyboard("{ArrowDown}");
  const fullAccess = page.getByRole("menuitemradio", { name: "Full access" });
  await expect.element(fullAccess).toHaveAttribute("aria-checked", "true");
  await userEvent.keyboard("{Escape}");
  await expect.element(fullAccess).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button", { name: "More" })).toHaveFocus();
});

// The real composer menu focus rule (useComposerMenuProps), with a stub composer handle.
function withComposer(children: ReactNode) {
  const handle = { focusAtEnd: vi.fn() };
  const ref = { current: handle } as unknown as ComposerHandleRef;
  return { handle, ui: <ComposerHandleContext value={ref}>{children}</ComposerHandleContext> };
}

it("returns focus to the editor after a pick", async () => {
  const { handle, ui } = withComposer(<OverflowMenu />);
  await using screen = await render(ui, { router: false }); // no routes involved
  await userEvent.tab();
  await userEvent.keyboard("{ArrowDown}");
  await expect.element(page.getByRole("menuitemradio", { name: "Chat" })).toHaveFocus();
  await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
  await expect.element(screen.getByRole("status")).toHaveTextContent("approval-required");
  await vi.waitFor(() => expect(handle.focusAtEnd).toHaveBeenCalled());
});

it("opens on the checked permission when composer.mode marked the trigger", async () => {
  await using screen = await render(<OverflowMenu />, { router: false }); // no routes involved
  const trigger = screen.getByRole("button", { name: "More" });
  markOpenToPermissions(trigger.element() as HTMLElement);
  await userEvent.click(trigger);
  await expect.element(page.getByRole("menuitemradio", { name: "Full access" })).toHaveFocus();

  // The mark is used once: a plain reopen lands on the menu's usual first focus.
  await userEvent.keyboard("{Escape}");
  await userEvent.click(trigger);
  await expect.element(page.getByRole("menuitemradio", { name: "Full access" })).not.toHaveFocus();
});

function PermissionsButton() {
  const [mode, setMode] = useState<RuntimeMode>("full-access");
  return (
    <ComposerPermissionsButton
      runtimeMode={mode}
      runtimeModeOptions={options.filter(
        (option) => option.mode === "approval-required" || option.mode === "full-access",
      )}
      onRuntimeModeChange={setMode}
    />
  );
}

it("keeps the dedicated button visible after changing and reopening a supported mode", async () => {
  await using screen = await render(<PermissionsButton />, { router: false }); // no routes involved
  await userEvent.click(screen.getByRole("button", { name: "Permissions: Full access" }));
  await expect
    .element(page.getByRole("menuitemradio", { name: "Full access" }))
    .toHaveAttribute("aria-checked", "true");
  await expect
    .element(page.getByRole("menuitemradio", { name: "Auto", exact: true }))
    .not.toBeInTheDocument();
  await userEvent.click(page.getByRole("menuitemradio", { name: "Supervised" }));
  const trigger = screen.getByRole("button", { name: "Permissions: Supervised" });
  await expect.element(trigger).toBeVisible();
  await expect
    .element(page.getByRole("menuitemradio", { name: "Supervised" }))
    .not.toBeInTheDocument();
  await userEvent.click(trigger);
  await expect
    .element(page.getByRole("menuitemradio", { name: "Supervised" }))
    .toHaveAttribute("aria-checked", "true");
  await userEvent.keyboard("{Escape}");
  await expect.element(trigger).toHaveFocus();
});

it("opens the current permission from composer.mode and keeps managed restrictions", async () => {
  const onChange = vi.fn();
  await using screen = await render(
    <ComposerPermissionsButton
      runtimeMode="approval-required"
      runtimeModeOptions={options.map((option) =>
        option.mode === "full-access"
          ? { ...option, disabledReason: "Disabled by your organization." }
          : option,
      )}
      onRuntimeModeChange={onChange}
    />,
    { router: false }, // no routes involved
  );
  const trigger = screen.getByRole("button", { name: "Permissions: Supervised" });
  markOpenToPermissions(trigger.element() as HTMLElement);
  await userEvent.click(trigger);
  await expect.element(page.getByRole("menuitemradio", { name: "Supervised" })).toHaveFocus();
  const fullAccess = page.getByRole("menuitemradio", { name: "Full access" });
  await expect.element(fullAccess).toHaveAttribute("aria-disabled", "true");
  await expect.element(fullAccess).toHaveAccessibleDescription("Disabled by your organization.");
  await userEvent.keyboard("{Escape}");
  expect(onChange).not.toHaveBeenCalled();
});

it("returns focus to the editor after choosing from the dedicated button", async () => {
  const { handle, ui } = withComposer(<PermissionsButton />);
  await using screen = await render(ui, { router: false }); // no routes involved
  await userEvent.click(screen.getByRole("button", { name: "Permissions: Full access" }));
  await userEvent.click(page.getByRole("menuitemradio", { name: "Supervised" }));
  await vi.waitFor(() => expect(handle.focusAtEnd).toHaveBeenCalled());
  await expect
    .element(screen.getByRole("button", { name: "Permissions: Supervised" }))
    .toBeVisible();
});
