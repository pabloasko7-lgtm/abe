export interface SelectionManager {
  getSelectedText(): string | null;
  getSelectionRange(): { top: number; left: number } | null;
  clearSelection(): void;
  updateSelection(container: HTMLElement): void;
}

export const createSelectionManager = (): SelectionManager => {
  let currentSelection: string | null = null;
  let currentRange: { top: number; left: number } | null = null;

  return {
    getSelectedText: () => currentSelection,
    getSelectionRange: () => currentRange,
    clearSelection: () => {
      currentSelection = null;
      currentRange = null;
      window.getSelection()?.removeAllRanges();
    },
    updateSelection: (container: HTMLElement) => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        currentSelection = null;
        currentRange = null;
        return;
      }

      const range = selection.getRangeAt(0);
      
      // Check if selection starts or ends within the container
      const isStartIn = container.contains(range.startContainer);
      const isEndIn = container.contains(range.endContainer);
      
      if (!isStartIn || !isEndIn) {
        // If selection spans outside container, we can either restrict it 
        // to the container (hard) or just ignore (easier).
        // Let's just ignore for now to avoid accidental bleed.
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        currentSelection = null;
        currentRange = null;
        return;
      }

      currentSelection = text;
      
      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      
      if (rect.width > 0 && rect.height > 0) {
        const floatingToolbarWidth = 340;
        const relativeTop = rect.top - containerRect.top;
        const relativeLeft = rect.left - containerRect.left;

        currentRange = {
          top: Math.max(6, relativeTop - 64),
          left: Math.max(
            10,
            Math.min(
              containerRect.width - floatingToolbarWidth - 10,
              relativeLeft + rect.width / 2 - floatingToolbarWidth / 2
            )
          ),
        };
      }
    }
  };
};
