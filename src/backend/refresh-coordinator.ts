/** Coalesces invalidations while preserving one trailing authoritative refresh. */
export class RefreshCoordinator {
  private pending = false;
  private running = false;
  private disposed = false;

  constructor(private readonly refresh: () => Promise<unknown>, private readonly onError: (error: unknown) => void) {}

  request(): void {
    if (this.disposed) return;
    this.pending = true;
    if (!this.running) void this.drain();
  }

  dispose(): void { this.disposed = true; this.pending = false; }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      while (this.pending && !this.disposed) {
        this.pending = false;
        try { await this.refresh(); } catch (error) { this.onError(error); }
      }
    } finally { this.running = false; }
  }
}
