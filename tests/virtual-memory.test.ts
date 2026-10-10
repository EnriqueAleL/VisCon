import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultPageTables, parseVirtualAddress, splitVirtualAddress, VM_PAGE_BYTES, vmHex, walkVirtualAddress } from '../shared/virtual-memory';

test('all 16-bit addresses reconstruct from the two indices and unchanged 12-bit offset', () => {
  for (let virtualAddress = 0; virtualAddress <= 0xFFFF; virtualAddress++) {
    const parts = splitVirtualAddress(virtualAddress);
    assert.equal((parts.directoryIndex * 4 + parts.tableIndex) * VM_PAGE_BYTES + parts.offset, virtualAddress);
    assert.equal(parts.directoryBits + parts.tableBits + parts.offsetBits, parts.binary);
    assert.equal(parts.binary.length, 16);
    assert.ok(parts.offset >= 0 && parts.offset < 4096);
  }
  const boundary = splitVirtualAddress(0xFFFF);
  assert.deepEqual([boundary.directoryIndex, boundary.tableIndex, boundary.offset], [3, 3, 4095]);
});

test('two-level translation uses the frame number and retains every offset bit', () => {
  const translated = walkVirtualAddress(0x5ABC);
  assert.equal(translated.outcome, 'translated');
  assert.equal(translated.physicalAddress, 0x9ABC);
  assert.equal(translated.frame, 9);
  assert.equal(translated.tlbHit, false);
  assert.deepEqual(translated.steps.map(step => step.stage), ['split', 'tlb', 'directory', 'page-table', 'permission', 'physical']);
  assert.equal(translated.finalTlb[0].virtualPage, 5);
  assert.equal(translated.finalTlb[0].frame, 9);
  assert.equal(walkVirtualAddress(0x5000).physicalAddress, 0x9000);
  assert.equal(walkVirtualAddress(0x5FFF).physicalAddress, 0x9FFF);
});

test('a TLB hit translates another byte in the same page without reading either table', () => {
  const tables = createDefaultPageTables();
  const cold = walkVirtualAddress(0x5000, tables);
  const warm = walkVirtualAddress(0x5FFF, tables, 'read', cold.finalTlb);
  assert.equal(warm.tlbHit, true);
  assert.equal(warm.physicalAddress, 0x9FFF);
  assert.deepEqual(warm.steps.map(step => step.stage), ['split', 'tlb', 'permission', 'physical']);
  assert.equal(warm.finalTlb.length, 1);
});

test('directory and leaf not-present faults stop at the right level without inventing a physical address', () => {
  const missingDirectory = walkVirtualAddress(0xD004);
  assert.equal(missingDirectory.outcome, 'page-fault');
  assert.equal(missingDirectory.physicalAddress, null);
  assert.deepEqual(missingDirectory.steps.map(step => step.stage), ['split', 'tlb', 'directory', 'page-fault']);
  const missingPage = walkVirtualAddress(0x8123);
  assert.equal(missingPage.outcome, 'page-fault');
  assert.equal(missingPage.physicalAddress, null);
  assert.deepEqual(missingPage.steps.map(step => step.stage), ['split', 'tlb', 'directory', 'page-table', 'page-fault']);
  assert.equal(missingPage.finalTlb.length, 0);
  assert.equal(missingDirectory.finalTlb.length, 0);
});

test('read-only pages allow reads but fault on writes, including a warm TLB hit', () => {
  const tables = createDefaultPageTables();
  const read = walkVirtualAddress(0x6FF0, tables, 'read');
  assert.equal(read.physicalAddress, 0xAFF0);
  const coldWrite = walkVirtualAddress(0x6FF0, tables, 'write');
  assert.equal(coldWrite.outcome, 'protection-fault');
  assert.equal(coldWrite.physicalAddress, null);
  assert.equal(coldWrite.finalTlb.length, 0);
  const warmWrite = walkVirtualAddress(0x6001, tables, 'write', read.finalTlb);
  assert.equal(warmWrite.tlbHit, true);
  assert.equal(warmWrite.outcome, 'protection-fault');
  assert.equal(warmWrite.physicalAddress, null);
  assert.deepEqual(warmWrite.steps.map(step => step.stage), ['split', 'tlb', 'permission', 'protection-fault']);
  assert.deepEqual(warmWrite.finalTlb, read.finalTlb);
});

