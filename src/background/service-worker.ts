import { StorageManager } from '../shared/storage-manager.js';
import { AnthropicAPI } from './api/anthropic.js';
import { BUDDY_EVENTS } from '../shared/constants.js';
import type {
  TaskExecutionRequest,
  TaskExecutionResponse,
  Conversation,
  Message,
} from '../shared/types.js';
import { generateId } from '../shared/utils.js';

class BuddyServiceWorker {
  private storage = StorageManager.getInstance();
  private anthropicAPI: AnthropicAPI | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    this.setupEventListeners();
    await this.initializeAnthropicAPI();
  }

  private setupEventListeners() {
    // Handle messages from content scripts
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender)
        .then(sendResponse)
        .catch(error => {
          console.error('Error handling message:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep message channel open for async response
    });

    // Handle extension installation
    chrome.runtime.onInstalled.addListener(async details => {
      if (details.reason === 'install') {
        await this.handleFirstInstall();
      }
    });

    // Handle tab updates to check blacklist
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

      case 'DELETE_CONVERSATION':
        return await this.storage.deleteConversation(request.data.conversationId);

      case 'SAVE_TASK':
        return await this.storage.saveTask(request.data.task);

      case 'DELETE_TASK':
        return await this.storage.deleteTask(request.data.taskId);

      default:
        throw new Error(`Unknown message type: ${request.type}`);
    }
  }

  private async executeTask(request: TaskExecutionRequest): Promise<TaskExecutionResponse> {
    try {
      if (!this.anthropicAPI) {
        throw new Error('API key not configured. Please set your Anthropic API key in settings.');
      }

      const tasks = await this.storage.getTasks();
      const task = tasks.find(t => t.id === request.taskId);

      if (!task) {
        throw new Error('Task not found');
      }

      // Get or create conversation
      let conversation: Conversation;
      if (request.conversationId) {
        const conversations = await this.storage.getConversations();
        conversation =
          conversations.find(c => c.id === request.conversationId) ||
          this.createNewConversation(task.name);
      } else {
        conversation = this.createNewConversation(task.name);
      }

      // Create task message
      const taskMessage: Message = {
        id: generateId(),
        type: 'task',
        content: `Executing: ${task.name}`,
        taskId: task.id,
        timestamp: Date.now(),
      };

      // Get conversation context for API call
      const conversationHistory = conversation.messages
        .filter(m => m.type !== 'task')
        .slice(-10) // Last 10 messages for context
        .map(m => ({
          role: m.type === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.content,
        }));

      // Execute task with Anthropic API
      const result = await this.anthropicAPI.processTask(
        task.prompt,
        request.content,
        conversationHistory
      );

      // Create assistant response message
      const responseMessage: Message = {
        id: generateId(),
        type: 'assistant',
        content: result,
        timestamp: Date.now(),
      };

      // Update conversation
      conversation.messages.push(taskMessage, responseMessage);
      conversation.updatedAt = Date.now();

      // Save conversation
      await this.storage.saveConversation(conversation);

      return {
        success: true,
        result,
        conversationId: conversation.id,
      };
    } catch (error) {
      console.error('Task execution failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        conversationId: request.conversationId || generateId(),
      };
    }
  }

  private createNewConversation(title: string): Conversation {
    return {
      id: generateId(),
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private async updateApiKey(apiKey: string): Promise<{ success: boolean }> {
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
    // Initialize default settings and tasks
    const defaultSettings = await this.storage.getSettings();
    await this.storage.saveSettings(defaultSettings);

    console.log('Buddy extension installed successfully!');
  }

  private async checkAndNotifyBlacklist(tabId: number, url: string) {
    const blacklist = await this.storage.getBlacklist();
    const { isDomainBlacklisted } = await import('../shared/utils.js');

    if (isDomainBlacklisted(url, blacklist)) {
      // Send message to content script to disable Buddy
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
