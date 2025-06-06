import { PageParser } from '../content/page-parser.js';
import { StorageManager } from '../shared/storage-manager.js';
import { generateId } from '../shared/utils.js';
import { marked } from 'marked';

// Configure marked for optimal rendering
marked.setOptions({
  breaks: false, // Don't convert single line breaks to <br>
  gfm: true, // GitHub Flavored Markdown
  headerIds: false, // Don't generate header IDs
  mangle: false, // Don't mangle email addresses
});

// Custom renderer for better control
const renderer = new marked.Renderer();

// Open links in new tab
renderer.link = (href, title, text) => {
  return `<a href="${href}" target="_blank" rel="noopener"${title ? ` title="${title}"` : ''}>${text}</a>`;
};

// Apply custom renderer
marked.setOptions({ renderer });

// Simple markdown rendering function using marked
const renderMarkdown = text => {
  if (!text || typeof text !== 'string') return '';

  try {
    return marked.parse(text);
  } catch (error) {
    console.error('Markdown rendering error:', error);
    // Fallback to escaped text
    return `<p>${text.replace(/[&<>"']/g, char => {
      const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return escapeMap[char];
    })}</p>`;
  }
};

class BuddySidebarUI {
  constructor() {
    console.log('BuddySidebarUI v1.0.2-debug initializing...');
    this.storage = StorageManager.getInstance();
    this.chatContainer = document.getElementById('chat-container');
    this.chatMessages = document.getElementById('chat-messages');
    this.chatInput = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('send-btn');
    this.taskGrid = document.getElementById('task-grid');
    this.taskModal = document.getElementById('task-modal');
    this.taskModalGrid = document.getElementById('task-modal-grid');
    this.closeTaskModalBtn = document.getElementById('close-task-modal');
    this.settingsBtn = document.getElementById('settings-btn');
    this.historyBtn = document.getElementById('history-btn');
    this.newChatBtn = document.getElementById('new-chat-btn');
    this.conversationHistory = document.getElementById('conversation-history');
    this.historyList = document.getElementById('history-list');
    this.closeHistoryBtn = document.getElementById('close-history-btn');
    this.currentConversationId = null;
    this.isProcessing = false;
    this.pageInfo = null;
    this.showDebugMessages = false; // Will be loaded from settings
    this.tasks = [];
    this.init();
  }

  async init() {
    await this.loadTasks();
    await this.loadPageInfo();
    await this.loadSettings();
    this.setupEventListeners();
    this.updateEmptyState();
    this.focusInput();
    await this.loadConversationHistory();
  }

