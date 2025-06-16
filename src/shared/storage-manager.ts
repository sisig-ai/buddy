import { BUDDY_CONFIG, BUILT_IN_TASKS } from './constants.js';
import { getDefaultSettings } from './utils.js';
import type { BuddySettings, Conversation, Task, ExecutionState } from './types.js';

export class StorageManager {
  private static instance: StorageManager;

  private constructor() {
    // Run migration on initialization
    this.migrateConversations();
  }

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  private async migrateConversations(): Promise<void> {
    try {
      // Check if we have conversations in the old format
      const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.CONVERSATIONS);
      const oldConversations = result[BUDDY_CONFIG.STORAGE_KEYS.CONVERSATIONS];

      if (oldConversations && Array.isArray(oldConversations) && oldConversations.length > 0) {
        console.log('Migrating conversations to new format...');

        // Save each conversation with its own key
        for (const conv of oldConversations) {
          const conversationKey = `buddy_conv_${conv.id}`;
          await chrome.storage.sync.set({
            [conversationKey]: conv,
          });
        }

        // Remove the old conversations key
        await chrome.storage.sync.remove(BUDDY_CONFIG.STORAGE_KEYS.CONVERSATIONS);
        console.log('Migration complete');
      }
    } catch (error) {
      console.error('Error migrating conversations:', error);
    }
  }

  async getSettings(): Promise<BuddySettings> {
    const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.SETTINGS);
    return result[BUDDY_CONFIG.STORAGE_KEYS.SETTINGS] || getDefaultSettings();
  }

  async saveSettings(settings: Partial<BuddySettings>): Promise<void> {
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

  async saveApiKey(apiKey: string): Promise<void> {
    await chrome.storage.sync.set({
      [BUDDY_CONFIG.STORAGE_KEYS.API_KEY]: apiKey,
    });
  }

  async clearApiKey(): Promise<void> {
    await chrome.storage.sync.remove(BUDDY_CONFIG.STORAGE_KEYS.API_KEY);
  }

  async getConversations(): Promise<Conversation[]> {
    // Get all storage keys
    const allData = await chrome.storage.sync.get(null);
    const conversations: Conversation[] = [];

    // Filter for conversation keys and parse them
    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith('buddy_conv_')) {
        conversations.push(value as Conversation);
      }
    }

    // Sort by updatedAt descending (newest first)
    return conversations.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    // Limit messages per conversation to prevent quota issues
    const MAX_MESSAGES_PER_CONVERSATION = 30;
    const limitedConversation = {
      ...conversation,
      messages: conversation.messages.slice(-MAX_MESSAGES_PER_CONVERSATION),
    };

    // Store each conversation with its own key
    const conversationKey = `buddy_conv_${conversation.id}`;

    try {
      await chrome.storage.sync.set({
        [conversationKey]: limitedConversation,
      });
    } catch (error) {
      // If still too large, reduce message count
      console.error('Storage quota exceeded, reducing message count', error);
      const reducedConversation = {
        ...limitedConversation,
        messages: limitedConversation.messages.slice(-10),
      };

      await chrome.storage.sync.set({
        [conversationKey]: reducedConversation,
      });
    }

    // Clean up old conversations beyond retention limit
    await this.cleanupOldConversations();
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const conversationKey = `buddy_conv_${conversationId}`;
    await chrome.storage.sync.remove(conversationKey);
    
    // If this was the current conversation, clear it
    const currentId = await this.getCurrentConversationId();
    if (currentId === conversationId) {
      await this.setCurrentConversationId(null);
    }
  }

  private async cleanupOldConversations(): Promise<void> {
    const settings = await this.getSettings();
    const conversations = await this.getConversations();

    // If we have more conversations than the retention limit, delete the oldest ones
    if (conversations.length > settings.conversationRetention) {
      const conversationsToDelete = conversations
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(settings.conversationRetention);

      // Remove each old conversation
      for (const conv of conversationsToDelete) {
        await this.deleteConversation(conv.id);
      }
    }
  }

  async getTasks(): Promise<Task[]> {
    const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.TASKS);
    const customTasks = result[BUDDY_CONFIG.STORAGE_KEYS.TASKS] || [];
    return [...BUILT_IN_TASKS, ...customTasks];
  }

  async saveTask(task: Task): Promise<void> {
    if (task.isBuiltIn) {
      throw new Error('Cannot modify built-in tasks');
    }

    const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.TASKS);
    const customTasks = result[BUDDY_CONFIG.STORAGE_KEYS.TASKS] || [];

    const existingIndex = customTasks.findIndex((t: Task) => t.id === task.id);
    if (existingIndex >= 0) {
      customTasks[existingIndex] = task;
    } else {
      customTasks.push(task);
    }

    await chrome.storage.sync.set({
      [BUDDY_CONFIG.STORAGE_KEYS.TASKS]: customTasks,
    });
  }

  async deleteTask(taskId: string): Promise<void> {
    const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.TASKS);
    const customTasks = result[BUDDY_CONFIG.STORAGE_KEYS.TASKS] || [];
    const filtered = customTasks.filter((t: Task) => t.id !== taskId);

    await chrome.storage.sync.set({
      [BUDDY_CONFIG.STORAGE_KEYS.TASKS]: filtered,
    });
  }

  async getBlacklist(): Promise<string[]> {
    const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.BLACKLIST);
    return result[BUDDY_CONFIG.STORAGE_KEYS.BLACKLIST] || [];
  }

  async saveBlacklist(domains: string[]): Promise<void> {
    await chrome.storage.sync.set({
      [BUDDY_CONFIG.STORAGE_KEYS.BLACKLIST]: domains,
    });
  }

  async addToBlacklist(domain: string): Promise<void> {
    const blacklist = await this.getBlacklist();
    if (!blacklist.includes(domain)) {
      blacklist.push(domain);
      await this.saveBlacklist(blacklist);
    }
  }

  async removeFromBlacklist(domain: string): Promise<void> {
    const blacklist = await this.getBlacklist();
    const filtered = blacklist.filter(d => d !== domain);
    await this.saveBlacklist(filtered);
  }

  async getCurrentConversationId(): Promise<string | null> {
    const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.CURRENT_CONVERSATION);
    return result[BUDDY_CONFIG.STORAGE_KEYS.CURRENT_CONVERSATION] || null;
  }

  async setCurrentConversationId(conversationId: string | null): Promise<void> {
    if (conversationId === null) {
      await chrome.storage.sync.remove(BUDDY_CONFIG.STORAGE_KEYS.CURRENT_CONVERSATION);
    } else {
      await chrome.storage.sync.set({
        [BUDDY_CONFIG.STORAGE_KEYS.CURRENT_CONVERSATION]: conversationId,
      });
    }
  }

  async getNavigationState(): Promise<{ pending: boolean; reopenSidebar: boolean; timestamp?: number } | null> {
    const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.NAVIGATION_STATE);
    return result[BUDDY_CONFIG.STORAGE_KEYS.NAVIGATION_STATE] || null;
  }

  async setNavigationState(state: { pending: boolean; reopenSidebar: boolean; timestamp?: number } | null): Promise<void> {
    if (state === null) {
      await chrome.storage.sync.remove(BUDDY_CONFIG.STORAGE_KEYS.NAVIGATION_STATE);
    } else {
      await chrome.storage.sync.set({
        [BUDDY_CONFIG.STORAGE_KEYS.NAVIGATION_STATE]: state,
      });
    }
  }

  async getExecutionState(): Promise<ExecutionState | null> {
    const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.EXECUTION_STATE);
    return result[BUDDY_CONFIG.STORAGE_KEYS.EXECUTION_STATE] || null;
  }

  async setExecutionState(state: ExecutionState | null): Promise<void> {
    if (state === null) {
      await chrome.storage.sync.remove(BUDDY_CONFIG.STORAGE_KEYS.EXECUTION_STATE);
    } else {
      await chrome.storage.sync.set({
        [BUDDY_CONFIG.STORAGE_KEYS.EXECUTION_STATE]: state,
      });
    }
  }
}
