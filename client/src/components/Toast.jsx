import { useEffect } from "react";
import { useSocket, useSocketActions } from "../context/SocketContext";
import { useI18n } from "../i18n/I18nContext";

const variants = {
  error:   "bg-rose-500 text-white",
  success: "bg-emerald-500 text-white",
  "":      "bg-gray-800 dark:bg-gray-700 text-white",
};

const icons = {
  error:   "⚠",
  success: "✓",
  "":      "ℹ",
};

function ToastItem({ toast }) {
  const { dispatch } = useSocketActions();
  const { t } = useI18n();

  const dismiss = () => dispatch({ type: "DISMISS_TOAST", payload: toast.id });

  useEffect(() => {
    const ms = toast.type === "error" ? 7000 : 3500;
    const timer = setTimeout(dismiss, ms);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  const text = toast.key ? t(toast.key, toast.params) : (toast.message || "");

  useEffect(() => {
    if (toast.type === "error") {
      console.error("[Toast Error]", text, toast.params || "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.id]);

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm w-full pointer-events-auto ${variants[toast.type] ?? variants[""]}`}
    >
      <span className="shrink-0 font-bold leading-snug">{icons[toast.type] ?? icons[""]}</span>
      <span className="flex-1 leading-snug break-words line-clamp-3" title={text}>{text}</span>
      <button
        onClick={dismiss}
        className="cursor-pointer shrink-0 opacity-70 hover:opacity-100 transition-opacity text-base leading-none mt-0.5"
      >
        ✕
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { state } = useSocket();
  if (!state.toasts?.length) return null;

  return (
    <div className="fixed bottom-5 right-5 z-[70] flex flex-col gap-2 items-end pointer-events-none">
      {state.toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
