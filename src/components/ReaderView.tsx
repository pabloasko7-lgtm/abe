import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import {
  createSelectionManager,
  SelectionManager,
} from '../services/selectionManager';
import {
  ChevronLeft, ChevronRight, CheckSquare, Square,
  HelpCircle, Sparkles, BookOpen, User, Calendar,
  Languages, ArrowLeft, Layers, Highlighter, Palette, Plus,
  Volume2, VolumeX, Play, Pause, RotateCcw, Headphones, X, Star, BookmarkCheck,
  Timer, Theater, Award, Gauge, SlidersHorizontal, Sliders, Loader2
} from 'lucide-react';
import { BookId, BookInfo, NovelPage, TextHighlight, TranslationResponse, TranslationMode, PageSummaryResponse, FocusSessionState } from '../types';
import { TranslationSidePanel } from './TranslationSidePanel';
import { HighlightsDrawer } from './HighlightsDrawer';
import { HighlightActionPopover } from './HighlightActionPopover';
import { PageSummaryOverlay } from './PageSummaryOverlay';
import { FocusSessionWidget } from './FocusSessionWidget';
import { TranslationProgressCounter } from './TranslationProgressCounter';
import { AudioSettingsModal } from './AudioSettingsModal';
import { AccessibleAudioPlayer } from './AccessibleAudioPlayer';
import {
  NaturalTTSPlayer,
  getTTSSettings,
  subscribeToTTSSettings,
  accessibleTTS,
  TTSPlayerState,
  splitParagraphsIntoSentences,
  SpokenSentence,
  warmUpSpeechEngine,
} from '../data/ttsService';
import { fetchPageSummary } from '../data/summaryService';
import {
  getFocusSessionState,
  subscribeToFocusSession,
  formatFocusTime,
  getPageReadingSeconds,
  setActiveReadingPage,
  getReadingSessionStats,
  getAverageReadingSpeed,
} from '../data/focusService';
import {
  getAllHighlights,
  addHighlight,
  updateHighlight,
  deleteHighlight,
  subscribeToHighlights,
  HIGHLIGHT_COLORS,
} from '../data/highlightService';
import {
  isPageBookmarked,
  toggleBookmark,
  subscribeToBookmarks,
} from '../data/bookmarkService';
import {
  getCachedTranslation,
  setCachedTranslation,
  getLatestPageTranslation,
  setLatestPageTranslation,
  cleanDirectArabicTranslation,
  isPlaceholderOrInvalidTranslation,
} from '../data/translationCache';
import { generateInstantTranslation } from '../data/translationsDict';
import { autoSaveWordTranslation } from '../data/vocabularyService';
import {
  playAmbientSound,
  stopAmbientSound,
  setAmbientVolume,
  getActiveAmbientPreset,
  AmbientPreset,
} from '../data/ambientSoundService';
import {
  playArabicAIAudio,
  subscribeAIAudio,
  pauseAIAudio,
  resumeAIAudio,
  stopAIAudio,
  setAIAudioRate,
  AIAudioState,
} from '../data/aiAudioService';

interface ReaderViewProps {
  currentPageData: NovelPage;
  totalPages: number;
  onPageChange: (page: number) => void;
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  selectedPagesForQuiz: number[];
  onTogglePageForQuiz: (page: number) => void;
  onTranslateSelection: (selectedText: string, context: string, pageNumber: number, translationMode?: TranslationMode) => void;
  onOpenQuiz: () => void;
  onOpenVocabReview?: (cardId?: string) => void;
  onOpenBookmarks?: () => void;
  onOpenFocusSession?: () => void;
  activeTranslation?: TranslationResponse | null;
  onCloseTranslation?: () => void;
  bookInfo?: BookInfo;
  onRetryWithMoreContext?: () => void;
  isRetryingWithContext?: boolean;
  onSwitchTranslationMode?: (mode: TranslationMode) => void;
  isTranslating?: boolean;
  translationDirection?: 'fr-to-ar' | 'ar-to-fr';
  onToggleTranslationDirection?: () => void;
}


interface NovelPageChunk {
  paragraphs: string[];
  subPageIndex: number;
  totalSubPages: number;
  wordCount: number;
}

/**
 * Splits raw novel text into authentic, digestible pocket-book pages (150-190 words each)
 * matching standard French paperback novel formatting (Format Livre de Poche).
 */
