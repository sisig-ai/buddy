import { StorageManager } from '../shared/storage-manager.js';
import { AnthropicAPI } from './api/anthropic.js';
import { BROWSER_AUTOMATION_TOOLS, ToolPermissionManager } from './browser-tools.js';
import { ExecutionManager } from './execution-manager.js';
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
  private permissionManager = new ToolPermissionManager();
  private executionManager = new ExecutionManager();

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

    // Handle tab updates to check blacklist and execution state
    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        await this.checkAndNotifyBlacklist(tabId, tab.url);
        // Check if this tab needs execution state restored
        await this.executionManager.handleTabComplete(tabId);
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
        return await this.executeTask(request.data, sender.tab?.id, request.requestId);

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
        return await this.sendMessage(request.data, sender.tab?.id, request.requestId);

      case 'OPEN_MANAGEMENT':
        chrome.tabs.create({ url: chrome.runtime.getURL('src/management/management.html') });
        return { success: true };

      default:
        throw new Error(`Unknown message type: ${request.type}`);
    }
  }

  private async executeTask(request: TaskExecutionRequest, senderTabId?: number, requestId?: string): Promise<TaskExecutionResponse> {
    // Start execution tracking
    const execRequestId = requestId || generateId();
    const conversationId = request.conversationId || generateId();
    
    try {
      await this.executionManager.startExecution(execRequestId, conversationId, 'task', senderTabId || this.currentTabId);
      
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
        const existing = conversations.find(c => c.id === request.conversationId);
        if (existing) {
          conversation = existing;
        } else {
          // Create new conversation with the requested ID
          conversation = {
            id: request.conversationId,
            title: task.name,
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        }
      } else {
        // Create new conversation with the generated ID
        conversation = {
          id: conversationId,
          title: task.name,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
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
      const tabId = senderTabId || this.currentTabId;
      (this.anthropicAPI as any).currentTabId = tabId;
      
      // Set up permission checker for tasks too
      if (tabId) {
        (this.anthropicAPI as any).permissionChecker = async (toolName: string) => {
          const permission = await this.permissionManager.checkPermission(toolName, tabId!);
          return permission === 'allowed';
        };
      }
      
      // Set up tool call callback for task execution
      (this.anthropicAPI as any).onToolCall = async (toolCall: any) => {
        // Send tool call update to content script immediately
        if (tabId) {
          try {
            await chrome.tabs.sendMessage(tabId, {
              type: 'TOOL_CALL_UPDATE',
              data: {
                toolName: toolCall.name,
                toolInput: toolCall.input,
                conversationId: conversation.id,
                requestId: execRequestId
              }
            });
            // Update execution activity
            await this.executionManager.updateExecutionActivity(execRequestId, toolCall);
          } catch (error) {
            console.error('Failed to send tool call update:', error);
          }
        }
      };

      // Define available tools - include all browser automation tools  
      const tools: AnthropicTool[] = BROWSER_AUTOMATION_TOOLS;
      
      // Execute task with Anthropic API
      const result = await this.anthropicAPI.processTask(
        task.prompt,
        request.content,
        conversationHistory,
        tools
      );

      // Create assistant response message
      const responseMessage: Message = {
        id: generateId(),
        type: 'assistant',
        content: result,
        timestamp: Date.now(),
      };
      
      // Add tool call messages if any tools were used
      if ((this.anthropicAPI as any).lastToolCalls && (this.anthropicAPI as any).lastToolCalls.length > 0) {
        const toolMessage: Message = {
          id: generateId(),
          type: 'tool' as const,
          content: JSON.stringify((this.anthropicAPI as any).lastToolCalls.map((tc: any) => ({
            name: tc.name,
            input: tc.input,
          }))),
          timestamp: Date.now(),
        };
        conversation.messages.push(taskMessage, toolMessage, responseMessage);
      } else {
        conversation.messages.push(taskMessage, responseMessage);
      }
      
      conversation.updatedAt = Date.now();

      // Save conversation
      await this.storage.saveConversation(conversation);

      // Complete execution tracking
      await this.executionManager.completeExecution(execRequestId);

      return {
        success: true,
        result,
        conversationId: conversation.id,
      };
    } catch (error) {
      console.error('Task execution failed:', error);
      // Clear execution on error
      if (execRequestId) {
        await this.executionManager.completeExecution(execRequestId);
      }
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
    senderTabId?: number,
    requestId?: string
  ): Promise<{ success: boolean; result?: string; conversationId: string; error?: string }> {
    // Start execution tracking
    const execRequestId = requestId || generateId();
    const conversationId = request.conversationId || generateId();
    
    try {
      await this.executionManager.startExecution(execRequestId, conversationId, 'message', senderTabId || this.currentTabId);
      
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
        const existing = conversations.find(c => c.id === request.conversationId);
        if (existing) {
          conversation = existing;
        } else {
          // Create new conversation with the requested ID
          conversation = {
            id: request.conversationId,
            title: 'Chat',
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
        }
      } else {
        // Create new conversation with the generated ID
        conversation = {
          id: conversationId,
          title: 'Chat',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
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

      // Define available tools - include all browser automation tools
      const tools: AnthropicTool[] = BROWSER_AUTOMATION_TOOLS;

      // Pass tab context to API for tool execution
      (this.anthropicAPI as any).currentTabId = tabId;
      
      // Set up permission checker
      (this.anthropicAPI as any).permissionChecker = async (toolName: string) => {
        const permission = await this.permissionManager.checkPermission(toolName, tabId);
        return permission === 'allowed';
      };

      // Add debug info to track what's being sent
      const debugInfo = {
        tabId: tabId,
        pageContext: pageContext,
        toolsProvided: tools.map(t => t.name),
        messageWithContext: messageContent,
      };

      console.log('Sending to API with debug info:', debugInfo);

      // Create a callback to send tool updates immediately
      (this.anthropicAPI as any).onToolCall = async (toolCall: any) => {
        // Send tool call update to content script immediately
        if (tabId) {
          try {
            await chrome.tabs.sendMessage(tabId, {
              type: 'TOOL_CALL_UPDATE',
              data: {
                toolName: toolCall.name,
                toolInput: toolCall.input,
                conversationId: conversation.id,
                requestId: execRequestId
              }
            });
            // Update execution activity
            await this.executionManager.updateExecutionActivity(execRequestId, toolCall);
          } catch (error) {
            console.error('Failed to send tool call update:', error);
          }
        }
      };

      // Send message with tool capabilities - include ALL conversation history
      const apiResponse = await this.anthropicAPI.continueConversation(
        request.message, // Use the original message without page context
        conversationHistory.slice(0, -1), // Exclude the just-added user message since we pass it separately
        tools
      );

      // Create assistant response message
      const responseMessage: Message = {
        id: generateId(),
        type: 'assistant',
        content: apiResponse.text,
        timestamp: Date.now(),
      };

      // Add tool call messages if any tools were used
      if (apiResponse.toolCalls && apiResponse.toolCalls.length > 0) {
        // Always add a tool message (not debug) to show what actions were performed
        const toolMessage: Message = {
          id: generateId(),
          type: 'tool' as const,
          content: JSON.stringify(apiResponse.toolCalls.map((tc: any) => ({
            name: tc.name,
            input: tc.input,
          }))),
          timestamp: Date.now(),
        };
        conversation.messages.push(toolMessage);
      }

      // Update conversation
      conversation.messages.push(responseMessage);
      conversation.updatedAt = Date.now();

      // Save conversation
      await this.storage.saveConversation(conversation);

      // Complete execution tracking
      await this.executionManager.completeExecution(execRequestId);

      return {
        success: true,
        result: apiResponse.text,
        conversationId: conversation.id,
        toolCalls: apiResponse.toolCalls,
      };
    } catch (error) {
      console.error('Message sending failed:', error);
      // Clear execution on error
      if (execRequestId) {
        await this.executionManager.completeExecution(execRequestId);
      }
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
