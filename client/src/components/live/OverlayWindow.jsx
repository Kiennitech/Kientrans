import { useRef, useEffect } from "react";
import { useSocket } from "../../context/SocketContext";
import useDraggable from "../../hooks/useDraggable";

export default function OverlayWindow() {
  const { state, dispatch } = useSocket();
  const { utterances, partialResults, overlaySettings: s } = state;
  const { position, isDragging, dragRef, dragHandlers } = useDraggable({
    x: window.innerWidth / 2 - 250,
    y: window.innerHeight - 260,
  });
  const scrollRef = useRef(null);

  const finalOn = s.finalContent !== "off";
  const partialOn = s.partialContent !== "off";
  const finalTranslated = s.finalContent === "translated" || s.finalContent === "both";
  const finalOriginal = s.finalContent === "original" || s.finalContent === "both";
  const partialTranslated = s.partialContent === "translated" || s.partialContent === "both";
  const partialOriginal = s.partialContent === "original" || s.partialContent === "both";

  const partialEntries = Object.entries(partialResults);
  const visibleUtterances = finalOn ? utterances.slice(-s.maxLines) : [];
  const visiblePartials = partialOn ? partialEntries.filter(([, p]) => p.translatedText || p.originalText) : [];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [utterances.length, partialResults]);

  const isDark = s.bgColor === "dark";
  const bg = isDark
    ? `rgba(0, 0, 0, ${s.opacity})`
    : `rgba(255, 255, 255, ${s.opacity})`;
  const defaultTextColor = isDark ? "#fff" : "#1a1a1a";
  const mutedColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
  const translatedColor = s.translatedColor || defaultTextColor;
  const originalColor = s.originalColor || mutedColor;

  return (
    <div
      ref={dragRef}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 9999,
        width: 500,
        maxWidth: "90vw",
        background: bg,
        color: defaultTextColor,
        backdropFilter: "blur(12px)",
        borderRadius: 14,
        border: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
        fontSize: `${s.scale}rem`,
        fontFamily: s.fontFamily,
        textAlign: s.textAlign,
      }}
    >
      {/* Title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          borderBottom: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.06)",
          fontSize: "0.7rem",
          color: mutedColor,
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
          touchAction: "none",
        }}
        {...dragHandlers}
      >
        <span>Node Trans</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: "TOGGLE_OVERLAY" });
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            background: "none",
            border: "none",
            color: mutedColor,
            cursor: "pointer",
            fontSize: "1rem",
            lineHeight: 1,
            padding: "0 2px",
          }}
        >
          &times;
        </button>
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        style={{
          padding: "8px 12px",
          maxHeight: 200,
          overflowY: "auto",
          overflowX: "hidden",
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {visibleUtterances.length === 0 && visiblePartials.length === 0 && (
          <div style={{ color: mutedColor, fontSize: "0.85em", padding: "8px 0" }}>
            ...
          </div>
        )}
        {visibleUtterances.map((u, i) => {
          const translation = u.translatedText || u.translated_text;
          const original = u.originalText || u.original_text;
          return (
            <div key={i} style={{ marginBottom: 6, lineHeight: 1.5 }}>
              {finalTranslated && translation && (
                <div className="select-text cursor-text" style={{ fontWeight: 500, color: translatedColor, fontSize: `${s.translatedFontSize}em` }}>
                  {translation}
                </div>
              )}
              {finalOriginal && original && (
                <div className="select-text cursor-text" style={{ fontSize: `${s.originalFontSize}em`, color: originalColor }}>
                  {original}
                </div>
              )}
            </div>
          );
        })}
        {visiblePartials.map(([source, data]) => (
          <div key={source} style={{ marginBottom: 6, lineHeight: 1.5, opacity: 0.7 }}>
            {partialTranslated && data.translatedText && (
              <div className="select-text cursor-text" style={{ fontWeight: 500, fontStyle: "italic", color: translatedColor, fontSize: `${s.translatedFontSize}em` }}>
                {data.translatedText}
              </div>
            )}
            {partialOriginal && data.originalText && (
              <div className="select-text cursor-text" style={{ fontSize: `${s.originalFontSize}em`, color: originalColor, fontStyle: "italic" }}>
                {data.originalText}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
