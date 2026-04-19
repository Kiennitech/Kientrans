// Theme
const themeToggle = document.getElementById("themeToggle");
const savedTheme = localStorage.getItem("theme") || "dark";
document.documentElement.setAttribute("data-theme", savedTheme);
themeToggle.textContent = savedTheme === "dark" ? "☀️" : "🌙";

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("theme", next);
  themeToggle.textContent = next === "dark" ? "☀️" : "🌙";
});

const socket = io();

// State
let isListening = false;
let isPaused = false;
let currentSessionId = null;

// DOM Elements
const statusBar = document.getElementById("statusBar");
const toggleBtn = document.getElementById("toggleBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const newSessionBtn = document.getElementById("newSessionBtn");
const transcript = document.getElementById("transcript");
const partial = document.getElementById("partial");

// Tabs
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach((c) => c.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");

    if (tab.dataset.tab === "history") loadHistory();
    if (tab.dataset.tab === "settings") loadSettingsForm();
  });
});

// Controls — disable buttons while waiting for server response
let pendingAction = false;

function setLoading(btn, loading) {
  pendingAction = loading;
  [toggleBtn, pauseBtn, resumeBtn, newSessionBtn].forEach((b) => {
    b.disabled = loading;
  });
  if (loading) btn.classList.add("loading");
  else [toggleBtn, pauseBtn, resumeBtn, newSessionBtn].forEach((b) => b.classList.remove("loading"));
}

toggleBtn.addEventListener("click", () => {
  if (pendingAction) return;
  setLoading(toggleBtn, true);
  if (isListening) {
    socket.emit("stop-listening");
  } else {
    socket.emit("start-listening");
  }
});

pauseBtn.addEventListener("click", () => {
  if (pendingAction) return;
  setLoading(pauseBtn, true);
  socket.emit("pause-listening");
});

resumeBtn.addEventListener("click", () => {
  if (pendingAction) return;
  setLoading(resumeBtn, true);
  socket.emit("resume-listening");
});

newSessionBtn.addEventListener("click", () => {
  if (pendingAction) return;
  setLoading(newSessionBtn, true);
  socket.emit("stop-listening");
  transcript.innerHTML = "";
  partial.textContent = "";
  speakerColorMap.clear();
  setTimeout(() => socket.emit("start-listening"), 200);
});

// Socket events
function updateControls() {
  if (!isListening) {
    // Stopped
    toggleBtn.style.display = "";
    toggleBtn.textContent = "▶ Start";
    toggleBtn.className = "btn-start";
    pauseBtn.style.display = "none";
    resumeBtn.style.display = "none";
    newSessionBtn.style.display = "none";
  } else if (isPaused) {
    // Paused
    toggleBtn.style.display = "";
    toggleBtn.textContent = "⏹ Stop";
    toggleBtn.className = "btn-stop";
    pauseBtn.style.display = "none";
    resumeBtn.style.display = "";
    newSessionBtn.style.display = "";
  } else {
    // Listening
    toggleBtn.style.display = "";
    toggleBtn.textContent = "⏹ Stop";
    toggleBtn.className = "btn-stop";
    pauseBtn.style.display = "";
    resumeBtn.style.display = "none";
    newSessionBtn.style.display = "none";
  }
}

socket.on("status", (data) => {
  setLoading(toggleBtn, false);
  isListening = data.listening;
  isPaused = data.paused || false;

  if (isListening && !isPaused) {
    currentSessionId = data.sessionId;
    statusBar.textContent = `Listening (${data.audioSource})`;
    statusBar.className = "status-bar listening";
    if (!document.querySelector(".utterance")) {
      transcript.innerHTML = "";
    }
    partial.textContent = "";
  } else if (isListening && isPaused) {
    statusBar.textContent = "Paused";
    statusBar.className = "status-bar paused";
    partial.textContent = "";
  } else {
    statusBar.textContent = "Stopped";
    statusBar.className = "status-bar";
    partial.textContent = "";
    currentSessionId = null;
  }

  updateControls();
});

