import { BUDDY_CONFIG } from '../../shared/constants.js';
import type { AnthropicMessage, AnthropicResponse, AnthropicTool } from '../../shared/types.js';

export class AnthropicAPI {
  private apiKey: string;
  private model: string;
  public currentTabId: number | null = null;
  public lastToolCalls: any[] = [];
  public permissionChecker: ((toolName: string) => Promise<boolean>) | null = null;
  public onToolCall: ((toolCall: any) => Promise<void>) | null = null;

  constructor(apiKey: string, model: string = 'claude-3-sonnet-20240229') {
    this.apiKey = apiKey;
    this.model = model;
  }

  setModel(model: string): void {
    this.model = model;
  }

  async processTask(
    taskPrompt: string,
    content: string,
    conversationHistory: AnthropicMessage[] = [],
    tools?: AnthropicTool[]
  ): Promise<string> {
    const messages: AnthropicMessage[] = [
      ...conversationHistory,
      {
        role: 'user',
        content: `${taskPrompt}\n\nContent to process:\n${content}`,
      },
    ];

    const response = await this.sendRequest(messages, tools);
    
    // Handle tool use responses if tools are provided
    if (tools && tools.length > 0) {
      const toolUses = response.content.filter(c => c.type === 'tool_use');
      if (toolUses.length > 0) {
        console.log('Tool use detected in task, handling tool calls...');
        this.lastToolCalls = toolUses;
        const toolCallResponse = await this.handleToolCalls(response, messages, tools);
        return toolCallResponse;
      }
    }
    
    // Extract text from response
    const textContent = response.content.find(c => c.type === 'text');
    return textContent?.text || response.content[0]?.text || 'No response received';
  }

  async continueConversation(
    userMessage: string,
    conversationHistory: AnthropicMessage[],
    tools?: AnthropicTool[]
  ): Promise<{ text: string; toolCalls?: any[] }> {
    const messages: AnthropicMessage[] = [
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage,
      },
    ];

    const response = await this.sendRequest(messages, tools);

    console.log('API Response:', JSON.stringify(response, null, 2));

    // Handle tool use responses
    const toolUses = response.content.filter(c => c.type === 'tool_use');
    if (toolUses.length > 0) {
      console.log('Tool use detected, handling tool calls...');
      this.lastToolCalls = toolUses;
      const toolCallResponse = await this.handleToolCalls(response, messages, tools);
      return {
        text: toolCallResponse,
        toolCalls: this.lastToolCalls
      };
    } else {
      this.lastToolCalls = [];
    }

