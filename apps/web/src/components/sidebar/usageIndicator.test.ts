import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { collectUsageSubscriptions, recentUsageSubscriptions } from "./usageIndicator.logic";

const local = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");
const provider = (id: string, overrides: Partial<ServerProvider> = {}): ServerProvider => ({
  instanceId: ProviderInstanceId.make(id),
  driver: ProviderDriverKind.make(id),
  enabled: true,
  installed: true,
  status: "ready",
  auth: { status: "authenticated" },
  version: null,
  checkedAt: "2026-11-04T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
  ...overrides,
});
const thread = (id: string, day: number, environmentId = local) => ({
  environmentId,
  providerInstanceId: ProviderInstanceId.make(id),
  latestUserMessageAt: `2026-11-0${day}T00:00:00.000Z`,
});

describe("recentUsageSubscriptions", () => {
  it("keeps the last three used subscriptions with the most restrictive remaining allowance", () => {
    const subscriptions = collectUsageSubscriptions(
      new Map([
        [
          local,
          [
            provider("codex", {
              usageLimits: {
                checkedAt: "2026-11-04T00:00:00.000Z",
                windows: [
                  { id: "session", kind: "session", label: "5 hours", usedPercent: 34 },
                  { id: "weekly", kind: "weekly", label: "Weekly", usedPercent: 72 },
                ],
              },
            }),
            provider("claudeAgent"),
            provider("cursor"),
            provider("grok"),
            provider("unused"),
          ],
        ],
      ]),
      [thread("codex", 4), thread("claudeAgent", 3), thread("cursor", 2), thread("grok", 1)],
    );

    expect(
      recentUsageSubscriptions(subscriptions).map(({ driverKind, remainingPercent }) => [
        driverKind,
        remainingPercent,
      ]),
    ).toEqual([
      ["codex", 28],
      ["claudeAgent", null],
      ["cursor", null],
    ]);
  });

  it("scopes provider use to its environment, deduplicates accounts, and ignores unused or unavailable providers", () => {
    const subscriptions = collectUsageSubscriptions(
      new Map([
        [
          local,
          [
            provider("codex", { auth: { status: "authenticated", email: "me@example.com" } }),
            provider("loggedOut", { auth: { status: "unauthenticated" } }),
            provider("disabled", { enabled: false }),
            provider("uninstalled", { installed: false }),
            provider("unused"),
          ],
        ],
        [
          remote,
          [provider("codex", { auth: { status: "authenticated", email: "ME@example.com" } })],
        ],
      ]),
      [
        thread("codex", 1),
        thread("codex", 4, remote),
        thread("loggedOut", 4),
        thread("disabled", 4),
        thread("uninstalled", 4),
        {
          environmentId: local,
          providerInstanceId: ProviderInstanceId.make("unused"),
          latestUserMessageAt: null,
        },
      ],
    );

    expect(subscriptions).toHaveLength(2);
    expect(recentUsageSubscriptions(subscriptions)).toHaveLength(1);
    expect(recentUsageSubscriptions(subscriptions)[0]).toMatchObject({
      driverKind: "codex",
      lastUsedAt: Date.parse("2026-11-04T00:00:00.000Z"),
    });
  });
});
