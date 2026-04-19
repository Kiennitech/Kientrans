import { getSession, getUtterances, getSpeakerAliases } from "./history.js";

export function exportSessionToMarkdown(sessionId) {
  const session = getSession(sessionId);
  if (!session) return null;

  const utterances = getUtterances(sessionId);
  const aliases = Object.fromEntries(getSpeakerAliases(sessionId).map((a) => [a.speaker, a.alias]));
  const startTime = new Date(session.started_at + "Z");
  const endTime = session.ended_at ? new Date(session.ended_at + "Z") : null;

  let md = `# ${session.title || `Phiên dịch - ${formatDate(startTime)}`}\n\n`;
  md += `**Nguồn âm thanh**: ${sourceLabel(session.audio_source)}  \n`;
  md += `**Ngôn ngữ đích**: ${session.target_language}  \n`;

  if (endTime) {
    const durationMs = endTime - startTime;
    md += `**Thời lượng**: ${formatDuration(durationMs)}  \n`;
  }

  if (session.device_name) {
    md += `**Thiết bị**: ${session.device_name}  \n`;
  }

  md += `\n---\n\n## Nội dung\n\n`;
  const speakerIds = [...new Set(utterances.map(u => u.speaker).filter(Boolean))];

  for (const u of utterances) {
    const time = formatTime(new Date(u.timestamp + "Z"));
    const speaker = u.speaker ? (aliases[u.speaker] || `Speaker ${speakerIds.indexOf(u.speaker) + 1}`) : "Speaker";
    const lang = u.original_language ? ` (${u.original_language})` : "";

    md += `**[${time}] ${speaker}**${lang}:  \n`;
    md += `${u.original_text}  \n`;

    if (u.translated_text) {
      md += `> *${u.translated_text}*  \n`;
    }

    md += `\n`;
  }

  // SPEAKER STATISTICS SESSION
  const speakerCounts = {};
  utterances.forEach(u => {
    const sName = u.speaker ? (aliases[u.speaker] || `Speaker ${speakerIds.indexOf(u.speaker) + 1}`) : "Unknown";
    speakerCounts[sName] = (speakerCounts[sName] || 0) + 1;
  });

  const totalUtterances = utterances.length;
  md += `---\n\n## Thống kê diễn giả\n\n`;
  md += `| Diễn giả | Số câu thoại | Tỷ lệ |\n`;
  md += `| :--- | :---: | :---: |\n`;
  
  Object.entries(speakerCounts)
    .sort(([, a], [, b]) => b - a)
    .forEach(([name, count]) => {
      const percentage = ((count / totalUtterances) * 100).toFixed(1);
      md += `| **${name}** | ${count} | ${percentage}% |\n`;
    });

  md += `\n**Tổng cộng**: ${totalUtterances} câu thoại  \n`;

  md += `---\n\n*Xuất lúc ${formatDate(new Date()) || "vừa xong"}*\n`;

  return { markdown: md, session };
}

function sourceLabel(source) {
  switch (source) {
    case "mic": return "Microphone";
    case "system": return "System Audio";
    case "both": return "Mic + System";
    default: return source;
  }
}

function formatDate(d) {
  return d.toLocaleString("vi-VN", { dateStyle: "long", timeStyle: "short" });
}

function formatTime(d) {
  return d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes} phút`;
  return `${seconds} giây`;
}
