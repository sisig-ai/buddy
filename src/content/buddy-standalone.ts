// Buddy Chrome Extension - Standalone Content Script
// This is a self-contained script that doesn't use imports/exports

(function () {
  'use strict';

  // Configuration
  const BUDDY_CONFIG = {
    SIDEBAR_DEFAULT_WIDTH: 400,
    SIDEBAR_MIN_WIDTH: 300,
    SIDEBAR_MAX_WIDTH: 800,
    ICON_SIZE: 24,
    ICON_DEFAULT_POSITION: 50,
    ANTHROPIC_API_URL: 'https://api.anthropic.com/v1/messages',
    MAX_CONVERSATION_HISTORY: 50,
    STORAGE_KEYS: {
      API_KEY: 'buddy_api_key',
      CONVERSATIONS: 'buddy_conversations',
      TASKS: 'buddy_tasks',
      SETTINGS: 'buddy_settings',
      BLACKLIST: 'buddy_blacklist',
    },
  };

  const BUDDY_EVENTS = {
    TOGGLE_SIDEBAR: 'buddy:toggle-sidebar',
    TASK_EXECUTE: 'buddy:task-execute',
    CONVERSATION_UPDATE: 'buddy:conversation-update',
    SETTINGS_CHANGE: 'buddy:settings-change',
  };

  // Utility functions
  function throttle<T extends (...args: any[]) => any>(func: T, limit: number) {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  function debounce<T extends (...args: any[]) => any>(func: T, wait: number) {
    let timeout: number;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = window.setTimeout(() => func(...args), wait);
    };
  }

  // Storage Manager
  class StorageManager {
    private static instance: StorageManager;

    static getInstance(): StorageManager {
      if (!StorageManager.instance) {
        StorageManager.instance = new StorageManager();
      }
      return StorageManager.instance;
    }

    async getSettings() {
      const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.SETTINGS);
      return (
        result[BUDDY_CONFIG.STORAGE_KEYS.SETTINGS] || {
          sidebarWidth: BUDDY_CONFIG.SIDEBAR_DEFAULT_WIDTH,
          iconPosition: BUDDY_CONFIG.ICON_DEFAULT_POSITION,
          blacklistedSites: [],
          defaultTasks: ['summarize-page', 'rephrase-text'],
          conversationRetention: BUDDY_CONFIG.MAX_CONVERSATION_HISTORY,
        }
      );
    }

    async saveSettings(settings: any) {
      const currentSettings = await this.getSettings();
      const updatedSettings = { ...currentSettings, ...settings };
      await chrome.storage.sync.set({
        [BUDDY_CONFIG.STORAGE_KEYS.SETTINGS]: updatedSettings,
      });
    }

    async getBlacklist(): Promise<string[]> {
      const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.BLACKLIST);
      return result[BUDDY_CONFIG.STORAGE_KEYS.BLACKLIST] || [];
    }
  }

  // Buddy Icon Class
  class BuddyIcon {
    private icon: HTMLElement | null = null;
    private isDragging = false;
    private storage = StorageManager.getInstance();
    private isVisible = true;

    async init() {
      await this.checkSiteBlacklist();
      if (!this.isVisible) {
        return;
      }

      this.createIcon();
      this.setupEventListeners();
      await this.loadPosition();
    }

    private async checkSiteBlacklist() {
      const blacklist = await this.storage.getBlacklist();
      this.isVisible = !this.isDomainBlacklisted(window.location.href, blacklist);
    }

    private isDomainBlacklisted(url: string, blacklist: string[]): boolean {
      try {
        const domain = new URL(url).hostname;
        return blacklist.some(blocked => {
          if (blocked.startsWith('*.')) {
            const pattern = blocked.slice(2);
            return domain.endsWith(pattern);
          }
          return domain === blocked;
        });
      } catch {
        return false;
      }
    }

    private createIcon() {
      if (document.getElementById('buddy-icon')) {
        return;
      }

      this.icon = document.createElement('div');
      this.icon.id = 'buddy-icon';
      this.icon.className = 'buddy-icon';
      this.icon.innerHTML = `
        <div class="buddy-icon-content">
          <span class="buddy-icon-text">Buddy</span>
        </div>
      `;

      this.addStyles();
      document.body.appendChild(this.icon);
    }

    private addStyles() {
      if (document.getElementById('buddy-icon-styles')) {
        return;
      }

      const styles = document.createElement('style');
      styles.id = 'buddy-icon-styles';
      styles.textContent = `
        .buddy-icon {
          position: fixed;
          right: 0;
          top: 50%;
          transform: translateY(-50%);
          z-index: 2147483647;
          background: #2563eb;
          color: white;
          border-radius: 8px 0 0 8px;
          cursor: pointer;
          user-select: none;
          transition: all 0.2s ease;
          box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        }

        .buddy-icon:hover {
          background: #1d4ed8;
          transform: translateY(-50%) translateX(-2px);
          box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15);
        }

        .buddy-icon.dragging {
          background: #1e40af;
          transform: translateY(-50%) translateX(-4px);
          transition: none;
        }

        .buddy-icon-content {
          padding: 8px 12px 8px 16px;
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
        }

        .buddy-icon-text {
          display: inline-block;
        }

        @media (max-width: 768px) {
          .buddy-icon-content {
            padding: 6px 8px 6px 12px;
            font-size: 12px;
          }
        }
      `;

      document.head.appendChild(styles);
    }

    private setupEventListeners() {
      if (!this.icon) {
        return;
      }

      this.icon.addEventListener('click', e => {
        // Only toggle sidebar if we haven't dragged
        if (!this.isDragging) {
          this.toggleSidebar();
        }
      });

      this.icon.addEventListener('mousedown', this.handleMouseDown.bind(this));

      chrome.runtime.onMessage.addListener(message => {
        if (message.type === 'SITE_BLACKLISTED') {
          this.hide();
        }
      });

      this.icon.addEventListener('selectstart', e => e.preventDefault());
    }

    private handleMouseDown(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (!this.icon) {
        return;
      }

      this.isDragging = false;
      const startY = e.clientY;
      const iconRect = this.icon.getBoundingClientRect();
      const offset = startY - iconRect.top;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!this.icon) {
          return;
        }

        // Check if we've moved enough to consider this a drag
        const dragThreshold = 8; // pixels
        if (!this.isDragging && Math.abs(moveEvent.clientY - startY) > dragThreshold) {
          this.isDragging = true;
          this.icon.classList.add('dragging');
        }

        if (this.isDragging) {
          const newY = moveEvent.clientY - offset;
          const maxY = window.innerHeight - this.icon.offsetHeight;
          const constrainedY = Math.max(0, Math.min(newY, maxY));

          this.icon.style.top = `${constrainedY}px`;
          this.icon.style.transform = 'translateY(0)';
        }
      };

      const handleMouseUp = async () => {
        if (!this.icon) {
          return;
        }

        // Clean up event listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        if (this.isDragging) {
          // Save position if we were dragging
          const iconRect = this.icon.getBoundingClientRect();
          const percentage = (iconRect.top / (window.innerHeight - this.icon.offsetHeight)) * 100;

          await this.storage.saveSettings({ iconPosition: Math.max(0, Math.min(100, percentage)) });
          this.icon.style.transform = 'translateY(-50%)';
          this.icon.classList.remove('dragging');

          // Reset dragging flag after a short delay to prevent click from firing
          setTimeout(() => {
            this.isDragging = false;
          }, 100);
        } else {
          this.isDragging = false;
        }
      };

      // Add event listeners
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    private async loadPosition() {
      if (!this.icon) {
        return;
      }

      const settings = await this.storage.getSettings();
      const percentage = settings.iconPosition;

      const maxY = window.innerHeight - this.icon.offsetHeight;
      const topPosition = (percentage / 100) * maxY;

      this.icon.style.top = `${topPosition}px`;
    }

    private toggleSidebar() {
      document.dispatchEvent(new CustomEvent(BUDDY_EVENTS.TOGGLE_SIDEBAR));
    }

    hide() {
      if (this.icon) {
        this.icon.style.display = 'none';
        this.isVisible = false;
      }
    }

    show() {
      if (this.icon) {
        this.icon.style.display = 'block';
        this.isVisible = true;
      }
    }
  }

  // Sidebar Class (basic for now)
  class BuddySidebar {
    private sidebar: HTMLElement | null = null;
    private isOpen = false;
    private icon: BuddyIcon | null = null;

    init(icon: BuddyIcon) {
      this.icon = icon;
      this.setupEventListeners();
    }

    private setupEventListeners() {
      document.addEventListener(BUDDY_EVENTS.TOGGLE_SIDEBAR, () => {
        this.toggle();
      });
    }

    private toggle() {
      if (this.isOpen) {
        this.close();
      } else {
        this.open();
      }
    }

    private open() {
      if (this.isOpen) {
        return;
      }

      // Hide the icon when sidebar is open
      this.icon?.hide();

      // Create a simple sidebar for now
      this.sidebar = document.createElement('div');
      this.sidebar.id = 'buddy-sidebar';
      this.sidebar.style.cssText = `
        position: fixed;
        top: 0;
        right: 0;
        width: 400px;
        height: 100vh;
        background: white;
        border-left: 1px solid #e5e7eb;
        box-shadow: -4px 0 20px rgba(0, 0, 0, 0.1);
        z-index: 2147483646;
        transform: translateX(0);
        transition: transform 0.3s ease;
        padding: 20px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      `;

      this.sidebar.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h2 style="margin: 0; font-size: 24px; color: #111827;">Buddy</h2>
          <button id="close-sidebar" style="background: none; border: none; font-size: 18px; cursor: pointer; color: #6b7280; padding: 4px;">✕</button>
        </div>
        <p style="color: #6b7280; margin-bottom: 20px;">AI assistant for web content</p>
        <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h3 style="margin: 0 0 10px 0; font-size: 16px; color: #374151;">Quick Tasks</h3>
          <button id="summarize-page" style="display: block; width: 100%; padding: 8px 12px; margin-bottom: 8px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer;">Summarize this page</button>
          <button id="rephrase-text" style="display: block; width: 100%; padding: 8px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer;">Rephrase selected text</button>
        </div>
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px;">
          <p style="margin: 0; font-size: 14px; color: #6b7280;">
            This is a basic UI. The full chat interface and task system are coming next!
          </p>
        </div>
      `;

      document.body.appendChild(this.sidebar);
      document.body.style.marginRight = '400px';
      this.isOpen = true;

      // Add click handlers for buttons
      this.sidebar.querySelector('#close-sidebar')?.addEventListener('click', () => {
        this.close();
      });

      this.sidebar.querySelector('#summarize-page')?.addEventListener('click', () => {
        alert('Summarize page task would execute here!');
      });

      this.sidebar.querySelector('#rephrase-text')?.addEventListener('click', () => {
        alert('Rephrase text task would execute here!');
      });
    }

    private close() {
      if (!this.isOpen || !this.sidebar) {
        return;
      }

      this.sidebar.remove();
      this.sidebar = null;
      document.body.style.marginRight = '';
      this.isOpen = false;

      // Show the icon again when sidebar is closed
      this.icon?.show();
    }
  }

  // Initialize when DOM is ready
  function initialize() {
    console.log('Initializing Buddy extension...');

    const icon = new BuddyIcon();
    const sidebar = new BuddySidebar();

    icon.init();
    sidebar.init(icon);

    // Global API for debugging
    (window as any).Buddy = {
      version: '1.0.0',
      icon,
      sidebar,
      toggleSidebar: () => document.dispatchEvent(new CustomEvent(BUDDY_EVENTS.TOGGLE_SIDEBAR)),
    };

    console.log('Buddy extension loaded successfully!');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
