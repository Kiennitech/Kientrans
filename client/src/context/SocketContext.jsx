import { createContext, useContext, useReducer, useEffect, useMemo } from "react";
import { io } from "socket.io-client";
import { getSpeakerIndex } from "../utils/speakerColors";

const SocketActionsContext = createContext(null);
const SocketStateContext = createContext(null);

const OVERLAY_DEFAULTS = {
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

function loadOverlaySettings() {
  try {
    const saved = localStorage.getItem("overlay-settings");
    if (saved) return { ...OVERLAY_DEFAULTS, ...JSON.parse(saved) };
  } catch {}
  return { ...OVERLAY_DEFAULTS };
}

const initialState = {
  isListening: false,
  isPaused: false,
  currentSessionId: null,
  selectedSessionId: null,
  selectedSessionData: null,
  pendingAction: false,
  statusText: "connecting",
  statusKey: "connecting",
  statusClass: "",
  toasts: [],
  utterances: [],
  partialResults: {},
  speakerColorMap: new Map(),
  listeningSince: null,
  pausedElapsed: 0,
  sessionListVersion: 0,
  overlayVisible: false,
  overlaySettings: loadOverlaySettings(),
  activeContext: null,
};

function reducer(state, action) {
  switch (action.type) {
    case "STATUS": {
      const d = action.payload;
      const isListening = d.listening;
      const isPaused = d.paused || false;

      let statusKey, statusParams, statusClass;
      if (isListening && !isPaused) {
        statusKey = "listening";
        statusParams = { source: d.audioSource };
        statusClass = "listening";
      } else if (isListening && isPaused) {
        statusKey = "paused";
        statusClass = "paused";
      } else {
        statusKey = "stopped";
        statusClass = "";
      }

      let listeningSince = state.listeningSince;
      let pausedElapsed = state.pausedElapsed;

      if (!isListening) {
        // Stopped
        listeningSince = null;
        pausedElapsed = 0;
        return {
          ...state,
          isListening,
          isPaused,
          currentSessionId: null,
          pendingAction: false,
          statusKey,
          statusParams,
          statusClass,
          partialResults: {},
          listeningSince,
          pausedElapsed,
          activeContext: null,
          liveSpeakerAliases: {},
        };
      } else if (!state.isListening) {
        // Just started — keep utterances if resuming a selected session
        const isResume = state.selectedSessionId && state.selectedSessionId === d.sessionId;
        return {
          ...state,
          isListening,
          isPaused,
          currentSessionId: d.sessionId,
          selectedSessionId: null,
          selectedSessionData: null,
          pendingAction: false,
          statusKey,
          statusParams,
          statusClass,
          partialResults: {},
          utterances: isResume ? state.utterances : [],
          speakerColorMap: isResume ? state.speakerColorMap : new Map(),
          listeningSince: Date.now(),
          pausedElapsed: 0,
          liveSpeakerAliases: isResume ? state.liveSpeakerAliases : {},
        };
      } else if (isPaused && !state.isPaused) {
        // Just paused — accumulate elapsed so far
        pausedElapsed += listeningSince ? Date.now() - listeningSince : 0;
        listeningSince = null;
      } else if (!isPaused && state.isPaused) {
        // Resumed
        listeningSince = Date.now();
      }

      return {
        ...state,
        isListening,
        isPaused,
        currentSessionId: isListening ? d.sessionId : null,
        pendingAction: false,
        statusKey,
        statusParams,
        statusClass,
        partialResults: {},
        listeningSince,
        pausedElapsed,
      };
    }
    case "UTTERANCE": {
      const d = action.payload;
      const newMap = new Map(state.speakerColorMap);
      getSpeakerIndex(d.speaker, newMap);
      const nextPartials = { ...state.partialResults };
      delete nextPartials[d.source || "mic"];
      return {
        ...state,
        utterances: [...state.utterances, d],
        partialResults: nextPartials,
        speakerColorMap: newMap,
      };
    }
    case "PARTIAL": {
      const d = action.payload;
      const source = d.source || "mic";
      return {
        ...state,
        partialResults: {
          ...state.partialResults,
          [source]: d,
        },
      };
    }
    case "ERROR": {
      const err = action.payload;
      const id = Date.now() + Math.random();
      return {
        ...state,
        pendingAction: false,
        statusKey: "stopped",
        statusClass: "",
        toasts: [...state.toasts, { id, key: err.key || null, params: err.params, message: err.message || null, type: "error" }],
      };
    }
    case "CONNECTED":
      if (!state.isListening) {
        return { ...state, statusKey: "connected", statusClass: "" };
      }
      return state;
    case "DISCONNECTED":
      return {
        ...state,
        isListening: false,
        isPaused: false,
        pendingAction: false,
        statusKey: "disconnected",
        statusClass: "error",
        listeningSince: null,
        pausedElapsed: 0,
      };
    case "TOAST": {
      const id = Date.now() + Math.random();
      return {
        ...state,
        toasts: [...state.toasts, { id, message: action.payload.message, type: action.payload.type || "" }],
      };
    }
    case "DISMISS_TOAST":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.payload) };
    case "SET_PENDING":
      return { ...state, pendingAction: true };
    case "CLEAR_TRANSCRIPT":
      return { ...state, utterances: [], partialResults: {}, speakerColorMap: new Map() };
    case "SELECT_SESSION": {
      const { sessionId, sessionData, utterances } = action.payload;
      const newMap = new Map();
      for (const u of utterances) {
        const speaker = u.speaker || u.original_speaker;
        if (speaker) getSpeakerIndex(speaker, newMap);
      }
      return {
        ...state,
        selectedSessionId: sessionId,
        selectedSessionData: sessionData,
        utterances,
        partialResults: {},
        speakerColorMap: newMap,
      };
    }
    case "DESELECT_SESSION":
      return {
        ...state,
        selectedSessionId: null,
        selectedSessionData: null,
        utterances: [],
        partialResults: {},
        speakerColorMap: new Map(),
      };
    case "REFRESH_SESSION_LIST":
      return { ...state, sessionListVersion: state.sessionListVersion + 1 };
    case "TOGGLE_OVERLAY": {
      return { ...state, overlayVisible: !state.overlayVisible };
    }
    case "UPDATE_OVERLAY_SETTINGS": {
      const overlaySettings = { ...state.overlaySettings, ...action.payload };
      localStorage.setItem("overlay-settings", JSON.stringify(overlaySettings));
      if (window.electronAPI?.sendOverlaySettings) {
        window.electronAPI.sendOverlaySettings(overlaySettings);
      }
      return { ...state, overlaySettings };
    }
    case "OVERLAY_CLOSED":
      return { ...state, overlayVisible: false };
    case "SET_CONTEXT":
      return { ...state, activeContext: action.payload };
    case "UPDATE_UTTERANCE": {
      const { id, translated, lang } = action.payload;
      return {
        ...state,
        utterances: state.utterances.map((u) => 
          (u.id === id || u.timestamp === id) ? { ...u, translatedText: translated, translationLanguage: lang } : u
        )
      };
    }
    case "EDIT_UTTERANCE": {
      const { id, newSpeaker, newOriginalText } = action.payload;
      return {
        ...state,
        utterances: state.utterances.map((u) => {
          if (u.id === id || u.timestamp === id) {
            return { 
              ...u, 
              speaker: newSpeaker !== undefined ? newSpeaker : u.speaker,
              originalText: newOriginalText !== undefined ? newOriginalText : u.originalText,
              original_text: newOriginalText !== undefined ? newOriginalText : u.original_text 
            };
          }
          return u;
        })
      };
    }
    case "UPDATE_SPEAKER_ALIAS": {
      const { speaker, alias } = action.payload;
      return {
        ...state,
        liveSpeakerAliases: {
          ...(state.liveSpeakerAliases || {}),
          [speaker]: alias
        }
      };
    }
    default:
      return state;
  }
}

