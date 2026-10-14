import { NovelPage } from '../types';
import { ALL_NOVEL_PAGES } from './novelData';

// Re-exported for backwards compatibility
export const NOVEL_PAGES_51_99: NovelPage[] = ALL_NOVEL_PAGES.filter(
  (p) => p.pageNumber >= 51 && p.pageNumber <= 99
);
