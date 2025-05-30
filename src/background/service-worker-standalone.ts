// Buddy Background Service Worker - Standalone
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

  const BUILT_IN_TASKS = [
    {
      id: 'summarize-page',
      name: 'Summarize this page',
      description: 'Create a concise summary of the current page content',
      inputType: 'page' as const,
      prompt:
        'Please provide a clear, concise summary of this webpage content. Focus on the main points and key information.',
      isBuiltIn: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    {
      id: 'rephrase-text',
      name: 'Rephrase selected text',
      description: 'Improve or rephrase the selected text',
      inputType: 'selection' as const,
      prompt:
        'Please rephrase the following text to be clearer, more professional, or better written while maintaining the original meaning:',
      isBuiltIn: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ];

  // Utility functions
  function generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  function isDomainBlacklisted(url: string, blacklist: string[]): boolean {
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

  // Storage Manager
  class StorageManager {
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

    async getApiKey(): Promise<string | null> {
      const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.API_KEY);
      return result[BUDDY_CONFIG.STORAGE_KEYS.API_KEY] || null;
    }

    async saveApiKey(apiKey: string) {
      await chrome.storage.sync.set({
        [BUDDY_CONFIG.STORAGE_KEYS.API_KEY]: apiKey,
      });
    }

    async getConversations() {
      const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.CONVERSATIONS);
      return result[BUDDY_CONFIG.STORAGE_KEYS.CONVERSATIONS] || [];
    }

    async saveConversation(conversation: any) {
      const conversations = await this.getConversations();
      const existingIndex = conversations.findIndex((c: any) => c.id === conversation.id);

      if (existingIndex >= 0) {
        conversations[existingIndex] = conversation;
      } else {
        conversations.unshift(conversation);
      }

      const settings = await this.getSettings();
      const limitedConversations = conversations.slice(0, settings.conversationRetention);

      await chrome.storage.sync.set({
        [BUDDY_CONFIG.STORAGE_KEYS.CONVERSATIONS]: limitedConversations,
      });
    }

    async getTasks() {
      const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.TASKS);
      const customTasks = result[BUDDY_CONFIG.STORAGE_KEYS.TASKS] || [];
      return [...BUILT_IN_TASKS, ...customTasks];
    }

    async getBlacklist(): Promise<string[]> {
      const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.BLACKLIST);
      return result[BUDDY_CONFIG.STORAGE_KEYS.BLACKLIST] || [];
    }
  }

  // Anthropic API
  class AnthropicAPI {
    private apiKey: string;

    constructor(apiKey: string) {
      this.apiKey = apiKey;
    }

    async processTask(
      taskPrompt: string,
      content: string,
      conversationHistory: any[] = []
    ): Promise<string> {
      const messages = [
        ...conversationHistory,
        {
          role: 'user',
          content: `${taskPrompt}\n\nContent to process:\n${content}`,
        },
      ];

      const response = await this.sendRequest(messages);
      return response.content[0]?.text || 'No response received';
    }

    private async sendRequest(messages: any[]) {
      const requestBody = {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        messages: messages,
        system:
          "You are Buddy, a helpful AI assistant integrated into a Chrome browser extension. You help users interact with web content through various tasks like summarizing pages, rephrasing text, and answering questions. Be concise, helpful, and focused on the user's needs.",
      };

      const response = await fetch(BUDDY_CONFIG.ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      return await response.json();
    }
  }

  // Service Worker Main Class
  class BuddyServiceWorker {
    private storage = new StorageManager();
    private anthropicAPI: AnthropicAPI | null = null;

    constructor() {
      this.init();
    }

    private async init() {
      this.setupEventListeners();
      await this.initializeAnthropicAPI();
    }

    private setupEventListeners() {
      chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        this.handleMessage(request, sender)
          .then(sendResponse)
          .catch(error => {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true;
      });

      chrome.runtime.onInstalled.addListener(async details => {
        if (details.reason === 'install') {
          await this.handleFirstInstall();
        }
      });

      chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.url) {
          await this.checkAndNotifyBlacklist(tabId, tab.url);
        }
      });
    }

    private async initializeAnthropicAPI() {
      const apiKey = await this.storage.getApiKey();
      if (apiKey) {
        this.anthropicAPI = new AnthropicAPI(apiKey);
      }
    }

    private async handleMessage(request: any, sender: chrome.runtime.MessageSender): Promise<any> {
      switch (request.type) {
        case 'EXECUTE_TASK':
          return await this.executeTask(request.data);

        case 'UPDATE_API_KEY':
          return await this.updateApiKey(request.data.apiKey);

        case 'GET_CONVERSATIONS':
          return await this.storage.getConversations();

        case 'GET_TASKS':
          return await this.storage.getTasks();

        case 'GET_SETTINGS':
          return await this.storage.getSettings();

        case 'UPDATE_SETTINGS':
          return await this.storage.saveSettings(request.data);

        default:
          throw new Error(`Unknown message type: ${request.type}`);
      }
    }

    private async executeTask(request: any) {
      try {
        if (!this.anthropicAPI) {
          throw new Error('API key not configured. Please set your Anthropic API key in settings.');
        }

        const tasks = await this.storage.getTasks();
        const task = tasks.find((t: any) => t.id === request.taskId);

        if (!task) {
          throw new Error('Task not found');
        }

        // Create new conversation
        const conversation = {
          id: generateId(),
          title: task.name,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        // Execute task with Anthropic API
        const result = await this.anthropicAPI.processTask(task.prompt, request.content, []);

        // Create messages
        const taskMessage = {
          id: generateId(),
          type: 'task',
          content: `Executing: ${task.name}`,
          taskId: task.id,
          timestamp: Date.now(),
        };

        const responseMessage = {
          id: generateId(),
          type: 'assistant',
          content: result,
          timestamp: Date.now(),
        };

        conversation.messages.push(taskMessage, responseMessage);
        conversation.updatedAt = Date.now();

        await this.storage.saveConversation(conversation);

        return {
          success: true,
          result,
          conversationId: conversation.id,
        };
      } catch (error: any) {
        console.error('Task execution failed:', error);
        return {
          success: false,
          error: error.message || 'Unknown error occurred',
          conversationId: generateId(),
        };
      }
    }

    private async updateApiKey(apiKey: string) {
      try {
        await this.storage.saveApiKey(apiKey);
        this.anthropicAPI = new AnthropicAPI(apiKey);
        return { success: true };
      } catch (error) {
        console.error('Failed to update API key:', error);
        throw error;
      }
    }

    private async handleFirstInstall() {
      const defaultSettings = await this.storage.getSettings();
      await this.storage.saveSettings(defaultSettings);
      console.log('Buddy extension installed successfully!');
    }

    private async checkAndNotifyBlacklist(tabId: number, url: string) {
      const blacklist = await this.storage.getBlacklist();

      if (isDomainBlacklisted(url, blacklist)) {
        chrome.tabs
          .sendMessage(tabId, {
            type: 'SITE_BLACKLISTED',
            data: { url },
          })
          .catch(() => {
            // Tab might not have content script loaded yet
          });
      }
    }
  }

  // Initialize the service worker
  new BuddyServiceWorker();
})();
