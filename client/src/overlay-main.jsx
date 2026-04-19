import React, { useState, useEffect, useRef, useCallback } from "react";
import ReactDOM from "react-dom/client";

const DEFAULTS = {
  opacity: 0.8,
  scale: 1,
  textAlign: "left",
  bgColor: "dark",
  maxLines: 5,
  fontFamily: "system-ui, sans-serif",
  finalContent: "both",
  partialContent: "both",
  translatedFontSize: 1,
  translatedColor: "",
  originalFontSize: 0.8,
  originalColor: "",
};

function OverlayApp() {
  const [utterances, setUtterances] = useState([]);
  const [partials, setPartials] = useState({});
  const [settings, setSettings] = useState(DEFAULTS);
  const scrollRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef(null);

  const onPointerDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = { x: e.screenX, y: e.screenY };
    window.overlayAPI?.dragStart();
    setIsDragging(true);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.screenX - dragStartRef.current.x;
    const dy = e.screenY - dragStartRef.current.y;
    window.overlayAPI?.dragMove(dx, dy);
  }, [isDragging]);

  const onPointerUp = useCallback(() => {
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    const api = window.overlayAPI;
    if (!api) return;

    api.onData((data) => {
      switch (data.type) {
        case "utterance":
          setUtterances((prev) => [...prev, data.payload]);
          break;
        case "partial":
          setPartials((prev) => ({
            ...prev,
            [data.payload.source || "mic"]: data.payload,
          }));
          break;
        case "utterance-clear-partial": {
          setUtterances((prev) => [...prev, data.payload]);
          setPartials((prev) => {
            const next = { ...prev };
            delete next[data.payload.source || "mic"];
            return next;
          });
          break;
        }
        case "clear":
          setUtterances([]);
          setPartials({});
          break;
        case "init":
          setUtterances(data.utterances || []);
          setPartials(data.partials || {});
          if (data.settings) setSettings((s) => ({ ...s, ...data.settings }));
          break;
      }
    });

    api.onSettings((s) => setSettings((prev) => ({ ...prev, ...s })));
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [utterances.length, partials]);

  const s = settings;
  const finalOn = s.finalContent !== "off";
  const partialOn = s.partialContent !== "off";
  const finalTranslated = s.finalContent === "translated" || s.finalContent === "both";
  const finalOriginal = s.finalContent === "original" || s.finalContent === "both";
  const partialTranslated = s.partialContent === "translated" || s.partialContent === "both";
  const partialOriginal = s.partialContent === "original" || s.partialContent === "both";

  const visibleUtterances = finalOn ? utterances.slice(-s.maxLines) : [];
  const visiblePartials = partialOn
    ? Object.entries(partials).filter(([, p]) => p.translatedText || p.originalText)
    : [];

  const isDark = s.bgColor === "dark";
  const bg = isDark
    ? `rgba(0, 0, 0, ${s.opacity})`
    : `rgba(255, 255, 255, ${s.opacity})`;
  const defaultTextColor = isDark ? "#fff" : "#1a1a1a";
  const mutedColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
  const translatedColor = s.translatedColor || defaultTextColor;
  const originalColor = s.originalColor || mutedColor;
  const borderColor = isDark
    ? "rgba(255,255,255,0.1)"
    : "rgba(0,0,0,0.1)";

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: bg,
        color: defaultTextColor,
        fontSize: `${s.scale}rem`,
        fontFamily: s.fontFamily,
        textAlign: s.textAlign,
        display: "flex",
        flexDirection: "column",
        borderRadius: 14,
        border: `1px solid ${borderColor}`,
        overflow: "hidden",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Title bar — drag handle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          borderBottom: `1px solid ${borderColor}`,
          fontSize: "0.7rem",
          color: mutedColor,
          flexShrink: 0,
          cursor: isDragging ? "grabbing" : "grab",
          userSelect: "none",
          touchAction: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span>Node Trans</span>
        <button
          onClick={() => window.overlayAPI?.close()}
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
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {visibleUtterances.length === 0 && visiblePartials.length === 0 && (
          <div
            style={{ color: mutedColor, fontSize: "0.85em", padding: "8px 0" }}
          >
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
          <div
            key={source}
            style={{ marginBottom: 6, lineHeight: 1.5, opacity: 0.7 }}
          >
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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>
);
