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
  type: 'user' | 'assistant' | 'task' | 'debug';
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
  content:
    | string
    | Array<{
        type: 'text' | 'tool_use' | 'tool_result';
        text?: string;
        id?: string;
        name?: string;
        input?: any;
        tool_use_id?: string;
        content?: string;
      }>;
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface AnthropicResponse {
  content: Array<{
    type: 'text' | 'tool_use';
    text?: string;
    id?: string;
    name?: string;
    input?: any;
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
