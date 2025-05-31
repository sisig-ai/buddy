import { BUDDY_CONFIG } from '../../shared/constants.js';
import type { AnthropicMessage, AnthropicResponse, AnthropicTool } from '../../shared/types.js';

export class AnthropicAPI {
  private apiKey: string;
  private model: string;
  public currentTabId: number | null = null;
  public lastToolCalls: any[] = [];

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
    conversationHistory: AnthropicMessage[] = []
  ): Promise<string> {
    const messages: AnthropicMessage[] = [
      ...conversationHistory,
      {
        role: 'user',
        content: `${taskPrompt}\n\nContent to process:\n${content}`,
      },
    ];

    const response = await this.sendRequest(messages);
    // Extract text from response
    const textContent = response.content.find(c => c.type === 'text');
    return textContent?.text || response.content[0]?.text || 'No response received';
  }

  async continueConversation(
    userMessage: string,
    conversationHistory: AnthropicMessage[],
    tools?: AnthropicTool[]
  ): Promise<string> {
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
      return toolCallResponse;
    } else {
      this.lastToolCalls = [];
    }

    // Extract text from response
    const textContent = response.content.find(c => c.type === 'text');
    return textContent?.text || 'No response received';
  }

  private async sendRequest(
    messages: AnthropicMessage[],
    tools?: AnthropicTool[]
  ): Promise<AnthropicResponse> {
    const requestBody: any = {
      model: this.model,
      max_tokens: 4000,
      messages: messages,
      system:
        'You are Buddy, a helpful AI assistant integrated into a Chrome browser extension. You help users interact with web content through various tasks like summarizing pages, rephrasing text, and answering questions. Be concise, helpful, and focused on the user\'s needs.\n\nIMPORTANT: You have access to a \'read_page_content\' tool that allows you to read the visible content of the current web page. You should proactively use this tool when:\n- Users ask about "this page", "this site", "this repo", "this article", etc.\n- Users ask questions that likely relate to the current webpage\n- Users want information that could be found on the current page\n- The user\'s first message includes page context in brackets like [Current page: ...]\n\nAlways consider whether the user\'s question might be about the current page, even if they don\'t explicitly say so.',
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      console.log('Sending request with tools:', tools);
    }

    const response = await fetch(BUDDY_CONFIG.ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('API Error:', error);
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    const jsonResponse = await response.json();
    console.log('Raw API response:', JSON.stringify(jsonResponse, null, 2));
    return jsonResponse as AnthropicResponse;
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
      if (toolCall.name === 'read_page_content') {
        // This will be handled by the service worker
        const result = await this.executeToolCall(toolCall.name!, toolCall.input);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: result,
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

    // Extract text from follow-up response
    const textContent = followUpResponse.content.find(c => c.type === 'text');
    return textContent?.text || followUpResponse.content[0]?.text || 'No response received';
  }

  private async executeToolCall(toolName: string, input: any): Promise<string> {
    // This method is called from within the service worker context
    // We need to use the correct tab ID that was passed from the content script
    if (toolName === 'read_page_content') {
      const tabId = this.currentTabId;

      if (!tabId) {
        console.error('No tab ID available for reading page content');
        return 'Unable to read page content - no tab context available';
      }

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

    return 'Unknown tool';
  }
}
