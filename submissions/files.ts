import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AdminError } from '../admin/errors';

export type Slot = 'transcript' | 'video' | 'slides' | 'script';
export type SubmissionType = 'lecture' | 'slides' | 'script';
export interface Sniffed { ext: string; mime: string }

/** Which files a submission type takes. `required` ones must be present before it can be submitted for review. */
export const SLOTS: Record<SubmissionType, { required: Slot[]; optional: Slot[] }> = {
  lecture: { required: ['transcript'], optional: ['video'] },
  slides: { required: ['slides'], optional: [] },
  script: { required: ['script'], optional: [] },
};
export const ALL_SLOTS: Slot[] = ['transcript', 'video', 'slides', 'script'];
export const isSlot = (value: unknown): value is Slot => typeof value === 'string' && (ALL_SLOTS as string[]).includes(value);

export interface UploadLimits { transcript: number; video: number; slides: number; script: number; userPerDay: number; total: number; pendingPerUser: number }
const MB = 1024 * 1024;
/** Defaults suit an 80 GB VM; every value can be changed with UPLOAD_MAX_*_MB environment variables. */
export function uploadLimits(env: NodeJS.ProcessEnv = process.env): UploadLimits {
  const mb = (name: string, fallback: number) => { const n = Number(env[name]); return (Number.isFinite(n) && n > 0 ? n : fallback) * MB; };
  return {
    transcript: mb('UPLOAD_MAX_TRANSCRIPT_MB', 5), video: mb('UPLOAD_MAX_VIDEO_MB', 2000), slides: mb('UPLOAD_MAX_PDF_MB', 100), script: mb('UPLOAD_MAX_PDF_MB', 100),
    userPerDay: mb('UPLOAD_MAX_USER_DAY_MB', 4000), total: mb('UPLOAD_MAX_TOTAL_MB', 30000),
    pendingPerUser: Math.max(1, Number(env.UPLOAD_MAX_PENDING_PER_USER) || 5),
  };
}

const SRT_START = /^\s*\d+\s*\r?\n\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/;

/** Decides from the file's own first bytes what it is; the name and the declared type are never trusted. */
export function sniff(slot: Slot, head: Buffer): Sniffed | null {
  if (slot === 'transcript') {
    if (head.includes(0)) return null;
    const text = head.toString('utf8').replace(/^﻿/, '');
    if (/^WEBVTT(?=[ \t\r\n]|$)/.test(text)) return { ext: 'vtt', mime: 'text/vtt' };
    if (SRT_START.test(text)) return { ext: 'srt', mime: 'application/x-subrip' };
    return null;
  }
  if (slot === 'video') {
    if (head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp') return head.toString('latin1', 8, 12) === 'qt  ' ? { ext: 'mov', mime: 'video/quicktime' } : { ext: 'mp4', mime: 'video/mp4' };
    if (head.length >= 4 && head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return { ext: 'webm', mime: 'video/webm' };
    return null;
  }
  return head.length >= 5 && head.toString('latin1', 0, 5) === '%PDF-' ? { ext: 'pdf', mime: 'application/pdf' } : null;
}
/** How many leading bytes sniff() may look at. */
export const SNIFF_BYTES = 2048;

/** A name safe to show and to send back in a header: no path, no control or non-ASCII characters. */
export function safeName(name: unknown, fallback: string): string {
  let text = typeof name === 'string' ? name : '';
  try { text = decodeURIComponent(text); } catch { /* keep the raw text */ }
  const base = text.split(/[\\/]/).pop() ?? '';
  const clean = base.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^[.\s]+/, '').trim().slice(0, 120);
  return clean || fallback;
}

export interface StoredUpload { size: number; sha256: string; sniffed: Sniffed }

/** Counts, hashes and inspects the bytes while they stream to disk, and aborts the moment something is wrong. */
class Inspector extends Transform {
  size = 0;
  private hash = createHash('sha256');
  private head = Buffer.alloc(0);
  sniffed: Sniffed | null = null;
  constructor(private slot: Slot, private max: number) { super(); }
  private inspect() {
    this.sniffed = sniff(this.slot, this.head);
    if (!this.sniffed) throw new AdminError('unsupported_type', this.slot === 'transcript' ? 'The transcript must be a WebVTT (.vtt) or SubRip (.srt) text file.'
      : this.slot === 'video' ? 'The video must be an MP4, MOV or WebM file.' : 'This must be a PDF file.');
  }
  _transform(chunk: Buffer, _encoding: BufferEncoding, done: (error?: Error | null, data?: Buffer) => void) {
    try {
      this.size += chunk.length;
      if (this.size > this.max) throw new AdminError('too_large', `The file is larger than the limit of ${Math.floor(this.max / MB)} MB.`);
      this.hash.update(chunk);
      if (!this.sniffed && this.head.length < SNIFF_BYTES) {
        this.head = Buffer.concat([this.head, chunk.subarray(0, SNIFF_BYTES - this.head.length)]);
        if (this.head.length >= 256 || this.size === this.head.length && this.head.length >= SNIFF_BYTES) this.inspect();
      }
      done(null, chunk);
    } catch (error) { done(error as Error); }
  }
  _flush(done: (error?: Error | null) => void) {
    try { if (!this.sniffed) this.inspect(); done(); } catch (error) { done(error as Error); }
  }
  digest() { return this.hash.digest('hex'); }
}

/** Streams `source` to `tmpPath`. Resolves with the verified result, or rejects (and removes the partial file). */
export async function receiveUpload(source: Readable, tmpPath: string, slot: Slot, max: number, declaredLength: number): Promise<StoredUpload> {
  const inspector = new Inspector(slot, max);
  try {
    await pipeline(source, inspector, createWriteStream(tmpPath, { flags: 'wx', mode: 0o640 }));
    if (inspector.size !== declaredLength) throw new AdminError('invalid_input', 'The upload was cut short or longer than announced. Try again.');
    if (inspector.size === 0 || !inspector.sniffed) throw new AdminError('invalid_input', 'The file is empty.');
    return { size: inspector.size, sha256: inspector.digest(), sniffed: inspector.sniffed };
  } catch (error) {
    await rm(tmpPath, { force: true });
    if (error instanceof AdminError) throw error;
    throw new AdminError('invalid_input', 'The upload was interrupted. Try again.');
  }
}
