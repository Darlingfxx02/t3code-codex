import { DeviceHostUpdates } from "./DeviceHostUpdates";
import type { DevicePlatform, DeviceServiceState, EnvironmentId } from "@t3tools/contracts";
import {
  BatteryMedium,
  Bot,
  Check,
  Monitor,
  ShieldCheck,
  SignalHigh,
  Smartphone,
  Sparkles,
  Wifi,
} from "lucide-react";
import { Check as CheckGlyph, CircleAlert } from "lucide";
import { AuthSettingsWriteScope } from "@t3tools/contracts";
import { useAtomMount } from "@effect/atom-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { DialogClose, DialogTitle } from "~/components/ui/dialog";
import { MorphIcon } from "~/components/MorphIcon";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { deviceEnvironment, deviceHostProbeAtom, NO_DEVICE_PROBE_ATOM } from "~/state/device";
import { useAtomCommand } from "~/state/use-atom-command";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";
import { cn } from "~/lib/utils";

const platformName = (platform: DevicePlatform) => (platform === "ios" ? "iOS" : "Android");

const agentDeviceDescription = "Let agents start and control the same device for you.";

const deviceSetupMeshGradient = [
  "radial-gradient(circle at 18% 78%, #1d4ed8 0%, transparent 48%)",
  "radial-gradient(circle at 80% 14%, #7c3aed 0%, transparent 46%)",
  "radial-gradient(circle at 56% 52%, #2563eb 0%, transparent 44%)",
  "linear-gradient(125deg, #0b1224 0%, #142b68 42%, #343b9c 74%, #8b5cf6 130%)",
].join(", ");

export const isAndroidDiscoveryUncertain = (state: DeviceServiceState) =>
  Object.values(state.hostStatuses).some(
    (status) => status.status === "ready" && status.androidDiscoveryIncomplete,
  );

/**
 * `hostStatus` only tracks this machine. A machine without simulator tooling never
 * starts its own hub, so setup and the panel must also count remote device hosts.
 */
export function deviceHubReadiness(state: DeviceServiceState) {
  const statuses = Object.values(state.hostStatuses).map((host) => host.status);
  const ready = state.hostStatus === "ready" || statuses.includes("ready");
  const busy =
    !ready &&
    [state.hostStatus, ...statuses].some(
      (status) => status === "installing" || status === "starting",
    );
  return { ready, busy };
}

/** A ready host keeps its devices usable but may still carry a discovery warning. */
function deviceHostDiagnostics(
  hosts: ReadonlyArray<Pick<DeviceServiceState["hosts"][number], "id" | "label">>,
  hostStatuses: DeviceServiceState["hostStatuses"],
) {
  return hosts.flatMap((host) => {
    const status = hostStatuses[host.id];
    return status?.status === "ready" && status.detail
      ? [{ hostId: host.id, label: host.label, detail: status.detail }]
      : [];
  });
}

function DeviceHostDiagnostics(props: {
  readonly hosts: ReadonlyArray<Pick<DeviceServiceState["hosts"][number], "id" | "label">>;
  readonly hostStatuses: DeviceServiceState["hostStatuses"];
  readonly className?: string;
}) {
  const diagnostics = deviceHostDiagnostics(props.hosts, props.hostStatuses);
  if (diagnostics.length === 0) return null;
  return (
    <div role="status" className={cn("space-y-1 text-xs text-muted-foreground", props.className)}>
      {diagnostics.map(({ hostId, label, detail }) => (
        <p key={hostId} className="whitespace-pre-line break-words">
          {label}: {detail}
        </p>
      ))}
    </div>
  );
}

