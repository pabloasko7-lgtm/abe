import { NovelPage } from '../types';
import { NOVEL_PAGES_1_25 } from './novelPages1_25';
import { NOVEL_PAGES_26_50 } from './novelPages26_50';
import { NOVEL_PAGES_51_75 } from './novelPages51_75';
import { NOVEL_PAGES_76_99 } from './novelPages76_99';
import { CHAPTERS_META } from './chaptersMeta';

// Complete 1 to 99 pages array containing authentic unabridged text directly from the official edition
export const ALL_NOVEL_PAGES: NovelPage[] = [
  ...NOVEL_PAGES_1_25,
  ...NOVEL_PAGES_26_50,
  ...NOVEL_PAGES_51_75,
  ...NOVEL_PAGES_76_99,
].sort((a, b) => a.pageNumber - b.pageNumber);

// Fast map lookup by pageNumber
const PAGES_MAP = new Map<number, NovelPage>();
ALL_NOVEL_PAGES.forEach((p) => {
  PAGES_MAP.set(p.pageNumber, p);
});

// Helper to find which chapter a page belongs to
export function getChapterForPage(pageNumber: number) {
  const ch = CHAPTERS_META.find(
    (c) => pageNumber >= c.startPage && pageNumber <= c.endPage
  );
  return ch || CHAPTERS_META[0];
}

export function getNovelPage(pageNumber: number): NovelPage {
  const found = PAGES_MAP.get(pageNumber);
  return found || ALL_NOVEL_PAGES[0];
}
