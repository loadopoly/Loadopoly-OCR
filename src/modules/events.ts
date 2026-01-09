/**
 * Event Emitter System
 * 
 * Lightweight event system for module communication and graph events.
 * Uses the Mitt-style pattern for pub/sub event handling.
 */

import { ModuleEventType, ModuleEvent, EventHandler } from './types';
import { logger } from '../lib/logger';

// ============================================
// Event Emitter Class
// ============================================

class EventEmitter {
  private handlers: Map<ModuleEventType | '*', Set<EventHandler>> = new Map();
  private eventHistory: ModuleEvent[] = [];
  private maxHistorySize: number = 100;

  /**
   * Subscribe to an event type
   */
  on<T = unknown>(type: ModuleEventType | '*', handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventHandler);
    
    // Return unsubscribe function
    return () => this.off(type, handler);
  }

  /**
   * Subscribe to an event type once
   */
  once<T = unknown>(type: ModuleEventType, handler: EventHandler<T>): () => void {
    const wrappedHandler: EventHandler<T> = (event) => {
      this.off(type, wrappedHandler);
      handler(event);
    };
    return this.on(type, wrappedHandler);
  }

  /**
   * Unsubscribe from an event type
   */
  off<T = unknown>(type: ModuleEventType | '*', handler: EventHandler<T>): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler as EventHandler);
    }
  }

  /**
   * Emit an event
   */
  emit<T = unknown>(type: ModuleEventType, payload: T, source?: string): void {
    const event: ModuleEvent<T> = {
      type,
      timestamp: new Date(),
      payload,
      source,
    };

    // Store in history
    this.eventHistory.push(event as ModuleEvent);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    // Call type-specific handlers
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          handler(event as ModuleEvent);
        } catch (error) {
          logger.error(`Error in event handler for ${type}`, error);
        }
      }
    }

    // Call wildcard handlers
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          handler(event as ModuleEvent);
        } catch (error) {
          logger.error(`Error in wildcard event handler for ${type}`, error);
        }
      }
    }
  }

  /**
   * Emit an event and wait for all async handlers
   */
  async emitAsync<T = unknown>(type: ModuleEventType, payload: T, source?: string): Promise<void> {
    const event: ModuleEvent<T> = {
      type,
      timestamp: new Date(),
      payload,
      source,
    };

    // Store in history
    this.eventHistory.push(event as ModuleEvent);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    const promises: Promise<void>[] = [];

    // Call type-specific handlers
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        try {
          const result = handler(event as ModuleEvent);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (error) {
          logger.error(`Error in event handler for ${type}`, error);
        }
      }
    }

    // Call wildcard handlers
    const wildcardHandlers = this.handlers.get('*');
    if (wildcardHandlers) {
      for (const handler of wildcardHandlers) {
        try {
          const result = handler(event as ModuleEvent);
          if (result instanceof Promise) {
            promises.push(result);
          }
        } catch (error) {
          logger.error(`Error in wildcard event handler for ${type}`, error);
        }
      }
    }

    await Promise.all(promises);
  }

  /**
   * Get event history
   */
  getHistory(filter?: { type?: ModuleEventType; limit?: number }): ModuleEvent[] {
    let history = [...this.eventHistory];
    
    if (filter?.type) {
      history = history.filter(e => e.type === filter.type);
    }
    
    if (filter?.limit) {
      history = history.slice(-filter.limit);
    }
    
    return history;
  }

  /**
   * Clear all handlers
   */
  clearAll(): void {
    this.handlers.clear();
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get handler count for a type
   */
  listenerCount(type: ModuleEventType | '*'): number {
    return this.handlers.get(type)?.size || 0;
  }
}

// ============================================
// Singleton Export
// ============================================

export const eventEmitter = new EventEmitter();

// ============================================
// Convenience Functions for Graph Events
// ============================================

export function onNodeAdded(handler: EventHandler<{ nodeId: string; node: unknown }>): () => void {
  return eventEmitter.on('graph:nodeAdded', handler);
}

export function onNodeRemoved(handler: EventHandler<{ nodeId: string }>): () => void {
  return eventEmitter.on('graph:nodeRemoved', handler);
}

export function onEdgeAdded(handler: EventHandler<{ source: string; target: string; relationship: string }>): () => void {
  return eventEmitter.on('graph:edgeAdded', handler);
}

export function onEdgeRemoved(handler: EventHandler<{ source: string; target: string }>): () => void {
  return eventEmitter.on('graph:edgeRemoved', handler);
}

export function onGraphHealed(handler: EventHandler<{ healingResult: unknown }>): () => void {
  return eventEmitter.on('graph:healed', handler);
}

export function onAssetCreated(handler: EventHandler<{ assetId: string; asset: unknown }>): () => void {
  return eventEmitter.on('asset:created', handler);
}

export function onAssetUpdated(handler: EventHandler<{ assetId: string; changes: unknown }>): () => void {
  return eventEmitter.on('asset:updated', handler);
}

export function onAssetDeleted(handler: EventHandler<{ assetId: string }>): () => void {
  return eventEmitter.on('asset:deleted', handler);
}

// ============================================
// Graph Event Helpers
// ============================================

export const graph = {
  on: <T = unknown>(eventType: 'nodeAdded' | 'nodeRemoved' | 'edgeAdded' | 'edgeRemoved' | 'healed', handler: EventHandler<T>): (() => void) => {
    const fullType = `graph:${eventType}` as ModuleEventType;
    return eventEmitter.on(fullType, handler);
  },
  
  emit: <T = unknown>(eventType: 'nodeAdded' | 'nodeRemoved' | 'edgeAdded' | 'edgeRemoved' | 'healed', payload: T): void => {
    const fullType = `graph:${eventType}` as ModuleEventType;
    eventEmitter.emit(fullType, payload);
  },
};
