const LANG_NAMES = {
  vi: "Vietnamese", en: "English", ja: "Japanese", ko: "Korean",
  zh: "Chinese", fr: "French", es: "Spanish", de: "German",
  pt: "Portuguese", ru: "Russian", ar: "Arabic", hi: "Hindi",
  th: "Thai", id: "Indonesian", ms: "Malay", tl: "Filipino",
  it: "Italian", nl: "Dutch", pl: "Polish", tr: "Turkish",
  uk: "Ukrainian", cs: "Czech", sv: "Swedish", da: "Danish",
  fi: "Finnish", no: "Norwegian", el: "Greek", he: "Hebrew",
  ro: "Romanian", hu: "Hungarian", bg: "Bulgarian",
};

export async function lookupText(text, settings) {
  const { geminiApiKey, localTranslationEngine, ollamaBaseUrl, ollamaModel } = settings;
  
  let engine = localTranslationEngine;
  if (!engine || engine === "none" || engine === "soniox") {
    engine = ollamaModel ? "ollama" : "gemini";
  }

  const promptText = `[ROLE]: You are a Senior IT Expert and Tech Architect.
[TASK]: Explain the following IT term or phrase in Vietnamese for a Bridge Software Engineer (BrSE).
[STYLE]:
- Provide a concise but deep technical definition.
- If it's a specific technology (Java, SQL, Cloud), mention its use case.
- Use professional Vietnamese technical language.
- Keep it under 100 words.
[CONSTRAINT]: Reply with ONLY the explanation.

[TERM TO EXPLAIN]:\n${text}`;

  try {
    if (engine === "ollama") {
      const res = await fetch(`${ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: promptText,
          stream: false,
        }),
      });
      const data = await res.json();
      return { translated: (data.response || "").trim(), lang: "vi" };
    } else {
      if (!geminiApiKey) return { translated: "Missing Gemini API Key", lang: "" };
      const cleanKey = geminiApiKey.trim();
      const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${cleanKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: { temperature: 0.1 },
        }),
      });

      const data = await res.json();
      const explanation = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "No explanation found.";
      return { translated: explanation, lang: "vi" };
    }
  } catch (err) {
    return { translated: `Lookup Error: ${err.message}`, lang: "" };
  }
}


/**
 * Translate text using a local translation service (Ollama or LibreTranslate).
 * Returns { translated, lang } — translated is empty string on failure or when disabled.
 */
import { createLogger } from "../logger.js";
const log = createLogger("translate");

export async function translateText(text, sourceLang, settings) {
  const { localTranslationEngine, ollamaBaseUrl, ollamaModel, libreTranslateUrl, targetLanguage, context, geminiApiKey } = settings;

  if (!text || !localTranslationEngine || localTranslationEngine === "none") {
    return { translated: "", lang: null };
  }

  const targetLangName = LANG_NAMES[targetLanguage] || targetLanguage;

  try {
    if (localTranslationEngine === "ollama") {
      const res = await fetch(`${ollamaBaseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: `[ROLE]: You are a world-class Bridge Software Engineer (BrSE).
[TASK]: Translate the following Japanese/English IT technical or business conversation into professional Vietnamese.
[TONE & STYLE]:
- Use professional IT terminology (e.g., "nghiệp vụ" for business logic, "đặc tả" for specification, "đối ứng" for handling/fixing, "hệ thống" for system).
- Maintain Japanese business nuances (Keigo/Politeness) where appropriate, but keep technical points clear and actionable for developers.
- Avoid literal word-by-word translation; focus on the "technical intent" and "project context".
- For ambiguous terms, provide the most likely IT context interpretation.
[CONSTRAINT]: Reply with ONLY the translation. No explanations.

${context ? `[PROJECT CONTEXT & PREVIOUS SPEECH]:\n${context}\n\n` : ""}[TEXT TO TRANSLATE]:\n${text}`,
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
      const data = await res.json();
      return { translated: (data.response || "").trim(), lang: targetLanguage };
    }

    if (localTranslationEngine === "libretranslate") {
      const res = await fetch(`${libreTranslateUrl}/translate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: text,
          source: sourceLang || "auto",
          target: targetLanguage,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`LibreTranslate HTTP ${res.status}`);
      const data = await res.json();
      return { translated: data.translatedText || "", lang: targetLanguage };
    }
    if (localTranslationEngine === "gemini") {
      if (!geminiApiKey) {
        log.error("Gemini API key is missing in settings");
        throw new Error("Gemini API key is missing");
      }
      const cleanKey = geminiApiKey.trim();
      log.info(`Attempting Gemini translation for text: "${text.slice(0, 50)}..." to ${targetLangName}`);
      
      let attempts = 0;
      let res;
      while (attempts < 2) {
        res = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${cleanKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `[ROLE]: You are a world-class Bridge Software Engineer (BrSE).
[TASK]: Translate the following Japanese/English IT technical or business conversation into professional Vietnamese.
[TONE & STYLE]:
- Use professional IT terminology (e.g., "nghiệp vụ" for business logic, "đặc tả" for specification, "đối ứng" for handling/fixing, "hệ thống" for system).
- Maintain Japanese business nuances (Keigo/Politeness) where appropriate, but keep technical points clear and actionable for developers.
- Avoid literal word-by-word translation; focus on the "technical intent" and "project context".
- For ambiguous terms, provide the most likely IT context interpretation.
[CONSTRAINT]: Reply with ONLY the translation. No explanations.

${context ? `[PROJECT CONTEXT & PREVIOUS SPEECH]:\n${context}\n\n` : ""}[TEXT TO TRANSLATE]:\n${text}`
              }]
            }],
            generationConfig: {
              temperature: 0.1,
            },
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
          }),
        });

        if (res.status === 429 || res.status >= 500) {
          attempts++;
          log.warn(`Gemini busy (HTTP ${res.status}), retrying in 2s... (Attempt ${attempts})`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        break;
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => "No error body");
        log.error(`Gemini API Error: HTTP ${res.status} - Body: ${errBody}`);
        throw new Error(`Gemini HTTP ${res.status}: ${errBody}`);
      }
      
      const data = await res.json();
      const translated = (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      
      if (!translated) {
        log.warn("Gemini returned an empty translation part", { data: JSON.stringify(data) });
      } else {
        log.info("Gemini translation successful");
      }
      
      return { translated, lang: targetLanguage };
    }
  } catch (err) {
    // Translation failure is non-fatal — log and return empty
    log.warn(`${localTranslationEngine} error`, err);
  }

  return { translated: "", lang: null };
}