export function platformSetupStatus(state: DeviceServiceState, platform: DevicePlatform) {
  const hasDevices = state.devices.some((device) => device.platform === platform);
  if (platform === "android" && !hasDevices && isAndroidDiscoveryUncertain(state)) {
    return {
      ready: false,
      message: "The Android device list may be incomplete. Check the device host and try again.",
    };
  }
  const availabilities = state.hosts.flatMap((host) =>
    host.platforms
      .filter((candidate) => candidate.platform === platform)
      .map((candidate) => ({ ...candidate, host })),
  );
  const supportingHosts = availabilities
    .filter((candidate) => candidate.available)
    .map((candidate) => candidate.host);
  if (supportingHosts.length === 0) {
    return {
      ready: false,
      message: availabilities[0]?.reason ?? `${platformName(platform)} support was not detected.`,
    };
  }
  const readyHosts = supportingHosts.filter(
    (host) =>
      state.hostStatuses[host.id]?.status === "ready" ||
      (host.kind === "local" && state.hostStatus === "ready"),
  );
  if (readyHosts.length > 0 && !hasDevices) {
    return {
      ready: false,
      message:
        platform === "ios"
          ? "Xcode is installed, but no iOS Simulator is available. Install a runtime in Xcode Settings → Components."
          : "The Android SDK is installed, but no virtual device exists. Create one in Android Studio → Device Manager.",
    };
  }
  const remoteHost = supportingHosts.every((host) => host.kind !== "local")
    ? supportingHosts[0]
    : undefined;
  const location = remoteHost ? ` on ${remoteHost.label}` : "";
  return {
    ready: true,
    message:
      remoteHost?.kind === "eas"
        ? `${remoteHost.label} starts ${platform === "ios" ? "iOS Simulators" : "Android emulators"} in the cloud with EAS Simulator.`
        : platform === "ios"
          ? `Xcode and iOS Simulator are available${location}.`
          : `The Android SDK and Emulator are available${location}.`,
  };
}

