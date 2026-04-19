import { RealtimeUtteranceBuffer, SonioxNodeClient } from "@soniox/node";
import { PassThrough } from "stream";
import { createLogger } from "../logger.js";
import { translateText } from "../local/translate.js";

const log = createLogger("soniox");

export function createSession({ targetLanguage = "vi", languageHints = ["ja"], apiKey, context = null, localTranslationEngine = "none", geminiApiKey = null } = {}) {
  const clientOpts = apiKey ? { api_key: apiKey } : {};
  const client = new SonioxNodeClient(clientOpts);
  const config = {
    model: "stt-rt-v4",
    audio_format: "pcm_s16le",
    sample_rate: 16000,
    num_channels: 1,
    language_hints: languageHints,
    enable_language_identification: false,
    enable_speaker_diarization: true,
    enable_endpoint_detection: true,
  };

  if (localTranslationEngine === "soniox") {
    config.translation = {
      type: "one_way",
      target_language: targetLanguage,
    };
  }

  const slidingContext = [];
  const MAX_CONTEXT_LINES = 5;
  const IT_CONTEXT = "IT development, software engineering, meeting, scrum, sprint, database, api, frontend, backend, deployment, bug fixing, technical discussion.";
  const effectiveContext = context || IT_CONTEXT;
  const translationSettings = {
    localTranslationEngine: "none", targetLanguage, context: effectiveContext, geminiApiKey,
  };

  async function getTranslation(origText, origLang) {
    if (!origText || localTranslationEngine === "none" || localTranslationEngine === "soniox") {
      log.info(`Skipping translation: textLen=${origText?.length}, engine=${localTranslationEngine}`);
      return { translated: "", lang: null };
    }
    const dynamicContext = slidingContext.length > 0
      ? (context ? context + "\n\n" : "") + slidingContext.join("\n")
      : context;
    const currentSettings = { ...translationSettings, context: dynamicContext };
    log.info(`Calling translateText with engine=${localTranslationEngine}, targetLanguage=${targetLanguage}`);
    const result = await translateText(origText, origLang, currentSettings);
    log.info(`translateText returned: "${result.translated?.slice(0, 30)}..."`);
    return result;
  }

  let lastTranslation = "";

  if (effectiveContext) {
    config.context = { text: effectiveContext };
  }

  const session = client.realtime.stt(config);
  const buffer = new RealtimeUtteranceBuffer();
  const audioStream = new PassThrough();

  function parseUtterance(utterance) {
    const results = [];
    for (const segment of utterance.segments) {
      const isTranslation = segment.tokens[0]?.translation_status === "translation";
      results.push({
        speaker: segment.speaker || null,
        language: segment.language || null,
        text: segment.text.trimStart(),
        isTranslation,
      });
    }

    // Group original + translation pairs
    const originals = results.filter((r) => !r.isTranslation);
    const translations = results.filter((r) => r.isTranslation);

    return {
      originalText: originals.map((r) => r.text).join(" "),
      originalLanguage: originals[0]?.language || null,
      translatedText: translations.map((r) => r.text).join(" "),
      translationLanguage: translations[0]?.language || null,
      speaker: originals[0]?.speaker || translations[0]?.speaker || null,
      timestamp: new Date().toISOString(),
    };
  }

  return {
    session,
    buffer,
    audioStream,
    config,

    async connect() {
      log.info("Connecting to Soniox", { model: config.model, targetLanguage, languageHints });
      await session.connect();
      log.info("Soniox connected");
    },

    async startStreaming() {
      // sendStream will read from the PassThrough and send audio to Soniox
      // We don't set finish:true because the stream is continuous
      session.sendStream(audioStream, { pace_ms: 0 }).catch(() => {
        // Stream ended or error — handled by session error event
      });
    },

    sendAudio(chunk) {
      audioStream.write(chunk);
    },

    async stop() {
      audioStream.end();
      await session.finish();
    },

    onUtterance(callback) {
      let forceTranslateTimer = null;

      const handleUtterance = async (isFinal) => {
        const utterance = buffer.markEndpoint();
        if (!utterance && !isFinal) return;
        
        const parsed = utterance ? parseUtterance(utterance) : null;
        if (!parsed || !parsed.originalText || parsed.originalText.trim().length < 2) return;

        // 1. ALWAYS emit original text to UI immediately to keep it clean and real-time
        callback(parsed, isFinal);

        // 2. Perform 1:1 Translation in the background explicitly using 'isUpdate'
        if (localTranslationEngine && localTranslationEngine !== "soniox" && localTranslationEngine !== "none") {
          getTranslation(parsed.originalText, parsed.originalLanguage)
            .then(({ translated, lang }) => {
              if (translated) {
                slidingContext.push(`Speech: "${parsed.originalText}"\nTranslated: "${translated}"`);
                if (slidingContext.length > MAX_CONTEXT_LINES) slidingContext.shift();
                
                // Emit purely as an update targeting the exact same ID (timestamp)
                callback({
                  ...parsed,
                  isUpdate: true,
                  translatedText: translated,
                  translationLanguage: lang
                }, false);
              }
            })
            .catch(err => log.error("Background auto-translation fail", err));
        }
      };

      session.on("endpoint", async () => {
        if (forceTranslateTimer) clearTimeout(forceTranslateTimer);
        await handleUtterance(false);
      });

      session.on("finished", async () => {
        if (forceTranslateTimer) clearTimeout(forceTranslateTimer);
        await handleUtterance(true);
      });

      session.on("result", (result) => {
        const tokens = result.tokens || [];
        const currentText = tokens.map(t => t.text).join("");
        
        if (currentText && currentText.length > 5) {
          if (forceTranslateTimer) clearTimeout(forceTranslateTimer);
          
          forceTranslateTimer = setTimeout(() => {
            log.info("Force processing buffer due to long speech");
            handleUtterance(false);
          }, 20000);
        }
      });
    },

    onPartial(callback) {
      let finalOriginal = "";
      let finalTranslated = "";
      let speaker = null;

      session.on("result", (result) => {
        buffer.addResult(result);

        const tokens = result.tokens || [];
        if (tokens.length === 0) return;

        // Final tokens are incremental — accumulate them
        const finalTokens = tokens.filter((t) => t.is_final);
        const nonFinalTokens = tokens.filter((t) => !t.is_final);

        const finalOrig = finalTokens.filter((t) => t.translation_status !== "translation");
        const finalTrans = finalTokens.filter((t) => t.translation_status === "translation");

        finalOriginal += finalOrig.map((t) => t.text).join("");
        finalTranslated += finalTrans.map((t) => t.text).join("");

        // Non-final tokens may be re-sent/updated — use only the current result's
        const nonFinalOrig = nonFinalTokens.filter((t) => t.translation_status !== "translation");
        const nonFinalTrans = nonFinalTokens.filter((t) => t.translation_status === "translation");

        const s = tokens.find((t) => t.speaker)?.speaker;
        if (s) speaker = s;

        const origText = finalOriginal + nonFinalOrig.map((t) => t.text).join("");
        let transText = finalTranslated + nonFinalTrans.map((t) => t.text).join("");

        // Just output real-time original text, do NOT translate real-time anymore
        callback({
          originalText: origText,
          translatedText: transText, // Will be empty natively
          speaker,
        });
      });

      // Reset when utterance is finalized
      session.on("endpoint", () => {
        finalOriginal = "";
        finalTranslated = "";
        speaker = null;
      });
      session.on("finished", () => {
        finalOriginal = "";
        finalTranslated = "";
        speaker = null;
      });
    },

    onError(callback) {
      session.on("error", (err) => {
        log.error("Soniox session error", err);
        callback(err);
      });
    },
  };
}
