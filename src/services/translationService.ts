import { TranslationResponse, TranslationMode, SelectionType, BookId } from '../types';

export interface TranslateOptions {
  text: string;
  context?: string;
  pageNumber?: number;
  bookId?: BookId;
  novelTitle?: string;
  selectionType?: SelectionType;
  translationMode?: TranslationMode;
  signal?: AbortSignal;
}

export interface TranslationService {
  translate(optionsOrText: string | TranslateOptions, signal?: AbortSignal): Promise<TranslationResponse>;
}

const cache = new Map<string, TranslationResponse>();

export const createTranslationService = (): TranslationService => {
  return {
    translate: async (optionsOrText: string | TranslateOptions, signal?: AbortSignal): Promise<TranslationResponse> => {
      const opts: TranslateOptions = typeof optionsOrText === 'string'
        ? { text: optionsOrText, signal }
        : optionsOrText;

      const trimmedText = opts.text.trim();
      // Explicit check: Force sentence mode / selectionType SENTENCE if text length is less than 100 characters, regardless of punctuation
      const isShortSelection = trimmedText.length < 100;
      const effectiveTranslationMode: TranslationMode = opts.translationMode || (isShortSelection ? 'full-sentence' : 'full-sentence');
      const wordsCount = trimmedText.split(/\s+/).filter(Boolean).length;
      const effectiveSelectionType: SelectionType = opts.selectionType || (isShortSelection ? (wordsCount <= 1 ? 'WORD' : 'SENTENCE') : 'PARAGRAPH');

      const cacheKey = `${opts.bookId || 'def'}:p${opts.pageNumber || 0}:${effectiveTranslationMode}:${trimmedText}`;
      if (cache.has(cacheKey)) return cache.get(cacheKey)!;

      performance.mark('translate-start');
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: trimmedText,
          context: opts.context,
          pageNumber: opts.pageNumber,
          bookId: opts.bookId,
          novelTitle: opts.novelTitle,
          selectionType: effectiveSelectionType,
          translationMode: effectiveTranslationMode,
        }),
        signal: opts.signal || signal,
      });
      performance.mark('translate-end');
      performance.measure('translate', 'translate-start', 'translate-end');

      if (!response.ok) throw new Error('Translation failed');
      const data: TranslationResponse = await response.json();
      cache.set(cacheKey, data);
      return data;
    },
  };
};
