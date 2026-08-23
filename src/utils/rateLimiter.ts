interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export class InMemoryRateLimiter {
  private attempts: Map<string, RateLimitRecord> = new Map();
  private maxAttempts: number;
  private windowMs: number;

  constructor(maxAttempts: number = 10, windowMs: number = 60000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;

    // Periodic cleanup of expired records every 2 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [key, record] of this.attempts.entries()) {
        if (now > record.resetAt) {
          this.attempts.delete(key);
        }
      }
    }, 120000).unref();
  }

  isRateLimited(key: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record) return false;
    if (now > record.resetAt) {
      this.attempts.delete(key);
      return false;
    }

    return record.count >= this.maxAttempts;
  }

  recordFailure(key: string): void {
    const now = Date.now();
    const record = this.attempts.get(key);

    if (!record || now > record.resetAt) {
      this.attempts.set(key, {
        count: 1,
        resetAt: now + this.windowMs,
      });
    } else {
      record.count += 1;
    }
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

export const adminPinRateLimiter = new InMemoryRateLimiter(10, 60000);
export const employeePinRateLimiter = new InMemoryRateLimiter(10, 60000);
