import { useI18n } from "../i18n/I18nContext";
import { useSocket } from "../context/SocketContext";

export default function TabNav({ onOpenSettings }) {
  const { t } = useI18n();
  const { state, dispatch } = useSocket();

  const btnCls = (active) =>
    `border-none px-3 py-1.5 cursor-pointer rounded-xl text-sm font-medium transition-all duration-200 active:scale-95 ${
      active
        ? "bg-linear-to-r from-indigo-500/15 to-cyan-500/10 dark:from-indigo-500/20 dark:to-cyan-500/10 text-indigo-600 dark:text-cyan-400 shadow-sm"
        : "bg-transparent text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 hover:bg-gray-100/50 dark:hover:bg-white/5"
    }`;

  return (
    <nav className="flex items-center gap-1 py-3">
      <div className="ml-auto flex items-center gap-1">
        {/* Overlay toggle */}
        <button
          className={btnCls(state.overlayVisible)}
          onClick={() => {
            if (window.electronAPI?.toggleOverlay) {
              window.electronAPI.toggleOverlay({
                settings: state.overlaySettings,
                utterances: state.utterances.slice(-state.overlaySettings.maxLines),
                partials: state.partialResults,
              });
            }
            dispatch({ type: "TOGGLE_OVERLAY" });
          }}
          title={t("overlay")}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 inline-block align-[-2px] mr-1">
            <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 0 0 2 4.25v11.5A2.25 2.25 0 0 0 4.25 18h11.5A2.25 2.25 0 0 0 18 15.75V4.25A2.25 2.25 0 0 0 15.75 2H4.25ZM3.5 4.25a.75.75 0 0 1 .75-.75h11.5a.75.75 0 0 1 .75.75v11.5a.75.75 0 0 1-.75.75H4.25a.75.75 0 0 1-.75-.75V4.25Z" clipRule="evenodd" />
            <path d="M5 10.5h10v1H5zM5 13h10v1H5z" />
          </svg>
          {t("overlay")}
        </button>

        {/* Settings button */}
        <button className={btnCls(false)} onClick={onOpenSettings} title={t("tabSettings")}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 inline-block align-[-2px] mr-1">
            <path fillRule="evenodd" d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .205 1.251l-1.18 2.044a1 1 0 0 1-1.186.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.113a7.047 7.047 0 0 1 0-2.228L1.821 7.773a1 1 0 0 1-.205-1.251l1.18-2.044a1 1 0 0 1 1.186-.447l1.598.54A6.993 6.993 0 0 1 7.51 3.456l.33-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
          </svg>
          {t("tabSettings")}
        </button>
      </div>
    </nav>
  );
}
