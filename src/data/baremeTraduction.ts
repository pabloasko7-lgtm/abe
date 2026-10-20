/**
 * Barème de Traduction & Interval Boundary Management for 1st Bac Moroccan Curriculum
 * 
 * Defines standard benchmarks (معيار الترجمة ومقياس المقطع) to guarantee that:
 * 1. Translations of divided pages (أوراق مقسمة - sub-page pocket leaves) match ONLY that sub-page.
 * 2. Snippet/selection translations match ONLY the selected text interval.
 * 3. Proportional word/character length ratios are strictly enforced (no whole-scene or multi-page spillovers).
 */

export interface BaremeValidationResult {
  isValid: boolean;
  sourceWords: number;
  arabicWords: number;
  ratio: number;
  isOverExpanded: boolean;
  isUnderTranslated: boolean;
  warning?: string;
}

/**
 * Standard Arabic-to-French literary expansion ratio is between 0.6x and 2.2x.
 * If a sub-page or short excerpt (< 200 words) produces > 2.4x words and > 150 words,
 * it indicates that an entire page or multi-scene dialogue was mistakenly injected.
 */
export function validateTranslationBareme(
  sourceFrench: string,
  translatedArabic: string
): BaremeValidationResult {
  const cleanSrc = (sourceFrench || '').trim();
  const cleanAr = (translatedArabic || '').trim();

  const sourceWords = cleanSrc.split(/\s+/).filter(Boolean).length;
  const arabicWords = cleanAr.split(/\s+/).filter(Boolean).length;

  if (sourceWords === 0 || arabicWords === 0) {
    return {
      isValid: false,
      sourceWords,
      arabicWords,
      ratio: 0,
      isOverExpanded: false,
      isUnderTranslated: true,
      warning: 'نص الترجمة أو النص الأصلي فارغ.',
    };
  }

  const ratio = Math.round((arabicWords / sourceWords) * 100) / 100;

  // Over-expansion (Whole-page spillover into a sub-page / selection)
  // Example: user selected 25 words, but got 180 words of dialogue
  // Or user translated a 120-word pocket leaf, but got 450 words of the full chapter
  const isOverExpanded =
    (sourceWords <= 40 && arabicWords > sourceWords * 3.2 && arabicWords > 35) ||
    (sourceWords <= 180 && arabicWords > sourceWords * 2.4 && arabicWords > 220);

  // Under-translation (Truncated output)
  const isUnderTranslated = sourceWords > 50 && arabicWords < sourceWords * 0.35;

  let warning: string | undefined;
  if (isOverExpanded) {
    warning = `تنبيه معيار الترجمة (Barème de traduction): تم رصد استطراد زائد (${sourceWords} كلمة فرنسية مقابل ${arabicWords} كلمة عربية). تم حصر الترجمة لتطابق تماماً نطاق الورقة المقسمة دون تسريب الصفحات المجاورة.`;
  } else if (isUnderTranslated) {
    warning = `تنبيه معيار الترجمة: الترجمة العربية تبدو مقتضبة وغير مكتملة مقارنة بالنص الأصلي.`;
  }

  return {
    isValid: !isOverExpanded && !isUnderTranslated,
    sourceWords,
    arabicWords,
    ratio,
    isOverExpanded,
    isUnderTranslated,
    warning,
  };
}

/**
 * Checks whether an excerpt from KNOWN_PARAGRAPH_TRANSLATIONS is proportionally safe
 * to use for a given source paragraph, avoiding dialogue or whole-scene spillover.
 */
export function isKnownParagraphBaremeSafe(sourceText: string, knownTranslation: string): boolean {
  const srcWords = sourceText.trim().split(/\s+/).filter(Boolean).length;
  const transWords = knownTranslation.trim().split(/\s+/).filter(Boolean).length;

  if (srcWords <= 15) {
    return transWords <= 35;
  }
  if (srcWords <= 40) {
    return transWords <= Math.max(srcWords * 2.2, 55);
  }
  if (srcWords <= 120) {
    return transWords <= Math.max(srcWords * 2.3, 140);
  }
  return transWords <= Math.max(srcWords * 2.5, 260);
}
