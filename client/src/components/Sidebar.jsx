import { useState, useEffect, useCallback, useRef } from "react";
import { useSocket } from "../context/SocketContext";
import { useI18n } from "../i18n/I18nContext";
import { fetchSessions, fetchSession, deleteSession } from "../utils/api";
import { ConfirmDialog, PromptDialog } from "./Modal";
import { renameSession } from "../utils/api";

function formatDuration(startedAt, endedAt) {
  if (!endedAt) return "";
  const diffMs = new Date(endedAt + "Z") - new Date(startedAt + "Z");
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  return mins > 0 ? `${mins}m${secs}s` : `${secs}s`;
}

function SidebarItem({ session, isActive, isSelected, disabled, selectMode, checked, onToggleCheck, onClick, onRename }) {
  const { t } = useI18n();
  const startDate = new Date(session.started_at + "Z");
  const date = startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = startDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const title = session.title || `${date} ${time}`;
  const duration = formatDuration(session.started_at, session.ended_at);

  const meta = [];
  meta.push(`${date} ${time}`);
  if (duration) meta.push(duration);

  return (
    <div
      className={`group px-3 py-2 rounded-xl transition-all duration-200 mb-0.5 border flex items-center gap-2 ${
        disabled
          ? "opacity-40 cursor-not-allowed"
          : "cursor-pointer"
      } ${
        isSelected
          ? "bg-indigo-500/10 dark:bg-indigo-500/15 border-indigo-500/30 dark:border-indigo-500/20"
          : `bg-transparent border-transparent ${!disabled ? "hover:bg-gray-100/60 dark:hover:bg-white/5" : ""}`
      }`}
      onClick={disabled ? undefined : onClick}
    >
      {selectMode && (
        <input
          type="checkbox"
          className="accent-indigo-500 w-3.5 h-3.5 shrink-0"
          checked={checked}
          onChange={(e) => { e.stopPropagation(); onToggleCheck(session.id); }}
          onClick={(e) => e.stopPropagation()}
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {isActive && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          )}
          <span className="font-medium text-sm text-gray-800 dark:text-gray-100">
            {title}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-0.5 text-[0.7rem] text-gray-500 dark:text-gray-400">
          {meta.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-300 dark:text-gray-600">·</span>}
              {item}
            </span>
          ))}
        </div>
      </div>
      {!selectMode && !disabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRename(session);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 text-gray-400 hover:text-indigo-500 hover:bg-gray-200/50 dark:hover:bg-white/10 rounded-lg cursor-pointer"
          title={t("rename")}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { state, dispatch } = useSocket();
  const { t } = useI18n();
  const { isListening, currentSessionId, selectedSessionId, sessionListVersion } = state;

  const [sessions, setSessions] = useState([]);
  const [collapsed, setCollapsed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [renameModal, setRenameModal] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const longPressTimer = useRef(null);
  const longPressedRef = useRef(false);

  // Reload sessions on mount, when listening state changes, or when sessionListVersion changes
  useEffect(() => {
    let cancelled = false;
    fetchSessions()
      .then((data) => { if (!cancelled) setSessions(data); })
      .catch(() => { if (!cancelled) setSessions([]); });
    return () => { cancelled = true; };
  }, [isListening, sessionListVersion]);

  const handleLongPress = useCallback((sessionId) => {
    longPressedRef.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressedRef.current = true;
      setSelectMode(true);
      setCheckedIds(new Set([sessionId]));
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    clearTimeout(longPressTimer.current);
  }, []);

  const handleToggleCheck = useCallback((id) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = (checked) => {
    if (checked) {
      setCheckedIds(new Set(sessions.map((s) => s.id)));
    } else {
      setCheckedIds(new Set());
    }
  };

  const handleCancelSelect = () => {
    setSelectMode(false);
    setCheckedIds(new Set());
  };

  const handleBulkDelete = () => {
    if (checkedIds.size === 0) return;
    // Prevent deleting the currently active (recording) session
    if (currentSessionId && checkedIds.has(currentSessionId)) {
      const next = new Set(checkedIds);
      next.delete(currentSessionId);
      setCheckedIds(next);
      if (next.size === 0) return;
    }
    setConfirmDelete("bulk");
  };

  const handleItemClick = async (sessionId) => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    if (selectMode) {
      handleToggleCheck(sessionId);
      return;
    }
    if (isListening) return;
    if (selectedSessionId === sessionId) {
      dispatch({ type: "DESELECT_SESSION" });
      return;
    }
    try {
      const data = await fetchSession(sessionId);
      dispatch({
        type: "SELECT_SESSION",
        payload: { sessionId, sessionData: data, utterances: data.utterances || [] },
      });
    } catch {
      // ignore
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const idsToDelete = confirmDelete === "bulk"
      ? [...checkedIds].filter((id) => id !== currentSessionId)
      : confirmDelete !== currentSessionId ? [confirmDelete] : [];

    // Close dialog & exit select mode immediately
    setConfirmDelete(null);
    setSelectMode(false);
    setCheckedIds(new Set());

    if (idsToDelete.length === 0) return;

    // Delete from server
    try {
      await Promise.all(idsToDelete.map((id) => deleteSession(id)));
    } catch {
      // ignore
    }

    // Clear live tab if not currently recording
    if (!isListening) {
      dispatch({ type: "CLEAR_TRANSCRIPT" });
      dispatch({ type: "DESELECT_SESSION" });
    } else if (selectedSessionId) {
      dispatch({ type: "DESELECT_SESSION" });
    }

    // Trigger session list refresh globally
    dispatch({ type: "REFRESH_SESSION_LIST" });
  };

  const contentVisible = !collapsed;

  return (
    <div
      className="flex flex-col shrink-0 border-r border-gray-200/50 dark:border-indigo-500/10 overflow-hidden"
      style={{
        width: collapsed ? 40 : 256,
        paddingRight: collapsed ? 0 : 12,
        marginRight: 12,
        transition: "width 300ms cubic-bezier(0.4, 0, 0.2, 1), padding-right 300ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Header — matches Header.jsx (pb-3 border-b, no top padding) */}
      <div className="flex items-center gap-2 pb-3 border-b border-gray-200/60 dark:border-indigo-500/10 px-1">
        <button
          className="shrink-0 bg-transparent border-none cursor-pointer text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-all duration-200 p-1.5 rounded-lg hover:bg-gray-100/60 dark:hover:bg-white/5 hover:scale-110 active:scale-95"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? t("showSessions") : t("hideSessions")}
        >
          {collapsed ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <polyline points="14 9 17 12 14 15" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <polyline points="16 9 13 12 16 15" />
            </svg>
          )}
        </button>
        <span
          className="font-semibold text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap"
          style={{
            opacity: contentVisible ? 1 : 0,
            transition: "opacity 200ms ease",
            pointerEvents: contentVisible ? "auto" : "none",
          }}
        >
          {t("sessions")}
        </span>

        {contentVisible && !isListening && (
          <button
            className={`ml-auto p-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
              selectMode 
                ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" 
                : "text-gray-400 dark:text-gray-600 hover:bg-gray-100/60 dark:hover:bg-white/5 hover:text-indigo-500"
            }`}
            onClick={() => {
              if (selectMode) handleCancelSelect();
              else setSelectMode(true);
            }}
            title={selectMode ? t("cancel") : t("edit")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        )}
      </div>

      {/* Select mode toolbar */}
      {selectMode && (
        <div
          className="flex items-center gap-2 px-1.5 py-2 mt-1 mb-2 bg-indigo-50/50 dark:bg-indigo-500/5 rounded-xl border border-indigo-500/10"
          style={{
            opacity: contentVisible ? 1 : 0,
            pointerEvents: contentVisible ? "auto" : "none",
            transition: "opacity 150ms ease",
          }}
        >
          <label className="flex items-center gap-1.5 text-[0.7rem] font-bold text-gray-500 hover:text-indigo-500 transition-colors cursor-pointer">
            <input
              type="checkbox"
              className="accent-indigo-500 w-3.5 h-3.5"
              checked={checkedIds.size === sessions.length && sessions.length > 0}
              onChange={(e) => handleSelectAll(e.target.checked)}
            />
            {checkedIds.size > 0 ? `${checkedIds.size} ${t("selected") || "Selected"}` : t("all")}
          </label>
          
          <div className="ml-auto flex gap-1">
            <button
              className="bg-rose-500 hover:bg-rose-600 text-white border-none px-2.5 py-1 rounded-lg cursor-pointer text-[0.68rem] font-bold shadow-sm transition-all disabled:opacity-30 disabled:grayscale active:scale-95"
              disabled={checkedIds.size === 0}
              onClick={handleBulkDelete}
            >
              {t("delete")}
            </button>
            <button
              className="bg-white dark:bg-white/10 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/5 px-2.5 py-1 rounded-lg cursor-pointer text-[0.68rem] font-bold transition-all hover:bg-gray-50 dark:hover:bg-white/15 active:scale-95"
              onClick={handleCancelSelect}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Session list */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          opacity: contentVisible ? 1 : 0,
          pointerEvents: contentVisible ? "auto" : "none",
          transition: "opacity 200ms ease",
        }}
      >
        {sessions.length === 0 ? (
          <div className="text-gray-300 dark:text-gray-700 text-center py-10 text-xs">
            {t("noSessions")}
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              onMouseDown={() => handleLongPress(s.id)}
              onMouseUp={handleLongPressEnd}
              onMouseLeave={handleLongPressEnd}
              onTouchStart={() => handleLongPress(s.id)}
              onTouchEnd={handleLongPressEnd}
              onTouchCancel={handleLongPressEnd}
            >
              <SidebarItem
                session={s}
                isActive={currentSessionId === s.id}
                isSelected={selectedSessionId === s.id}
                disabled={isListening && currentSessionId !== s.id}
                selectMode={selectMode}
                checked={checkedIds.has(s.id)}
                onToggleCheck={handleToggleCheck}
                onClick={() => handleItemClick(s.id)}
                onRename={(session) => setRenameModal(session)}
              />
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title={confirmDelete === "bulk" ? t("deleteSessions") : t("deleteSession")}
        message={confirmDelete === "bulk"
          ? t("deleteSessionsConfirm", { count: checkedIds.size })
          : t("deleteSessionConfirm")}
        confirmLabel={t("delete")}
        confirmColor="red"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />

      <PromptDialog
        open={!!renameModal}
        title={t("rename")}
        defaultValue={renameModal?.title || ""}
        onCancel={() => setRenameModal(null)}
        onConfirm={async (newName) => {
          if (renameModal && newName !== renameModal.title) {
            try {
              await renameSession(renameModal.id, newName);
              dispatch({ type: "REFRESH_SESSION_LIST" });
              if (selectedSessionId === renameModal.id) {
                // Update active title if we're renaming the open session
                const data = await fetchSession(renameModal.id);
                dispatch({
                  type: "SELECT_SESSION",
                  payload: { sessionId: renameModal.id, sessionData: data, utterances: data.utterances || [] },
                });
              }
            } catch {
              // ignore
            }
          }
          setRenameModal(null);
        }}
      />
    </div>
  );
}
