import { StorageManager } from '../shared/storage-manager.js';
import { AnthropicAPI } from './api/anthropic.js';
import type {
  TaskExecutionRequest,
  TaskExecutionResponse,
  Conversation,
  Message,
  AnthropicTool,
} from '../shared/types.js';
import { generateId } from '../shared/utils.js';

class BuddyServiceWorker {
  private storage = StorageManager.getInstance();
  private anthropicAPI: AnthropicAPI | null = null;
  private currentTabId: number | null = null;

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
      const settings = await this.storage.getSettings();
      const selectedModel = settings.selectedModel || 'claude-3-5-sonnet-20241022';
      this.anthropicAPI = new AnthropicAPI(apiKey, selectedModel);
    }
  }

  private async handleMessage(request: any, sender: chrome.runtime.MessageSender): Promise<any> {
    // Store the sender tab ID if message is from content script
    if (sender.tab?.id) {
      this.currentTabId = sender.tab.id;
    }

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
        await this.storage.saveSettings(request.data);
        // If model was changed, reinitialize API
        if (request.data.selectedModel && this.anthropicAPI) {
          this.anthropicAPI.setModel(request.data.selectedModel);
        }
        return { success: true };

      case 'GET_AVAILABLE_MODELS':
        return await this.getAvailableModels();

      case 'DELETE_CONVERSATION':
        return await this.storage.deleteConversation(request.data.conversationId);

      case 'SAVE_TASK':
        return await this.storage.saveTask(request.data.task);

      case 'DELETE_TASK':
        return await this.storage.deleteTask(request.data.taskId);

      case 'SEND_MESSAGE':
        return await this.sendMessage(request.data, sender.tab?.id);

      case 'OPEN_MANAGEMENT':
        chrome.tabs.create({ url: chrome.runtime.getURL('src/management/management.html') });
        return { success: true };

      default:
        throw new Error(`Unknown message type: ${request.type}`);
    }
  }

  private async executeTask(request: TaskExecutionRequest): Promise<TaskExecutionResponse> {
    try {
      // Try to initialize API if not already done
      if (!this.anthropicAPI) {
        await this.initializeAnthropicAPI();
      }

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

      // Pass tab context to API for tool execution
      (this.anthropicAPI as any).currentTabId = this.currentTabId;

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
      const settings = await this.storage.getSettings();
      const selectedModel = settings.selectedModel || 'claude-3-5-sonnet-20241022';
      this.anthropicAPI = new AnthropicAPI(apiKey, selectedModel);
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

  private async sendMessage(
    request: {
      message: string;
      conversationId?: string;
      showDebugMessages?: boolean;
    },
    senderTabId?: number
  ): Promise<{ success: boolean; result?: string; conversationId: string; error?: string }> {
    try {
      // Try to initialize API if not already done
      if (!this.anthropicAPI) {
        await this.initializeAnthropicAPI();
      }

      if (!this.anthropicAPI) {
        throw new Error('API key not configured. Please set your Anthropic API key in settings.');
      }

      // Get or create conversation
      let conversation: Conversation;
      if (request.conversationId) {
        const conversations = await this.storage.getConversations();
        conversation =
          conversations.find(c => c.id === request.conversationId) ||
          this.createNewConversation('Chat');
      } else {
        conversation = this.createNewConversation('Chat');
      }

      // Get page metadata from the sender tab, not the active tab
      let pageContext = '';
      const tabId = senderTabId || this.currentTabId;

      if (tabId) {
        try {
          const tab = await chrome.tabs.get(tabId);
          if (tab.url && !tab.url.startsWith('chrome://')) {
            pageContext = `\n\n[Current page: ${tab.title || 'Untitled'} - ${tab.url}]`;
          }
        } catch (error) {
          console.error('Failed to get tab info:', error);
        }
      }

      // Add user message to conversation with page context for first message
      const messageContent =
        conversation.messages.length === 0 ? request.message + pageContext : request.message;

      const userMessage: Message = {
        id: generateId(),
        type: 'user',
        content: messageContent,
        timestamp: Date.now(),
      };

      conversation.messages.push(userMessage);

      // Get conversation context for API call
      const conversationHistory = conversation.messages
        .filter(m => m.type !== 'task')
        .slice(-10) // Last 10 messages for context
        .map(m => ({
          role: m.type === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.content,
        }));

      // Define available tools
      const tools: AnthropicTool[] = [
        {
          name: 'read_page_content',
          description:
            'Read the visible content of the current web page. Use this when the user asks about "this page", "this site", "this repo", or needs information from the current webpage.',
          input_schema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      ];

      // Pass tab context to API for tool execution
      (this.anthropicAPI as any).currentTabId = tabId;

      // Add debug info to track what's being sent
      const debugInfo = {
        tabId: tabId,
        pageContext: pageContext,
        toolsProvided: tools.map(t => t.name),
        messageWithContext: messageContent,
      };

      console.log('Sending to API with debug info:', debugInfo);

      // Send message with tool capabilities - include ALL conversation history
      const result = await this.anthropicAPI.continueConversation(
        messageContent,
        conversationHistory.slice(0, -1), // Exclude the just-added user message since we pass it separately
        tools
      );

      // Create assistant response message
      const responseMessage: Message = {
        id: generateId(),
        type: 'assistant',
        content: result,
        timestamp: Date.now(),
      };

      // Add debug message if tool was used and debug is enabled
      if (
        request.showDebugMessages &&
        (this.anthropicAPI as any).lastToolCalls &&
        (this.anthropicAPI as any).lastToolCalls.length > 0
      ) {
        const debugMessage: Message = {
          id: generateId(),
          type: 'debug' as const,
          content: `Tool calls made:\n${JSON.stringify(
            (this.anthropicAPI as any).lastToolCalls.map((tc: any) => ({
              name: tc.name,
              input: tc.input,
            })),
            null,
            2
          )}`,
          timestamp: Date.now(),
        };
        conversation.messages.push(debugMessage);
      }

      // Update conversation
      conversation.messages.push(responseMessage);
      conversation.updatedAt = Date.now();

      // Save conversation
      await this.storage.saveConversation(conversation);

      return {
        success: true,
        result,
        conversationId: conversation.id,
      };
    } catch (error) {
      console.error('Message sending failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        conversationId: request.conversationId || generateId(),
      };
    }
  }

  private async getAvailableModels(): Promise<any> {
    try {
      // Try to initialize API if not already done
      if (!this.anthropicAPI) {
        await this.initializeAnthropicAPI();
      }

      if (!this.anthropicAPI) {
        return {
          success: false,
          error: 'API key not configured. Please set your Anthropic API key in settings.',
        };
      }

      const models = await this.anthropicAPI.getAvailableModels();
      return {
        success: true,
        models,
      };
    } catch (error) {
      console.error('Failed to get available models:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch models',
      };
    }
  }
}

// Initialize the service worker
new BuddyServiceWorker();