socket.on("utterance", (data) => {
  const el = document.createElement("div");
  const speakerIdx = getSpeakerIndex(data.speaker);
  el.className = `utterance speaker-${speakerIdx}`;

  const sourceLabel = data.source && data.source !== "mic"
    ? `<span class="source-label">${data.source.toUpperCase()}</span>`
    : "";

  const speaker = data.speaker ? `Speaker ${getSpeakerIndex(data.speaker) + 1}` : "Speaker";
  const lang = data.originalLanguage
    ? `<span class="lang-badge">${data.originalLanguage}</span>`
    : "";
  const time = new Date(data.timestamp).toLocaleTimeString("en-US");

  el.innerHTML = `
    <div class="utterance-header">
      <span class="speaker">${speaker}</span>${lang} ${sourceLabel}
      <span class="time">${time}</span>
    </div>
    <div class="utterance-original">${escapeHtml(data.originalText)}</div>
    ${data.translatedText
      ? `<div class="utterance-translation">${escapeHtml(data.translatedText)}</div>`
      : ""}
  `;

  transcript.appendChild(el);
  transcript.scrollTop = transcript.scrollHeight;

  // Clear partial
  partial.textContent = "";
});

socket.on("partial-result", (data) => {
  let text = "";
  if (data.originalText) text += data.originalText;
  if (data.translatedText) text += ` → ${data.translatedText}`;
  partial.textContent = text;
});

socket.on("error", (data) => {
  setLoading(toggleBtn, false);
  statusBar.textContent = data.message;
  statusBar.className = "status-bar error";
  console.error("Server error:", data.message);
});

socket.on("connect", () => {
  if (!isListening) {
    statusBar.textContent = "Connected";
    statusBar.className = "status-bar";
  }
});

socket.on("disconnect", () => {
  statusBar.textContent = "Disconnected";
  statusBar.className = "status-bar error";
  isListening = false;
  isPaused = false;
  updateControls();
});

// History
let selectMode = false;

function setSelectMode(on) {
  selectMode = on;
  document.getElementById("historyToolbar").style.display = on ? "flex" : "none";
  document.querySelectorAll(".session-checkbox").forEach((cb) => {
    cb.style.display = on ? "inline-block" : "none";
    if (!on) cb.checked = false;
  });
  document.getElementById("selectAll").checked = false;
  updateSelectedCount();
}

function updateSelectedCount() {
  const checked = document.querySelectorAll(".session-checkbox:checked").length;
  document.getElementById("selectedCount").textContent = checked > 0 ? `${checked} selected` : "";
  document.getElementById("deleteSelectedBtn").disabled = checked === 0;
}

async function loadHistory() {
  const list = document.getElementById("historyList");
  const detail = document.getElementById("sessionDetail");
  list.style.display = "block";
  detail.style.display = "none";
  setSelectMode(false);

  try {
    const res = await fetch("/api/sessions");
    const sessions = await res.json();

    if (sessions.length === 0) {
      list.innerHTML = '<div class="placeholder">No history yet</div>';
      return;
    }

    const sourceLabels = { mic: "Mic", system: "System", both: "Mic + System" };
    const langLabels = { vi: "VI", en: "EN", ja: "JA", ko: "KO", zh: "ZH", fr: "FR", es: "ES", de: "DE" };

    list.innerHTML = sessions.map((s) => {
      const startDate = new Date(s.started_at + "Z");
      const date = startDate.toLocaleString("en-US");
      const title = s.title || date;
      const source = sourceLabels[s.audio_source] || s.audio_source;
      const lang = langLabels[s.target_language] || s.target_language;

      // Duration
      let duration = "";
      if (s.ended_at) {
        const diffMs = new Date(s.ended_at + "Z") - startDate;
        const mins = Math.floor(diffMs / 60000);
        const secs = Math.floor((diffMs % 60000) / 1000);
        duration = mins > 0 ? `${mins}m${secs}s` : `${secs}s`;
      }

      return `
        <div class="session-item" data-id="${s.id}">
          <input type="checkbox" class="session-checkbox" data-id="${s.id}" style="display:none" />
          <div class="session-item-content">
            <div class="session-title">${escapeHtml(title)}</div>
            <div class="session-meta">
              <span>${date}</span>
              ${duration ? `<span class="meta-tag">⏱ ${duration}</span>` : ""}
              <span class="meta-tag">${source}</span>
              <span class="meta-tag">→ ${lang}</span>
              ${s.utterance_count ? `<span class="meta-tag">💬 ${s.utterance_count}</span>` : ""}
              ${s.speaker_count ? `<span class="meta-tag">👤 ${s.speaker_count}</span>` : ""}
            </div>
          </div>
        </div>
      `;
    }).join("");

    // Click → view detail; long press → select mode
    list.querySelectorAll(".session-item").forEach((item) => {
      let timer;
      let longPressed = false;
      item.addEventListener("mousedown", () => {
        longPressed = false;
        timer = setTimeout(() => {
          longPressed = true;
          setSelectMode(true);
          const cb = item.querySelector(".session-checkbox");
          cb.checked = true;
          updateSelectedCount();
        }, 500);
      });
      item.addEventListener("mouseup", () => clearTimeout(timer));
      item.addEventListener("mouseleave", () => clearTimeout(timer));

      item.addEventListener("click", (e) => {
        if (e.target.classList.contains("session-checkbox")) return;
        if (longPressed) {
          longPressed = false;
          return;
        }
        if (selectMode) {
          const cb = item.querySelector(".session-checkbox");
          cb.checked = !cb.checked;
          updateSelectedCount();
        } else {
          loadSessionDetail(item.dataset.id);
        }
      });
    });

    list.querySelectorAll(".session-checkbox").forEach((cb) => {
      cb.addEventListener("change", updateSelectedCount);
    });
  } catch {
    list.innerHTML = '<div class="placeholder">Failed to load history</div>';
  }
}

