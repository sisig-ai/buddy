import { sanitizeText } from '../shared/utils.js';

export class PageParser {
  static extractPageContent(): string {
    // Remove script and style elements
    const elementsToRemove = document.querySelectorAll('script, style, noscript');
    const hiddenElements: HTMLElement[] = [];

    // Temporarily hide removed elements
    elementsToRemove.forEach(el => {
      if (el instanceof HTMLElement) {
        hiddenElements.push(el);
        el.style.display = 'none';
      }
    });

    try {
      // Get main content areas, prioritizing semantic elements
      const contentSelectors = [
        'main',
        'article',
        '[role="main"]',
        '.content',
        '.main-content',
        '#content',
        '#main',
        'body',
      ];

      let mainContent = '';

      for (const selector of contentSelectors) {
        const element = document.querySelector(selector);
        if (element && this.hasSignificantContent(element)) {
          mainContent = this.extractTextFromElement(element);
          break;
        }
      }

      // Fallback to body if no main content found
      if (!mainContent) {
        mainContent = this.extractTextFromElement(document.body);
      }

      return this.cleanAndFormatText(mainContent);
    } finally {
      // Restore hidden elements
      hiddenElements.forEach(el => {
        el.style.display = '';
      });
    }
  }

  static extractSelectedText(): string {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return '';
    }

    const range = selection.getRangeAt(0);
    const content = range.toString();

    return this.cleanAndFormatText(content);
  }

  static getCurrentSelection(): Selection | null {
    return window.getSelection();
  }

  static getSelectionRange(): Range | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }
    return selection.getRangeAt(0);
  }

  private static extractTextFromElement(element: Element): string {
    // Skip common non-content elements
    const skipSelectors = [
      'nav',
      'header',
      'footer',
      'aside',
      '.navigation',
      '.nav',
      '.menu',
      '.sidebar',
      '.advertisement',
      '.ads',
      '.social-share',
      '.comments',
      '.related-posts',
      '.breadcrumb',
      '[aria-hidden="true"]',
      '.sr-only',
      '.hidden',
    ];

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: node => {
          if (node.nodeType === Node.TEXT_NODE) {
            return NodeFilter.FILTER_ACCEPT;
          }

          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element;

            // Skip elements that are likely not content
            if (skipSelectors.some(selector => element.matches(selector))) {
              return NodeFilter.FILTER_REJECT;
            }

            // Skip hidden elements
            if (element instanceof HTMLElement) {
              const style = window.getComputedStyle(element);
              if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                style.opacity === '0'
              ) {
                return NodeFilter.FILTER_REJECT;
              }
            }

            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_SKIP;
        },
      }
    );

    const textParts: string[] = [];
    let node: Node | null;

    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent?.trim();
        if (text && text.length > 2) {
          textParts.push(text);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;

        // Add spacing for block elements
        if (this.isBlockElement(element)) {
          textParts.push('\n');
        }
      }
    }

    return textParts.join(' ');
  }

  private static isBlockElement(element: Element): boolean {
    const blockElements = [
      'div',
      'p',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'article',
      'section',
      'aside',
      'header',
      'footer',
      'main',
      'nav',
      'blockquote',
      'pre',
      'ul',
      'ol',
      'li',
    ];

    return blockElements.includes(element.tagName.toLowerCase());
  }

  private static hasSignificantContent(element: Element): boolean {
    const text = element.textContent || '';
    const wordCount = text.trim().split(/\s+/).length;
    return wordCount > 50; // Minimum word count for significant content
  }

  private static cleanAndFormatText(text: string): string {
    return (
      text
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        // Remove excessive line breaks
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        // Clean up common artifacts
        .replace(/\u00A0/g, ' ') // Non-breaking spaces
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // Zero-width characters
        // Trim
        .trim()
    );
  }

  static getPageTitle(): string {
    return document.title || 'Untitled Page';
  }

  static getPageUrl(): string {
    return window.location.href;
  }

  static getPageMetadata(): { title: string; url: string; domain: string } {
    return {
      title: this.getPageTitle(),
      url: this.getPageUrl(),
      domain: window.location.hostname,
    };
  }
}
