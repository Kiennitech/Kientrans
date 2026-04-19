import { useRef, useEffect } from "react";
import { useSocket } from "../../context/SocketContext";
import { useI18n } from "../../i18n/I18nContext";
import { getSpeakerIndex } from "../../utils/speakerColors";
import Utterance from "./Utterance";

export default function Transcript({ utterances, speakerColorMap, speakerAliases, partialResults, onRenameSpeaker }) {
  const { state } = useSocket();
  const { t } = useI18n();
  const ref = useRef(null);
  const isAutoScrollRef = useRef(true);
  const partialEntries = Object.entries(partialResults);
  const hasContent = utterances.length > 0 || partialEntries.some(([, p]) => p.originalText);

  const handleScroll = () => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    // Check if user is scrolled to the very bottom (within 50px buffer)
    isAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50;
  };

  useEffect(() => {
    if (ref.current && isAutoScrollRef.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [utterances.length, partialResults]);

  return (
    <div
      className="flex-1 overflow-y-auto p-4 bg-white/60 dark:bg-[#0b0d18]/60 backdrop-blur-md rounded-2xl border border-gray-200/50 dark:border-indigo-500/10 mt-2 shadow-sm"
      ref={ref}
      onScroll={handleScroll}
    >
      {!hasContent ? (
        <div className="text-gray-300 dark:text-gray-700 text-center py-15 text-sm">
          {state.selectedSessionId ? t("pressResume") : t("pressStart")}
        </div>
      ) : (
        <>
          {utterances.map((u, i) => (
            <Utterance
              key={i}
              data={u}
              speakerColorMap={speakerColorMap}
              speakerName={u.speaker && speakerAliases?.[u.speaker] ? speakerAliases[u.speaker] : undefined}
              onRenameSpeaker={onRenameSpeaker}
            />
          ))}
          {partialEntries.map(([source, data]) =>
            data.originalText ? (
              <PartialUtterance key={source} data={data} speakerColorMap={speakerColorMap} />
            ) : null
          )}
        </>
      )}
    </div>
  );
}

function PartialUtterance({ data, speakerColorMap }) {
  const { t } = useI18n();
  const idx = getSpeakerIndex(data.speaker, speakerColorMap);
  const speaker = data.speaker ? `${t("speaker")} ${idx + 1}` : t("speaker");

  return (
    <div className={`speaker-${idx} p-3 mb-1.5 rounded-xl bg-gray-50/80 dark:bg-white/3 border-l-3 border-l-(--speaker-color,#444) animate-pulse opacity-70`}>
      <div className="flex items-center gap-2 mb-1.5 text-sm">
        <span className="font-bold text-(--speaker-color,#60a5fa)">{speaker}</span>
        {data.source && data.source !== "mic" && (
          <span className="bg-gray-100/80 dark:bg-white/5 text-gray-400 dark:text-gray-600 px-2 py-px rounded-full text-[0.68rem] font-medium">
            {data.source.toUpperCase()}
          </span>
        )}
      </div>
      <div className="text-base font-medium text-gray-800 dark:text-gray-200 leading-relaxed mb-1">{data.originalText}</div>
      {data.translatedText && (
        <div className="text-base font-medium text-(--speaker-color,#4ade80) opacity-90 leading-relaxed pl-3 border-l-2 border-l-(--speaker-color,#4ade80) mt-1">
          {data.translatedText}
        </div>
      )}
    </div>
  );
}
