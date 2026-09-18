import fs from 'node:fs';
import path from 'node:path';
import axios from 'axios';
import { and, eq } from 'drizzle-orm';
import db from '../config/database.js';
import { audioAssets } from '../db/schema.js';
import { config } from '../config/env.js';

const AUDIO_DIR = path.resolve(process.cwd(), 'public', 'audio');

// Narrator persona -> ElevenLabs premade voice_id. This account's API key
// can only synthesize with voices in its own "My Voices" list (ElevenLabs
// blocks free-tier API access to the wider shared voice library with a 402
// "paid_plan_required" error) - confirmed by probing the standard premade
// IDs directly. Only Bella and Antoni are usable on this key; Rachel, Domi,
// Elli, Josh, and Sam all 402. Meera reuses Bella's voice_id with different
// delivery settings below so it isn't byte-identical to Aria.
const PERSONA_VOICE_IDS = {
  Aria: 'EXAVITQu4vr4xnSDxMaL', // Bella - warm female voice
  Kai: 'ErXwobaYiN019PkySvjV', // Antoni - focused male voice
  Meera: 'EXAVITQu4vr4xnSDxMaL', // Bella again (see note above), different settings
};

// Per-persona delivery character - stability lower = more expressive/varied,
// higher = more even and consistent. Gives Meera a distinct delivery even
// though it shares Aria's underlying voice_id.
const PERSONA_VOICE_SETTINGS = {
  Aria: { stability: 0.55, similarity_boost: 0.75 },
  Kai: { stability: 0.65, similarity_boost: 0.8 },
  Meera: { stability: 0.3, similarity_boost: 0.7, style: 0.4 },
};

function resolveElevenLabsVoiceId(voiceName) {
  return PERSONA_VOICE_IDS[voiceName] || PERSONA_VOICE_IDS.Aria;
}

function resolveVoiceSettings(voiceName) {
  return PERSONA_VOICE_SETTINGS[voiceName] || PERSONA_VOICE_SETTINGS.Aria;
}

/**
 * Rough spoken-duration estimate (seconds) from script text, since the raw
 * TTS response is just audio bytes with no duration metadata attached.
 */
function estimateSpokenDuration(text) {
  const wordCount = (text || '').trim().split(/\s+/).filter(Boolean).length;
  if (!wordCount) return 60;
  return Math.max(15, Math.round((wordCount / 140) * 60));
}

/**
 * TTS provider adapters. Each takes (script, language, voiceName) and
 * resolves to { audioUrl, duration } or null.
 */
const providers = {
  /**
   * ElevenLabs text-to-speech. Uses the multilingual model so Hindi script
   * is pronounced correctly (not read as English phonetics), matching the
   * "sounds like an Indian presenter, not an English speaker reading Hindi"
   * requirement.
   */
  elevenlabs: async (script, language, voiceName) => {
    const voiceId = await resolveElevenLabsVoiceId(voiceName);
    if (!voiceId) return null;

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        text: script,
        model_id: 'eleven_multilingual_v2',
        voice_settings: resolveVoiceSettings(voiceName),
      },
      {
        headers: {
          'xi-api-key': config.TTS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        responseType: 'arraybuffer',
        timeout: 30000,
      }
    );

    fs.mkdirSync(AUDIO_DIR, { recursive: true });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
    fs.writeFileSync(path.join(AUDIO_DIR, filename), response.data);

    return {
      audioUrl: `${config.BACKEND_URL}/audio/${filename}`,
      duration: estimateSpokenDuration(script),
    };
  },

  google: async (_script, _language, _voiceName) => {
    // TODO: call Google Cloud Text-to-Speech (voice name e.g. "hi-IN-Wavenet-A")
    // using config.TTS_API_KEY, store the audio, and return { audioUrl, duration }.
    return null;
  },

  azure: async (_script, _language, _voiceName) => {
    // TODO: call Azure Cognitive Services Speech using config.TTS_API_KEY,
    // store the audio, and return { audioUrl, duration }.
    return null;
  },
};

export class AudioService {
  /**
   * Cache-first audio lookup for one article/language/voice combination.
   * Returns null (never throws) when no provider is configured or
   * generation fails - callers/the frontend treat that as "use the browser's
   * SpeechSynthesis fallback instead", which is an explicitly supported path.
   */
  async getOrGenerateAudio(article, language, voice) {
    const lang = language === 'hi' ? 'hi' : 'en';
    const voiceName = voice || 'Aria';

    const cached = await db.query.audioAssets.findFirst({
      where: and(eq(audioAssets.articleId, article.id), eq(audioAssets.language, lang), eq(audioAssets.voice, voiceName)),
    });
    if (cached) {
      return { audioUrl: cached.audioUrl, duration: cached.duration, cached: true };
    }

    const script = article.summary || article.description || article.title;
    const generated = await this.generateAudio(script, lang, voiceName);
    if (!generated) return null;

    const [asset] = await db
      .insert(audioAssets)
      .values({
        articleId: article.id,
        language: lang,
        voice: voiceName,
        audioUrl: generated.audioUrl,
        duration: generated.duration,
      })
      .returning();
    return { audioUrl: asset.audioUrl, duration: asset.duration, cached: false };
  }

  /**
   * Call the configured TTS provider. Never throws - a provider failure is
   * treated the same as "no provider configured".
   */
  async generateAudio(script, language, voice) {
    if (!config.TTS_PROVIDER || !config.TTS_API_KEY) return null;

    const provider = providers[config.TTS_PROVIDER];
    if (!provider) {
      console.warn(`Unknown TTS_PROVIDER "${config.TTS_PROVIDER}" - falling back to no audio`);
      return null;
    }

    try {
      return await provider(script, language, voice);
    } catch (error) {
      const detail = error.response?.data
        ? Buffer.isBuffer(error.response.data)
          ? error.response.data.toString('utf-8')
          : JSON.stringify(error.response.data)
        : error.message;
      console.warn('TTS generation failed, frontend will fall back to SpeechSynthesis:', detail);
      return null;
    }
  }

  /**
   * Get audio URL for an article (legacy helper for GET /news/:id) - the
   * article's own default audioUrl if a provider set one, else null.
   */
  async getArticleAudio(article) {
    return article.audioUrl || null;
  }
}

export default new AudioService();
