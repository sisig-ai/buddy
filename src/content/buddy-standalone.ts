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

      // Create the functional sidebar
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
        display: flex;
        flex-direction: column;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      `;

      this.sidebar.innerHTML = `
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid #f3f4f6;">
          <h2 style="margin: 0; font-size: 20px; color: #111827; font-weight: 600;">Buddy</h2>
          <button id="close-sidebar" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #6b7280; padding: 4px; border-radius: 4px; transition: background 0.2s;">✕</button>
        </div>

        <!-- Tasks Section -->
        <div style="padding: 16px 20px; border-bottom: 1px solid #f3f4f6;">
          <h3 style="margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: 0.5px;">Quick Tasks</h3>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button id="summarize-page" class="task-button" style="width: 100%; padding: 10px 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s;">📄 Summarize this page</button>
            <button id="rephrase-text" class="task-button" style="width: 100%; padding: 10px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s;">✏️ Rephrase selected text</button>
          </div>
        </div>

        <!-- Chat Container -->
        <div style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
          <!-- Messages Area -->
          <div id="messages-container" style="flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px;">
            <div style="text-align: center; color: #6b7280; font-size: 14px; padding: 20px 0;">
              👋 Hi! I'm Buddy, your AI assistant. Try one of the quick tasks above or start a conversation.
            </div>
          </div>

          <!-- Input Area -->
          <div style="border-top: 1px solid #f3f4f6; padding: 16px 20px;">
            <div style="display: flex; gap: 8px; align-items: flex-end;">
              <textarea id="chat-input" placeholder="Ask me anything about this page..." style="flex: 1; min-height: 40px; max-height: 120px; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; font-family: inherit; resize: none; outline: none;" rows="1"></textarea>
              <button id="send-message" style="padding: 10px 16px; background: #3b82f6; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 500; transition: background 0.2s;">Send</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(this.sidebar);
      document.body.style.marginRight = '400px';
      this.isOpen = true;

      this.setupSidebarEventListeners();
      this.autoResizeTextarea();
    }

    private setupSidebarEventListeners() {
      if (!this.sidebar) return;

      // Close button
      this.sidebar.querySelector('#close-sidebar')?.addEventListener('click', () => {
        this.close();
      });

      // Task buttons
      this.sidebar.querySelector('#summarize-page')?.addEventListener('click', () => {
        this.executeTask('summarize-page');
      });

      this.sidebar.querySelector('#rephrase-text')?.addEventListener('click', () => {
        this.executeTask('rephrase-text');
      });

      // Chat input
      const chatInput = this.sidebar.querySelector('#chat-input') as HTMLTextAreaElement;
      const sendButton = this.sidebar.querySelector('#send-message') as HTMLButtonElement;

      if (chatInput && sendButton) {
        // Send message on button click
        sendButton.addEventListener('click', () => {
          this.sendMessage();
        });

        // Send message on Enter (but allow Shift+Enter for new lines)
        chatInput.addEventListener('keydown', e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendMessage();
          }
        });

        // Auto-resize textarea
        chatInput.addEventListener('input', () => {
          this.autoResizeTextarea();
        });
      }

      // Hover effects for task buttons
      const taskButtons = this.sidebar.querySelectorAll('.task-button');
      taskButtons.forEach(button => {
        button.addEventListener('mouseenter', () => {
          (button as HTMLElement).style.transform = 'translateY(-1px)';
          (button as HTMLElement).style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';
        });
        button.addEventListener('mouseleave', () => {
          (button as HTMLElement).style.transform = 'translateY(0)';
          (button as HTMLElement).style.boxShadow = 'none';
        });
      });

      // Close button hover effect
      const closeButton = this.sidebar.querySelector('#close-sidebar') as HTMLElement;
      if (closeButton) {
        closeButton.addEventListener('mouseenter', () => {
          closeButton.style.background = '#f3f4f6';
        });
        closeButton.addEventListener('mouseleave', () => {
          closeButton.style.background = 'none';
        });
      }
    }

    private autoResizeTextarea() {
      const textarea = this.sidebar?.querySelector('#chat-input') as HTMLTextAreaElement;
      if (!textarea) return;

      textarea.style.height = 'auto';
      const newHeight = Math.min(textarea.scrollHeight, 120);
      textarea.style.height = `${newHeight}px`;
    }

    private async executeTask(taskId: string) {
      try {
        this.showTaskExecuting(taskId);

        let content = '';
        if (taskId === 'summarize-page') {
          content = this.extractPageContent();
          if (!content.trim()) {
            this.showError('No content found on this page to summarize.');
            return;
          }
        } else if (taskId === 'rephrase-text') {
          content = this.getSelectedText();
          if (!content.trim()) {
            this.showError('Please select some text first to rephrase.');
            return;
          }
        }

        // Send task to background script
        const response = await chrome.runtime.sendMessage({
          type: 'EXECUTE_TASK',
          data: { taskId, content },
        });

        // Remove the executing indicator
        const executing = this.sidebar?.querySelector('#executing-task');
        executing?.remove();

        if (response.success) {
          this.addTaskResult(taskId, content, response.result);
        } else {
          this.showError(response.error || 'Task execution failed');
        }
      } catch (error) {
        console.error('Task execution error:', error);
        this.showError('Failed to execute task. Please try again.');
      }
    }

    private async sendMessage() {
      const input = this.sidebar?.querySelector('#chat-input') as HTMLTextAreaElement;
      if (!input || !input.value.trim()) return;

      const message = input.value.trim();
      input.value = '';
      this.autoResizeTextarea();

      this.addUserMessage(message);
      this.showTyping();

      try {
        // For now, just show a placeholder response
        // TODO: Implement proper conversation continuation
        setTimeout(() => {
          this.removeTyping();
          this.addAssistantMessage(
            "I'm still learning how to continue conversations! For now, please use the quick tasks above. Full conversation support is coming soon! 🚀"
          );
        }, 1000);
      } catch (error) {
        this.removeTyping();
        this.showError('Failed to send message. Please try again.');
      }
    }

    private extractPageContent(): string {
      // Simple content extraction - we'll enhance this later
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: node => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const style = window.getComputedStyle(parent);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }

          const tagName = parent.tagName.toLowerCase();
          if (['script', 'style', 'nav', 'header', 'footer'].includes(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const textParts: string[] = [];
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent?.trim();
        if (text && text.length > 3) {
          textParts.push(text);
        }
      }

      return textParts.join(' ').slice(0, 8000); // Limit content size
    }

    private getSelectedText(): string {
      return window.getSelection()?.toString() || '';
    }

    private addUserMessage(content: string) {
      const container = this.sidebar?.querySelector('#messages-container');
      if (!container) return;

      const messageDiv = document.createElement('div');
      messageDiv.style.cssText = `
        display: flex;
        justify-content: flex-end;
        margin-bottom: 8px;
      `;

      messageDiv.innerHTML = `
        <div style="background: #3b82f6; color: white; padding: 8px 12px; border-radius: 12px 12px 4px 12px; max-width: 80%; font-size: 14px; line-height: 1.4;">
          ${this.escapeHtml(content)}
        </div>
      `;

      container.appendChild(messageDiv);
      container.scrollTop = container.scrollHeight;
    }

    private addAssistantMessage(content: string) {
      const container = this.sidebar?.querySelector('#messages-container');
      if (!container) return;

      const messageDiv = document.createElement('div');
      messageDiv.style.cssText = `
        display: flex;
        justify-content: flex-start;
        margin-bottom: 8px;
      `;

      messageDiv.innerHTML = `
        <div style="background: #f3f4f6; color: #374151; padding: 8px 12px; border-radius: 12px 12px 12px 4px; max-width: 80%; font-size: 14px; line-height: 1.4;">
          ${this.formatMarkdown(content)}
        </div>
      `;

      container.appendChild(messageDiv);
      container.scrollTop = container.scrollHeight;
    }

    private addTaskResult(taskId: string, originalContent: string, result: string) {
      const container = this.sidebar?.querySelector('#messages-container');
      if (!container) return;

      const taskName = taskId === 'summarize-page' ? 'Page Summary' : 'Rephrased Text';

      const messageDiv = document.createElement('div');
      messageDiv.style.cssText = `
        margin-bottom: 12px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        overflow: hidden;
      `;

      messageDiv.innerHTML = `
        <div style="background: #f8fafc; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; font-weight: 600; color: #6b7280;">
          ${taskName} ✨
        </div>
        <div style="padding: 12px;">
          <div style="font-size: 14px; line-height: 1.5; color: #374151;">
            ${this.formatMarkdown(result)}
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px;">
            <button onclick="navigator.clipboard.writeText(${JSON.stringify(result).replace(/"/g, '&quot;')})" style="padding: 4px 8px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; cursor: pointer;">📋 Copy</button>
            ${taskId === 'rephrase-text' ? `<button onclick="window.Buddy?.replaceSelectedText(${JSON.stringify(result).replace(/"/g, '&quot;')})" style="padding: 4px 8px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; font-size: 12px; cursor: pointer;">✏️ Replace</button>` : ''}
          </div>
        </div>
      `;

      container.appendChild(messageDiv);
      container.scrollTop = container.scrollHeight;
    }

    private showTaskExecuting(taskId: string) {
      const container = this.sidebar?.querySelector('#messages-container');
      if (!container) return;

      const taskName = taskId === 'summarize-page' ? 'Summarizing page' : 'Rephrasing text';

      const messageDiv = document.createElement('div');
      messageDiv.id = 'executing-task';
      messageDiv.style.cssText = `
        display: flex;
        justify-content: flex-start;
        margin-bottom: 8px;
      `;

      messageDiv.innerHTML = `
        <div style="background: #f3f4f6; color: #6b7280; padding: 8px 12px; border-radius: 12px 12px 12px 4px; font-size: 14px; line-height: 1.4;">
          <span style="animation: pulse 1.5s infinite;">🤔</span> ${taskName}...
        </div>
      `;

      container.appendChild(messageDiv);
      container.scrollTop = container.scrollHeight;
    }

    private showTyping() {
      const container = this.sidebar?.querySelector('#messages-container');
      if (!container) return;

      const messageDiv = document.createElement('div');
      messageDiv.id = 'typing-indicator';
      messageDiv.style.cssText = `
        display: flex;
        justify-content: flex-start;
        margin-bottom: 8px;
      `;

      messageDiv.innerHTML = `
        <div style="background: #f3f4f6; color: #6b7280; padding: 8px 12px; border-radius: 12px 12px 12px 4px; font-size: 14px;">
          <span style="animation: pulse 1.5s infinite;">💭</span> Thinking...
        </div>
      `;

      container.appendChild(messageDiv);
      container.scrollTop = container.scrollHeight;
    }

    private removeTyping() {
      const indicator = this.sidebar?.querySelector('#typing-indicator');
      indicator?.remove();
    }

    private showError(message: string) {
      const executing = this.sidebar?.querySelector('#executing-task');
      executing?.remove();

      this.removeTyping();

      const container = this.sidebar?.querySelector('#messages-container');
      if (!container) return;

      const messageDiv = document.createElement('div');
      messageDiv.style.cssText = `
        display: flex;
        justify-content: flex-start;
        margin-bottom: 8px;
      `;

      messageDiv.innerHTML = `
        <div style="background: #fef2f2; color: #dc2626; padding: 8px 12px; border-radius: 12px 12px 12px 4px; font-size: 14px; line-height: 1.4; border: 1px solid #fecaca;">
          ⚠️ ${this.escapeHtml(message)}
        </div>
      `;

      container.appendChild(messageDiv);
      container.scrollTop = container.scrollHeight;
    }

    private formatMarkdown(text: string): string {
      // Simple markdown formatting
      return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(
          /`(.*?)`/g,
          '<code style="background: #f3f4f6; padding: 2px 4px; border-radius: 3px; font-size: 13px;">$1</code>'
        )
        .replace(/\n/g, '<br>');
    }

    private escapeHtml(text: string): string {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
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

    // Global API for debugging and functionality
    (window as any).Buddy = {
      version: '1.0.0',
      icon,
      sidebar,
      toggleSidebar: () => document.dispatchEvent(new CustomEvent(BUDDY_EVENTS.TOGGLE_SIDEBAR)),
      replaceSelectedText: (newText: string) => {
        // Simple text replacement - try to replace the last selected text
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          try {
            const range = selection.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode(newText));
            selection.removeAllRanges();
            selection.addRange(range);
          } catch (error) {
            // Fallback to clipboard
            navigator.clipboard.writeText(newText);
            alert(
              'Text copied to clipboard. Original selection could not be replaced automatically.'
            );
          }
        } else {
          // No selection, just copy to clipboard
          navigator.clipboard.writeText(newText);
          alert('Text copied to clipboard. Please select text first to replace it automatically.');
        }
      },
    };

    console.log('Buddy extension loaded successfully!');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
