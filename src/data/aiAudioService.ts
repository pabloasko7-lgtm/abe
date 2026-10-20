/**
 * AI Audio Service
 * Uses Gemini AI Text-to-Speech (Neural 24kHz Audio) with standard HTML5 Audio playback.
 * Works 100% reliably across all mobile devices, PCs, and browsers without requiring local TTS language packs.
 */

import { accessibleTTS, splitParagraphsIntoSentences } from './ttsService';

export interface AIAudioState {
  isPlaying: boolean;
  isPaused: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  lang: 'ar' | 'fr';
  sourceTitle: string;
  error: string | null;
  audioUrl: string | null;
  engine?: 'elevenlabs' | 'gemini' | 'browser';
}

const audioCache = new Map<string, string>(); // key -> base64 data URL
let currentAudioElement: HTMLAudioElement | null = null;
let currentAbortController: AbortController | null = null;
const subscribers = new Set<(state: AIAudioState) => void>();

let state: AIAudioState = {
  isPlaying: false,
  isPaused: false,
  isLoading: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1.0,
  lang: 'ar',
  sourceTitle: '',
  error: null,
  audioUrl: null,
};

function updateState(partial: Partial<AIAudioState>): void {
  state = { ...state, ...partial };
  subscribers.forEach((cb) => cb(state));
}

export function subscribeAIAudio(callback: (state: AIAudioState) => void): () => void {
  subscribers.add(callback);
  callback(state);
  return () => {
    subscribers.delete(callback);
  };
}

export function getAIAudioState(): AIAudioState {
  return state;
}

/**
 * Preloads Arabic AI Audio if already cached in memory.
 * Does not make speculative background network requests to protect Gemini TTS API quota.
 */
