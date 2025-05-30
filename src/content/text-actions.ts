export class TextActions {
  private static savedRange: Range | null = null;

  static copyToClipboard(text: string): Promise<boolean> {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          return successful;
        } catch {
          document.body.removeChild(textArea);
          return false;
        }
      });
  }

  static saveCurrentSelection(): void {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      this.savedRange = selection.getRangeAt(0).cloneRange();
    }
  }

  static restoreSelection(): boolean {
    if (!this.savedRange) {
      return false;
    }

    try {
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(this.savedRange);
        return true;
      }
    } catch (error) {
      console.warn('Failed to restore selection:', error);
    }
    return false;
  }

  static replaceSelectedText(newText: string): boolean {
    if (!this.savedRange) {
      console.warn('No saved selection to replace');
      return false;
    }

    try {
      // Check if the range is still valid
      if (!this.isRangeValid(this.savedRange)) {
        console.warn('Saved selection is no longer valid');
        return false;
      }

      // Delete the selected content
      this.savedRange.deleteContents();

      // Create a text node with the new content
      const textNode = document.createTextNode(newText);
      this.savedRange.insertNode(textNode);

      // Position cursor after the inserted text
      this.savedRange.setStartAfter(textNode);
      this.savedRange.setEndAfter(textNode);

      // Update the selection
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(this.savedRange);
      }

      return true;
    } catch (error) {
      console.error('Failed to replace selected text:', error);
      return false;
    }
  }

  static insertAtCursor(text: string): boolean {
    try {
      // Try to use the current selection first
      const selection = window.getSelection();
      let range: Range | null = null;

      if (selection && selection.rangeCount > 0) {
        range = selection.getRangeAt(0);
      } else if (this.savedRange && this.isRangeValid(this.savedRange)) {
        range = this.savedRange;
      } else {
        // Try to find an active input element
        const activeElement = document.activeElement;
        if (activeElement && this.isTextInput(activeElement)) {
          return this.insertIntoInput(
            activeElement as HTMLInputElement | HTMLTextAreaElement,
            text
          );
        }
        console.warn('No valid cursor position found');
        return false;
      }

      if (range) {
        // Collapse the range to insertion point
        range.collapse(false);

        // Insert the text
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);

        // Position cursor after the inserted text
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);

        // Update selection
        if (selection) {
          selection.removeAllRanges();
          selection.addRange(range);
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to insert text at cursor:', error);
      return false;
    }
  }

  private static isRangeValid(range: Range): boolean {
    try {
      // Check if the range's start and end containers are still in the document
      return document.contains(range.startContainer) && document.contains(range.endContainer);
    } catch {
      return false;
    }
  }

  private static isTextInput(element: Element): boolean {
    if (element instanceof HTMLInputElement) {
      const inputTypes = ['text', 'email', 'password', 'search', 'tel', 'url'];
      return inputTypes.includes(element.type);
    }
    return element instanceof HTMLTextAreaElement || element.contentEditable === 'true';
  }

  private static insertIntoInput(
    element: HTMLInputElement | HTMLTextAreaElement,
    text: string
  ): boolean {
    try {
      const start = element.selectionStart || 0;
      const end = element.selectionEnd || 0;
      const currentValue = element.value;

      element.value = currentValue.slice(0, start) + text + currentValue.slice(end);

      // Position cursor after inserted text
      const newPosition = start + text.length;
      element.setSelectionRange(newPosition, newPosition);
      element.focus();

      // Trigger input event for reactivity
      element.dispatchEvent(new Event('input', { bubbles: true }));

      return true;
    } catch (error) {
      console.error('Failed to insert into input element:', error);
      return false;
    }
  }

  static getSelectedText(): string {
    const selection = window.getSelection();
    return selection ? selection.toString() : '';
  }

  static hasSelection(): boolean {
    const selection = window.getSelection();
    return !!(selection && selection.toString().trim());
  }

  static clearSavedSelection(): void {
    this.savedRange = null;
  }

  static focusElement(element: Element): boolean {
    try {
      if (element instanceof HTMLElement) {
        element.focus();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  static scrollToElement(element: Element, behavior: 'auto' | 'smooth' = 'smooth'): void {
    element.scrollIntoView({
      behavior,
      block: 'center',
      inline: 'nearest',
    });
  }
}
