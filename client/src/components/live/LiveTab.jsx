import { useMemo, useState } from "react";
import { useSocket } from "../../context/SocketContext";
import { useI18n } from "../../i18n/I18nContext";
import { setSpeakerAlias } from "../../utils/api";
import { SOURCE_LABELS_FULL, LANG_LABELS_FULL, CONTEXT_PRESETS } from "../../utils/constants";
import { PromptDialog } from "../Modal";
import SpeakerList from "../history/SpeakerList";
import Controls from "./Controls";
import Transcript from "./Transcript";

const lbl = "text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-wider font-medium whitespace-nowrap";
const val = "text-xs text-gray-700 dark:text-gray-300";

export default function LiveTab() {
  const { state, dispatch } = useSocket();
  const { t } = useI18n();
  const { selectedSessionData, selectedSessionId, utterances, speakerColorMap, isListening } = state;
  const [speakerModal, setSpeakerModal] = useState(null);

  const sessionInfo = useMemo(() => {
    if (!selectedSessionData || isListening) return null;
    const d = selectedSessionData;
    const startDate = new Date(d.started_at + "Z");
    const endDate = d.ended_at ? new Date(d.ended_at + "Z") : null;
    let duration = t("inProgress");
    if (endDate) {
      const diffMs = endDate - startDate;
      const mins = Math.floor(diffMs / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }
    const dateStr = startDate.toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
    const utts = d.utterances || [];
    const speakers = [...new Set(utts.map((u) => u.speaker).filter(Boolean))];
    const contextPreset = d.context
      ? CONTEXT_PRESETS.find((p) => p.value !== "custom" && p.text === d.context)
      : null;
    const contextLabel = contextPreset
      ? t(contextPreset.labelKey)
      : d.context
        ? d.context.length > 50 ? d.context.slice(0, 50) + "…" : d.context
        : null;

    // Handle "both" sources with potentially different targets: "vi,en"
    const targetStr = d.target_language?.includes(",")
      ? d.target_language.split(",").map((l) => LANG_LABELS_FULL[l] || l).join(" / ")
      : (LANG_LABELS_FULL[d.target_language] || d.target_language);
    const sourceStr = SOURCE_LABELS_FULL[d.audio_source] || d.audio_source;

    return { dateStr, duration, sourceStr, targetStr, contextLabel, uttCount: utts.length, speakers, aliases: d.speakerAliases || {} };
  }, [selectedSessionData, isListening, t]);

  return (
    <>
      <Controls />
      {sessionInfo && (
        <div className="bg-white/60 dark:bg-white/3 backdrop-blur-md border border-gray-200/50 dark:border-indigo-500/10 rounded-2xl mt-2 px-4 py-3">

          {/* Metadata grid */}
          <div className="grid gap-x-4 gap-y-1.5" style={{ gridTemplateColumns: "auto 1fr" }}>
            <span className={lbl}>{t("started")}</span>
            <span className={val}>{sessionInfo.dateStr} <span className="text-gray-400 dark:text-gray-600 mx-1">·</span> {sessionInfo.duration}</span>

            <span className={lbl}>{t("source")}</span>
            <span className={val}>{sessionInfo.sourceStr} <span className="text-gray-400 dark:text-gray-600 mx-0.5">→</span> {sessionInfo.targetStr}</span>

            {sessionInfo.contextLabel && <>
              <span className={lbl}>{t("context")}</span>
              <span className={val}>{sessionInfo.contextLabel}</span>
            </>}

            <span className={lbl}>{t("utterances")}</span>
            <span className={val}>
              {sessionInfo.uttCount}
              {sessionInfo.speakers.length > 0 &&
                <span className="text-gray-400 dark:text-gray-600"> · {sessionInfo.speakers.length} {t("speakers")}</span>}
            </span>
          </div>

          {/* Speakers — horizontal */}
          {sessionInfo.speakers.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5 pt-2.5 border-t border-gray-100/60 dark:border-indigo-500/10">
              <SpeakerList
                speakers={sessionInfo.speakers}
                aliases={sessionInfo.aliases}
                speakerColorMap={speakerColorMap}
                onRenameSpeaker={(speaker, currentName) => setSpeakerModal({ speaker, currentName })}
              />
            </div>
          )}
        </div>
      )}
      <Transcript 
        utterances={utterances} 
        speakerColorMap={speakerColorMap} 
        speakerAliases={{ ...(selectedSessionData?.speakerAliases || {}), ...(state.liveSpeakerAliases || {}) }} 
        partialResults={state.partialResults}
        onRenameSpeaker={(speaker, currentName) => setSpeakerModal({ speaker, currentName })}
      />

      <PromptDialog
        open={!!speakerModal}
        title={t("renameSpeaker", { name: speakerModal?.currentName || "" })}
        defaultValue={speakerModal?.currentName || ""}
        onCancel={() => setSpeakerModal(null)}
        onConfirm={async (newName) => {
          const { speaker, currentName } = speakerModal;
          setSpeakerModal(null);
          if (newName !== currentName) {
            const targetId = state.currentSessionId || selectedSessionId;
            if (targetId) await setSpeakerAlias(targetId, speaker, newName);
            
            // Dispatch to live aliases
            dispatch({
              type: "UPDATE_SPEAKER_ALIAS",
              payload: { speaker, alias: newName }
            });

            if (!state.isListening && selectedSessionData) {
              dispatch({
                type: "SELECT_SESSION",
                payload: {
                  sessionId: selectedSessionId,
                  sessionData: {
                    ...selectedSessionData,
                    speakerAliases: { ...selectedSessionData.speakerAliases, [speaker]: newName },
                  },
                  utterances,
                },
              });
            }
          }
        }}
      />
    </>
  );
}