function chunkNovelPage(fullText: string, targetWordsPerChunk = 160): NovelPageChunk[] {
  const rawParagraphs = fullText
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (rawParagraphs.length === 0) {
    return [{ paragraphs: [fullText], subPageIndex: 0, totalSubPages: 1, wordCount: 0 }];
  }

  const chunks: { paragraphs: string[]; wordCount: number }[] = [];
  let currentChunkParagraphs: string[] = [];
  let currentWords = 0;

  for (const para of rawParagraphs) {
    const words = para.split(/\s+/).filter(Boolean).length;

    // If a single paragraph is extraordinarily long, split into sentences
    if (words > 220) {
      const sentences = para.match(/[^.!?]+[.!?]+(\s+|$)/g) || [para];
      let subSentenceGroup: string[] = [];
      let subSentenceWords = 0;

      for (const sent of sentences) {
        const sWords = sent.split(/\s+/).filter(Boolean).length;
        if (subSentenceWords > 0 && subSentenceWords + sWords > targetWordsPerChunk) {
          chunks.push({ paragraphs: [subSentenceGroup.join(' ')], wordCount: subSentenceWords });
          subSentenceGroup = [sent];
          subSentenceWords = sWords;
        } else {
          subSentenceGroup.push(sent);
          subSentenceWords += sWords;
        }
      }
      if (subSentenceGroup.length > 0) {
        chunks.push({ paragraphs: [subSentenceGroup.join(' ')], wordCount: subSentenceWords });
      }
      continue;
    }

    if (currentWords > 0 && currentWords + words > targetWordsPerChunk + 35) {
      chunks.push({ paragraphs: currentChunkParagraphs, wordCount: currentWords });
      currentChunkParagraphs = [para];
      currentWords = words;
    } else {
      currentChunkParagraphs.push(para);
      currentWords += words;
    }
  }

  if (currentChunkParagraphs.length > 0) {
    chunks.push({ paragraphs: currentChunkParagraphs, wordCount: currentWords });
  }

  return chunks.map((c, i) => ({
    paragraphs: c.paragraphs,
    subPageIndex: i,
    totalSubPages: chunks.length,
    wordCount: c.wordCount,
  }));
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  currentPageData,
  totalPages,
  onPageChange,
  fontSize,
  selectedPagesForQuiz,
  onTogglePageForQuiz,
  onTranslateSelection,
  onOpenQuiz,
  onOpenVocabReview,
  onOpenBookmarks,
  onOpenFocusSession,
  activeTranslation,
  onCloseTranslation,
  bookInfo,
  onRetryWithMoreContext,
  isRetryingWithContext,
  onSwitchTranslationMode,
  isTranslating = false,
}) => {
  const currentBookId: BookId = bookInfo?.id || 'la_boite_a_merveilles';

  const selectionManager = useMemo(() => createSelectionManager(), []);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const selectedTextRef = useRef<string>('');
  const [selectionRange, setSelectionRange] = useState<{ top: number; left: number } | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'summary' | 'translation'>('summary');
  const [isSplitFullScreen, setIsSplitFullScreen] = useState(false);
  const [subPageIndex, setSubPageIndex] = useState(0);

  // Feature 1: Tap Dictionary / Instant Word Lookup state
  const [isTapDictionaryActive, setIsTapDictionaryActive] = useState(false);
  const [tappedWordData, setTappedWordData] = useState<{ word: string; translation: TranslationResponse } | null>(null);
  const [isSavingTappedWord, setIsSavingTappedWord] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  // Feature 2: Zen Mode & Typography Comfort Customizer state
  const [isZenMode, setIsZenMode] = useState(false);
  const [fontFamily, setFontFamily] = useState<'serif' | 'amiri' | 'sans'>('serif');
  const [lineSpacing, setLineSpacing] = useState<'normal' | 'relaxed' | 'loose'>('relaxed');


  // Feature 3: Ambient Focus Soundscapes state
  const [activeAmbient, setActiveAmbient] = useState<AmbientPreset | null>(() => getActiveAmbientPreset() as AmbientPreset | null);
  const [ambientVolume, setAmbientVolumeState] = useState(0.3);
  const [showAmbientModal, setShowAmbientModal] = useState(false);

  const fontFamilyClass =
    fontFamily === 'amiri'
      ? 'font-arabic'
      : fontFamily === 'sans'
      ? 'font-sans'
      : 'font-serif';

  const lineSpacingClass =
    lineSpacing === 'normal'
      ? 'leading-relaxed space-y-3'
      : lineSpacing === 'loose'
      ? 'leading-8 space-y-6'
      : 'leading-loose space-y-4';

  const handleTapWordLookup = (word: string) => {
    const cleanWord = word.replace(/[.,/#!$%^&*;:{}=\-_`~()«»""''?؟]/g, '').trim();
    if (!cleanWord) return;
    const translation = generateInstantTranslation(cleanWord, currentPageData.text, currentPageData.pageNumber, 'word-by-word');
    setTappedWordData({ word: cleanWord, translation });
  };

  const handleSaveTappedWordToFlashcards = () => {
    if (!tappedWordData) return;
    setIsSavingTappedWord(true);
    try {
      autoSaveWordTranslation(tappedWordData.translation, currentPageData.pageNumber, currentBookId);
      setSaveSuccessMessage('تم حفظ الكلمة في بطاقات التعلم بنجاح! ⭐');
      setTimeout(() => {
        setSaveSuccessMessage(null);
        setIsSavingTappedWord(false);
      }, 2500);
    } catch {
      setIsSavingTappedWord(false);
    }
  };

  const handleGetDefinition = () => {
    // Placeholder for dictionary API call
    console.log("Get definition for:", selectedText);
    alert(`Getting definition for: ${selectedText}\n\nDictionary feature coming soon!`);
  };

  // Audio Speech Synthesis state (Web Speech API) & Accessible TTS Engine
  const [ttsState, setTtsState] = useState<TTSPlayerState>(() => accessibleTTS.getState());
  const [isPlayingSpeech, setIsPlayingSpeech] = useState(false);
  const [isSpeechPaused, setIsSpeechPaused] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('audiobook_playback_speed');
        if (saved) {
          const parsed = parseFloat(saved);
          if (!isNaN(parsed) && parsed >= 0.75 && parsed <= 1.5) {
            return parsed;
          }
        }
      } catch {
        // Ignore storage errors in sandbox
      }
    }
    return 1.0;
  });
  const speechRateRef = useRef<number>(speechRate);
  const speechRateTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    speechRateRef.current = speechRate;
  }, [speechRate]);

  // Subscribe to AccessibleTTSEngine state & warm up speech engine in background
  useEffect(() => {
    warmUpSpeechEngine();
    const unsub = accessibleTTS.subscribe((state) => {
      setTtsState(state);
      setIsPlayingSpeech(state.isPlaying);
      setIsSpeechPaused(state.isPaused);
      if (state.currentSentence) {
        setCurrentSpokenText(state.currentSentence.text);
      }
    });
    return unsub;
  }, []);

  const [aiAudioState, setAiAudioState] = useState<AIAudioState>({
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
  });

  useEffect(() => {
    const unsub = subscribeAIAudio((s) => {
      setAiAudioState(s);
      if (s.isPlaying || s.isLoading) {
        setIsPlayingSpeech(true);
        setIsSpeechPaused(s.isPaused);
      } else if (!ttsState.isPlaying) {
        setIsPlayingSpeech(false);
        setIsSpeechPaused(false);
      }
    });
    return unsub;
  }, [ttsState.isPlaying]);

  const [speechSourceLabel, setSpeechSourceLabel] = useState<string>('');
  const [currentSpokenText, setCurrentSpokenText] = useState<string>('');
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const [frenchVoices, setFrenchVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [arabicVoices, setArabicVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedFrenchVoice, setSelectedFrenchVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [selectedArabicVoice, setSelectedArabicVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [currentSpeechLang, setCurrentSpeechLang] = useState<'fr' | 'ar'>('fr');
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false);
  const [isAudioSettingsOpen, setIsAudioSettingsOpen] = useState(false);

  // Highlights state
  const [allBookHighlights, setAllBookHighlights] = useState<TextHighlight[]>(() =>
    getAllHighlights(currentBookId)
  );
  const [isHighlightsDrawerOpen, setIsHighlightsDrawerOpen] = useState(false);
  const [activeHighlightPopover, setActiveHighlightPopover] = useState<{
    highlight: TextHighlight;
    position: { top: number; left: number };
  } | null>(null);
  const [showColorPickerOnSelection, setShowColorPickerOnSelection] = useState(false);
  const [customHighlightHex, setCustomHighlightHex] = useState('#fef08a');

  // Bookmarking state for current page
  const [isBookmarked, setIsBookmarked] = useState<boolean>(() =>
    isPageBookmarked(currentBookId, currentPageData.pageNumber)
  );

  // AI Page Summary Overlay State
  const [isSummaryOverlayOpen, setIsSummaryOverlayOpen] = useState(false);
  const [isSummaryCollapsed, setIsSummaryCollapsed] = useState(false);
  const [summaryData, setSummaryData] = useState<PageSummaryResponse | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const handleOpenPageSummary = useCallback(async (forceRefresh: boolean = false) => {
    setIsSummaryOverlayOpen(true);
    setIsSummaryCollapsed(false);
    setIsSummaryLoading(true);
    setSummaryError(null);

    try {
      const data = await fetchPageSummary({
        pageNumber: currentPageData.pageNumber,
        bookId: currentBookId,
        forceRefresh,
      });
      setSummaryData(data);
    } catch (err: any) {
      console.error('Failed to fetch AI page summary:', err);
      setSummaryError('حدث خطأ أثناء الاتصال بالذكاء الاصطناعي.');
    } finally {
      setIsSummaryLoading(false);
    }
  }, [currentPageData.pageNumber, currentBookId]);

  // If overlay is open, fetch summary when navigating between pages
  useEffect(() => {
    if (isSummaryOverlayOpen) {
      handleOpenPageSummary(false);
    }
  }, [currentPageData.pageNumber, currentBookId, isSummaryOverlayOpen, handleOpenPageSummary]);

  const [focusState, setFocusState] = useState<FocusSessionState>(() => getFocusSessionState());

  useEffect(() => {
    setActiveReadingPage(currentBookId, currentPageData.pageNumber);
    const unsubscribe = subscribeToFocusSession((state) => {
      setFocusState(state);
    });
    return unsubscribe;
  }, [currentBookId, currentPageData.pageNumber]);

  const currentPageFocusSeconds = getPageReadingSeconds(currentBookId, currentPageData.pageNumber);

  // Live reading session stats & chapter remaining time calculation
  const sessionStats = useMemo(() => {
    return getReadingSessionStats(currentBookId, currentPageData.pageNumber);
  }, [currentBookId, currentPageData.pageNumber, focusState]);

  useEffect(() => {
    setIsBookmarked(isPageBookmarked(currentBookId, currentPageData.pageNumber));
    const unsubscribe = subscribeToBookmarks(() => {
      setIsBookmarked(isPageBookmarked(currentBookId, currentPageData.pageNumber));
    });
    return unsubscribe;
  }, [currentBookId, currentPageData.pageNumber]);

  const handleToggleBookmark = () => {
    const newState = toggleBookmark(currentBookId, currentPageData.pageNumber, {
      chapterTitle: currentPageData.chapterTitle,
      snippet: currentPageData.text.slice(0, 250),
      arabicSummary: currentPageData.arabicSummary,
    });
    setIsBookmarked(newState);
  };

  const textContainerRef = useRef<HTMLDivElement>(null);
  const sidebarAsideRef = useRef<HTMLElement>(null);

  const isPageSelectedForQuiz = selectedPagesForQuiz.includes(currentPageData.pageNumber);

  // Load available French and Arabic voices from Web Speech API with natural fluency sorting
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const populateVoices = () => {
      const allVoices = window.speechSynthesis.getVoices();

      // 1. Filter French Voices & Sort to Prioritize Fluent Natural Female Voices
      const frVoices = allVoices.filter((v) => v.lang.toLowerCase().startsWith('fr'));
      frVoices.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const femaleKeywords = ['female', 'aurelie', 'amelie', 'celine', 'hortense', 'julie', 'google', 'natural', 'premium', 'enhanced', 'online', 'audrey', 'marie'];
        const aHigh = femaleKeywords.some((k) => aName.includes(k));
        const bHigh = femaleKeywords.some((k) => bName.includes(k));
        if (aHigh && !bHigh) return -1;
        if (!aHigh && bHigh) return 1;
        return aName.localeCompare(bName);
      });
      setFrenchVoices(frVoices);
      if (frVoices.length > 0) {
        setSelectedFrenchVoice((prev) => prev || frVoices[0]);
      }

      // 2. Filter Arabic Voices & Sort to Prioritize Clear Natural Voices
      const arVoices = allVoices.filter((v) => v.lang.toLowerCase().startsWith('ar'));
      arVoices.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const qualityKeywords = ['google', 'natural', 'premium', 'enhanced', 'online', 'tariq', 'maged', 'laila', 'zeina', 'salma', 'ar-sa', 'ar-ma', 'ar-eg'];
        const aHigh = qualityKeywords.some((k) => aName.includes(k) || a.lang.toLowerCase().includes(k));
        const bHigh = qualityKeywords.some((k) => bName.includes(k) || b.lang.toLowerCase().includes(k));
        if (aHigh && !bHigh) return -1;
        if (!aHigh && bHigh) return 1;
        return aName.localeCompare(bName);
      });
      setArabicVoices(arVoices);
      if (arVoices.length > 0) {
        setSelectedArabicVoice((prev) => prev || arVoices[0]);
      }
    };

    populateVoices();
    window.speechSynthesis.onvoiceschanged = populateVoices;

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Subscribe to storage changes for highlights
  useEffect(() => {
    setAllBookHighlights(getAllHighlights(currentBookId));
    const unsubscribe = subscribeToHighlights(currentBookId, (updated) => {
      setAllBookHighlights(updated);
    });
    return () => unsubscribe();
  }, [currentBookId]);

  // Page specific highlights
  const pageHighlights = useMemo(() => {
    return allBookHighlights.filter((h) => h.pageNumber === currentPageData.pageNumber);
  }, [allBookHighlights, currentPageData.pageNumber]);

  // Divide the current page into digestible pocket novel leaves
  const pageChunks = useMemo(
    () => chunkNovelPage(currentPageData.text, 160),
    [currentPageData.text]
  );
  const validSubPageIndex = Math.min(subPageIndex, Math.max(0, pageChunks.length - 1));
  const currentChunk = pageChunks[validSubPageIndex] || pageChunks[0];

  // Reading mode state: 'chunks' (Pocket book pages) vs 'full' (Full continuous page view)
  const [readingMode, setReadingMode] = useState<'chunks' | 'full'>('chunks');
  const fullPageParagraphs = useMemo(() => {
    return currentPageData.text.split(/\r?\n+/).map((p) => p.trim()).filter(Boolean);
  }, [currentPageData.text]);

  const readerContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (readerContainerRef.current) {
      gsap.fromTo(
        readerContainerRef.current,
        { opacity: 0, y: 15, scale: 0.995 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'power3.out' }
      );
    }
  }, [currentPageData.pageNumber, readingMode]);

  // Automatically switch tab to 'translation' when new active translation arrives
  useEffect(() => {
    if (activeTranslation) {
      setSidebarTab('translation');
      if (activeTranslation.type === 'PARAGRAPH') {
        setIsSplitFullScreen(true);
      }
    }
  }, [activeTranslation]);

  // Stop speech when component unmounts or page changes
  const stopAudioReading = useCallback(() => {
    stopAIAudio();
    accessibleTTS.stop();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setIsPlayingSpeech(false);
    setIsSpeechPaused(false);
  }, []);

  // Reset text selection, sub-page index, audio and popovers on page change
  useEffect(() => {
    stopAIAudio();
    stopAudioReading();
    setPreloadedArabicText('');
    setSelectedText('');
    selectedTextRef.current = '';
    setSelectionRange(null);
    setSubPageIndex(0);
    setActiveHighlightPopover(null);
    setShowColorPickerOnSelection(false);
  }, [currentPageData.pageNumber, bookInfo?.id, stopAudioReading]);

  // Stop audio on subpage index change as well
  useEffect(() => {
    stopAudioReading();
  }, [subPageIndex, readingMode, stopAudioReading]);

  // Automatically sync sentences of current page or chunk with AccessibleTTSEngine
  useEffect(() => {
    accessibleTTS.stop();
    const paras = readingMode === 'full' ? fullPageParagraphs : currentChunk.paragraphs;
    const sentences = splitParagraphsIntoSentences(paras);
    accessibleTTS.loadSentences(sentences, 'fr');
  }, [readingMode, currentChunk.paragraphs, fullPageParagraphs, currentPageData.pageNumber]);

  // Auto-scroll to currently spoken sentence for auditory & visual tracking accessibility
  useEffect(() => {
    if (ttsState.autoScroll && ttsState.isPlaying && (currentSpeechLang === 'fr' || currentSpeechLang === 'ar') && ttsState.currentSentence) {
      const el = document.getElementById(`active-spoken-sentence-${ttsState.currentSentence.index}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [ttsState.currentSentenceIndex, ttsState.autoScroll, ttsState.isPlaying, currentSpeechLang]);

  // Accessible keyboard shortcuts (Space: play/pause, Alt+Right/Left: sentences, Esc: stop)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.code === 'Space') {
        if (showAudioPlayer || ttsState.isPlaying) {
          e.preventDefault();
          if (ttsState.isPlaying && !ttsState.isPaused) {
            accessibleTTS.pause();
          } else if (ttsState.isPaused) {
            accessibleTTS.resume();
          } else {
            accessibleTTS.play();
          }
        }
      } else if (e.altKey && e.key === 'ArrowRight') {
        if (showAudioPlayer || ttsState.isPlaying) {
          e.preventDefault();
          accessibleTTS.nextSentence();
        }
      } else if (e.altKey && e.key === 'ArrowLeft') {
        if (showAudioPlayer || ttsState.isPlaying) {
          e.preventDefault();
          accessibleTTS.prevSentence();
        }
      } else if (e.key === 'Escape') {
        if (showAudioPlayer || ttsState.isPlaying) {
          accessibleTTS.stop();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showAudioPlayer, ttsState.isPlaying, ttsState.isPaused]);

  // Start reading text aloud using Accessible TTS Engine (Web Speech API) with sentence/word tracking
  const startAudioReading = useCallback(
    (textToRead: string, sourceLabel = 'النص الفرنسي', lang: 'fr' | 'ar' = 'fr', overrideRate?: number) => {
      const cleanText = textToRead.trim();
      if (!cleanText) return;

      const rawParagraphs = cleanText.split('\n\n').map((p) => p.trim()).filter(Boolean);
      const sentences = splitParagraphsIntoSentences(rawParagraphs.length > 0 ? rawParagraphs : [cleanText]);

      if (overrideRate) {
        accessibleTTS.setRate(overrideRate);
      }
      accessibleTTS.loadSentences(sentences, lang);
      setCurrentSpeechLang(lang);
      setSpeechSourceLabel(sourceLabel);
      setCurrentSpokenText(sentences[0]?.text || cleanText);
      setShowAudioPlayer(true);
      accessibleTTS.play();
    },
    []
  );

  // 🌟 Background Page Pre-Translation for Instant Arabic Audio Reading & Zero Latency
  const [preloadedArabicText, setPreloadedArabicText] = useState<string>('');
  const [isPreloadingTranslation, setIsPreloadingTranslation] = useState<boolean>(false);

  useEffect(() => {
    let isCurrent = true;
    const pageNum = currentPageData.pageNumber;
    const fullText = currentPageData.text.trim();
    if (!fullText) return;

    // 1. Check local cache first for instant retrieval
    const cached =
      getCachedTranslation(currentBookId, pageNum, fullText, 'full-sentence', false) ||
      getLatestPageTranslation(currentBookId, pageNum);

    if (cached && cached.arabicTranslation && !isPlaceholderOrInvalidTranslation(cached.arabicTranslation)) {
      setPreloadedArabicText(cached.arabicTranslation);
      return;
    }

    // 2. Generate instant accurate translation if authentic known curriculum text
    const instant = generateInstantTranslation(fullText, fullText, pageNum, 'full-sentence');
    if (isCurrent && instant.arabicTranslation && !isPlaceholderOrInvalidTranslation(instant.arabicTranslation)) {
      setPreloadedArabicText(instant.arabicTranslation);
      if (!instant.arabicTranslation.includes('نص روائي بالفرنسية')) {
        setLatestPageTranslation(currentBookId, pageNum, instant);
      }
    }

    // 3. Silent background fetch to enhance and cache
    setIsPreloadingTranslation(true);
    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: fullText,
        context: fullText,
        pageNumber: pageNum,
        bookId: currentBookId,
        novelTitle: bookInfo?.titleFrench,
        translationMode: 'full-sentence',
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: TranslationResponse | null) => {
        if (isCurrent && data && data.arabicTranslation && !isPlaceholderOrInvalidTranslation(data.arabicTranslation)) {
          setPreloadedArabicText(data.arabicTranslation);
          setCachedTranslation(currentBookId, pageNum, fullText, data, 'full-sentence', false);
          setLatestPageTranslation(currentBookId, pageNum, data);
        }
      })
      .catch(() => {
        // Silently preserve instant translation on network error
      })
      .finally(() => {
        if (isCurrent) setIsPreloadingTranslation(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [currentPageData.pageNumber, currentPageData.text, currentBookId, bookInfo?.titleFrench]);

  // Start High-Fidelity Natural Arabic Audio Reader (صوت بشري نقي لأي صفحة)
  const startNaturalArabicAudioReading = useCallback(async () => {
    const pageNum = currentPageData.pageNumber;
    const pageText = currentPageData.text.trim();
    if (!pageText) return;

    setShowAudioPlayer(true);
    setCurrentSpeechLang('ar');
    setSpeechSourceLabel(`ترجمة صفحة ${pageNum} (صوت بشري عربي 🇲🇦)`);

    // 1. Determine target Arabic translation for THIS EXACT PAGE (never stale or from chapter start)
    let targetArabic = '';
    
    // Priority 0: Active translation already loaded/visible for this page
    if (activeTranslation && activeTranslation.arabicTranslation && activeTranslation.arabicTranslation.trim().length > 15 && !isPlaceholderOrInvalidTranslation(activeTranslation.arabicTranslation)) {
      targetArabic = activeTranslation.arabicTranslation;
    } else {
      const cached =
        getCachedTranslation(currentBookId, pageNum, pageText, 'full-sentence', false) ||
        getLatestPageTranslation(currentBookId, pageNum);

      if (cached && cached.arabicTranslation && !isPlaceholderOrInvalidTranslation(cached.arabicTranslation)) {
        targetArabic = cached.arabicTranslation;
      } else if (preloadedArabicText && preloadedArabicText.trim().length > 20 && !isPlaceholderOrInvalidTranslation(preloadedArabicText)) {
        targetArabic = preloadedArabicText;
      } else {
        const instant = generateInstantTranslation(pageText, pageText, pageNum, 'full-sentence');
        if (instant && instant.arabicTranslation && instant.arabicTranslation.length > 30 && !isPlaceholderOrInvalidTranslation(instant.arabicTranslation)) {
          targetArabic = instant.arabicTranslation;
        }
      }
    }

    // 2. If translation for this specific page is missing or too short, fetch it on the fly
    if (!targetArabic || targetArabic.length < 20) {
      try {
        setAiAudioState((prev) => ({ ...prev, isLoading: true, isPlaying: false }));
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: pageText,
            context: pageText,
            pageNumber: pageNum,
            bookId: currentBookId,
            novelTitle: bookInfo?.titleFrench,
            translationMode: 'full-sentence',
          }),
        });
        if (res.ok) {
          const data: TranslationResponse = await res.json();
          if (data && data.arabicTranslation) {
            targetArabic = data.arabicTranslation;
            setPreloadedArabicText(targetArabic);
            setCachedTranslation(currentBookId, pageNum, pageText, data, 'full-sentence', false);
            setLatestPageTranslation(currentBookId, pageNum, data);
          }
        }
      } catch (err) {
        console.warn('Dynamic page translation fetch error:', err);
      }
    }

    if (!targetArabic) {
      targetArabic = currentPageData.arabicSummary || pageText;
    }

    const cleanArabic = cleanDirectArabicTranslation(targetArabic) || targetArabic;
    const rawParagraphs = cleanArabic.split('\n\n').map((p) => p.trim()).filter(Boolean);
    let sentences = splitParagraphsIntoSentences(rawParagraphs.length > 0 ? rawParagraphs : [cleanArabic]);
    
    if (sentences.length === 0) {
      sentences = [{
        id: `sent-ar-${pageNum}-0`,
        index: 0,
        paragraphIndex: 0,
        text: cleanArabic,
        charStart: 0,
        charEnd: cleanArabic.length,
      }];
    }

    setCurrentSpokenText(sentences[0]?.text || cleanArabic);

    // Stop previous tracker state and ensure it starts from sentence 0 of THIS page
    accessibleTTS.stop();

    // Trigger AI Audio playback for THIS EXACT PAGE (tracker will strictly start when audio actually plays!)
    await playArabicAIAudio(
      cleanArabic,
      currentBookId,
      pageNum,
      `ترجمة صفحة ${pageNum} (صوت بشري عربي 🇲🇦)`
    );
  }, [activeTranslation, preloadedArabicText, currentPageData, currentBookId, bookInfo?.titleFrench]);

  // Quick Arabic Audio Reader Trigger for Fast Comprehension
  const startArabicSummaryAudioReading = useCallback(() => {
    startNaturalArabicAudioReading();
  }, [startNaturalArabicAudioReading]);

  const togglePauseResumeAudio = useCallback(() => {
    if (aiAudioState.isPlaying && !aiAudioState.isPaused) {
      pauseAIAudio();
    } else if (aiAudioState.isPaused) {
      resumeAIAudio();
    } else if (ttsState.isPlaying && !ttsState.isPaused) {
      accessibleTTS.pause();
    } else if (ttsState.isPaused) {
      accessibleTTS.resume();
    } else {
      setShowAudioPlayer(true);
      if (currentSpeechLang === 'ar' || (activeTranslation && activeTranslation.arabicTranslation)) {
        setCurrentSpeechLang('ar');
        startNaturalArabicAudioReading();
      } else {
        // Reload sentences of current pocket leaf so it never plays from beginning of chapter
        const sentences = splitParagraphsIntoSentences(currentChunk.paragraphs);
        accessibleTTS.loadSentences(sentences, 'fr');
        setCurrentSpeechLang('fr');
        accessibleTTS.play();
      }
    }
  }, [aiAudioState, ttsState, currentSpeechLang, activeTranslation, startNaturalArabicAudioReading, currentChunk.paragraphs]);

  const changeSpeechRate = useCallback(
    (newRate: number) => {
      const clampedRate = Math.min(1.5, Math.max(0.75, Math.round(newRate * 100) / 100));
      setSpeechRate(clampedRate);
      accessibleTTS.setRate(clampedRate);
      try {
        localStorage.setItem('audiobook_playback_speed', clampedRate.toString());
      } catch {
        // Ignore storage errors in sandbox
      }
    },
    []
  );

  // Updated selection listener using SelectionManager
  const updateSelectionPosition = useCallback(() => {
    const container = textContainerRef.current;
    if (!container) return;
    
    selectionManager.updateSelection(container);
    const selText = selectionManager.getSelectedText();
    setSelectedText(selText);
    selectedTextRef.current = selText || '';
    setSelectionRange(selectionManager.getSelectionRange());
  }, [selectionManager]);

  // Listen to document-level selection change events as well as mouse/touch events
  useEffect(() => {
    const handleDocumentSelectionChange = () => {
      requestAnimationFrame(() => {
        updateSelectionPosition();
      });
    };

    const handleDocumentClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('#floating-translate-container') ||
        target.closest('#floating-translate-trigger-btn') ||
        target.closest('#floating-speech-trigger-btn') ||
        target.closest('#floating-highlight-bar')
      ) {
        return;
      }
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectionRange(null);
        setSelectedText('');
        selectedTextRef.current = '';
        setShowColorPickerOnSelection(false);
      }
    };

    document.addEventListener('selectionchange', handleDocumentSelectionChange);
    document.addEventListener('mouseup', handleDocumentSelectionChange);
    document.addEventListener('touchend', handleDocumentSelectionChange);
    document.addEventListener('keyup', handleDocumentSelectionChange);
    document.addEventListener('mousedown', handleDocumentClickOutside);

    return () => {
      document.removeEventListener('selectionchange', handleDocumentSelectionChange);
      document.removeEventListener('mouseup', handleDocumentSelectionChange);
      document.removeEventListener('touchend', handleDocumentSelectionChange);
      document.removeEventListener('keyup', handleDocumentSelectionChange);
      document.removeEventListener('mousedown', handleDocumentClickOutside);
    };
  }, [updateSelectionPosition]);

  const triggerTranslation = (overrideText?: string) => {
    const textToTranslate = (overrideText || selectedText || '').trim();
    if (textToTranslate) {
      onTranslateSelection(
        textToTranslate,
        textToTranslate,
        currentPageData.pageNumber
      );
      setSelectionRange(null);
      setSidebarTab('translation');

      if (window.getSelection) {
        window.getSelection()?.removeAllRanges();
      }
    }
  };

  const handleApplyHighlight = (colorId: string, customHex?: string) => {
    const textToHighlight = (selectedText || '').trim();
    if (!textToHighlight) return;

    addHighlight(
      currentBookId,
      currentPageData.pageNumber,
      textToHighlight,
      colorId,
      customHex
    );

    // Clear selection UI
    setSelectionRange(null);
    setSelectedText('');
    selectedTextRef.current = '';
    setShowColorPickerOnSelection(false);

    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleOpenHighlightPopover = (
    e: React.MouseEvent,
    highlight: TextHighlight
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const container = textContainerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = (e.currentTarget as HTMLElement).getBoundingClientRect();

    setActiveHighlightPopover({
      highlight,
      position: {
        top: targetRect.top - containerRect.top + targetRect.height + 6,
        left: targetRect.left - containerRect.left,
      },
    });
  };

  const fontClasses = {
    sm: 'text-sm leading-relaxed',
    base: 'text-base sm:text-[17px] leading-relaxed',
    lg: 'text-lg sm:text-[19px] leading-loose',
    xl: 'text-xl sm:text-[22px] leading-loose',
  };

  const handlePrevLeaf = () => {
    if (subPageIndex > 0) {
      setSubPageIndex((prev) => prev - 1);
    } else if (currentPageData.pageNumber > 1) {
      onPageChange(currentPageData.pageNumber - 1);
    }
  };

  const handleNextLeaf = () => {
    if (subPageIndex < pageChunks.length - 1) {
      setSubPageIndex((prev) => prev + 1);
    } else if (currentPageData.pageNumber < totalPages) {
      onPageChange(currentPageData.pageNumber + 1);
    }
  };

  /**
   * Renders paragraph text with embedded permanent highlights and accessible real-time bimodal TTS sentence/word tracking
   */
  const renderParagraphWithHighlights = (paragraphText: string, pIdx: number) => {
    const isSentenceActive =
      ttsState.highlightBimodal &&
      ttsState.isPlaying &&
      (currentSpeechLang === 'fr' || currentSpeechLang === 'ar') &&
      ttsState.currentSentence?.paragraphIndex === pIdx;

    // Helper to render user-applied highlights inside any arbitrary text segment
    const renderHighlightsInSlice = (textSlice: string, keyPrefix: string) => {
      if (!pageHighlights || pageHighlights.length === 0 || !textSlice) {
        return textSlice;
      }

      interface MatchSegment {
        start: number;
        end: number;
        highlight: TextHighlight;
      }

      const matches: MatchSegment[] = [];
      for (const h of pageHighlights) {
        if (!h.text || h.text.length < 2) continue;
        let startIndex = 0;
        while (startIndex < textSlice.length) {
          const foundIndex = textSlice.indexOf(h.text, startIndex);
          if (foundIndex === -1) break;
          const endIndex = foundIndex + h.text.length;
          const hasOverlap = matches.some(
            (m) =>
              (foundIndex >= m.start && foundIndex < m.end) ||
              (endIndex > m.start && endIndex <= m.end) ||
              (foundIndex <= m.start && endIndex >= m.end)
          );
          if (!hasOverlap) {
            matches.push({ start: foundIndex, end: endIndex, highlight: h });
          }
          startIndex = endIndex;
        }
      }

      if (matches.length === 0) {
        return textSlice;
      }

      matches.sort((a, b) => a.start - b.start);
      const nodes: React.ReactNode[] = [];
      let lastIdx = 0;

      matches.forEach((m, mIdx) => {
        if (m.start > lastIdx) {
          nodes.push(textSlice.substring(lastIdx, m.start));
        }
        const hl = m.highlight;
        const colorConf =
          HIGHLIGHT_COLORS.find((c) => c.id === hl.colorId) || HIGHLIGHT_COLORS[0];
        const customBg = hl.customColorHex;

        nodes.push(
          <mark
            key={`hl-${keyPrefix}-${mIdx}-${hl.id}`}
            onClick={(e) => handleOpenHighlightPopover(e, hl)}
            className="rounded-md px-1 py-0.5 mx-0.5 transition-all duration-150 cursor-pointer border-b-2 hover:brightness-95 hover:shadow-xs inline relative group select-text"
            style={{
              backgroundColor: customBg ? `${customBg}99` : colorConf.bgLight,
              borderColor: customBg ? customBg : colorConf.borderLight,
              color: 'inherit',
            }}
            title={hl.note ? `ملاحظة: ${hl.note} (انقر للتعديل)` : 'نص مظلل (انقر لخيارات التظليل والنطق)'}
          >
            {textSlice.substring(m.start, m.end)}
            {hl.note && (
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-800 dark:bg-amber-400 mr-1 align-top" />
            )}
          </mark>
        );
        lastIdx = m.end;
      });

      if (lastIdx < textSlice.length) {
        nodes.push(textSlice.substring(lastIdx));
      }

      return nodes;
    };

    let paragraphContent: React.ReactNode;

    if (isSentenceActive && ttsState.currentSentence) {
      const curSent = ttsState.currentSentence;
      const sentStart = Math.max(0, Math.min(paragraphText.length, curSent.charStart));
      const sentEnd = Math.max(sentStart, Math.min(paragraphText.length, curSent.charEnd));

      const beforeText = paragraphText.substring(0, sentStart);
      const sentenceText = paragraphText.substring(sentStart, sentEnd);
      const afterText = paragraphText.substring(sentEnd);

      let sentenceContent: React.ReactNode = sentenceText;
      if (ttsState.currentWordRange) {
        const wStart = Math.max(0, Math.min(sentenceText.length, ttsState.currentWordRange.start));
        const wEnd = Math.max(wStart, Math.min(sentenceText.length, wStart + ttsState.currentWordRange.length));
        sentenceContent = (
          <>
            {sentenceText.substring(0, wStart)}
            <mark className="bg-amber-300 dark:bg-amber-400 text-stone-950 font-bold px-1 py-0.5 rounded shadow-xs inline transition-all">
              {sentenceText.substring(wStart, wEnd)}
            </mark>
            {sentenceText.substring(wEnd)}
          </>
        );
      }

      paragraphContent = (
        <>
          {renderHighlightsInSlice(beforeText, `p${pIdx}-pre`)}
          <span
            id={`active-spoken-sentence-${curSent.index}`}
            className="bg-amber-100/90 dark:bg-amber-950/80 border-b-2 border-amber-500 rounded px-1 transition-all shadow-2xs inline text-stone-950 dark:text-amber-100 font-semibold ring-2 ring-amber-400/30 relative"
          >
            {sentenceContent}
            {(ttsState.isPaused || aiAudioState.isPaused) && (
              <span className="inline-flex items-center gap-1 bg-amber-600 text-white font-bold text-[10px] px-1.5 py-0.2 rounded-full mr-1.5 shadow-xs align-middle animate-pulse">
                📍 هنا توقفت
              </span>
            )}
          </span>
          {renderHighlightsInSlice(afterText, `p${pIdx}-post`)}
        </>
      );
    } else {
      paragraphContent = renderHighlightsInSlice(paragraphText, `p${pIdx}`);
    }

    return (
      <div key={`p-wrapper-${pIdx}`} className="group relative flex items-start gap-1">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const paras = readingMode === 'full' ? fullPageParagraphs : currentChunk.paragraphs;
            const sentences = splitParagraphsIntoSentences(paras);
            accessibleTTS.loadSentences(sentences, 'fr');
            setShowAudioPlayer(true);
            accessibleTTS.playParagraph(pIdx);
          }}
          aria-label={`استمع للفقرة ${pIdx + 1} بصوت واضح`}
          className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity p-1 rounded-md text-stone-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-stone-200/60 dark:hover:bg-stone-800 cursor-pointer"
          title="استمع لهذه الفقرة بالصوت (Lecture du paragraphe)"
        >
          <Volume2 className="w-3.5 h-3.5" />
        </button>
        <p className="flex-1 indent-7 leading-relaxed first:indent-0">
          {paragraphContent}
        </p>
      </div>
    );
  };

  const isAntigone = bookInfo?.id === 'antigone';
  const isCondamne = bookInfo?.id === 'le_dernier_jour_dun_condamne';
  const isBoite = !isAntigone && !isCondamne;

  // Atmospheric card & border theme tokens
  const topActionBg = isBoite
    ? 'bg-amber-100/80 dark:bg-[#1b1511]/85 border-amber-200 dark:border-[#38281e] backdrop-blur-xl'
    : isAntigone
    ? 'bg-rose-100/80 dark:bg-[#1d0b16]/85 border-rose-200 dark:border-[#421422] backdrop-blur-xl'
    : 'bg-slate-100/80 dark:bg-[#0f172a]/85 border-slate-300 dark:border-[#1e293b] backdrop-blur-xl';

  const paperBgTheme = isBoite
    ? 'bg-[#fffefb] dark:bg-[#181310] border-amber-300/80 dark:border-[#38281e] shadow-[0_6px_30px_rgba(70,45,15,0.08)] dark:shadow-[0_6px_30px_rgba(0,0,0,0.6)]'
    : isAntigone
    ? 'bg-[#fffbfc] dark:bg-[#180a11] border-rose-300/80 dark:border-[#421422] shadow-[0_6px_30px_rgba(76,5,25,0.08)] dark:shadow-[0_6px_30px_rgba(0,0,0,0.6)]'
    : 'bg-[#ffffff] dark:bg-[#0c1322] border-slate-300 dark:border-[#1e293b] shadow-[0_6px_30px_rgba(15,23,42,0.08)] dark:shadow-[0_6px_30px_rgba(0,0,0,0.6)]';

  return (
    <div ref={readerContainerRef} className="max-w-7xl mx-auto px-3 sm:px-5 py-3 sm:py-4 space-y-3.5">
      {/* Bespoke Novel Atmosphere Header */}
      {!isZenMode && bookInfo && (
        <div
          className={`p-2.5 sm:p-3 rounded-xl border transition-all duration-300 flex flex-wrap items-center justify-between gap-2.5 shadow-xs ${
            isBoite
              ? 'bg-linear-to-r from-amber-100/90 via-[#fdf8ef] to-amber-200/80 dark:from-[#1e1712] dark:via-[#16120f] dark:to-[#241c15] border-amber-300/80 dark:border-[#38281e]'
              : isAntigone
              ? 'bg-linear-to-r from-rose-100/90 via-[#fdf5f6] to-rose-200/80 dark:from-[#200c17] dark:via-[#16080f] dark:to-[#280f1e] border-rose-300/80 dark:border-[#421422]'
              : 'bg-linear-to-r from-slate-100/90 via-[#f5f8fa] to-blue-100/80 dark:from-[#0d1422] dark:via-[#090e18] dark:to-[#111a2c] border-slate-300 dark:border-[#1e293b]'
          }`}
        >
          <div className="flex items-center gap-3 text-right" dir="rtl">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                isBoite
                  ? 'bg-amber-800 text-amber-100 dark:bg-amber-700'
                  : isAntigone
                  ? 'bg-rose-900 text-rose-100 dark:bg-rose-800'
                  : 'bg-slate-900 text-sky-100 dark:bg-slate-800'
              }`}
            >
              {isBoite ? (
                <Sparkles className="w-5 h-5 text-amber-300" />
              ) : isAntigone ? (
                <Theater className="w-5 h-5 text-rose-300" />
              ) : (
                <Award className="w-5 h-5 text-sky-300" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs sm:text-sm font-bold font-arabic ${
                    isBoite
                      ? 'text-amber-950 dark:text-amber-200'
                      : isAntigone
                      ? 'text-rose-950 dark:text-rose-200'
                      : 'text-slate-950 dark:text-sky-200'
                  }`}
                >
                  {bookInfo.theme.themeName}
                </span>
                <span
                  className={`hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-serif font-bold ${
                    isBoite
                      ? 'bg-amber-200/70 dark:bg-amber-950/70 text-amber-900 dark:text-amber-300'
                      : isAntigone
                      ? 'bg-rose-200/70 dark:bg-rose-950/70 text-rose-900 dark:text-rose-300'
                      : 'bg-slate-200/70 dark:bg-slate-800 text-slate-800 dark:text-sky-300'
                  }`}
                >
                  {bookInfo.theme.eraBadge}
                </span>
              </div>
              <p
                className={`text-[11px] font-arabic truncate max-w-md sm:max-w-xl ${
                  isBoite
                    ? 'text-amber-900/80 dark:text-stone-400'
                    : isAntigone
                    ? 'text-rose-900/80 dark:text-stone-400'
                    : 'text-slate-700 dark:text-stone-400'
                }`}
              >
                {bookInfo.theme.themeTagline}
              </p>
            </div>
          </div>

          <div
            className={`hidden md:block text-left text-[11px] font-serif italic max-w-xs ${
              isBoite
                ? 'text-amber-950/75 dark:text-amber-300/75'
                : isAntigone
                ? 'text-rose-950/75 dark:text-rose-300/75'
                : 'text-slate-800/75 dark:text-sky-300/75'
            }`}
          >
            {bookInfo.theme.quote.french}
          </div>
        </div>
      )}

      {/* Top Action Bar */}
      <div className={`${topActionBg} ios-glass rounded-xl p-2 sm:p-2.5 flex flex-wrap items-center justify-between gap-2 shadow-md border border-white/20 dark:border-white/10`}>
        {/* Left Side: Chapter & Reading Mode Toggle */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs sm:text-sm font-arabic font-bold text-amber-950 dark:text-stone-200">
            {currentPageData.chapterTitle}
          </span>
          {readingMode === 'chunks' && pageChunks.length > 1 && (
            <span className="text-[11px] font-serif font-semibold text-amber-800 dark:text-amber-400 bg-amber-200/80 dark:bg-stone-800 px-2 py-0.5 rounded-full border border-amber-300 dark:border-stone-700">
              ورقة {validSubPageIndex + 1} من {pageChunks.length}
            </span>
          )}

          {/* Reading Mode Toggle (Chunks vs Full Page) */}
          <div className="flex items-center gap-0.5 bg-amber-200/70 dark:bg-stone-800 p-0.5 rounded-lg border border-amber-300 dark:border-stone-700">
            <button
              onClick={() => setReadingMode('chunks')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-arabic font-bold transition-all cursor-pointer ${
                readingMode === 'chunks'
                  ? 'bg-amber-800 dark:bg-amber-600 text-white shadow-xs'
                  : 'text-amber-950 dark:text-stone-300 hover:bg-amber-300/50 dark:hover:bg-stone-700'
              }`}
              title="وضع الأوراق المقسمة (Pocket Chunks)"
            >
              مقسمة
            </button>
            <button
              onClick={() => setReadingMode('full')}
              className={`px-2.5 py-0.5 rounded text-[11px] font-arabic font-bold transition-all cursor-pointer ${
                readingMode === 'full'
                  ? 'bg-amber-800 dark:bg-amber-600 text-white shadow-xs'
                  : 'text-amber-950 dark:text-stone-300 hover:bg-amber-300/50 dark:hover:bg-stone-700'
              }`}
              title="عرض الصفحة كاملة بلا تقطيع (Full Page View)"
            >
              صفحة كاملة ✨
            </button>
          </div>
        </div>

        {/* Right Side: Audio Read, Highlighting & Quiz Actions */}
        <div className="flex items-center flex-wrap gap-1.5">
          {/* Instant Tap Dictionary Mode Toggle Button */}
          <button
            onClick={() => setIsTapDictionaryActive((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-arabic font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
              isTapDictionaryActive
                ? 'bg-orange-700 text-white border-orange-800 ring-2 ring-orange-400/50'
                : 'bg-amber-200/80 dark:bg-stone-800 hover:bg-amber-300 dark:hover:bg-stone-700 border-amber-300 dark:border-stone-700 text-amber-950 dark:text-amber-300'
            }`}
            title="وضع القاموس الفوري: انقر على أي كلمة لعرض معناها الفوري باللغة العربية"
          >
            <BookOpen className="w-3.5 h-3.5 text-orange-700 dark:text-orange-400" />
            <span>القاموس الفوري {isTapDictionaryActive ? '✨' : ''}</span>
          </button>

          {/* Zen Mode Toggle Button */}
          <button
            onClick={() => setIsZenMode((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-arabic font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
              isZenMode
                ? 'bg-amber-900 text-amber-100 border-amber-950 ring-2 ring-amber-400/50'
                : 'bg-amber-200/80 dark:bg-stone-800 hover:bg-amber-300 dark:hover:bg-stone-700 border-amber-300 dark:border-stone-700 text-amber-950 dark:text-amber-300'
            }`}
            title="وضع التركيز النقي (Zen Mode): إخفاء المشتتات والتركيز الكامل على القراءة"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            <span>{isZenMode ? 'خروج' : 'تركيز ✨'}</span>
          </button>

          {/* Ambient Soundscapes Button */}
          <button
            onClick={() => setShowAmbientModal(true)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-arabic font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
              activeAmbient
                ? 'bg-sky-700 text-white border-sky-800 ring-2 ring-sky-400/50'
                : 'bg-amber-200/80 dark:bg-stone-800 hover:bg-amber-300 dark:hover:bg-stone-700 border-amber-300 dark:border-stone-700 text-amber-950 dark:text-amber-300'
            }`}
            title="أصوات الخلفية المهدئة للتركيز (مطر، أمواج، مقهى، مكتبة)"
          >
            <Headphones className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
            <span>أصوات {activeAmbient ? '🎧' : ''}</span>
          </button>

          {/* AI Page Summary Button */}
          <button
            id={`page-summary-btn-${currentPageData.pageNumber}`}
            onClick={() => handleOpenPageSummary(false)}
            className={`px-2.5 py-1 rounded-lg border text-xs font-arabic font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
              isSummaryOverlayOpen && !isSummaryCollapsed
                ? 'bg-amber-800 dark:bg-amber-700 text-white border-amber-900 ring-2 ring-amber-400/50'
                : isSummaryOverlayOpen && isSummaryCollapsed
                ? 'bg-amber-300 dark:bg-stone-700 text-amber-950 dark:text-amber-200 border-amber-400 dark:border-stone-600'
                : 'bg-linear-to-r from-amber-200/90 via-orange-100/90 to-amber-200/90 dark:from-stone-800 dark:to-stone-850 hover:from-amber-300 hover:to-orange-200 border-amber-300 dark:border-stone-700 text-amber-950 dark:text-amber-300'
            }`}
            title="ملخص الصفحة السريع وتأطير المقطع بالذكاء الاصطناعي (AI Page Summary)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400 animate-pulse" />
            <span>ملخص AI</span>
          </button>

          {/* 🌟 Dedicated Ultra-Realistic Arabic Voice Reader Button (قارئ صوتي عربي عذب ومسبق التجهيز) */}
          <button
            id={`arabic-audio-reader-btn-${currentPageData.pageNumber}`}
            onClick={startNaturalArabicAudioReading}
            disabled={aiAudioState.isLoading}
            className={`px-3 py-1 rounded-xl border-2 text-xs font-arabic font-extrabold flex items-center gap-1.5 transition-all shadow-md cursor-pointer hover:scale-102 ${
              aiAudioState.isLoading
                ? 'bg-amber-950/90 text-amber-200 border-amber-500 animate-pulse cursor-wait'
                : (aiAudioState.isPlaying || (ttsState.isPlaying && !ttsState.isPaused && currentSpeechLang === 'ar'))
                ? 'bg-linear-to-r from-emerald-700 via-emerald-800 to-teal-800 text-white border-emerald-400 ring-2 ring-emerald-300/60'
                : 'bg-linear-to-r from-amber-800 via-amber-900 to-stone-900 hover:from-amber-700 hover:to-amber-800 text-amber-100 border-amber-400/90 shadow-xs'
            }`}
            title="استمع إلى ترجمة الصفحة بصوت عربي عذب وبشري نقي مسبق الترجمة والتجهيز"
          >
            {aiAudioState.isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-300" />
                <span>جاري التحضير...</span>
              </>
            ) : (aiAudioState.isPlaying || (ttsState.isPlaying && !ttsState.isPaused && currentSpeechLang === 'ar')) ? (
              <>
                <span className="flex items-center gap-0.5 h-3.5">
                  <span className="w-1 h-2.5 bg-emerald-200 rounded-full animate-bounce" />
                  <span className="w-1 h-2 bg-emerald-200 rounded-full animate-bounce delay-75" />
                  <span className="w-1 h-3 bg-emerald-200 rounded-full animate-bounce delay-150" />
                </span>
                <span>استماع...</span>
                <span className="bg-emerald-500 text-white text-[10px] px-1 py-0.2 rounded-full font-mono font-bold">
                  🔊
                </span>
              </>
            ) : (
              <>
                <span>🎙️</span>
                <span>صوت عربي 🇲🇦</span>
              </>
            )}
          </button>

          {/* 1-Click Fast AI Translation: Divided Sub-page Leaf OR Full Page */}
          {readingMode === 'chunks' && pageChunks.length > 1 ? (
            <div className="flex items-center gap-1">
              <button
                id={`translate-leaf-btn-${currentPageData.pageNumber}-${validSubPageIndex}`}
                onClick={() => triggerTranslation(currentChunk.paragraphs.join('\n\n'))}
                className="px-3 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 active:scale-98 text-white font-arabic font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer ring-2 ring-emerald-500/30"
                title={`ترجمة الورقة المقسمة الحالية (${validSubPageIndex + 1} من ${pageChunks.length}) بالذكاء الاصطناعي مع احترام معيار نطاق المقطع فقط`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-200 animate-pulse" />
                <span>ترجمة الورقة المقسمة ({validSubPageIndex + 1}/{pageChunks.length})</span>
              </button>
              <button
                id={`translate-fullpage-btn-${currentPageData.pageNumber}`}
                onClick={() => triggerTranslation(currentPageData.text)}
                className="px-2 py-1 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-100 hover:text-white font-arabic font-bold text-[11px] transition-all cursor-pointer"
                title="ترجمة كامل الصفحة (كل الأوراق المقسمة معاً)"
              >
                <span>كامل الصفحة</span>
              </button>
            </div>
          ) : (
            <button
              id={`translate-page-btn-${currentPageData.pageNumber}`}
              onClick={() => triggerTranslation(currentPageData.text)}
              className="px-3 py-1 rounded-lg bg-emerald-800 hover:bg-emerald-700 active:scale-98 text-white font-arabic font-bold text-xs flex items-center gap-1.5 shadow-md transition-all cursor-pointer ring-2 ring-emerald-500/30"
              title="ترجمة الصفحة الحالية كاملة بالذكاء الاصطناعي بدقة متناهية"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-200 animate-pulse" />
              <span>ترجمة الصفحة بـ AI</span>
            </button>
          )}

          {/* Bookmark / Star Page Button */}
          <button
            id={`bookmark-page-btn-${currentPageData.pageNumber}`}
            onClick={handleToggleBookmark}
            className={`px-2.5 py-1 rounded-lg border text-xs font-arabic font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
              isBookmarked
                ? 'bg-amber-400 dark:bg-amber-500 text-amber-950 border-amber-500 ring-2 ring-amber-300/60 font-black'
                : 'bg-amber-200/80 dark:bg-stone-800 hover:bg-amber-300 dark:hover:bg-stone-700 border-amber-300 dark:border-stone-700 text-amber-950 dark:text-amber-300'
            }`}
            title={isBookmarked ? 'إلغاء حفظ الصفحة من المفضلة' : 'حفظ الصفحة بالنجوم للمراجعة لاحقاً في الفهرس'}
          >
            <Star className={`w-3.5 h-3.5 ${isBookmarked ? 'fill-amber-950 text-amber-950' : 'text-amber-800 dark:text-amber-400'}`} />
            <span>{isBookmarked ? 'محفوظة ⭐' : 'حفظ'}</span>
          </button>

          {/* French Audio Reader Trigger Button */}
          <button
            onClick={() =>
              startAudioReading(
                currentChunk.paragraphs.join(' '),
                `ورقة ${subPageIndex + 1} (فرنسي)`,
                'fr'
              )
            }
            className="px-2.5 py-1 rounded-lg bg-indigo-900/80 hover:bg-indigo-800 border border-indigo-700 text-indigo-100 hover:text-white text-xs font-arabic font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            title="استمع لقراءة الصفحة باللغة الفرنسية بصوت أنثوي طلق وسلس"
          >
            <Volume2 className="w-3.5 h-3.5 text-indigo-300" />
            <span>فرنسي 🇫🇷</span>
          </button>

          {/* Arabic Audio Reader Trigger Button for Fast Event Comprehension */}
          <button
            onClick={startArabicSummaryAudioReading}
            className="px-2.5 py-1 rounded-lg bg-emerald-900/80 hover:bg-emerald-800 border border-emerald-700 text-emerald-100 hover:text-white text-xs font-arabic font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            title="استمع لشرح أحداث هذه الصفحة باللغة العربية الفصحى لفهم السرد فوراً"
          >
            <Headphones className="w-3.5 h-3.5 text-emerald-300" />
            <span>أحداث 🇲🇦</span>
          </button>

          {/* Audio TTS Settings Button */}
          <button
            onClick={() => setIsAudioSettingsOpen(true)}
            className="px-2 py-1 rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-200 hover:text-white text-xs font-arabic font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer"
            title="إعدادات القارئ الصوتي، النبرة، والسرعة"
          >
            <Sliders className="w-3.5 h-3.5 text-indigo-300" />
            <span className="hidden sm:inline">إعدادات الصوت</span>
          </button>

          {/* Highlights Drawer Button */}
          <button
            onClick={() => setIsHighlightsDrawerOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-amber-200/80 dark:bg-stone-800 hover:bg-amber-300 dark:hover:bg-stone-700 border border-amber-300 dark:border-stone-700 text-amber-950 dark:text-amber-300 text-xs font-arabic font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            title="عرض جميع التظليلات والملاحظات المحفوظة"
          >
            <Highlighter className="w-3.5 h-3.5 text-amber-800 dark:text-amber-400" />
            <span>تظليلات</span>
            <span className="bg-amber-800 text-amber-100 dark:bg-amber-600 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
              {allBookHighlights.length}
            </span>
          </button>

          {onOpenVocabReview && (
            <button
              onClick={() => onOpenVocabReview()}
              className="px-2.5 py-1 rounded-lg bg-amber-200/80 dark:bg-stone-800 hover:bg-amber-300 dark:hover:bg-stone-700 border border-amber-300 dark:border-stone-700 text-amber-950 dark:text-amber-300 text-xs font-arabic font-bold flex items-center gap-1.5 transition-all shadow-xs"
              title="مراجعة بطاقات المفردات"
            >
              <Layers className="w-3.5 h-3.5 text-amber-800 dark:text-amber-400" />
              <span>بطاقات</span>
            </button>
          )}

          <button
            id={`quiz-checkbox-page-${currentPageData.pageNumber}`}
            onClick={() => onTogglePageForQuiz(currentPageData.pageNumber)}
            className={`px-2.5 py-1 rounded-lg text-xs font-arabic font-bold flex items-center gap-1.5 border transition-all ${
              isPageSelectedForQuiz
                ? 'bg-emerald-700 dark:bg-emerald-800 border-emerald-800 dark:border-emerald-700 text-white shadow-xs'
                : 'bg-white/80 dark:bg-stone-800 border-amber-300 dark:border-stone-700 text-amber-900 dark:text-stone-300 hover:bg-white dark:hover:bg-stone-750'
            }`}
          >
            {isPageSelectedForQuiz ? (
              <CheckSquare className="w-3.5 h-3.5 text-emerald-200" />
            ) : (
              <Square className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            )}
            <span>تحديد للاختبار</span>
          </button>

          {selectedPagesForQuiz.length > 0 && (
            <button
              onClick={onOpenQuiz}
              className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900 text-xs font-arabic font-bold flex items-center gap-1.5 transition-all shadow-xs"
            >
              <HelpCircle className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
              <span>اختبار ({selectedPagesForQuiz.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          ACCESSIBLE AUDIO READ PLAYER (LECTURE VOCALE ACCESSIBLE ET BIMODALE)
         ========================================================================= */}
      {showAudioPlayer && (
        <AccessibleAudioPlayer
          ttsState={ttsState}
          onOpenSettings={() => setIsAudioSettingsOpen(true)}
          onClose={() => {
            stopAudioReading();
            setShowAudioPlayer(false);
          }}
          onTogglePlayPause={togglePauseResumeAudio}
          pageNumber={currentPageData.pageNumber}
          chapterTitle={currentPageData.chapterTitle}
          currentSpeechLang={currentSpeechLang}
        />
      )}

      {/* =========================================================================
          FULL SPLIT SIDE-BY-SIDE VIEW (NOUVELLE PAGE - VUE SCINDÉE) FOR PARAGRAPHS
         ========================================================================= */}
      {isSplitFullScreen && activeTranslation && activeTranslation.type === 'PARAGRAPH' ? (
        <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between bg-amber-200/80 dark:bg-stone-900 border border-amber-300 dark:border-stone-800 rounded-2xl px-5 py-3">
            <button
              onClick={() => setIsSplitFullScreen(false)}
              className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-stone-800 border border-amber-300 dark:border-stone-700 text-amber-950 dark:text-stone-100 hover:bg-amber-50 dark:hover:bg-stone-700 text-xs font-arabic font-bold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>العودة لوضع القراءة العادية</span>
            </button>
            <div className="flex items-center gap-2 text-right">
              <span className="text-xs font-arabic font-bold text-amber-900 dark:text-amber-300">
                عرض مشطور متزامن للفقرة (Nouvelle Page - Vue Scindée)
              </span>
              <Languages className="w-4 h-4 text-amber-700 dark:text-amber-400" />
            </div>
          </div>

          <TranslationSidePanel
            translation={activeTranslation}
            onClose={() => {
              setIsSplitFullScreen(false);
              onCloseTranslation?.();
            }}
            pageNumber={currentPageData.pageNumber}
            bookId={bookInfo?.id}
            isSplitFullScreen={true}
            onToggleSplitFullScreen={() => setIsSplitFullScreen(false)}
            onOpenVocabReview={onOpenVocabReview}
            onRetryWithMoreContext={onRetryWithMoreContext}
            isRetryingWithContext={isRetryingWithContext}
            onSwitchTranslationMode={onSwitchTranslationMode}
            isTranslating={isTranslating}
          />
        </div>
      ) : (
        /* =========================================================================
           AUTHENTIC POCKET NOVEL READING GRID (LIVRE DE POCHE): 
           - Left: Genuine French Pocket Book Page (Digestible sub-page chunk)
           - Right: Side Panel (Instant Translation OR Page Guide)
           ========================================================================= */
        <div className="grid lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* LEFT: Authentic Pocket Novel Page (Format Roman de poche) */}
          <div className="lg:col-span-7 xl:col-span-7 space-y-3.5">
            <div className="flex flex-col items-center">
              {/* Pocket Novel Paper Container (Day & Night Mode Aware) */}
              <div
                ref={textContainerRef}
                className={`w-full max-w-[540px] ${paperBgTheme} rounded-2xl p-5 sm:p-7 relative overflow-hidden transition-all select-text min-h-[420px] flex flex-col justify-between`}
              >
                {/* Book spine shadow texture simulation on edge */}
                <div className="pointer-events-none absolute inset-y-0 left-0 w-3.5 bg-linear-to-r from-stone-400/15 dark:from-stone-900/60 to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-2 bg-linear-to-l from-amber-400/10 dark:from-stone-900/40 to-transparent" />

                {/* Floating Contextual Translation, Audio Read & Highlighter Toolbar directly above selection */}
                {selectionRange && selectedText && (
                  <div
                    id="floating-translate-container"
                    style={{ top: `${selectionRange.top}px`, left: `${selectionRange.left}px` }}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    className="absolute z-30 animate-in fade-in zoom-in-95 duration-150 flex flex-col items-center pointer-events-auto"
                  >
                    <div
                      id="floating-highlight-bar"
                      className="bg-stone-900 dark:bg-stone-950 text-white rounded-2xl p-1.5 shadow-2xl border border-amber-400/60 flex items-center gap-1.5 text-xs font-arabic"
                    >
                      {/* Dynamic Smart Translate Button */}
                      {(() => {
                        const selWords = (selectedText || '').trim().split(/\s+/).filter(Boolean).length;
                        const label = selWords === 1 ? 'ترجمة كلمة' : selWords <= 18 ? 'ترجمة جملة' : 'ترجمة فقرة';
                        return (
                          <>
                            <button
                              id="floating-translate-trigger-btn"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                triggerTranslation();
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-linear-to-r from-emerald-800 via-teal-800 to-emerald-900 hover:from-emerald-700 hover:to-teal-700 text-white font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                              title="ترجمة فورية بالذكاء الاصطناعي"
                            >
                              <Sparkles className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
                              <span>{label}</span>
                            </button>
                            <button
                              id="floating-definition-trigger-btn"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleGetDefinition();
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-linear-to-r from-amber-800 via-yellow-800 to-amber-900 hover:from-amber-700 hover:to-yellow-700 text-white font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                              title="الحصول على التعريف"
                            >
                              <span>تعريف</span>
                            </button>
                          </>
                        );
                      })()}

                      {/* Audio Pronunciation Button for Selected Text */}
                      <button
                        id="floating-speech-trigger-btn"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const txt = selectedText || selectedTextRef.current;
                          if (txt) {
                            startAudioReading(txt, 'نص محدد');
                          }
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs"
                        title="نطق النص المحدد بالفرنسية (Écouter la prononciation)"
                      >
                        <Volume2 className="w-3.5 h-3.5 text-indigo-200" />
                        <span>نطق</span>
                      </button>

                      <div className="w-px h-5 bg-stone-700 mx-0.5" />

                      {/* Quick Palette Colors for Immediate 1-Click Highlighting */}
                      <div className="flex items-center gap-1 px-1">
                        {HIGHLIGHT_COLORS.map((c) => (
                          <button
                            key={c.id}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleApplyHighlight(c.id);
                            }}
                            className="w-5 h-5 rounded-full border border-black/30 hover:scale-125 transition-transform cursor-pointer shadow-2xs"
                            style={{ backgroundColor: c.hex }}
                            title={`تظليل بلون ${c.nameArabic}`}
                          />
                        ))}

                        {/* Custom color picker */}
                        <label
                          className="w-5 h-5 rounded-full border border-stone-500 flex items-center justify-center cursor-pointer hover:scale-125 transition-transform relative overflow-hidden ml-0.5"
                          title="تظليل بلون مخصص"
                        >
                          <input
                            type="color"
                            value={customHighlightHex}
                            onChange={(e) => {
                              const hex = e.target.value;
                              setCustomHighlightHex(hex);
                              handleApplyHighlight('custom', hex);
                            }}
                            className="opacity-0 absolute inset-0 cursor-pointer w-full h-full"
                          />
                          <Palette className="w-3 h-3 text-amber-300" />
                        </label>
                      </div>
                    </div>

                    {/* Downward indicator caret pointing directly to selected text */}
                    <div className="w-2.5 h-2.5 bg-stone-900 dark:bg-stone-950 rotate-45 -mt-1 shadow-md border-r border-b border-amber-400/60" />
                  </div>
                )}

                {/* Popover on existing highlight click */}
                {activeHighlightPopover && (
                  <HighlightActionPopover
                    highlight={activeHighlightPopover.highlight}
                    position={activeHighlightPopover.position}
                    onClose={() => setActiveHighlightPopover(null)}
                    onUpdateColor={(colorId, customHex) => {
                      updateHighlight(currentBookId, activeHighlightPopover.highlight.id, {
                        colorId,
                        customColorHex: customHex,
                      });
                      setActiveHighlightPopover(null);
                    }}
                    onUpdateNote={(note) => {
                      updateHighlight(currentBookId, activeHighlightPopover.highlight.id, {
                        note,
                      });
                      setActiveHighlightPopover(null);
                    }}
                    onDelete={() => {
                      deleteHighlight(currentBookId, activeHighlightPopover.highlight.id);
                      setActiveHighlightPopover(null);
                    }}
                    onTranslate={(text) => {
                      triggerTranslation(text);
                      setActiveHighlightPopover(null);
                    }}
                    onSpeak={(text) => {
                      startAudioReading(text, 'نص مظلل');
                      setActiveHighlightPopover(null);
                    }}
                  />
                )}

                {/* Top Classic Running Header (Livre de poche style) */}
                <div>
                  <div className="flex items-center justify-between border-b border-amber-900/15 dark:border-stone-700/60 pb-2.5 mb-5 text-[11px] uppercase tracking-widest font-serif text-amber-900/70 dark:text-amber-400/80 italic">
                    <span className="truncate max-w-[140px]">{bookInfo?.author || 'Roman'}</span>
                    <span className="font-semibold text-amber-950/85 dark:text-stone-100 truncate max-w-[180px]">
                      {bookInfo?.titleFrench || '1ère Bac'}
                    </span>
                    <span className="font-mono font-bold text-amber-900/80 dark:text-amber-400 flex items-center gap-1">
                      {isBookmarked && (
                        <span title="صفحة محفوظة بالنجوم (Page Enregistrée)">
                          <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-600 inline" />
                        </span>
                      )}
                      <span>{currentPageData.pageNumber}</span>
                    </span>
                  </div>

                  {/* Chapter Heading (displayed on first leaf of chapter) */}
                  {validSubPageIndex === 0 && (
                    <div className="text-center my-4 font-serif text-amber-950 dark:text-stone-100">
                      <h2 className="text-sm font-bold uppercase tracking-widest text-amber-800 dark:text-amber-400">
                        {currentPageData.chapterTitle}
                      </h2>
                      <div className="w-12 h-0.5 bg-amber-300 dark:bg-amber-600/60 mx-auto mt-2 mb-4" />
                    </div>
                  )}

                  {/* Digestible Novel Text Chunks with French Pocket Book Typography and Permanent Highlights */}
                  <div
                    className={`text-stone-900 dark:text-stone-200 ${fontFamilyClass} tracking-normal ${fontClasses[fontSize]} ${lineSpacingClass} text-justify hyphens-auto`}
                  >
                    {(readingMode === 'full' ? fullPageParagraphs : currentChunk.paragraphs).map((paragraph, pIdx) =>
                      renderParagraphWithHighlights(paragraph, pIdx)
                    )}
                  </div>
                </div>

                {/* Classic Running Bottom Numeral & Leaf Pagination */}
                <div className="mt-8 pt-4 border-t border-amber-900/15 dark:border-stone-700/60 flex items-center justify-between text-xs font-serif text-amber-900/75 dark:text-stone-400">
                  <span className="text-[11px] italic">
                    ~ {currentChunk.wordCount} mots
                  </span>

                  {/* Classic roman centered page numeral */}
                  <div className="font-bold font-serif tracking-widest text-amber-950 dark:text-amber-300">
                    — {currentPageData.pageNumber} {pageChunks.length > 1 ? `(${validSubPageIndex + 1}/${pageChunks.length})` : ''} —
                  </div>

                  {/* Sub-page bullet progress dots */}
                  {pageChunks.length > 1 ? (
                    <div className="flex items-center gap-1.5">
                      {pageChunks.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => setSubPageIndex(idx)}
                          className={`w-2 h-2 rounded-full transition-all cursor-pointer ${
                            idx === validSubPageIndex
                              ? 'bg-amber-800 dark:bg-amber-400 w-3.5'
                              : 'bg-amber-300 dark:bg-stone-700 hover:bg-amber-400 dark:hover:bg-stone-600'
                          }`}
                          title={`ورقة ${idx + 1}`}
                        />
                      ))}
                    </div>
                  ) : (
                    <span className="text-[11px] font-arabic text-amber-800 dark:text-stone-400">صفحة كاملة</span>
                  )}
                </div>
              </div>

              {/* Quick Pocket Leaf / Sub-page Turn Buttons */}
              <div className="w-full max-w-[560px] mt-3 flex items-center justify-between gap-3 text-xs font-arabic">
                <button
                  onClick={handlePrevLeaf}
                  disabled={currentPageData.pageNumber <= 1 && validSubPageIndex <= 0}
                  className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                    currentPageData.pageNumber <= 1 && validSubPageIndex <= 0
                      ? 'opacity-40 cursor-not-allowed bg-amber-50 dark:bg-stone-850 text-amber-400 dark:text-stone-600 border-amber-200 dark:border-stone-800'
                      : 'bg-white dark:bg-stone-800 hover:bg-amber-100/70 dark:hover:bg-stone-700 text-amber-950 dark:text-stone-200 border-amber-300 dark:border-stone-700 shadow-2xs'
                  }`}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                  <span>
                    {validSubPageIndex > 0 ? `الورقة السابقة (${validSubPageIndex}/${pageChunks.length})` : 'الصفحة السابقة'}
                  </span>
                </button>

                <div className="text-center text-[11px] text-amber-800 dark:text-stone-400 font-arabic">
                  {pageChunks.length > 1 ? (
                    <span>
                      ورقة <strong className="font-serif text-amber-950 dark:text-stone-200">{validSubPageIndex + 1}</strong> من <strong className="font-serif text-amber-950 dark:text-stone-200">{pageChunks.length}</strong>
                    </span>
                  ) : (
                    <span>الصفحة <strong className="font-serif text-amber-950 dark:text-stone-200">{currentPageData.pageNumber}</strong></span>
                  )}
                </div>

                <button
                  onClick={handleNextLeaf}
                  disabled={currentPageData.pageNumber >= totalPages && validSubPageIndex >= pageChunks.length - 1}
                  className={`px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-bold transition-all cursor-pointer ${
                    currentPageData.pageNumber >= totalPages && validSubPageIndex >= pageChunks.length - 1
                      ? 'opacity-40 cursor-not-allowed bg-amber-50 dark:bg-stone-850 text-amber-400 dark:text-stone-600 border-amber-200 dark:border-stone-800'
                      : 'bg-amber-800 dark:bg-amber-700 hover:bg-amber-900 dark:hover:bg-amber-600 text-white border-amber-900 dark:border-amber-600 shadow-2xs'
                  }`}
                >
                  <span>
                    {validSubPageIndex < pageChunks.length - 1 ? `الورقة التالية (${validSubPageIndex + 2}/${pageChunks.length})` : 'الصفحة التالية'}
                  </span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: Dedicated Side Panel (Translation Side Panel OR Page Summary) */}
          <aside ref={sidebarAsideRef} className="lg:col-span-5 xl:col-span-5 space-y-4">
            {/* Tab Selector when translation is active */}
            {activeTranslation && (
              <div className="bg-amber-100/90 dark:bg-stone-900 p-1.5 rounded-2xl border border-amber-300 dark:border-stone-800 flex items-center gap-2 text-xs font-arabic font-bold">
                <button
                  onClick={() => setSidebarTab('translation')}
                  className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    sidebarTab === 'translation'
                      ? 'bg-emerald-900 dark:bg-emerald-800 text-white shadow-xs'
                      : 'text-amber-900 dark:text-stone-300 hover:bg-amber-200/70 dark:hover:bg-stone-800'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                  <span>صفحة الترجمة (Nouvelle Page)</span>
                </button>
                <button
                  onClick={() => setSidebarTab('summary')}
                  className={`flex-1 py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    sidebarTab === 'summary'
                      ? 'bg-amber-800 dark:bg-amber-700 text-white shadow-xs'
                      : 'text-amber-900 dark:text-stone-300 hover:bg-amber-200/70 dark:hover:bg-stone-800'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>ملخص الصفحة</span>
                </button>
              </div>
            )}

            {/* If tab is Translation: Display Dedicated Translation Side Panel */}
            {sidebarTab === 'translation' && activeTranslation ? (
              <TranslationSidePanel
                translation={activeTranslation}
                onClose={() => {
                  setSidebarTab('summary');
                  onCloseTranslation?.();
                }}
                pageNumber={currentPageData.pageNumber}
                bookId={bookInfo?.id}
                isSplitFullScreen={false}
                onToggleSplitFullScreen={() => setIsSplitFullScreen(true)}
                onOpenVocabReview={onOpenVocabReview}
                onRetryWithMoreContext={onRetryWithMoreContext}
                isRetryingWithContext={isRetryingWithContext}
                onSwitchTranslationMode={onSwitchTranslationMode}
                isTranslating={isTranslating}
              />
            ) : (
              /* If tab is Summary (or no active translation): Display Arabic Page Summary Sidebar */
              <div className="bg-amber-50/95 dark:bg-stone-900/95 rounded-2xl border-2 border-amber-300/80 dark:border-stone-800 p-4 shadow-xs space-y-3.5 text-right sticky top-16">
                {/* Sidebar Header */}
                <div className="border-b border-amber-200 dark:border-stone-800 pb-3 flex items-center justify-between">
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-200/90 dark:bg-stone-800 text-amber-900 dark:text-amber-300 font-arabic font-bold">
                    أحداث الصفحة {currentPageData.pageNumber}
                  </span>
                  <h3 className="font-arabic font-bold text-amber-950 dark:text-stone-100 text-base flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-amber-800 dark:text-amber-400" />
                    <span>دليل الصفحة بالعربية الفصحى</span>
                  </h3>
                </div>

                {/* Concise Modern Standard Arabic Page Summary */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handleOpenPageSummary(false)}
                      className="text-[11px] font-bold text-amber-700 hover:text-amber-900 dark:text-amber-400 flex items-center gap-1 cursor-pointer transition-colors"
                      title="فتح ملخص تفاعلي بالذكاء الاصطناعي"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>توليد بالذكاء الاصطناعي (AI)</span>
                    </button>
                    <h4 className="text-xs font-arabic font-bold text-amber-800 dark:text-amber-400">
                      الملخص المكثف للصفحة:
                    </h4>
                  </div>
                  <p className="text-sm font-arabic text-amber-950 dark:text-stone-200 font-medium leading-relaxed bg-white/70 dark:bg-stone-800/80 p-3.5 rounded-xl border border-amber-200/70 dark:border-stone-700 shadow-2xs">
                    {currentPageData.arabicSummary}
                  </p>
                  <button
                    onClick={() => handleOpenPageSummary(false)}
                    className="w-full py-2 px-3 rounded-xl bg-linear-to-r from-amber-700 via-amber-800 to-stone-900 hover:from-amber-800 hover:to-black text-amber-100 text-xs font-arabic font-bold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer active:scale-98"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-spin-slow" />
                    <span>عرض ملخص الصفحة التفاعلي (AI Summary)</span>
                  </button>
                </div>

                {/* Key Events in Arabic */}
                {currentPageData.keyEventsArabic && currentPageData.keyEventsArabic.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-arabic font-bold text-amber-800 dark:text-amber-400 flex items-center justify-end gap-1.5">
                      <span>أبرز محطات الصفحة:</span>
                      <Calendar className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                    </h4>
                    <ul className="space-y-1.5">
                      {currentPageData.keyEventsArabic.map((event, idx) => (
                        <li
                          key={idx}
                          className="text-xs font-arabic text-amber-900/90 dark:text-stone-300 bg-amber-100/60 dark:bg-stone-800/60 hover:bg-amber-100 dark:hover:bg-stone-800 p-2.5 rounded-xl border border-amber-200/50 dark:border-stone-750 flex items-start gap-2 leading-relaxed"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-700 dark:bg-amber-400 mt-1.5 shrink-0" />
                          <span>{event}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Main Characters Present */}
                {currentPageData.mainCharacters && currentPageData.mainCharacters.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-arabic font-bold text-amber-800 dark:text-amber-400 flex items-center justify-end gap-1.5">
                      <span>الشخصيات الحاضرة:</span>
                      <User className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                    </h4>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {currentPageData.mainCharacters.map((charName, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-stone-800 border border-amber-300 dark:border-stone-700 text-amber-950 dark:text-amber-300 font-serif font-bold shadow-2xs"
                        >
                          {charName}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Translation Shortcut Button */}
                <div className="pt-2 border-t border-amber-200 dark:border-stone-800 flex flex-col gap-2">
                  <button
                    onClick={() =>
                      triggerTranslation(currentChunk.paragraphs.join('\n\n'))
                    }
                    className="w-full py-3 px-3 rounded-xl bg-linear-to-r from-emerald-900 to-amber-900 dark:from-emerald-800 dark:to-amber-800 hover:from-emerald-800 hover:to-amber-700 text-white text-xs font-arabic font-bold flex items-center justify-center gap-2 transition-all shadow-md hover:scale-[1.01] cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4 text-emerald-200" />
                    <span>ترجمة الورقة الحالية (فتح Nouvelle Page)</span>
                  </button>

                  <button
                    onClick={() => {
                      setShowAudioPlayer(true);
                      startAudioReading(
                        currentChunk.paragraphs.join(' '),
                        `ورقة ${subPageIndex + 1}`
                      );
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-indigo-900/80 dark:bg-indigo-950/80 hover:bg-indigo-800 border border-indigo-700/50 text-indigo-100 text-xs font-arabic font-bold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer"
                  >
                    <Volume2 className="w-4 h-4 text-indigo-300" />
                    <span>استماع لنطق الورقة الحالية (Audio Read)</span>
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Bottom Pagination & Navigation Controls */}
      <div className="bg-amber-100/90 dark:bg-stone-900/90 border border-amber-200 dark:border-stone-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs transition-colors duration-200">
        {/* Previous Page Button */}
        <button
          id="prev-page-btn"
          disabled={currentPageData.pageNumber <= 1}
          onClick={() => onPageChange(currentPageData.pageNumber - 1)}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-arabic font-bold flex items-center gap-2 border transition-all cursor-pointer ${
            currentPageData.pageNumber <= 1
              ? 'opacity-40 cursor-not-allowed bg-amber-50 dark:bg-stone-850 border-amber-200 dark:border-stone-800 text-amber-400 dark:text-stone-600'
              : 'bg-white dark:bg-stone-800 border-amber-300 dark:border-stone-700 text-amber-950 dark:text-stone-200 hover:bg-amber-50 dark:hover:bg-stone-700 shadow-xs'
          }`}
        >
          <ChevronRight className="w-4 h-4" />
          <span>الصفحة السابقة</span>
        </button>

        {/* Page Slider / Quick Jumper with Subtle Reading Session Timer */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={totalPages}
              value={currentPageData.pageNumber}
              onChange={(e) => onPageChange(Number(e.target.value))}
              className="w-32 sm:w-56 accent-amber-800 dark:accent-amber-500 cursor-pointer"
              aria-label="شريط تقدم صفحات الرواية"
            />
            <span className="text-xs font-serif font-bold text-amber-950 dark:text-amber-300">
              {currentPageData.pageNumber} / {totalPages}
            </span>
          </div>
          <div 
            className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-arabic text-stone-600 dark:text-stone-300 select-none bg-black/5 dark:bg-white/5 px-2.5 py-0.5 rounded-full border border-stone-300/40 dark:border-stone-700/50"
            title={`جلسة القراءة: ${sessionStats.formattedSessionTime} | معدل السرعة: ${sessionStats.averageMinutesPerPage} د/صفحة (${sessionStats.isSpeedEstimated ? 'تقدير أساسي' : `محسوب من ${sessionStats.pagesCounted} صفحات`})`}
          >
            <Timer className={`w-3 h-3 text-amber-600 dark:text-amber-400 ${focusState.isTimerRunning ? 'animate-pulse' : 'opacity-60'}`} />
            <span>الجلسة: <strong className="font-mono text-stone-900 dark:text-stone-100">{sessionStats.formattedSessionTime}</strong></span>
            <span className="text-stone-400">·</span>
            <span>متبقي للفصل: <strong className="font-mono text-amber-800 dark:text-amber-300 font-bold">{sessionStats.formattedChapterRemaining}</strong></span>
            <span className="text-[10px] text-stone-400 dark:text-stone-500 font-mono hidden sm:inline">
              ({sessionStats.averageMinutesPerPage} د/ص)
            </span>
          </div>
        </div>

        {/* Next Page Button */}
        <button
          id="next-page-btn"
          disabled={currentPageData.pageNumber >= totalPages}
          onClick={() => onPageChange(currentPageData.pageNumber + 1)}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-arabic font-bold flex items-center gap-2 border transition-all cursor-pointer ${
            currentPageData.pageNumber >= totalPages
              ? 'opacity-40 cursor-not-allowed bg-amber-50 dark:bg-stone-850 border-amber-200 dark:border-stone-800 text-amber-400 dark:text-stone-600'
              : 'bg-amber-800 dark:bg-amber-700 border-amber-900 dark:border-amber-600 text-white hover:bg-amber-900 dark:hover:bg-amber-600 shadow-xs'
          }`}
        >
          <span>الصفحة التالية</span>
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Highlights & Notes Review Drawer */}
      {bookInfo && (
        <HighlightsDrawer
          isOpen={isHighlightsDrawerOpen}
          onClose={() => setIsHighlightsDrawerOpen(false)}
          bookInfo={bookInfo}
          highlights={allBookHighlights}
          currentPage={currentPageData.pageNumber}
          onJumpToPage={(p) => {
            onPageChange(p);
            setIsHighlightsDrawerOpen(false);
          }}
        />
      )}

      {/* AI Page Summary Collapsible Overlay */}
      <PageSummaryOverlay
        isOpen={isSummaryOverlayOpen}
        isCollapsed={isSummaryCollapsed}
        onToggleCollapse={() => setIsSummaryCollapsed((prev) => !prev)}
        onClose={() => setIsSummaryOverlayOpen(false)}
        summaryData={summaryData}
        isLoading={isSummaryLoading}
        error={summaryError}
        onRegenerate={() => handleOpenPageSummary(true)}
        pageNumber={currentPageData.pageNumber}
        chapterTitle={currentPageData.chapterTitle}
        bookTitle={bookInfo?.titleFrench}
      />

      {/* Focus Session In-Reader Floating Widget */}
      {bookInfo && onOpenFocusSession && (
        <FocusSessionWidget
          activeBook={bookInfo}
          currentPage={currentPageData.pageNumber}
          totalPages={totalPages}
          onOpenFocusModal={onOpenFocusSession}
        />
      )}

      {/* Floating 0 to 100 Live Translation Progress Counter Toast */}
      <TranslationProgressCounter 
        isTranslating={isTranslating} 
        variant="floating" 
      />

      {/* Audio TTS Human Voice Settings Modal */}
      <AudioSettingsModal
        isOpen={isAudioSettingsOpen}
        onClose={() => setIsAudioSettingsOpen(false)}
      />

      {/* Instant Tap Dictionary Lookup Modal / Popover */}
      {tappedWordData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white dark:bg-stone-900 border border-amber-300 dark:border-stone-700 rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 font-arabic">
            <div className="flex items-center justify-between border-b border-amber-200 dark:border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-orange-100 dark:bg-orange-950 text-orange-800 dark:text-orange-300 rounded-xl">
                  📖
                </span>
                <div>
                  <h3 className="text-lg font-bold text-amber-950 dark:text-stone-100 font-serif">
                    {tappedWordData.word}
                  </h3>
                  <span className="text-xs text-amber-700 dark:text-amber-400">
                    القاموس الفوري للأولى باكالوريا
                  </span>
                </div>
              </div>
              <button
                onClick={() => setTappedWordData(null)}
                className="p-2 rounded-xl text-stone-500 hover:bg-amber-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3.5 bg-amber-50 dark:bg-stone-800/80 rounded-2xl border border-amber-200/80 dark:border-stone-700">
                <span className="text-xs font-bold text-amber-800 dark:text-amber-400 block mb-1">
                  الترجمة العربية والمعنى:
                </span>
                <p className="text-sm font-bold text-amber-950 dark:text-stone-100">
                  {tappedWordData.translation.arabicTranslation}
                </p>
              </div>

              {tappedWordData.translation.wordDetails && (
                <div className="space-y-2 text-xs text-stone-700 dark:text-stone-300">
                  <p>
                    <strong>نوع الكلمة:</strong> {tappedWordData.translation.wordDetails.partOfSpeech}
                  </p>
                  <p>
                    <strong>المعنى السياقي:</strong> {tappedWordData.translation.wordDetails.contextualMeaning}
                  </p>
                </div>
              )}

              {saveSuccessMessage && (
                <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/80 text-emerald-900 dark:text-emerald-200 rounded-xl text-xs font-bold text-center">
                  {saveSuccessMessage}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-amber-200 dark:border-stone-800">
              <button
                onClick={handleSaveTappedWordToFlashcards}
                disabled={isSavingTappedWord}
                className="px-4 py-2 rounded-xl bg-amber-800 hover:bg-amber-900 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
              >
                {isSavingTappedWord ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                <span>حفظ في بطاقات التعلم ⭐</span>
              </button>
              <button
                onClick={() => setTappedWordData(null)}
                className="px-4 py-2 rounded-xl bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-bold text-xs transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Ambient Focus Soundscapes Modal */}
      {showAmbientModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300">
                  <Headphones className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-arabic font-bold text-base text-stone-900 dark:text-stone-100">أصوات التركيز البيئية</h3>
                  <p className="text-xs text-stone-500 dark:text-stone-400">اختر جواً صوتياً مهدئاً لتعزيز الاستغراق والتركيز أثناء القراءة</p>
                </div>
              </div>
              <button
                onClick={() => setShowAmbientModal(false)}
                className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 bg-stone-100 dark:bg-stone-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'rain', label: 'مطر خفيف 🌧️', desc: 'صوت قطرات المطر الناعمة' },
                { id: 'ocean', label: 'أمواج البحر 🌊', desc: 'هدير الأمواج المتجدد' },
                { id: 'cafe', label: 'مقهى هادئ ☕', desc: 'همهمة دافئة مريحة' },
                { id: 'library', label: 'هدوء المكتبة 📚', desc: 'عزل تام وسكون عميق' },
              ].map((preset) => {
                const isActive = activeAmbient === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      if (isActive) {
                        stopAmbientSound();
                        setActiveAmbient(null);
                      } else {
                        playAmbientSound(preset.id as AmbientPreset, ambientVolume);
                        setActiveAmbient(preset.id as AmbientPreset);
                      }
                    }}
                    className={`p-4 rounded-xl border text-right transition-all cursor-pointer flex flex-col gap-1 ${
                      isActive
                        ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 ring-2 ring-sky-400/40 text-sky-950 dark:text-sky-200'
                        : 'bg-stone-50 dark:bg-stone-800/60 border-stone-200 dark:border-stone-700 hover:border-sky-300 text-stone-800 dark:text-stone-200'
                    }`}
                  >
                    <span className="font-arabic font-bold text-sm">{preset.label}</span>
                    <span className="text-[11px] text-stone-500 dark:text-stone-400">{preset.desc}</span>
                  </button>
                );
              })}
            </div>

            {activeAmbient && (
              <div className="space-y-2 pt-2 border-t border-stone-200 dark:border-stone-800">
                <div className="flex items-center justify-between text-xs font-arabic text-stone-700 dark:text-stone-300">
                  <span>مستوى الصوت</span>
                  <span>{Math.round(ambientVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  value={ambientVolume}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setAmbientVolumeState(val);
                    setAmbientVolume(val);
                  }}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>
            )}

            <div className="flex items-center justify-between pt-3">
              {activeAmbient ? (
                <button
                  onClick={() => {
                    stopAmbientSound();
                    setActiveAmbient(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 font-arabic font-bold text-xs hover:bg-red-200 transition-colors cursor-pointer"
                >
                  إيقاف الصوت ⏹️
                </button>
              ) : <div />}
              <button
                onClick={() => setShowAmbientModal(false)}
                className="px-5 py-2 rounded-xl bg-amber-900 text-amber-100 font-arabic font-bold text-xs hover:bg-amber-950 transition-colors cursor-pointer"
              >
                تم ✅
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
