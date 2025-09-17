/**
 * Vaste API - Event System
 */

class EventManager {
    constructor() {
        this.listeners = new Map(); // Map<eventName, Set<callback>>
    }

    addEventListener(eventName, callback) {
        if (typeof callback !== 'function') {
            throw new Error('Event callback must be a function');
        }

        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, new Set());
        }

        this.listeners.get(eventName).add(callback);
    }

    removeEventListener(eventName, callback) {
        const listeners = this.listeners.get(eventName);
        if (listeners) {
            listeners.delete(callback);
            if (listeners.size === 0) {
                this.listeners.delete(eventName);
            }
        }
    }

    emit(eventName, ...args) {
        const listeners = this.listeners.get(eventName);
        if (listeners) {
            for (const callback of listeners) {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`[VASTE-API] Error in event listener for '${eventName}':`, error);
                }
            }
        }
    }

    hasListeners(eventName) {
        const listeners = this.listeners.get(eventName);
        return listeners && listeners.size > 0;
    }

    getListenerCount(eventName) {
        const listeners = this.listeners.get(eventName);
        return listeners ? listeners.size : 0;
    }

    clearAllListeners() {
        this.listeners.clear();
    }

    clearEventListeners(eventName) {
        this.listeners.delete(eventName);
    }
}

module.exports = { EventManager };