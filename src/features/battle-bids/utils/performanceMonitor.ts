/**
 * Lightweight performance monitor for tracking tactical operations.
 */
export const PerformanceMonitor = {
  /**
   * Tracks the execution time of a function.
   */
  async track<T>(label: string, operation: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await operation();
      const end = performance.now();
      const duration = end - start;
      
      if (duration > 1000) {
        console.warn(`[PERF WARNING] Slow Tactical Operation: ${label} took ${duration.toFixed(2)}ms`);
      } else {
        // PERF logging disabled in production
      }
      
      return result;
    } catch (error) {
      const end = performance.now();
      console.error(`[PERF ERROR] Tactical Operation Failed: ${label} after ${(end - start).toFixed(2)}ms`);
      throw error;
    }
  }
};
