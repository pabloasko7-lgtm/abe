import React, { useState, useEffect, useRef } from 'react';
import { 
  Monitor, Laptop, Smartphone, Tablet, Sparkles, Check, 
  Tv, Maximize2, X, ChevronDown, CheckCircle2 
} from 'lucide-react';

export type ScreenResolutionId = 
  | 'auto' 
  | 'laptop-1366' 
  | 'desktop-1080' 
  | 'macbook-1440' 
  | 'tablet-768' 
  | 'mobile-390' 
  | 'compact-75';

export interface ScreenResolutionOption {
  id: ScreenResolutionId;
  nameArabic: string;
  nameFrench: string;
  dimensions: string;
  icon: React.ReactNode;
  description: string;
  containerClass: string;
  scaleClass?: string;
  badge?: string;
}

export const RESOLUTION_PRESETS: ScreenResolutionOption[] = [
  {
    id: 'compact-75',
    nameArabic: 'حاسوب محمول قياسي 75% (الموصى به)',
    nameFrench: 'Laptop 1366×768 (Zoom 75%)',
    dimensions: '75% (تناسق 1080p)',
    icon: <Laptop className="w-4 h-4 text-amber-500" />,
    description: 'المقاس القياسي لأجهزة 1366×768: تصغير الأشرطة والأزرار 25% تلقائياً لتظهر بأحجام معقولة تماماً كشاشات 1920×1080 دون قص.',
    containerClass: 'res-container-auto',
    scaleClass: 'res-scale-75',
    badge: 'المقاس الموصى به',
  },
  {
    id: 'laptop-1366',
    nameArabic: 'حاسوب محمول مدمج 80%',
    nameFrench: 'Laptop 1366×768 (Zoom 80%)',
    dimensions: '80% Zoom',
    icon: <Laptop className="w-4 h-4 text-teal-500" />,
    description: 'تصغير بنسبة 20% لتناسب مريح ومتوازن بين الأشرطة العلوية وصفحة الرواية.',
    containerClass: 'res-container-auto',
    scaleClass: 'res-scale-80',
  },
  {
    id: 'desktop-1080',
    nameArabic: 'شاشة مكتبية Full HD (1920×1080)',
    nameFrench: 'Écran Desktop 1080p (100%)',
    dimensions: '1920 × 1080 px',
    icon: <Monitor className="w-4 h-4 text-blue-500" />,
    description: 'عرض كامل بنسبة 100% مخصص للشاشات المكتبية والتلفزيونات الذكية بدقة عالية.',
    containerClass: 'res-container-desktop',
    scaleClass: 'res-scale-100',
  },
  {
    id: 'auto',
    nameArabic: 'تلقائي (حسب متصفحك الحقيقي)',
    nameFrench: 'Automatique (100% Fluid)',
    dimensions: '100% Fluid',
    icon: <Sparkles className="w-4 h-4 text-emerald-500" />,
    description: 'يتكيف بنسبة 100% طبيعية مع أبعاد نافذتك دون أي تصغير إضافي.',
    containerClass: 'res-container-auto',
    scaleClass: 'res-scale-100',
  },
  {
    id: 'tablet-768',
    nameArabic: 'جهاز لوحي / آيباد',
    nameFrench: 'Tablette / iPad',
    dimensions: '1024 × 768 px',
    icon: <Tablet className="w-4 h-4 text-teal-500" />,
    description: 'عرض مدمج مناسب للقراءة العمودية والأفقية على الأجهزة اللوحية.',
    containerClass: 'res-container-tablet',
  },
  {
    id: 'mobile-390',
    nameArabic: 'هاتف ذكي',
    nameFrench: 'Smartphone Mobile',
    dimensions: '390 × 844 px',
    icon: <Smartphone className="w-4 h-4 text-rose-500" />,
    description: 'محاكاة شاشة الهاتف الذكي لقراءة سريعة ومريحة بحجم الجيب.',
    containerClass: 'res-container-mobile',
  },
];