export function SocketProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const socket = useMemo(() => io(), []);
  const actions = useMemo(() => ({ socket, dispatch }), [socket]);

  useEffect(() => {
    const fwdOverlay = window.electronAPI?.sendOverlayData;

    socket.on("status", (data) => {
      dispatch({ type: "STATUS", payload: data });
      if (!data.listening && fwdOverlay) {
        fwdOverlay({ type: "clear" });
      }
    });
    socket.on("utterance", (data) => {
      dispatch({ type: "UTTERANCE", payload: data });
      if (fwdOverlay) fwdOverlay({ type: "utterance-clear-partial", payload: data });
    });
    socket.on("partial-result", (data) => {
      dispatch({ type: "PARTIAL", payload: data });
      if (fwdOverlay) fwdOverlay({ type: "partial", payload: data });
    });
    socket.on("translation-result", (data) => {
      dispatch({ type: "UPDATE_UTTERANCE", payload: data });
    });
    socket.on("utterance-updated", (data) => {
      dispatch({ type: "EDIT_UTTERANCE", payload: data });
    });
    socket.on("error", (data) => dispatch({ type: "ERROR", payload: data }));
    socket.on("connect", () => dispatch({ type: "CONNECTED" }));
    socket.on("disconnect", () => dispatch({ type: "DISCONNECTED" }));

    // If socket connected before useEffect ran (fast localhost), catch up
    if (socket.connected) {
      dispatch({ type: "CONNECTED" });
    }

    // Listen for overlay closed from Electron
    if (window.electronAPI?.onOverlayClosed) {
      window.electronAPI.onOverlayClosed(() => dispatch({ type: "OVERLAY_CLOSED" }));
    }

    // Load overlay settings from server
    fetch("/api/settings/overlay", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data && typeof data === "object" && !data.error) {
          dispatch({ type: "UPDATE_OVERLAY_SETTINGS", payload: data });
        }
      })
      .catch(() => {});

    return () => {
      socket.off();
      // Don't disconnect — socket is shared via useMemo and must survive
      // React StrictMode's effect cleanup/re-run cycle.
    };
  }, [socket]);

  return (
    <SocketActionsContext.Provider value={actions}>
      <SocketStateContext.Provider value={state}>
        {children}
      </SocketStateContext.Provider>
    </SocketActionsContext.Provider>
  );
}

/** Returns stable { socket, dispatch } — does NOT re-render on state changes */
export function useSocketActions() {
  return useContext(SocketActionsContext);
}

/** Returns { socket, state, dispatch } — backward compatible, re-renders on state changes */
export function useSocket() {
  const { socket, dispatch } = useContext(SocketActionsContext);
  const state = useContext(SocketStateContext);
  return { socket, state, dispatch };
}
