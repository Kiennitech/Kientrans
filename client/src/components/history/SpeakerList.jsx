import { getSpeakerIndex } from "../../utils/speakerColors";
import { useI18n } from "../../i18n/I18nContext";

export default function SpeakerList({ speakers, aliases, speakerColorMap, onRenameSpeaker }) {
  const { t } = useI18n();
  if (speakers.length === 0) return null;

  const speakerName = (s) => {
    const idx = getSpeakerIndex(s, speakerColorMap);
    return aliases[s] || `${t("speaker")} ${idx + 1}`;
  };

  return (
    <>
      {speakers.map((s) => {
        const idx = getSpeakerIndex(s, speakerColorMap);
        return (
          <div key={s} className={`speaker-${idx} flex items-center gap-1.5`}>
            <span className="w-2 h-2 rounded-full shrink-0 bg-(--speaker-color,#444) shadow-[0_0_5px_var(--speaker-color)]" />
            <span className="text-xs text-gray-700 dark:text-gray-300">{speakerName(s)}</span>
            <button
              className="bg-transparent border-none cursor-pointer text-xs px-1 py-0.5 rounded opacity-30 transition-opacity hover:opacity-100 hover:bg-gray-100/60 dark:hover:bg-white/5"
              onClick={() => onRenameSpeaker(s, speakerName(s))}
            >
              🖊️
            </button>
          </div>
        );
      })}
    </>
  );
}
