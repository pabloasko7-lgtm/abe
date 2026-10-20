import { TranslationResponse, TranslationMode } from '../types';

/**
 * Checks whether an Arabic translation string is an invalid placeholder or corrupted data.
 */
export function isPlaceholderOrInvalidTranslation(text: string): boolean {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim();
  if (t.length < 5) return true;
  if (t.includes('نص روائي بالفرنسية من مقرر الامتحان الجهوي')) return true;
  if (t.includes('المعنى السياقي لمفردة "') && !t.includes('.')) return true;
  if (t.startsWith('```json') || t.startsWith('{ "type":') || t.startsWith('{"type":')) return true;
  if (t.includes('"arabicTranslation":') && t.includes('"originalText":')) return true;
  return false;
}

/**
 * Strips any leaked figure de style notes, vocabulary tables, or dividers
 * from the Arabic translation text without wiping out authentic narrative sentences.
 */
export function cleanDirectArabicTranslation(text: string): string {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  // 1. Remove meta prefix if present
  cleaned = cleaned.replace(/^ترجمة أدبية دقيقة باللغة العربية الفصحى تعبر عن المعنى الكامل للمقطع[.:]?\s*/gi, '');

  // 2. Remove markdown horizontal rules and anything following (e.g. *** or --- followed by headers)
  cleaned = cleaned.replace(/\s*(?:\*\*\*|---|___)\s*[\r\n]+[\s\S]*$/gi, '');

  // 3. Remove markdown headers for notes/figures ONLY (do NOT match normal words inside sentences)
  cleaned = cleaned.replace(/(?:\r?\n)+\s*(?:#{1,6}|\*{2,3})\s*(?:تحليل المفردات|الصور البيانية|المحسنات البديعية|المحسن البديعي|ملاحظات بلاغية|Figures?\s*de\s*styles?|Analyse\s*littéraire)[\s\S]*$/gi, '');
  cleaned = cleaned.replace(/(?:\r?\n)+\s*(?:#{1,6}|\*{2,3})\s*(?:ملاحظة|تنبيه|إيضاح)\s*:?[\s\S]*$/gi, '');

  // 4. Remove standalone bullet lists of vocabulary if they start with * **
  cleaned = cleaned.replace(/(?:\r?\n)+\s*\*\s*\*\*[^*]+\*\*:\s*[\s\S]*$/g, '');

  // 5. Remove leading/trailing quotation marks
  cleaned = cleaned.replace(/^["'«]+|["'»]+$/g, '').trim();

  return cleaned;
}

/**
 * Sanitizes a TranslationResponse object to ensure pure Arabic text in translation fields.
 */
export function sanitizeTranslationResponse(data: TranslationResponse): TranslationResponse {
  if (!data) return data;
  const cleanedAr = cleanDirectArabicTranslation(data.arabicTranslation);
  const sideBySideAr = data.sideBySide ? cleanDirectArabicTranslation(data.sideBySide.arabic) : cleanedAr;

  let chunks = data.chunkingInfo?.chunks;
  if (chunks && Array.isArray(chunks)) {
    chunks = chunks.map((c) => ({
      ...c,
      arabic: cleanDirectArabicTranslation(c.arabic),
    }));
  }

  return {
    ...data,
    arabicTranslation: cleanedAr,
    sideBySide: data.sideBySide ? { ...data.sideBySide, arabic: sideBySideAr } : undefined,
    chunkingInfo: data.chunkingInfo ? { ...data.chunkingInfo, chunks } : undefined,
  };
}

const CACHE_PREFIX = 'bac_trans_v3:';
const INDEX_KEY = 'bac_trans_keys_v3';
const PAGE_LATEST_PREFIX = 'bac_page_trans_v3:';
const MAX_CACHE_ENTRIES = 250;

/**
 * Normalizes text to create a deterministic cache key.
 */
function normalizeTextKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

/**
 * Builds a deterministic storage key for a translation request.
 */
export function buildTranslationCacheKey(
  bookId: string,
  pageNumber: number,
  text: string,
  mode?: TranslationMode,
  isExpanded?: boolean
): string {
  const norm = normalizeTextKey(text);
  const activeMode = mode || 'default';
  const expTag = isExpanded ? 'exp' : 'std';
  return `${CACHE_PREFIX}${bookId}:p${pageNumber}:${activeMode}:${expTag}:${norm}`;
}

/**
 * Retrieves list of tracked cache keys for LRU pruning.
 */
function getTrackedKeys(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Saves tracked keys list to localStorage.
 */
function setTrackedKeys(keys: string[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(keys.slice(-MAX_CACHE_ENTRIES)));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Prunes the oldest cached entries when storage is full.
 */
function pruneOldEntries(countToPrune = 40): void {
  try {
    const keys = getTrackedKeys();
    const toRemove = keys.slice(0, countToPrune);
    toRemove.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
    setTrackedKeys(keys.slice(countToPrune));
  } catch {}
}

/**
 * Attempts to retrieve a cached translation from localStorage.
 * Returns null if not found or corrupted.
 */
export function getCachedTranslation(
  bookId: string,
  pageNumber: number,
  text: string,
  mode?: TranslationMode,
  isExpanded?: boolean
): TranslationResponse | null {
  if (!text || typeof window === 'undefined' || !window.localStorage) return null;

  try {
    const key = buildTranslationCacheKey(bookId, pageNumber, text, mode, isExpanded);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const data: TranslationResponse = JSON.parse(raw);
    if (data && data.arabicTranslation && data.originalText) {
      // Auto-purge placeholder or invalid/corrupted translations
      if (isPlaceholderOrInvalidTranslation(data.arabicTranslation)) {
        localStorage.removeItem(key);
        return null;
      }
      // Validate completeness: for full paragraphs/pages, reject truncated cache entries
      const srcWords = data.originalText.trim().split(/\s+/).filter(Boolean).length;
      const arWords = data.arabicTranslation.trim().split(/\s+/).filter(Boolean).length;
      if (srcWords > 80 && arWords < srcWords * 0.35) {
        localStorage.removeItem(key);
        return null;
      }
      return sanitizeTranslationResponse(data);
    }
  } catch (err) {
    console.warn('[Translation Cache] Error reading key:', err);
  }

  return null;
}

/**
 * Stores a translation in localStorage with LRU tracking and quota safety.
 */
export function setCachedTranslation(
  bookId: string,
  pageNumber: number,
  text: string,
  data: TranslationResponse,
  mode?: TranslationMode,
  isExpanded?: boolean
): void {
  if (!text || !data || !data.arabicTranslation || typeof window === 'undefined' || !window.localStorage) return;
  // NEVER cache placeholders or corrupt text
  if (isPlaceholderOrInvalidTranslation(data.arabicTranslation)) return;

  const sanitized = sanitizeTranslationResponse(data);
  const key = buildTranslationCacheKey(bookId, pageNumber, text, mode, isExpanded);
  const serialized = JSON.stringify(sanitized);

  try {
    localStorage.setItem(key, serialized);

    // Update LRU tracking
    const keys = getTrackedKeys().filter((k) => k !== key);
    keys.push(key);

    if (keys.length > MAX_CACHE_ENTRIES) {
      pruneOldEntries(keys.length - MAX_CACHE_ENTRIES + 20);
    } else {
      setTrackedKeys(keys);
    }

    // Only update the whole-page latest translation if this is genuinely a full page translation
    // to prevent partial divided leaves (أوراق مقسمة) or snippets from overriding full page cache
    const srcWords = (sanitized.originalText || '').trim().split(/\s+/).filter(Boolean).length;
    if (sanitized.type === 'PARAGRAPH' && srcWords >= 220) {
      setLatestPageTranslation(bookId, pageNumber, sanitized);
    }
  } catch (e: any) {
    // QuotaExceededError handling
    console.warn('[Translation Cache] LocalStorage quota exceeded, pruning old entries and retrying...', e);
    try {
      pruneOldEntries(50);
      localStorage.setItem(key, serialized);
      const keys = getTrackedKeys().filter((k) => k !== key);
      keys.push(key);
      setTrackedKeys(keys);
    } catch {
      // Gracefully ignore if still failing
    }
  }
}

/**
 * Gets the latest translation saved for a specific page.
 */
export function getLatestPageTranslation(bookId: string, pageNumber: number): TranslationResponse | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const pageKey = `${PAGE_LATEST_PREFIX}${bookId}:p${pageNumber}`;
    const raw = localStorage.getItem(pageKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.arabicTranslation && data.originalText) {
      // Auto-purge placeholder or invalid/corrupted translations
      if (isPlaceholderOrInvalidTranslation(data.arabicTranslation)) {
        localStorage.removeItem(pageKey);
        return null;
      }
      const srcWords = data.originalText.trim().split(/\s+/).filter(Boolean).length;
      const arWords = data.arabicTranslation.trim().split(/\s+/).filter(Boolean).length;
      if (srcWords > 80 && arWords < srcWords * 0.35) {
        localStorage.removeItem(pageKey);
        return null;
      }
    }
    return sanitizeTranslationResponse(data);
  } catch {
    return null;
  }
}

/**
 * Saves the latest translation for a specific page.
 */
export function setLatestPageTranslation(bookId: string, pageNumber: number, data: TranslationResponse): void {
  if (typeof window === 'undefined' || !window.localStorage || !data || !data.arabicTranslation) return;
  // NEVER save placeholders to page cache
  if (isPlaceholderOrInvalidTranslation(data.arabicTranslation)) return;
  try {
    const sanitized = sanitizeTranslationResponse(data);
    const pageKey = `${PAGE_LATEST_PREFIX}${bookId}:p${pageNumber}`;
    localStorage.setItem(pageKey, JSON.stringify(sanitized));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clears all cached translations from localStorage.
 */
export function clearTranslationCache(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keys = getTrackedKeys();
    keys.forEach((k) => {
      try {
        localStorage.removeItem(k);
      } catch {}
    });
    localStorage.removeItem(INDEX_KEY);

    // Clear page-level items
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(CACHE_PREFIX) || k.startsWith(PAGE_LATEST_PREFIX))) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
}

/**
 * Returns total number of cached translations currently in localStorage.
 */
export function getTranslationCacheCount(): number {
  return getTrackedKeys().length;
}