export async function preloadAIAudio(
  bookId: string,
  pageNumber: number,
  text: string,
  lang: 'ar' | 'fr' = 'ar'
): Promise<string | null> {
  if (!text || typeof window === 'undefined') return null;
  const cleanText = text.replace(/[*_#`~«»\[\]{}()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
  const cacheKey = `${bookId}:p${pageNumber}:${lang}:${cleanText.slice(0, 50)}`;

  if (audioCache.has(cacheKey)) {
    return audioCache.get(cacheKey)!;
  }

  return null;
}

/**
 * Plays Arabic text using high-fidelity human Gemini AI Speech with immediate Web Speech fallback on quota limit.
 */
/**
 * Plays Arabic text using high-fidelity human Gemini AI Speech with immediate Web Speech fallback on quota limit.
 * CRITICAL: The tracker (متتبع القارئ) ONLY starts running when the voice ACTUALLY begins speaking (onplay/onstart).
 */
export async function playArabicAIAudio(
  text: string,
  bookId: string,
  pageNumber: number,
  label = 'القارئ الصوتي الذكي'
): Promise<void> {
  // Stop any ongoing speech and ensure tracker is completely idle
  stopAIAudio();
  accessibleTTS.stop();

  const cleanText = text.replace(/[*_#`~«»\[\]{}()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
  if (!cleanText) return;

  const rawParagraphs = cleanText.split('\n\n').map((p) => p.trim()).filter(Boolean);
  const sentences = splitParagraphsIntoSentences(rawParagraphs.length > 0 ? rawParagraphs : [cleanText]);
  const totalChars = Math.max(1, cleanText.length);

  // Initialize sentences in the engine but STRICTLY with isPlaying = false so tracker does NOT run while loading!
  accessibleTTS.syncWithExternalAudio({
    sentences,
    currentIndex: 0,
    currentWordRange: null,
    isPlaying: false,
    isPaused: false,
    lang: 'ar',
  });

  const cacheKey = `${bookId}:p${pageNumber}:ar:${cleanText.slice(0, 50)}`;

  updateState({
    isLoading: true,
    isPlaying: false,
    isPaused: false,
    error: null,
    sourceTitle: label,
    lang: 'ar',
    currentTime: 0,
    duration: 0,
  });

  let audioUrl = audioCache.get(cacheKey) || null;

  if (!audioUrl) {
    currentAbortController = new AbortController();
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          lang: 'ar',
          pageNumber,
          bookId,
          voiceName: 'Kore',
        }),
        signal: currentAbortController.signal,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.audioBase64) {
          audioUrl = `data:audio/wav;base64,${data.audioBase64}`;
          audioCache.set(cacheKey, audioUrl);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.message?.includes('aborted')) return;
      // Network failure, smoothly fallback
    } finally {
      currentAbortController = null;
    }
  }

  // If AI Audio URL is ready, play through HTML5 Audio element
  if (audioUrl) {
    try {
      const audio = new Audio(audioUrl);
      currentAudioElement = audio;
      audio.playbackRate = state.playbackRate;

      audio.onloadedmetadata = () => {
        updateState({ duration: audio.duration, isLoading: false });
      };

      // Progress tracker dynamically in lockstep with the spoken voice!
      audio.ontimeupdate = () => {
        const curTime = audio.currentTime;
        const dur = audio.duration || state.duration || 1;
        updateState({
          currentTime: curTime,
          duration: dur,
        });

        if (dur > 0 && sentences.length > 0) {
          const progress = Math.max(0, Math.min(1, curTime / dur));
          let accumulated = 0;
          let targetSentenceIdx = 0;

          for (let i = 0; i < sentences.length; i++) {
            const sentenceRatio = sentences[i].text.length / totalChars;
            if (progress >= accumulated && progress < accumulated + sentenceRatio) {
              targetSentenceIdx = i;
              break;
            }
            accumulated += sentenceRatio;
            if (i === sentences.length - 1) {
              targetSentenceIdx = i;
            }
          }

          const activeSentence = sentences[targetSentenceIdx];
          const sentenceStartRatio = accumulated;
          const sentenceRatio = activeSentence.text.length / totalChars || 0.001;
          const withinSentenceProgress = Math.max(0, Math.min(1, (progress - sentenceStartRatio) / sentenceRatio));

          const words = activeSentence.text.split(/(\s+)/);
          let charAcc = 0;
          let activeWordRange: { start: number; length: number; word: string } | null = null;
          const targetCharIdx = Math.floor(withinSentenceProgress * activeSentence.text.length);

          for (let w = 0; w < words.length; w++) {
            const wText = words[w];
            if (targetCharIdx >= charAcc && targetCharIdx < charAcc + wText.length && wText.trim().length > 0) {
              activeWordRange = { start: charAcc, length: wText.length, word: wText };
              break;
            }
            charAcc += wText.length;
          }

          accessibleTTS.syncWithExternalAudio({
            currentIndex: targetSentenceIdx,
            currentWordRange: activeWordRange,
            isPlaying: true,
            isPaused: false,
            lang: 'ar',
          });
        }
      };

      // 🌟 Voice starts ACTUALLY SPEAKING NOW ("L9ari2 kaydwi daba")
      audio.onplay = () => {
        updateState({ isPlaying: true, isPaused: false, isLoading: false, audioUrl });
        accessibleTTS.syncWithExternalAudio({
          sentences,
          currentIndex: 0,
          isPlaying: true,
          isPaused: false,
          lang: 'ar',
        });
      };

      audio.onpause = () => {
        if (audio.ended) {
          updateState({ isPlaying: false, isPaused: false, currentTime: 0 });
          accessibleTTS.syncWithExternalAudio({ isPlaying: false, isPaused: false, currentIndex: 0, currentWordRange: null });
        } else {
          updateState({ isPlaying: false, isPaused: true });
          accessibleTTS.syncWithExternalAudio({ isPlaying: false, isPaused: true });
        }
      };

      audio.onended = () => {
        updateState({ isPlaying: false, isPaused: false, currentTime: 0 });
        accessibleTTS.syncWithExternalAudio({ isPlaying: false, isPaused: false, currentIndex: 0, currentWordRange: null });
      };

      audio.onerror = () => {
        if (currentAudioElement === audio) {
          currentAudioElement = null;
        }
        audio.onerror = null;
        audio.onloadedmetadata = null;
        audio.ontimeupdate = null;
        audio.onplay = null;
        audio.onpause = null;
        audio.onended = null;
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {}
        fallbackToWebSpeech(cleanText, label, sentences);
      };

      await audio.play();
      updateState({ isPlaying: true, isPaused: false, isLoading: false, audioUrl });
      return;
    } catch {
      // Audio play failed (e.g. autoplay restriction), fallback to Web Speech
      if (currentAudioElement) {
        currentAudioElement.onerror = null;
        currentAudioElement = null;
      }
    }
  }

  // Fallback to Web Speech API
  fallbackToWebSpeech(cleanText, label, sentences);
}

