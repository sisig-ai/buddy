import { StorageManager } from '../shared/storage-manager.js';

export class BrowserActionHandler {
  private cursorElement: HTMLElement | null = null;
  private storage = StorageManager.getInstance();

  constructor() {
    this.initCursor();
  }

  private initCursor() {
    // Create a visual cursor indicator
    this.cursorElement = document.createElement('div');
    this.cursorElement.id = 'buddy-cursor-indicator';
    this.cursorElement.style.cssText = `
      position: fixed;
      width: 20px;
      height: 20px;
      border: 3px solid #1a73e8;
      border-radius: 50%;
      background: rgba(26, 115, 232, 0.2);
      pointer-events: none;
      z-index: 999999;
      display: none;
      transition: all 0.3s ease;
    `;
    document.body.appendChild(this.cursorElement);
  }

  private showCursor(x: number, y: number) {
    if (this.cursorElement) {
      this.cursorElement.style.display = 'block';
      this.cursorElement.style.left = `${x - 10}px`;
      this.cursorElement.style.top = `${y - 10}px`;
    }
  }

  private hideCursor() {
    if (this.cursorElement) {
      this.cursorElement.style.display = 'none';
    }
  }

  private async animateCursorTo(element: Element) {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    this.showCursor(x, y);
    
    // Animate cursor movement
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async capturePageSnapshot(): Promise<string> {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'CAPTURE_VISIBLE_TAB' },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.dataUrl);
          }
        }
      );
    });
  }

  getDomSnapshot(): string {
    const elements: any[] = [];
    const interactive = ['a', 'button', 'input', 'select', 'textarea'];
    
    // Get all visible elements
    const allElements = document.querySelectorAll('*');
    allElements.forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      const styles = window.getComputedStyle(element);
      
      // Skip invisible elements
      if (rect.width === 0 || rect.height === 0 || styles.display === 'none' || styles.visibility === 'hidden') {
        return;
      }
      
      // Skip elements outside viewport
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        return;
      }
      
      const elementInfo: any = {
        tagName: element.tagName.toLowerCase(),
        index: index,
        id: element.id || undefined,
        className: element.className || undefined,
        text: element.textContent?.trim().substring(0, 100) || undefined,
        position: {
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
      
      // Add specific attributes for interactive elements
      if (interactive.includes(element.tagName.toLowerCase())) {
        elementInfo.interactive = true;
        if (element.tagName === 'A') {
          elementInfo.href = (element as HTMLAnchorElement).href;
        }
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          elementInfo.inputType = (element as HTMLInputElement).type;
          elementInfo.placeholder = (element as HTMLInputElement).placeholder;
          elementInfo.value = (element as HTMLInputElement).value;
        }
      }
      
      elements.push(elementInfo);
    });
    
    return JSON.stringify({
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      elements: elements,
    }, null, 2);
  }

  async findElement(elementText?: string, elementId?: string, exact: boolean = true): Promise<Element | null> {
    // First try by ID
    if (elementId) {
      const element = document.getElementById(elementId);
      if (element) return element;
    }
    
    // Then try by text, prioritizing clickable elements
    if (elementText) {
      // First pass: try clickable elements
      const clickableSelectors = ['a', 'button', 'input[type="button"]', 'input[type="submit"]', '[role="button"]', '[onclick]'];
      for (const selector of clickableSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const text = element.textContent?.trim();
          if (!text) continue;
          
          if (exact) {
            if (text === elementText) return element;
          } else {
            if (text.includes(elementText)) return element;
          }
        }
      }
      
      // Second pass: try all elements
      const allElements = document.querySelectorAll('*');
      for (const element of allElements) {
        const text = element.textContent?.trim();
        if (!text) continue;
        
        // Skip if element has child elements with text (to avoid parent containers)
        const hasTextChildren = Array.from(element.children).some(child => 
          child.textContent && child.textContent.trim().length > 0
        );
        if (hasTextChildren) continue;
        
        if (exact) {
          if (text === elementText) return element;
        } else {
          if (text.includes(elementText)) return element;
        }
      }
    }
    
    return null;
  }

  async click(elementText?: string, elementId?: string, exact: boolean = true): Promise<void> {
    const element = await this.findElement(elementText, elementId, exact);
    
    if (!element) {
      throw new Error(`Element not found: ${elementId || elementText}`);
    }
    
    // Animate cursor to element
    await this.animateCursorTo(element);
    
    // Highlight element
    const originalBorder = (element as HTMLElement).style.border;
    (element as HTMLElement).style.border = '3px solid #1a73e8';
    
    // Wait for animation
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Focus the element if it's focusable
    if (element instanceof HTMLElement && typeof element.focus === 'function') {
      element.focus();
    }
    
    // Get element position for mouse events
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    // Create and dispatch mouse events
    const mousedownEvent = new MouseEvent('mousedown', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0
    });
    
    const mouseupEvent = new MouseEvent('mouseup', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0
    });
    
    const clickEvent = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0
    });
    
    // Dispatch events
    element.dispatchEvent(mousedownEvent);
    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between events
    element.dispatchEvent(mouseupEvent);
    await new Promise(resolve => setTimeout(resolve, 50));
    element.dispatchEvent(clickEvent);
    
    // Check if this is a link that will navigate
    const isNavigationLink = element instanceof HTMLAnchorElement && 
      element.href && 
      !element.href.startsWith('#') && 
      !element.href.startsWith('javascript:') &&
      element.target !== '_blank';
    
    // If it's a navigation link, set navigation state
    if (isNavigationLink) {
      await this.storage.setNavigationState({
        pending: true,
        reopenSidebar: true,
        timestamp: Date.now()
      });
    }
    
    // For links and buttons, try the native click as well
    if (element instanceof HTMLElement && (element.tagName === 'A' || element.tagName === 'BUTTON' || element.tagName === 'INPUT')) {
      element.click();
    }
    
    // Restore original border
    setTimeout(() => {
      (element as HTMLElement).style.border = originalBorder;
      this.hideCursor();
    }, 500);
  }

  async typeText(text: string): Promise<void> {
    const activeElement = document.activeElement;
    if (!activeElement || !['INPUT', 'TEXTAREA'].includes(activeElement.tagName)) {
      throw new Error('No input element is focused');
    }
    
    // Show cursor at active element
    await this.animateCursorTo(activeElement);
    
    // Type text character by character
    for (const char of text) {
      const event = new KeyboardEvent('keydown', { key: char });
      activeElement.dispatchEvent(event);
      
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement) {
        activeElement.value += char;
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      }
      
      // Human-like typing delay
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
    }
    
    this.hideCursor();
  }

  async scrollDown(): Promise<void> {
    window.scrollBy({
      top: window.innerHeight,
      behavior: 'smooth'
    });
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  async scrollUp(): Promise<void> {
    window.scrollBy({
      top: -window.innerHeight,
      behavior: 'smooth'
    });
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  cleanup() {
    if (this.cursorElement) {
      this.cursorElement.remove();
    }
  }
}