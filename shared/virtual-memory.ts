/** A deliberately small teaching architecture, not x86, ARM or RISC-V.
 * 16-bit virtual and physical byte addresses; 4 KiB pages; 2+2+12-bit VA.
 * A four-entry, fully associative TLB caches translations and permissions.
 */
export const VM_PAGE_BYTES = 4096;
export const VM_PAGE_COUNT = 16;
export const VM_TLB_CAPACITY = 4;
export type VmAccess = 'read' | 'write';
export interface VmPageEntry { present: boolean; frame: number; readable: boolean; writable: boolean }
export interface VmDirectoryEntry { present: boolean; entries: VmPageEntry[] }
export type VmPageTables = VmDirectoryEntry[];
/** Entries are in most-recently-used order. No stale translations are permitted. */
export interface VmTlbEntry { virtualPage: number; frame: number; readable: boolean; writable: boolean }
export interface VmAddressParts {
  virtualAddress: number; virtualPage: number; directoryIndex: number; tableIndex: number;
  offset: number; binary: string; directoryBits: string; tableBits: string; offsetBits: string;
}
export type VmStage = 'split' | 'tlb' | 'directory' | 'page-table' | 'permission' | 'physical' | 'page-fault' | 'protection-fault';
export interface VmWalkStep { stage: VmStage; title: string; description: string; tlbHit?: boolean; frame?: number; physicalAddress?: number }
export interface VmWalk {
  address: VmAddressParts; access: VmAccess; steps: VmWalkStep[];
  outcome: 'translated' | 'page-fault' | 'protection-fault';
  tlbHit: boolean; physicalAddress: number | null; frame: number | null;
  /** Independent snapshots; only install finalTlb after this walk completes. */
  initialTlb: VmTlbEntry[]; finalTlb: VmTlbEntry[];
}

const bitString = (value: number, width: number) => value.toString(2).padStart(width, '0');
export const vmHex = (value: number, width = 4) => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;

export function splitVirtualAddress(virtualAddress: number): VmAddressParts {
  if (!Number.isInteger(virtualAddress) || virtualAddress < 0 || virtualAddress >= 65536) throw new Error('Use a 16-bit byte address between 0x0000 and 0xFFFF.');
  const virtualPage = Math.floor(virtualAddress / VM_PAGE_BYTES);
  const directoryIndex = Math.floor(virtualPage / 4), tableIndex = virtualPage % 4;
  const offset = virtualAddress % VM_PAGE_BYTES;
  return { virtualAddress, virtualPage, directoryIndex, tableIndex, offset,
    binary: bitString(virtualAddress, 16), directoryBits: bitString(directoryIndex, 2),
    tableBits: bitString(tableIndex, 2), offsetBits: bitString(offset, 12) };
}

/** Accept an explicitly hexadecimal address, with an optional 0x prefix. */
export function parseVirtualAddress(input: string): number {
  const value = input.trim();
  if (!/^(?:0x)?[0-9a-f]{1,4}$/i.test(value)) throw new Error('Enter 1–4 hexadecimal digits, for example 0x5ABC.');
  return Number.parseInt(value.replace(/^0x/i, ''), 16);
}

export function createDefaultPageTables(): VmPageTables {
  const tables = Array.from({ length: 4 }, (_, index) => ({ present: index !== 3,
    entries: Array.from({ length: 4 }, () => ({ present: false, frame: 0, readable: true, writable: true })) }));
  for (const [page, frame] of [[0, 2], [1, 3], [4, 8], [5, 9], [6, 10], [9, 12], [11, 14]]) {
    tables[Math.floor(page / 4)].entries[page % 4] = { present: true, frame, readable: true, writable: page !== 6 };
  }
  return tables;
}

function validateTables(tables: VmPageTables): void {
  if (!Array.isArray(tables) || tables.length !== 4 || tables.some(table => !table || typeof table.present !== 'boolean' || !Array.isArray(table.entries) || table.entries.length !== 4)) throw new Error('This model requires four directory entries with four page entries each.');
  for (const table of tables) for (const page of table.entries) {
    if (!page || typeof page.present !== 'boolean' || typeof page.readable !== 'boolean' || typeof page.writable !== 'boolean' || !Number.isInteger(page.frame) || page.frame < 0 || page.frame >= VM_PAGE_COUNT) throw new Error('Page entries need valid flags and a physical frame from 0 to 15.');
  }
}

/** A translation is not a data-cache access. Faults do not produce a physical address.
 * Permissions are checked even on a TLB hit. Editing page tables must flush the TLB.
 */
