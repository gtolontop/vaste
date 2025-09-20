// Small runtime logger that is quiet by default. Enable by setting `window.__VASTE_DEBUG__ = true` in the console.
export const logger = {
  debug: (...args: any[]) => {
    try {
      if (typeof window !== "undefined" && (window as any).__VASTE_DEBUG__) {
        // Use console.debug when available
        if ((console as any).debug) (console as any).debug(...args);
        else console.log(...args);
      }
    } catch (e) {
      // ignore
    }
  },
  info: (...args: any[]) => {
    try {
      if (typeof window !== "undefined" && (window as any).__VASTE_DEBUG__) {
        console.info(...args);
      }
    } catch (e) {
      // ignore
    }
  },
  warn: (...args: any[]) => {
    console.warn(...args);
  },
  error: (...args: any[]) => {
    console.error(...args);
  },
};