interface ScreenResolutionSelectorProps {
  currentResolution: ScreenResolutionId;
  onSelectResolution: (id: ScreenResolutionId) => void;
}

export const ScreenResolutionSelector: React.FC<ScreenResolutionSelectorProps> = ({
  currentResolution,
  onSelectResolution,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [liveDimensions, setLiveDimensions] = useState<{ width: number; height: number }>({
    width: typeof window !== 'undefined' ? window.innerWidth : 1280,
    height: typeof window !== 'undefined' ? window.innerHeight : 720,
  });
  const popoverRef = useRef<HTMLDivElement>(null);

  // Track live window resizing
  useEffect(() => {
    const handleResize = () => {
      setLiveDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const activeOption = RESOLUTION_PRESETS.find((r) => r.id === currentResolution) || RESOLUTION_PRESETS[0];

  return (
    <div className="relative" ref={popoverRef}>
      {/* Trigger Button in Navbar */}
      <button
        id="screen-resolution-btn"
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-arabic font-bold transition-all duration-200 cursor-pointer shadow-xs ${
          isOpen
            ? 'bg-amber-300 dark:bg-stone-700 border-amber-400 dark:border-stone-600 text-amber-950 dark:text-amber-100 ring-2 ring-amber-400/40'
            : 'bg-amber-100/90 hover:bg-amber-200/90 dark:bg-stone-800 dark:hover:bg-stone-750 border-amber-300/80 dark:border-stone-700 text-amber-950 dark:text-stone-200'
        }`}
        title="اختيار دقة الشاشة المناسبة لتنظيم العرض ومنع قص أي عنصر"
        aria-label="اختيار دقة ومقاس الشاشة"
      >
        <span className="shrink-0">{activeOption.icon}</span>
        <span className="hidden sm:inline-block max-w-[150px] truncate">
          {activeOption.id === 'compact-75'
            ? 'شاشة 75% (حاسوب قياسي)'
            : activeOption.id === 'laptop-1366'
            ? 'شاشة 80% (مدمج)'
            : activeOption.id === 'desktop-1080'
            ? 'شاشة 1080p (ديسكتوب)'
            : activeOption.id === 'auto'
            ? `تلقائي (${liveDimensions.width}×${liveDimensions.height})`
            : activeOption.nameArabic}
        </span>
        <span className="sm:hidden font-bold">
          {activeOption.id === 'compact-75' ? '75%' : activeOption.dimensions.split(' ')[0]}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Resolution Dropdown Popover */}
      {isOpen && (
        <div
          dir="rtl"
          className="absolute left-0 sm:left-auto sm:right-0 mt-2 w-76 sm:w-88 p-3 rounded-2xl bg-white dark:bg-stone-900 border-2 border-amber-300/90 dark:border-stone-700 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 font-arabic text-stone-800 dark:text-stone-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-amber-200/70 dark:border-stone-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-stone-800 text-amber-800 dark:text-amber-300 flex items-center justify-center">
                <Monitor className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-xs sm:text-sm text-stone-900 dark:text-stone-100">
                  تنظيم أبعاد ودقة الشاشة
                </h4>
                <p className="text-[10px] text-stone-500 dark:text-stone-400">
                  شاشتك الحالية: <span className="font-mono font-bold text-amber-800 dark:text-amber-400">{liveDimensions.width} × {liveDimensions.height} px</span>
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick 1-Click Scale Selector (تبديل فوري لتصغير الأشرطة بنقرة واحدة) */}
          <div className="py-2.5 border-b border-amber-200/60 dark:border-stone-800">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold text-stone-700 dark:text-stone-300">
                ⚡ مقاس العرض السريع (الأشرطة والأزرار):
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onSelectResolution('compact-75');
                  setIsOpen(false);
                }}
                className={`p-1.5 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center cursor-pointer border ${
                  currentResolution === 'compact-75'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-400/50'
                    : 'bg-amber-50 hover:bg-amber-100 dark:bg-stone-800 dark:hover:bg-stone-750 text-amber-950 dark:text-amber-200 border-amber-200 dark:border-stone-700'
                }`}
              >
                <span className="text-[11px]">75% (حاسوب)</span>
                <span className={`text-[9px] ${currentResolution === 'compact-75' ? 'text-amber-100' : 'text-stone-500 dark:text-stone-400'}`}>تصغير 25% تلقائي</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectResolution('laptop-1366');
                  setIsOpen(false);
                }}
                className={`p-1.5 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center cursor-pointer border ${
                  currentResolution === 'laptop-1366'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-400/50'
                    : 'bg-stone-50 hover:bg-stone-100 dark:bg-stone-800 dark:hover:bg-stone-750 text-stone-800 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                }`}
              >
                <span className="text-[11px]">80% (مدمج)</span>
                <span className={`text-[9px] ${currentResolution === 'laptop-1366' ? 'text-amber-100' : 'text-stone-500 dark:text-stone-400'}`}>عرض متوازن</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onSelectResolution('desktop-1080');
                  setIsOpen(false);
                }}
                className={`p-1.5 rounded-xl text-xs font-bold transition-all text-center flex flex-col items-center cursor-pointer border ${
                  currentResolution === 'desktop-1080'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-xs ring-2 ring-amber-400/50'
                    : 'bg-stone-50 hover:bg-stone-100 dark:bg-stone-800 dark:hover:bg-stone-750 text-stone-800 dark:text-stone-200 border-stone-200 dark:border-stone-700'
                }`}
              >
                <span className="text-[11px]">100% (شاشة كبيرة)</span>
                <span className={`text-[9px] ${currentResolution === 'desktop-1080' ? 'text-amber-100' : 'text-stone-500 dark:text-stone-400'}`}>1080p عادي</span>
              </button>
            </div>
          </div>

          {/* Resolutions List */}
          <div className="space-y-1.5 py-2 max-h-[360px] overflow-y-auto">
            {RESOLUTION_PRESETS.map((preset) => {
              const isSelected = currentResolution === preset.id;
              return (
                <button
                  key={preset.id}
                  id={`res-option-${preset.id}`}
                  onClick={() => {
                    onSelectResolution(preset.id);
                    setIsOpen(false);
                  }}
                  className={`w-full p-2.5 rounded-xl border text-right transition-all flex items-start gap-2.5 cursor-pointer ${
                    isSelected
                      ? 'bg-amber-100/90 dark:bg-stone-800 border-amber-400 dark:border-amber-500 shadow-xs ring-1 ring-amber-400'
                      : 'bg-stone-50/70 dark:bg-stone-850/60 hover:bg-amber-50 dark:hover:bg-stone-800 border-stone-200 dark:border-stone-750'
                  }`}
                >
                  <div className="w-7 h-7 rounded-lg bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 flex items-center justify-center shrink-0 mt-0.5">
                    {preset.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-bold ${isSelected ? 'text-amber-950 dark:text-amber-200' : 'text-stone-900 dark:text-stone-100'}`}>
                          {preset.nameArabic}
                        </span>
                        {preset.badge && (
                          <span className="px-1.5 py-0.2 rounded-full text-[9.5px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                            {preset.badge}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-stone-500 dark:text-stone-400 shrink-0">
                        {preset.dimensions}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-stone-500 dark:text-stone-400 leading-snug mt-0.5">
                      {preset.description}
                    </p>
                  </div>
                  {isSelected && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-1" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Notice */}
          <div className="pt-2 border-t border-amber-100 dark:border-stone-800 text-[10px] text-stone-500 dark:text-stone-400 text-center font-arabic">
            اختر دقة جهازك لتنظيم العناصر والمساحات بدقة تامة دون أي قص.
          </div>
        </div>
      )}
    </div>
  );
};
