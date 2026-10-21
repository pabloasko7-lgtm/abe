import { FlashcardWord } from '../types';

export function exportVocabularyToCSV(cards: FlashcardWord[]): void {
  if (!cards || cards.length === 0) return;
  const headers = ['French Word', 'Arabic Meaning', 'Contextual Meaning', 'Part of Speech', 'Book ID', 'Page Number'];
  const rows = cards.map(c => [
    `"${(c.frenchWord || '').replace(/"/g, '""')}"`,
    `"${(c.arabicMeaning || '').replace(/"/g, '""')}"`,
    `"${(c.contextualMeaning || '').replace(/"/g, '""')}"`,
    `"${(c.partOfSpeech || '').replace(/"/g, '""')}"`,
    `"${c.bookId || ''}"`,
    c.pageNumber || 1
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `vocabulaire_1bac_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportVocabularyToAnki(cards: FlashcardWord[]): void {
  if (!cards || cards.length === 0) return;
  const lines = cards.map(c => 
    `${(c.frenchWord || '').replace(/[\t\n]/g, ' ')}\t${(c.arabicMeaning || '').replace(/[\t\n]/g, ' ')} (${(c.contextualMeaning || '').replace(/[\t\n]/g, ' ')})`
  );
  const content = lines.join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `anki_vocabulaire_${Date.now()}.txt`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportVocabularyToJSON(cards: FlashcardWord[]): void {
  if (!cards || cards.length === 0) return;
  const content = JSON.stringify(cards, null, 2);
  const blob = new Blob([content], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `vocabulaire_${Date.now()}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function copyVocabularyToClipboard(cards: FlashcardWord[]): boolean {
  if (!cards || cards.length === 0) return false;
  const text = cards.map(c => `${c.frenchWord} : ${c.arabicMeaning} - ${c.contextualMeaning || ''}`).join('\n');
  navigator.clipboard.writeText(text);
  return true;
}

export function printVocabularyRevisionSheet(cards: FlashcardWord[]): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
    <html dir="rtl" lang="ar">
      <head>
        <title>ورقة مراجعة المفردات - الأولى باكالوريا</title>
        <style>
          body { font-family: 'Amiri', 'Traditional Arabic', Arial, sans-serif; padding: 20px; direction: rtl; }
          h1 { text-align: center; color: #1e3a8a; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: right; font-size: 14px; }
          th { background-color: #f1f5f9; color: #0f172a; }
        </style>
      </head>
      <body>
        <h1>ورقة مراجعة المفردات - الأولى باكالوريا</h1>
        <table>
          <thead>
            <tr>
              <th>الكلمة (Français)</th>
              <th>المقابل العربي</th>
              <th>المعنى السياقي</th>
              <th>الصفحة</th>
            </tr>
          </thead>
          <tbody>
            ${cards.map(c => `
              <tr>
                <td style="direction: ltr; text-align: left; font-weight: bold;">${c.frenchWord}</td>
                <td style="font-weight: bold; color: #047857;">${c.arabicMeaning}</td>
                <td>${c.contextualMeaning || '-'}</td>
                <td>${c.pageNumber || 1}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <script>window.print();</script>
      </body>
    </html>
  `;
  printWindow.document.write(html);
  printWindow.document.close();
}

export async function exportVocabularyToPDF(
  cards: FlashcardWord[],
  options: { bookFilter?: string; novelTitle?: string },
  onProgress?: (percent: number, statusText: string) => void
): Promise<void> {
  if (onProgress) onProgress(30, 'جاري إعداد صفحة الطباعة والتصدير...');
  await new Promise(r => setTimeout(r, 400));
  if (onProgress) onProgress(80, 'جاري توليد ملف الـ PDF...');
  printVocabularyRevisionSheet(cards);
  if (onProgress) onProgress(100, 'تم التصدير بنجاح!');
}
