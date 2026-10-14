// localStorage と IndexedDB を安全に使う小さな包み。どちらも使えない環境（非公開ウィンドウ等）でも落ちない。

const mem = new Map();

export const local = {
  get(key) {
    try { const v = globalThis.localStorage?.getItem(key); return v ?? (mem.has(key) ? mem.get(key) : null); } catch { return mem.has(key) ? mem.get(key) : null; }
  },
  set(key, value) {
    mem.set(key, value);
    try { globalThis.localStorage?.setItem(key, value); return true; } catch { return false; }
  },
  remove(key) {
    mem.delete(key);
    try { globalThis.localStorage?.removeItem(key); } catch { /* ignore */ }
  },
  keys(prefix = '') {
    const out = new Set([...mem.keys()].filter((k) => k.startsWith(prefix)));
    try {
      const ls = globalThis.localStorage;
      if (ls) for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k && k.startsWith(prefix)) out.add(k); }
    } catch { /* ignore */ }
    return [...out];
  },
};

// ---- IndexedDB（画像の差し替えを入れておく）
const DB_NAME = 'abyss-drop';
const DB_VER = 1;
let dbp = null;

function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (!globalThis.indexedDB) { resolve(null); return; }
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('assets')) db.createObjectStore('assets');
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}

function tx(store, mode, fn) {
  return openDB().then((db) => new Promise((resolve) => {
    if (!db) { resolve(undefined); return; }
    try {
      const t = db.transaction(store, mode);
      const s = t.objectStore(store);
      const r = fn(s);
      t.oncomplete = () => resolve(r && 'result' in r ? r.result : undefined);
      t.onerror = () => resolve(undefined);
      t.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

export const idb = {
  available: () => openDB().then((db) => !!db),
  get: (store, key) => tx(store, 'readonly', (s) => s.get(key)),
  put: (store, key, val) => tx(store, 'readwrite', (s) => s.put(val, key)),
  del: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)),
  keys: (store) => tx(store, 'readonly', (s) => s.getAllKeys()),
  all: async (store) => {
    const db = await openDB();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const t = db.transaction(store, 'readonly');
        const s = t.objectStore(store);
        const out = [];
        const cur = s.openCursor();
        cur.onsuccess = () => { const c = cur.result; if (c) { out.push([c.key, c.value]); c.continue(); } else resolve(out); };
        cur.onerror = () => resolve(out);
      } catch { resolve([]); }
    });
  },
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()),
};
