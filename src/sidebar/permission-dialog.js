export class SidebarPermissionDialog {
  constructor() {
    this.activeRequest = null;
  }

  show(toolName) {
    return new Promise((resolve) => {
      // Create dialog element
      const dialog = document.createElement('div');
      dialog.className = 'permission-dialog';
      dialog.innerHTML = `
        <div class="permission-content">
          <h3>Permission Request</h3>
          <p>Buddy wants to perform:</p>
          <div class="permission-action">${this.formatToolName(toolName)}</div>
          <div class="permission-buttons">
            <button class="permission-deny">Deny</button>
            <button class="permission-allow-once">Allow Once</button>
            <button class="permission-allow-session">Allow for Session</button>
          </div>
        </div>
      `;

      // Add to chat messages
      const chatMessages = document.getElementById('chat-messages');
      chatMessages.appendChild(dialog);
      
      // Scroll to show dialog
      dialog.scrollIntoView({ behavior: 'smooth', block: 'end' });

      // Handle button clicks
      const denyBtn = dialog.querySelector('.permission-deny');
      const allowOnceBtn = dialog.querySelector('.permission-allow-once');
      const allowSessionBtn = dialog.querySelector('.permission-allow-session');

      const cleanup = () => {
        dialog.classList.add('fade-out');
        setTimeout(() => dialog.remove(), 300);
      };

      denyBtn.addEventListener('click', () => {
        cleanup();
        resolve('deny');
      });

      allowOnceBtn.addEventListener('click', () => {
        cleanup();
        resolve('allow_once');
      });

      allowSessionBtn.addEventListener('click', () => {
        cleanup();
        resolve('allow_session');
      });

      // Store active request
      this.activeRequest = { toolName, resolve };
    });
  }

  formatToolName(toolName) {
    const friendlyNames = {
      'page_snapshot': '📸 Take a screenshot',
      'dom_snapshot': '🔍 Read page structure',
      'click': '👆 Click on an element',
      'type_text': '⌨️ Type text',
      'scroll_down': '⬇️ Scroll down',
      'scroll_up': '⬆️ Scroll up',
      'navigate_back': '⬅️ Go back',
      'navigate_forward': '➡️ Go forward',
      'go_to_url': '🌐 Navigate to URL',
      'read_page_content': '📄 Read page content',
    };

    return friendlyNames[toolName] || toolName;
  }
}