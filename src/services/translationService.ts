import { TranslationResponse } from '../types';

export interface TranslationService {
  translate(text: string, signal?: AbortSignal): Promise<TranslationResponse>;
}

const cache = new Map<string, TranslationResponse>();

export const createTranslationService = (): TranslationService => {
  return {
    translate: async (text: string, signal?: AbortSignal): Promise<TranslationResponse> => {
      if (cache.has(text)) return cache.get(text)!;

      performance.mark('translate-start');
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal
      });
      performance.mark('translate-end');
      performance.measure('translate', 'translate-start', 'translate-end');

      if (!response.ok) throw new Error('Translation failed');
      const data: TranslationResponse = await response.json();
      cache.set(text, data);
      return data;
    },
  };
};
