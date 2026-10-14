# Implementation Plan: Restricting Translation to Selection Only

## Goal
Modify the application to translate ONLY the user-selected text when a selection is active, instead of the entire page content. Maintain the existing translation UI panel.

## Changes Required

### 1. Frontend (`src/components/ReaderView.tsx`)
- Detect user selection using `window.getSelection().toString()`.
- Update the translation trigger logic to check if a valid selection exists.
- If a selection exists, send ONLY that text to the API.
- Update the translation panel to display the result for the selected text.

### 2. Backend (`server.ts`)
- Modify the `/api/translate` endpoint to detect if the request contains specific selection text.
- If specific selection text is provided, skip the paragraph-based chunking/matching logic and translate the provided text directly as a "SENTENCE" or "WORD" type.

## Verification Steps
1. Perform a text selection in the reader view.
2. Trigger the translation button.
3. Verify that the translation panel displays the translation for the selected text only, and not the full page.
4. Verify that the API payload sent to `/api/translate` contains only the selected text.
