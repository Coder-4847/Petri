// Save slots in IndexedDB (5 slots), plus file export / import (gzip-compressed JSON).
export const SLOTS = 5;
export interface SaveMeta { slot: number; name: string; thumb: string; playtime: number; era: number; eraName: string; savedAt: number; biome: string; seed: number; species: number }

const DB = 'petri', META = 'meta', DATA = 'data';
let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(META); r.result.createObjectStore(DATA); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
}
function req<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((res, rej) => { const r = fn(d.transaction(store, mode).objectStore(store)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
}

export async function listSlots(): Promise<(SaveMeta | null)[]> {
  const out: (SaveMeta | null)[] = [];
  try { for (let i = 1; i <= SLOTS; i++) out.push(((await req(META, 'readonly', (s) => s.get(i))) as SaveMeta | undefined) ?? null); } catch { while (out.length < SLOTS) out.push(null); }
  return out;
}
export async function putSlot(meta: SaveMeta, data: unknown) {
  const d = await db();
  await new Promise<void>((res, rej) => { const tx = d.transaction([META, DATA], 'readwrite'); tx.objectStore(META).put(meta, meta.slot); tx.objectStore(DATA).put(data, meta.slot); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
export const getSlot = (slot: number) => req(DATA, 'readonly', (s) => s.get(slot));
export async function deleteSlot(slot: number) {
  const d = await db();
  await new Promise<void>((res, rej) => { const tx = d.transaction([META, DATA], 'readwrite'); tx.objectStore(META).delete(slot); tx.objectStore(DATA).delete(slot); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}

// ---- file format: JSON with typed arrays and Maps tagged, then gzip
const TA: Record<string, any> = { Float32Array, Int32Array, Uint8Array, Int8Array, Int16Array, Uint16Array, Uint32Array, Float64Array };
function b64(buf: ArrayBuffer, off: number, len: number): string {
  const u = new Uint8Array(buf, off, len); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s);
}
function unb64(s: string): ArrayBuffer { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; }

export async function exportBlob(meta: SaveMeta, data: unknown): Promise<Blob> {
  const json = JSON.stringify({ petri: 1, meta, data }, (_k, v) => {
    if (ArrayBuffer.isView(v) && !(v instanceof DataView)) return { __t: v.constructor.name, d: b64(v.buffer as ArrayBuffer, v.byteOffset, v.byteLength) };
    if (v instanceof Map) return { __t: 'Map', d: [...v.entries()] };
    return v;
  });
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}
export async function importBlob(file: Blob): Promise<{ meta: SaveMeta; data: any }> {
  let text: string;
  try { text = await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text(); } catch { text = await file.text(); }
  const o = JSON.parse(text, (_k, v) => {
    if (v && typeof v === 'object' && typeof v.__t === 'string') { if (v.__t === 'Map') return new Map(v.d); const C = TA[v.__t]; if (C) return new C(unb64(v.d)); }
    return v;
  });
  if (!o?.petri || !o.data) throw new Error('Not a Petri save file.');
  return { meta: o.meta, data: o.data };
}
export function download(blob: Blob, name: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export const fmtTime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m ${Math.floor(s % 60)}s`; };
