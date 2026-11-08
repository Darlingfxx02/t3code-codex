import { expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import "../../index.css";

import { render } from "../../../test/render";
import { SidebarThreadTitle } from "./SidebarThreadTitle";

it("reveals a clipped title once, holds the end, and resets when the pointer leaves", async () => {
  await using screen = await render(
    <div role="button" aria-label="Thread" data-sidebar-row style={{ width: 140 }}>
      <SidebarThreadTitle
        title="Настройка элементов левой панели и подробностей истории"
        className="block"
      />
    </div>,
    { router: false }, // exercises a standalone sidebar row
  );
  const row = screen.getByRole("button", { name: "Thread" });
  const text = row.element().querySelector("[data-sidebar-title] > span");
  if (!(text instanceof HTMLElement)) throw new Error("Missing title text");

  await userEvent.hover(row);
  await vi.waitFor(() => expect(text.getAnimations()).toHaveLength(1));
  const animation = text.getAnimations()[0]!;
  expect(animation.effect?.getTiming()).toMatchObject({ iterations: 1, fill: "forwards" });
  animation.finish();
  await vi.waitFor(() => expect(animation.playState).toBe("finished"));
  expect(new DOMMatrixReadOnly(getComputedStyle(text).transform).m41).toBeLessThan(0);
  expect(text.getAnimations()[0]).toBe(animation);

  await userEvent.unhover(row);
  expect(text.getAnimations()).toHaveLength(0);
  expect(text.parentElement?.hasAttribute("data-revealing")).toBe(false);
  await userEvent.hover(row);
  await vi.waitFor(() => expect(text.getAnimations()).toHaveLength(1));
  expect(text.getAnimations()[0]).not.toBe(animation);
});

it("keeps fitting titles still and reveals RTL text immediately with reduced motion", async () => {
  const matchMedia = window.matchMedia.bind(window);
  using _motion = vi.spyOn(window, "matchMedia").mockImplementation((query) => {
    const result = matchMedia(query);
    if (query === "(prefers-reduced-motion: reduce)") {
      Object.defineProperty(result, "matches", { value: true });
    }
    return result;
  });
  await using screen = await render(
    <>
      <div role="button" aria-label="Short" data-sidebar-row style={{ width: 140 }}>
        <SidebarThreadTitle title="Коротко" className="block" />
      </div>
      <div role="button" aria-label="RTL" data-sidebar-row style={{ width: 140 }}>
        <SidebarThreadTitle
          title="هذا عنوان طويل لعرض النص الكامل في سجل المحادثة"
          className="block"
        />
      </div>
    </>,
    { router: false }, // exercises standalone sidebar rows
  );
  const short = screen.getByRole("button", { name: "Short" });
  await userEvent.hover(short);
  expect(short.element().getAnimations({ subtree: true })).toHaveLength(0);
  const rtl = screen.getByRole("button", { name: "RTL" });
  await userEvent.hover(rtl);
  const text = rtl.element().querySelector("[data-sidebar-title] > span");
  if (!(text instanceof HTMLElement)) throw new Error("Missing RTL text");
  await vi.waitFor(() => expect(text.getAnimations()).toHaveLength(1));
  const animation = text.getAnimations()[0]!;
  expect(animation.effect?.getTiming()).toMatchObject({ duration: 0, delay: 0 });
  await vi.waitFor(() => expect(animation.playState).toBe("finished"));
  expect(new DOMMatrixReadOnly(getComputedStyle(text).transform).m41).toBeGreaterThan(0);
});
