import { useAtomValue } from "@effect/atom-react";

import { useQuietThreadShells } from "../../state/entities";
import { environmentPresentations } from "../../state/presentation";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { SidebarMenuButton } from "../ui/sidebar";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  collectUsageSubscriptions,
  recentUsageSubscriptions,
  type UsageSubscription,
} from "./usageIndicator.logic";

function subscriptionColor(subscription: UsageSubscription): string {
  return (
    subscription.accentColor ??
    (subscription.driverKind === "claudeAgent" ? "#d97757" : "currentColor")
  );
}

function UsageRing({ subscriptions }: { readonly subscriptions: readonly UsageSubscription[] }) {
  const count = subscriptions.length;
  const gap = count > 1 ? 8 : 0;
  const segmentLength = 100 / Math.max(count, 1) - gap;
  return (
    <svg aria-hidden="true" className="size-4.5" fill="none" viewBox="0 0 24 24">
      {count === 0 ? (
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="2 3" />
      ) : (
        subscriptions.map((subscription, index) => {
          const remaining = subscription.remainingPercent;
          const length = remaining === null ? 0 : (segmentLength * remaining) / 100;
          const offset = -((index * 100) / count + gap / 2);
          return (
            <g
              key={subscription.key}
              transform="rotate(-90 12 12)"
              stroke={subscriptionColor(subscription)}
              strokeWidth="2.5"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                pathLength="100"
                strokeDasharray={`${segmentLength} ${100 - segmentLength}`}
                strokeDashoffset={offset}
                opacity={remaining === null ? 0.45 : 0.2}
              />
              {length > 0 ? (
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  pathLength="100"
                  strokeDasharray={`${length} ${100 - length}`}
                  strokeDashoffset={offset}
                />
              ) : null}
            </g>
          );
        })
      )}
    </svg>
  );
}

export function UsageIndicatorButton({ onClick }: { readonly onClick: () => void }) {
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const threads = useQuietThreadShells();
  const subscriptions = collectUsageSubscriptions(
    new Map(
      [...presentations].map(([id, presentation]) => [
        id,
        presentation.serverConfig?.providers ?? [],
      ]),
    ),
    threads,
  );
  const recent = recentUsageSubscriptions(subscriptions);
  return (
    <Tooltip>
      <TooltipTrigger
        render={<SidebarMenuButton aria-label="Usage" onClick={onClick} size="icon" />}
      >
        <UsageRing subscriptions={subscriptions} />
      </TooltipTrigger>
      <TooltipPopup side="top">
        <div className="flex min-w-44 flex-col gap-2 py-1">
          <span className="font-medium">Usage</span>
          {recent.length > 0 ? (
            recent.map((subscription) => (
              <div key={subscription.key} className="flex items-center gap-2">
                <ProviderInstanceIcon
                  driverKind={subscription.driverKind}
                  displayName={subscription.displayName}
                  size="compact"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{subscription.displayName}</div>
                  {subscription.accountLabel ? (
                    <div className="truncate text-3xs text-muted-foreground">
                      {subscription.accountLabel}
                    </div>
                  ) : null}
                </div>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {subscription.remainingPercent === null
                    ? "No data"
                    : `${Math.round(subscription.remainingPercent)}% left`}
                </span>
              </div>
            ))
          ) : (
            <span className="text-muted-foreground">No recent subscriptions</span>
          )}
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}
