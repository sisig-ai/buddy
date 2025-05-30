import { BUDDY_CONFIG, BUDDY_EVENTS } from '../shared/constants.js';
import { StorageManager } from '../shared/storage-manager.js';
import { throttle } from '../shared/utils.js';

export class BuddyIcon {
  private icon: HTMLElement | null = null;
  private isDragging = false;
  private storage = StorageManager.getInstance();
  private isVisible = true;

  async init() {
    await this.checkSiteBlacklist();
    if (!this.isVisible) {
      return;
    }

    this.createIcon();
    this.setupEventListeners();
    await this.loadPosition();
  }

  private async checkSiteBlacklist() {
    const blacklist = await this.storage.getBlacklist();
    const { isDomainBlacklisted } = await import('../shared/utils.js');
    this.isVisible = !isDomainBlacklisted(window.location.href, blacklist);
  }

  private createIcon() {
    if (document.getElementById('buddy-icon')) {
      return;
    }

    this.icon = document.createElement('div');
    this.icon.id = 'buddy-icon';
    this.icon.className = 'buddy-icon';
    this.icon.innerHTML = `
      <div class="buddy-icon-content">
        <span class="buddy-icon-text">Buddy</span>
      </div>
    `;

    // Add styles
    this.addStyles();

    document.body.appendChild(this.icon);
  }

  private addStyles() {
    if (document.getElementById('buddy-icon-styles')) {
      return;
    }

    const styles = document.createElement('style');
    styles.id = 'buddy-icon-styles';
    styles.textContent = `
      .buddy-icon {
        position: fixed;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2147483647;
        background: #2563eb;
        color: white;
        border-radius: 8px 0 0 8px;
        cursor: pointer;
        user-select: none;
        transition: all 0.2s ease;
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      }

      .buddy-icon:hover {
        background: #1d4ed8;
        transform: translateY(-50%) translateX(-2px);
        box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15);
      }

      .buddy-icon.dragging {
        background: #1e40af;
        transform: translateY(-50%) translateX(-4px);
        transition: none;
      }

      .buddy-icon-content {
        padding: 8px 12px 8px 16px;
        font-size: 14px;
        font-weight: 500;
        white-space: nowrap;
      }

      .buddy-icon-text {
        display: inline-block;
      }

      @media (max-width: 768px) {
        .buddy-icon-content {
          padding: 6px 8px 6px 12px;
          font-size: 12px;
        }
      }
    `;

    document.head.appendChild(styles);
  }

  private setupEventListeners() {
    if (!this.icon) {
      return;
    }

    // Click to toggle sidebar
    this.icon.addEventListener('click', e => {
      if (!this.isDragging) {
        this.toggleSidebar();
      }
    });

    // Drag functionality
    this.icon.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mousemove', throttle(this.handleMouseMove.bind(this), 16));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));

    // Listen for blacklist updates
    chrome.runtime.onMessage.addListener(message => {
      if (message.type === 'SITE_BLACKLISTED') {
        this.hide();
      }
    });

    // Prevent text selection during drag
    this.icon.addEventListener('selectstart', e => e.preventDefault());
  }

  private handleMouseDown(e: MouseEvent) {
    e.preventDefault();
    this.isDragging = true;
    this.icon?.classList.add('dragging');

    // Store initial mouse position for drag detection
    const startY = e.clientY;
    const iconRect = this.icon?.getBoundingClientRect();
    const offset = startY - (iconRect?.top || 0);

    this.icon?.setAttribute('data-offset', offset.toString());
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.isDragging || !this.icon) {
      return;
    }

    const offset = parseFloat(this.icon.getAttribute('data-offset') || '0');
    const newY = e.clientY - offset;
    const maxY = window.innerHeight - this.icon.offsetHeight;

    const constrainedY = Math.max(0, Math.min(newY, maxY));
    const percentage = (constrainedY / maxY) * 100;

    this.icon.style.top = `${constrainedY}px`;
    this.icon.style.transform = 'translateY(0)';
  }

  private async handleMouseUp() {
    if (!this.isDragging || !this.icon) {
      return;
    }

    this.isDragging = false;
    this.icon.classList.remove('dragging');

    // Calculate final position as percentage
    const iconRect = this.icon.getBoundingClientRect();
    const percentage = (iconRect.top / (window.innerHeight - this.icon.offsetHeight)) * 100;

    // Save position
    await this.storage.saveSettings({ iconPosition: Math.max(0, Math.min(100, percentage)) });

    // Reset transform
    this.icon.style.transform = 'translateY(-50%)';
  }

  private async loadPosition() {
    if (!this.icon) {
      return;
    }

    const settings = await this.storage.getSettings();
    const percentage = settings.iconPosition;

    // Convert percentage to actual position
    const maxY = window.innerHeight - this.icon.offsetHeight;
    const topPosition = (percentage / 100) * maxY;

    this.icon.style.top = `${topPosition}px`;
  }

  private toggleSidebar() {
    document.dispatchEvent(new CustomEvent(BUDDY_EVENTS.TOGGLE_SIDEBAR));
  }

  private hide() {
    if (this.icon) {
      this.icon.style.display = 'none';
      this.isVisible = false;
    }
  }

  private show() {
    if (this.icon) {
      this.icon.style.display = 'block';
      this.isVisible = true;
    }
  }

  // Handle window resize
  private handleResize = throttle(() => {
    if (this.icon && this.isVisible) {
      this.loadPosition();
    }
  }, 250);

  destroy() {
    if (this.icon) {
      this.icon.remove();
      this.icon = null;
    }

    const styles = document.getElementById('buddy-icon-styles');
    if (styles) {
      styles.remove();
    }

    window.removeEventListener('resize', this.handleResize);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const buddyIcon = new BuddyIcon();
    buddyIcon.init();
  });
} else {
  const buddyIcon = new BuddyIcon();
  buddyIcon.init();
}
