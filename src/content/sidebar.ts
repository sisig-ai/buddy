import { BUDDY_CONFIG, BUDDY_EVENTS } from '../shared/constants.js';
import { StorageManager } from '../shared/storage-manager.js';
import { debounce } from '../shared/utils.js';

export class BuddySidebar {
  private sidebar: HTMLElement | null = null;
  private isOpen = false;
  private isResizing = false;
  private currentWidth = BUDDY_CONFIG.SIDEBAR_DEFAULT_WIDTH;
  private storage = StorageManager.getInstance();
  private resizeHandle: HTMLElement | null = null;

  async init() {
    this.setupEventListeners();
    await this.loadSettings();
  }

  private setupEventListeners() {
    // Listen for toggle events from icon
    document.addEventListener(BUDDY_EVENTS.TOGGLE_SIDEBAR, () => {
      this.toggle();
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
    this.currentWidth = settings.sidebarWidth;
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
        BUDDY_CONFIG.SIDEBAR_MIN_WIDTH,
        Math.min(BUDDY_CONFIG.SIDEBAR_MAX_WIDTH, startWidth + deltaX)
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
      document.body.style.marginRight = `${this.currentWidth}px`;
    } else {
      document.body.style.marginRight = '';
    }
  }

  private handleWindowResize() {
    if (this.isOpen) {
      this.updateBodyMargin();

      // Adjust sidebar width if it's too wide for the screen
      const maxWidth = window.innerWidth * 0.8;
      if (this.currentWidth > maxWidth) {
        this.currentWidth = Math.max(BUDDY_CONFIG.SIDEBAR_MIN_WIDTH, maxWidth);
        if (this.sidebar) {
          this.sidebar.style.width = `${this.currentWidth}px`;
        }
        this.updateBodyMargin();
      }
    }
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (this.isOpen) {
      return;
    }

    this.createSidebar();

    // Force reflow before opening
    if (this.sidebar) {
      this.sidebar.offsetHeight;
      this.sidebar.classList.add('open');
    }

    document.body.classList.add('buddy-sidebar-open');
    this.updateBodyMargin();
    this.isOpen = true;

    // Send message to iframe when it loads
    const iframe = this.sidebar?.querySelector('#buddy-sidebar-content') as HTMLIFrameElement;
    if (iframe) {
      iframe.onload = () => {
        this.sendMessageToSidebar('SIDEBAR_OPENED', {});
      };
    }
  }

  close() {
    if (!this.isOpen || !this.sidebar) {
      return;
    }

    this.sidebar.classList.remove('open');
    document.body.classList.remove('buddy-sidebar-open');
    document.body.style.marginRight = '';

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
