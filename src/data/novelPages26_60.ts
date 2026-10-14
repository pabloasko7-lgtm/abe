import { NovelPage } from '../types';
import { ALL_NOVEL_PAGES } from './novelData';

// Re-exported for backwards compatibility
export const NOVEL_PAGES_26_60: NovelPage[] = ALL_NOVEL_PAGES.filter(
  (p) => p.pageNumber >= 26 && p.pageNumber <= 60
);