document.getElementById("selectAll").addEventListener("change", (e) => {
  document.querySelectorAll(".session-checkbox").forEach((cb) => {
    cb.checked = e.target.checked;
  });
  updateSelectedCount();
});

document.getElementById("cancelSelectBtn").addEventListener("click", () => {
  setSelectMode(false);
});

document.getElementById("deleteSelectedBtn").addEventListener("click", async () => {
  const ids = [...document.querySelectorAll(".session-checkbox:checked")].map((cb) => cb.dataset.id);
  if (ids.length === 0) return;
  if (!confirm(`Delete ${ids.length} session(s)?`)) return;

  await Promise.all(ids.map((id) => fetch(`/api/sessions/${id}`, { method: "DELETE" })));
  loadHistory();
});

async function loadSessionDetail(id) {
  const list = document.getElementById("historyList");
  const detail = document.getElementById("sessionDetail");
  list.style.display = "none";
  detail.style.display = "flex";

  try {
    const res = await fetch(`/api/sessions/${id}`);
    const data = await res.json();

    const startDate = new Date(data.started_at + "Z");
    const endDate = data.ended_at ? new Date(data.ended_at + "Z") : null;
    const title = data.title || startDate.toLocaleString("en-US");
    const utts = data.utterances || [];

    // Duration
    let durationText = "In progress";
    if (endDate) {
      const diffMs = endDate - startDate;
      const mins = Math.floor(diffMs / 60000);
      const secs = Math.floor((diffMs % 60000) / 1000);
      durationText = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }

    // Source label
    const sourceLabels = { mic: "Microphone", system: "System Audio", both: "Mic + System" };
    const sourceText = sourceLabels[data.audio_source] || data.audio_source;

    // Language label
    const langLabels = { vi: "Tiếng Việt", en: "English", ja: "日本語", ko: "한국어", zh: "中文", fr: "Français", es: "Español", de: "Deutsch" };
    const langText = langLabels[data.target_language] || data.target_language;

    // Speaker aliases & unique speakers
    const aliases = data.speakerAliases || {};
    const speakers = [...new Set(utts.map((u) => u.speaker).filter(Boolean))];
    const speakerName = (s) => aliases[s] || `Speaker ${speakers.indexOf(s) + 1}`;

    document.getElementById("sessionInfo").innerHTML = `
      <div class="session-title-row">
        <span class="session-title-text" id="sessionTitle">${escapeHtml(title)}</span>
        <button class="btn-rename" id="renameBtn" data-id="${id}">🖊️</button>
      </div>
      <div class="session-stats">
        <div class="stat-item"><span class="stat-label">Started</span><span class="stat-value">${startDate.toLocaleString("en-US")}</span></div>
        <div class="stat-item"><span class="stat-label">Duration</span><span class="stat-value">${durationText}</span></div>
        <div class="stat-item"><span class="stat-label">Source</span><span class="stat-value">${sourceText}</span></div>
        <div class="stat-item"><span class="stat-label">Target</span><span class="stat-value">${langText}</span></div>
        <div class="stat-item"><span class="stat-label">Utterances</span><span class="stat-value">${utts.length}</span></div>
        <div class="stat-item"><span class="stat-label">Speakers</span><span class="stat-value">${speakers.length || "—"}</span></div>
      </div>
      ${speakers.length > 0 ? `
        <div class="speaker-list">
          <div class="speaker-list-title">Speakers</div>
          ${speakers.map((s) => {
            const idx = getSpeakerIndex(s);
            return `
              <div class="speaker-row speaker-${idx}">
                <span class="speaker-color-dot"></span>
                <span class="speaker-label">${escapeHtml(speakerName(s))}</span>
                <button class="btn-rename-speaker" data-speaker="${escapeHtml(s)}">🖊️</button>
              </div>
            `;
          }).join("")}
        </div>
      ` : ""}
    `;

    document.getElementById("renameBtn").addEventListener("click", async () => {
      const newTitle = prompt("Rename session:", title);
      if (newTitle != null && newTitle !== title) {
        await fetch(`/api/sessions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });
        loadSessionDetail(id);
      }
    });

    document.querySelectorAll(".btn-rename-speaker").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const speaker = btn.dataset.speaker;
        const current = aliases[speaker] || `Speaker ${speakers.indexOf(speaker) + 1}`;
        const newName = prompt(`Rename ${current}:`, current);
        if (newName && newName !== current) {
          await fetch(`/api/sessions/${id}/speakers/${encodeURIComponent(speaker)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ alias: newName }),
          });
          loadSessionDetail(id);
        }
      });
    });

    document.getElementById("sessionUtterances").innerHTML = utts.length === 0
      ? '<div class="placeholder">No content</div>'
      : utts.map((u) => {
        const idx = getSpeakerIndex(u.speaker);
        const time = new Date(u.timestamp + "Z").toLocaleTimeString("en-US");
        const name = u.speaker ? speakerName(u.speaker) : "Speaker";
        return `
          <div class="utterance speaker-${idx}">
            <div class="utterance-header">
              <span class="speaker">${escapeHtml(name)}</span>
              ${u.original_language ? `<span class="lang-badge">${u.original_language}</span>` : ""}
              ${u.source && u.source !== "mic" ? `<span class="source-label">${u.source.toUpperCase()}</span>` : ""}
              <span class="time">${time}</span>
            </div>
            <div class="utterance-original">${escapeHtml(u.original_text)}</div>
            ${u.translated_text
              ? `<div class="utterance-translation">${escapeHtml(u.translated_text)}</div>`
              : ""}
          </div>
        `;
      }).join("");

    // Export button
    document.getElementById("exportBtn").onclick = () => {
      window.open(`/api/sessions/${id}/export`, "_blank");
    };
  } catch {
    document.getElementById("sessionInfo").textContent = "Failed to load session";
  }
}

