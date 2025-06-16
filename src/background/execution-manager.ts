import { StorageManager } from '../shared/storage-manager.js';
import type { ExecutionState } from '../shared/types.js';

export class ExecutionManager {
  private storage = StorageManager.getInstance();
  private activeExecutions = new Map<string, ExecutionState>();
  
  async startExecution(
    requestId: string,
    conversationId: string,
    type: 'task' | 'message',
    tabId?: number
  ): Promise<void> {
    const state: ExecutionState = {
      requestId,
      conversationId,
      type,
      startTime: Date.now(),
      lastActivity: Date.now(),
      toolCalls: [],
      isProcessing: true,
      tabId,
    };
    
    this.activeExecutions.set(requestId, state);
    await this.storage.setExecutionState(state);
  }
  
  async updateExecutionActivity(requestId: string, toolCall?: { name: string; input: any }): Promise<void> {
    const state = this.activeExecutions.get(requestId);
    if (!state) return;
    
    state.lastActivity = Date.now();
    
    if (toolCall) {
      state.toolCalls.push({
        ...toolCall,
        timestamp: Date.now(),
      });
    }
    
    await this.storage.setExecutionState(state);
  }
  
  async completeExecution(requestId: string): Promise<void> {
    const state = this.activeExecutions.get(requestId);
    if (!state) return;
    
    this.activeExecutions.delete(requestId);
    await this.storage.setExecutionState(null);
  }
  
  async checkForPendingExecution(): Promise<ExecutionState | null> {
    const savedState = await this.storage.getExecutionState();
    
    if (savedState && savedState.isProcessing) {
      // Check if execution is still recent (within 5 minutes)
      const age = Date.now() - savedState.lastActivity;
      if (age < 5 * 60 * 1000) {
        return savedState;
      } else {
        // Clear stale execution
        await this.storage.setExecutionState(null);
      }
    }
    
    return null;
  }
  
  async notifyTabOfExecution(tabId: number, executionState: ExecutionState): Promise<void> {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'RESTORE_EXECUTION_STATE',
        data: executionState,
      });
    } catch (error) {
      console.error('Failed to notify tab of execution state:', error);
    }
  }
  
  // Called when a tab completes loading - check if it needs execution state
  async handleTabComplete(tabId: number): Promise<void> {
    const executionState = await this.checkForPendingExecution();
    
    if (executionState) {
      // Update the tab ID in case it changed
      executionState.tabId = tabId;
      await this.storage.setExecutionState(executionState);
      
      // Notify the tab about pending execution
      setTimeout(() => {
        this.notifyTabOfExecution(tabId, executionState);
      }, 1000); // Give content script time to initialize
    }
  }
}