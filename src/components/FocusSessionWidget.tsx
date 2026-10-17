import React, { useState, useEffect, useRef } from 'react';
import {
  Timer, Play, Pause, RotateCcw, Maximize2, ChevronDown, ChevronUp,
  BookOpen, Sparkles, Flame, CheckCircle2, RefreshCw
} from 'lucide-react';
import { BookInfo, FocusSessionState } from '../types';
import {
  getFocusSessionState,
  subscribeToFocusSession,
  toggleFocusTimer,
  formatFocusTime,
  getPageReadingSeconds,
  resetCurrentPageTimer,
  resetTotalSessionTimer,
  setActiveReadingPage,
  playChimeSound,
} from '../data/focusService';

export interface FocusSessionWidgetProps {
  activeBook: BookInfo;
  currentPage: number;
  totalPages?: number;
  onOpenFocusModal?: () => void;
}

export const FocusSessionWidget: React.FC<FocusSessionWidgetProps> = ({
  activeBook,
  currentPage,
  totalPages,
  onOpenFocusModal,
}) => {
  const [sessionState, setSessionState] = useState<FocusSessionState>(() => getFocusSessionState());
  // Starts expanded as requested by the user to appear directly on the site
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [showResetDropdown, setShowResetDropdown] = useState<boolean>(false);
  const resetDropdownRef = useRef<HTMLDivElement>(null);

  // Sync active reading page and subscribe to real-time timer ticks
  useEffect(() => {
    setActiveReadingPage(activeBook.id, currentPage);
    const unsubscribe = subscribeToFocusSession((updatedState) => {
      setSessionState(updatedState);
    });
    return unsubscribe;
  }, [activeBook.id, currentPage]);

  // Handle outside click for reset dropdown menu
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (resetDropdownRef.current && !resetDropdownRef.current.contains(e.target as Node)) {
        setShowResetDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const pageSeconds = getPageReadingSeconds(activeBook.id, currentPage);
  const totalSeconds = sessionState.todaySeconds;
  const goalMinutes = sessionState.dailyGoalMinutes;
  const todayMinutes = Math.floor(totalSeconds / 60);
  const progressPercent = Math.min(100, Math.round((totalSeconds / (goalMinutes * 60)) * 100));
  const remainingGoalMinutes = Math.max(0, goalMinutes - todayMinutes);
  const isGoalAchieved = totalSeconds >= goalMinutes * 60;

  const handleResetCurrentPage = () => {
    resetCurrentPageTimer(activeBook.id, currentPage);
    playChimeSound('start');
    setShowResetDropdown(false);
  };

  const handleResetTotalDay = () => {
    resetTotalSessionTimer();
    playChimeSound('start');
    setShowResetDropdown(false);
  };

  // Minimized Compact Floating Pill
  if (isMinimized) {
    return (
      <div 
        id="focus-session-chrono-minimized"
        className="fixed bottom-4 left-4 z-40 animate-in fade-in slide-in-from-bottom-2 duration-150 font-arabic select-none"
        dir="rtl"
      >
        <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-stone-900/95 text-white border border-amber-500/40 shadow-2xl backdrop-blur-md">
          <button
            onClick={() => setIsMinimized(false)}
            className="flex items-center gap-2 px-2 py-1 rounded-xl text-amber-100 hover:bg-stone-800 transition-colors cursor-pointer"
            title="توسيع كرونو القراءة"
          >
            <div className="relative flex items-center justify-center">
              <Timer className={`w-4 h-4 text-amber-400 ${sessionState.isTimerRunning ? 'animate-pulse' : 'opacity-70'}`} />
              <span
                className={`absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full ${
                  sessionState.isTimerRunning ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                }`}
              />
            </div>
            
            {/* Page Time & Total Time indicators */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="font-bold text-amber-300" title="وقت قراءة الصفحة الحالية">
                {formatFocusTime(pageSeconds)}
              </span>
              <span className="text-stone-500">|</span>
              <span className="font-bold text-emerald-400" title="إجمالي وقت القراءة اليومي">
                {formatFocusTime(totalSeconds)}
              </span>
            </div>

            <ChevronUp className="w-3.5 h-3.5 text-amber-400 mr-0.5" />
          </button>

          {/* Quick Play/Pause on Minimized Pill */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFocusTimer();
            }}
            className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
              sessionState.isTimerRunning
                ? 'bg-amber-700 hover:bg-amber-600 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
            title={sessionState.isTimerRunning ? 'إيقاف مؤقت للكرونو' : 'تشغيل الكرونو'}
          >
            {sessionState.isTimerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    );
  }

  // Expanded In-Reader Chrono Card (matches screenshot 100%)
  return (
    <div
      id="focus-session-chrono-widget"
      className="fixed bottom-4 left-4 z-40 w-80 sm:w-88 bg-white/98 dark:bg-stone-900/98 border-2 border-amber-400/80 dark:border-stone-700 rounded-3xl shadow-2xl backdrop-blur-md overflow-hidden font-arabic text-right transition-all duration-200 animate-in fade-in slide-in-from-bottom-3 select-none"
      dir="rtl"
    >
      {/* Widget Header */}
      <div className="px-4 py-2.5 bg-linear-to-l from-amber-800 via-amber-900 to-stone-900 text-amber-100 flex items-center justify-between border-b border-amber-700/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-xl bg-amber-700/60 border border-amber-500/40 text-amber-200">
            <Timer className={`w-4 h-4 text-amber-300 ${sessionState.isTimerRunning ? 'animate-pulse' : 'opacity-80'}`} />
          </div>
          <div>
            <span className="text-xs font-bold text-white block leading-tight">كرونو القراءة والتركيز (Chrono)</span>
            <span className="text-[10px] text-amber-200/80">تتبع الوقت المباشر وإعادة الضبط</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onOpenFocusModal && (
            <button
              onClick={onOpenFocusModal}
              className="p-1.5 rounded-lg hover:bg-amber-800/80 text-amber-200 hover:text-white transition-colors cursor-pointer"
              title="فتح لوحة تحكم الهدف الكاملة"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 rounded-lg hover:bg-amber-800/80 text-amber-200 hover:text-white transition-colors cursor-pointer"
            title="تصغير الكرونو"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Widget Body */}
      <div className="p-3.5 space-y-3">
        {/* Dual Timers Grid: Page Time vs Total Session Time */}
        <div className="grid grid-cols-2 gap-2">
          {/* Box 1: Time on Current Page */}
          <div className="p-2.5 rounded-2xl bg-amber-50/90 dark:bg-stone-800/90 border border-amber-200/80 dark:border-stone-700 relative overflow-hidden">
            <div className="flex items-center justify-between text-[11px] text-amber-900 dark:text-amber-300 font-bold mb-1">
              <span className="flex items-center gap-1 truncate">
                <BookOpen className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>صفحة {currentPage}:</span>
              </span>
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-amber-200/60 dark:bg-stone-700 text-amber-900 dark:text-amber-200 shrink-0">
                الحالية
              </span>
            </div>

            <div className="text-xl sm:text-2xl font-mono font-black text-amber-950 dark:text-amber-100 tracking-tight my-0.5">
              {formatFocusTime(pageSeconds)}
            </div>

            <div className="text-[10px] text-amber-800/80 dark:text-amber-400 font-medium">
              {formatFocusTime(pageSeconds, 'arabicShort')}
            </div>
          </div>

          {/* Box 2: Total Focus Time Today */}
          <div className="p-2.5 rounded-2xl bg-emerald-50/90 dark:bg-stone-800/90 border border-emerald-200/80 dark:border-stone-700 relative overflow-hidden">
            <div className="flex items-center justify-between text-[11px] text-emerald-900 dark:text-emerald-300 font-bold mb-1">
              <span className="flex items-center gap-1 truncate">
                <Timer className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>الوقت الكلي:</span>
              </span>
              <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-emerald-200/60 dark:bg-stone-700 text-emerald-900 dark:text-emerald-200 shrink-0">
                المجموع
              </span>
            </div>

            <div className="text-xl sm:text-2xl font-mono font-black text-emerald-950 dark:text-emerald-100 tracking-tight my-0.5">
              {formatFocusTime(totalSeconds)}
            </div>

            <div className="text-[10px] text-emerald-800/80 dark:text-emerald-400 font-medium">
              {isGoalAchieved ? 'تم إنجاز الهدف ✓' : `${remainingGoalMinutes} دقيقة متبقية`}
            </div>
          </div>
        </div>

        {/* Action Buttons: Play/Pause Toggle & Reset Dropdown */}
        <div className="flex items-center gap-2">
          {/* Main Play / Pause Button */}
          <button
            onClick={() => toggleFocusTimer()}
            className={`flex-1 py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer ${
              sessionState.isTimerRunning
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            {sessionState.isTimerRunning ? (
              <>
                <Pause className="w-4 h-4" />
                <span>إيقاف مؤقت للكرونو</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>تشغيل / متابعة الكرونو</span>
              </>
            )}
          </button>

          {/* Reset Options Button & Dropdown */}
          <div className="relative" ref={resetDropdownRef}>
            <button
              onClick={() => setShowResetDropdown((prev) => !prev)}
              className="py-2 px-3 rounded-xl border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="خيارات إعادة ضبط الوقت"
            >
              <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
              <span>إعادة الضبط</span>
            </button>

            {showResetDropdown && (
              <div className="absolute left-0 bottom-full mb-1.5 w-48 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl shadow-xl p-1 z-50 text-xs font-arabic animate-in fade-in zoom-in-95 duration-100">
                <button
                  onClick={handleResetCurrentPage}
                  className="w-full text-right px-3 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 flex items-center justify-between cursor-pointer"
                >
                  <span>تصفير وقت هذه الصفحة</span>
                  <RotateCcw className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                </button>
                <button
                  onClick={handleResetTotalDay}
                  className="w-full text-right px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-between cursor-pointer"
                >
                  <span>تصفير إجمالي وقت اليوم</span>
                  <RefreshCw className="w-3 h-3 text-red-500" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Daily Goal Visual Progress Bar */}
        <div className="p-2.5 rounded-xl bg-stone-50 dark:bg-stone-800/60 border border-stone-200/80 dark:border-stone-700/80 space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-medium text-stone-700 dark:text-stone-300">
            <span>الهدف اليومي [{goalMinutes} د]:</span>
            <span className="font-mono font-bold text-amber-900 dark:text-amber-300">
              {todayMinutes} / {goalMinutes} د ({progressPercent}%)
            </span>
          </div>

          <div className="w-full h-2 rounded-full bg-stone-200 dark:bg-stone-700 overflow-hidden relative">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isGoalAchieved
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]'
                  : 'bg-linear-to-r from-amber-600 to-amber-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Footer: Streak & Full Dashboard Launcher */}
        <div className="flex items-center justify-between pt-1 border-t border-stone-200/70 dark:border-stone-800 text-[11px] text-stone-500 dark:text-stone-400 font-arabic">
          <div className="flex items-center gap-1 text-amber-800 dark:text-amber-400 font-bold">
            <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
            <span>سلسلة إنجاز: {sessionState.streakDays} أيام</span>
          </div>

          {onOpenFocusModal && (
            <button
              onClick={onOpenFocusModal}
              className="text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 font-bold cursor-pointer hover:underline"
            >
              لوحة التحكم الكاملة ↗
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
