// Main content script that initializes all Buddy functionality
import './buddy-icon.js';
import './sidebar.js';

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
  version: '1.0.0',
  toggleSidebar: () => {
    document.dispatchEvent(new CustomEvent('buddy:toggle-sidebar'));
  },
};

console.log('Buddy extension loaded successfully!');
