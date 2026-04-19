import { useSocket } from "../../context/SocketContext";
import { useI18n } from "../../i18n/I18nContext";
import { saveOverlaySettings } from "../../utils/api";

const labelCls = "block text-xs text-gray-400 dark:text-gray-600 mb-1.5 font-medium uppercase tracking-wider";

const toggleBtnCls = (active) =>
  `border px-4 py-1.5 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer active:scale-95 ${
    active
      ? "bg-indigo-500/15 dark:bg-indigo-500/20 text-indigo-600 dark:text-cyan-400 border-indigo-500/30"
      : "bg-transparent text-gray-400 dark:text-gray-600 border-gray-200/50 dark:border-indigo-500/10 hover:text-gray-600 dark:hover:text-gray-400"
  }`;

const selectCls = "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600 px-3 py-2 rounded-xl w-full text-sm outline-none transition-all duration-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 hover:border-indigo-400 dark:hover:border-indigo-400";

const CONTENT_OPTIONS = [
  { value: "off", key: "overlayContentOff" },
  { value: "translated", key: "overlayContentTranslated" },
  { value: "original", key: "overlayContentOriginal" },
  { value: "both", key: "overlayContentBoth" },
];

export default function OverlaySettings() {
  const { t } = useI18n();
  const { state, dispatch } = useSocket();
  const s = state.overlaySettings;

  const update = (patch) => {
    dispatch({ type: "UPDATE_OVERLAY_SETTINGS", payload: patch });
    saveOverlaySettings({ ...s, ...patch }).catch(() => {});
  };

  const isDark = s.bgColor === "dark";
  const defaultColor = isDark ? "#ffffff" : "#1a1a1a";
  const autoMuted = isDark ? "#808080" : "#666666";

  return (
    <div>
      <div className="space-y-4">

        {/* Opacity + Font Scale */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={labelCls}>
              {t("overlayOpacity")} {Math.round(s.opacity * 100)}%
            </label>
            <input
              type="range" min="0.1" max="1" step="0.05"
              value={s.opacity}
              onChange={(e) => update({ opacity: parseFloat(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>
          <div>
            <label className={labelCls}>
              {t("overlayFontScale")} {Math.round(s.scale * 100)}%
            </label>
            <input
              type="range" min="0.7" max="1.8" step="0.05"
              value={s.scale}
              onChange={(e) => update({ scale: parseFloat(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>
        </div>

        {/* Max Lines + Font Family */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>
              {t("overlayMaxLines")} {s.maxLines}
            </label>
            <input
              type="range" min="1" max="15" step="1"
              value={s.maxLines}
              onChange={(e) => update({ maxLines: parseInt(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>
          <div>
            <label className={labelCls}>{t("overlayFontFamily")}</label>
            <select
              className={selectCls}
              value={s.fontFamily}
              onChange={(e) => update({ fontFamily: e.target.value })}
            >
              <option value="system-ui, sans-serif">System UI</option>
              <option value="Georgia, serif">Georgia (Serif)</option>
              <option value="'Courier New', monospace">Courier New (Mono)</option>
              <option value="Arial, sans-serif">Arial</option>
              <option value="'Times New Roman', serif">Times New Roman</option>
            </select>
          </div>
        </div>

        {/* Text Alignment + Background */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t("overlayTextAlign")}</label>
            <div className="flex gap-2">
              {["left", "center", "right"].map((align) => (
                <button
                  key={align}
                  className={toggleBtnCls(s.textAlign === align)}
                  onClick={() => update({ textAlign: align })}
                >
                  {t(`overlayAlign${align.charAt(0).toUpperCase() + align.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>{t("overlayBgColor")}</label>
            <div className="flex gap-2">
              {["dark", "light"].map((bg) => (
                <button
                  key={bg}
                  className={toggleBtnCls(s.bgColor === bg)}
                  onClick={() => update({ bgColor: bg })}
                >
                  {t(`overlayBg${bg.charAt(0).toUpperCase() + bg.slice(1)}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200/50 dark:border-indigo-500/10" />

        {/* Display modes */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t("overlayFinalContent")}</label>
            <select
              className={selectCls}
              value={s.finalContent}
              onChange={(e) => update({ finalContent: e.target.value })}
            >
              {CONTENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{t(o.key)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>{t("overlayPartialContent")}</label>
            <select
              className={selectCls}
              value={s.partialContent}
              onChange={(e) => update({ partialContent: e.target.value })}
            >
              {CONTENT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{t(o.key)}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200/50 dark:border-indigo-500/10" />

        {/* Translated text style */}
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">{t("overlayTranslatedStyle")}</label>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <label className={labelCls}>
                {t("overlayFontSize")} {s.translatedFontSize}em
              </label>
              <input
                type="range" min="0.5" max="2" step="0.05"
                value={s.translatedFontSize}
                onChange={(e) => update({ translatedFontSize: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>
            <div>
              <label className={labelCls}>{t("overlayColor")}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={s.translatedColor || defaultColor}
                  onChange={(e) => update({ translatedColor: e.target.value })}
                  className="w-8 h-8 rounded-lg border border-gray-200/50 dark:border-indigo-500/10 cursor-pointer bg-transparent"
                />
                <button
                  className={toggleBtnCls(!s.translatedColor)}
                  onClick={() => update({ translatedColor: "" })}
                >
                  {t("overlayColorAuto")}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Original text style */}
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">{t("overlayOriginalStyle")}</label>
          <div className="grid grid-cols-2 gap-4 mt-2">
            <div>
              <label className={labelCls}>
                {t("overlayFontSize")} {s.originalFontSize}em
              </label>
              <input
                type="range" min="0.5" max="2" step="0.05"
                value={s.originalFontSize}
                onChange={(e) => update({ originalFontSize: parseFloat(e.target.value) })}
                className="w-full accent-indigo-500"
              />
            </div>
            <div>
              <label className={labelCls}>{t("overlayColor")}</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={s.originalColor || autoMuted}
                  onChange={(e) => update({ originalColor: e.target.value })}
                  className="w-8 h-8 rounded-lg border border-gray-200/50 dark:border-indigo-500/10 cursor-pointer bg-transparent"
                />
                <button
                  className={toggleBtnCls(!s.originalColor)}
                  onClick={() => update({ originalColor: "" })}
                >
                  {t("overlayColorAuto")}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview */}
        {(() => {
          const tColor = s.translatedColor || defaultColor;
          const oColor = s.originalColor || (isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)");
          const bgPreview = isDark ? `rgba(0,0,0,${s.opacity})` : `rgba(255,255,255,${s.opacity})`;
          const showTranslated = s.finalContent === "translated" || s.finalContent === "both";
          const showOriginal = s.finalContent === "original" || s.finalContent === "both";
          const pTranslated = s.partialContent === "translated" || s.partialContent === "both";
          const pOriginal = s.partialContent === "original" || s.partialContent === "both";
          return (
            <div style={{
              background: bgPreview,
              borderRadius: 10,
              padding: "10px 14px",
              fontFamily: s.fontFamily,
              fontSize: `${s.scale}rem`,
              textAlign: s.textAlign,
            }}>
              {s.finalContent !== "off" && (
                <div style={{ marginBottom: 6 }}>
                  {showTranslated && (
                    <div style={{ color: tColor, fontWeight: 500, fontSize: `${s.translatedFontSize}em` }}>
                      Translated sample text
                    </div>
                  )}
                  {showOriginal && (
                    <div style={{ color: oColor, fontSize: `${s.originalFontSize}em` }}>
                      Original sample text
                    </div>
                  )}
                </div>
              )}
              {s.partialContent !== "off" && (
                <div style={{ opacity: 0.7 }}>
                  {pTranslated && (
                    <div style={{ color: tColor, fontWeight: 500, fontStyle: "italic", fontSize: `${s.translatedFontSize}em` }}>
                      Partial translated...
                    </div>
                  )}
                  {pOriginal && (
                    <div style={{ color: oColor, fontStyle: "italic", fontSize: `${s.originalFontSize}em` }}>
                      Partial original...
                    </div>
                  )}
                </div>
              )}
              {s.finalContent === "off" && s.partialContent === "off" && (
                <div style={{ color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)", fontSize: "0.85em" }}>
                  ...
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </div>
  );
}
