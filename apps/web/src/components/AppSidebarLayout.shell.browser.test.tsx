import { expect, it, vi } from "vite-plus/test";

import { render } from "../../test/render";
import { AppSidebarLayout } from "./AppSidebarLayout";

vi.mock("../hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));

it("composes the Settings shell with its persistent rail", async () => {
  await using screen = await render(
    <AppSidebarLayout>
      <main aria-label="Settings content">Settings content</main>
    </AppSidebarLayout>,
    { router: "/" },
  );
  await screen.router!.navigate({ href: "/settings/general" });
  await vi.waitFor(() => expect(screen.router!.state.location.pathname).toBe("/settings/general"));

  await expect.element(screen.getByLabelText("Workspace navigation")).toBeInTheDocument();
  await expect
    .element(screen.getByRole("navigation", { name: "Settings sections" }))
    .toBeInTheDocument();
  await expect.element(screen.getByRole("main", { name: "Settings content" })).toBeInTheDocument();
});

it("composes Automations as the workspace surface without the thread sidebar", async () => {
  await using screen = await render(
    <AppSidebarLayout>
      <main aria-label="Automations">Automations content</main>
    </AppSidebarLayout>,
    { router: "/automations" },
  );

  await expect.element(screen.getByLabelText("Workspace navigation")).toBeInTheDocument();
  await expect.element(screen.getByRole("main", { name: "Automations" })).toBeInTheDocument();
  await expect.element(screen.getByLabelText("Threads")).not.toBeInTheDocument();
});

it("composes Design as a workspace surface without the thread sidebar", async () => {
  await using screen = await render(
    <AppSidebarLayout>
      <main aria-label="Design">Design content</main>
    </AppSidebarLayout>,
    { router: "/design" },
  );

  await expect.element(screen.getByLabelText("Workspace navigation")).toBeInTheDocument();
  await expect.element(screen.getByRole("main", { name: "Design" })).toBeInTheDocument();
  await expect.element(screen.getByLabelText("Threads")).not.toBeInTheDocument();
});

it("keeps the workspace rail while switching between shell sections", async () => {
  await using screen = await render(
    <AppSidebarLayout>
      <main aria-label="Workspace content">Workspace content</main>
    </AppSidebarLayout>,
    { router: "/" },
  );

  const rail = screen.getByRole("complementary", { name: "Workspace navigation" });
  await rail.getByRole("link", { name: "Settings" }).click();
  await vi.waitFor(() => expect(screen.router!.state.location.pathname).toBe("/settings"));
  await expect.element(screen.getByLabelText("Workspace navigation")).toBeInTheDocument();

  await rail.getByRole("link", { name: "Automations" }).click();
  await vi.waitFor(() => expect(screen.router!.state.location.pathname).toBe("/automations"));
  await expect.element(screen.getByLabelText("Workspace navigation")).toBeInTheDocument();

  await rail.getByRole("link", { name: "Tasks", exact: true }).click();
  await vi.waitFor(() => expect(screen.router!.state.location.pathname).toBe("/tasks"));
  await expect.element(screen.getByLabelText("Workspace navigation")).toBeInTheDocument();
  await expect.element(screen.getByLabelText("Threads")).not.toBeInTheDocument();
  await expect
    .element(rail.getByRole("button", { name: "Usage", exact: true }))
    .toBeInTheDocument();
  await expect
    .element(rail.getByRole("link", { name: "Settings", exact: true }))
    .toBeInTheDocument();
});
