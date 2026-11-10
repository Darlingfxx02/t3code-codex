import { page, userEvent } from "vite-plus/test/browser";
import { describe, expect, it, vi } from "vite-plus/test";

import { fakeTimers, render } from "../../../test/render";
import { Sidebar, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar } from "./sidebar";

function CollapseFromInside() {
  const { setOpen } = useSidebar();
  return (
    <button type="button" onClick={() => setOpen(false)}>
      Collapse
    </button>
  );
}

function Harness(props: { readonly onResize?: (width: number) => void }) {
  return (
    <SidebarProvider defaultOpen>
      <Sidebar
        collapsible="offcanvas"
        resizable={{
          minWidth: 200,
          maxWidth: 600,
          ...(props.onResize ? { onResize: props.onResize } : {}),
        }}
      >
        <CollapseFromInside />
        <SidebarRail />
      </Sidebar>
      <SidebarTrigger />
      <main className="h-40 flex-1">Content</main>
    </SidebarProvider>
  );
}

describe("Sidebar", () => {
  it("hands focus to the outside trigger when it collapses around the focused control", async () => {
    await page.viewport(1280, 800);
    await using screen = await render(<Harness />, { router: false /* no routes involved */ });

    await userEvent.click(screen.getByRole("button", { name: "Collapse" }));

    const sidebar = screen.container.querySelector<HTMLElement>('[data-slot="sidebar"]')!;
    await vi.waitFor(() => expect(sidebar.inert).toBe(true));
    const trigger = screen.container.querySelector('[data-slot="sidebar-trigger"]');
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("peeks the collapsed sidebar over the content while the trigger or sidebar is hovered", async () => {
    await page.viewport(1280, 800);
    await using screen = await render(<Harness />, { router: false /* no routes involved */ });
    const sidebar = screen.container.querySelector<HTMLElement>('[data-slot="sidebar"]')!;
    const container = sidebar.querySelector<HTMLElement>('[data-slot="sidebar-container"]')!;
    const trigger = screen.container.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]')!;
    const content = screen.getByRole("main");

    await userEvent.click(trigger);
    await vi.waitFor(() => expect(sidebar.inert).toBe(true));
    // The collapsing click leaves the pointer on the trigger without peeking.
    expect(container.hasAttribute("data-peek")).toBe(false);
    await userEvent.hover(content);
    using _timers = fakeTimers();

    await userEvent.hover(trigger);
    await vi.waitFor(() => expect(sidebar.inert).toBe(false));
    // Still laid out as collapsed, so the content keeps its width under the peek.
    expect(sidebar.dataset.collapsible).toBe("offcanvas");

    await userEvent.hover(container);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(sidebar.inert).toBe(false);

    await userEvent.hover(content);
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(() => expect(sidebar.inert).toBe(true));
    expect(container.hasAttribute("data-peek")).toBe(false);
  });

  it("abandons a rail drag when the sidebar collapses mid-drag", async () => {
    await page.viewport(1280, 800);
    const onResize = vi.fn();
    await using screen = await render(<Harness onResize={onResize} />, {
      router: false /* no routes involved */,
    });
    const rail = screen.container.querySelector<HTMLElement>('[data-sidebar="rail"]')!;
    const { left, top } = rail.getBoundingClientRect();
    const pointer = { bubbles: true, cancelable: true, pointerId: 1, button: 0, clientY: top + 10 };
    const dragTo = (clientX: number) => {
      rail.dispatchEvent(new PointerEvent("pointerdown", { ...pointer, clientX: left }));
      rail.dispatchEvent(new PointerEvent("pointermove", { ...pointer, clientX }));
    };
    // A completed drag commits, so the abandoned one below is a real drag too.
    dragTo(left + 40);
    const wrapper = screen.container.querySelector<HTMLElement>('[data-slot="sidebar-wrapper"]')!;
    await vi.waitFor(() =>
      expect(wrapper.style.getPropertyValue("--sidebar-width")).toMatch(/px$/u),
    );
    rail.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: left + 40 }));
    expect(onResize).toHaveBeenCalledTimes(1);

    dragTo(left + 80);
    await userEvent.click(
      screen.container.querySelector<HTMLElement>('[data-slot="sidebar-trigger"]')!,
    );
    rail.dispatchEvent(new PointerEvent("pointerup", { ...pointer, clientX: left + 80 }));

    expect(onResize).toHaveBeenCalledTimes(1);
  });
});
