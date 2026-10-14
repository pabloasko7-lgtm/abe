import { TextHighlight } from '../types';

export interface HighlightManager {
  addHighlight(highlight: TextHighlight): void;
  removeHighlight(id: string): void;
  // Placeholder for synced highlight tracking
}

export const createHighlightManager = (): HighlightManager => {
  return {
    addHighlight: (highlight: TextHighlight) => {
      console.log('Adding highlight:', highlight);
    },
    removeHighlight: (id: string) => {
      console.log('Removing highlight:', id);
    },
  };
};
