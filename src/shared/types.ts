export interface Task {
  id: string;
  name: string;
  description: string;
  inputType: 'page' | 'selection';
  prompt: string;
  isBuiltIn: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  type: 'user' | 'assistant' | 'task';
  content: string;
  taskId?: string;
  taskOutput?: string;
  timestamp: number;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface BuddySettings {
  apiKey?: string;
  sidebarWidth: number;
  iconPosition: number;
  blacklistedSites: string[];
  defaultTasks: string[];
  conversationRetention: number;
}

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AnthropicResponse {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  id: string;
  model: string;
  role: 'assistant';
  stop_reason: string;
  stop_sequence: null;
  type: 'message';
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface TaskExecutionRequest {
  taskId: string;
  content: string;
  conversationId?: string;
}

export interface TaskExecutionResponse {
  success: boolean;
  result?: string;
  error?: string;
  conversationId: string;
}
