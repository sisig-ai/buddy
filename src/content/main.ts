// Main content script that initializes all Buddy functionality
import './buddy-icon.js';
import './sidebar.js';
import { PageParser } from './page-parser.js';

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

// Listen for messages from the service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
});

console.log('Buddy extension loaded successfully!');
