import { createFileRoute } from "@tanstack/react-router";

import { AutomationsWorkspace } from "../components/AutomationsWorkspace";
import { validateScheduledTasksSearch } from "../components/settings/scheduledTasksSettings.logic";

function AutomationsRoute() {
  return <AutomationsWorkspace target={Route.useSearch()} />;
}

export const Route = createFileRoute("/_chat/automations")({
  validateSearch: validateScheduledTasksSearch,
  component: AutomationsRoute,
});
