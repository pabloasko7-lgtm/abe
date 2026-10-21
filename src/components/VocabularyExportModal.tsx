import React, { useState } from 'react';
import {
  X, Download, FileSpreadsheet, Printer, Copy, Check, FileText,
  Sparkles, Layers, BookOpen, Loader2, FileDown
} from 'lucide-react';
import { FlashcardWord, BookId } from '../types';
import {
  exportVocabularyToCSV,
  exportVocabularyToAnki,
  exportVocabularyToJSON,
  copyVocabularyToClipboard,
  printVocabularyRevisionSheet,
  exportVocabularyToPDF
} from '../data/vocabularyExportService';
import { getBookInfo } from '../data/bookService';
import { addCustomCard } from '../data/vocabularyService';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface VocabularyExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  filteredCards: FlashcardWord[];
  allCards: FlashcardWord[];
  activeBookId: BookId;
}

export const VocabularyExportModal: React.FC<VocabularyExportModalProps> = ({
  isOpen, onClose, filteredCards, allCards, activeBookId,
}) => {
  const [exportScope, setExportScope] = useState<'filtered' | 'active_book' | 'all'>('all');
  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [downloadSuccessMessage, setDownloadSuccessMessage] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<{ percent: number; statusText: string } | null>(null);

  if (!isOpen) return null;

  const currentBookInfo = getBookInfo(activeBookId);
  const activeBookCards = allCards.filter((c) => c.bookId === activeBookId);
  const targetCards = exportScope === 'filtered' ? filteredCards : exportScope === 'active_book' ? activeBookCards : allCards;

  const showNotification = (msg: string) => {
    setDownloadSuccessMessage(msg);
    setTimeout(() => setDownloadSuccessMessage(null), 4000);
  };

  const handleImportPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const typedarray = new Uint8Array(event.target?.result as ArrayBuffer);
      const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item: any) => item.str).join(' ');
      }

      // Parsing logic: Assumes format "word - meaning" per line or block
      // Adjusting regex to capture "word - meaning" even with spaces
      const lines = fullText.split('\n');
      let addedCount = 0;
      for (const line of lines) {
        if (line.includes('-')) {
          const [word, meaning] = line.split('-').map(s => s.trim());
          if (word && meaning) {
            addCustomCard({
              bookId: activeBookId,
              frenchWord: word,
              arabicMeaning: meaning,
              contextualMeaning: 'مستورد من ملف PDF',
              partOfSpeech: 'غير محدد',
              pageNumber: 1,
              synonyms: [],
              masteryLevel: 'new'
            });
            addedCount++;
          }
        }
      }
      showNotification(`تم استيراد ${addedCount} مفردة من ملف الـ PDF بنجاح!`);
    };
    reader.readAsArrayBuffer(file);
    if (e.target) e.target.value = '';
  };

  const handleDownloadPDF = async () => {
    if (isGeneratingPDF) return;
    setIsGeneratingPDF(true);
    setPdfProgress({ percent: 5, statusText: 'بدء إعداد صفحات الـ PDF...' });
    try {
      await exportVocabularyToPDF(
        targetCards,
        {
          bookFilter: exportScope === 'all' ? 'all' : activeBookId,
          novelTitle: exportScope === 'all' ? 'جميع المؤلفات المقررة' : currentBookInfo?.titleArabic,
        },
        (pct, msg) => setPdfProgress({ percent: pct, statusText: msg })
      );
      showNotification(`تم تنزيل ملف الـ PDF بنجاح (${targetCards.length} مفردة).`);
    } catch (err: any) {
      console.error('PDF export error:', err);
      showNotification('تعذر إنشاء الـ PDF.');
    } finally {
      setIsGeneratingPDF(false);
      setPdfProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-3 font-arabic select-none" dir="rtl">
      <div className="bg-[#FAF7EE] dark:bg-stone-900 w-full max-w-2xl rounded-3xl border-2 border-amber-800/40 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-linear-to-r from-emerald-950 via-emerald-900 to-amber-950 text-white px-5 py-4 flex items-center justify-between border-b border-emerald-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-800/80 border border-emerald-600/50 flex items-center justify-center text-emerald-200">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white leading-tight">إدارة المفردات (Vocabulary Manager)</h3>
              <p className="text-xs text-emerald-200/80 mt-0.5">تصدير أو استيراد المفردات من ملفات PDF/Excel</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-emerald-200 hover:text-white hover:bg-emerald-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-right">
          
          {/* Notification */}
          {downloadSuccessMessage && (
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-900 dark:text-emerald-200 text-xs font-bold flex items-center gap-2 animate-in fade-in">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 animate-pulse" />
              <span>{downloadSuccessMessage}</span>
            </div>
          )}

          {/* PDF Import Section */}
          <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800">
            <label className="text-xs font-bold text-indigo-900 dark:text-indigo-300 flex items-center gap-2 mb-2 cursor-pointer hover:underline">
              <FileDown className="w-4 h-4" />
              <span>استيراد مفردات من ملف PDF:</span>
              <input type="file" accept=".pdf" className="hidden" onChange={handleImportPDF} />
            </label>
            <p className="text-[10px] text-indigo-800/70 dark:text-indigo-400">
              ارفع ملف PDF يحتوي على قائمة كلمات بتنسيق "كلمة - معنى" (مثال: Sommeil - نوم) ليتم إضافتها تلقائياً لمجموعتك.
            </p>
          </div>

          {/* Scope Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-stone-800 dark:text-stone-200 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-amber-700 dark:text-amber-400" />
              <span>نطاق التصدير (Export Scope):</span>
            </label>
            <div className="grid grid-cols-3 gap-2 text-xs font-bold">
              <button
                onClick={() => setExportScope('all')}
                className={`py-2.5 px-3 rounded-2xl border transition-all cursor-pointer ${
                  exportScope === 'all'
                    ? 'bg-emerald-800 text-white border-emerald-900 shadow-md ring-2 ring-emerald-500/30'
                    : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-amber-100'
                }`}
              >
                <span>جميع المفردات ({allCards.length})</span>
              </button>

              <button
                onClick={() => setExportScope('active_book')}
                className={`py-2.5 px-3 rounded-2xl border transition-all cursor-pointer ${
                  exportScope === 'active_book'
                    ? 'bg-emerald-800 text-white border-emerald-900 shadow-md ring-2 ring-emerald-500/30'
                    : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-amber-100'
                }`}
              >
                <span>الرواية الحالية ({activeBookCards.length})</span>
              </button>

              <button
                onClick={() => setExportScope('filtered')}
                className={`py-2.5 px-3 rounded-2xl border transition-all cursor-pointer ${
                  exportScope === 'filtered'
                    ? 'bg-emerald-800 text-white border-emerald-900 shadow-md ring-2 ring-emerald-500/30'
                    : 'bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700 hover:bg-amber-100'
                }`}
              >
                <span>النتائج المفلترة ({filteredCards.length})</span>
              </button>
            </div>
          </div>

          {/* Export Formats Grid */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-stone-800 dark:text-stone-200 block">اختر صيغة التصدير المناسبة:</span>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              
              {/* PDF / Print */}
              <button
                onClick={handleDownloadPDF}
                disabled={isGeneratingPDF || targetCards.length === 0}
                className="p-4 rounded-2xl bg-white dark:bg-stone-800 border-2 border-amber-200 dark:border-stone-700 hover:border-emerald-600 transition-all text-right flex items-start gap-3 group cursor-pointer shadow-xs disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100">تصدير ورقة مراجعة PDF</h4>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">تحميل ورقة مراجعة منسقة وجاهزة للطباعة والاحتفاظ بها.</p>
                </div>
              </button>

              {/* CSV / Excel */}
              <button
                onClick={() => {
                  exportVocabularyToCSV(targetCards);
                  showNotification(`تم تصدير ${targetCards.length} مفردة بصيغة CSV بنجاح.`);
                }}
                disabled={targetCards.length === 0}
                className="p-4 rounded-2xl bg-white dark:bg-stone-800 border-2 border-amber-200 dark:border-stone-700 hover:border-emerald-600 transition-all text-right flex items-start gap-3 group cursor-pointer shadow-xs disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100">تصدير لـ Excel / CSV</h4>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">ملف متوافق مع برامج الجداول لفتح البيانات وتحليلها.</p>
                </div>
              </button>

              {/* Anki Flashcards */}
              <button
                onClick={() => {
                  exportVocabularyToAnki(targetCards);
                  showNotification(`تم تصدير ${targetCards.length} بطاقة لبرنامج Anki بنجاح.`);
                }}
                disabled={targetCards.length === 0}
                className="p-4 rounded-2xl bg-white dark:bg-stone-800 border-2 border-amber-200 dark:border-stone-700 hover:border-emerald-600 transition-all text-right flex items-start gap-3 group cursor-pointer shadow-xs disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100">تصدير لبرنامج Anki</h4>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">ملف نصي لاستيراد البطاقات مباشرة لبرنامج التكرار المبااعد Anki.</p>
                </div>
              </button>

              {/* Copy to Clipboard */}
              <button
                onClick={() => {
                  const success = copyVocabularyToClipboard(targetCards);
                  if (success) {
                    setCopiedSuccess(true);
                    showNotification('تم نسخ المفردات إلى الحافظة بنجاح.');
                    setTimeout(() => setCopiedSuccess(false), 2000);
                  }
                }}
                disabled={targetCards.length === 0}
                className="p-4 rounded-2xl bg-white dark:bg-stone-800 border-2 border-amber-200 dark:border-stone-700 hover:border-emerald-600 transition-all text-right flex items-start gap-3 group cursor-pointer shadow-xs disabled:opacity-50"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  {copiedSuccess ? <Check className="w-5 h-5 text-emerald-600" /> : <Copy className="w-5 h-5" />}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-stone-900 dark:text-stone-100">نسخ إلى الحافظة</h4>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">نسخ جميع الكلمات والمعاني كنص جاهز للمشاركة.</p>
                </div>
              </button>

            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-stone-100 dark:bg-stone-850 border-t border-stone-200 dark:border-stone-800 flex items-center justify-between shrink-0">
          <span className="text-xs text-stone-500 dark:text-stone-400 font-mono">
            المفردات المحددة للتصدير: <strong className="text-stone-800 dark:text-stone-200">{targetCards.length}</strong> كلمة
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-stone-200 dark:bg-stone-700 hover:bg-stone-300 dark:hover:bg-stone-600 text-stone-800 dark:text-stone-200 text-xs font-bold transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
