import { useState, useRef, useEffect } from "react";
import { getSpeakerIndex } from "../../utils/speakerColors";
import { useI18n } from "../../i18n/I18nContext";
import { useSocket } from "../../context/SocketContext";

export default function Utterance({ data, speakerColorMap, speakerName, onRenameSpeaker }) {
  const { t } = useI18n();
  const { socket } = useSocket();
  const [loading, setLoading] = useState(false);
  const [selectionMenu, setSelectionMenu] = useState(null);
  const containerRef = useRef(null);

  const idx = getSpeakerIndex(data.speaker, speakerColorMap);
  const speaker = speakerName || (data.speaker ? `${t("speaker")} ${idx + 1}` : t("speaker"));
  const time = new Date(data.timestamp).toLocaleTimeString("en-US");
  const lang = data.originalLanguage || data.original_language;
  const source = data.source;
  const original = data.originalText || data.original_text;
  const translation = data.translatedText || data.translated_text;

  const handleManualTranslate = (textOverride) => {
    const textToTranslate = textOverride || original;
    if (loading || !textToTranslate) return;
    setLoading(true);
    socket.emit("manual-translate", {
      id: data.id || data.timestamp,
      text: textToTranslate,
      sourceLang: lang
    });
    setSelectionMenu(null);
    setTimeout(() => setLoading(false), 10000);
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editSpeaker, setEditSpeaker] = useState("");
  const [editOriginal, setEditOriginal] = useState("");

  const startEdit = () => {
    setEditSpeaker(speaker);
    setEditOriginal(original);
    setIsEditing(true);
  };

  const cancelEdit = () => setIsEditing(false);

  const saveEdit = () => {
    socket.emit("edit-utterance", {
      id: data.id || data.timestamp,
      newSpeaker: editSpeaker,
      newOriginalText: editOriginal
    });
    setIsEditing(false);
  };



  useEffect(() => {
    const handleMouseUp = () => {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      if (text && containerRef.current && containerRef.current.contains(selection.anchorNode)) {
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setSelectionMenu({
          text,
          top: rect.top + window.scrollY - 45,
          left: rect.left + window.scrollX + (rect.width / 2)
        });
      } else {
        setSelectionMenu(null);
      }
    };

    document.addEventListener("mouseup", handleMouseUp);
    return () => document.removeEventListener("mouseup", handleMouseUp);
  }, []);



  if (isEditing) {
    return (
      <div className={`speaker-${idx} p-4 mb-2 rounded-xl bg-white dark:bg-[#1a1c2e] border-2 border-indigo-500/50 shadow-lg relative animate-in fade-in zoom-in-95 duration-200`}>
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[0.65rem] font-bold text-indigo-500 uppercase tracking-widest mb-1 block">Tên người nói (Chỉ lưu cho câu này)</label>
            <input 
              value={editSpeaker}
              onChange={(e) => setEditSpeaker(e.target.value)}
              className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 font-bold focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="Ví dụ: Anh Kiên, Sếp Tùng..."
            />
          </div>
          <div>
            <label className="text-[0.65rem] font-bold text-indigo-500 uppercase tracking-widest mb-1 block">Nội dung thoại</label>
            <textarea 
              value={editOriginal}
              onChange={(e) => setEditOriginal(e.target.value)}
              className="w-full bg-gray-50 dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-gray-200 min-h-[80px] focus:outline-none focus:border-indigo-500 transition-colors resize-y"
            />
          </div>
          <div className="flex justify-end gap-2 mt-1">
            <button onClick={cancelEdit} className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors cursor-pointer rounded-lg hover:bg-gray-100 dark:hover:bg-white/5">Huỷ</button>
            <button onClick={saveEdit} className="px-5 py-2 text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 shadow-md shadow-indigo-500/20 rounded-lg transition-all cursor-pointer">LƯU THAY ĐỔI</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={`group speaker-${idx} p-3 mb-1.5 rounded-xl bg-gray-50/80 dark:bg-white/3 border-l-3 border-l-(--speaker-color,#444) transition-all duration-200 hover:bg-gray-100/80 dark:hover:bg-white/6 shadow-sm hover:shadow-md relative`}
    >
      {/* Edit Button */}
      <button 
        onClick={startEdit}
        className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-gray-400 hover:text-indigo-500 bg-white/80 dark:bg-[#1a1c2e]/80 backdrop-blur-sm rounded-lg hover:shadow-sm border border-gray-100 dark:border-white/5 cursor-pointer z-10"
        title="Sửa câu này"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>

      {/* Selection Menu */}
      {selectionMenu && (
        <div 
          className="fixed z-50 flex gap-1 p-1 bg-white/95 dark:bg-[#1a1c2e]/95 backdrop-blur-lg rounded-full shadow-2xl border border-indigo-500/20 animate-in zoom-in-95 duration-100"
          style={{ 
            top: selectionMenu.top, 
            left: selectionMenu.left,
            transform: 'translateX(-50%)' 
          }}
        >
          <button 
            onClick={() => {
              navigator.clipboard.writeText(selectionMenu.text);
              setSelectionMenu(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[0.7rem] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-white/5 rounded-full transition-colors cursor-pointer"
          >
            📋 COPY
          </button>
        </div>
      )}



      <div className="flex items-center gap-2 mb-1.5 text-sm pr-8">
        <span 
          className="font-bold text-(--speaker-color,#60a5fa) cursor-pointer hover:underline hover:opacity-80 transition-all"
          onClick={() => onRenameSpeaker && onRenameSpeaker(data.speaker, speakerName || speaker)}
          title={t("renameSpeaker")}
        >
          {speaker}
        </span>
        {lang && (
          <span className="bg-gray-100/80 dark:bg-white/5 text-gray-500 dark:text-gray-500 px-2 py-px rounded-full text-[0.68rem] font-medium">
            {lang}
          </span>
        )}
        <span className="ml-auto text-gray-300 dark:text-gray-700 text-[0.7rem] tabular-nums">{time}</span>
      </div>

      <div className="flex justify-between items-start gap-4">
        <div className="text-base font-medium text-gray-800 dark:text-gray-200 leading-relaxed mb-1 flex-1 select-text cursor-text whitespace-pre-wrap">{original}</div>
      </div>

      {translation && (
        <div className="text-base font-medium text-(--speaker-color,#4ade80) opacity-90 leading-relaxed pl-3 border-l-2 border-l-(--speaker-color,#4ade80) mt-1 animate-in fade-in slide-in-from-left-2 duration-300 select-text cursor-text">
          {translation}
        </div>
      )}
    </div>
  );
}
