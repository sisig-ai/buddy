import { StorageManager } from '../shared/storage-manager.js';
import { generateId } from '../shared/utils.js';

class ManagementUI {
  constructor() {
    this.storage = StorageManager.getInstance();
    this.initializeElements();
    this.setupEventListeners();
    this.loadSettings();
  }

  initializeElements() {
    // API Key elements
    this.apiKeyInput = document.getElementById('api-key');
    this.saveApiKeyBtn = document.getElementById('save-api-key');
    this.clearApiKeyBtn = document.getElementById('clear-api-key');

    // Model selection elements
    this.modelSelect = document.getElementById('model-select');
    this.refreshModelsBtn = document.getElementById('refresh-models');

    // Debug messages toggle
    this.debugToggle = document.getElementById('debug-messages-toggle');

    // Blacklist elements
    this.blacklistInput = document.getElementById('blacklist-input');
    this.addBlacklistBtn = document.getElementById('add-blacklist');
    this.blacklistItems = document.getElementById('blacklist-items');

    // Task elements
    this.createTaskBtn = document.getElementById('create-task');
    this.customTasksList = document.getElementById('custom-tasks-list');
    this.taskModal = document.getElementById('task-modal');
    this.taskForm = document.getElementById('task-form');
    this.cancelTaskBtn = document.getElementById('cancel-task');

    // Data management elements
    this.clearConversationsBtn = document.getElementById('clear-conversations');
    this.exportDataBtn = document.getElementById('export-data');
    this.importDataBtn = document.getElementById('import-data');
    this.importFileInput = document.getElementById('import-file');
  }

  setupEventListeners() {
    // API Key
    this.saveApiKeyBtn.addEventListener('click', () => this.saveApiKey());
    this.clearApiKeyBtn.addEventListener('click', () => this.clearApiKey());

    // Model selection
    this.modelSelect.addEventListener('change', () => this.saveSelectedModel());
    this.refreshModelsBtn.addEventListener('click', () => this.loadAvailableModels());

    // Debug messages toggle
    this.debugToggle.addEventListener('change', () => this.saveDebugSetting());

    // Blacklist
    this.addBlacklistBtn.addEventListener('click', () => this.addToBlacklist());
    this.blacklistInput.addEventListener('keypress', e => {
      if (e.key === 'Enter') this.addToBlacklist();
    });

    // Tasks
    this.createTaskBtn.addEventListener('click', () => this.showTaskModal());
    this.cancelTaskBtn.addEventListener('click', () => this.hideTaskModal());
    this.taskForm.addEventListener('submit', e => this.saveTask(e));
    this.taskModal.addEventListener('click', e => {
      if (e.target === this.taskModal) this.hideTaskModal();
    });

    // Data management
    this.clearConversationsBtn.addEventListener('click', () => this.clearConversations());
    this.exportDataBtn.addEventListener('click', () => this.exportData());
    this.importDataBtn.addEventListener('click', () => this.importFileInput.click());
    this.importFileInput.addEventListener('change', e => this.importData(e));
  }

  async loadSettings() {
    // Load API key (show masked)
    const apiKey = await this.storage.getApiKey();
    if (apiKey) {
      this.apiKeyInput.value = '•'.repeat(20);
      this.apiKeyInput.dataset.hasKey = 'true';
    }

    // Load available models and current selection
    await this.loadAvailableModels();

    // Load debug messages setting
    await this.loadDebugSetting();

    // Load blacklist
    await this.loadBlacklist();

    // Load custom tasks
    await this.loadCustomTasks();
  }

  async saveApiKey() {
    const apiKey = this.apiKeyInput.value.trim();
    if (!apiKey || apiKey === '•'.repeat(20)) {
      this.showMessage('Please enter a valid API key', 'error');
      return;
    }

    try {
      // Test the API key first
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_API_KEY',
        data: { apiKey },
      });

