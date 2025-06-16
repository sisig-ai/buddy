import { BUDDY_CONFIG, BUDDY_EVENTS } from '../shared/constants.js';
import { StorageManager } from '../shared/storage-manager.js';
import { debounce } from '../shared/utils.js';
import { PageParser } from './page-parser.js';

export class BuddySidebar {
  private sidebar: HTMLElement | null = null;
  private isOpen = false;
  private isResizing = false;
  private currentWidth: number = BUDDY_CONFIG.SIDEBAR_DEFAULT_WIDTH;
  private storage = StorageManager.getInstance();
  private resizeHandle: HTMLElement | null = null;

  async init() {
    this.setupEventListeners();
    await this.loadSettings();
  }

  private setupEventListeners() {
    // Listen for toggle events from icon
    document.addEventListener(BUDDY_EVENTS.TOGGLE_SIDEBAR, async () => {
      await this.toggle();
    });

    // Listen for resize events
    window.addEventListener(
      'resize',
      debounce(() => {
        this.handleWindowResize();
      }, 250)
    );

    // Listen for escape key to close sidebar
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });
  }

  private async loadSettings() {
    const settings = await this.storage.getSettings();
    this.currentWidth = settings.sidebarWidth as number;
  }

  private createSidebar() {
    if (this.sidebar) {
      return;
    }

    this.sidebar = document.createElement('div');
    this.sidebar.id = 'buddy-sidebar';
    this.sidebar.className = 'buddy-sidebar buddy-container';
    this.sidebar.style.width = `${this.currentWidth}px`;

    // Create resize handle
    this.resizeHandle = document.createElement('div');
    this.resizeHandle.className = 'buddy-resize-handle';
    this.sidebar.appendChild(this.resizeHandle);

    // Create sidebar content iframe
    const iframe = document.createElement('iframe');
    iframe.id = 'buddy-sidebar-content';
    iframe.src = chrome.runtime.getURL('src/sidebar/sidebar.html');
    iframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: white;
    `;

    this.sidebar.appendChild(iframe);

    // Setup resize functionality
    this.setupResizeHandlers();

    document.body.appendChild(this.sidebar);
  }

  private setupResizeHandlers() {
    if (!this.resizeHandle) {
      return;
    }

    let startX: number;
    let startWidth: number;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      this.isResizing = true;
      startX = e.clientX;
      startWidth = this.currentWidth;

      this.resizeHandle?.classList.add('active');
      this.sidebar?.classList.add('resizing');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!this.isResizing) {
        return;
      }

      const deltaX = startX - e.clientX;
      const newWidth = Math.max(
        BUDDY_CONFIG.SIDEBAR_MIN_WIDTH as number,
        Math.min(BUDDY_CONFIG.SIDEBAR_MAX_WIDTH as number, startWidth + deltaX)
      );

      this.currentWidth = newWidth;
      if (this.sidebar) {
        this.sidebar.style.width = `${newWidth}px`;
      }
      this.updateBodyMargin();
    };

    const handleMouseUp = () => {
      if (!this.isResizing) {
        return;
      }

      this.isResizing = false;
      this.resizeHandle?.classList.remove('active');
      this.sidebar?.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Save the new width
      this.storage.saveSettings({ sidebarWidth: this.currentWidth });

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    this.resizeHandle.addEventListener('mousedown', handleMouseDown);
  }

  private updateBodyMargin() {
    if (this.isOpen && window.innerWidth > 768) {
      // Apply margin to both body and html elements for better compatibility
      document.body.style.marginRight = `${this.currentWidth}px`;
      document.documentElement.style.marginRight = `${this.currentWidth}px`;
      document.documentElement.style.transition = 'margin-right 0.3s ease';

      // Also set a CSS variable that can be used by the page
      document.documentElement.style.setProperty('--buddy-sidebar-width', `${this.currentWidth}px`);
    } else {
      document.body.style.marginRight = '';
      document.documentElement.style.marginRight = '';
      document.documentElement.style.removeProperty('--buddy-sidebar-width');
    }
  }

  private handleWindowResize() {
    if (this.isOpen) {
      this.updateBodyMargin();

      // Adjust sidebar width if it's too wide for the screen
      const maxWidth = window.innerWidth * 0.8;
      if (this.currentWidth > maxWidth) {
        this.currentWidth = Math.max(BUDDY_CONFIG.SIDEBAR_MIN_WIDTH as number, maxWidth);
        if (this.sidebar) {
          this.sidebar.style.width = `${this.currentWidth}px`;
        }
        this.updateBodyMargin();
      }
    }
  }

  async toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      await this.open();
    }
  }

  async open() {
    if (this.isOpen) {
      return;
    }

    this.createSidebar();
    
    // Check if we're opening after navigation
    const navState = await this.storage.getNavigationState();
    if (navState && navState.reopenSidebar) {
      // Set session storage flag for sidebar to detect
      sessionStorage.setItem('buddy_post_navigation', 'true');
      // Clear the navigation state now that we've handled it
      await this.storage.setNavigationState(null);
    }

    // Force reflow before opening
    if (this.sidebar) {
      this.sidebar.offsetHeight;
      this.sidebar.classList.add('open');
    }

    document.body.classList.add('buddy-sidebar-open');
    document.documentElement.classList.add('buddy-sidebar-open');
    this.updateBodyMargin();
    this.isOpen = true;

    // Hide buddy icon when sidebar is open
    const buddyIcon = document.getElementById('buddy-icon');
    if (buddyIcon) {
      buddyIcon.style.display = 'none';
    }

    // Send message to iframe when it loads
    const iframe = this.sidebar?.querySelector('#buddy-sidebar-content') as HTMLIFrameElement;
    if (iframe) {
      iframe.onload = () => {
        this.sendMessageToSidebar('SIDEBAR_OPENED', {});
        this.setupIframeMessageHandling(iframe);
      };
    }
  }

  close() {
    if (!this.isOpen || !this.sidebar) {
      return;
    }

    this.sidebar.classList.remove('open');
    document.body.classList.remove('buddy-sidebar-open');
    document.documentElement.classList.remove('buddy-sidebar-open');

    // Reset all margins
    document.body.style.marginRight = '';
    document.documentElement.style.marginRight = '';
    document.documentElement.style.removeProperty('--buddy-sidebar-width');

    // Show buddy icon when sidebar is closed
    const buddyIcon = document.getElementById('buddy-icon');
    if (buddyIcon) {
      buddyIcon.style.display = 'block';
    }

    // Remove sidebar after animation
    setTimeout(() => {
      if (this.sidebar) {
        this.sidebar.remove();
        this.sidebar = null;
        this.resizeHandle = null;
      }
    }, 300);

    this.isOpen = false;
  }

  private sendMessageToSidebar(type: string, data: any) {
    const iframe = this.sidebar?.querySelector('#buddy-sidebar-content') as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type, data }, '*');
    }
  }

  // Public API for other components
  executeTask(taskId: string, content: string) {
    this.sendMessageToSidebar('EXECUTE_TASK', { taskId, content });
  }

  showConversation(conversationId: string) {
    this.sendMessageToSidebar('SHOW_CONVERSATION', { conversationId });
  }

  openManagement() {
    this.sendMessageToSidebar('OPEN_MANAGEMENT', {});
  }

  destroy() {
    this.close();
    document.removeEventListener(BUDDY_EVENTS.TOGGLE_SIDEBAR, this.toggle);
  }

  private setupIframeMessageHandling(iframe: HTMLIFrameElement) {
    // Listen for messages from the iframe
    window.addEventListener('message', event => {
      // Verify the message is from our iframe
      if (event.source !== iframe.contentWindow) return;

      switch (event.data.type) {
        case 'GET_PAGE_INFO': {
          const pageMetadata = PageParser.getPageMetadata();
          iframe.contentWindow?.postMessage(
            {
              type: 'PAGE_INFO',
              title: pageMetadata.title,
              url: pageMetadata.url,
            },
            '*'
          );
          break;
        }

        case 'GET_PAGE_CONTENT': {
          const pageContent = PageParser.extractPageContent();
          const metadata = PageParser.getPageMetadata();
          iframe.contentWindow?.postMessage(
            {
              type: 'PAGE_CONTENT',
              content: `Page: ${metadata.title}\nURL: ${metadata.url}\n\n${pageContent}`,
            },
            '*'
          );
          break;
        }

        case 'GET_SELECTED_TEXT': {
          const selectedText = PageParser.extractSelectedText();
          iframe.contentWindow?.postMessage(
            {
              type: 'SELECTED_TEXT',
              content: selectedText,
            },
            '*'
          );
          break;
        }

        case 'REPLACE_SELECTED_TEXT':
          this.replaceSelectedText(event.data.content);
          break;

        case 'FORWARD_TO_BACKGROUND':
          // Forward message to background with tab context
          this.forwardToBackground(event.data.message, event.data.requestId, iframe);
          break;

        case 'OPEN_MANAGEMENT':
          // Handle management opening
          chrome.runtime.sendMessage({ type: 'OPEN_MANAGEMENT' });
          break;

        case 'CLOSE_SIDEBAR':
          // Close the sidebar
          this.close();
          break;
      }
    });
  }

  private async forwardToBackground(message: any, requestId: string, iframe: HTMLIFrameElement) {
    try {
      // Send to background and wait for response
      const response = await chrome.runtime.sendMessage(message);

      // Send response back to iframe
      iframe.contentWindow?.postMessage(
        {
          type: 'MESSAGE_RESPONSE',
          requestId: requestId,
          response: response,
        },
        '*'
      );
    } catch (error) {
      // Send error response back to iframe
      iframe.contentWindow?.postMessage(
        {
          type: 'MESSAGE_RESPONSE',
          requestId: requestId,
          response: {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        },
        '*'
      );
    }
  }

  private replaceSelectedText(newText: string) {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();

    const textNode = document.createTextNode(newText);
    range.insertNode(textNode);

    // Clear selection
    selection.removeAllRanges();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const buddySidebar = new BuddySidebar();
    buddySidebar.init();
  });
} else {
  const buddySidebar = new BuddySidebar();
  buddySidebar.init();
}