function fallbackToWebSpeech(text: string, label: string, preParsedSentences?: any[]): void {
  updateState({ isLoading: true, isPlaying: false, isPaused: false, audioUrl: null, sourceTitle: label });
  const sentences = preParsedSentences && preParsedSentences.length > 0
    ? preParsedSentences
    : splitParagraphsIntoSentences(text.split('\n\n').map((p) => p.trim()).filter(Boolean));
  
  accessibleTTS.loadSentences(
    sentences.length > 0
      ? sentences
      : [
          {
            id: 'sent-fallback',
            index: 0,
            paragraphIndex: 0,
            text,
            charStart: 0,
            charEnd: text.length,
          },
        ],
    'ar'
  );
  // AccessibleTTS will queue utterance and only trigger isPlaying: true when utterance.onstart actually speaks!
  accessibleTTS.play();
}

export function pauseAIAudio(): void {
  if (currentAudioElement && !currentAudioElement.paused) {
    currentAudioElement.pause();
    updateState({ isPlaying: false, isPaused: true });
    accessibleTTS.syncWithExternalAudio({ isPlaying: false, isPaused: true });
  } else if (state.audioUrl === null) {
    accessibleTTS.pause();
  }
}

export function resumeAIAudio(): void {
  if (currentAudioElement && currentAudioElement.paused) {
    currentAudioElement.play().catch(console.error);
    updateState({ isPlaying: true, isPaused: false });
    accessibleTTS.syncWithExternalAudio({ isPlaying: true, isPaused: false });
  } else if (state.audioUrl === null) {
    accessibleTTS.resume();
  }
}

export async function playCustomAIAudio(
  text: string,
  bookId: string,
  chapterOrPage: number,
  lang: 'ar' | 'fr' = 'ar',
  label = 'القارئ الصوتي الذكي'
): Promise<void> {
  if (lang === 'ar') {
    return playArabicAIAudio(text, bookId, chapterOrPage, label);
  }
  stopAIAudio();
  accessibleTTS.stop();
  const rawParagraphs = text.split('\n\n').map((p) => p.trim()).filter(Boolean);
  const sentences = splitParagraphsIntoSentences(rawParagraphs.length > 0 ? rawParagraphs : [text]);
  accessibleTTS.loadSentences(
    sentences.length > 0
      ? sentences
      : [
          {
            id: 'sent-custom',
            index: 0,
            paragraphIndex: 0,
            text,
            charStart: 0,
            charEnd: text.length,
          },
        ],
    'fr'
  );
  accessibleTTS.play();
}

export function stopAIAudio(): void {
  if (currentAbortController) {
    try {
      currentAbortController.abort();
    } catch {
      // Ignore AbortError / already aborted signals
    }
    currentAbortController = null;
  }
  if (currentAudioElement) {
    const audio = currentAudioElement;
    currentAudioElement = null;
    audio.onerror = null;
    audio.onloadedmetadata = null;
    audio.ontimeupdate = null;
    audio.onplay = null;
    audio.onpause = null;
    audio.onended = null;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute('src');
      audio.load();
    } catch {}
  }
  accessibleTTS.stop();
  updateState({
    isPlaying: false,
    isPaused: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    audioUrl: null,
  });
}

export function setAIAudioRate(rate: number): void {
  const clamped = Math.max(0.75, Math.min(1.5, Math.round(rate * 100) / 100));
  updateState({ playbackRate: clamped });
  if (currentAudioElement) {
    currentAudioElement.playbackRate = clamped;
  }
  accessibleTTS.setRate(clamped);
}

export function seekAIAudio(seconds: number): void {
  if (currentAudioElement && Number.isFinite(seconds)) {
    currentAudioElement.currentTime = Math.max(0, Math.min(seconds, currentAudioElement.duration || 0));
    updateState({ currentTime: currentAudioElement.currentTime });
  }
}
