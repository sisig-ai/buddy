window.BUDDY_CONFIG = {
  SIDEBAR_DEFAULT_WIDTH: 400,
  SIDEBAR_MIN_WIDTH: 300,
  SIDEBAR_MAX_WIDTH: 800,
  ICON_SIZE: 24,
  ICON_DEFAULT_POSITION: 50, // percentage from top
  ANTHROPIC_API_URL: 'https://api.anthropic.com/v1/messages',
  MAX_CONVERSATION_HISTORY: 50,
  STORAGE_KEYS: {
    API_KEY: 'buddy_api_key',
    CONVERSATIONS: 'buddy_conversations',
    TASKS: 'buddy_tasks',
    SETTINGS: 'buddy_settings',
    BLACKLIST: 'buddy_blacklist',
  },
} as const;

window.BUILT_IN_TASKS = [
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
] as const;

window.BUDDY_EVENTS = {
  TOGGLE_SIDEBAR: 'buddy:toggle-sidebar',
  TASK_EXECUTE: 'buddy:task-execute',
  CONVERSATION_UPDATE: 'buddy:conversation-update',
  SETTINGS_CHANGE: 'buddy:settings-change',
} as const;