export function DeviceSetup(props: {
  readonly environmentId: EnvironmentId;
  readonly state: DeviceServiceState;
  readonly onComplete?: () => void;
  readonly onDismiss?: () => void;
  readonly presentation?: "dialog" | "panel";
}) {
  const canConfigure = useEnvironmentScope(props.environmentId, AuthSettingsWriteScope);
  const configure = useAtomCommand(deviceEnvironment.configure);
  const list = useAtomCommand(deviceEnvironment.list, { reportFailure: false });
  const [pending, setPending] = useState<"hub" | "check" | "agent" | "complete" | null>(null);
  const [step, setStep] = useState(0);
  const enabled = props.state.hostStatus !== "disabled";
  const { ready, busy } = deviceHubReadiness(props.state);
  const isPanel = props.presentation === "panel";

  useAtomMount(enabled ? deviceHostProbeAtom(props.environmentId) : NO_DEVICE_PROBE_ATOM);

  const update = async (
    kind: NonNullable<typeof pending>,
    input: { enabled?: boolean; agentAccessEnabled?: boolean; onboardingCompleted?: boolean },
  ) => {
    if (!readEnvironmentScope(props.environmentId, AuthSettingsWriteScope)) return;
    setPending(kind);
    const result = await configure({ environmentId: props.environmentId, input });
    setPending(null);
    if (kind === "complete" && result._tag === "Success") props.onComplete?.();
  };

  const checkPlatforms = () => {
    setPending("check");
    void list({ environmentId: props.environmentId, input: {} }).finally(() => setPending(null));
  };

  const stepTitle = ["Connect your devices", "Check your setup", "Give your agent access"][step];
  const stepDescription = [
    "Run and inspect mobile work without leaving the conversation.",
    "Make sure the simulator or emulator is ready to use.",
    "Keep manual control, or let agents drive the device too.",
  ][step];

  return (
    <div
      className={cn(
        "relative isolate flex min-h-[min(54rem,calc(100dvh-2rem))] flex-col overflow-x-hidden scrollbar-gutter-both text-white",
        isPanel ? "h-full min-h-0 overflow-y-auto" : "overflow-hidden",
      )}
      style={{ backgroundImage: deviceSetupMeshGradient }}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-black/10" aria-hidden />

      <div className="relative z-10 px-6 pb-2 pt-4">
        <DeviceHostUpdates state={props.state} environmentId={props.environmentId} />
      </div>

      <main className="relative flex min-h-0 flex-1 flex-col">
        <div className="relative z-20 px-6 pt-3 text-center">
          <div className="space-y-2">
            {isPanel ? (
              <h2 className="font-semibold text-xl leading-tight tracking-tight sm:text-2xl">
                {stepTitle}
              </h2>
            ) : (
              <DialogTitle>{stepTitle}</DialogTitle>
            )}
            <p className="mx-auto max-w-sm text-sm leading-6 text-white/70">{stepDescription}</p>
          </div>
        </div>

        <DeviceSetupIllustration step={step} compact={isPanel} />

        <div className="relative z-20 mx-auto -mt-24 flex w-full max-w-2xl flex-1 flex-col px-6 pb-6">
          <div
            className="pointer-events-none absolute -inset-x-8 -top-44 bottom-0 -z-10"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, rgb(12 30 77 / 10%) 18%, rgb(9 18 54 / 78%) 52%, rgb(7 12 36 / 97%) 82%, rgb(7 12 36 / 100%) 100%)",
            }}
            aria-hidden
          />

          <div className="flex justify-center gap-1.5 py-5" aria-label="Setup progress">
            {[0, 1, 2].map((index) => (
              <span
                key={index}
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color]",
                  index === step ? "w-6 bg-white" : "w-1.5 bg-white/35",
                )}
                aria-hidden
              />
            ))}
          </div>

          <div className="space-y-3">
            {step === 0 ? (
              <section className="space-y-4" aria-labelledby="device-hub-title">
                <div className="flex items-center gap-3 rounded-3xl border border-white/15 bg-black/35 px-4 py-3.5 shadow-xl shadow-black/15 backdrop-blur-md">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 text-white">
                    <Monitor className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-3xs font-medium text-white/50">Device hub</span>
                      <span className="rounded-full border border-white/15 bg-white/8 px-2 py-0.5 text-3xs font-medium text-white/65">
                        iOS + Android
                      </span>
                    </div>
                    <h3 id="device-hub-title" className="mt-1 font-semibold text-white">
                      Use devices in your thread
                    </h3>
                    <p className="mt-0.5 text-xs leading-5 text-white/60">
                      Open a simulator beside your conversation.
                    </p>
                  </div>
                  {enabled ? (
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-success/15 text-success">
                      <Check className="size-4" aria-hidden />
                    </span>
                  ) : null}
                </div>
                <DeviceHubSetupStatus
                  state={props.state}
                  pending={pending === "hub" || (busy && pending !== "agent")}
                />
                {props.state.hostStatus === "failed" && props.state.hostStatusDetail ? (
                  <p role="alert" className="text-xs leading-5 text-destructive">
                    {props.state.hostStatusDetail}
                  </p>
                ) : null}
              </section>
            ) : null}

            {step === 1 ? (
              <section className="space-y-3" aria-labelledby="platforms-title">
                <div className="flex items-center justify-between gap-3">
                  <h3 id="platforms-title" className="font-medium text-white">
                    Available platforms
                  </h3>
                  <Button
                    size="compact"
                    variant="overlay"
                    disabled={!enabled || busy || pending !== null}
                    onClick={checkPlatforms}
                  >
                    {pending === "check" ? <Spinner size="xs" /> : null}
                    {pending === "check" ? "Checking…" : "Refresh"}
                  </Button>
                </div>
                <div className="rounded-2xl border border-white/15 bg-black/30 p-4 shadow-lg shadow-black/10 backdrop-blur-md [&_p.text-muted-foreground]:text-white/70">
                  <DevicePlatformSetup state={props.state} />
                </div>
              </section>
            ) : null}

            {step === 2 ? (
              <section className="space-y-4" aria-labelledby="agent-access-title">
                <div className="flex items-start gap-3 rounded-2xl border border-white/15 bg-black/30 p-4 shadow-lg shadow-black/10 backdrop-blur-md">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15 text-white">
                    <Bot className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <h3 id="agent-access-title" className="font-medium text-white">
                      Let agents use the device
                    </h3>
                    <p className="text-sm leading-5 text-white/70">{agentDeviceDescription}</p>
                  </div>
                  <Switch
                    checked={props.state.agentAccessEnabled}
                    disabled={!canConfigure || !enabled || busy || pending !== null}
                    aria-label="Allow agents to control devices"
                    onCheckedChange={(checked) =>
                      void update("agent", { agentAccessEnabled: Boolean(checked) })
                    }
                  />
                </div>
                <AgentDeviceSetupStatus state={props.state} pending={pending === "agent"} />
                <p className="text-xs leading-5 text-white/65">
                  You can leave this off and still open, inspect, and tap devices yourself.
                </p>
              </section>
            ) : null}
          </div>

          <div
            className={cn(
              "flex flex-col gap-2 pt-6",
              !isPanel && "sm:flex-row sm:items-center sm:justify-center",
            )}
          >
            {step > 0 ? (
              <Button
                size="lg"
                variant="overlay"
                className="w-full sm:w-auto"
                disabled={busy || pending !== null}
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            ) : null}
            {step === 0 && !enabled ? (
              <Button
                size="lg"
                className="w-full max-w-xs self-center"
                disabled={!canConfigure || busy || pending !== null}
                onClick={() => void update("hub", { enabled: true })}
              >
                {pending === "hub" ? <Spinner size="sm" /> : <Sparkles className="size-4" />}
                {pending === "hub" ? "Preparing devices…" : "Enable devices"}
              </Button>
            ) : step < 2 ? (
              <Button
                size="lg"
                className="w-full max-w-xs self-center"
                disabled={!ready || pending !== null}
                onClick={() => setStep(step + 1)}
              >
                Continue
              </Button>
            ) : (
              <Button
                size="lg"
                className="w-full max-w-xs self-center"
                disabled={!canConfigure || !ready || pending !== null}
                onClick={() => void update("complete", { onboardingCompleted: true })}
              >
                {pending === "complete" ? (
                  <Spinner size="sm" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                {pending === "complete" ? "Saving…" : "Finish setup"}
              </Button>
            )}
            {props.onDismiss ? (
              <Button
                variant="overlay"
                size="lg"
                className="w-full max-w-xs self-center"
                onClick={props.onDismiss}
              >
                Not now
              </Button>
            ) : (
              <DialogClose
                render={
                  <Button variant="overlay" size="lg" className="w-full max-w-xs self-center" />
                }
              >
                Not now
              </DialogClose>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function DeviceSetupIllustration({
  step,
  compact,
}: {
  readonly step: number;
  readonly compact?: boolean;
}) {
  return (
    <div
      className="relative flex h-80 w-full shrink-0 items-start justify-center overflow-hidden px-6 pt-3 sm:h-96 sm:pt-4"
      style={compact ? { height: "clamp(13rem, 38dvh, 24rem)" } : undefined}
      aria-label="Preview of the mobile device controls"
    >
      <DeviceSetupPhoneMockup step={step} className="w-64 sm:w-72" />
    </div>
  );
}

function DeviceSetupPhoneMockup({
  step,
  className,
}: {
  readonly step: number;
  readonly className?: string;
}) {
  return (
    <div className={cn("relative drop-shadow-2xl", className)} aria-hidden>
      <div
        className="absolute overflow-hidden bg-background text-foreground shadow-inner"
        style={{ inset: "5.2% 5.4% 5.6%", borderRadius: "10.5%" }}
      >
        <div className="flex h-full flex-col px-2 pb-2 pt-1 text-5xs leading-tight sm:px-2.5 sm:pb-2.5 sm:pt-1.5 sm:text-4xs">
          <div className="flex items-center justify-between text-5xs font-medium text-muted-foreground sm:text-4xs">
            <span>9:41</span>
            <span className="flex items-center gap-0.5" aria-hidden>
              <SignalHigh className="size-2.5 sm:size-3" strokeWidth={2.2} />
              <Wifi className="size-2.5 sm:size-3" strokeWidth={2.2} />
              <BatteryMedium className="size-3 sm:size-3.5" strokeWidth={2.2} />
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <p className="font-semibold text-primary">T3 Code</p>
              <p className="mt-0.5 text-2xs font-bold tracking-tight">Device setup</p>
            </div>
            <span className="grid size-5 place-items-center rounded-full bg-primary/15 text-primary">
              <Smartphone className="size-3" aria-hidden />
            </span>
          </div>
          <div className="mt-2 rounded-xl bg-primary p-2 text-primary-foreground shadow-lg shadow-primary/25">
            <div className="flex items-center justify-between">
              <span className="font-semibold">
                {step === 1 ? "Ready to check" : "Bring a device"}
              </span>
              <span className="rounded-full bg-primary-foreground/20 px-1.5 py-0.5 text-5xs">
                Live
              </span>
            </div>
            <p className="mt-1.5 text-5xs text-primary-foreground/80">
              Open a simulator beside your conversation.
            </p>
            <div className="mt-1.5 rounded-md bg-primary-foreground px-2 py-1 text-center text-5xs font-semibold text-primary shadow-sm">
              Open device
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="grid size-4 place-items-center rounded bg-muted text-muted-foreground">
                  <Monitor className="size-2.5" aria-hidden />
                </span>
                <span className="font-semibold">iOS Simulator</span>
              </div>
              <span className="size-1.5 rounded-full bg-success" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-card px-2 py-1.5 shadow-sm">
              <div className="flex items-center gap-1.5">
                <span className="grid size-4 place-items-center rounded bg-muted text-muted-foreground">
                  <Monitor className="size-2.5" aria-hidden />
                </span>
                <span className="font-semibold">Android Emulator</span>
              </div>
              <span className="size-1.5 rounded-full bg-warning" />
            </div>
          </div>
          <div className="mt-auto rounded-lg bg-foreground px-2 py-1.5 text-background">
            <div className="flex items-center gap-1.5">
              <Bot className="size-3 text-primary" aria-hidden />
              <span className="font-semibold">
                {step === 2 ? "Agent access on" : "Agent access"}
              </span>
            </div>
            <p className="mt-1 text-5xs text-background/70">Control together when you need it.</p>
          </div>
        </div>
      </div>
      <img
        src="/device-setup/iphone-17-pro-silver.png"
        alt=""
        className="relative z-10 block h-auto w-full"
        draggable={false}
      />
    </div>
  );
}

export function DeviceHubSetupStatus({
  state,
  pending,
  compact = false,
}: {
  readonly state: DeviceServiceState;
  readonly pending: boolean;
  readonly compact?: boolean;
}) {
  if (!pending && !deviceHubReadiness(state).ready) return null;
  return (
    <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      {pending ? <Spinner size="xs" /> : <Check className="size-3 text-success" />}
      {pending
        ? state.hostStatus === "installing"
          ? compact
            ? "Installing…"
            : "Installing device hub…"
          : state.hostStatus === "starting"
            ? compact
              ? "Starting…"
              : "Starting device hub…"
            : compact
              ? "Updating…"
              : "Updating device hub…"
        : "Device hub is ready."}
    </p>
  );
}

function DevicePlatformSetup(props: { readonly state: DeviceServiceState }) {
  return (
    <div className="space-y-3">
      <PlatformStatus platform="iOS" status={platformSetupStatus(props.state, "ios")} />
      <PlatformStatus platform="Android" status={platformSetupStatus(props.state, "android")} />
      <DeviceHostDiagnostics hosts={props.state.hosts} hostStatuses={props.state.hostStatuses} />
      <p className="text-xs text-muted-foreground">
        You can use either platform. Fixing a missing platform does not block the other one.
      </p>
    </div>
  );
}

export function AgentDeviceSetupStatus(props: {
  readonly state: DeviceServiceState;
  readonly pending: boolean;
  readonly compact?: boolean;
}) {
  if (props.pending) {
    const label =
      props.state.hostStatus === "installing"
        ? props.compact
          ? "Installing…"
          : "Installing agent tools…"
        : props.state.hostStatus === "starting"
          ? props.compact
            ? "Starting…"
            : "Starting agent tools…"
          : props.compact
            ? "Updating…"
            : "Updating agent access…";
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner size="xs" />
        {label}
      </p>
    );
  }
  if (
    props.state.agentAccessEnabled &&
    deviceHubReadiness(props.state).ready &&
    props.state.hosts.some((host) => host.agentDeviceInstalled)
  ) {
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="size-3 text-success" />
        Agent tools are ready.
      </p>
    );
  }
  return null;
}

function PlatformStatus(props: {
  readonly platform: string;
  readonly status: { readonly ready: boolean; readonly message: string };
  readonly compact?: boolean;
}) {
  return (
    <div
      className={cn("flex gap-2", !props.compact && "rounded-md border border-border/60 px-3 py-2")}
    >
      <MorphIcon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          props.status.ready ? "text-success" : "text-muted-foreground",
        )}
        icon={props.status.ready ? CheckGlyph : CircleAlert}
      />
      <div className={cn(props.compact && props.status.ready && "flex items-center gap-2")}>
        <p className="font-medium">{props.platform}</p>
        <p className="text-xs text-muted-foreground">
          {props.compact && props.status.ready ? "Ready" : props.status.message}
        </p>
      </div>
    </div>
  );
}
