// Debug script to test Anthropic API tool calls
// Run this in the Chrome extension's service worker console

async function testToolCall() {
  const apiKey = await chrome.storage.sync.get('apiKey');
  if (!apiKey.apiKey) {
    console.error('No API key found. Please set your API key first.');
    return;
  }

  const testMessage = "What is this page about?";
  const pageContext = "[Current page: Test Page - https://example.com]";
  
  const requestBody = {
    model: 'claude-3-sonnet-20240229',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: testMessage + '\n\n' + pageContext
      }
    ],
    system: "You are Buddy, a helpful AI assistant integrated into a Chrome browser extension. You help users interact with web content through various tasks like summarizing pages, rephrasing text, and answering questions. Be concise, helpful, and focused on the user's needs.\n\nIMPORTANT: You have access to a 'read_page_content' tool that allows you to read the visible content of the current web page. You should proactively use this tool when:\n- Users ask about \"this page\", \"this site\", \"this repo\", \"this article\", etc.\n- Users ask questions that likely relate to the current webpage\n- Users want information that could be found on the current page\n- The user's first message includes page context in brackets like [Current page: ...]\n\nAlways consider whether the user's question might be about the current page, even if they don't explicitly say so.",
    tools: [
      {
        name: 'read_page_content',
        description: 'Read the visible content of the current web page. Use this when the user asks about "this page", "this site", "this repo", or needs information from the current webpage.',
        input_schema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ]
  };

  console.log('Sending request with tools:', JSON.stringify(requestBody, null, 2));

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    });

    const result = await response.json();
    console.log('API Response:', JSON.stringify(result, null, 2));
    
    if (result.content) {
      const toolUse = result.content.find(c => c.type === 'tool_use');
      if (toolUse) {
        console.log('✅ Tool call detected!', toolUse);
      } else {
        console.log('❌ No tool call in response');
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testToolCall();