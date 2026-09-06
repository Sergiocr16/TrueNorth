import 'server-only';

import type { DocumentReference, WriteBatch } from 'firebase-admin/firestore';
import { adminDb } from './admin';

/** A Firestore batch holds 500 operations; a big table has more. */
const BATCH = 400;

/** Writes in chunks: a batch holds 500 operations, and a big table has more. */
export class Writer {
  private batch: WriteBatch;
  private count = 0;
  written = 0;
  deleted = 0;

  constructor(private readonly db = adminDb()) {
    this.batch = db.batch();
  }

  private async tick(): Promise<void> {
    this.count += 1;
    if (this.count >= BATCH) await this.flush();
  }

  async set(ref: DocumentReference, data: object): Promise<void> {
    this.batch.set(ref, data);
    this.written += 1;
    await this.tick();
  }

  async update(ref: DocumentReference, data: object): Promise<void> {
    this.batch.update(ref, data);
    await this.tick();
  }

  async delete(ref: DocumentReference): Promise<void> {
    this.batch.delete(ref);
    this.deleted += 1;
    await this.tick();
  }

  async flush(): Promise<void> {
    if (this.count === 0) return;
    await this.batch.commit();
    this.batch = this.db.batch();
    this.count = 0;
  }
}