    // Extract text from response
    const textContent = response.content.find(c => c.type === 'text');
    return {
      text: textContent?.text || 'No response received',
      toolCalls: []
    };
  }

  private async sendRequest(
    messages: AnthropicMessage[],
    tools?: AnthropicTool[]
  ): Promise<AnthropicResponse> {
    const requestBody: any = {
      model: this.model,
      max_tokens: 4000,
      messages: messages,
      system: `You are Buddy, a powerful browser AI assistant with direct access to automate web interactions.

CORE CAPABILITIES:
• read_page_content - Extract all visible text from the current page
• page_snapshot - Capture a visual screenshot (max 1024px width)
• dom_snapshot - Get structured DOM representation with element IDs, classes, and positions
• click - Click any element by text content or ID
• type_text - Type into the currently focused input field
• scroll_down/scroll_up - Navigate the page vertically
• navigate_back/navigate_forward - Use browser history
• go_to_url - Navigate to any URL

OPERATING PRINCIPLES:
1. ALWAYS use tools when asked about page content. Never say you can't see the page - use read_page_content or page_snapshot first.
2. When users reference "this page", "this site", "here", or ask what's on the screen - immediately use tools to gather context.
3. For any action request (click, fill form, navigate), attempt it with tools. Don't ask for clarification unless the element truly cannot be found after trying.
4. Chain multiple tools together to complete complex tasks. For example: read_page_content → click → type_text → click.
5. Be direct and action-oriented. No apologies or explanations about limitations unless a task is genuinely impossible.
6. If permission is denied for a tool, state clearly: "Permission denied for [action]. Grant permission to continue."

RESPONSE STYLE:
• Concise and direct - get to the point immediately
• Action-focused - do first, explain only if necessary
• Never apologize for using tools or taking actions
• If something fails, try alternative approaches before declaring it impossible

Remember: You have eyes (page_snapshot), understanding (read_page_content), and hands (click, type_text). Use them proactively.`,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      console.log('Sending request with tools:', tools);
    }

    // Create an AbortController for the 30-second timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(BUDDY_CONFIG.ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        console.error('API Error:', error);
        throw new Error(`Anthropic API error: ${response.status} - ${error}`);
      }

      const jsonResponse = await response.json();
      console.log('Raw API response:', JSON.stringify(jsonResponse, null, 2));
      return jsonResponse as AnthropicResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timed out after 30 seconds. Please try again.');
      }
      throw error;
    }
  }

  async validateApiKey(): Promise<boolean> {
    try {
      await this.sendRequest([
        {
          role: 'user',
          content: 'Hello',
        },
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async getAvailableModels(): Promise<
    Array<{ id: string; display_name: string; created_at: string }>
  > {
    try {
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }

      const data = await response.json();
      return data.data || [];
    } catch (error) {
      console.error('Error fetching available models:', error);
      // Return default models if API call fails
      return [
        {
          id: 'claude-3-5-sonnet-20241022',
          display_name: 'Claude 3.5 Sonnet',
          created_at: '2024-10-22T00:00:00Z',
        },
        {
          id: 'claude-3-sonnet-20240229',
          display_name: 'Claude 3 Sonnet',
          created_at: '2024-02-29T00:00:00Z',
        },
        {
          id: 'claude-3-haiku-20240307',
          display_name: 'Claude 3 Haiku',
          created_at: '2024-03-07T00:00:00Z',
        },
      ];
    }
  }

  private async handleToolCalls(
    response: AnthropicResponse,
    previousMessages: AnthropicMessage[],
    tools?: AnthropicTool[]
  ): Promise<string> {
    const toolCalls = response.content.filter(c => c.type === 'tool_use');
    const toolResults: any[] = [];

    // Execute each tool call
    for (const toolCall of toolCalls) {
      console.log(`Executing tool: ${toolCall.name} with input:`, toolCall.input);
      
      // Notify about tool call immediately
      if (this.onToolCall) {
        await this.onToolCall(toolCall);
      }
      
      try {
        // This will be handled by the service worker
        const result = await this.executeToolCall(toolCall.name!, toolCall.input);
        
        // Log result based on tool type
        if (toolCall.name === 'page_snapshot') {
          console.log(`Tool ${toolCall.name} result: screenshot captured`);
        } else if (typeof result === 'string' && result.length > 500) {
          console.log(`Tool ${toolCall.name} result (first 500 chars):`, result.substring(0, 500));
          console.log(`Tool ${toolCall.name} result length:`, result.length);
        } else {
          console.log(`Tool ${toolCall.name} result:`, result);
        }
        
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: result,
        });
      } catch (error) {
        console.error(`Tool ${toolCall.name} failed:`, error);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    // Build new messages array with tool results
    const updatedMessages: AnthropicMessage[] = [
      ...previousMessages,
      {
        role: 'assistant',
        content: response.content,
      },
      {
        role: 'user',
        content: toolResults,
      },
    ];

    // Send follow-up request with tool results
    const followUpResponse = await this.sendRequest(updatedMessages, tools);

    // Check if the follow-up response also contains tool calls
    const followUpToolCalls = followUpResponse.content.filter(c => c.type === 'tool_use');
    if (followUpToolCalls.length > 0) {
      console.log('Follow-up response contains tool calls, continuing conversation...');
      this.lastToolCalls = [...this.lastToolCalls, ...followUpToolCalls];
      // Recursively handle the new tool calls
      const recursiveResult = await this.handleToolCalls(followUpResponse, updatedMessages, tools);
      return recursiveResult;
    }

    // Extract text from follow-up response
    const textContent = followUpResponse.content.find(c => c.type === 'text');
    return textContent?.text || followUpResponse.content[0]?.text || 'No response received';
  }

  private async executeToolCall(toolName: string, input: any): Promise<string> {
    const tabId = this.currentTabId;

    if (!tabId) {
      console.error('No tab ID available for tool execution');
      return 'Unable to execute tool - no tab context available';
    }

    // Check permissions for all tools except read_page_content (always allowed)
    if (toolName !== 'read_page_content' && this.permissionChecker) {
      const hasPermission = await this.permissionChecker(toolName);
      if (!hasPermission) {
        return `Permission denied for tool: ${toolName}`;
      }
    }

    // Handle read_page_content as before
    if (toolName === 'read_page_content') {
      console.log(`Reading content from tab ${tabId}`);

      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: 'GET_PAGE_CONTENT',
        });

        console.log('Page content received:', response.content?.substring(0, 200) + '...');
        return response.content || 'No content available';
      } catch (error) {
        console.error('Failed to get page content from tab', tabId, error);
        return 'Failed to read page content. The page may not be accessible.';
      }
    }

    // Handle navigation tools that don't require content script
    if (toolName === 'navigate_back') {
      await chrome.tabs.goBack(tabId);
      return 'Navigated back';
    }

    if (toolName === 'navigate_forward') {
      await chrome.tabs.goForward(tabId);
      return 'Navigated forward';
    }

    if (toolName === 'go_to_url' && input.url) {
      // Set navigation state before navigating
      const { StorageManager } = await import('../../shared/storage-manager.js');
      const storage = StorageManager.getInstance();
      await storage.setNavigationState({
        pending: true,
        reopenSidebar: true,
        timestamp: Date.now()
      });
      
      await chrome.tabs.update(tabId, { url: input.url });
      // Give some time for navigation to start
      await new Promise(resolve => setTimeout(resolve, 500));
      return `Navigating to ${input.url}`;
    }

    // Handle page_snapshot
    if (toolName === 'page_snapshot') {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
          format: 'png',
          quality: 90
        });
        
        // Resize image to max 1024px width
        const resizedDataUrl = await this.resizeImage(dataUrl, 1024);
        return resizedDataUrl;
      } catch (error) {
        console.error('Failed to capture screenshot:', error);
        return 'Failed to capture screenshot. The page may not be accessible.';
      }
    }

    // Handle all other browser actions via content script
    const browserActions = ['dom_snapshot', 'click', 'type_text', 'scroll_down', 'scroll_up'];
    if (browserActions.includes(toolName)) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: 'EXECUTE_BROWSER_ACTION',
          data: {
            action: toolName,
            params: input
          }
        });

        if (!response.success) {
          throw new Error(response.error || 'Unknown error');
        }

        return response.result;
      } catch (error) {
        console.error(`Failed to execute ${toolName}:`, error);
        return `Failed to execute ${toolName}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      }
    }

    return `Unknown tool: ${toolName}`;
  }

  private async resizeImage(dataUrl: string, maxWidth: number): Promise<string> {
    try {
      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      // Create image bitmap from blob
      const imageBitmap = await createImageBitmap(blob);
      
      // Calculate new dimensions
      const scale = maxWidth / imageBitmap.width;
      const newWidth = maxWidth;
      const newHeight = Math.floor(imageBitmap.height * scale);
      
      // Create canvas and draw resized image
      const canvas = new OffscreenCanvas(newWidth, newHeight);
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(imageBitmap, 0, 0, newWidth, newHeight);
      
      // Convert back to blob and then data URL
      const resizedBlob = await canvas.convertToBlob({ type: 'image/png', quality: 0.9 });
      
      // Convert blob to data URL
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(resizedBlob);
      });
    } catch (error) {
      console.error('Error resizing image:', error);
      // Return original if resize fails
      return dataUrl;
    }
  }
}
