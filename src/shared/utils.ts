import { BUDDY_CONFIG } from './constants.js';
import type { BuddySettings } from './types.js';

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isDomainBlacklisted(url: string, blacklist: string[]): boolean {
  try {
    const domain = new URL(url).hostname;
    return blacklist.some(blocked => {
      if (blocked.startsWith('*.')) {
        const pattern = blocked.slice(2);
        return domain.endsWith(pattern);
      }
      return domain === blocked;
    });
  } catch {
    return false;
  }
}

export function sanitizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s\-.,!?;:'"]/g, '')
    .trim();
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + '...';
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString();
  }
}

export function getDefaultSettings(): BuddySettings {
  return {
    selectedModel: 'claude-3-5-sonnet-20241022',
    showDebugMessages: false,
    sidebarWidth: BUDDY_CONFIG.SIDEBAR_DEFAULT_WIDTH,
    iconPosition: BUDDY_CONFIG.ICON_DEFAULT_POSITION,
    blacklistedSites: [],
    defaultTasks: ['summarize-page', 'rephrase-text'],
    conversationRetention: BUDDY_CONFIG.MAX_CONVERSATION_HISTORY,
  };
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = window.setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}