test('a present page without read permission causes a protection fault rather than a missing-page fault', () => {
  const tables = createDefaultPageTables();
  tables[1].entries[1].readable = false;
  assert.equal(walkVirtualAddress(0x5ABC, tables).outcome, 'protection-fault');
  assert.equal(walkVirtualAddress(0x5ABC, tables, 'write').outcome, 'translated');
});

test('four-entry TLB uses true LRU and faults leave cached translations intact', () => {
  const tables = createDefaultPageTables();
  let tlb = walkVirtualAddress(0, tables).finalTlb;
  for (const page of [1, 4, 5]) tlb = walkVirtualAddress(page * VM_PAGE_BYTES, tables, 'read', tlb).finalTlb;
  assert.deepEqual(tlb.map(entry => entry.virtualPage), [5, 4, 1, 0]);
  tlb = walkVirtualAddress(0x0001, tables, 'read', tlb).finalTlb;
  assert.deepEqual(tlb.map(entry => entry.virtualPage), [0, 5, 4, 1]);
  tlb = walkVirtualAddress(0x6000, tables, 'read', tlb).finalTlb;
  assert.deepEqual(tlb.map(entry => entry.virtualPage), [6, 0, 5, 4]);
  assert.equal(walkVirtualAddress(0x1000, tables, 'read', tlb).tlbHit, false);
  assert.deepEqual(walkVirtualAddress(0x8000, tables, 'read', tlb).finalTlb, tlb);
});

test('walk snapshots and caller-owned tables/TLB do not share mutable records', () => {
  const tables = createDefaultPageTables();
  const cached = walkVirtualAddress(0x5000, tables).finalTlb;
  const walk = walkVirtualAddress(0x5001, tables, 'read', cached);
  assert.equal(walk.steps[walk.steps.length - 1].physicalAddress, 0x9001);
  cached[0].frame = 3;
  tables[1].entries[1].frame = 2;
  assert.equal(walk.initialTlb[0].frame, 9);
  assert.equal(walk.finalTlb[0].frame, 9);
  walk.finalTlb[0].frame = 5;
  assert.equal(walk.initialTlb[0].frame, 9);
  assert.equal(createDefaultPageTables()[1].entries[1].frame, 9);
});

test('changing a mapping or its permissions requires a TLB flush', () => {
  const tables = createDefaultPageTables();
  const tlb = walkVirtualAddress(0x5ABC, tables).finalTlb;
  tables[1].entries[1].frame = 4;
  assert.throws(() => walkVirtualAddress(0x5ABC, tables, 'read', tlb), /Flush the TLB/);
  assert.equal(walkVirtualAddress(0x5ABC, tables).physicalAddress, 0x4ABC);
  tables[1].entries[1].frame = 9; tables[1].entries[1].writable = false;
  assert.throws(() => walkVirtualAddress(0x5ABC, tables, 'read', tlb), /Flush the TLB/);
});

test('hex parser and mapping validation reject invalid and out-of-range data', () => {
  assert.equal(parseVirtualAddress(' 0x5abc '), 0x5ABC);
  assert.equal(parseVirtualAddress('FFFF'), 65535);
  assert.equal(parseVirtualAddress('10'), 16);
  assert.equal(vmHex(4095, 3), '0xFFF');
  for (const input of ['', '0x', '0x10000', '-1', '1.5', '1+2', '0b10000', 'Infinity', 'true']) assert.throws(() => parseVirtualAddress(input));
  for (const address of [-1, 65536, .5, NaN, Infinity]) assert.throws(() => splitVirtualAddress(address));
  const badFrame = createDefaultPageTables(); badFrame[1].entries[1].frame = 16;
  assert.throws(() => walkVirtualAddress(0x5000, badFrame), /frame from 0 to 15/);
  assert.throws(() => walkVirtualAddress(0x5000, []), /four directory entries/);
  const entry = { virtualPage: 5, frame: 9, readable: true, writable: true };
  assert.throws(() => walkVirtualAddress(0x5000, createDefaultPageTables(), 'read', [entry, entry]), /distinct virtual pages/);
});
