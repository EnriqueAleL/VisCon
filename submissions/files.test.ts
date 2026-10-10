import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeName, sniff, uploadLimits } from './files';

const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj');
const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypisom'), Buffer.alloc(32)]);

test('files are recognised by their own bytes, not their name or declared type', () => {
  assert.deepEqual(sniff('slides', pdf), { ext: 'pdf', mime: 'application/pdf' });
  assert.deepEqual(sniff('script', pdf), { ext: 'pdf', mime: 'application/pdf' });
  assert.deepEqual(sniff('video', mp4), { ext: 'mp4', mime: 'video/mp4' });
  assert.equal(sniff('video', Buffer.concat([Buffer.from([0, 0, 0, 0x14]), Buffer.from('ftypqt  '), Buffer.alloc(8)]))?.ext, 'mov');
  assert.equal(sniff('video', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]))?.ext, 'webm');
  assert.equal(sniff('transcript', Buffer.from('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello'))?.ext, 'vtt');
  assert.equal(sniff('transcript', Buffer.from('\uFEFFWEBVTT - lecture 3\n'))?.ext, 'vtt', 'a BOM is fine');
  assert.equal(sniff('transcript', Buffer.from('1\n00:00:01,000 --> 00:00:03,000\nHello'))?.ext, 'srt');
});

test('the wrong kind of file in a slot is refused', () => {
  assert.equal(sniff('slides', mp4), null);
  assert.equal(sniff('video', pdf), null);
  assert.equal(sniff('transcript', pdf), null);
  assert.equal(sniff('transcript', Buffer.from('WEBVTTX\n')), null, 'must be exactly the WEBVTT signature');
  assert.equal(sniff('transcript', Buffer.from('hello world, no timestamps')), null);
  assert.equal(sniff('transcript', Buffer.from('WEBVTT\n\u0000\u0001')), null, 'binary data is not a transcript');
  assert.equal(sniff('slides', Buffer.from('<html><script>alert(1)</script>')), null);
  assert.equal(sniff('slides', Buffer.alloc(0)), null);
  assert.equal(sniff('script', Buffer.from('  %PDF-1.4')), null, 'a PDF starts with its signature');
});

test('file names are reduced to a harmless display name', () => {
  assert.equal(safeName('../../etc/passwd', 'x'), 'passwd');
  assert.equal(safeName('C:\\Users\\a\\lecture 7.pdf', 'x'), 'lecture 7.pdf');
  assert.equal(safeName('..%2F..%2Fsecret.vtt', 'x'), 'secret.vtt');
  assert.equal(safeName('lec\u0000ture"\r\n<b>.mp4', 'x'), 'lecture__b_.mp4');
  assert.equal(safeName('Vorlesung Über Ströme.pdf', 'x'), 'Vorlesung Uber Strome.pdf');
  assert.equal(safeName('...', 'fallback.pdf'), 'fallback.pdf');
  assert.equal(safeName(undefined, 'fallback.pdf'), 'fallback.pdf');
  assert.ok(safeName('a'.repeat(500) + '.pdf', 'x').length <= 120);
});

test('upload limits have safe defaults and can be tuned', () => {
  const d = uploadLimits({});
  assert.deepEqual([d.transcript, d.slides, d.video, d.pendingPerUser], [5 * 1048576, 100 * 1048576, 2000 * 1048576, 5]);
  assert.equal(uploadLimits({ UPLOAD_MAX_VIDEO_MB: '50' }).video, 50 * 1048576);
  assert.equal(uploadLimits({ UPLOAD_MAX_VIDEO_MB: '-5' }).video, 2000 * 1048576, 'nonsense falls back to the default');
});