document.getElementById("backBtn").addEventListener("click", () => loadHistory());

// Settings tab
async function loadSettingsForm() {
  try {
    const [settingsRes, devicesRes] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/devices"),
    ]);
    const settings = await settingsRes.json();
    const devices = await devicesRes.json();

    document.getElementById("settingAudioSource").value = settings.audioSource || "mic";
    document.getElementById("settingTargetLanguage").value = settings.targetLanguage || "vi";

    // Populate mic device select (input devices)
    const micSel = document.getElementById("settingMicDevice");
    micSel.innerHTML = '<option value="">-- None --</option>';
    for (const d of devices.input) {
      const opt = document.createElement("option");
      opt.value = d.index;
      opt.textContent = `[${d.index}] ${d.name}`;
      micSel.appendChild(opt);
    }

    if (settings.micDeviceIndex != null) {
      micSel.value = settings.micDeviceIndex;
    }
  } catch {
    // Use defaults
  }
}

document.getElementById("saveSettingsBtn").addEventListener("click", async () => {
  const body = {
    audioSource: document.getElementById("settingAudioSource").value,
    targetLanguage: document.getElementById("settingTargetLanguage").value,
    micDeviceIndex: document.getElementById("settingMicDevice").value
      ? parseInt(document.getElementById("settingMicDevice").value)
      : null,
  };

  try {
    await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const status = document.getElementById("saveStatus");
    status.textContent = "Saved!";
    setTimeout(() => (status.textContent = ""), 2000);
  } catch {
    document.getElementById("saveStatus").textContent = "Failed to save settings";
  }
});

// Helpers
const speakerColorMap = new Map();

function getSpeakerIndex(speaker) {
  const key = speaker || "default";
  if (!speakerColorMap.has(key)) {
    speakerColorMap.set(key, speakerColorMap.size % 8);
  }
  return speakerColorMap.get(key);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Init
(async () => {
  statusBar.textContent = "Connecting...";
})();