export function walkVirtualAddress(virtualAddress: number, tables: VmPageTables = createDefaultPageTables(), access: VmAccess = 'read', tlb: readonly VmTlbEntry[] = []): VmWalk {
  const address = splitVirtualAddress(virtualAddress);
  validateTables(tables);
  if (access !== 'read' && access !== 'write') throw new Error('Choose a read or write access.');
  if (!Array.isArray(tlb) || tlb.length > VM_TLB_CAPACITY || new Set(tlb.map(entry => entry.virtualPage)).size !== tlb.length) throw new Error('The TLB holds at most four distinct virtual pages.');
  for (const entry of tlb) {
    if (!Number.isInteger(entry.virtualPage) || entry.virtualPage < 0 || entry.virtualPage >= VM_PAGE_COUNT || !Number.isInteger(entry.frame) || entry.frame < 0 || entry.frame >= VM_PAGE_COUNT || typeof entry.readable !== 'boolean' || typeof entry.writable !== 'boolean') throw new Error('Invalid TLB entry.');
    const table = tables[Math.floor(entry.virtualPage / 4)], page = table.entries[entry.virtualPage % 4];
    if (!table.present || !page.present || page.frame !== entry.frame || page.readable !== entry.readable || page.writable !== entry.writable) throw new Error('The page mapping changed. Flush the TLB before translating again.');
  }
  const initialTlb = tlb.map(entry => ({ ...entry }));
  const hit = tlb.find(entry => entry.virtualPage === address.virtualPage);
  const steps: VmWalkStep[] = [{ stage: 'split', title: 'Split the virtual address', description: `${vmHex(virtualAddress)} selects directory ${address.directoryIndex}, entry ${address.tableIndex}, with byte offset ${address.offset}. The offset is never translated.` },
    { stage: 'tlb', title: hit ? 'TLB hit: skip the tables' : 'TLB miss: walk the tables', tlbHit: !!hit, description: hit ? `Virtual page ${address.virtualPage} already maps to frame ${hit.frame}. Cached permissions still need checking.` : `No cached translation for virtual page ${address.virtualPage}. This is not a page fault; consult the page tables.` }];
  const finish = (outcome: VmWalk['outcome'], entry?: VmPageEntry | VmTlbEntry): VmWalk => {
    const physicalAddress = outcome === 'translated' && entry ? entry.frame * VM_PAGE_BYTES + address.offset : null;
    let finalTlb = initialTlb.map(cached => ({ ...cached }));
    if (outcome === 'translated' && entry) {
      finalTlb = [{ virtualPage: address.virtualPage, frame: entry.frame, readable: entry.readable, writable: entry.writable }, ...finalTlb.filter(cached => cached.virtualPage !== address.virtualPage)].slice(0, VM_TLB_CAPACITY);
    }
    return { address, access, steps, outcome, tlbHit: !!hit, physicalAddress, frame: entry?.frame ?? null, initialTlb, finalTlb };
  };
  let entry: VmPageEntry | VmTlbEntry;
  if (hit) entry = hit;
  else {
    const directory = tables[address.directoryIndex];
    steps.push({ stage: 'directory', title: `Read directory entry ${address.directoryIndex}`, description: directory.present ? `Present: points to a second-level table for virtual pages ${address.directoryIndex * 4}–${address.directoryIndex * 4 + 3}.` : 'Not present: this region has no second-level page table.' });
    if (!directory.present) {
      steps.push({ stage: 'page-fault', title: 'Page fault: directory not present', description: 'Trap to the operating system. It may allocate a table and mapping, or reject an invalid address. No data access occurs.' });
      return finish('page-fault');
    }
    entry = directory.entries[address.tableIndex];
    steps.push({ stage: 'page-table', title: `Read page-table entry ${address.tableIndex}`, frame: entry.present ? entry.frame : undefined, description: entry.present ? `Present: virtual page ${address.virtualPage} maps to physical frame ${entry.frame}.` : `Virtual page ${address.virtualPage} is not present in physical memory.` });
    if (!entry.present) {
      steps.push({ stage: 'page-fault', title: 'Page fault: page not present', description: 'Trap to the operating system. A valid backed page may be loaded; an unmapped address may be rejected. A missing entry does not imply data exists on disk.' });
      return finish('page-fault');
    }
  }
  const allowed = access === 'read' ? entry.readable : entry.writable;
  steps.push({ stage: 'permission', title: `Check ${access} permission`, frame: entry.frame, description: allowed ? `The mapping permits this ${access}. Translation can complete.` : `The mapping forbids this ${access}. A present page can still fail its permission check.` });
  if (!allowed) {
    steps.push({ stage: 'protection-fault', title: 'Protection fault: access denied', description: 'Trap to the operating system. Do not read or write the frame. In this teaching model this is distinct from a not-present fault.' });
    return finish('protection-fault', entry);
  }
  const physicalAddress = entry.frame * VM_PAGE_BYTES + address.offset;
  steps.push({ stage: 'physical', title: 'Reconstruct the physical address', frame: entry.frame, physicalAddress, description: `${entry.frame} × 4096 + ${address.offset} = ${vmHex(physicalAddress)}. Keep all 12 offset bits; cache the permitted translation in the TLB.` });
  return finish('translated', entry);
}
