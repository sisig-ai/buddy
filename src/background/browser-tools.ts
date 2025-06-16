import type { AnthropicTool } from '../shared/types.js';

export const BROWSER_AUTOMATION_TOOLS: AnthropicTool[] = [
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
  {
    name: 'page_snapshot',
    description:
      'Take a visual screenshot of the current page. Returns a screenshot of the visible area of the page, scaled to max 1024px width.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'dom_snapshot',
    description:
      'Get a structured DOM representation of the current page including element IDs, classes, text content, and interactive elements.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'click',
    description:
      'Click on an element on the page. You can identify the element either by its visible text or by its ID.',
    input_schema: {
      type: 'object',
      properties: {
        element_text: {
          type: 'string',
          description: 'The visible text of the element to click',
        },
        element_id: {
          type: 'string',
          description: 'The ID attribute of the element to click',
        },
        exact: {
          type: 'boolean',
          description: 'Whether to match text exactly or allow partial matches. Default is true.',
        },
      },
      required: [],
    },
  },
  {
    name: 'type_text',
    description:
      'Type text into the currently focused element. Simulates real keystrokes with human-like delays.',
    input_schema: {
      type: 'object',
      properties: {
        input_text: {
          type: 'string',
          description: 'The text to type into the focused element',
        },
      },
      required: ['input_text'],
    },
  },
  {
    name: 'scroll_down',
    description: 'Scroll down by one viewport height with smooth animation.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'scroll_up',
    description: 'Scroll up by one viewport height with smooth animation.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'navigate_back',
    description: 'Navigate back to the previous page in browser history.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'navigate_forward',
    description: 'Navigate forward to the next page in browser history.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'go_to_url',
    description: 'Navigate the current tab to a specific URL.',
    input_schema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to',
        },
      },
      required: ['url'],
    },
  },
];

export interface ToolPermissionState {
  sessionAllowed: Set<string>;
  deniedTools: Set<string>;
}

export class ToolPermissionManager {
  private state: ToolPermissionState = {
    sessionAllowed: new Set(),
    deniedTools: new Set(),
  };

  async checkPermission(toolName: string, tabId: number): Promise<'allowed' | 'denied'> {
    // Check if denied
    if (this.state.deniedTools.has(toolName)) {
      return 'denied';
    }

    // Check if allowed for session
    if (this.state.sessionAllowed.has(toolName)) {
      return 'allowed';
    }

    // Ask user for permission through sidebar
    return new Promise((resolve) => {
      const requestId = Date.now().toString();
      
      // First, send to content script which will forward to sidebar
      chrome.tabs.sendMessage(
        tabId,
        {
          type: 'FORWARD_TO_SIDEBAR',
          data: {
            type: 'TOOL_PERMISSION_REQUEST',
            toolName,
            requestId,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Permission request failed:', chrome.runtime.lastError);
            resolve('denied');
            return;
          }

          if (response?.permission === 'allow_once') {
            resolve('allowed');
          } else if (response?.permission === 'allow_session') {
            this.state.sessionAllowed.add(toolName);
            resolve('allowed');
          } else {
            this.state.deniedTools.add(toolName);
            resolve('denied');
          }
        }
      );
    });
  }

  clearSession() {
    this.state.sessionAllowed.clear();
    this.state.deniedTools.clear();
  }
}