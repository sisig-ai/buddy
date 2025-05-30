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

    async addToBlacklist(domain: string): Promise<void> {
      const blacklist = await this.getBlacklist();
      if (!blacklist.includes(domain)) {
        blacklist.push(domain);
        await chrome.storage.sync.set({
          [BUDDY_CONFIG.STORAGE_KEYS.BLACKLIST]: blacklist,
        });
      }
    }

    async removeFromBlacklist(domain: string): Promise<void> {
      const blacklist = await this.getBlacklist();
      const updatedBlacklist = blacklist.filter(d => d !== domain);
      await chrome.storage.sync.set({
        [BUDDY_CONFIG.STORAGE_KEYS.BLACKLIST]: updatedBlacklist,
      });
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
    private storage = StorageManager.getInstance();
    private currentWidth = BUDDY_CONFIG.SIDEBAR_DEFAULT_WIDTH;
    private currentConversationId: string | null = null;
    private conversationHistory: any[] = [];

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
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="settings-button" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #6b7280; padding: 4px; border-radius: 4px; transition: background 0.2s;" title="Settings">⚙️</button>
            <button id="close-sidebar" style="background: none; border: none; font-size: 16px; cursor: pointer; color: #6b7280; padding: 4px; border-radius: 4px; transition: background 0.2s;">✕</button>
          </div>
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
            <div id="conversation-status" style="display: none; padding: 6px 12px; background: #dcfce7; border: 1px solid #bbf7d0; border-radius: 6px; margin-bottom: 12px; font-size: 12px; color: #166534;">
              💬 Conversation active - I can now answer follow-up questions about your task
            </div>
            <div style="display: flex; gap: 8px; align-items: flex-end;">
              <textarea id="chat-input" placeholder="Ask me anything about this page..." style="flex: 1; min-height: 40px; max-height: 120px; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; font-family: inherit; resize: none; outline: none; color: #374151; background: white;" rows="1"></textarea>
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

      // Settings button
      this.sidebar.querySelector('#settings-button')?.addEventListener('click', () => {
        this.openSettings();
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

      // Header button hover effects
      const settingsButton = this.sidebar.querySelector('#settings-button') as HTMLElement;
      const closeButton = this.sidebar.querySelector('#close-sidebar') as HTMLElement;

      [settingsButton, closeButton].forEach(button => {
        if (button) {
          button.addEventListener('mouseenter', () => {
            button.style.background = '#f3f4f6';
          });
          button.addEventListener('mouseleave', () => {
            button.style.background = 'none';
          });
        }
      });
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
          // Store conversation context
          this.currentConversationId = response.conversationId;
          this.conversationHistory = response.conversationHistory || [];

          this.addTaskResult(taskId, content, response.result);
          this.showConversationStatus();
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
        // Send message to background script for processing
        const response = await chrome.runtime.sendMessage({
          type: 'CONTINUE_CONVERSATION',
          data: {
            message,
            conversationId: this.currentConversationId,
            conversationHistory: this.conversationHistory,
          },
        });

        this.removeTyping();

        if (response.success) {
          // Update conversation context
          this.conversationHistory = response.conversationHistory;
          this.addAssistantMessage(response.result);
        } else {
          this.showError(response.error || 'Failed to process message');
        }
      } catch (error) {
        console.error('Conversation error:', error);
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

    private showConversationStatus() {
      const statusDiv = this.sidebar?.querySelector('#conversation-status');
      if (statusDiv) {
        statusDiv.style.display = 'block';
      }
    }

    private async openSettings() {
      // Check if modal already exists
      if (document.getElementById('buddy-settings-modal')) return;

      // Get current settings
      const settings = await this.storage.getSettings();
      const apiKey = await chrome.runtime.sendMessage({ type: 'GET_API_KEY' });
      const blacklist = await this.storage.getBlacklist();

      // Create modal overlay
      const modal = document.createElement('div');
      modal.id = 'buddy-settings-modal';
      modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.5);
        z-index: 2147483647;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      `;

      modal.innerHTML = `
        <div style="background: white; border-radius: 12px; width: 500px; max-width: 90vw; max-height: 90vh; overflow-y: auto; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">
          <!-- Header -->
          <div style="padding: 24px 24px 0 24px; border-bottom: 1px solid #f3f4f6;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
              <h2 style="margin: 0; font-size: 24px; font-weight: 600; color: #111827;">Settings</h2>
              <button id="close-settings" style="background: none; border: none; font-size: 20px; cursor: pointer; color: #6b7280; padding: 4px;">✕</button>
            </div>
          </div>

          <!-- Content -->
          <div style="padding: 24px;">
            
            <!-- API Key Section -->
            <div style="margin-bottom: 32px;">
              <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #111827;">🔑 API Configuration</h3>
              <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
                Enter your Anthropic API key to enable AI functionality. Your key is stored securely in your browser.
              </p>
              
              <div style="margin-bottom: 12px;">
                <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #374151; font-size: 14px;">API Key</label>
                <div style="display: flex; gap: 8px;">
                  <input type="password" id="api-key-input" placeholder="sk-ant-..." value="${apiKey || ''}" style="flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; color: #374151;">
                  <button id="toggle-api-visibility" style="padding: 8px 12px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 14px;">👁️</button>
                </div>
              </div>

              <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <button id="save-api-key" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Save Key</button>
                <button id="test-api-key" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Test Connection</button>
                <button id="clear-api-key" style="padding: 8px 16px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Clear</button>
              </div>

              <div id="api-status" style="padding: 8px 12px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; ${apiKey ? 'background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;' : 'background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;'}">
                ${apiKey ? '✅ API key configured' : '⚠️ No API key configured - AI features disabled'}
              </div>

              <div style="background: #fffbeb; border: 1px solid #fed7aa; border-radius: 6px; padding: 12px; font-size: 13px; color: #92400e;">
                💡 <strong>Get your API key:</strong> Visit <a href="https://console.anthropic.com/" target="_blank" style="color: #c2410c; text-decoration: underline;">console.anthropic.com</a> to create an account and get your API key.
              </div>
            </div>

            <!-- Site Management Section -->
            <div style="margin-bottom: 32px;">
              <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #111827;">🚫 Site Blacklist</h3>
              <p style="margin: 0 0 16px 0; color: #6b7280; font-size: 14px;">
                Disable Buddy on specific websites. Enter domain names (e.g., example.com).
              </p>
              
              <div style="display: flex; gap: 8px; margin-bottom: 12px;">
                <input type="text" id="blacklist-input" placeholder="example.com" style="flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; color: #374151;">
                <button id="add-to-blacklist" style="padding: 8px 16px; background: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Add</button>
              </div>

              <div id="blacklist-items" style="max-height: 150px; overflow-y: auto;">
                ${blacklist
                  .map(
                    domain => `
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 4px;">
                    <span style="font-size: 14px; color: #374151;">${domain}</span>
                    <button onclick="window.Buddy.removeFromBlacklist('${domain}')" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 12px;">Remove</button>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>

            <!-- Settings Section -->
            <div>
              <h3 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #111827;">⚙️ Preferences</h3>
              
              <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #374151; font-size: 14px;">Sidebar Width</label>
                <input type="range" id="sidebar-width" min="300" max="800" value="${settings.sidebarWidth}" style="width: 100%; margin-bottom: 4px;">
                <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6b7280;">
                  <span>300px</span>
                  <span id="width-value">${settings.sidebarWidth}px</span>
                  <span>800px</span>
                </div>
              </div>

              <div style="margin-bottom: 16px;">
                <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #374151; font-size: 14px;">Conversation History Limit</label>
                <select id="conversation-limit" style="width: 100%; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; color: #374151;">
                  <option value="25" ${settings.conversationRetention === 25 ? 'selected' : ''}>25 conversations</option>
                  <option value="50" ${settings.conversationRetention === 50 ? 'selected' : ''}>50 conversations</option>
                  <option value="100" ${settings.conversationRetention === 100 ? 'selected' : ''}>100 conversations</option>
                  <option value="200" ${settings.conversationRetention === 200 ? 'selected' : ''}>200 conversations</option>
                </select>
              </div>
            </div>

          </div>

          <!-- Footer -->
          <div style="padding: 16px 24px; border-top: 1px solid #f3f4f6; background: #f9fafb; border-radius: 0 0 12px 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="font-size: 12px; color: #6b7280;">
                Buddy v1.0.0 • Your data stays private in your browser
              </div>
              <button id="save-settings" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">Save All Settings</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(modal);
      this.setupSettingsEventListeners(modal);
    }

    private setupSettingsEventListeners(modal: HTMLElement) {
      // Close modal
      modal.querySelector('#close-settings')?.addEventListener('click', () => {
        modal.remove();
      });

      // Click outside to close
      modal.addEventListener('click', e => {
        if (e.target === modal) {
          modal.remove();
        }
      });

      // API key visibility toggle
      const apiInput = modal.querySelector('#api-key-input') as HTMLInputElement;
      modal.querySelector('#toggle-api-visibility')?.addEventListener('click', () => {
        apiInput.type = apiInput.type === 'password' ? 'text' : 'password';
      });

      // Save API key
      modal.querySelector('#save-api-key')?.addEventListener('click', async () => {
        const apiKey = apiInput.value.trim();
        if (!apiKey) {
          this.showSettingsMessage(modal, 'Please enter an API key', 'error');
          return;
        }

        try {
          const response = await chrome.runtime.sendMessage({
            type: 'UPDATE_API_KEY',
            data: { apiKey },
          });

          if (response.success) {
            this.showSettingsMessage(modal, 'API key saved successfully!', 'success');
            this.updateApiStatus(modal, true);
          } else {
            this.showSettingsMessage(modal, 'Failed to save API key', 'error');
          }
        } catch (error) {
          this.showSettingsMessage(modal, 'Error saving API key', 'error');
        }
      });

      // Test API key
      modal.querySelector('#test-api-key')?.addEventListener('click', async () => {
        const apiKey = apiInput.value.trim();
        if (!apiKey) {
          this.showSettingsMessage(modal, 'Please enter an API key first', 'error');
          return;
        }

        this.showSettingsMessage(modal, 'Testing connection...', 'info');

        try {
          // Simple test by trying to execute a minimal task
          const response = await chrome.runtime.sendMessage({
            type: 'TEST_API_KEY',
            data: { apiKey },
          });

          if (response.success) {
            this.showSettingsMessage(modal, 'Connection successful! ✅', 'success');
          } else {
            this.showSettingsMessage(
              modal,
              'Connection failed: ' + (response.error || 'Invalid API key'),
              'error'
            );
          }
        } catch (error) {
          this.showSettingsMessage(modal, 'Connection test failed', 'error');
        }
      });

      // Clear API key
      modal.querySelector('#clear-api-key')?.addEventListener('click', async () => {
        if (
          confirm('Are you sure you want to clear your API key? This will disable AI features.')
        ) {
          try {
            await chrome.runtime.sendMessage({ type: 'CLEAR_API_KEY' });
            apiInput.value = '';
            this.showSettingsMessage(modal, 'API key cleared', 'success');
            this.updateApiStatus(modal, false);
          } catch (error) {
            this.showSettingsMessage(modal, 'Error clearing API key', 'error');
          }
        }
      });

      // Add to blacklist
      modal.querySelector('#add-to-blacklist')?.addEventListener('click', async () => {
        const input = modal.querySelector('#blacklist-input') as HTMLInputElement;
        const domain = input.value.trim().toLowerCase();

        if (!domain) return;

        // Simple domain validation
        if (!/^[a-z0-9\-.]+\.[a-z]{2,}$/i.test(domain)) {
          this.showSettingsMessage(
            modal,
            'Please enter a valid domain (e.g., example.com)',
            'error'
          );
          return;
        }

        try {
          await this.storage.addToBlacklist(domain);
          input.value = '';
          this.showSettingsMessage(modal, `Added ${domain} to blacklist`, 'success');
          this.refreshBlacklist(modal);
        } catch (error) {
          this.showSettingsMessage(modal, 'Error adding to blacklist', 'error');
        }
      });

      // Sidebar width slider
      const widthSlider = modal.querySelector('#sidebar-width') as HTMLInputElement;
      const widthValue = modal.querySelector('#width-value') as HTMLElement;

      widthSlider.addEventListener('input', () => {
        widthValue.textContent = `${widthSlider.value}px`;
      });

      // Save all settings
      modal.querySelector('#save-settings')?.addEventListener('click', async () => {
        try {
          const newSettings = {
            sidebarWidth: parseInt(widthSlider.value),
            conversationRetention: parseInt(
              (modal.querySelector('#conversation-limit') as HTMLSelectElement).value
            ),
          };

          await this.storage.saveSettings(newSettings);
          this.showSettingsMessage(modal, 'Settings saved successfully!', 'success');

          // Update current sidebar width if it's open
          this.currentWidth = newSettings.sidebarWidth;
          if (this.sidebar) {
            this.sidebar.style.width = `${this.currentWidth}px`;
            this.updateBodyMargin();
          }
        } catch (error) {
          this.showSettingsMessage(modal, 'Error saving settings', 'error');
        }
      });

      // Enter key handlers
      apiInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          modal.querySelector('#save-api-key')?.dispatchEvent(new Event('click'));
        }
      });

      const blacklistInput = modal.querySelector('#blacklist-input') as HTMLInputElement;
      blacklistInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          modal.querySelector('#add-to-blacklist')?.dispatchEvent(new Event('click'));
        }
      });
    }

    private showSettingsMessage(
      modal: HTMLElement,
      message: string,
      type: 'success' | 'error' | 'info'
    ) {
      // Remove existing message
      const existing = modal.querySelector('#settings-message');
      existing?.remove();

      const colors = {
        success: 'background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;',
        error: 'background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;',
        info: 'background: #dbeafe; color: #1d4ed8; border: 1px solid #bfdbfe;',
      };

      const messageDiv = document.createElement('div');
      messageDiv.id = 'settings-message';
      messageDiv.style.cssText = `
        ${colors[type]}
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 13px;
        margin: 12px 24px;
        position: relative;
      `;
      messageDiv.textContent = message;

      // Insert after the header
      const header = modal.querySelector('div');
      header?.insertAdjacentElement('afterend', messageDiv);

      // Auto-remove after 3 seconds
      setTimeout(() => messageDiv.remove(), 3000);
    }

    private updateApiStatus(modal: HTMLElement, hasKey: boolean) {
      const statusDiv = modal.querySelector('#api-status') as HTMLElement;
      if (statusDiv) {
        if (hasKey) {
          statusDiv.style.cssText =
            'padding: 8px 12px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; background: #dcfce7; color: #166534; border: 1px solid #bbf7d0;';
          statusDiv.textContent = '✅ API key configured';
        } else {
          statusDiv.style.cssText =
            'padding: 8px 12px; border-radius: 6px; font-size: 13px; margin-bottom: 12px; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca;';
          statusDiv.textContent = '⚠️ No API key configured - AI features disabled';
        }
      }
    }

    private async refreshBlacklist(modal: HTMLElement) {
      const blacklist = await this.storage.getBlacklist();
      const container = modal.querySelector('#blacklist-items') as HTMLElement;

      container.innerHTML = blacklist
        .map(
          domain => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 4px;">
          <span style="font-size: 14px; color: #374151;">${domain}</span>
          <button onclick="window.Buddy.removeFromBlacklist('${domain}')" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 12px;">Remove</button>
        </div>
      `
        )
        .join('');
    }

    private updateBodyMargin() {
      if (this.isOpen) {
        document.body.style.marginRight = `${this.currentWidth}px`;
      }
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
      removeFromBlacklist: async (domain: string) => {
        try {
          const storage = StorageManager.getInstance();
          await storage.removeFromBlacklist(domain);

          // Refresh the blacklist display if settings modal is open
          const modal = document.getElementById('buddy-settings-modal');
          if (modal && sidebar.refreshBlacklist) {
            const blacklist = await storage.getBlacklist();
            const container = modal.querySelector('#blacklist-items') as HTMLElement;

            container.innerHTML = blacklist
              .map(
                (d: string) => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; margin-bottom: 4px;">
                <span style="font-size: 14px; color: #374151;">${d}</span>
                <button onclick="window.Buddy.removeFromBlacklist('${d}')" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 12px;">Remove</button>
              </div>
            `
              )
              .join('');
          }
        } catch (error) {
          console.error('Error removing from blacklist:', error);
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
