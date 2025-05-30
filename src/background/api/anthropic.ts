import { BUDDY_CONFIG } from '../../shared/constants.js';
import type { AnthropicMessage, AnthropicResponse } from '../../shared/types.js';

export class AnthropicAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
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
    return response.content[0]?.text || 'No response received';
  }

  async continueConversation(
    userMessage: string,
    conversationHistory: AnthropicMessage[]
  ): Promise<string> {
    const messages: AnthropicMessage[] = [
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage,
      },
    ];

    const response = await this.sendRequest(messages);
    return response.content[0]?.text || 'No response received';
  }

  private async sendRequest(messages: AnthropicMessage[]): Promise<AnthropicResponse> {
    const requestBody = {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 4000,
      messages: messages,
      system:
        "You are Buddy, a helpful AI assistant integrated into a Chrome browser extension. You help users interact with web content through various tasks like summarizing pages, rephrasing text, and answering questions. Be concise, helpful, and focused on the user's needs.",
    };

    const response = await fetch(BUDDY_CONFIG.ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${error}`);
    }

    return (await response.json()) as AnthropicResponse;
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
}
