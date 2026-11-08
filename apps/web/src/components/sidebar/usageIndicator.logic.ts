import type { EnvironmentId, ServerProvider } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  normalizeProviderAccentColor,
  resolveProviderInstanceDisplayName,
} from "@t3tools/client-runtime/state/provider-instance-display";

export interface UsageSubscription {
  readonly key: string;
  readonly driverKind: ServerProvider["driver"];
  readonly displayName: string;
  readonly accountLabel: string | undefined;
  readonly accentColor: string | undefined;
  readonly remainingPercent: number | null;
  readonly lastUsedAt: number | null;
}

type UsageThread = Pick<
  EnvironmentThreadShell,
  "environmentId" | "providerInstanceId" | "latestUserMessageAt" | "latestUserAuthoredMessageAt"
>;

export function collectUsageSubscriptions(
  providersByEnvironment: ReadonlyMap<EnvironmentId, readonly ServerProvider[]>,
  threads: readonly UsageThread[],
): readonly UsageSubscription[] {
  const latestUseByProvider = new Map<string, number>();
  for (const thread of threads) {
    const timestamp = Date.parse(
      thread.latestUserAuthoredMessageAt ?? thread.latestUserMessageAt ?? "",
    );
    if (!Number.isFinite(timestamp)) continue;
    const key = `${thread.environmentId}:${thread.providerInstanceId}`;
    latestUseByProvider.set(key, Math.max(timestamp, latestUseByProvider.get(key) ?? 0));
  }

  const subscriptions = new Map<string, UsageSubscription>();
  for (const [environmentId, providers] of providersByEnvironment) {
    for (const provider of providers) {
      const instanceKey = `${environmentId}:${provider.instanceId}`;
      const lastUsedAt = latestUseByProvider.get(instanceKey) ?? null;
      if (
        !provider.enabled ||
        !provider.installed ||
        provider.auth.status !== "authenticated" ||
        provider.availability === "unavailable"
      ) {
        continue;
      }
      const email = provider.auth.email?.trim().toLowerCase();
      const identity = email || provider.usageLimits?.credentialFingerprint;
      const key = identity
        ? `${provider.driver}:${identity}:${provider.auth.workspaceId ?? ""}`
        : instanceKey;
      const previous = subscriptions.get(key);
      if (previous && (previous.lastUsedAt ?? 0) >= (lastUsedAt ?? 0)) continue;
      const windows = provider.usageLimits?.windows ?? [];
      subscriptions.set(key, {
        key,
        driverKind: provider.driver,
        displayName: resolveProviderInstanceDisplayName(provider),
        accountLabel: provider.auth.email,
        accentColor: normalizeProviderAccentColor(provider.accentColor),
        remainingPercent:
          windows.length === 0
            ? null
            : 100 - Math.max(...windows.map((window) => window.usedPercent)),
        lastUsedAt,
      });
    }
  }
  return [...subscriptions.values()];
}

export function recentUsageSubscriptions(
  subscriptions: readonly UsageSubscription[],
): readonly UsageSubscription[] {
  return subscriptions
    .filter((subscription) => subscription.lastUsedAt !== null)
    .toSorted((left, right) => right.lastUsedAt! - left.lastUsedAt!)
    .slice(0, 3);
}
