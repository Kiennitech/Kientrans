import { useState } from "react";
import { I18nProvider } from "./i18n/I18nContext";
import { SocketProvider, useSocket } from "./context/SocketContext";
import Header from "./components/Header";
import TabNav from "./components/TabNav";
import LiveTab from "./components/live/LiveTab";
import SettingsModal from "./components/settings/SettingsTab";
import Sidebar from "./components/Sidebar";
import OverlayWindow from "./components/live/OverlayWindow";
import ToastContainer from "./components/Toast";
import StartupCheck from "./components/StartupCheck";

function AppContent() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { state } = useSocket();

  return (
    <>
      <div className="flex h-screen max-w-7xl mx-auto px-5 py-4 bg-[#f0f2f8] dark:bg-[#06070b] text-gray-900 dark:text-gray-200 transition-colors duration-300">
        <Sidebar />
        <div className="flex flex-col flex-1 min-w-0">
          <Header />
          <TabNav onOpenSettings={() => setSettingsOpen(true)} />
          <div className="flex-1 overflow-hidden flex flex-col">
            <LiveTab />
          </div>
        </div>
      </div>
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {state.overlayVisible && !window.electronAPI?.isElectron && <OverlayWindow />}
      <ToastContainer />
      <StartupCheck />
    </>
  );
}

export default function App() {
  return (
    <I18nProvider>
    <SocketProvider>
      <AppContent />
    </SocketProvider>
    </I18nProvider>
  );
}