      if (response.success) {
        this.apiKeyInput.value = '•'.repeat(20);
        this.apiKeyInput.dataset.hasKey = 'true';
        this.showMessage('API key saved successfully', 'success');
      } else {
        this.showMessage('Failed to save API key', 'error');
      }
    } catch (error) {
      this.showMessage('Error saving API key', 'error');
    }
  }

  async clearApiKey() {
    if (!confirm('Are you sure you want to clear your API key?')) return;

    try {
      await this.storage.clearApiKey();
      this.apiKeyInput.value = '';
      this.apiKeyInput.dataset.hasKey = 'false';
      this.showMessage('API key cleared', 'success');
    } catch (error) {
      this.showMessage('Error clearing API key', 'error');
    }
  }

  async loadAvailableModels() {
    try {
      // First, load current settings to get selected model
      const settings = await this.storage.getSettings();
      const currentModel = settings.selectedModel || 'claude-3-5-sonnet-20241022';

      // Try to get models from API
      const response = await chrome.runtime.sendMessage({
        type: 'GET_AVAILABLE_MODELS',
      });

      if (response.success && response.models) {
        // Clear dropdown
        this.modelSelect.innerHTML = '';

        // Add models to dropdown
        response.models.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.display_name;
          if (model.id === currentModel) {
            option.selected = true;
          }
          this.modelSelect.appendChild(option);
        });

        this.showMessage('Models loaded successfully', 'success');
      } else {
        // Fallback to default models if API call fails
        const defaultModels = [
          { id: 'claude-3-5-sonnet-20241022', display_name: 'Claude 3.5 Sonnet' },
          { id: 'claude-3-sonnet-20240229', display_name: 'Claude 3 Sonnet' },
          { id: 'claude-3-haiku-20240307', display_name: 'Claude 3 Haiku' },
        ];

        this.modelSelect.innerHTML = '';
        defaultModels.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.display_name;
          if (model.id === currentModel) {
            option.selected = true;
          }
          this.modelSelect.appendChild(option);
        });

        this.showMessage(response.error || 'Using default models list', 'error');
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      this.showMessage('Failed to load models', 'error');
    }
  }

  async saveSelectedModel() {
    const selectedModel = this.modelSelect.value;
    if (!selectedModel) return;

    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        data: { selectedModel },
      });

      this.showMessage('Model updated successfully', 'success');
    } catch (error) {
      console.error('Failed to save model:', error);
      this.showMessage('Failed to save model selection', 'error');
    }
  }

  async loadDebugSetting() {
    try {
      const settings = await this.storage.getSettings();
      this.debugToggle.checked = settings.showDebugMessages || false;
    } catch (error) {
      console.error('Failed to load debug setting:', error);
    }
  }

  async saveDebugSetting() {
    try {
      const showDebugMessages = this.debugToggle.checked;

      await chrome.runtime.sendMessage({
        type: 'UPDATE_SETTINGS',
        data: { showDebugMessages },
      });

      this.showMessage(`Debug messages ${showDebugMessages ? 'enabled' : 'disabled'}`, 'success');
    } catch (error) {
      console.error('Failed to save debug setting:', error);
      this.showMessage('Failed to save debug setting', 'error');
    }
  }

  async loadBlacklist() {
    const blacklist = await this.storage.getBlacklist();
    this.blacklistItems.innerHTML = '';

    blacklist.forEach(domain => {
      const item = this.createBlacklistItem(domain);
      this.blacklistItems.appendChild(item);
    });
  }

  createBlacklistItem(domain) {
    const li = document.createElement('li');
    li.className = 'blacklist-item';
    li.innerHTML = `
      <span>${domain}</span>
      <button class="btn btn-secondary" data-domain="${domain}">Remove</button>
    `;

    li.querySelector('button').addEventListener('click', () => this.removeFromBlacklist(domain));
    return li;
  }

  async addToBlacklist() {
    const domain = this.blacklistInput.value.trim().toLowerCase();
    if (!domain) return;

    // Basic domain validation
    const domainRegex =
      /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$|^\*\.([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
    if (!domainRegex.test(domain)) {
      this.showMessage('Please enter a valid domain (e.g., example.com or *.example.com)', 'error');
      return;
    }

    try {
      await this.storage.addToBlacklist(domain);
      await this.loadBlacklist();
      this.blacklistInput.value = '';
      this.showMessage('Domain added to blacklist', 'success');
    } catch (error) {
      this.showMessage('Error adding to blacklist', 'error');
    }
  }

  async removeFromBlacklist(domain) {
    try {
      await this.storage.removeFromBlacklist(domain);
      await this.loadBlacklist();
      this.showMessage('Domain removed from blacklist', 'success');
    } catch (error) {
      this.showMessage('Error removing from blacklist', 'error');
    }
  }

  async loadCustomTasks() {
    const tasks = await this.storage.getTasks();
    const customTasks = tasks.filter(task => !task.isBuiltIn);

    this.customTasksList.innerHTML = '';

    if (customTasks.length === 0) {
      this.customTasksList.innerHTML =
        '<p class="help-text">No custom tasks yet. Create one to get started!</p>';
      return;
    }

    customTasks.forEach(task => {
      const item = this.createTaskItem(task);
      this.customTasksList.appendChild(item);
    });
  }

  createTaskItem(task) {
    const div = document.createElement('div');
    div.className = 'task-item';
    div.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; background-color: ${task.color || '#e8eaed'}; color: ${this.getContrastColor(task.color || '#e8eaed')};">
          ${task.icon || '📋'}
        </div>
        <div style="flex: 1;">
          <strong>${task.name}</strong>
          <p style="font-size: 12px; color: #666; margin: 4px 0 0 0;">${task.description}</p>
        </div>
      </div>
      <button class="btn btn-secondary" data-task-id="${task.id}">Delete</button>
    `;

    div.querySelector('button').addEventListener('click', () => this.deleteTask(task.id));
    return div;
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

  showTaskModal() {
    this.taskModal.style.display = 'flex';
    this.taskForm.reset();
    document.getElementById('task-name').focus();
  }

  hideTaskModal() {
    this.taskModal.style.display = 'none';
  }

  async saveTask(e) {
    e.preventDefault();

    const task = {
      id: generateId(),
      name: document.getElementById('task-name').value.trim(),
      description: document.getElementById('task-description').value.trim(),
      inputType: document.getElementById('task-input-type').value,
      icon: document.getElementById('task-icon').value.trim() || '📋',
      color: document.getElementById('task-color').value,
      prompt: document.getElementById('task-prompt').value.trim(),
      isBuiltIn: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await chrome.runtime.sendMessage({
        type: 'SAVE_TASK',
        data: { task },
      });

      await this.loadCustomTasks();
      this.hideTaskModal();
      this.showMessage('Task created successfully', 'success');
    } catch (error) {
      this.showMessage('Error creating task', 'error');
    }
  }

  async deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      await chrome.runtime.sendMessage({
        type: 'DELETE_TASK',
        data: { taskId },
      });

      await this.loadCustomTasks();
      this.showMessage('Task deleted successfully', 'success');
    } catch (error) {
      this.showMessage('Error deleting task', 'error');
    }
  }

  async clearConversations() {
    if (!confirm('Are you sure you want to clear all conversations? This cannot be undone.'))
      return;

    try {
      const conversations = await this.storage.getConversations();
      for (const conv of conversations) {
        await this.storage.deleteConversation(conv.id);
      }
      this.showMessage('All conversations cleared', 'success');
    } catch (error) {
      this.showMessage('Error clearing conversations', 'error');
    }
  }

  async exportData() {
    try {
      const data = {
        version: '1.0.2',
        exportDate: new Date().toISOString(),
        settings: await this.storage.getSettings(),
        blacklist: await this.storage.getBlacklist(),
        tasks: (await this.storage.getTasks()).filter(t => !t.isBuiltIn),
        conversations: await this.storage.getConversations(),
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `buddy-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      this.showMessage('Data exported successfully', 'success');
    } catch (error) {
      this.showMessage('Error exporting data', 'error');
    }
  }

  async importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.exportDate) {
        throw new Error('Invalid backup file');
      }

      if (confirm('This will replace your current settings and data. Continue?')) {
        // Import settings
        if (data.settings) {
          await this.storage.saveSettings(data.settings);
        }

        // Import blacklist
        if (data.blacklist) {
          await this.storage.saveBlacklist(data.blacklist);
        }

        // Import tasks
        if (data.tasks) {
          for (const task of data.tasks) {
            await this.storage.saveTask(task);
          }
        }

        // Import conversations
        if (data.conversations) {
          for (const conv of data.conversations) {
            await this.storage.saveConversation(conv);
          }
        }

        await this.loadSettings();
        this.showMessage('Data imported successfully', 'success');
      }
    } catch (error) {
      this.showMessage('Error importing data: Invalid file format', 'error');
    }

    // Reset file input
    e.target.value = '';
  }

  showMessage(text, type = 'info') {
    // Remove existing messages
    const existing = document.querySelector('.message');
    if (existing) existing.remove();

    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;

    document.querySelector('.container').insertBefore(message, document.querySelector('main'));

    setTimeout(() => message.remove(), 5000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ManagementUI();
  });
} else {
  new ManagementUI();
}
