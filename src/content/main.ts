// Main content script that initializes all Buddy functionality
import './buddy-icon.js';
import './sidebar.js';
import { PageParser } from './page-parser.js';
import { BrowserActionHandler } from './browser-actions.js';

// Export global API for debugging
declare global {
  interface Window {
    Buddy: {
      version: string;
      toggleSidebar: () => void;
    };
  }
}

window.Buddy = {
  version: '1.0.2',
  toggleSidebar: () => {
    document.dispatchEvent(new CustomEvent('buddy:toggle-sidebar'));
  },
};

// Initialize browser action handler
const browserActions = new BrowserActionHandler();

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TOOL_CALL_UPDATE') {
    // Forward tool call update to sidebar
    const sidebarFrame = document.querySelector('iframe#buddy-sidebar-content') as HTMLIFrameElement;
    if (sidebarFrame && sidebarFrame.contentWindow) {
      sidebarFrame.contentWindow.postMessage({
        type: 'TOOL_CALL_UPDATE',
        data: request.data,
        requestId: request.data.requestId // Pass through the requestId
      }, '*');
    }
    sendResponse({ success: true });
    return;
  }

  if (request.type === 'RESTORE_EXECUTION_STATE') {
    // Forward execution state to sidebar
    const sidebarFrame = document.querySelector('iframe#buddy-sidebar-content') as HTMLIFrameElement;
    if (sidebarFrame && sidebarFrame.contentWindow) {
      sidebarFrame.contentWindow.postMessage({
        type: 'RESTORE_EXECUTION_STATE',
        data: request.data
      }, '*');
    }
    sendResponse({ success: true });
    return;
  }

  if (request.type === 'GET_PAGE_CONTENT') {
    try {
      const content = PageParser.extractPageContent();
      const metadata = PageParser.getPageMetadata();

      sendResponse({
        success: true,
        content: `Page: ${metadata.title}\nURL: ${metadata.url}\n\n${content}`,
      });
    } catch (error) {
      sendResponse({
        success: false,
        error: 'Failed to extract page content',
      });
    }
    return true; // Keep message channel open
  }

  if (request.type === 'SITE_BLACKLISTED') {
    // Handle blacklisted site - disable Buddy
    document.body.classList.add('buddy-disabled');
    console.log('Buddy is disabled on this site');
    sendResponse({ success: true });
    return true;
  }

  // Forward permission requests to sidebar
  if (request.type === 'FORWARD_TO_SIDEBAR') {
    const sidebarFrame = document.querySelector('iframe#buddy-sidebar-content') as HTMLIFrameElement;
    if (sidebarFrame && sidebarFrame.contentWindow) {
      // Generate a unique ID for this request
      const requestId = request.data.requestId;
      
      // Set up listener for response
      const responseHandler = (event: MessageEvent) => {
        if (event.data.type === 'TOOL_PERMISSION_RESPONSE' && event.data.requestId === requestId) {
          window.removeEventListener('message', responseHandler);
          sendResponse({ permission: event.data.permission });
        }
      };
      
      window.addEventListener('message', responseHandler);
      
      // Forward to sidebar
      sidebarFrame.contentWindow.postMessage(request.data, '*');
      
      // Timeout after 30 seconds
      setTimeout(() => {
        window.removeEventListener('message', responseHandler);
        sendResponse({ permission: 'deny' });
      }, 30000);
    } else {
      // Sidebar not open, deny permission
      sendResponse({ permission: 'deny' });
    }
    return true; // Keep message channel open for async response
  }

  // Handle browser actions
  if (request.type === 'EXECUTE_BROWSER_ACTION') {
    const { action, params } = request.data;
    
    (async () => {
      try {
        let result;
        
        switch (action) {
          case 'page_snapshot':
            result = await browserActions.capturePageSnapshot();
            break;
            
          case 'dom_snapshot':
            result = browserActions.getDomSnapshot();
            break;
            
          case 'click':
            await browserActions.click(params.element_text, params.element_id, params.exact);
            result = 'Clicked successfully';
            break;
            
          case 'type_text':
            await browserActions.typeText(params.input_text);
            result = 'Text typed successfully';
            break;
            
          case 'scroll_down':
            await browserActions.scrollDown();
            result = 'Scrolled down';
            break;
            
          case 'scroll_up':
            await browserActions.scrollUp();
            result = 'Scrolled up';
            break;
            
          default:
            throw new Error(`Unknown browser action: ${action}`);
        }
        
        sendResponse({ success: true, result });
      } catch (error) {
        sendResponse({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    })();
    
    return true; // Keep message channel open for async response
  }
});

console.log('Buddy extension loaded successfully!');
