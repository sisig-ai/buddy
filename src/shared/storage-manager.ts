import { BUDDY_CONFIG, BUILT_IN_TASKS } from './constants.js';
import { getDefaultSettings } from './utils.js';
import type { BuddySettings, Conversation, Task, Message } from './types.js';

export class StorageManager {
  private static instance: StorageManager;

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
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
    const result = await chrome.storage.sync.get(BUDDY_CONFIG.STORAGE_KEYS.CONVERSATIONS);
    return result[BUDDY_CONFIG.STORAGE_KEYS.CONVERSATIONS] || [];
  }

  async saveConversation(conversation: Conversation): Promise<void> {
    const conversations = await this.getConversations();
    const existingIndex = conversations.findIndex(c => c.id === conversation.id);

    if (existingIndex >= 0) {
      conversations[existingIndex] = conversation;
    } else {
      conversations.unshift(conversation);
    }

    // Limit conversation history
    const settings = await this.getSettings();
    const limitedConversations = conversations.slice(0, settings.conversationRetention);

    await chrome.storage.sync.set({
      [BUDDY_CONFIG.STORAGE_KEYS.CONVERSATIONS]: limitedConversations,
    });
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const conversations = await this.getConversations();
    const filtered = conversations.filter(c => c.id !== conversationId);
    await chrome.storage.sync.set({
      [BUDDY_CONFIG.STORAGE_KEYS.CONVERSATIONS]: filtered,
    });
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
}
