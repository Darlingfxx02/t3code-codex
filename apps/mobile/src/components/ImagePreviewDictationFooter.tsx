import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View } from "react-native";

import {
  composerDraftsAtom,
  getComposerDraftSnapshot,
  rememberComposerDraftSelection,
  setComposerDraftText,
  useComposerDraft,
} from "../state/use-composer-drafts";
import { appAtomRegistry } from "../state/atom-registry";
import {
  ComposerDictationCancelAction,
  ComposerDictationError,
  ComposerDictationPrimaryAction,
  ComposerDictationStatus,
} from "../features/voice-input/ComposerDictationControl";
import { useVoiceInputController } from "../features/voice-input/useVoiceInputController";
import { resolveVoiceComposerPresentation } from "../features/voice-input/voiceInputPresentation";
import { AppText as Text } from "./ui/AppText";

/** A compact, always reachable dictation control layered over an open image. */
export function ImagePreviewDictationFooter(props: {
  readonly draftKey: string;
  readonly label?: string;
}) {
  const insets = useSafeAreaInsets();
  const draft = useComposerDraft(props.draftKey);
  const voiceInput = useVoiceInputController({
    ownerKey: `image-preview:${props.draftKey}`,
    label: props.label ?? "Image preview",
    cancelOnUnmount: true,
    readDraftMessage: () => getComposerDraftSnapshot(props.draftKey).text,
    subscribeToDraftChanges: (onChange) => appAtomRegistry.subscribe(composerDraftsAtom, onChange),
    selection: { start: draft.text.length, end: draft.text.length },
    onChangeDraftMessage: (text) => setComposerDraftText(props.draftKey, text),
    onChangeSelection: (selection) =>
      rememberComposerDraftSelection(
        props.draftKey,
        getComposerDraftSnapshot(props.draftKey).text,
        selection,
      ),
  });
  const presentation = resolveVoiceComposerPresentation(
    voiceInput.state,
    voiceInput.elapsedSeconds,
  );
  const recording = presentation.statusKind === "active";

  return (
    <View
      className="items-center"
      pointerEvents="box-none"
      style={{ paddingBottom: Math.max(insets.bottom, 8) + 8 }}
    >
      {voiceInput.state.error ? (
        <View className="mb-2 w-[min(92%,420px)] rounded-xl bg-black/80">
          <ComposerDictationError error={voiceInput.state.error} onDismiss={voiceInput.cancel} />
        </View>
      ) : null}
      <View className="mx-4 min-h-12 max-w-[min(92%,420px)] flex-row items-center rounded-full bg-black/75 px-1 shadow-lg">
        {recording ? (
          <ComposerDictationCancelAction presentation={presentation} onCancel={voiceInput.cancel} />
        ) : null}
        {recording ? (
          <ComposerDictationStatus
            audioLevels={voiceInput.audioLevels}
            elapsedSeconds={voiceInput.elapsedSeconds}
            phase={voiceInput.state.phase}
            presentation={presentation}
          />
        ) : (
          <Text className="min-w-0 flex-1 px-3 text-sm text-white/90" numberOfLines={1}>
            Dictate about this image
          </Text>
        )}
        <ComposerDictationPrimaryAction
          state={voiceInput.state}
          presentation={presentation}
          isAvailable={voiceInput.isAvailable}
          onStart={voiceInput.start}
          onConfirm={voiceInput.stop}
          onCancel={voiceInput.cancel}
        />
      </View>
    </View>
  );
}