  async loadPageInfo() {
    // Get page info from parent window since we're in an iframe
    return new Promise(resolve => {
      window.parent.postMessage({ type: 'GET_PAGE_INFO' }, '*');

      const handler = event => {
        if (event.data.type === 'PAGE_INFO') {
          window.removeEventListener('message', handler);
          this.pageInfo = {
            title: event.data.title || 'Untitled',
            url: event.data.url || '',
          };
          resolve();
        }
      };

      window.addEventListener('message', handler);

      // Timeout after 1 second
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve();
      }, 1000);
    });
  }

  async loadSettings() {
    try {
      const settings = await this.storage.getSettings();
      this.showDebugMessages = settings.showDebugMessages || false;
    } catch (error) {
      console.error('Failed to load settings:', error);
      this.showDebugMessages = false;
    }
  }

  updateEmptyState() {
    // Add initial assistant message if chat is empty
    if (this.chatMessages.children.length === 0) {
      let welcomeMessage = `👋 Hi! I'm Buddy, your AI assistant.

You can:
• Click a task icon above to process the page content
• Or just type a message below to chat with me
• I can help you understand and work with the content on this page`;

      if (this.pageInfo) {
        welcomeMessage += `\n\n**Current page:** ${this.pageInfo.title}`;
        welcomeMessage += `\n\nTry asking:
• "What is this page about?"
• "Summarize this content"
• "What is this repo?" (on GitHub)
• "Find the main points"`;
      }

      this.addMessage('assistant', welcomeMessage, false);
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async loadTasks() {
    try {
      this.tasks = await this.storage.getTasks();
      this.renderTaskGrid();
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  }

  renderTaskGrid() {
    // Clear existing grid
    this.taskGrid.innerHTML = '';

    // Show first 11 tasks in main grid (6x2 grid minus 1 for "show more")
    const visibleTasks = this.tasks.slice(0, 11);
    const hasMore = this.tasks.length > 11;

    visibleTasks.forEach(task => {
      const taskIcon = this.createTaskIcon(task);
      this.taskGrid.appendChild(taskIcon);
    });

    // Add "show more" icon if there are more than 11 tasks
    if (hasMore) {
      const showMoreIcon = document.createElement('div');
      showMoreIcon.className = 'task-icon show-more-icon';
      showMoreIcon.innerHTML = `
        <span>⋯</span>
        <div class="task-icon-tooltip">More tasks</div>
      `;
      showMoreIcon.addEventListener('click', () => this.showTaskModal());
      this.taskGrid.appendChild(showMoreIcon);
    }
  }

  createTaskIcon(task) {
    const iconDiv = document.createElement('div');
    iconDiv.className = 'task-icon';
    iconDiv.style.backgroundColor = task.color || '#e8eaed';
    iconDiv.style.color = this.getContrastColor(task.color || '#e8eaed');
    iconDiv.dataset.taskId = task.id;
    iconDiv.dataset.inputType = task.inputType;

    iconDiv.innerHTML = `
      <span>${task.icon || '📋'}</span>
      <div class="task-icon-tooltip">${this.escapeHtml(task.name)}</div>
    `;

    iconDiv.addEventListener('click', () => this.executeTask(task));

    return iconDiv;
  }

  getContrastColor(hexColor) {
    // Convert hex to RGB
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Return black or white based on luminance
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  setupEventListeners() {
    // Task modal
    this.closeTaskModalBtn.addEventListener('click', () => this.hideTaskModal());
    this.taskModal.addEventListener('click', e => {
      if (e.target === this.taskModal) {
        this.hideTaskModal();
      }
    });

    // Chat input
    this.chatInput.addEventListener('input', () => {
      this.sendBtn.disabled = !this.chatInput.value.trim() || this.isProcessing;
    });

    this.chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // Send button
    this.sendBtn.addEventListener('click', () => {
      this.sendMessage();
    });

    // Settings button
    this.settingsBtn.addEventListener('click', () => {
      window.parent.postMessage({ type: 'OPEN_MANAGEMENT' }, '*');
    });

    // Close sidebar button
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    if (closeSidebarBtn) {
      closeSidebarBtn.addEventListener('click', () => {
        window.parent.postMessage({ type: 'CLOSE_SIDEBAR' }, '*');
      });
    }

    // History button
    this.historyBtn.addEventListener('click', () => {
      this.toggleHistoryPanel();
    });

    // New chat button
    this.newChatBtn.addEventListener('click', () => {
      this.startNewChat();
    });

    // Close history button
    this.closeHistoryBtn.addEventListener('click', () => {
      this.hideHistoryPanel();
    });

    // Listen for messages from parent window
    window.addEventListener('message', event => {
      if (event.data.type === 'SIDEBAR_OPENED') {
        this.handleSidebarOpened();
      }
    });
  }

  showTaskModal() {
    // Clear modal grid
    this.taskModalGrid.innerHTML = '';

    // Add all tasks to modal
    this.tasks.forEach(task => {
      const taskIcon = this.createTaskIcon(task);
      this.taskModalGrid.appendChild(taskIcon);
    });

    // Show modal
    this.taskModal.style.display = 'flex';
  }

  hideTaskModal() {
    this.taskModal.style.display = 'none';
  }

  async executeTask(task) {
    if (this.isProcessing) return;

    try {
      // Get content based on input type
      let content = '';
      if (task.inputType === 'selection') {
        // Get selected text from parent window
        const selection = await this.getSelectedText();
        if (!selection) {
          this.showError('Please select some text on the page first.');
          return;
        }
        content = selection;
      } else {
        // Get full page content
        content = await this.getPageContent();
      }

      // Always create a new conversation for task execution
      this.currentConversationId = null;
      this.chatMessages.innerHTML = '';

      // Show task execution message
      this.addMessage('task', `Executing: ${task.name}`);

      // Send task execution request
      this.isProcessing = true;
      this.showLoadingIndicator();

      const response = await this.sendMessageThroughParent({
        type: 'EXECUTE_TASK',
        data: {
          taskId: task.id,
          content,
          conversationId: null, // Always null to create new conversation
        },
      });

      this.hideLoadingIndicator();
      this.isProcessing = false;

      if (response.success) {
        this.currentConversationId = response.conversationId;
        this.addMessage('assistant', response.result, true);
        // Reload conversation history to show the new conversation
        await this.loadConversationHistory();
      } else {
        this.showError(response.error || 'Task execution failed');
      }
    } catch (error) {
      console.error('Task execution error:', error);
      this.isProcessing = false;
      this.hideLoadingIndicator();
      this.showError('Failed to execute task');
    }
  }

  async sendMessage() {
    const message = this.chatInput.value.trim();
    if (!message || this.isProcessing) return;

    // Clear input
    this.chatInput.value = '';
    this.sendBtn.disabled = true;

    // Add user message
    this.addMessage('user', message);

    // Add debug message for context if first message and debug is enabled
    if (!this.currentConversationId && this.pageInfo && this.showDebugMessages) {
      this.addMessage(
        'debug',
        `Initial context:\nPage: ${this.pageInfo.title}\nURL: ${this.pageInfo.url}`
      );
    }

    // Send message
    this.isProcessing = true;
    this.showLoadingIndicator();

    try {
      // Send message through parent window to get correct tab context
      const response = await this.sendMessageThroughParent({
        type: 'SEND_MESSAGE',
        data: {
          message,
          conversationId: this.currentConversationId,
          showDebugMessages: this.showDebugMessages,
        },
      });

      this.hideLoadingIndicator();
      this.isProcessing = false;

      if (response.success) {
        this.currentConversationId = response.conversationId;
        this.addMessage('assistant', response.result, true);
      } else {
        this.showError(response.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Send message error:', error);
      this.isProcessing = false;
      this.hideLoadingIndicator();
      this.showError('Failed to send message');
    }

    this.focusInput();
  }

  async sendMessageThroughParent(message) {
    return new Promise((resolve, reject) => {
      // Generate unique ID for this request
      const requestId = Math.random().toString(36).substr(2, 9);

      // Set up response handler
      const handler = event => {
        if (event.data.type === 'MESSAGE_RESPONSE' && event.data.requestId === requestId) {
          window.removeEventListener('message', handler);
          resolve(event.data.response);
        }
      };

      window.addEventListener('message', handler);

      // Send to parent with request ID
      window.parent.postMessage(
        {
          type: 'FORWARD_TO_BACKGROUND',
          message: message,
          requestId: requestId,
        },
        '*'
      );

      // Timeout after 30 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        reject(new Error('Request timeout'));
      }, 30000);
    });
  }

  addMessage(type, content, includeActions = false) {
    // Remove empty state if it exists
    const emptyState = this.chatMessages.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    // Render markdown for assistant messages, plain text for others
    if (type === 'assistant') {
      contentDiv.innerHTML = renderMarkdown(content);
      // Scroll again after markdown is rendered
      requestAnimationFrame(() => this.scrollToBottom());
    } else {
      contentDiv.textContent = content;
    }

    messageDiv.appendChild(contentDiv);

    // Add action buttons for assistant messages
    if (type === 'assistant' && includeActions) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'message-actions';

      const copyBtn = this.createActionButton('Copy', () => {
        navigator.clipboard.writeText(content);
        this.showToast('Copied to clipboard!');
      });

      actionsDiv.appendChild(copyBtn);

      // Add replace/insert buttons if there's selected text
      if (window.getSelection().toString()) {
        const replaceBtn = this.createActionButton('Replace', () => {
          this.replaceSelectedText(content);
        });

        actionsDiv.appendChild(replaceBtn);
      }

      messageDiv.appendChild(actionsDiv);
    }

    this.chatMessages.appendChild(messageDiv);
    this.scrollToBottom();
  }

  createActionButton(text, onClick) {
    const btn = document.createElement('button');
    btn.className = 'action-btn';
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  showLoadingIndicator() {
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'loading';
    loadingDiv.id = 'loading-indicator';

    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('div');
      dot.className = 'loading-dot';
      loadingDiv.appendChild(dot);
    }

    this.chatMessages.appendChild(loadingDiv);
    this.scrollToBottom();
  }

  hideLoadingIndicator() {
    const loading = document.getElementById('loading-indicator');
    if (loading) {
      loading.remove();
    }
  }

  showError(message) {
    this.addMessage('assistant', `❌ ${message}`);
  }

  showToast(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: white;
      padding: 8px 16px;
      border-radius: 4px;
      font-size: 14px;
      z-index: 10000;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 2000);
  }

  scrollToBottom() {
    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
    });
  }

  focusInput() {
    this.chatInput.focus();
  }

  async getPageContent() {
    // Send message to content script to get page content
    return new Promise(resolve => {
      // Post message to parent window
      window.parent.postMessage({ type: 'GET_PAGE_CONTENT' }, '*');

      // Listen for response
      const handler = event => {
        if (event.data.type === 'PAGE_CONTENT') {
          window.removeEventListener('message', handler);
          resolve(event.data.content);
        }
      };

      window.addEventListener('message', handler);

      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve('Failed to get page content');
      }, 5000);
    });
  }

  async getSelectedText() {
    return new Promise(resolve => {
      window.parent.postMessage({ type: 'GET_SELECTED_TEXT' }, '*');

      const handler = event => {
        if (event.data.type === 'SELECTED_TEXT') {
          window.removeEventListener('message', handler);
          resolve(event.data.content);
        }
      };

      window.addEventListener('message', handler);

      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve('');
      }, 1000);
    });
  }

  async replaceSelectedText(newText) {
    window.parent.postMessage(
      {
        type: 'REPLACE_SELECTED_TEXT',
        content: newText,
      },
      '*'
    );
  }

  async handleSidebarOpened() {
    this.focusInput();

    // Load current conversation if exists
    if (this.currentConversationId) {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_CONVERSATIONS',
        });

        const conversation = response.find(c => c.id === this.currentConversationId);
        if (conversation && conversation.messages) {
          // Clear messages and reload from conversation
          this.chatMessages.innerHTML = '';

          conversation.messages.forEach(msg => {
            if (
              msg.type === 'user' ||
              msg.type === 'assistant' ||
              (msg.type === 'debug' && this.showDebugMessages)
            ) {
              this.addMessage(msg.type, msg.content, msg.type === 'assistant');
            }
          });
        }
      } catch (error) {
        console.error('Failed to load conversation:', error);
      }
    }
  }

  async loadConversationHistory() {
    try {
      const conversations = await this.storage.getConversations();

      if (conversations.length === 0) {
        this.historyList.innerHTML = '<div class="empty-history">No conversations yet</div>';
        return;
      }

      // Clear the list
      this.historyList.innerHTML = '';

      // Add each conversation
      conversations.forEach(conversation => {
        const item = document.createElement('div');
        item.className = 'conversation-item';

        if (conversation.id === this.currentConversationId) {
          item.classList.add('active');
        }

        // Get first user message for preview
        const firstUserMessage = conversation.messages.find(m => m.type === 'user');
        const preview = firstUserMessage ? firstUserMessage.content : 'No messages';

        // Format date
        const date = new Date(conversation.updatedAt);
        const dateStr = this.formatDate(date);

        item.innerHTML = `
          <div class="conversation-header">
            <div class="conversation-title">${this.escapeHtml(conversation.title)}</div>
            <div class="conversation-date">${dateStr}</div>
          </div>
          <div class="conversation-preview">${this.escapeHtml(preview)}</div>
          <div class="conversation-actions">
            <!-- Delete button will be appended here -->
          </div>
        `;

        // Add click handler
        item.addEventListener('click', () => {
          this.loadConversation(conversation.id);
          this.hideHistoryPanel();
        });

        // Add delete button to the actions div
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-conversation-btn';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', async e => {
          e.stopPropagation();
          if (confirm('Delete this conversation?')) {
            await this.deleteConversation(conversation.id);
          }
        });

        const actionsDiv = item.querySelector('.conversation-actions');
        actionsDiv.appendChild(deleteBtn);
        this.historyList.appendChild(item);
      });
    } catch (error) {
      console.error('Failed to load conversation history:', error);
      this.historyList.innerHTML = '<div class="empty-history">Failed to load conversations</div>';
    }
  }

  formatDate(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return `${diffDays} days ago`;

    return date.toLocaleDateString();
  }

  async loadConversation(conversationId) {
    try {
      const conversations = await this.storage.getConversations();
      const conversation = conversations.find(c => c.id === conversationId);

      if (!conversation) {
        this.showError('Conversation not found');
        return;
      }

      // Clear current chat
      this.chatMessages.innerHTML = '';
      this.currentConversationId = conversationId;

      // Load messages
      conversation.messages.forEach(msg => {
        if (
          msg.type === 'user' ||
          msg.type === 'assistant' ||
          msg.type === 'task' ||
          (msg.type === 'debug' && this.showDebugMessages)
        ) {
          this.addMessage(msg.type, msg.content, msg.type === 'assistant');
        }
      });

      this.scrollToBottom();
    } catch (error) {
      console.error('Failed to load conversation:', error);
      this.showError('Failed to load conversation');
    }
  }

  async deleteConversation(conversationId) {
    try {
      await this.storage.deleteConversation(conversationId);

      // If we're deleting the current conversation, clear the chat
      if (conversationId === this.currentConversationId) {
        this.currentConversationId = null;
        this.chatMessages.innerHTML = '';
        this.updateEmptyState();
      }

      // Reload the history
      await this.loadConversationHistory();
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      this.showError('Failed to delete conversation');
    }
  }

  toggleHistoryPanel() {
    if (this.conversationHistory.style.display === 'none') {
      this.showHistoryPanel();
    } else {
      this.hideHistoryPanel();
    }
  }

  async showHistoryPanel() {
    this.conversationHistory.style.display = 'flex';
    await this.loadConversationHistory();
  }

  hideHistoryPanel() {
    this.conversationHistory.style.display = 'none';
  }

  startNewChat() {
    // Clear current conversation
    this.currentConversationId = null;
    this.chatMessages.innerHTML = '';
    this.updateEmptyState();
    this.focusInput();

    // Hide history panel if open
    this.hideHistoryPanel();
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new BuddySidebarUI();
  });
} else {
  new BuddySidebarUI();
}
