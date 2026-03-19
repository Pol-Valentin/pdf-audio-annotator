// Simple pub/sub event bus for inter-module communication
const listeners = {};

export const EventBus = {
  on(event, fn) {
    (listeners[event] ||= []).push(fn);
    return () => this.off(event, fn);
  },
  off(event, fn) {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(f => f !== fn);
  },
  emit(event, data) {
    (listeners[event] || []).forEach(fn => fn(data));
  },
};
