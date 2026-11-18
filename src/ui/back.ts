// The phone's Back button (and the browser's). Each layer the user opens (a
// sheet, a page inside the Atlas, search, a bottom bar, a selection, a lab
// card) adds a history entry, so Back closes the topmost layer and only
// leaves the app once nothing is open. Layers closed from the UI (a close
// button, Escape) take their entry back out quietly.
//
// Entries are interchangeable: only how many of ours sit in history matters.
// Each carries its depth (`fm`) so a popstate says how many remain, however
// many steps the browser moved.

interface Layer { key: string; close: () => void }

export class BackStack {
  private layers: Layer[] = [];
  /** Our entries in history right now, as far as we know. */
  private have = 0;
  /** A traversal we started is on its way. */
  private busy = false;
  /** Running close callbacks for a popstate: their own drops are already done. */
  private closing = false;

  constructor() {
    const depth = (history.state as { fm?: number } | null)?.fm;
    // A reload keeps the history: start from the bottom of ours.
    if (depth) { this.busy = true; history.go(-depth); }
    addEventListener('popstate', () => {
      const at = (history.state as { fm?: number } | null)?.fm ?? 0;
      this.have = at;
      if (this.busy) { this.busy = false; this.sync(); return; }
      this.closing = true;
      try {
        while (this.layers.length > at) this.layers.pop()!.close();
      } finally {
        this.closing = false;
      }
      this.sync();
    });
  }

  /** A layer opened; Back will call `close`. */
  push(key: string, close: () => void): void {
    this.layers.push({ key, close });
    this.sync();
  }

  has(key: string): boolean {
    return this.layers.some((l) => l.key === key);
  }

  count(key: string): number {
    return this.layers.filter((l) => l.key === key).length;
  }

  /** The newest layer with this key closed by itself. */
  dropLast(key: string): void {
    if (this.closing) return;
    for (let i = this.layers.length - 1; i >= 0; i--) {
      if (this.layers[i].key === key) { this.layers.splice(i, 1); break; }
    }
    this.sync();
  }

  /** Every layer with this key closed by itself. */
  dropAll(key: string): void {
    if (this.closing) return;
    this.layers = this.layers.filter((l) => l.key !== key);
    this.sync();
  }

  private sync(): void {
    if (this.busy) return;
    const want = this.layers.length;
    while (this.have < want) {
      this.have++;
      history.pushState({ ...(history.state ?? {}), fm: this.have }, '');
    }
    if (this.have > want) {
      this.busy = true;
      history.go(want - this.have);
    }
  }
}
