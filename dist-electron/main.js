var Fi = Object.defineProperty;
var Ni = (a, e, n) => e in a ? Fi(a, e, { enumerable: !0, configurable: !0, writable: !0, value: n }) : a[e] = n;
var On = (a, e, n) => Ni(a, typeof e != "symbol" ? e + "" : e, n);
import { app as Ue, BrowserWindow as At, ipcMain as O, dialog as Ta, Notification as An } from "electron";
import Pn from "node:fs/promises";
import { fileURLToPath as Li } from "node:url";
import oe from "node:path";
import Ui from "better-sqlite3";
import fa from "path";
import { randomFillSync as Di, randomUUID as Ii } from "node:crypto";
import { createRequire as Pt } from "module";
import ye from "util";
import V, { Readable as Bi } from "stream";
import cn from "http";
import pn from "https";
import xa from "url";
import qi from "fs";
import ln from "crypto";
import Ft from "http2";
import zi from "assert";
import Nt from "tty";
import $i from "os";
import pe from "zlib";
import { EventEmitter as Mi } from "events";
import Hi from "node:http";
import Wi from "node:https";
import Fn from "fs/promises";
const z = [];
for (let a = 0; a < 256; ++a)
  z.push((a + 256).toString(16).slice(1));
function Vi(a, e = 0) {
  return (z[a[e + 0]] + z[a[e + 1]] + z[a[e + 2]] + z[a[e + 3]] + "-" + z[a[e + 4]] + z[a[e + 5]] + "-" + z[a[e + 6]] + z[a[e + 7]] + "-" + z[a[e + 8]] + z[a[e + 9]] + "-" + z[a[e + 10]] + z[a[e + 11]] + z[a[e + 12]] + z[a[e + 13]] + z[a[e + 14]] + z[a[e + 15]]).toLowerCase();
}
const na = new Uint8Array(256);
let Je = na.length;
function Gi() {
  return Je > na.length - 16 && (Di(na), Je = 0), na.slice(Je, Je += 16);
}
const Nn = { randomUUID: Ii };
function Xi(a, e, n) {
  var i;
  a = a || {};
  const t = a.random ?? ((i = a.rng) == null ? void 0 : i.call(a)) ?? Gi();
  if (t.length < 16)
    throw new Error("Random bytes length must be >= 16");
  return t[6] = t[6] & 15 | 64, t[8] = t[8] & 63 | 128, Vi(t);
}
function ca(a, e, n) {
  return Nn.randomUUID && !a ? Nn.randomUUID() : Xi(a);
}
class Ji {
  constructor(e) {
    On(this, "db");
    const n = fa.join(e, "doc-embedder.db");
    this.db = new Ui(n), this.db.pragma("journal_mode = WAL"), this._runMigrations();
  }
  _runMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vector_store_connections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        config TEXT NOT NULL, -- JSON encrypted
        environment TEXT CHECK(environment IN ('dev', 'staging', 'prod')) DEFAULT 'dev',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_tested_at TEXT
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        tags TEXT, -- JSON array
        embedding_config TEXT, -- JSON
        chunking_config TEXT, -- JSON
        vector_store_connection_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        archived BOOLEAN DEFAULT 0,
        FOREIGN KEY(vector_store_connection_id) REFERENCES vector_store_connections(id)
      );

      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        source_type TEXT CHECK(source_type IN ('file', 'url')) NOT NULL,
        source_path TEXT NOT NULL,
        content_hash TEXT,
        metadata TEXT, -- JSON
        status TEXT CHECK(status IN ('pending', 'processing', 'completed', 'failed')) DEFAULT 'pending',
        version INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        processed_at TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        token_count INTEGER,
        position INTEGER,
        metadata TEXT, -- JSON
        embedding_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(document_id) REFERENCES documents(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS processing_jobs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        status TEXT CHECK(status IN ('queued', 'running', 'paused', 'completed', 'failed')) DEFAULT 'queued',
        total_documents INTEGER DEFAULT 0,
        processed_documents INTEGER DEFAULT 0,
        total_chunks INTEGER DEFAULT 0,
        error_log TEXT, -- JSON
        started_at TEXT,
        completed_at TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id)
      );

      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        chunk_id TEXT NOT NULL,
        vector BLOB NOT NULL,
        dimensions INTEGER NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const n = this.db.pragma("table_info(projects)");
    n.some(
      (o) => o.name === "vector_store_config"
    ) || this.db.prepare("ALTER TABLE projects ADD COLUMN vector_store_config TEXT").run(), n.some((o) => o.name === "color") || this.db.prepare("ALTER TABLE projects ADD COLUMN color TEXT").run();
  }
  // --- Settings ---
  getSetting(e) {
    const t = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(e);
    return t ? JSON.parse(t.value) : null;
  }
  setSetting(e, n) {
    this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(e, JSON.stringify(n));
  }
  // --- Projects ---
  getAllProjects(e = !1) {
    const n = e ? "" : "WHERE archived = 0";
    return this.db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) as document_count,
        (SELECT COUNT(*) FROM chunks c JOIN documents d ON c.document_id = d.id WHERE d.project_id = p.id) as chunk_count
      FROM projects p
      ${n}
      ORDER BY updated_at DESC
    `).all().map(this._parseProject);
  }
  archiveProject(e, n) {
    return this.db.prepare(
      "UPDATE projects SET archived = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(n ? 1 : 0, e), this.getProject(e);
  }
  createProject(e, n = "", t = "blue") {
    const i = ca();
    return this.db.prepare(`
      INSERT INTO projects (id, name, description, color) VALUES (?, ?, ?, ?)
    `).run(i, e, n, t), this.getProject(i);
  }
  updateProject(e, n) {
    const t = [], i = [];
    return n.name !== void 0 && (t.push("name = ?"), i.push(n.name)), n.description !== void 0 && (t.push("description = ?"), i.push(n.description)), n.color !== void 0 && (t.push("color = ?"), i.push(n.color)), t.length === 0 ? this.getProject(e) : (t.push("updated_at = CURRENT_TIMESTAMP"), i.push(e), this.db.prepare(`
      UPDATE projects SET ${t.join(", ")} WHERE id = ?
    `).run(...i), this.getProject(e));
  }
  deleteProject(e) {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(e);
  }
  getProject(e) {
    const t = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(e);
    return t ? this._parseProject(t) : null;
  }
  getDashboardStats() {
    const e = this.db.prepare("SELECT COUNT(*) as count FROM projects WHERE archived = 0").get(), n = this.db.prepare("SELECT COUNT(*) as count FROM documents").get(), t = this.db.prepare("SELECT COUNT(*) as count FROM chunks").get(), i = this.db.prepare("SELECT COUNT(*) as count FROM vector_store_connections").get(), o = this.db.prepare(
      `
      SELECT d.name, p.name as project_name, d.created_at 
      FROM documents d 
      JOIN projects p ON d.project_id = p.id 
      ORDER BY d.created_at DESC 
      LIMIT 5
    `
    ).all();
    return {
      totalProjects: e.count,
      totalDocuments: n.count,
      totalChunks: t.count,
      activeVectorStores: i.count,
      recentActivity: o
    };
  }
  // --- Documents ---
  addDocument(e, n, t, i = "file") {
    const o = ca();
    return this.db.prepare(`
      INSERT INTO documents (id, project_id, name, source_type, source_path, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(o, e, n, i, t), this.getDocument(o);
  }
  getDocument(e) {
    return this.db.prepare("SELECT * FROM documents WHERE id = ?").get(e);
  }
  updateDocumentStatus(e, n) {
    this.db.prepare(
      "UPDATE documents SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(n, e);
  }
  deleteDocument(e) {
    this.db.prepare("DELETE FROM documents WHERE id = ?").run(e);
  }
  getProjectDocuments(e) {
    return this.db.prepare(
      "SELECT * FROM documents WHERE project_id = ? ORDER BY created_at DESC"
    ).all(e);
  }
  // --- Chunks (for local tracking/counting) ---
  addChunk(e, n, t, i = 0) {
    this.db.prepare(`
      INSERT INTO chunks (id, document_id, content, position) VALUES (?, ?, ?, ?)
    `).run(n, e, t, i);
  }
  getDocumentChunks(e) {
    return this.db.prepare(
      "SELECT * FROM chunks WHERE document_id = ? ORDER BY position"
    ).all(e);
  }
  deleteDocumentChunks(e) {
    this.db.prepare("DELETE FROM chunks WHERE document_id = ?").run(e);
  }
  updateProjectConfig(e, n, t = null, i = null) {
    return this.db.prepare(`
      UPDATE projects 
      SET embedding_config = ?, chunking_config = ?, vector_store_config = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      JSON.stringify(n),
      t ? JSON.stringify(t) : null,
      i ? JSON.stringify(i) : null,
      e
    ), this.getProject(e);
  }
  // --- Helpers ---
  _parseProject(e) {
    const n = e;
    return {
      ...n,
      tags: n.tags ? JSON.parse(n.tags) : [],
      embedding_config: n.embedding_config ? JSON.parse(n.embedding_config) : null,
      chunking_config: n.chunking_config ? JSON.parse(n.chunking_config) : null,
      vector_store_config: n.vector_store_config ? JSON.parse(n.vector_store_config) : null,
      archived: !!n.archived
    };
  }
}
const Ki = Pt(import.meta.url), { Client: Ke } = Ki("pg");
class Yi {
  async testConnection(e) {
    const n = new Ke({
      connectionString: e
    });
    try {
      await n.connect();
      const i = (await n.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE';
      `)).rows.map(
        (o) => o.table_name
      );
      return await n.end(), { success: !0, tables: i };
    } catch (t) {
      try {
        await n.end();
      } catch {
      }
      return { success: !1, error: t.message };
    }
  }
  async insertVectorData(e, n, t, i, o, s, r) {
    const l = n.documentTable || "documents", d = n.chunkTable || "chunks", c = n.embeddingTable || "embeddings", p = new Ke({ connectionString: e });
    try {
      await p.connect(), await p.query("BEGIN"), await p.query(
        `INSERT INTO ${l} (document_id, source, title, content, doc_metadata, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (document_id) DO NOTHING`,
        [
          t.id,
          t.source_type,
          t.name,
          i,
          t.metadata ? JSON.stringify(t.metadata) : null
        ]
      );
      for (let u = 0; u < s.length; u++) {
        const h = s[u], f = r[u];
        await p.query(
          `INSERT INTO ${d} (chunk_id, document_id, content, content_hash, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (chunk_id) DO NOTHING`,
          [h.id, h.documentId, h.content, h.contentHash]
        );
        const v = `[${f.join(",")}]`;
        await p.query(
          `INSERT INTO ${c} (embedding_id, chunk_id, embedding, model, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (embedding_id) DO NOTHING`,
          [h.embeddingId, h.id, v, o]
        );
      }
      return await p.query("COMMIT"), await p.end(), !0;
    } catch (u) {
      await p.query("ROLLBACK");
      try {
        await p.end();
      } catch {
      }
      throw u;
    }
  }
  async searchVectors(e, n, t, i = 5) {
    const o = n.documentTable || "documents", s = n.chunkTable || "chunks", r = n.embeddingTable || "embeddings", l = new Ke({ connectionString: e });
    try {
      await l.connect();
      const d = `[${t.join(",")}]`, c = `
        SELECT 
          c.content, 
          d.title as document_name, 
          (1 - (e.embedding <=> $1)) as similarity
        FROM ${r} e
        JOIN ${s} c ON e.chunk_id = c.chunk_id
        JOIN ${o} d ON c.document_id = d.document_id
        ORDER BY e.embedding <=> $1
        LIMIT $2;
      `, p = await l.query(c, [d, i]);
      return await l.end(), p.rows;
    } catch (d) {
      try {
        await l.end();
      } catch {
      }
      throw d;
    }
  }
  async deleteDocumentVectors(e, n, t) {
    const i = n.documentTable || "documents", o = n.chunkTable || "chunks", s = n.embeddingTable || "embeddings", r = new Ke({ connectionString: e });
    try {
      return await r.connect(), await r.query("BEGIN"), await r.query(
        `DELETE FROM ${s} 
         WHERE chunk_id IN (
           SELECT chunk_id FROM ${o} WHERE document_id = $1
         )`,
        [t]
      ), await r.query(`DELETE FROM ${o} WHERE document_id = $1`, [
        t
      ]), await r.query(`DELETE FROM ${i} WHERE document_id = $1`, [
        t
      ]), await r.query("COMMIT"), await r.end(), { success: !0 };
    } catch (l) {
      await r.query("ROLLBACK");
      try {
        await r.end();
      } catch {
      }
      return { success: !1, error: l.message };
    }
  }
}
function Lt(a, e) {
  return function() {
    return a.apply(e, arguments);
  };
}
const { toString: Qi } = Object.prototype, { getPrototypeOf: un } = Object, { iterator: ha, toStringTag: Ut } = Symbol, va = /* @__PURE__ */ ((a) => (e) => {
  const n = Qi.call(e);
  return a[n] || (a[n] = n.slice(8, -1).toLowerCase());
})(/* @__PURE__ */ Object.create(null)), Z = (a) => (a = a.toLowerCase(), (e) => va(e) === a), ba = (a) => (e) => typeof e === a, { isArray: Pe } = Array, Ce = ba("undefined");
function qe(a) {
  return a !== null && !Ce(a) && a.constructor !== null && !Ce(a.constructor) && G(a.constructor.isBuffer) && a.constructor.isBuffer(a);
}
const Dt = Z("ArrayBuffer");
function Zi(a) {
  let e;
  return typeof ArrayBuffer < "u" && ArrayBuffer.isView ? e = ArrayBuffer.isView(a) : e = a && a.buffer && Dt(a.buffer), e;
}
const eo = ba("string"), G = ba("function"), It = ba("number"), ze = (a) => a !== null && typeof a == "object", ao = (a) => a === !0 || a === !1, ta = (a) => {
  if (va(a) !== "object")
    return !1;
  const e = un(a);
  return (e === null || e === Object.prototype || Object.getPrototypeOf(e) === null) && !(Ut in a) && !(ha in a);
}, no = (a) => {
  if (!ze(a) || qe(a))
    return !1;
  try {
    return Object.keys(a).length === 0 && Object.getPrototypeOf(a) === Object.prototype;
  } catch {
    return !1;
  }
}, to = Z("Date"), io = Z("File"), oo = Z("Blob"), so = Z("FileList"), ro = (a) => ze(a) && G(a.pipe), co = (a) => {
  let e;
  return a && (typeof FormData == "function" && a instanceof FormData || G(a.append) && ((e = va(a)) === "formdata" || // detect form-data instance
  e === "object" && G(a.toString) && a.toString() === "[object FormData]"));
}, po = Z("URLSearchParams"), [lo, uo, mo, fo] = ["ReadableStream", "Request", "Response", "Headers"].map(Z), xo = (a) => a.trim ? a.trim() : a.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
function $e(a, e, { allOwnKeys: n = !1 } = {}) {
  if (a === null || typeof a > "u")
    return;
  let t, i;
  if (typeof a != "object" && (a = [a]), Pe(a))
    for (t = 0, i = a.length; t < i; t++)
      e.call(null, a[t], t, a);
  else {
    if (qe(a))
      return;
    const o = n ? Object.getOwnPropertyNames(a) : Object.keys(a), s = o.length;
    let r;
    for (t = 0; t < s; t++)
      r = o[t], e.call(null, a[r], r, a);
  }
}
function Bt(a, e) {
  if (qe(a))
    return null;
  e = e.toLowerCase();
  const n = Object.keys(a);
  let t = n.length, i;
  for (; t-- > 0; )
    if (i = n[t], e === i.toLowerCase())
      return i;
  return null;
}
const de = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : global, qt = (a) => !Ce(a) && a !== de;
function Qa() {
  const { caseless: a, skipUndefined: e } = qt(this) && this || {}, n = {}, t = (i, o) => {
    const s = a && Bt(n, o) || o;
    ta(n[s]) && ta(i) ? n[s] = Qa(n[s], i) : ta(i) ? n[s] = Qa({}, i) : Pe(i) ? n[s] = i.slice() : (!e || !Ce(i)) && (n[s] = i);
  };
  for (let i = 0, o = arguments.length; i < o; i++)
    arguments[i] && $e(arguments[i], t);
  return n;
}
const ho = (a, e, n, { allOwnKeys: t } = {}) => ($e(e, (i, o) => {
  n && G(i) ? Object.defineProperty(a, o, {
    value: Lt(i, n),
    writable: !0,
    enumerable: !0,
    configurable: !0
  }) : Object.defineProperty(a, o, {
    value: i,
    writable: !0,
    enumerable: !0,
    configurable: !0
  });
}, { allOwnKeys: t }), a), vo = (a) => (a.charCodeAt(0) === 65279 && (a = a.slice(1)), a), bo = (a, e, n, t) => {
  a.prototype = Object.create(e.prototype, t), Object.defineProperty(a.prototype, "constructor", {
    value: a,
    writable: !0,
    enumerable: !1,
    configurable: !0
  }), Object.defineProperty(a, "super", {
    value: e.prototype
  }), n && Object.assign(a.prototype, n);
}, go = (a, e, n, t) => {
  let i, o, s;
  const r = {};
  if (e = e || {}, a == null) return e;
  do {
    for (i = Object.getOwnPropertyNames(a), o = i.length; o-- > 0; )
      s = i[o], (!t || t(s, a, e)) && !r[s] && (e[s] = a[s], r[s] = !0);
    a = n !== !1 && un(a);
  } while (a && (!n || n(a, e)) && a !== Object.prototype);
  return e;
}, yo = (a, e, n) => {
  a = String(a), (n === void 0 || n > a.length) && (n = a.length), n -= e.length;
  const t = a.indexOf(e, n);
  return t !== -1 && t === n;
}, wo = (a) => {
  if (!a) return null;
  if (Pe(a)) return a;
  let e = a.length;
  if (!It(e)) return null;
  const n = new Array(e);
  for (; e-- > 0; )
    n[e] = a[e];
  return n;
}, Eo = /* @__PURE__ */ ((a) => (e) => a && e instanceof a)(typeof Uint8Array < "u" && un(Uint8Array)), _o = (a, e) => {
  const t = (a && a[ha]).call(a);
  let i;
  for (; (i = t.next()) && !i.done; ) {
    const o = i.value;
    e.call(a, o[0], o[1]);
  }
}, To = (a, e) => {
  let n;
  const t = [];
  for (; (n = a.exec(e)) !== null; )
    t.push(n);
  return t;
}, Ro = Z("HTMLFormElement"), So = (a) => a.toLowerCase().replace(
  /[-_\s]([a-z\d])(\w*)/g,
  function(n, t, i) {
    return t.toUpperCase() + i;
  }
), Ln = (({ hasOwnProperty: a }) => (e, n) => a.call(e, n))(Object.prototype), ko = Z("RegExp"), zt = (a, e) => {
  const n = Object.getOwnPropertyDescriptors(a), t = {};
  $e(n, (i, o) => {
    let s;
    (s = e(i, o, a)) !== !1 && (t[o] = s || i);
  }), Object.defineProperties(a, t);
}, jo = (a) => {
  zt(a, (e, n) => {
    if (G(a) && ["arguments", "caller", "callee"].indexOf(n) !== -1)
      return !1;
    const t = a[n];
    if (G(t)) {
      if (e.enumerable = !1, "writable" in e) {
        e.writable = !1;
        return;
      }
      e.set || (e.set = () => {
        throw Error("Can not rewrite read-only method '" + n + "'");
      });
    }
  });
}, Co = (a, e) => {
  const n = {}, t = (i) => {
    i.forEach((o) => {
      n[o] = !0;
    });
  };
  return Pe(a) ? t(a) : t(String(a).split(e)), n;
}, Oo = () => {
}, Ao = (a, e) => a != null && Number.isFinite(a = +a) ? a : e;
function Po(a) {
  return !!(a && G(a.append) && a[Ut] === "FormData" && a[ha]);
}
const Fo = (a) => {
  const e = new Array(10), n = (t, i) => {
    if (ze(t)) {
      if (e.indexOf(t) >= 0)
        return;
      if (qe(t))
        return t;
      if (!("toJSON" in t)) {
        e[i] = t;
        const o = Pe(t) ? [] : {};
        return $e(t, (s, r) => {
          const l = n(s, i + 1);
          !Ce(l) && (o[r] = l);
        }), e[i] = void 0, o;
      }
    }
    return t;
  };
  return n(a, 0);
}, No = Z("AsyncFunction"), Lo = (a) => a && (ze(a) || G(a)) && G(a.then) && G(a.catch), $t = ((a, e) => a ? setImmediate : e ? ((n, t) => (de.addEventListener("message", ({ source: i, data: o }) => {
  i === de && o === n && t.length && t.shift()();
}, !1), (i) => {
  t.push(i), de.postMessage(n, "*");
}))(`axios@${Math.random()}`, []) : (n) => setTimeout(n))(
  typeof setImmediate == "function",
  G(de.postMessage)
), Uo = typeof queueMicrotask < "u" ? queueMicrotask.bind(de) : typeof process < "u" && process.nextTick || $t, Do = (a) => a != null && G(a[ha]), m = {
  isArray: Pe,
  isArrayBuffer: Dt,
  isBuffer: qe,
  isFormData: co,
  isArrayBufferView: Zi,
  isString: eo,
  isNumber: It,
  isBoolean: ao,
  isObject: ze,
  isPlainObject: ta,
  isEmptyObject: no,
  isReadableStream: lo,
  isRequest: uo,
  isResponse: mo,
  isHeaders: fo,
  isUndefined: Ce,
  isDate: to,
  isFile: io,
  isBlob: oo,
  isRegExp: ko,
  isFunction: G,
  isStream: ro,
  isURLSearchParams: po,
  isTypedArray: Eo,
  isFileList: so,
  forEach: $e,
  merge: Qa,
  extend: ho,
  trim: xo,
  stripBOM: vo,
  inherits: bo,
  toFlatObject: go,
  kindOf: va,
  kindOfTest: Z,
  endsWith: yo,
  toArray: wo,
  forEachEntry: _o,
  matchAll: To,
  isHTMLForm: Ro,
  hasOwnProperty: Ln,
  hasOwnProp: Ln,
  // an alias to avoid ESLint no-prototype-builtins detection
  reduceDescriptors: zt,
  freezeMethods: jo,
  toObjectSet: Co,
  toCamelCase: So,
  noop: Oo,
  toFiniteNumber: Ao,
  findKey: Bt,
  global: de,
  isContextDefined: qt,
  isSpecCompliantForm: Po,
  toJSONObject: Fo,
  isAsyncFn: No,
  isThenable: Lo,
  setImmediate: $t,
  asap: Uo,
  isIterable: Do
};
let b = class Mt extends Error {
  static from(e, n, t, i, o, s) {
    const r = new Mt(e.message, n || e.code, t, i, o);
    return r.cause = e, r.name = e.name, s && Object.assign(r, s), r;
  }
  /**
   * Create an Error with the specified message, config, error code, request and response.
   *
   * @param {string} message The error message.
   * @param {string} [code] The error code (for example, 'ECONNABORTED').
   * @param {Object} [config] The config.
   * @param {Object} [request] The request.
   * @param {Object} [response] The response.
   *
   * @returns {Error} The created error.
   */
  constructor(e, n, t, i, o) {
    super(e), this.name = "AxiosError", this.isAxiosError = !0, n && (this.code = n), t && (this.config = t), i && (this.request = i), o && (this.response = o, this.status = o.status);
  }
  toJSON() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Axios
      config: m.toJSONObject(this.config),
      code: this.code,
      status: this.status
    };
  }
};
b.ERR_BAD_OPTION_VALUE = "ERR_BAD_OPTION_VALUE";
b.ERR_BAD_OPTION = "ERR_BAD_OPTION";
b.ECONNABORTED = "ECONNABORTED";
b.ETIMEDOUT = "ETIMEDOUT";
b.ERR_NETWORK = "ERR_NETWORK";
b.ERR_FR_TOO_MANY_REDIRECTS = "ERR_FR_TOO_MANY_REDIRECTS";
b.ERR_DEPRECATED = "ERR_DEPRECATED";
b.ERR_BAD_RESPONSE = "ERR_BAD_RESPONSE";
b.ERR_BAD_REQUEST = "ERR_BAD_REQUEST";
b.ERR_CANCELED = "ERR_CANCELED";
b.ERR_NOT_SUPPORT = "ERR_NOT_SUPPORT";
b.ERR_INVALID_URL = "ERR_INVALID_URL";
function Ht(a) {
  return a && a.__esModule && Object.prototype.hasOwnProperty.call(a, "default") ? a.default : a;
}
var Wt = V.Stream, Io = ye, Bo = ee;
function ee() {
  this.source = null, this.dataSize = 0, this.maxDataSize = 1024 * 1024, this.pauseStream = !0, this._maxDataSizeExceeded = !1, this._released = !1, this._bufferedEvents = [];
}
Io.inherits(ee, Wt);
ee.create = function(a, e) {
  var n = new this();
  e = e || {};
  for (var t in e)
    n[t] = e[t];
  n.source = a;
  var i = a.emit;
  return a.emit = function() {
    return n._handleEmit(arguments), i.apply(a, arguments);
  }, a.on("error", function() {
  }), n.pauseStream && a.pause(), n;
};
Object.defineProperty(ee.prototype, "readable", {
  configurable: !0,
  enumerable: !0,
  get: function() {
    return this.source.readable;
  }
});
ee.prototype.setEncoding = function() {
  return this.source.setEncoding.apply(this.source, arguments);
};
ee.prototype.resume = function() {
  this._released || this.release(), this.source.resume();
};
ee.prototype.pause = function() {
  this.source.pause();
};
ee.prototype.release = function() {
  this._released = !0, this._bufferedEvents.forEach((function(a) {
    this.emit.apply(this, a);
  }).bind(this)), this._bufferedEvents = [];
};
ee.prototype.pipe = function() {
  var a = Wt.prototype.pipe.apply(this, arguments);
  return this.resume(), a;
};
ee.prototype._handleEmit = function(a) {
  if (this._released) {
    this.emit.apply(this, a);
    return;
  }
  a[0] === "data" && (this.dataSize += a[1].length, this._checkIfMaxDataSizeExceeded()), this._bufferedEvents.push(a);
};
ee.prototype._checkIfMaxDataSizeExceeded = function() {
  if (!this._maxDataSizeExceeded && !(this.dataSize <= this.maxDataSize)) {
    this._maxDataSizeExceeded = !0;
    var a = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
    this.emit("error", new Error(a));
  }
};
var qo = ye, Vt = V.Stream, Un = Bo, zo = L;
function L() {
  this.writable = !1, this.readable = !0, this.dataSize = 0, this.maxDataSize = 2 * 1024 * 1024, this.pauseStreams = !0, this._released = !1, this._streams = [], this._currentStream = null, this._insideLoop = !1, this._pendingNext = !1;
}
qo.inherits(L, Vt);
L.create = function(a) {
  var e = new this();
  a = a || {};
  for (var n in a)
    e[n] = a[n];
  return e;
};
L.isStreamLike = function(a) {
  return typeof a != "function" && typeof a != "string" && typeof a != "boolean" && typeof a != "number" && !Buffer.isBuffer(a);
};
L.prototype.append = function(a) {
  var e = L.isStreamLike(a);
  if (e) {
    if (!(a instanceof Un)) {
      var n = Un.create(a, {
        maxDataSize: 1 / 0,
        pauseStream: this.pauseStreams
      });
      a.on("data", this._checkDataSize.bind(this)), a = n;
    }
    this._handleErrors(a), this.pauseStreams && a.pause();
  }
  return this._streams.push(a), this;
};
L.prototype.pipe = function(a, e) {
  return Vt.prototype.pipe.call(this, a, e), this.resume(), a;
};
L.prototype._getNext = function() {
  if (this._currentStream = null, this._insideLoop) {
    this._pendingNext = !0;
    return;
  }
  this._insideLoop = !0;
  try {
    do
      this._pendingNext = !1, this._realGetNext();
    while (this._pendingNext);
  } finally {
    this._insideLoop = !1;
  }
};
L.prototype._realGetNext = function() {
  var a = this._streams.shift();
  if (typeof a > "u") {
    this.end();
    return;
  }
  if (typeof a != "function") {
    this._pipeNext(a);
    return;
  }
  var e = a;
  e((function(n) {
    var t = L.isStreamLike(n);
    t && (n.on("data", this._checkDataSize.bind(this)), this._handleErrors(n)), this._pipeNext(n);
  }).bind(this));
};
L.prototype._pipeNext = function(a) {
  this._currentStream = a;
  var e = L.isStreamLike(a);
  if (e) {
    a.on("end", this._getNext.bind(this)), a.pipe(this, { end: !1 });
    return;
  }
  var n = a;
  this.write(n), this._getNext();
};
L.prototype._handleErrors = function(a) {
  var e = this;
  a.on("error", function(n) {
    e._emitError(n);
  });
};
L.prototype.write = function(a) {
  this.emit("data", a);
};
L.prototype.pause = function() {
  this.pauseStreams && (this.pauseStreams && this._currentStream && typeof this._currentStream.pause == "function" && this._currentStream.pause(), this.emit("pause"));
};
L.prototype.resume = function() {
  this._released || (this._released = !0, this.writable = !0, this._getNext()), this.pauseStreams && this._currentStream && typeof this._currentStream.resume == "function" && this._currentStream.resume(), this.emit("resume");
};
L.prototype.end = function() {
  this._reset(), this.emit("end");
};
L.prototype.destroy = function() {
  this._reset(), this.emit("close");
};
L.prototype._reset = function() {
  this.writable = !1, this._streams = [], this._currentStream = null;
};
L.prototype._checkDataSize = function() {
  if (this._updateDataSize(), !(this.dataSize <= this.maxDataSize)) {
    var a = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
    this._emitError(new Error(a));
  }
};
L.prototype._updateDataSize = function() {
  this.dataSize = 0;
  var a = this;
  this._streams.forEach(function(e) {
    e.dataSize && (a.dataSize += e.dataSize);
  }), this._currentStream && this._currentStream.dataSize && (this.dataSize += this._currentStream.dataSize);
};
L.prototype._emitError = function(a) {
  this._reset(), this.emit("error", a);
};
var Gt = {};
const $o = {
  "application/1d-interleaved-parityfec": {
    source: "iana"
  },
  "application/3gpdash-qoe-report+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/3gpp-ims+xml": {
    source: "iana",
    compressible: !0
  },
  "application/3gpphal+json": {
    source: "iana",
    compressible: !0
  },
  "application/3gpphalforms+json": {
    source: "iana",
    compressible: !0
  },
  "application/a2l": {
    source: "iana"
  },
  "application/ace+cbor": {
    source: "iana"
  },
  "application/activemessage": {
    source: "iana"
  },
  "application/activity+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-costmap+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-costmapfilter+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-directory+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-endpointcost+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-endpointcostparams+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-endpointprop+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-endpointpropparams+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-error+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-networkmap+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-networkmapfilter+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-updatestreamcontrol+json": {
    source: "iana",
    compressible: !0
  },
  "application/alto-updatestreamparams+json": {
    source: "iana",
    compressible: !0
  },
  "application/aml": {
    source: "iana"
  },
  "application/andrew-inset": {
    source: "iana",
    extensions: [
      "ez"
    ]
  },
  "application/applefile": {
    source: "iana"
  },
  "application/applixware": {
    source: "apache",
    extensions: [
      "aw"
    ]
  },
  "application/at+jwt": {
    source: "iana"
  },
  "application/atf": {
    source: "iana"
  },
  "application/atfx": {
    source: "iana"
  },
  "application/atom+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "atom"
    ]
  },
  "application/atomcat+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "atomcat"
    ]
  },
  "application/atomdeleted+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "atomdeleted"
    ]
  },
  "application/atomicmail": {
    source: "iana"
  },
  "application/atomsvc+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "atomsvc"
    ]
  },
  "application/atsc-dwd+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "dwd"
    ]
  },
  "application/atsc-dynamic-event-message": {
    source: "iana"
  },
  "application/atsc-held+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "held"
    ]
  },
  "application/atsc-rdt+json": {
    source: "iana",
    compressible: !0
  },
  "application/atsc-rsat+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rsat"
    ]
  },
  "application/atxml": {
    source: "iana"
  },
  "application/auth-policy+xml": {
    source: "iana",
    compressible: !0
  },
  "application/bacnet-xdd+zip": {
    source: "iana",
    compressible: !1
  },
  "application/batch-smtp": {
    source: "iana"
  },
  "application/bdoc": {
    compressible: !1,
    extensions: [
      "bdoc"
    ]
  },
  "application/beep+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/calendar+json": {
    source: "iana",
    compressible: !0
  },
  "application/calendar+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xcs"
    ]
  },
  "application/call-completion": {
    source: "iana"
  },
  "application/cals-1840": {
    source: "iana"
  },
  "application/captive+json": {
    source: "iana",
    compressible: !0
  },
  "application/cbor": {
    source: "iana"
  },
  "application/cbor-seq": {
    source: "iana"
  },
  "application/cccex": {
    source: "iana"
  },
  "application/ccmp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/ccxml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ccxml"
    ]
  },
  "application/cdfx+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "cdfx"
    ]
  },
  "application/cdmi-capability": {
    source: "iana",
    extensions: [
      "cdmia"
    ]
  },
  "application/cdmi-container": {
    source: "iana",
    extensions: [
      "cdmic"
    ]
  },
  "application/cdmi-domain": {
    source: "iana",
    extensions: [
      "cdmid"
    ]
  },
  "application/cdmi-object": {
    source: "iana",
    extensions: [
      "cdmio"
    ]
  },
  "application/cdmi-queue": {
    source: "iana",
    extensions: [
      "cdmiq"
    ]
  },
  "application/cdni": {
    source: "iana"
  },
  "application/cea": {
    source: "iana"
  },
  "application/cea-2018+xml": {
    source: "iana",
    compressible: !0
  },
  "application/cellml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/cfw": {
    source: "iana"
  },
  "application/city+json": {
    source: "iana",
    compressible: !0
  },
  "application/clr": {
    source: "iana"
  },
  "application/clue+xml": {
    source: "iana",
    compressible: !0
  },
  "application/clue_info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/cms": {
    source: "iana"
  },
  "application/cnrp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/coap-group+json": {
    source: "iana",
    compressible: !0
  },
  "application/coap-payload": {
    source: "iana"
  },
  "application/commonground": {
    source: "iana"
  },
  "application/conference-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/cose": {
    source: "iana"
  },
  "application/cose-key": {
    source: "iana"
  },
  "application/cose-key-set": {
    source: "iana"
  },
  "application/cpl+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "cpl"
    ]
  },
  "application/csrattrs": {
    source: "iana"
  },
  "application/csta+xml": {
    source: "iana",
    compressible: !0
  },
  "application/cstadata+xml": {
    source: "iana",
    compressible: !0
  },
  "application/csvm+json": {
    source: "iana",
    compressible: !0
  },
  "application/cu-seeme": {
    source: "apache",
    extensions: [
      "cu"
    ]
  },
  "application/cwt": {
    source: "iana"
  },
  "application/cybercash": {
    source: "iana"
  },
  "application/dart": {
    compressible: !0
  },
  "application/dash+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mpd"
    ]
  },
  "application/dash-patch+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mpp"
    ]
  },
  "application/dashdelta": {
    source: "iana"
  },
  "application/davmount+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "davmount"
    ]
  },
  "application/dca-rft": {
    source: "iana"
  },
  "application/dcd": {
    source: "iana"
  },
  "application/dec-dx": {
    source: "iana"
  },
  "application/dialog-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/dicom": {
    source: "iana"
  },
  "application/dicom+json": {
    source: "iana",
    compressible: !0
  },
  "application/dicom+xml": {
    source: "iana",
    compressible: !0
  },
  "application/dii": {
    source: "iana"
  },
  "application/dit": {
    source: "iana"
  },
  "application/dns": {
    source: "iana"
  },
  "application/dns+json": {
    source: "iana",
    compressible: !0
  },
  "application/dns-message": {
    source: "iana"
  },
  "application/docbook+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "dbk"
    ]
  },
  "application/dots+cbor": {
    source: "iana"
  },
  "application/dskpp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/dssc+der": {
    source: "iana",
    extensions: [
      "dssc"
    ]
  },
  "application/dssc+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xdssc"
    ]
  },
  "application/dvcs": {
    source: "iana"
  },
  "application/ecmascript": {
    source: "iana",
    compressible: !0,
    extensions: [
      "es",
      "ecma"
    ]
  },
  "application/edi-consent": {
    source: "iana"
  },
  "application/edi-x12": {
    source: "iana",
    compressible: !1
  },
  "application/edifact": {
    source: "iana",
    compressible: !1
  },
  "application/efi": {
    source: "iana"
  },
  "application/elm+json": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/elm+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.cap+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/emergencycalldata.comment+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.control+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.deviceinfo+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.ecall.msd": {
    source: "iana"
  },
  "application/emergencycalldata.providerinfo+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.serviceinfo+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.subscriberinfo+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emergencycalldata.veds+xml": {
    source: "iana",
    compressible: !0
  },
  "application/emma+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "emma"
    ]
  },
  "application/emotionml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "emotionml"
    ]
  },
  "application/encaprtp": {
    source: "iana"
  },
  "application/epp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/epub+zip": {
    source: "iana",
    compressible: !1,
    extensions: [
      "epub"
    ]
  },
  "application/eshop": {
    source: "iana"
  },
  "application/exi": {
    source: "iana",
    extensions: [
      "exi"
    ]
  },
  "application/expect-ct-report+json": {
    source: "iana",
    compressible: !0
  },
  "application/express": {
    source: "iana",
    extensions: [
      "exp"
    ]
  },
  "application/fastinfoset": {
    source: "iana"
  },
  "application/fastsoap": {
    source: "iana"
  },
  "application/fdt+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "fdt"
    ]
  },
  "application/fhir+json": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/fhir+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/fido.trusted-apps+json": {
    compressible: !0
  },
  "application/fits": {
    source: "iana"
  },
  "application/flexfec": {
    source: "iana"
  },
  "application/font-sfnt": {
    source: "iana"
  },
  "application/font-tdpfr": {
    source: "iana",
    extensions: [
      "pfr"
    ]
  },
  "application/font-woff": {
    source: "iana",
    compressible: !1
  },
  "application/framework-attributes+xml": {
    source: "iana",
    compressible: !0
  },
  "application/geo+json": {
    source: "iana",
    compressible: !0,
    extensions: [
      "geojson"
    ]
  },
  "application/geo+json-seq": {
    source: "iana"
  },
  "application/geopackage+sqlite3": {
    source: "iana"
  },
  "application/geoxacml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/gltf-buffer": {
    source: "iana"
  },
  "application/gml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "gml"
    ]
  },
  "application/gpx+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "gpx"
    ]
  },
  "application/gxf": {
    source: "apache",
    extensions: [
      "gxf"
    ]
  },
  "application/gzip": {
    source: "iana",
    compressible: !1,
    extensions: [
      "gz"
    ]
  },
  "application/h224": {
    source: "iana"
  },
  "application/held+xml": {
    source: "iana",
    compressible: !0
  },
  "application/hjson": {
    extensions: [
      "hjson"
    ]
  },
  "application/http": {
    source: "iana"
  },
  "application/hyperstudio": {
    source: "iana",
    extensions: [
      "stk"
    ]
  },
  "application/ibe-key-request+xml": {
    source: "iana",
    compressible: !0
  },
  "application/ibe-pkg-reply+xml": {
    source: "iana",
    compressible: !0
  },
  "application/ibe-pp-data": {
    source: "iana"
  },
  "application/iges": {
    source: "iana"
  },
  "application/im-iscomposing+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/index": {
    source: "iana"
  },
  "application/index.cmd": {
    source: "iana"
  },
  "application/index.obj": {
    source: "iana"
  },
  "application/index.response": {
    source: "iana"
  },
  "application/index.vnd": {
    source: "iana"
  },
  "application/inkml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ink",
      "inkml"
    ]
  },
  "application/iotp": {
    source: "iana"
  },
  "application/ipfix": {
    source: "iana",
    extensions: [
      "ipfix"
    ]
  },
  "application/ipp": {
    source: "iana"
  },
  "application/isup": {
    source: "iana"
  },
  "application/its+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "its"
    ]
  },
  "application/java-archive": {
    source: "apache",
    compressible: !1,
    extensions: [
      "jar",
      "war",
      "ear"
    ]
  },
  "application/java-serialized-object": {
    source: "apache",
    compressible: !1,
    extensions: [
      "ser"
    ]
  },
  "application/java-vm": {
    source: "apache",
    compressible: !1,
    extensions: [
      "class"
    ]
  },
  "application/javascript": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "js",
      "mjs"
    ]
  },
  "application/jf2feed+json": {
    source: "iana",
    compressible: !0
  },
  "application/jose": {
    source: "iana"
  },
  "application/jose+json": {
    source: "iana",
    compressible: !0
  },
  "application/jrd+json": {
    source: "iana",
    compressible: !0
  },
  "application/jscalendar+json": {
    source: "iana",
    compressible: !0
  },
  "application/json": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "json",
      "map"
    ]
  },
  "application/json-patch+json": {
    source: "iana",
    compressible: !0
  },
  "application/json-seq": {
    source: "iana"
  },
  "application/json5": {
    extensions: [
      "json5"
    ]
  },
  "application/jsonml+json": {
    source: "apache",
    compressible: !0,
    extensions: [
      "jsonml"
    ]
  },
  "application/jwk+json": {
    source: "iana",
    compressible: !0
  },
  "application/jwk-set+json": {
    source: "iana",
    compressible: !0
  },
  "application/jwt": {
    source: "iana"
  },
  "application/kpml-request+xml": {
    source: "iana",
    compressible: !0
  },
  "application/kpml-response+xml": {
    source: "iana",
    compressible: !0
  },
  "application/ld+json": {
    source: "iana",
    compressible: !0,
    extensions: [
      "jsonld"
    ]
  },
  "application/lgr+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "lgr"
    ]
  },
  "application/link-format": {
    source: "iana"
  },
  "application/load-control+xml": {
    source: "iana",
    compressible: !0
  },
  "application/lost+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "lostxml"
    ]
  },
  "application/lostsync+xml": {
    source: "iana",
    compressible: !0
  },
  "application/lpf+zip": {
    source: "iana",
    compressible: !1
  },
  "application/lxf": {
    source: "iana"
  },
  "application/mac-binhex40": {
    source: "iana",
    extensions: [
      "hqx"
    ]
  },
  "application/mac-compactpro": {
    source: "apache",
    extensions: [
      "cpt"
    ]
  },
  "application/macwriteii": {
    source: "iana"
  },
  "application/mads+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mads"
    ]
  },
  "application/manifest+json": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "webmanifest"
    ]
  },
  "application/marc": {
    source: "iana",
    extensions: [
      "mrc"
    ]
  },
  "application/marcxml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mrcx"
    ]
  },
  "application/mathematica": {
    source: "iana",
    extensions: [
      "ma",
      "nb",
      "mb"
    ]
  },
  "application/mathml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mathml"
    ]
  },
  "application/mathml-content+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mathml-presentation+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-associated-procedure-description+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-deregister+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-envelope+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-msk+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-msk-response+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-protection-description+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-reception-report+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-register+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-register-response+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-schedule+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbms-user-service-description+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mbox": {
    source: "iana",
    extensions: [
      "mbox"
    ]
  },
  "application/media-policy-dataset+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mpf"
    ]
  },
  "application/media_control+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mediaservercontrol+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mscml"
    ]
  },
  "application/merge-patch+json": {
    source: "iana",
    compressible: !0
  },
  "application/metalink+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "metalink"
    ]
  },
  "application/metalink4+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "meta4"
    ]
  },
  "application/mets+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mets"
    ]
  },
  "application/mf4": {
    source: "iana"
  },
  "application/mikey": {
    source: "iana"
  },
  "application/mipc": {
    source: "iana"
  },
  "application/missing-blocks+cbor-seq": {
    source: "iana"
  },
  "application/mmt-aei+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "maei"
    ]
  },
  "application/mmt-usd+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "musd"
    ]
  },
  "application/mods+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mods"
    ]
  },
  "application/moss-keys": {
    source: "iana"
  },
  "application/moss-signature": {
    source: "iana"
  },
  "application/mosskey-data": {
    source: "iana"
  },
  "application/mosskey-request": {
    source: "iana"
  },
  "application/mp21": {
    source: "iana",
    extensions: [
      "m21",
      "mp21"
    ]
  },
  "application/mp4": {
    source: "iana",
    extensions: [
      "mp4s",
      "m4p"
    ]
  },
  "application/mpeg4-generic": {
    source: "iana"
  },
  "application/mpeg4-iod": {
    source: "iana"
  },
  "application/mpeg4-iod-xmt": {
    source: "iana"
  },
  "application/mrb-consumer+xml": {
    source: "iana",
    compressible: !0
  },
  "application/mrb-publish+xml": {
    source: "iana",
    compressible: !0
  },
  "application/msc-ivr+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/msc-mixer+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/msword": {
    source: "iana",
    compressible: !1,
    extensions: [
      "doc",
      "dot"
    ]
  },
  "application/mud+json": {
    source: "iana",
    compressible: !0
  },
  "application/multipart-core": {
    source: "iana"
  },
  "application/mxf": {
    source: "iana",
    extensions: [
      "mxf"
    ]
  },
  "application/n-quads": {
    source: "iana",
    extensions: [
      "nq"
    ]
  },
  "application/n-triples": {
    source: "iana",
    extensions: [
      "nt"
    ]
  },
  "application/nasdata": {
    source: "iana"
  },
  "application/news-checkgroups": {
    source: "iana",
    charset: "US-ASCII"
  },
  "application/news-groupinfo": {
    source: "iana",
    charset: "US-ASCII"
  },
  "application/news-transmission": {
    source: "iana"
  },
  "application/nlsml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/node": {
    source: "iana",
    extensions: [
      "cjs"
    ]
  },
  "application/nss": {
    source: "iana"
  },
  "application/oauth-authz-req+jwt": {
    source: "iana"
  },
  "application/oblivious-dns-message": {
    source: "iana"
  },
  "application/ocsp-request": {
    source: "iana"
  },
  "application/ocsp-response": {
    source: "iana"
  },
  "application/octet-stream": {
    source: "iana",
    compressible: !1,
    extensions: [
      "bin",
      "dms",
      "lrf",
      "mar",
      "so",
      "dist",
      "distz",
      "pkg",
      "bpk",
      "dump",
      "elc",
      "deploy",
      "exe",
      "dll",
      "deb",
      "dmg",
      "iso",
      "img",
      "msi",
      "msp",
      "msm",
      "buffer"
    ]
  },
  "application/oda": {
    source: "iana",
    extensions: [
      "oda"
    ]
  },
  "application/odm+xml": {
    source: "iana",
    compressible: !0
  },
  "application/odx": {
    source: "iana"
  },
  "application/oebps-package+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "opf"
    ]
  },
  "application/ogg": {
    source: "iana",
    compressible: !1,
    extensions: [
      "ogx"
    ]
  },
  "application/omdoc+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "omdoc"
    ]
  },
  "application/onenote": {
    source: "apache",
    extensions: [
      "onetoc",
      "onetoc2",
      "onetmp",
      "onepkg"
    ]
  },
  "application/opc-nodeset+xml": {
    source: "iana",
    compressible: !0
  },
  "application/oscore": {
    source: "iana"
  },
  "application/oxps": {
    source: "iana",
    extensions: [
      "oxps"
    ]
  },
  "application/p21": {
    source: "iana"
  },
  "application/p21+zip": {
    source: "iana",
    compressible: !1
  },
  "application/p2p-overlay+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "relo"
    ]
  },
  "application/parityfec": {
    source: "iana"
  },
  "application/passport": {
    source: "iana"
  },
  "application/patch-ops-error+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xer"
    ]
  },
  "application/pdf": {
    source: "iana",
    compressible: !1,
    extensions: [
      "pdf"
    ]
  },
  "application/pdx": {
    source: "iana"
  },
  "application/pem-certificate-chain": {
    source: "iana"
  },
  "application/pgp-encrypted": {
    source: "iana",
    compressible: !1,
    extensions: [
      "pgp"
    ]
  },
  "application/pgp-keys": {
    source: "iana",
    extensions: [
      "asc"
    ]
  },
  "application/pgp-signature": {
    source: "iana",
    extensions: [
      "asc",
      "sig"
    ]
  },
  "application/pics-rules": {
    source: "apache",
    extensions: [
      "prf"
    ]
  },
  "application/pidf+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/pidf-diff+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/pkcs10": {
    source: "iana",
    extensions: [
      "p10"
    ]
  },
  "application/pkcs12": {
    source: "iana"
  },
  "application/pkcs7-mime": {
    source: "iana",
    extensions: [
      "p7m",
      "p7c"
    ]
  },
  "application/pkcs7-signature": {
    source: "iana",
    extensions: [
      "p7s"
    ]
  },
  "application/pkcs8": {
    source: "iana",
    extensions: [
      "p8"
    ]
  },
  "application/pkcs8-encrypted": {
    source: "iana"
  },
  "application/pkix-attr-cert": {
    source: "iana",
    extensions: [
      "ac"
    ]
  },
  "application/pkix-cert": {
    source: "iana",
    extensions: [
      "cer"
    ]
  },
  "application/pkix-crl": {
    source: "iana",
    extensions: [
      "crl"
    ]
  },
  "application/pkix-pkipath": {
    source: "iana",
    extensions: [
      "pkipath"
    ]
  },
  "application/pkixcmp": {
    source: "iana",
    extensions: [
      "pki"
    ]
  },
  "application/pls+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "pls"
    ]
  },
  "application/poc-settings+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/postscript": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ai",
      "eps",
      "ps"
    ]
  },
  "application/ppsp-tracker+json": {
    source: "iana",
    compressible: !0
  },
  "application/problem+json": {
    source: "iana",
    compressible: !0
  },
  "application/problem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/provenance+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "provx"
    ]
  },
  "application/prs.alvestrand.titrax-sheet": {
    source: "iana"
  },
  "application/prs.cww": {
    source: "iana",
    extensions: [
      "cww"
    ]
  },
  "application/prs.cyn": {
    source: "iana",
    charset: "7-BIT"
  },
  "application/prs.hpub+zip": {
    source: "iana",
    compressible: !1
  },
  "application/prs.nprend": {
    source: "iana"
  },
  "application/prs.plucker": {
    source: "iana"
  },
  "application/prs.rdf-xml-crypt": {
    source: "iana"
  },
  "application/prs.xsf+xml": {
    source: "iana",
    compressible: !0
  },
  "application/pskc+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "pskcxml"
    ]
  },
  "application/pvd+json": {
    source: "iana",
    compressible: !0
  },
  "application/qsig": {
    source: "iana"
  },
  "application/raml+yaml": {
    compressible: !0,
    extensions: [
      "raml"
    ]
  },
  "application/raptorfec": {
    source: "iana"
  },
  "application/rdap+json": {
    source: "iana",
    compressible: !0
  },
  "application/rdf+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rdf",
      "owl"
    ]
  },
  "application/reginfo+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rif"
    ]
  },
  "application/relax-ng-compact-syntax": {
    source: "iana",
    extensions: [
      "rnc"
    ]
  },
  "application/remote-printing": {
    source: "iana"
  },
  "application/reputon+json": {
    source: "iana",
    compressible: !0
  },
  "application/resource-lists+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rl"
    ]
  },
  "application/resource-lists-diff+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rld"
    ]
  },
  "application/rfc+xml": {
    source: "iana",
    compressible: !0
  },
  "application/riscos": {
    source: "iana"
  },
  "application/rlmi+xml": {
    source: "iana",
    compressible: !0
  },
  "application/rls-services+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rs"
    ]
  },
  "application/route-apd+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rapd"
    ]
  },
  "application/route-s-tsid+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "sls"
    ]
  },
  "application/route-usd+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rusd"
    ]
  },
  "application/rpki-ghostbusters": {
    source: "iana",
    extensions: [
      "gbr"
    ]
  },
  "application/rpki-manifest": {
    source: "iana",
    extensions: [
      "mft"
    ]
  },
  "application/rpki-publication": {
    source: "iana"
  },
  "application/rpki-roa": {
    source: "iana",
    extensions: [
      "roa"
    ]
  },
  "application/rpki-updown": {
    source: "iana"
  },
  "application/rsd+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "rsd"
    ]
  },
  "application/rss+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "rss"
    ]
  },
  "application/rtf": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rtf"
    ]
  },
  "application/rtploopback": {
    source: "iana"
  },
  "application/rtx": {
    source: "iana"
  },
  "application/samlassertion+xml": {
    source: "iana",
    compressible: !0
  },
  "application/samlmetadata+xml": {
    source: "iana",
    compressible: !0
  },
  "application/sarif+json": {
    source: "iana",
    compressible: !0
  },
  "application/sarif-external-properties+json": {
    source: "iana",
    compressible: !0
  },
  "application/sbe": {
    source: "iana"
  },
  "application/sbml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "sbml"
    ]
  },
  "application/scaip+xml": {
    source: "iana",
    compressible: !0
  },
  "application/scim+json": {
    source: "iana",
    compressible: !0
  },
  "application/scvp-cv-request": {
    source: "iana",
    extensions: [
      "scq"
    ]
  },
  "application/scvp-cv-response": {
    source: "iana",
    extensions: [
      "scs"
    ]
  },
  "application/scvp-vp-request": {
    source: "iana",
    extensions: [
      "spq"
    ]
  },
  "application/scvp-vp-response": {
    source: "iana",
    extensions: [
      "spp"
    ]
  },
  "application/sdp": {
    source: "iana",
    extensions: [
      "sdp"
    ]
  },
  "application/secevent+jwt": {
    source: "iana"
  },
  "application/senml+cbor": {
    source: "iana"
  },
  "application/senml+json": {
    source: "iana",
    compressible: !0
  },
  "application/senml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "senmlx"
    ]
  },
  "application/senml-etch+cbor": {
    source: "iana"
  },
  "application/senml-etch+json": {
    source: "iana",
    compressible: !0
  },
  "application/senml-exi": {
    source: "iana"
  },
  "application/sensml+cbor": {
    source: "iana"
  },
  "application/sensml+json": {
    source: "iana",
    compressible: !0
  },
  "application/sensml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "sensmlx"
    ]
  },
  "application/sensml-exi": {
    source: "iana"
  },
  "application/sep+xml": {
    source: "iana",
    compressible: !0
  },
  "application/sep-exi": {
    source: "iana"
  },
  "application/session-info": {
    source: "iana"
  },
  "application/set-payment": {
    source: "iana"
  },
  "application/set-payment-initiation": {
    source: "iana",
    extensions: [
      "setpay"
    ]
  },
  "application/set-registration": {
    source: "iana"
  },
  "application/set-registration-initiation": {
    source: "iana",
    extensions: [
      "setreg"
    ]
  },
  "application/sgml": {
    source: "iana"
  },
  "application/sgml-open-catalog": {
    source: "iana"
  },
  "application/shf+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "shf"
    ]
  },
  "application/sieve": {
    source: "iana",
    extensions: [
      "siv",
      "sieve"
    ]
  },
  "application/simple-filter+xml": {
    source: "iana",
    compressible: !0
  },
  "application/simple-message-summary": {
    source: "iana"
  },
  "application/simplesymbolcontainer": {
    source: "iana"
  },
  "application/sipc": {
    source: "iana"
  },
  "application/slate": {
    source: "iana"
  },
  "application/smil": {
    source: "iana"
  },
  "application/smil+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "smi",
      "smil"
    ]
  },
  "application/smpte336m": {
    source: "iana"
  },
  "application/soap+fastinfoset": {
    source: "iana"
  },
  "application/soap+xml": {
    source: "iana",
    compressible: !0
  },
  "application/sparql-query": {
    source: "iana",
    extensions: [
      "rq"
    ]
  },
  "application/sparql-results+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "srx"
    ]
  },
  "application/spdx+json": {
    source: "iana",
    compressible: !0
  },
  "application/spirits-event+xml": {
    source: "iana",
    compressible: !0
  },
  "application/sql": {
    source: "iana"
  },
  "application/srgs": {
    source: "iana",
    extensions: [
      "gram"
    ]
  },
  "application/srgs+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "grxml"
    ]
  },
  "application/sru+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "sru"
    ]
  },
  "application/ssdl+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "ssdl"
    ]
  },
  "application/ssml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ssml"
    ]
  },
  "application/stix+json": {
    source: "iana",
    compressible: !0
  },
  "application/swid+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "swidtag"
    ]
  },
  "application/tamp-apex-update": {
    source: "iana"
  },
  "application/tamp-apex-update-confirm": {
    source: "iana"
  },
  "application/tamp-community-update": {
    source: "iana"
  },
  "application/tamp-community-update-confirm": {
    source: "iana"
  },
  "application/tamp-error": {
    source: "iana"
  },
  "application/tamp-sequence-adjust": {
    source: "iana"
  },
  "application/tamp-sequence-adjust-confirm": {
    source: "iana"
  },
  "application/tamp-status-query": {
    source: "iana"
  },
  "application/tamp-status-response": {
    source: "iana"
  },
  "application/tamp-update": {
    source: "iana"
  },
  "application/tamp-update-confirm": {
    source: "iana"
  },
  "application/tar": {
    compressible: !0
  },
  "application/taxii+json": {
    source: "iana",
    compressible: !0
  },
  "application/td+json": {
    source: "iana",
    compressible: !0
  },
  "application/tei+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "tei",
      "teicorpus"
    ]
  },
  "application/tetra_isi": {
    source: "iana"
  },
  "application/thraud+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "tfi"
    ]
  },
  "application/timestamp-query": {
    source: "iana"
  },
  "application/timestamp-reply": {
    source: "iana"
  },
  "application/timestamped-data": {
    source: "iana",
    extensions: [
      "tsd"
    ]
  },
  "application/tlsrpt+gzip": {
    source: "iana"
  },
  "application/tlsrpt+json": {
    source: "iana",
    compressible: !0
  },
  "application/tnauthlist": {
    source: "iana"
  },
  "application/token-introspection+jwt": {
    source: "iana"
  },
  "application/toml": {
    compressible: !0,
    extensions: [
      "toml"
    ]
  },
  "application/trickle-ice-sdpfrag": {
    source: "iana"
  },
  "application/trig": {
    source: "iana",
    extensions: [
      "trig"
    ]
  },
  "application/ttml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ttml"
    ]
  },
  "application/tve-trigger": {
    source: "iana"
  },
  "application/tzif": {
    source: "iana"
  },
  "application/tzif-leap": {
    source: "iana"
  },
  "application/ubjson": {
    compressible: !1,
    extensions: [
      "ubj"
    ]
  },
  "application/ulpfec": {
    source: "iana"
  },
  "application/urc-grpsheet+xml": {
    source: "iana",
    compressible: !0
  },
  "application/urc-ressheet+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rsheet"
    ]
  },
  "application/urc-targetdesc+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "td"
    ]
  },
  "application/urc-uisocketdesc+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vcard+json": {
    source: "iana",
    compressible: !0
  },
  "application/vcard+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vemmi": {
    source: "iana"
  },
  "application/vividence.scriptfile": {
    source: "apache"
  },
  "application/vnd.1000minds.decision-model+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "1km"
    ]
  },
  "application/vnd.3gpp-prose+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp-prose-pc3ch+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp-v2x-local-service-information": {
    source: "iana"
  },
  "application/vnd.3gpp.5gnas": {
    source: "iana"
  },
  "application/vnd.3gpp.access-transfer-events+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.bsf+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.gmop+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.gtpc": {
    source: "iana"
  },
  "application/vnd.3gpp.interworking-data": {
    source: "iana"
  },
  "application/vnd.3gpp.lpp": {
    source: "iana"
  },
  "application/vnd.3gpp.mc-signalling-ear": {
    source: "iana"
  },
  "application/vnd.3gpp.mcdata-affiliation-command+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcdata-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcdata-payload": {
    source: "iana"
  },
  "application/vnd.3gpp.mcdata-service-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcdata-signalling": {
    source: "iana"
  },
  "application/vnd.3gpp.mcdata-ue-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcdata-user-profile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-affiliation-command+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-floor-request+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-location-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-mbms-usage-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-service-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-signed+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-ue-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-ue-init-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcptt-user-profile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-affiliation-command+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-affiliation-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-location-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-mbms-usage-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-service-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-transmission-request+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-ue-config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mcvideo-user-profile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.mid-call+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.ngap": {
    source: "iana"
  },
  "application/vnd.3gpp.pfcp": {
    source: "iana"
  },
  "application/vnd.3gpp.pic-bw-large": {
    source: "iana",
    extensions: [
      "plb"
    ]
  },
  "application/vnd.3gpp.pic-bw-small": {
    source: "iana",
    extensions: [
      "psb"
    ]
  },
  "application/vnd.3gpp.pic-bw-var": {
    source: "iana",
    extensions: [
      "pvb"
    ]
  },
  "application/vnd.3gpp.s1ap": {
    source: "iana"
  },
  "application/vnd.3gpp.sms": {
    source: "iana"
  },
  "application/vnd.3gpp.sms+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.srvcc-ext+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.srvcc-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.state-and-event-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp.ussd+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp2.bcmcsinfo+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.3gpp2.sms": {
    source: "iana"
  },
  "application/vnd.3gpp2.tcap": {
    source: "iana",
    extensions: [
      "tcap"
    ]
  },
  "application/vnd.3lightssoftware.imagescal": {
    source: "iana"
  },
  "application/vnd.3m.post-it-notes": {
    source: "iana",
    extensions: [
      "pwn"
    ]
  },
  "application/vnd.accpac.simply.aso": {
    source: "iana",
    extensions: [
      "aso"
    ]
  },
  "application/vnd.accpac.simply.imp": {
    source: "iana",
    extensions: [
      "imp"
    ]
  },
  "application/vnd.acucobol": {
    source: "iana",
    extensions: [
      "acu"
    ]
  },
  "application/vnd.acucorp": {
    source: "iana",
    extensions: [
      "atc",
      "acutc"
    ]
  },
  "application/vnd.adobe.air-application-installer-package+zip": {
    source: "apache",
    compressible: !1,
    extensions: [
      "air"
    ]
  },
  "application/vnd.adobe.flash.movie": {
    source: "iana"
  },
  "application/vnd.adobe.formscentral.fcdt": {
    source: "iana",
    extensions: [
      "fcdt"
    ]
  },
  "application/vnd.adobe.fxp": {
    source: "iana",
    extensions: [
      "fxp",
      "fxpl"
    ]
  },
  "application/vnd.adobe.partial-upload": {
    source: "iana"
  },
  "application/vnd.adobe.xdp+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xdp"
    ]
  },
  "application/vnd.adobe.xfdf": {
    source: "iana",
    extensions: [
      "xfdf"
    ]
  },
  "application/vnd.aether.imp": {
    source: "iana"
  },
  "application/vnd.afpc.afplinedata": {
    source: "iana"
  },
  "application/vnd.afpc.afplinedata-pagedef": {
    source: "iana"
  },
  "application/vnd.afpc.cmoca-cmresource": {
    source: "iana"
  },
  "application/vnd.afpc.foca-charset": {
    source: "iana"
  },
  "application/vnd.afpc.foca-codedfont": {
    source: "iana"
  },
  "application/vnd.afpc.foca-codepage": {
    source: "iana"
  },
  "application/vnd.afpc.modca": {
    source: "iana"
  },
  "application/vnd.afpc.modca-cmtable": {
    source: "iana"
  },
  "application/vnd.afpc.modca-formdef": {
    source: "iana"
  },
  "application/vnd.afpc.modca-mediummap": {
    source: "iana"
  },
  "application/vnd.afpc.modca-objectcontainer": {
    source: "iana"
  },
  "application/vnd.afpc.modca-overlay": {
    source: "iana"
  },
  "application/vnd.afpc.modca-pagesegment": {
    source: "iana"
  },
  "application/vnd.age": {
    source: "iana",
    extensions: [
      "age"
    ]
  },
  "application/vnd.ah-barcode": {
    source: "iana"
  },
  "application/vnd.ahead.space": {
    source: "iana",
    extensions: [
      "ahead"
    ]
  },
  "application/vnd.airzip.filesecure.azf": {
    source: "iana",
    extensions: [
      "azf"
    ]
  },
  "application/vnd.airzip.filesecure.azs": {
    source: "iana",
    extensions: [
      "azs"
    ]
  },
  "application/vnd.amadeus+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.amazon.ebook": {
    source: "apache",
    extensions: [
      "azw"
    ]
  },
  "application/vnd.amazon.mobi8-ebook": {
    source: "iana"
  },
  "application/vnd.americandynamics.acc": {
    source: "iana",
    extensions: [
      "acc"
    ]
  },
  "application/vnd.amiga.ami": {
    source: "iana",
    extensions: [
      "ami"
    ]
  },
  "application/vnd.amundsen.maze+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.android.ota": {
    source: "iana"
  },
  "application/vnd.android.package-archive": {
    source: "apache",
    compressible: !1,
    extensions: [
      "apk"
    ]
  },
  "application/vnd.anki": {
    source: "iana"
  },
  "application/vnd.anser-web-certificate-issue-initiation": {
    source: "iana",
    extensions: [
      "cii"
    ]
  },
  "application/vnd.anser-web-funds-transfer-initiation": {
    source: "apache",
    extensions: [
      "fti"
    ]
  },
  "application/vnd.antix.game-component": {
    source: "iana",
    extensions: [
      "atx"
    ]
  },
  "application/vnd.apache.arrow.file": {
    source: "iana"
  },
  "application/vnd.apache.arrow.stream": {
    source: "iana"
  },
  "application/vnd.apache.thrift.binary": {
    source: "iana"
  },
  "application/vnd.apache.thrift.compact": {
    source: "iana"
  },
  "application/vnd.apache.thrift.json": {
    source: "iana"
  },
  "application/vnd.api+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.aplextor.warrp+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.apothekende.reservation+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.apple.installer+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mpkg"
    ]
  },
  "application/vnd.apple.keynote": {
    source: "iana",
    extensions: [
      "key"
    ]
  },
  "application/vnd.apple.mpegurl": {
    source: "iana",
    extensions: [
      "m3u8"
    ]
  },
  "application/vnd.apple.numbers": {
    source: "iana",
    extensions: [
      "numbers"
    ]
  },
  "application/vnd.apple.pages": {
    source: "iana",
    extensions: [
      "pages"
    ]
  },
  "application/vnd.apple.pkpass": {
    compressible: !1,
    extensions: [
      "pkpass"
    ]
  },
  "application/vnd.arastra.swi": {
    source: "iana"
  },
  "application/vnd.aristanetworks.swi": {
    source: "iana",
    extensions: [
      "swi"
    ]
  },
  "application/vnd.artisan+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.artsquare": {
    source: "iana"
  },
  "application/vnd.astraea-software.iota": {
    source: "iana",
    extensions: [
      "iota"
    ]
  },
  "application/vnd.audiograph": {
    source: "iana",
    extensions: [
      "aep"
    ]
  },
  "application/vnd.autopackage": {
    source: "iana"
  },
  "application/vnd.avalon+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.avistar+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.balsamiq.bmml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "bmml"
    ]
  },
  "application/vnd.balsamiq.bmpr": {
    source: "iana"
  },
  "application/vnd.banana-accounting": {
    source: "iana"
  },
  "application/vnd.bbf.usp.error": {
    source: "iana"
  },
  "application/vnd.bbf.usp.msg": {
    source: "iana"
  },
  "application/vnd.bbf.usp.msg+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.bekitzur-stech+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.bint.med-content": {
    source: "iana"
  },
  "application/vnd.biopax.rdf+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.blink-idb-value-wrapper": {
    source: "iana"
  },
  "application/vnd.blueice.multipass": {
    source: "iana",
    extensions: [
      "mpm"
    ]
  },
  "application/vnd.bluetooth.ep.oob": {
    source: "iana"
  },
  "application/vnd.bluetooth.le.oob": {
    source: "iana"
  },
  "application/vnd.bmi": {
    source: "iana",
    extensions: [
      "bmi"
    ]
  },
  "application/vnd.bpf": {
    source: "iana"
  },
  "application/vnd.bpf3": {
    source: "iana"
  },
  "application/vnd.businessobjects": {
    source: "iana",
    extensions: [
      "rep"
    ]
  },
  "application/vnd.byu.uapi+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.cab-jscript": {
    source: "iana"
  },
  "application/vnd.canon-cpdl": {
    source: "iana"
  },
  "application/vnd.canon-lips": {
    source: "iana"
  },
  "application/vnd.capasystems-pg+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.cendio.thinlinc.clientconf": {
    source: "iana"
  },
  "application/vnd.century-systems.tcp_stream": {
    source: "iana"
  },
  "application/vnd.chemdraw+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "cdxml"
    ]
  },
  "application/vnd.chess-pgn": {
    source: "iana"
  },
  "application/vnd.chipnuts.karaoke-mmd": {
    source: "iana",
    extensions: [
      "mmd"
    ]
  },
  "application/vnd.ciedi": {
    source: "iana"
  },
  "application/vnd.cinderella": {
    source: "iana",
    extensions: [
      "cdy"
    ]
  },
  "application/vnd.cirpack.isdn-ext": {
    source: "iana"
  },
  "application/vnd.citationstyles.style+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "csl"
    ]
  },
  "application/vnd.claymore": {
    source: "iana",
    extensions: [
      "cla"
    ]
  },
  "application/vnd.cloanto.rp9": {
    source: "iana",
    extensions: [
      "rp9"
    ]
  },
  "application/vnd.clonk.c4group": {
    source: "iana",
    extensions: [
      "c4g",
      "c4d",
      "c4f",
      "c4p",
      "c4u"
    ]
  },
  "application/vnd.cluetrust.cartomobile-config": {
    source: "iana",
    extensions: [
      "c11amc"
    ]
  },
  "application/vnd.cluetrust.cartomobile-config-pkg": {
    source: "iana",
    extensions: [
      "c11amz"
    ]
  },
  "application/vnd.coffeescript": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.document": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.document-template": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.presentation": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.presentation-template": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.spreadsheet": {
    source: "iana"
  },
  "application/vnd.collabio.xodocuments.spreadsheet-template": {
    source: "iana"
  },
  "application/vnd.collection+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.collection.doc+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.collection.next+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.comicbook+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.comicbook-rar": {
    source: "iana"
  },
  "application/vnd.commerce-battelle": {
    source: "iana"
  },
  "application/vnd.commonspace": {
    source: "iana",
    extensions: [
      "csp"
    ]
  },
  "application/vnd.contact.cmsg": {
    source: "iana",
    extensions: [
      "cdbcmsg"
    ]
  },
  "application/vnd.coreos.ignition+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.cosmocaller": {
    source: "iana",
    extensions: [
      "cmc"
    ]
  },
  "application/vnd.crick.clicker": {
    source: "iana",
    extensions: [
      "clkx"
    ]
  },
  "application/vnd.crick.clicker.keyboard": {
    source: "iana",
    extensions: [
      "clkk"
    ]
  },
  "application/vnd.crick.clicker.palette": {
    source: "iana",
    extensions: [
      "clkp"
    ]
  },
  "application/vnd.crick.clicker.template": {
    source: "iana",
    extensions: [
      "clkt"
    ]
  },
  "application/vnd.crick.clicker.wordbank": {
    source: "iana",
    extensions: [
      "clkw"
    ]
  },
  "application/vnd.criticaltools.wbs+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "wbs"
    ]
  },
  "application/vnd.cryptii.pipe+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.crypto-shade-file": {
    source: "iana"
  },
  "application/vnd.cryptomator.encrypted": {
    source: "iana"
  },
  "application/vnd.cryptomator.vault": {
    source: "iana"
  },
  "application/vnd.ctc-posml": {
    source: "iana",
    extensions: [
      "pml"
    ]
  },
  "application/vnd.ctct.ws+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.cups-pdf": {
    source: "iana"
  },
  "application/vnd.cups-postscript": {
    source: "iana"
  },
  "application/vnd.cups-ppd": {
    source: "iana",
    extensions: [
      "ppd"
    ]
  },
  "application/vnd.cups-raster": {
    source: "iana"
  },
  "application/vnd.cups-raw": {
    source: "iana"
  },
  "application/vnd.curl": {
    source: "iana"
  },
  "application/vnd.curl.car": {
    source: "apache",
    extensions: [
      "car"
    ]
  },
  "application/vnd.curl.pcurl": {
    source: "apache",
    extensions: [
      "pcurl"
    ]
  },
  "application/vnd.cyan.dean.root+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.cybank": {
    source: "iana"
  },
  "application/vnd.cyclonedx+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.cyclonedx+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.d2l.coursepackage1p0+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.d3m-dataset": {
    source: "iana"
  },
  "application/vnd.d3m-problem": {
    source: "iana"
  },
  "application/vnd.dart": {
    source: "iana",
    compressible: !0,
    extensions: [
      "dart"
    ]
  },
  "application/vnd.data-vision.rdz": {
    source: "iana",
    extensions: [
      "rdz"
    ]
  },
  "application/vnd.datapackage+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dataresource+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dbf": {
    source: "iana",
    extensions: [
      "dbf"
    ]
  },
  "application/vnd.debian.binary-package": {
    source: "iana"
  },
  "application/vnd.dece.data": {
    source: "iana",
    extensions: [
      "uvf",
      "uvvf",
      "uvd",
      "uvvd"
    ]
  },
  "application/vnd.dece.ttml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "uvt",
      "uvvt"
    ]
  },
  "application/vnd.dece.unspecified": {
    source: "iana",
    extensions: [
      "uvx",
      "uvvx"
    ]
  },
  "application/vnd.dece.zip": {
    source: "iana",
    extensions: [
      "uvz",
      "uvvz"
    ]
  },
  "application/vnd.denovo.fcselayout-link": {
    source: "iana",
    extensions: [
      "fe_launch"
    ]
  },
  "application/vnd.desmume.movie": {
    source: "iana"
  },
  "application/vnd.dir-bi.plate-dl-nosuffix": {
    source: "iana"
  },
  "application/vnd.dm.delegation+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dna": {
    source: "iana",
    extensions: [
      "dna"
    ]
  },
  "application/vnd.document+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dolby.mlp": {
    source: "apache",
    extensions: [
      "mlp"
    ]
  },
  "application/vnd.dolby.mobile.1": {
    source: "iana"
  },
  "application/vnd.dolby.mobile.2": {
    source: "iana"
  },
  "application/vnd.doremir.scorecloud-binary-document": {
    source: "iana"
  },
  "application/vnd.dpgraph": {
    source: "iana",
    extensions: [
      "dpg"
    ]
  },
  "application/vnd.dreamfactory": {
    source: "iana",
    extensions: [
      "dfac"
    ]
  },
  "application/vnd.drive+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ds-keypoint": {
    source: "apache",
    extensions: [
      "kpxx"
    ]
  },
  "application/vnd.dtg.local": {
    source: "iana"
  },
  "application/vnd.dtg.local.flash": {
    source: "iana"
  },
  "application/vnd.dtg.local.html": {
    source: "iana"
  },
  "application/vnd.dvb.ait": {
    source: "iana",
    extensions: [
      "ait"
    ]
  },
  "application/vnd.dvb.dvbisl+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.dvbj": {
    source: "iana"
  },
  "application/vnd.dvb.esgcontainer": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcdftnotifaccess": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcesgaccess": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcesgaccess2": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcesgpdd": {
    source: "iana"
  },
  "application/vnd.dvb.ipdcroaming": {
    source: "iana"
  },
  "application/vnd.dvb.iptv.alfec-base": {
    source: "iana"
  },
  "application/vnd.dvb.iptv.alfec-enhancement": {
    source: "iana"
  },
  "application/vnd.dvb.notif-aggregate-root+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.notif-container+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.notif-generic+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.notif-ia-msglist+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.notif-ia-registration-request+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.notif-ia-registration-response+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.notif-init+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.dvb.pfr": {
    source: "iana"
  },
  "application/vnd.dvb.service": {
    source: "iana",
    extensions: [
      "svc"
    ]
  },
  "application/vnd.dxr": {
    source: "iana"
  },
  "application/vnd.dynageo": {
    source: "iana",
    extensions: [
      "geo"
    ]
  },
  "application/vnd.dzr": {
    source: "iana"
  },
  "application/vnd.easykaraoke.cdgdownload": {
    source: "iana"
  },
  "application/vnd.ecdis-update": {
    source: "iana"
  },
  "application/vnd.ecip.rlp": {
    source: "iana"
  },
  "application/vnd.eclipse.ditto+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ecowin.chart": {
    source: "iana",
    extensions: [
      "mag"
    ]
  },
  "application/vnd.ecowin.filerequest": {
    source: "iana"
  },
  "application/vnd.ecowin.fileupdate": {
    source: "iana"
  },
  "application/vnd.ecowin.series": {
    source: "iana"
  },
  "application/vnd.ecowin.seriesrequest": {
    source: "iana"
  },
  "application/vnd.ecowin.seriesupdate": {
    source: "iana"
  },
  "application/vnd.efi.img": {
    source: "iana"
  },
  "application/vnd.efi.iso": {
    source: "iana"
  },
  "application/vnd.emclient.accessrequest+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.enliven": {
    source: "iana",
    extensions: [
      "nml"
    ]
  },
  "application/vnd.enphase.envoy": {
    source: "iana"
  },
  "application/vnd.eprints.data+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.epson.esf": {
    source: "iana",
    extensions: [
      "esf"
    ]
  },
  "application/vnd.epson.msf": {
    source: "iana",
    extensions: [
      "msf"
    ]
  },
  "application/vnd.epson.quickanime": {
    source: "iana",
    extensions: [
      "qam"
    ]
  },
  "application/vnd.epson.salt": {
    source: "iana",
    extensions: [
      "slt"
    ]
  },
  "application/vnd.epson.ssf": {
    source: "iana",
    extensions: [
      "ssf"
    ]
  },
  "application/vnd.ericsson.quickcall": {
    source: "iana"
  },
  "application/vnd.espass-espass+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.eszigno3+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "es3",
      "et3"
    ]
  },
  "application/vnd.etsi.aoc+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.asic-e+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.etsi.asic-s+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.etsi.cug+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvcommand+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvdiscovery+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvprofile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvsad-bc+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvsad-cod+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvsad-npvr+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvservice+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvsync+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.iptvueprofile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.mcid+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.mheg5": {
    source: "iana"
  },
  "application/vnd.etsi.overload-control-policy-dataset+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.pstn+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.sci+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.simservs+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.timestamp-token": {
    source: "iana"
  },
  "application/vnd.etsi.tsl+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.etsi.tsl.der": {
    source: "iana"
  },
  "application/vnd.eu.kasparian.car+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.eudora.data": {
    source: "iana"
  },
  "application/vnd.evolv.ecig.profile": {
    source: "iana"
  },
  "application/vnd.evolv.ecig.settings": {
    source: "iana"
  },
  "application/vnd.evolv.ecig.theme": {
    source: "iana"
  },
  "application/vnd.exstream-empower+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.exstream-package": {
    source: "iana"
  },
  "application/vnd.ezpix-album": {
    source: "iana",
    extensions: [
      "ez2"
    ]
  },
  "application/vnd.ezpix-package": {
    source: "iana",
    extensions: [
      "ez3"
    ]
  },
  "application/vnd.f-secure.mobile": {
    source: "iana"
  },
  "application/vnd.familysearch.gedcom+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.fastcopy-disk-image": {
    source: "iana"
  },
  "application/vnd.fdf": {
    source: "iana",
    extensions: [
      "fdf"
    ]
  },
  "application/vnd.fdsn.mseed": {
    source: "iana",
    extensions: [
      "mseed"
    ]
  },
  "application/vnd.fdsn.seed": {
    source: "iana",
    extensions: [
      "seed",
      "dataless"
    ]
  },
  "application/vnd.ffsns": {
    source: "iana"
  },
  "application/vnd.ficlab.flb+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.filmit.zfc": {
    source: "iana"
  },
  "application/vnd.fints": {
    source: "iana"
  },
  "application/vnd.firemonkeys.cloudcell": {
    source: "iana"
  },
  "application/vnd.flographit": {
    source: "iana",
    extensions: [
      "gph"
    ]
  },
  "application/vnd.fluxtime.clip": {
    source: "iana",
    extensions: [
      "ftc"
    ]
  },
  "application/vnd.font-fontforge-sfd": {
    source: "iana"
  },
  "application/vnd.framemaker": {
    source: "iana",
    extensions: [
      "fm",
      "frame",
      "maker",
      "book"
    ]
  },
  "application/vnd.frogans.fnc": {
    source: "iana",
    extensions: [
      "fnc"
    ]
  },
  "application/vnd.frogans.ltf": {
    source: "iana",
    extensions: [
      "ltf"
    ]
  },
  "application/vnd.fsc.weblaunch": {
    source: "iana",
    extensions: [
      "fsc"
    ]
  },
  "application/vnd.fujifilm.fb.docuworks": {
    source: "iana"
  },
  "application/vnd.fujifilm.fb.docuworks.binder": {
    source: "iana"
  },
  "application/vnd.fujifilm.fb.docuworks.container": {
    source: "iana"
  },
  "application/vnd.fujifilm.fb.jfi+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.fujitsu.oasys": {
    source: "iana",
    extensions: [
      "oas"
    ]
  },
  "application/vnd.fujitsu.oasys2": {
    source: "iana",
    extensions: [
      "oa2"
    ]
  },
  "application/vnd.fujitsu.oasys3": {
    source: "iana",
    extensions: [
      "oa3"
    ]
  },
  "application/vnd.fujitsu.oasysgp": {
    source: "iana",
    extensions: [
      "fg5"
    ]
  },
  "application/vnd.fujitsu.oasysprs": {
    source: "iana",
    extensions: [
      "bh2"
    ]
  },
  "application/vnd.fujixerox.art-ex": {
    source: "iana"
  },
  "application/vnd.fujixerox.art4": {
    source: "iana"
  },
  "application/vnd.fujixerox.ddd": {
    source: "iana",
    extensions: [
      "ddd"
    ]
  },
  "application/vnd.fujixerox.docuworks": {
    source: "iana",
    extensions: [
      "xdw"
    ]
  },
  "application/vnd.fujixerox.docuworks.binder": {
    source: "iana",
    extensions: [
      "xbd"
    ]
  },
  "application/vnd.fujixerox.docuworks.container": {
    source: "iana"
  },
  "application/vnd.fujixerox.hbpl": {
    source: "iana"
  },
  "application/vnd.fut-misnet": {
    source: "iana"
  },
  "application/vnd.futoin+cbor": {
    source: "iana"
  },
  "application/vnd.futoin+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.fuzzysheet": {
    source: "iana",
    extensions: [
      "fzs"
    ]
  },
  "application/vnd.genomatix.tuxedo": {
    source: "iana",
    extensions: [
      "txd"
    ]
  },
  "application/vnd.gentics.grd+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.geo+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.geocube+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.geogebra.file": {
    source: "iana",
    extensions: [
      "ggb"
    ]
  },
  "application/vnd.geogebra.slides": {
    source: "iana"
  },
  "application/vnd.geogebra.tool": {
    source: "iana",
    extensions: [
      "ggt"
    ]
  },
  "application/vnd.geometry-explorer": {
    source: "iana",
    extensions: [
      "gex",
      "gre"
    ]
  },
  "application/vnd.geonext": {
    source: "iana",
    extensions: [
      "gxt"
    ]
  },
  "application/vnd.geoplan": {
    source: "iana",
    extensions: [
      "g2w"
    ]
  },
  "application/vnd.geospace": {
    source: "iana",
    extensions: [
      "g3w"
    ]
  },
  "application/vnd.gerber": {
    source: "iana"
  },
  "application/vnd.globalplatform.card-content-mgt": {
    source: "iana"
  },
  "application/vnd.globalplatform.card-content-mgt-response": {
    source: "iana"
  },
  "application/vnd.gmx": {
    source: "iana",
    extensions: [
      "gmx"
    ]
  },
  "application/vnd.google-apps.document": {
    compressible: !1,
    extensions: [
      "gdoc"
    ]
  },
  "application/vnd.google-apps.presentation": {
    compressible: !1,
    extensions: [
      "gslides"
    ]
  },
  "application/vnd.google-apps.spreadsheet": {
    compressible: !1,
    extensions: [
      "gsheet"
    ]
  },
  "application/vnd.google-earth.kml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "kml"
    ]
  },
  "application/vnd.google-earth.kmz": {
    source: "iana",
    compressible: !1,
    extensions: [
      "kmz"
    ]
  },
  "application/vnd.gov.sk.e-form+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.gov.sk.e-form+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.gov.sk.xmldatacontainer+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.grafeq": {
    source: "iana",
    extensions: [
      "gqf",
      "gqs"
    ]
  },
  "application/vnd.gridmp": {
    source: "iana"
  },
  "application/vnd.groove-account": {
    source: "iana",
    extensions: [
      "gac"
    ]
  },
  "application/vnd.groove-help": {
    source: "iana",
    extensions: [
      "ghf"
    ]
  },
  "application/vnd.groove-identity-message": {
    source: "iana",
    extensions: [
      "gim"
    ]
  },
  "application/vnd.groove-injector": {
    source: "iana",
    extensions: [
      "grv"
    ]
  },
  "application/vnd.groove-tool-message": {
    source: "iana",
    extensions: [
      "gtm"
    ]
  },
  "application/vnd.groove-tool-template": {
    source: "iana",
    extensions: [
      "tpl"
    ]
  },
  "application/vnd.groove-vcard": {
    source: "iana",
    extensions: [
      "vcg"
    ]
  },
  "application/vnd.hal+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.hal+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "hal"
    ]
  },
  "application/vnd.handheld-entertainment+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "zmm"
    ]
  },
  "application/vnd.hbci": {
    source: "iana",
    extensions: [
      "hbci"
    ]
  },
  "application/vnd.hc+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.hcl-bireports": {
    source: "iana"
  },
  "application/vnd.hdt": {
    source: "iana"
  },
  "application/vnd.heroku+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.hhe.lesson-player": {
    source: "iana",
    extensions: [
      "les"
    ]
  },
  "application/vnd.hl7cda+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/vnd.hl7v2+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/vnd.hp-hpgl": {
    source: "iana",
    extensions: [
      "hpgl"
    ]
  },
  "application/vnd.hp-hpid": {
    source: "iana",
    extensions: [
      "hpid"
    ]
  },
  "application/vnd.hp-hps": {
    source: "iana",
    extensions: [
      "hps"
    ]
  },
  "application/vnd.hp-jlyt": {
    source: "iana",
    extensions: [
      "jlt"
    ]
  },
  "application/vnd.hp-pcl": {
    source: "iana",
    extensions: [
      "pcl"
    ]
  },
  "application/vnd.hp-pclxl": {
    source: "iana",
    extensions: [
      "pclxl"
    ]
  },
  "application/vnd.httphone": {
    source: "iana"
  },
  "application/vnd.hydrostatix.sof-data": {
    source: "iana",
    extensions: [
      "sfd-hdstx"
    ]
  },
  "application/vnd.hyper+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.hyper-item+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.hyperdrive+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.hzn-3d-crossword": {
    source: "iana"
  },
  "application/vnd.ibm.afplinedata": {
    source: "iana"
  },
  "application/vnd.ibm.electronic-media": {
    source: "iana"
  },
  "application/vnd.ibm.minipay": {
    source: "iana",
    extensions: [
      "mpy"
    ]
  },
  "application/vnd.ibm.modcap": {
    source: "iana",
    extensions: [
      "afp",
      "listafp",
      "list3820"
    ]
  },
  "application/vnd.ibm.rights-management": {
    source: "iana",
    extensions: [
      "irm"
    ]
  },
  "application/vnd.ibm.secure-container": {
    source: "iana",
    extensions: [
      "sc"
    ]
  },
  "application/vnd.iccprofile": {
    source: "iana",
    extensions: [
      "icc",
      "icm"
    ]
  },
  "application/vnd.ieee.1905": {
    source: "iana"
  },
  "application/vnd.igloader": {
    source: "iana",
    extensions: [
      "igl"
    ]
  },
  "application/vnd.imagemeter.folder+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.imagemeter.image+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.immervision-ivp": {
    source: "iana",
    extensions: [
      "ivp"
    ]
  },
  "application/vnd.immervision-ivu": {
    source: "iana",
    extensions: [
      "ivu"
    ]
  },
  "application/vnd.ims.imsccv1p1": {
    source: "iana"
  },
  "application/vnd.ims.imsccv1p2": {
    source: "iana"
  },
  "application/vnd.ims.imsccv1p3": {
    source: "iana"
  },
  "application/vnd.ims.lis.v2.result+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ims.lti.v2.toolconsumerprofile+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ims.lti.v2.toolproxy+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ims.lti.v2.toolproxy.id+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ims.lti.v2.toolsettings+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ims.lti.v2.toolsettings.simple+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.informedcontrol.rms+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.informix-visionary": {
    source: "iana"
  },
  "application/vnd.infotech.project": {
    source: "iana"
  },
  "application/vnd.infotech.project+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.innopath.wamp.notification": {
    source: "iana"
  },
  "application/vnd.insors.igm": {
    source: "iana",
    extensions: [
      "igm"
    ]
  },
  "application/vnd.intercon.formnet": {
    source: "iana",
    extensions: [
      "xpw",
      "xpx"
    ]
  },
  "application/vnd.intergeo": {
    source: "iana",
    extensions: [
      "i2g"
    ]
  },
  "application/vnd.intertrust.digibox": {
    source: "iana"
  },
  "application/vnd.intertrust.nncp": {
    source: "iana"
  },
  "application/vnd.intu.qbo": {
    source: "iana",
    extensions: [
      "qbo"
    ]
  },
  "application/vnd.intu.qfx": {
    source: "iana",
    extensions: [
      "qfx"
    ]
  },
  "application/vnd.iptc.g2.catalogitem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.iptc.g2.conceptitem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.iptc.g2.knowledgeitem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.iptc.g2.newsitem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.iptc.g2.newsmessage+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.iptc.g2.packageitem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.iptc.g2.planningitem+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ipunplugged.rcprofile": {
    source: "iana",
    extensions: [
      "rcprofile"
    ]
  },
  "application/vnd.irepository.package+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "irp"
    ]
  },
  "application/vnd.is-xpr": {
    source: "iana",
    extensions: [
      "xpr"
    ]
  },
  "application/vnd.isac.fcs": {
    source: "iana",
    extensions: [
      "fcs"
    ]
  },
  "application/vnd.iso11783-10+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.jam": {
    source: "iana",
    extensions: [
      "jam"
    ]
  },
  "application/vnd.japannet-directory-service": {
    source: "iana"
  },
  "application/vnd.japannet-jpnstore-wakeup": {
    source: "iana"
  },
  "application/vnd.japannet-payment-wakeup": {
    source: "iana"
  },
  "application/vnd.japannet-registration": {
    source: "iana"
  },
  "application/vnd.japannet-registration-wakeup": {
    source: "iana"
  },
  "application/vnd.japannet-setstore-wakeup": {
    source: "iana"
  },
  "application/vnd.japannet-verification": {
    source: "iana"
  },
  "application/vnd.japannet-verification-wakeup": {
    source: "iana"
  },
  "application/vnd.jcp.javame.midlet-rms": {
    source: "iana",
    extensions: [
      "rms"
    ]
  },
  "application/vnd.jisp": {
    source: "iana",
    extensions: [
      "jisp"
    ]
  },
  "application/vnd.joost.joda-archive": {
    source: "iana",
    extensions: [
      "joda"
    ]
  },
  "application/vnd.jsk.isdn-ngn": {
    source: "iana"
  },
  "application/vnd.kahootz": {
    source: "iana",
    extensions: [
      "ktz",
      "ktr"
    ]
  },
  "application/vnd.kde.karbon": {
    source: "iana",
    extensions: [
      "karbon"
    ]
  },
  "application/vnd.kde.kchart": {
    source: "iana",
    extensions: [
      "chrt"
    ]
  },
  "application/vnd.kde.kformula": {
    source: "iana",
    extensions: [
      "kfo"
    ]
  },
  "application/vnd.kde.kivio": {
    source: "iana",
    extensions: [
      "flw"
    ]
  },
  "application/vnd.kde.kontour": {
    source: "iana",
    extensions: [
      "kon"
    ]
  },
  "application/vnd.kde.kpresenter": {
    source: "iana",
    extensions: [
      "kpr",
      "kpt"
    ]
  },
  "application/vnd.kde.kspread": {
    source: "iana",
    extensions: [
      "ksp"
    ]
  },
  "application/vnd.kde.kword": {
    source: "iana",
    extensions: [
      "kwd",
      "kwt"
    ]
  },
  "application/vnd.kenameaapp": {
    source: "iana",
    extensions: [
      "htke"
    ]
  },
  "application/vnd.kidspiration": {
    source: "iana",
    extensions: [
      "kia"
    ]
  },
  "application/vnd.kinar": {
    source: "iana",
    extensions: [
      "kne",
      "knp"
    ]
  },
  "application/vnd.koan": {
    source: "iana",
    extensions: [
      "skp",
      "skd",
      "skt",
      "skm"
    ]
  },
  "application/vnd.kodak-descriptor": {
    source: "iana",
    extensions: [
      "sse"
    ]
  },
  "application/vnd.las": {
    source: "iana"
  },
  "application/vnd.las.las+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.las.las+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "lasxml"
    ]
  },
  "application/vnd.laszip": {
    source: "iana"
  },
  "application/vnd.leap+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.liberty-request+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.llamagraphics.life-balance.desktop": {
    source: "iana",
    extensions: [
      "lbd"
    ]
  },
  "application/vnd.llamagraphics.life-balance.exchange+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "lbe"
    ]
  },
  "application/vnd.logipipe.circuit+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.loom": {
    source: "iana"
  },
  "application/vnd.lotus-1-2-3": {
    source: "iana",
    extensions: [
      "123"
    ]
  },
  "application/vnd.lotus-approach": {
    source: "iana",
    extensions: [
      "apr"
    ]
  },
  "application/vnd.lotus-freelance": {
    source: "iana",
    extensions: [
      "pre"
    ]
  },
  "application/vnd.lotus-notes": {
    source: "iana",
    extensions: [
      "nsf"
    ]
  },
  "application/vnd.lotus-organizer": {
    source: "iana",
    extensions: [
      "org"
    ]
  },
  "application/vnd.lotus-screencam": {
    source: "iana",
    extensions: [
      "scm"
    ]
  },
  "application/vnd.lotus-wordpro": {
    source: "iana",
    extensions: [
      "lwp"
    ]
  },
  "application/vnd.macports.portpkg": {
    source: "iana",
    extensions: [
      "portpkg"
    ]
  },
  "application/vnd.mapbox-vector-tile": {
    source: "iana",
    extensions: [
      "mvt"
    ]
  },
  "application/vnd.marlin.drm.actiontoken+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.marlin.drm.conftoken+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.marlin.drm.license+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.marlin.drm.mdcf": {
    source: "iana"
  },
  "application/vnd.mason+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.maxar.archive.3tz+zip": {
    source: "iana",
    compressible: !1
  },
  "application/vnd.maxmind.maxmind-db": {
    source: "iana"
  },
  "application/vnd.mcd": {
    source: "iana",
    extensions: [
      "mcd"
    ]
  },
  "application/vnd.medcalcdata": {
    source: "iana",
    extensions: [
      "mc1"
    ]
  },
  "application/vnd.mediastation.cdkey": {
    source: "iana",
    extensions: [
      "cdkey"
    ]
  },
  "application/vnd.meridian-slingshot": {
    source: "iana"
  },
  "application/vnd.mfer": {
    source: "iana",
    extensions: [
      "mwf"
    ]
  },
  "application/vnd.mfmp": {
    source: "iana",
    extensions: [
      "mfm"
    ]
  },
  "application/vnd.micro+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.micrografx.flo": {
    source: "iana",
    extensions: [
      "flo"
    ]
  },
  "application/vnd.micrografx.igx": {
    source: "iana",
    extensions: [
      "igx"
    ]
  },
  "application/vnd.microsoft.portable-executable": {
    source: "iana"
  },
  "application/vnd.microsoft.windows.thumbnail-cache": {
    source: "iana"
  },
  "application/vnd.miele+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.mif": {
    source: "iana",
    extensions: [
      "mif"
    ]
  },
  "application/vnd.minisoft-hp3000-save": {
    source: "iana"
  },
  "application/vnd.mitsubishi.misty-guard.trustweb": {
    source: "iana"
  },
  "application/vnd.mobius.daf": {
    source: "iana",
    extensions: [
      "daf"
    ]
  },
  "application/vnd.mobius.dis": {
    source: "iana",
    extensions: [
      "dis"
    ]
  },
  "application/vnd.mobius.mbk": {
    source: "iana",
    extensions: [
      "mbk"
    ]
  },
  "application/vnd.mobius.mqy": {
    source: "iana",
    extensions: [
      "mqy"
    ]
  },
  "application/vnd.mobius.msl": {
    source: "iana",
    extensions: [
      "msl"
    ]
  },
  "application/vnd.mobius.plc": {
    source: "iana",
    extensions: [
      "plc"
    ]
  },
  "application/vnd.mobius.txf": {
    source: "iana",
    extensions: [
      "txf"
    ]
  },
  "application/vnd.mophun.application": {
    source: "iana",
    extensions: [
      "mpn"
    ]
  },
  "application/vnd.mophun.certificate": {
    source: "iana",
    extensions: [
      "mpc"
    ]
  },
  "application/vnd.motorola.flexsuite": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.adsi": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.fis": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.gotap": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.kmr": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.ttc": {
    source: "iana"
  },
  "application/vnd.motorola.flexsuite.wem": {
    source: "iana"
  },
  "application/vnd.motorola.iprm": {
    source: "iana"
  },
  "application/vnd.mozilla.xul+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xul"
    ]
  },
  "application/vnd.ms-3mfdocument": {
    source: "iana"
  },
  "application/vnd.ms-artgalry": {
    source: "iana",
    extensions: [
      "cil"
    ]
  },
  "application/vnd.ms-asf": {
    source: "iana"
  },
  "application/vnd.ms-cab-compressed": {
    source: "iana",
    extensions: [
      "cab"
    ]
  },
  "application/vnd.ms-color.iccprofile": {
    source: "apache"
  },
  "application/vnd.ms-excel": {
    source: "iana",
    compressible: !1,
    extensions: [
      "xls",
      "xlm",
      "xla",
      "xlc",
      "xlt",
      "xlw"
    ]
  },
  "application/vnd.ms-excel.addin.macroenabled.12": {
    source: "iana",
    extensions: [
      "xlam"
    ]
  },
  "application/vnd.ms-excel.sheet.binary.macroenabled.12": {
    source: "iana",
    extensions: [
      "xlsb"
    ]
  },
  "application/vnd.ms-excel.sheet.macroenabled.12": {
    source: "iana",
    extensions: [
      "xlsm"
    ]
  },
  "application/vnd.ms-excel.template.macroenabled.12": {
    source: "iana",
    extensions: [
      "xltm"
    ]
  },
  "application/vnd.ms-fontobject": {
    source: "iana",
    compressible: !0,
    extensions: [
      "eot"
    ]
  },
  "application/vnd.ms-htmlhelp": {
    source: "iana",
    extensions: [
      "chm"
    ]
  },
  "application/vnd.ms-ims": {
    source: "iana",
    extensions: [
      "ims"
    ]
  },
  "application/vnd.ms-lrm": {
    source: "iana",
    extensions: [
      "lrm"
    ]
  },
  "application/vnd.ms-office.activex+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ms-officetheme": {
    source: "iana",
    extensions: [
      "thmx"
    ]
  },
  "application/vnd.ms-opentype": {
    source: "apache",
    compressible: !0
  },
  "application/vnd.ms-outlook": {
    compressible: !1,
    extensions: [
      "msg"
    ]
  },
  "application/vnd.ms-package.obfuscated-opentype": {
    source: "apache"
  },
  "application/vnd.ms-pki.seccat": {
    source: "apache",
    extensions: [
      "cat"
    ]
  },
  "application/vnd.ms-pki.stl": {
    source: "apache",
    extensions: [
      "stl"
    ]
  },
  "application/vnd.ms-playready.initiator+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ms-powerpoint": {
    source: "iana",
    compressible: !1,
    extensions: [
      "ppt",
      "pps",
      "pot"
    ]
  },
  "application/vnd.ms-powerpoint.addin.macroenabled.12": {
    source: "iana",
    extensions: [
      "ppam"
    ]
  },
  "application/vnd.ms-powerpoint.presentation.macroenabled.12": {
    source: "iana",
    extensions: [
      "pptm"
    ]
  },
  "application/vnd.ms-powerpoint.slide.macroenabled.12": {
    source: "iana",
    extensions: [
      "sldm"
    ]
  },
  "application/vnd.ms-powerpoint.slideshow.macroenabled.12": {
    source: "iana",
    extensions: [
      "ppsm"
    ]
  },
  "application/vnd.ms-powerpoint.template.macroenabled.12": {
    source: "iana",
    extensions: [
      "potm"
    ]
  },
  "application/vnd.ms-printdevicecapabilities+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ms-printing.printticket+xml": {
    source: "apache",
    compressible: !0
  },
  "application/vnd.ms-printschematicket+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ms-project": {
    source: "iana",
    extensions: [
      "mpp",
      "mpt"
    ]
  },
  "application/vnd.ms-tnef": {
    source: "iana"
  },
  "application/vnd.ms-windows.devicepairing": {
    source: "iana"
  },
  "application/vnd.ms-windows.nwprinting.oob": {
    source: "iana"
  },
  "application/vnd.ms-windows.printerpairing": {
    source: "iana"
  },
  "application/vnd.ms-windows.wsd.oob": {
    source: "iana"
  },
  "application/vnd.ms-wmdrm.lic-chlg-req": {
    source: "iana"
  },
  "application/vnd.ms-wmdrm.lic-resp": {
    source: "iana"
  },
  "application/vnd.ms-wmdrm.meter-chlg-req": {
    source: "iana"
  },
  "application/vnd.ms-wmdrm.meter-resp": {
    source: "iana"
  },
  "application/vnd.ms-word.document.macroenabled.12": {
    source: "iana",
    extensions: [
      "docm"
    ]
  },
  "application/vnd.ms-word.template.macroenabled.12": {
    source: "iana",
    extensions: [
      "dotm"
    ]
  },
  "application/vnd.ms-works": {
    source: "iana",
    extensions: [
      "wps",
      "wks",
      "wcm",
      "wdb"
    ]
  },
  "application/vnd.ms-wpl": {
    source: "iana",
    extensions: [
      "wpl"
    ]
  },
  "application/vnd.ms-xpsdocument": {
    source: "iana",
    compressible: !1,
    extensions: [
      "xps"
    ]
  },
  "application/vnd.msa-disk-image": {
    source: "iana"
  },
  "application/vnd.mseq": {
    source: "iana",
    extensions: [
      "mseq"
    ]
  },
  "application/vnd.msign": {
    source: "iana"
  },
  "application/vnd.multiad.creator": {
    source: "iana"
  },
  "application/vnd.multiad.creator.cif": {
    source: "iana"
  },
  "application/vnd.music-niff": {
    source: "iana"
  },
  "application/vnd.musician": {
    source: "iana",
    extensions: [
      "mus"
    ]
  },
  "application/vnd.muvee.style": {
    source: "iana",
    extensions: [
      "msty"
    ]
  },
  "application/vnd.mynfc": {
    source: "iana",
    extensions: [
      "taglet"
    ]
  },
  "application/vnd.nacamar.ybrid+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.ncd.control": {
    source: "iana"
  },
  "application/vnd.ncd.reference": {
    source: "iana"
  },
  "application/vnd.nearst.inv+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.nebumind.line": {
    source: "iana"
  },
  "application/vnd.nervana": {
    source: "iana"
  },
  "application/vnd.netfpx": {
    source: "iana"
  },
  "application/vnd.neurolanguage.nlu": {
    source: "iana",
    extensions: [
      "nlu"
    ]
  },
  "application/vnd.nimn": {
    source: "iana"
  },
  "application/vnd.nintendo.nitro.rom": {
    source: "iana"
  },
  "application/vnd.nintendo.snes.rom": {
    source: "iana"
  },
  "application/vnd.nitf": {
    source: "iana",
    extensions: [
      "ntf",
      "nitf"
    ]
  },
  "application/vnd.noblenet-directory": {
    source: "iana",
    extensions: [
      "nnd"
    ]
  },
  "application/vnd.noblenet-sealer": {
    source: "iana",
    extensions: [
      "nns"
    ]
  },
  "application/vnd.noblenet-web": {
    source: "iana",
    extensions: [
      "nnw"
    ]
  },
  "application/vnd.nokia.catalogs": {
    source: "iana"
  },
  "application/vnd.nokia.conml+wbxml": {
    source: "iana"
  },
  "application/vnd.nokia.conml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.nokia.iptv.config+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.nokia.isds-radio-presets": {
    source: "iana"
  },
  "application/vnd.nokia.landmark+wbxml": {
    source: "iana"
  },
  "application/vnd.nokia.landmark+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.nokia.landmarkcollection+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.nokia.n-gage.ac+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ac"
    ]
  },
  "application/vnd.nokia.n-gage.data": {
    source: "iana",
    extensions: [
      "ngdat"
    ]
  },
  "application/vnd.nokia.n-gage.symbian.install": {
    source: "iana",
    extensions: [
      "n-gage"
    ]
  },
  "application/vnd.nokia.ncd": {
    source: "iana"
  },
  "application/vnd.nokia.pcd+wbxml": {
    source: "iana"
  },
  "application/vnd.nokia.pcd+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.nokia.radio-preset": {
    source: "iana",
    extensions: [
      "rpst"
    ]
  },
  "application/vnd.nokia.radio-presets": {
    source: "iana",
    extensions: [
      "rpss"
    ]
  },
  "application/vnd.novadigm.edm": {
    source: "iana",
    extensions: [
      "edm"
    ]
  },
  "application/vnd.novadigm.edx": {
    source: "iana",
    extensions: [
      "edx"
    ]
  },
  "application/vnd.novadigm.ext": {
    source: "iana",
    extensions: [
      "ext"
    ]
  },
  "application/vnd.ntt-local.content-share": {
    source: "iana"
  },
  "application/vnd.ntt-local.file-transfer": {
    source: "iana"
  },
  "application/vnd.ntt-local.ogw_remote-access": {
    source: "iana"
  },
  "application/vnd.ntt-local.sip-ta_remote": {
    source: "iana"
  },
  "application/vnd.ntt-local.sip-ta_tcp_stream": {
    source: "iana"
  },
  "application/vnd.oasis.opendocument.chart": {
    source: "iana",
    extensions: [
      "odc"
    ]
  },
  "application/vnd.oasis.opendocument.chart-template": {
    source: "iana",
    extensions: [
      "otc"
    ]
  },
  "application/vnd.oasis.opendocument.database": {
    source: "iana",
    extensions: [
      "odb"
    ]
  },
  "application/vnd.oasis.opendocument.formula": {
    source: "iana",
    extensions: [
      "odf"
    ]
  },
  "application/vnd.oasis.opendocument.formula-template": {
    source: "iana",
    extensions: [
      "odft"
    ]
  },
  "application/vnd.oasis.opendocument.graphics": {
    source: "iana",
    compressible: !1,
    extensions: [
      "odg"
    ]
  },
  "application/vnd.oasis.opendocument.graphics-template": {
    source: "iana",
    extensions: [
      "otg"
    ]
  },
  "application/vnd.oasis.opendocument.image": {
    source: "iana",
    extensions: [
      "odi"
    ]
  },
  "application/vnd.oasis.opendocument.image-template": {
    source: "iana",
    extensions: [
      "oti"
    ]
  },
  "application/vnd.oasis.opendocument.presentation": {
    source: "iana",
    compressible: !1,
    extensions: [
      "odp"
    ]
  },
  "application/vnd.oasis.opendocument.presentation-template": {
    source: "iana",
    extensions: [
      "otp"
    ]
  },
  "application/vnd.oasis.opendocument.spreadsheet": {
    source: "iana",
    compressible: !1,
    extensions: [
      "ods"
    ]
  },
  "application/vnd.oasis.opendocument.spreadsheet-template": {
    source: "iana",
    extensions: [
      "ots"
    ]
  },
  "application/vnd.oasis.opendocument.text": {
    source: "iana",
    compressible: !1,
    extensions: [
      "odt"
    ]
  },
  "application/vnd.oasis.opendocument.text-master": {
    source: "iana",
    extensions: [
      "odm"
    ]
  },
  "application/vnd.oasis.opendocument.text-template": {
    source: "iana",
    extensions: [
      "ott"
    ]
  },
  "application/vnd.oasis.opendocument.text-web": {
    source: "iana",
    extensions: [
      "oth"
    ]
  },
  "application/vnd.obn": {
    source: "iana"
  },
  "application/vnd.ocf+cbor": {
    source: "iana"
  },
  "application/vnd.oci.image.manifest.v1+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oftn.l10n+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.contentaccessdownload+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.contentaccessstreaming+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.cspg-hexbinary": {
    source: "iana"
  },
  "application/vnd.oipf.dae.svg+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.dae.xhtml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.mippvcontrolmessage+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.pae.gem": {
    source: "iana"
  },
  "application/vnd.oipf.spdiscovery+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.spdlist+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.ueprofile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oipf.userprofile+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.olpc-sugar": {
    source: "iana",
    extensions: [
      "xo"
    ]
  },
  "application/vnd.oma-scws-config": {
    source: "iana"
  },
  "application/vnd.oma-scws-http-request": {
    source: "iana"
  },
  "application/vnd.oma-scws-http-response": {
    source: "iana"
  },
  "application/vnd.oma.bcast.associated-procedure-parameter+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.drm-trigger+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.imd+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.ltkm": {
    source: "iana"
  },
  "application/vnd.oma.bcast.notification+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.provisioningtrigger": {
    source: "iana"
  },
  "application/vnd.oma.bcast.sgboot": {
    source: "iana"
  },
  "application/vnd.oma.bcast.sgdd+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.sgdu": {
    source: "iana"
  },
  "application/vnd.oma.bcast.simple-symbol-container": {
    source: "iana"
  },
  "application/vnd.oma.bcast.smartcard-trigger+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.sprov+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.bcast.stkm": {
    source: "iana"
  },
  "application/vnd.oma.cab-address-book+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.cab-feature-handler+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.cab-pcc+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.cab-subs-invite+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.cab-user-prefs+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.dcd": {
    source: "iana"
  },
  "application/vnd.oma.dcdc": {
    source: "iana"
  },
  "application/vnd.oma.dd2+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "dd2"
    ]
  },
  "application/vnd.oma.drm.risd+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.group-usage-list+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.lwm2m+cbor": {
    source: "iana"
  },
  "application/vnd.oma.lwm2m+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.lwm2m+tlv": {
    source: "iana"
  },
  "application/vnd.oma.pal+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.poc.detailed-progress-report+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.poc.final-report+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.poc.groups+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.poc.invocation-descriptor+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.poc.optimized-progress-report+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.push": {
    source: "iana"
  },
  "application/vnd.oma.scidm.messages+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oma.xcap-directory+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.omads-email+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/vnd.omads-file+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/vnd.omads-folder+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/vnd.omaloc-supl-init": {
    source: "iana"
  },
  "application/vnd.onepager": {
    source: "iana"
  },
  "application/vnd.onepagertamp": {
    source: "iana"
  },
  "application/vnd.onepagertamx": {
    source: "iana"
  },
  "application/vnd.onepagertat": {
    source: "iana"
  },
  "application/vnd.onepagertatp": {
    source: "iana"
  },
  "application/vnd.onepagertatx": {
    source: "iana"
  },
  "application/vnd.openblox.game+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "obgx"
    ]
  },
  "application/vnd.openblox.game-binary": {
    source: "iana"
  },
  "application/vnd.openeye.oeb": {
    source: "iana"
  },
  "application/vnd.openofficeorg.extension": {
    source: "apache",
    extensions: [
      "oxt"
    ]
  },
  "application/vnd.openstreetmap.data+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "osm"
    ]
  },
  "application/vnd.opentimestamps.ots": {
    source: "iana"
  },
  "application/vnd.openxmlformats-officedocument.custom-properties+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.customxmlproperties+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawing+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawingml.chart+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramcolors+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramdata+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramlayout+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.drawingml.diagramstyle+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.extended-properties+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.commentauthors+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.comments+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.handoutmaster+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.notesmaster+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.notesslide+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    source: "iana",
    compressible: !1,
    extensions: [
      "pptx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.presprops+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slide": {
    source: "iana",
    extensions: [
      "sldx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slide+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slidelayout+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slidemaster+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow": {
    source: "iana",
    extensions: [
      "ppsx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.slideupdateinfo+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.tablestyles+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.tags+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.template": {
    source: "iana",
    extensions: [
      "potx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.presentationml.viewprops+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.calcchain+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.chartsheet+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.comments+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.connections+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.dialogsheet+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.externallink+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcachedefinition+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotcacherecords+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.pivottable+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.querytable+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionheaders+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.revisionlog+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sharedstrings+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    source: "iana",
    compressible: !1,
    extensions: [
      "xlsx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheetmetadata+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.table+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.tablesinglecells+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template": {
    source: "iana",
    extensions: [
      "xltx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.usernames+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.volatiledependencies+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.theme+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.themeoverride+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.vmldrawing": {
    source: "iana"
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    source: "iana",
    compressible: !1,
    extensions: [
      "docx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.glossary+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.endnotes+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.fonttable+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template": {
    source: "iana",
    extensions: [
      "dotx"
    ]
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.websettings+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-package.core-properties+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.openxmlformats-package.relationships+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oracle.resource+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.orange.indata": {
    source: "iana"
  },
  "application/vnd.osa.netdeploy": {
    source: "iana"
  },
  "application/vnd.osgeo.mapguide.package": {
    source: "iana",
    extensions: [
      "mgp"
    ]
  },
  "application/vnd.osgi.bundle": {
    source: "iana"
  },
  "application/vnd.osgi.dp": {
    source: "iana",
    extensions: [
      "dp"
    ]
  },
  "application/vnd.osgi.subsystem": {
    source: "iana",
    extensions: [
      "esa"
    ]
  },
  "application/vnd.otps.ct-kip+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.oxli.countgraph": {
    source: "iana"
  },
  "application/vnd.pagerduty+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.palm": {
    source: "iana",
    extensions: [
      "pdb",
      "pqa",
      "oprc"
    ]
  },
  "application/vnd.panoply": {
    source: "iana"
  },
  "application/vnd.paos.xml": {
    source: "iana"
  },
  "application/vnd.patentdive": {
    source: "iana"
  },
  "application/vnd.patientecommsdoc": {
    source: "iana"
  },
  "application/vnd.pawaafile": {
    source: "iana",
    extensions: [
      "paw"
    ]
  },
  "application/vnd.pcos": {
    source: "iana"
  },
  "application/vnd.pg.format": {
    source: "iana",
    extensions: [
      "str"
    ]
  },
  "application/vnd.pg.osasli": {
    source: "iana",
    extensions: [
      "ei6"
    ]
  },
  "application/vnd.piaccess.application-licence": {
    source: "iana"
  },
  "application/vnd.picsel": {
    source: "iana",
    extensions: [
      "efif"
    ]
  },
  "application/vnd.pmi.widget": {
    source: "iana",
    extensions: [
      "wg"
    ]
  },
  "application/vnd.poc.group-advertisement+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.pocketlearn": {
    source: "iana",
    extensions: [
      "plf"
    ]
  },
  "application/vnd.powerbuilder6": {
    source: "iana",
    extensions: [
      "pbd"
    ]
  },
  "application/vnd.powerbuilder6-s": {
    source: "iana"
  },
  "application/vnd.powerbuilder7": {
    source: "iana"
  },
  "application/vnd.powerbuilder7-s": {
    source: "iana"
  },
  "application/vnd.powerbuilder75": {
    source: "iana"
  },
  "application/vnd.powerbuilder75-s": {
    source: "iana"
  },
  "application/vnd.preminet": {
    source: "iana"
  },
  "application/vnd.previewsystems.box": {
    source: "iana",
    extensions: [
      "box"
    ]
  },
  "application/vnd.proteus.magazine": {
    source: "iana",
    extensions: [
      "mgz"
    ]
  },
  "application/vnd.psfs": {
    source: "iana"
  },
  "application/vnd.publishare-delta-tree": {
    source: "iana",
    extensions: [
      "qps"
    ]
  },
  "application/vnd.pvi.ptid1": {
    source: "iana",
    extensions: [
      "ptid"
    ]
  },
  "application/vnd.pwg-multiplexed": {
    source: "iana"
  },
  "application/vnd.pwg-xhtml-print+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.qualcomm.brew-app-res": {
    source: "iana"
  },
  "application/vnd.quarantainenet": {
    source: "iana"
  },
  "application/vnd.quark.quarkxpress": {
    source: "iana",
    extensions: [
      "qxd",
      "qxt",
      "qwd",
      "qwt",
      "qxl",
      "qxb"
    ]
  },
  "application/vnd.quobject-quoxdocument": {
    source: "iana"
  },
  "application/vnd.radisys.moml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-audit+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-audit-conf+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-audit-conn+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-audit-dialog+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-audit-stream+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-conf+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog-base+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog-fax-detect+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog-fax-sendrecv+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog-group+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog-speech+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.radisys.msml-dialog-transform+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.rainstor.data": {
    source: "iana"
  },
  "application/vnd.rapid": {
    source: "iana"
  },
  "application/vnd.rar": {
    source: "iana",
    extensions: [
      "rar"
    ]
  },
  "application/vnd.realvnc.bed": {
    source: "iana",
    extensions: [
      "bed"
    ]
  },
  "application/vnd.recordare.musicxml": {
    source: "iana",
    extensions: [
      "mxl"
    ]
  },
  "application/vnd.recordare.musicxml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "musicxml"
    ]
  },
  "application/vnd.renlearn.rlprint": {
    source: "iana"
  },
  "application/vnd.resilient.logic": {
    source: "iana"
  },
  "application/vnd.restful+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.rig.cryptonote": {
    source: "iana",
    extensions: [
      "cryptonote"
    ]
  },
  "application/vnd.rim.cod": {
    source: "apache",
    extensions: [
      "cod"
    ]
  },
  "application/vnd.rn-realmedia": {
    source: "apache",
    extensions: [
      "rm"
    ]
  },
  "application/vnd.rn-realmedia-vbr": {
    source: "apache",
    extensions: [
      "rmvb"
    ]
  },
  "application/vnd.route66.link66+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "link66"
    ]
  },
  "application/vnd.rs-274x": {
    source: "iana"
  },
  "application/vnd.ruckus.download": {
    source: "iana"
  },
  "application/vnd.s3sms": {
    source: "iana"
  },
  "application/vnd.sailingtracker.track": {
    source: "iana",
    extensions: [
      "st"
    ]
  },
  "application/vnd.sar": {
    source: "iana"
  },
  "application/vnd.sbm.cid": {
    source: "iana"
  },
  "application/vnd.sbm.mid2": {
    source: "iana"
  },
  "application/vnd.scribus": {
    source: "iana"
  },
  "application/vnd.sealed.3df": {
    source: "iana"
  },
  "application/vnd.sealed.csf": {
    source: "iana"
  },
  "application/vnd.sealed.doc": {
    source: "iana"
  },
  "application/vnd.sealed.eml": {
    source: "iana"
  },
  "application/vnd.sealed.mht": {
    source: "iana"
  },
  "application/vnd.sealed.net": {
    source: "iana"
  },
  "application/vnd.sealed.ppt": {
    source: "iana"
  },
  "application/vnd.sealed.tiff": {
    source: "iana"
  },
  "application/vnd.sealed.xls": {
    source: "iana"
  },
  "application/vnd.sealedmedia.softseal.html": {
    source: "iana"
  },
  "application/vnd.sealedmedia.softseal.pdf": {
    source: "iana"
  },
  "application/vnd.seemail": {
    source: "iana",
    extensions: [
      "see"
    ]
  },
  "application/vnd.seis+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.sema": {
    source: "iana",
    extensions: [
      "sema"
    ]
  },
  "application/vnd.semd": {
    source: "iana",
    extensions: [
      "semd"
    ]
  },
  "application/vnd.semf": {
    source: "iana",
    extensions: [
      "semf"
    ]
  },
  "application/vnd.shade-save-file": {
    source: "iana"
  },
  "application/vnd.shana.informed.formdata": {
    source: "iana",
    extensions: [
      "ifm"
    ]
  },
  "application/vnd.shana.informed.formtemplate": {
    source: "iana",
    extensions: [
      "itp"
    ]
  },
  "application/vnd.shana.informed.interchange": {
    source: "iana",
    extensions: [
      "iif"
    ]
  },
  "application/vnd.shana.informed.package": {
    source: "iana",
    extensions: [
      "ipk"
    ]
  },
  "application/vnd.shootproof+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.shopkick+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.shp": {
    source: "iana"
  },
  "application/vnd.shx": {
    source: "iana"
  },
  "application/vnd.sigrok.session": {
    source: "iana"
  },
  "application/vnd.simtech-mindmapper": {
    source: "iana",
    extensions: [
      "twd",
      "twds"
    ]
  },
  "application/vnd.siren+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.smaf": {
    source: "iana",
    extensions: [
      "mmf"
    ]
  },
  "application/vnd.smart.notebook": {
    source: "iana"
  },
  "application/vnd.smart.teacher": {
    source: "iana",
    extensions: [
      "teacher"
    ]
  },
  "application/vnd.snesdev-page-table": {
    source: "iana"
  },
  "application/vnd.software602.filler.form+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "fo"
    ]
  },
  "application/vnd.software602.filler.form-xml-zip": {
    source: "iana"
  },
  "application/vnd.solent.sdkm+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "sdkm",
      "sdkd"
    ]
  },
  "application/vnd.spotfire.dxp": {
    source: "iana",
    extensions: [
      "dxp"
    ]
  },
  "application/vnd.spotfire.sfs": {
    source: "iana",
    extensions: [
      "sfs"
    ]
  },
  "application/vnd.sqlite3": {
    source: "iana"
  },
  "application/vnd.sss-cod": {
    source: "iana"
  },
  "application/vnd.sss-dtf": {
    source: "iana"
  },
  "application/vnd.sss-ntf": {
    source: "iana"
  },
  "application/vnd.stardivision.calc": {
    source: "apache",
    extensions: [
      "sdc"
    ]
  },
  "application/vnd.stardivision.draw": {
    source: "apache",
    extensions: [
      "sda"
    ]
  },
  "application/vnd.stardivision.impress": {
    source: "apache",
    extensions: [
      "sdd"
    ]
  },
  "application/vnd.stardivision.math": {
    source: "apache",
    extensions: [
      "smf"
    ]
  },
  "application/vnd.stardivision.writer": {
    source: "apache",
    extensions: [
      "sdw",
      "vor"
    ]
  },
  "application/vnd.stardivision.writer-global": {
    source: "apache",
    extensions: [
      "sgl"
    ]
  },
  "application/vnd.stepmania.package": {
    source: "iana",
    extensions: [
      "smzip"
    ]
  },
  "application/vnd.stepmania.stepchart": {
    source: "iana",
    extensions: [
      "sm"
    ]
  },
  "application/vnd.street-stream": {
    source: "iana"
  },
  "application/vnd.sun.wadl+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "wadl"
    ]
  },
  "application/vnd.sun.xml.calc": {
    source: "apache",
    extensions: [
      "sxc"
    ]
  },
  "application/vnd.sun.xml.calc.template": {
    source: "apache",
    extensions: [
      "stc"
    ]
  },
  "application/vnd.sun.xml.draw": {
    source: "apache",
    extensions: [
      "sxd"
    ]
  },
  "application/vnd.sun.xml.draw.template": {
    source: "apache",
    extensions: [
      "std"
    ]
  },
  "application/vnd.sun.xml.impress": {
    source: "apache",
    extensions: [
      "sxi"
    ]
  },
  "application/vnd.sun.xml.impress.template": {
    source: "apache",
    extensions: [
      "sti"
    ]
  },
  "application/vnd.sun.xml.math": {
    source: "apache",
    extensions: [
      "sxm"
    ]
  },
  "application/vnd.sun.xml.writer": {
    source: "apache",
    extensions: [
      "sxw"
    ]
  },
  "application/vnd.sun.xml.writer.global": {
    source: "apache",
    extensions: [
      "sxg"
    ]
  },
  "application/vnd.sun.xml.writer.template": {
    source: "apache",
    extensions: [
      "stw"
    ]
  },
  "application/vnd.sus-calendar": {
    source: "iana",
    extensions: [
      "sus",
      "susp"
    ]
  },
  "application/vnd.svd": {
    source: "iana",
    extensions: [
      "svd"
    ]
  },
  "application/vnd.swiftview-ics": {
    source: "iana"
  },
  "application/vnd.sycle+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.syft+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.symbian.install": {
    source: "apache",
    extensions: [
      "sis",
      "sisx"
    ]
  },
  "application/vnd.syncml+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "xsm"
    ]
  },
  "application/vnd.syncml.dm+wbxml": {
    source: "iana",
    charset: "UTF-8",
    extensions: [
      "bdm"
    ]
  },
  "application/vnd.syncml.dm+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "xdm"
    ]
  },
  "application/vnd.syncml.dm.notification": {
    source: "iana"
  },
  "application/vnd.syncml.dmddf+wbxml": {
    source: "iana"
  },
  "application/vnd.syncml.dmddf+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "ddf"
    ]
  },
  "application/vnd.syncml.dmtnds+wbxml": {
    source: "iana"
  },
  "application/vnd.syncml.dmtnds+xml": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0
  },
  "application/vnd.syncml.ds.notification": {
    source: "iana"
  },
  "application/vnd.tableschema+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.tao.intent-module-archive": {
    source: "iana",
    extensions: [
      "tao"
    ]
  },
  "application/vnd.tcpdump.pcap": {
    source: "iana",
    extensions: [
      "pcap",
      "cap",
      "dmp"
    ]
  },
  "application/vnd.think-cell.ppttc+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.tmd.mediaflex.api+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.tml": {
    source: "iana"
  },
  "application/vnd.tmobile-livetv": {
    source: "iana",
    extensions: [
      "tmo"
    ]
  },
  "application/vnd.tri.onesource": {
    source: "iana"
  },
  "application/vnd.trid.tpt": {
    source: "iana",
    extensions: [
      "tpt"
    ]
  },
  "application/vnd.triscape.mxs": {
    source: "iana",
    extensions: [
      "mxs"
    ]
  },
  "application/vnd.trueapp": {
    source: "iana",
    extensions: [
      "tra"
    ]
  },
  "application/vnd.truedoc": {
    source: "iana"
  },
  "application/vnd.ubisoft.webplayer": {
    source: "iana"
  },
  "application/vnd.ufdl": {
    source: "iana",
    extensions: [
      "ufd",
      "ufdl"
    ]
  },
  "application/vnd.uiq.theme": {
    source: "iana",
    extensions: [
      "utz"
    ]
  },
  "application/vnd.umajin": {
    source: "iana",
    extensions: [
      "umj"
    ]
  },
  "application/vnd.unity": {
    source: "iana",
    extensions: [
      "unityweb"
    ]
  },
  "application/vnd.uoml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "uoml"
    ]
  },
  "application/vnd.uplanet.alert": {
    source: "iana"
  },
  "application/vnd.uplanet.alert-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.bearer-choice": {
    source: "iana"
  },
  "application/vnd.uplanet.bearer-choice-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.cacheop": {
    source: "iana"
  },
  "application/vnd.uplanet.cacheop-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.channel": {
    source: "iana"
  },
  "application/vnd.uplanet.channel-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.list": {
    source: "iana"
  },
  "application/vnd.uplanet.list-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.listcmd": {
    source: "iana"
  },
  "application/vnd.uplanet.listcmd-wbxml": {
    source: "iana"
  },
  "application/vnd.uplanet.signal": {
    source: "iana"
  },
  "application/vnd.uri-map": {
    source: "iana"
  },
  "application/vnd.valve.source.material": {
    source: "iana"
  },
  "application/vnd.vcx": {
    source: "iana",
    extensions: [
      "vcx"
    ]
  },
  "application/vnd.vd-study": {
    source: "iana"
  },
  "application/vnd.vectorworks": {
    source: "iana"
  },
  "application/vnd.vel+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.verimatrix.vcas": {
    source: "iana"
  },
  "application/vnd.veritone.aion+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.veryant.thin": {
    source: "iana"
  },
  "application/vnd.ves.encrypted": {
    source: "iana"
  },
  "application/vnd.vidsoft.vidconference": {
    source: "iana"
  },
  "application/vnd.visio": {
    source: "iana",
    extensions: [
      "vsd",
      "vst",
      "vss",
      "vsw"
    ]
  },
  "application/vnd.visionary": {
    source: "iana",
    extensions: [
      "vis"
    ]
  },
  "application/vnd.vividence.scriptfile": {
    source: "iana"
  },
  "application/vnd.vsf": {
    source: "iana",
    extensions: [
      "vsf"
    ]
  },
  "application/vnd.wap.sic": {
    source: "iana"
  },
  "application/vnd.wap.slc": {
    source: "iana"
  },
  "application/vnd.wap.wbxml": {
    source: "iana",
    charset: "UTF-8",
    extensions: [
      "wbxml"
    ]
  },
  "application/vnd.wap.wmlc": {
    source: "iana",
    extensions: [
      "wmlc"
    ]
  },
  "application/vnd.wap.wmlscriptc": {
    source: "iana",
    extensions: [
      "wmlsc"
    ]
  },
  "application/vnd.webturbo": {
    source: "iana",
    extensions: [
      "wtb"
    ]
  },
  "application/vnd.wfa.dpp": {
    source: "iana"
  },
  "application/vnd.wfa.p2p": {
    source: "iana"
  },
  "application/vnd.wfa.wsc": {
    source: "iana"
  },
  "application/vnd.windows.devicepairing": {
    source: "iana"
  },
  "application/vnd.wmc": {
    source: "iana"
  },
  "application/vnd.wmf.bootstrap": {
    source: "iana"
  },
  "application/vnd.wolfram.mathematica": {
    source: "iana"
  },
  "application/vnd.wolfram.mathematica.package": {
    source: "iana"
  },
  "application/vnd.wolfram.player": {
    source: "iana",
    extensions: [
      "nbp"
    ]
  },
  "application/vnd.wordperfect": {
    source: "iana",
    extensions: [
      "wpd"
    ]
  },
  "application/vnd.wqd": {
    source: "iana",
    extensions: [
      "wqd"
    ]
  },
  "application/vnd.wrq-hp3000-labelled": {
    source: "iana"
  },
  "application/vnd.wt.stf": {
    source: "iana",
    extensions: [
      "stf"
    ]
  },
  "application/vnd.wv.csp+wbxml": {
    source: "iana"
  },
  "application/vnd.wv.csp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.wv.ssp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.xacml+json": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.xara": {
    source: "iana",
    extensions: [
      "xar"
    ]
  },
  "application/vnd.xfdl": {
    source: "iana",
    extensions: [
      "xfdl"
    ]
  },
  "application/vnd.xfdl.webform": {
    source: "iana"
  },
  "application/vnd.xmi+xml": {
    source: "iana",
    compressible: !0
  },
  "application/vnd.xmpie.cpkg": {
    source: "iana"
  },
  "application/vnd.xmpie.dpkg": {
    source: "iana"
  },
  "application/vnd.xmpie.plan": {
    source: "iana"
  },
  "application/vnd.xmpie.ppkg": {
    source: "iana"
  },
  "application/vnd.xmpie.xlim": {
    source: "iana"
  },
  "application/vnd.yamaha.hv-dic": {
    source: "iana",
    extensions: [
      "hvd"
    ]
  },
  "application/vnd.yamaha.hv-script": {
    source: "iana",
    extensions: [
      "hvs"
    ]
  },
  "application/vnd.yamaha.hv-voice": {
    source: "iana",
    extensions: [
      "hvp"
    ]
  },
  "application/vnd.yamaha.openscoreformat": {
    source: "iana",
    extensions: [
      "osf"
    ]
  },
  "application/vnd.yamaha.openscoreformat.osfpvg+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "osfpvg"
    ]
  },
  "application/vnd.yamaha.remote-setup": {
    source: "iana"
  },
  "application/vnd.yamaha.smaf-audio": {
    source: "iana",
    extensions: [
      "saf"
    ]
  },
  "application/vnd.yamaha.smaf-phrase": {
    source: "iana",
    extensions: [
      "spf"
    ]
  },
  "application/vnd.yamaha.through-ngn": {
    source: "iana"
  },
  "application/vnd.yamaha.tunnel-udpencap": {
    source: "iana"
  },
  "application/vnd.yaoweme": {
    source: "iana"
  },
  "application/vnd.yellowriver-custom-menu": {
    source: "iana",
    extensions: [
      "cmp"
    ]
  },
  "application/vnd.youtube.yt": {
    source: "iana"
  },
  "application/vnd.zul": {
    source: "iana",
    extensions: [
      "zir",
      "zirz"
    ]
  },
  "application/vnd.zzazz.deck+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "zaz"
    ]
  },
  "application/voicexml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "vxml"
    ]
  },
  "application/voucher-cms+json": {
    source: "iana",
    compressible: !0
  },
  "application/vq-rtcpxr": {
    source: "iana"
  },
  "application/wasm": {
    source: "iana",
    compressible: !0,
    extensions: [
      "wasm"
    ]
  },
  "application/watcherinfo+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "wif"
    ]
  },
  "application/webpush-options+json": {
    source: "iana",
    compressible: !0
  },
  "application/whoispp-query": {
    source: "iana"
  },
  "application/whoispp-response": {
    source: "iana"
  },
  "application/widget": {
    source: "iana",
    extensions: [
      "wgt"
    ]
  },
  "application/winhlp": {
    source: "apache",
    extensions: [
      "hlp"
    ]
  },
  "application/wita": {
    source: "iana"
  },
  "application/wordperfect5.1": {
    source: "iana"
  },
  "application/wsdl+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "wsdl"
    ]
  },
  "application/wspolicy+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "wspolicy"
    ]
  },
  "application/x-7z-compressed": {
    source: "apache",
    compressible: !1,
    extensions: [
      "7z"
    ]
  },
  "application/x-abiword": {
    source: "apache",
    extensions: [
      "abw"
    ]
  },
  "application/x-ace-compressed": {
    source: "apache",
    extensions: [
      "ace"
    ]
  },
  "application/x-amf": {
    source: "apache"
  },
  "application/x-apple-diskimage": {
    source: "apache",
    extensions: [
      "dmg"
    ]
  },
  "application/x-arj": {
    compressible: !1,
    extensions: [
      "arj"
    ]
  },
  "application/x-authorware-bin": {
    source: "apache",
    extensions: [
      "aab",
      "x32",
      "u32",
      "vox"
    ]
  },
  "application/x-authorware-map": {
    source: "apache",
    extensions: [
      "aam"
    ]
  },
  "application/x-authorware-seg": {
    source: "apache",
    extensions: [
      "aas"
    ]
  },
  "application/x-bcpio": {
    source: "apache",
    extensions: [
      "bcpio"
    ]
  },
  "application/x-bdoc": {
    compressible: !1,
    extensions: [
      "bdoc"
    ]
  },
  "application/x-bittorrent": {
    source: "apache",
    extensions: [
      "torrent"
    ]
  },
  "application/x-blorb": {
    source: "apache",
    extensions: [
      "blb",
      "blorb"
    ]
  },
  "application/x-bzip": {
    source: "apache",
    compressible: !1,
    extensions: [
      "bz"
    ]
  },
  "application/x-bzip2": {
    source: "apache",
    compressible: !1,
    extensions: [
      "bz2",
      "boz"
    ]
  },
  "application/x-cbr": {
    source: "apache",
    extensions: [
      "cbr",
      "cba",
      "cbt",
      "cbz",
      "cb7"
    ]
  },
  "application/x-cdlink": {
    source: "apache",
    extensions: [
      "vcd"
    ]
  },
  "application/x-cfs-compressed": {
    source: "apache",
    extensions: [
      "cfs"
    ]
  },
  "application/x-chat": {
    source: "apache",
    extensions: [
      "chat"
    ]
  },
  "application/x-chess-pgn": {
    source: "apache",
    extensions: [
      "pgn"
    ]
  },
  "application/x-chrome-extension": {
    extensions: [
      "crx"
    ]
  },
  "application/x-cocoa": {
    source: "nginx",
    extensions: [
      "cco"
    ]
  },
  "application/x-compress": {
    source: "apache"
  },
  "application/x-conference": {
    source: "apache",
    extensions: [
      "nsc"
    ]
  },
  "application/x-cpio": {
    source: "apache",
    extensions: [
      "cpio"
    ]
  },
  "application/x-csh": {
    source: "apache",
    extensions: [
      "csh"
    ]
  },
  "application/x-deb": {
    compressible: !1
  },
  "application/x-debian-package": {
    source: "apache",
    extensions: [
      "deb",
      "udeb"
    ]
  },
  "application/x-dgc-compressed": {
    source: "apache",
    extensions: [
      "dgc"
    ]
  },
  "application/x-director": {
    source: "apache",
    extensions: [
      "dir",
      "dcr",
      "dxr",
      "cst",
      "cct",
      "cxt",
      "w3d",
      "fgd",
      "swa"
    ]
  },
  "application/x-doom": {
    source: "apache",
    extensions: [
      "wad"
    ]
  },
  "application/x-dtbncx+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "ncx"
    ]
  },
  "application/x-dtbook+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "dtb"
    ]
  },
  "application/x-dtbresource+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "res"
    ]
  },
  "application/x-dvi": {
    source: "apache",
    compressible: !1,
    extensions: [
      "dvi"
    ]
  },
  "application/x-envoy": {
    source: "apache",
    extensions: [
      "evy"
    ]
  },
  "application/x-eva": {
    source: "apache",
    extensions: [
      "eva"
    ]
  },
  "application/x-font-bdf": {
    source: "apache",
    extensions: [
      "bdf"
    ]
  },
  "application/x-font-dos": {
    source: "apache"
  },
  "application/x-font-framemaker": {
    source: "apache"
  },
  "application/x-font-ghostscript": {
    source: "apache",
    extensions: [
      "gsf"
    ]
  },
  "application/x-font-libgrx": {
    source: "apache"
  },
  "application/x-font-linux-psf": {
    source: "apache",
    extensions: [
      "psf"
    ]
  },
  "application/x-font-pcf": {
    source: "apache",
    extensions: [
      "pcf"
    ]
  },
  "application/x-font-snf": {
    source: "apache",
    extensions: [
      "snf"
    ]
  },
  "application/x-font-speedo": {
    source: "apache"
  },
  "application/x-font-sunos-news": {
    source: "apache"
  },
  "application/x-font-type1": {
    source: "apache",
    extensions: [
      "pfa",
      "pfb",
      "pfm",
      "afm"
    ]
  },
  "application/x-font-vfont": {
    source: "apache"
  },
  "application/x-freearc": {
    source: "apache",
    extensions: [
      "arc"
    ]
  },
  "application/x-futuresplash": {
    source: "apache",
    extensions: [
      "spl"
    ]
  },
  "application/x-gca-compressed": {
    source: "apache",
    extensions: [
      "gca"
    ]
  },
  "application/x-glulx": {
    source: "apache",
    extensions: [
      "ulx"
    ]
  },
  "application/x-gnumeric": {
    source: "apache",
    extensions: [
      "gnumeric"
    ]
  },
  "application/x-gramps-xml": {
    source: "apache",
    extensions: [
      "gramps"
    ]
  },
  "application/x-gtar": {
    source: "apache",
    extensions: [
      "gtar"
    ]
  },
  "application/x-gzip": {
    source: "apache"
  },
  "application/x-hdf": {
    source: "apache",
    extensions: [
      "hdf"
    ]
  },
  "application/x-httpd-php": {
    compressible: !0,
    extensions: [
      "php"
    ]
  },
  "application/x-install-instructions": {
    source: "apache",
    extensions: [
      "install"
    ]
  },
  "application/x-iso9660-image": {
    source: "apache",
    extensions: [
      "iso"
    ]
  },
  "application/x-iwork-keynote-sffkey": {
    extensions: [
      "key"
    ]
  },
  "application/x-iwork-numbers-sffnumbers": {
    extensions: [
      "numbers"
    ]
  },
  "application/x-iwork-pages-sffpages": {
    extensions: [
      "pages"
    ]
  },
  "application/x-java-archive-diff": {
    source: "nginx",
    extensions: [
      "jardiff"
    ]
  },
  "application/x-java-jnlp-file": {
    source: "apache",
    compressible: !1,
    extensions: [
      "jnlp"
    ]
  },
  "application/x-javascript": {
    compressible: !0
  },
  "application/x-keepass2": {
    extensions: [
      "kdbx"
    ]
  },
  "application/x-latex": {
    source: "apache",
    compressible: !1,
    extensions: [
      "latex"
    ]
  },
  "application/x-lua-bytecode": {
    extensions: [
      "luac"
    ]
  },
  "application/x-lzh-compressed": {
    source: "apache",
    extensions: [
      "lzh",
      "lha"
    ]
  },
  "application/x-makeself": {
    source: "nginx",
    extensions: [
      "run"
    ]
  },
  "application/x-mie": {
    source: "apache",
    extensions: [
      "mie"
    ]
  },
  "application/x-mobipocket-ebook": {
    source: "apache",
    extensions: [
      "prc",
      "mobi"
    ]
  },
  "application/x-mpegurl": {
    compressible: !1
  },
  "application/x-ms-application": {
    source: "apache",
    extensions: [
      "application"
    ]
  },
  "application/x-ms-shortcut": {
    source: "apache",
    extensions: [
      "lnk"
    ]
  },
  "application/x-ms-wmd": {
    source: "apache",
    extensions: [
      "wmd"
    ]
  },
  "application/x-ms-wmz": {
    source: "apache",
    extensions: [
      "wmz"
    ]
  },
  "application/x-ms-xbap": {
    source: "apache",
    extensions: [
      "xbap"
    ]
  },
  "application/x-msaccess": {
    source: "apache",
    extensions: [
      "mdb"
    ]
  },
  "application/x-msbinder": {
    source: "apache",
    extensions: [
      "obd"
    ]
  },
  "application/x-mscardfile": {
    source: "apache",
    extensions: [
      "crd"
    ]
  },
  "application/x-msclip": {
    source: "apache",
    extensions: [
      "clp"
    ]
  },
  "application/x-msdos-program": {
    extensions: [
      "exe"
    ]
  },
  "application/x-msdownload": {
    source: "apache",
    extensions: [
      "exe",
      "dll",
      "com",
      "bat",
      "msi"
    ]
  },
  "application/x-msmediaview": {
    source: "apache",
    extensions: [
      "mvb",
      "m13",
      "m14"
    ]
  },
  "application/x-msmetafile": {
    source: "apache",
    extensions: [
      "wmf",
      "wmz",
      "emf",
      "emz"
    ]
  },
  "application/x-msmoney": {
    source: "apache",
    extensions: [
      "mny"
    ]
  },
  "application/x-mspublisher": {
    source: "apache",
    extensions: [
      "pub"
    ]
  },
  "application/x-msschedule": {
    source: "apache",
    extensions: [
      "scd"
    ]
  },
  "application/x-msterminal": {
    source: "apache",
    extensions: [
      "trm"
    ]
  },
  "application/x-mswrite": {
    source: "apache",
    extensions: [
      "wri"
    ]
  },
  "application/x-netcdf": {
    source: "apache",
    extensions: [
      "nc",
      "cdf"
    ]
  },
  "application/x-ns-proxy-autoconfig": {
    compressible: !0,
    extensions: [
      "pac"
    ]
  },
  "application/x-nzb": {
    source: "apache",
    extensions: [
      "nzb"
    ]
  },
  "application/x-perl": {
    source: "nginx",
    extensions: [
      "pl",
      "pm"
    ]
  },
  "application/x-pilot": {
    source: "nginx",
    extensions: [
      "prc",
      "pdb"
    ]
  },
  "application/x-pkcs12": {
    source: "apache",
    compressible: !1,
    extensions: [
      "p12",
      "pfx"
    ]
  },
  "application/x-pkcs7-certificates": {
    source: "apache",
    extensions: [
      "p7b",
      "spc"
    ]
  },
  "application/x-pkcs7-certreqresp": {
    source: "apache",
    extensions: [
      "p7r"
    ]
  },
  "application/x-pki-message": {
    source: "iana"
  },
  "application/x-rar-compressed": {
    source: "apache",
    compressible: !1,
    extensions: [
      "rar"
    ]
  },
  "application/x-redhat-package-manager": {
    source: "nginx",
    extensions: [
      "rpm"
    ]
  },
  "application/x-research-info-systems": {
    source: "apache",
    extensions: [
      "ris"
    ]
  },
  "application/x-sea": {
    source: "nginx",
    extensions: [
      "sea"
    ]
  },
  "application/x-sh": {
    source: "apache",
    compressible: !0,
    extensions: [
      "sh"
    ]
  },
  "application/x-shar": {
    source: "apache",
    extensions: [
      "shar"
    ]
  },
  "application/x-shockwave-flash": {
    source: "apache",
    compressible: !1,
    extensions: [
      "swf"
    ]
  },
  "application/x-silverlight-app": {
    source: "apache",
    extensions: [
      "xap"
    ]
  },
  "application/x-sql": {
    source: "apache",
    extensions: [
      "sql"
    ]
  },
  "application/x-stuffit": {
    source: "apache",
    compressible: !1,
    extensions: [
      "sit"
    ]
  },
  "application/x-stuffitx": {
    source: "apache",
    extensions: [
      "sitx"
    ]
  },
  "application/x-subrip": {
    source: "apache",
    extensions: [
      "srt"
    ]
  },
  "application/x-sv4cpio": {
    source: "apache",
    extensions: [
      "sv4cpio"
    ]
  },
  "application/x-sv4crc": {
    source: "apache",
    extensions: [
      "sv4crc"
    ]
  },
  "application/x-t3vm-image": {
    source: "apache",
    extensions: [
      "t3"
    ]
  },
  "application/x-tads": {
    source: "apache",
    extensions: [
      "gam"
    ]
  },
  "application/x-tar": {
    source: "apache",
    compressible: !0,
    extensions: [
      "tar"
    ]
  },
  "application/x-tcl": {
    source: "apache",
    extensions: [
      "tcl",
      "tk"
    ]
  },
  "application/x-tex": {
    source: "apache",
    extensions: [
      "tex"
    ]
  },
  "application/x-tex-tfm": {
    source: "apache",
    extensions: [
      "tfm"
    ]
  },
  "application/x-texinfo": {
    source: "apache",
    extensions: [
      "texinfo",
      "texi"
    ]
  },
  "application/x-tgif": {
    source: "apache",
    extensions: [
      "obj"
    ]
  },
  "application/x-ustar": {
    source: "apache",
    extensions: [
      "ustar"
    ]
  },
  "application/x-virtualbox-hdd": {
    compressible: !0,
    extensions: [
      "hdd"
    ]
  },
  "application/x-virtualbox-ova": {
    compressible: !0,
    extensions: [
      "ova"
    ]
  },
  "application/x-virtualbox-ovf": {
    compressible: !0,
    extensions: [
      "ovf"
    ]
  },
  "application/x-virtualbox-vbox": {
    compressible: !0,
    extensions: [
      "vbox"
    ]
  },
  "application/x-virtualbox-vbox-extpack": {
    compressible: !1,
    extensions: [
      "vbox-extpack"
    ]
  },
  "application/x-virtualbox-vdi": {
    compressible: !0,
    extensions: [
      "vdi"
    ]
  },
  "application/x-virtualbox-vhd": {
    compressible: !0,
    extensions: [
      "vhd"
    ]
  },
  "application/x-virtualbox-vmdk": {
    compressible: !0,
    extensions: [
      "vmdk"
    ]
  },
  "application/x-wais-source": {
    source: "apache",
    extensions: [
      "src"
    ]
  },
  "application/x-web-app-manifest+json": {
    compressible: !0,
    extensions: [
      "webapp"
    ]
  },
  "application/x-www-form-urlencoded": {
    source: "iana",
    compressible: !0
  },
  "application/x-x509-ca-cert": {
    source: "iana",
    extensions: [
      "der",
      "crt",
      "pem"
    ]
  },
  "application/x-x509-ca-ra-cert": {
    source: "iana"
  },
  "application/x-x509-next-ca-cert": {
    source: "iana"
  },
  "application/x-xfig": {
    source: "apache",
    extensions: [
      "fig"
    ]
  },
  "application/x-xliff+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "xlf"
    ]
  },
  "application/x-xpinstall": {
    source: "apache",
    compressible: !1,
    extensions: [
      "xpi"
    ]
  },
  "application/x-xz": {
    source: "apache",
    extensions: [
      "xz"
    ]
  },
  "application/x-zmachine": {
    source: "apache",
    extensions: [
      "z1",
      "z2",
      "z3",
      "z4",
      "z5",
      "z6",
      "z7",
      "z8"
    ]
  },
  "application/x400-bp": {
    source: "iana"
  },
  "application/xacml+xml": {
    source: "iana",
    compressible: !0
  },
  "application/xaml+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "xaml"
    ]
  },
  "application/xcap-att+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xav"
    ]
  },
  "application/xcap-caps+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xca"
    ]
  },
  "application/xcap-diff+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xdf"
    ]
  },
  "application/xcap-el+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xel"
    ]
  },
  "application/xcap-error+xml": {
    source: "iana",
    compressible: !0
  },
  "application/xcap-ns+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xns"
    ]
  },
  "application/xcon-conference-info+xml": {
    source: "iana",
    compressible: !0
  },
  "application/xcon-conference-info-diff+xml": {
    source: "iana",
    compressible: !0
  },
  "application/xenc+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xenc"
    ]
  },
  "application/xhtml+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xhtml",
      "xht"
    ]
  },
  "application/xhtml-voice+xml": {
    source: "apache",
    compressible: !0
  },
  "application/xliff+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xlf"
    ]
  },
  "application/xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xml",
      "xsl",
      "xsd",
      "rng"
    ]
  },
  "application/xml-dtd": {
    source: "iana",
    compressible: !0,
    extensions: [
      "dtd"
    ]
  },
  "application/xml-external-parsed-entity": {
    source: "iana"
  },
  "application/xml-patch+xml": {
    source: "iana",
    compressible: !0
  },
  "application/xmpp+xml": {
    source: "iana",
    compressible: !0
  },
  "application/xop+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xop"
    ]
  },
  "application/xproc+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "xpl"
    ]
  },
  "application/xslt+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xsl",
      "xslt"
    ]
  },
  "application/xspf+xml": {
    source: "apache",
    compressible: !0,
    extensions: [
      "xspf"
    ]
  },
  "application/xv+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "mxml",
      "xhvml",
      "xvml",
      "xvm"
    ]
  },
  "application/yang": {
    source: "iana",
    extensions: [
      "yang"
    ]
  },
  "application/yang-data+json": {
    source: "iana",
    compressible: !0
  },
  "application/yang-data+xml": {
    source: "iana",
    compressible: !0
  },
  "application/yang-patch+json": {
    source: "iana",
    compressible: !0
  },
  "application/yang-patch+xml": {
    source: "iana",
    compressible: !0
  },
  "application/yin+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "yin"
    ]
  },
  "application/zip": {
    source: "iana",
    compressible: !1,
    extensions: [
      "zip"
    ]
  },
  "application/zlib": {
    source: "iana"
  },
  "application/zstd": {
    source: "iana"
  },
  "audio/1d-interleaved-parityfec": {
    source: "iana"
  },
  "audio/32kadpcm": {
    source: "iana"
  },
  "audio/3gpp": {
    source: "iana",
    compressible: !1,
    extensions: [
      "3gpp"
    ]
  },
  "audio/3gpp2": {
    source: "iana"
  },
  "audio/aac": {
    source: "iana"
  },
  "audio/ac3": {
    source: "iana"
  },
  "audio/adpcm": {
    source: "apache",
    extensions: [
      "adp"
    ]
  },
  "audio/amr": {
    source: "iana",
    extensions: [
      "amr"
    ]
  },
  "audio/amr-wb": {
    source: "iana"
  },
  "audio/amr-wb+": {
    source: "iana"
  },
  "audio/aptx": {
    source: "iana"
  },
  "audio/asc": {
    source: "iana"
  },
  "audio/atrac-advanced-lossless": {
    source: "iana"
  },
  "audio/atrac-x": {
    source: "iana"
  },
  "audio/atrac3": {
    source: "iana"
  },
  "audio/basic": {
    source: "iana",
    compressible: !1,
    extensions: [
      "au",
      "snd"
    ]
  },
  "audio/bv16": {
    source: "iana"
  },
  "audio/bv32": {
    source: "iana"
  },
  "audio/clearmode": {
    source: "iana"
  },
  "audio/cn": {
    source: "iana"
  },
  "audio/dat12": {
    source: "iana"
  },
  "audio/dls": {
    source: "iana"
  },
  "audio/dsr-es201108": {
    source: "iana"
  },
  "audio/dsr-es202050": {
    source: "iana"
  },
  "audio/dsr-es202211": {
    source: "iana"
  },
  "audio/dsr-es202212": {
    source: "iana"
  },
  "audio/dv": {
    source: "iana"
  },
  "audio/dvi4": {
    source: "iana"
  },
  "audio/eac3": {
    source: "iana"
  },
  "audio/encaprtp": {
    source: "iana"
  },
  "audio/evrc": {
    source: "iana"
  },
  "audio/evrc-qcp": {
    source: "iana"
  },
  "audio/evrc0": {
    source: "iana"
  },
  "audio/evrc1": {
    source: "iana"
  },
  "audio/evrcb": {
    source: "iana"
  },
  "audio/evrcb0": {
    source: "iana"
  },
  "audio/evrcb1": {
    source: "iana"
  },
  "audio/evrcnw": {
    source: "iana"
  },
  "audio/evrcnw0": {
    source: "iana"
  },
  "audio/evrcnw1": {
    source: "iana"
  },
  "audio/evrcwb": {
    source: "iana"
  },
  "audio/evrcwb0": {
    source: "iana"
  },
  "audio/evrcwb1": {
    source: "iana"
  },
  "audio/evs": {
    source: "iana"
  },
  "audio/flexfec": {
    source: "iana"
  },
  "audio/fwdred": {
    source: "iana"
  },
  "audio/g711-0": {
    source: "iana"
  },
  "audio/g719": {
    source: "iana"
  },
  "audio/g722": {
    source: "iana"
  },
  "audio/g7221": {
    source: "iana"
  },
  "audio/g723": {
    source: "iana"
  },
  "audio/g726-16": {
    source: "iana"
  },
  "audio/g726-24": {
    source: "iana"
  },
  "audio/g726-32": {
    source: "iana"
  },
  "audio/g726-40": {
    source: "iana"
  },
  "audio/g728": {
    source: "iana"
  },
  "audio/g729": {
    source: "iana"
  },
  "audio/g7291": {
    source: "iana"
  },
  "audio/g729d": {
    source: "iana"
  },
  "audio/g729e": {
    source: "iana"
  },
  "audio/gsm": {
    source: "iana"
  },
  "audio/gsm-efr": {
    source: "iana"
  },
  "audio/gsm-hr-08": {
    source: "iana"
  },
  "audio/ilbc": {
    source: "iana"
  },
  "audio/ip-mr_v2.5": {
    source: "iana"
  },
  "audio/isac": {
    source: "apache"
  },
  "audio/l16": {
    source: "iana"
  },
  "audio/l20": {
    source: "iana"
  },
  "audio/l24": {
    source: "iana",
    compressible: !1
  },
  "audio/l8": {
    source: "iana"
  },
  "audio/lpc": {
    source: "iana"
  },
  "audio/melp": {
    source: "iana"
  },
  "audio/melp1200": {
    source: "iana"
  },
  "audio/melp2400": {
    source: "iana"
  },
  "audio/melp600": {
    source: "iana"
  },
  "audio/mhas": {
    source: "iana"
  },
  "audio/midi": {
    source: "apache",
    extensions: [
      "mid",
      "midi",
      "kar",
      "rmi"
    ]
  },
  "audio/mobile-xmf": {
    source: "iana",
    extensions: [
      "mxmf"
    ]
  },
  "audio/mp3": {
    compressible: !1,
    extensions: [
      "mp3"
    ]
  },
  "audio/mp4": {
    source: "iana",
    compressible: !1,
    extensions: [
      "m4a",
      "mp4a"
    ]
  },
  "audio/mp4a-latm": {
    source: "iana"
  },
  "audio/mpa": {
    source: "iana"
  },
  "audio/mpa-robust": {
    source: "iana"
  },
  "audio/mpeg": {
    source: "iana",
    compressible: !1,
    extensions: [
      "mpga",
      "mp2",
      "mp2a",
      "mp3",
      "m2a",
      "m3a"
    ]
  },
  "audio/mpeg4-generic": {
    source: "iana"
  },
  "audio/musepack": {
    source: "apache"
  },
  "audio/ogg": {
    source: "iana",
    compressible: !1,
    extensions: [
      "oga",
      "ogg",
      "spx",
      "opus"
    ]
  },
  "audio/opus": {
    source: "iana"
  },
  "audio/parityfec": {
    source: "iana"
  },
  "audio/pcma": {
    source: "iana"
  },
  "audio/pcma-wb": {
    source: "iana"
  },
  "audio/pcmu": {
    source: "iana"
  },
  "audio/pcmu-wb": {
    source: "iana"
  },
  "audio/prs.sid": {
    source: "iana"
  },
  "audio/qcelp": {
    source: "iana"
  },
  "audio/raptorfec": {
    source: "iana"
  },
  "audio/red": {
    source: "iana"
  },
  "audio/rtp-enc-aescm128": {
    source: "iana"
  },
  "audio/rtp-midi": {
    source: "iana"
  },
  "audio/rtploopback": {
    source: "iana"
  },
  "audio/rtx": {
    source: "iana"
  },
  "audio/s3m": {
    source: "apache",
    extensions: [
      "s3m"
    ]
  },
  "audio/scip": {
    source: "iana"
  },
  "audio/silk": {
    source: "apache",
    extensions: [
      "sil"
    ]
  },
  "audio/smv": {
    source: "iana"
  },
  "audio/smv-qcp": {
    source: "iana"
  },
  "audio/smv0": {
    source: "iana"
  },
  "audio/sofa": {
    source: "iana"
  },
  "audio/sp-midi": {
    source: "iana"
  },
  "audio/speex": {
    source: "iana"
  },
  "audio/t140c": {
    source: "iana"
  },
  "audio/t38": {
    source: "iana"
  },
  "audio/telephone-event": {
    source: "iana"
  },
  "audio/tetra_acelp": {
    source: "iana"
  },
  "audio/tetra_acelp_bb": {
    source: "iana"
  },
  "audio/tone": {
    source: "iana"
  },
  "audio/tsvcis": {
    source: "iana"
  },
  "audio/uemclip": {
    source: "iana"
  },
  "audio/ulpfec": {
    source: "iana"
  },
  "audio/usac": {
    source: "iana"
  },
  "audio/vdvi": {
    source: "iana"
  },
  "audio/vmr-wb": {
    source: "iana"
  },
  "audio/vnd.3gpp.iufp": {
    source: "iana"
  },
  "audio/vnd.4sb": {
    source: "iana"
  },
  "audio/vnd.audiokoz": {
    source: "iana"
  },
  "audio/vnd.celp": {
    source: "iana"
  },
  "audio/vnd.cisco.nse": {
    source: "iana"
  },
  "audio/vnd.cmles.radio-events": {
    source: "iana"
  },
  "audio/vnd.cns.anp1": {
    source: "iana"
  },
  "audio/vnd.cns.inf1": {
    source: "iana"
  },
  "audio/vnd.dece.audio": {
    source: "iana",
    extensions: [
      "uva",
      "uvva"
    ]
  },
  "audio/vnd.digital-winds": {
    source: "iana",
    extensions: [
      "eol"
    ]
  },
  "audio/vnd.dlna.adts": {
    source: "iana"
  },
  "audio/vnd.dolby.heaac.1": {
    source: "iana"
  },
  "audio/vnd.dolby.heaac.2": {
    source: "iana"
  },
  "audio/vnd.dolby.mlp": {
    source: "iana"
  },
  "audio/vnd.dolby.mps": {
    source: "iana"
  },
  "audio/vnd.dolby.pl2": {
    source: "iana"
  },
  "audio/vnd.dolby.pl2x": {
    source: "iana"
  },
  "audio/vnd.dolby.pl2z": {
    source: "iana"
  },
  "audio/vnd.dolby.pulse.1": {
    source: "iana"
  },
  "audio/vnd.dra": {
    source: "iana",
    extensions: [
      "dra"
    ]
  },
  "audio/vnd.dts": {
    source: "iana",
    extensions: [
      "dts"
    ]
  },
  "audio/vnd.dts.hd": {
    source: "iana",
    extensions: [
      "dtshd"
    ]
  },
  "audio/vnd.dts.uhd": {
    source: "iana"
  },
  "audio/vnd.dvb.file": {
    source: "iana"
  },
  "audio/vnd.everad.plj": {
    source: "iana"
  },
  "audio/vnd.hns.audio": {
    source: "iana"
  },
  "audio/vnd.lucent.voice": {
    source: "iana",
    extensions: [
      "lvp"
    ]
  },
  "audio/vnd.ms-playready.media.pya": {
    source: "iana",
    extensions: [
      "pya"
    ]
  },
  "audio/vnd.nokia.mobile-xmf": {
    source: "iana"
  },
  "audio/vnd.nortel.vbk": {
    source: "iana"
  },
  "audio/vnd.nuera.ecelp4800": {
    source: "iana",
    extensions: [
      "ecelp4800"
    ]
  },
  "audio/vnd.nuera.ecelp7470": {
    source: "iana",
    extensions: [
      "ecelp7470"
    ]
  },
  "audio/vnd.nuera.ecelp9600": {
    source: "iana",
    extensions: [
      "ecelp9600"
    ]
  },
  "audio/vnd.octel.sbc": {
    source: "iana"
  },
  "audio/vnd.presonus.multitrack": {
    source: "iana"
  },
  "audio/vnd.qcelp": {
    source: "iana"
  },
  "audio/vnd.rhetorex.32kadpcm": {
    source: "iana"
  },
  "audio/vnd.rip": {
    source: "iana",
    extensions: [
      "rip"
    ]
  },
  "audio/vnd.rn-realaudio": {
    compressible: !1
  },
  "audio/vnd.sealedmedia.softseal.mpeg": {
    source: "iana"
  },
  "audio/vnd.vmx.cvsd": {
    source: "iana"
  },
  "audio/vnd.wave": {
    compressible: !1
  },
  "audio/vorbis": {
    source: "iana",
    compressible: !1
  },
  "audio/vorbis-config": {
    source: "iana"
  },
  "audio/wav": {
    compressible: !1,
    extensions: [
      "wav"
    ]
  },
  "audio/wave": {
    compressible: !1,
    extensions: [
      "wav"
    ]
  },
  "audio/webm": {
    source: "apache",
    compressible: !1,
    extensions: [
      "weba"
    ]
  },
  "audio/x-aac": {
    source: "apache",
    compressible: !1,
    extensions: [
      "aac"
    ]
  },
  "audio/x-aiff": {
    source: "apache",
    extensions: [
      "aif",
      "aiff",
      "aifc"
    ]
  },
  "audio/x-caf": {
    source: "apache",
    compressible: !1,
    extensions: [
      "caf"
    ]
  },
  "audio/x-flac": {
    source: "apache",
    extensions: [
      "flac"
    ]
  },
  "audio/x-m4a": {
    source: "nginx",
    extensions: [
      "m4a"
    ]
  },
  "audio/x-matroska": {
    source: "apache",
    extensions: [
      "mka"
    ]
  },
  "audio/x-mpegurl": {
    source: "apache",
    extensions: [
      "m3u"
    ]
  },
  "audio/x-ms-wax": {
    source: "apache",
    extensions: [
      "wax"
    ]
  },
  "audio/x-ms-wma": {
    source: "apache",
    extensions: [
      "wma"
    ]
  },
  "audio/x-pn-realaudio": {
    source: "apache",
    extensions: [
      "ram",
      "ra"
    ]
  },
  "audio/x-pn-realaudio-plugin": {
    source: "apache",
    extensions: [
      "rmp"
    ]
  },
  "audio/x-realaudio": {
    source: "nginx",
    extensions: [
      "ra"
    ]
  },
  "audio/x-tta": {
    source: "apache"
  },
  "audio/x-wav": {
    source: "apache",
    extensions: [
      "wav"
    ]
  },
  "audio/xm": {
    source: "apache",
    extensions: [
      "xm"
    ]
  },
  "chemical/x-cdx": {
    source: "apache",
    extensions: [
      "cdx"
    ]
  },
  "chemical/x-cif": {
    source: "apache",
    extensions: [
      "cif"
    ]
  },
  "chemical/x-cmdf": {
    source: "apache",
    extensions: [
      "cmdf"
    ]
  },
  "chemical/x-cml": {
    source: "apache",
    extensions: [
      "cml"
    ]
  },
  "chemical/x-csml": {
    source: "apache",
    extensions: [
      "csml"
    ]
  },
  "chemical/x-pdb": {
    source: "apache"
  },
  "chemical/x-xyz": {
    source: "apache",
    extensions: [
      "xyz"
    ]
  },
  "font/collection": {
    source: "iana",
    extensions: [
      "ttc"
    ]
  },
  "font/otf": {
    source: "iana",
    compressible: !0,
    extensions: [
      "otf"
    ]
  },
  "font/sfnt": {
    source: "iana"
  },
  "font/ttf": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ttf"
    ]
  },
  "font/woff": {
    source: "iana",
    extensions: [
      "woff"
    ]
  },
  "font/woff2": {
    source: "iana",
    extensions: [
      "woff2"
    ]
  },
  "image/aces": {
    source: "iana",
    extensions: [
      "exr"
    ]
  },
  "image/apng": {
    compressible: !1,
    extensions: [
      "apng"
    ]
  },
  "image/avci": {
    source: "iana",
    extensions: [
      "avci"
    ]
  },
  "image/avcs": {
    source: "iana",
    extensions: [
      "avcs"
    ]
  },
  "image/avif": {
    source: "iana",
    compressible: !1,
    extensions: [
      "avif"
    ]
  },
  "image/bmp": {
    source: "iana",
    compressible: !0,
    extensions: [
      "bmp"
    ]
  },
  "image/cgm": {
    source: "iana",
    extensions: [
      "cgm"
    ]
  },
  "image/dicom-rle": {
    source: "iana",
    extensions: [
      "drle"
    ]
  },
  "image/emf": {
    source: "iana",
    extensions: [
      "emf"
    ]
  },
  "image/fits": {
    source: "iana",
    extensions: [
      "fits"
    ]
  },
  "image/g3fax": {
    source: "iana",
    extensions: [
      "g3"
    ]
  },
  "image/gif": {
    source: "iana",
    compressible: !1,
    extensions: [
      "gif"
    ]
  },
  "image/heic": {
    source: "iana",
    extensions: [
      "heic"
    ]
  },
  "image/heic-sequence": {
    source: "iana",
    extensions: [
      "heics"
    ]
  },
  "image/heif": {
    source: "iana",
    extensions: [
      "heif"
    ]
  },
  "image/heif-sequence": {
    source: "iana",
    extensions: [
      "heifs"
    ]
  },
  "image/hej2k": {
    source: "iana",
    extensions: [
      "hej2"
    ]
  },
  "image/hsj2": {
    source: "iana",
    extensions: [
      "hsj2"
    ]
  },
  "image/ief": {
    source: "iana",
    extensions: [
      "ief"
    ]
  },
  "image/jls": {
    source: "iana",
    extensions: [
      "jls"
    ]
  },
  "image/jp2": {
    source: "iana",
    compressible: !1,
    extensions: [
      "jp2",
      "jpg2"
    ]
  },
  "image/jpeg": {
    source: "iana",
    compressible: !1,
    extensions: [
      "jpeg",
      "jpg",
      "jpe"
    ]
  },
  "image/jph": {
    source: "iana",
    extensions: [
      "jph"
    ]
  },
  "image/jphc": {
    source: "iana",
    extensions: [
      "jhc"
    ]
  },
  "image/jpm": {
    source: "iana",
    compressible: !1,
    extensions: [
      "jpm"
    ]
  },
  "image/jpx": {
    source: "iana",
    compressible: !1,
    extensions: [
      "jpx",
      "jpf"
    ]
  },
  "image/jxr": {
    source: "iana",
    extensions: [
      "jxr"
    ]
  },
  "image/jxra": {
    source: "iana",
    extensions: [
      "jxra"
    ]
  },
  "image/jxrs": {
    source: "iana",
    extensions: [
      "jxrs"
    ]
  },
  "image/jxs": {
    source: "iana",
    extensions: [
      "jxs"
    ]
  },
  "image/jxsc": {
    source: "iana",
    extensions: [
      "jxsc"
    ]
  },
  "image/jxsi": {
    source: "iana",
    extensions: [
      "jxsi"
    ]
  },
  "image/jxss": {
    source: "iana",
    extensions: [
      "jxss"
    ]
  },
  "image/ktx": {
    source: "iana",
    extensions: [
      "ktx"
    ]
  },
  "image/ktx2": {
    source: "iana",
    extensions: [
      "ktx2"
    ]
  },
  "image/naplps": {
    source: "iana"
  },
  "image/pjpeg": {
    compressible: !1
  },
  "image/png": {
    source: "iana",
    compressible: !1,
    extensions: [
      "png"
    ]
  },
  "image/prs.btif": {
    source: "iana",
    extensions: [
      "btif"
    ]
  },
  "image/prs.pti": {
    source: "iana",
    extensions: [
      "pti"
    ]
  },
  "image/pwg-raster": {
    source: "iana"
  },
  "image/sgi": {
    source: "apache",
    extensions: [
      "sgi"
    ]
  },
  "image/svg+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "svg",
      "svgz"
    ]
  },
  "image/t38": {
    source: "iana",
    extensions: [
      "t38"
    ]
  },
  "image/tiff": {
    source: "iana",
    compressible: !1,
    extensions: [
      "tif",
      "tiff"
    ]
  },
  "image/tiff-fx": {
    source: "iana",
    extensions: [
      "tfx"
    ]
  },
  "image/vnd.adobe.photoshop": {
    source: "iana",
    compressible: !0,
    extensions: [
      "psd"
    ]
  },
  "image/vnd.airzip.accelerator.azv": {
    source: "iana",
    extensions: [
      "azv"
    ]
  },
  "image/vnd.cns.inf2": {
    source: "iana"
  },
  "image/vnd.dece.graphic": {
    source: "iana",
    extensions: [
      "uvi",
      "uvvi",
      "uvg",
      "uvvg"
    ]
  },
  "image/vnd.djvu": {
    source: "iana",
    extensions: [
      "djvu",
      "djv"
    ]
  },
  "image/vnd.dvb.subtitle": {
    source: "iana",
    extensions: [
      "sub"
    ]
  },
  "image/vnd.dwg": {
    source: "iana",
    extensions: [
      "dwg"
    ]
  },
  "image/vnd.dxf": {
    source: "iana",
    extensions: [
      "dxf"
    ]
  },
  "image/vnd.fastbidsheet": {
    source: "iana",
    extensions: [
      "fbs"
    ]
  },
  "image/vnd.fpx": {
    source: "iana",
    extensions: [
      "fpx"
    ]
  },
  "image/vnd.fst": {
    source: "iana",
    extensions: [
      "fst"
    ]
  },
  "image/vnd.fujixerox.edmics-mmr": {
    source: "iana",
    extensions: [
      "mmr"
    ]
  },
  "image/vnd.fujixerox.edmics-rlc": {
    source: "iana",
    extensions: [
      "rlc"
    ]
  },
  "image/vnd.globalgraphics.pgb": {
    source: "iana"
  },
  "image/vnd.microsoft.icon": {
    source: "iana",
    compressible: !0,
    extensions: [
      "ico"
    ]
  },
  "image/vnd.mix": {
    source: "iana"
  },
  "image/vnd.mozilla.apng": {
    source: "iana"
  },
  "image/vnd.ms-dds": {
    compressible: !0,
    extensions: [
      "dds"
    ]
  },
  "image/vnd.ms-modi": {
    source: "iana",
    extensions: [
      "mdi"
    ]
  },
  "image/vnd.ms-photo": {
    source: "apache",
    extensions: [
      "wdp"
    ]
  },
  "image/vnd.net-fpx": {
    source: "iana",
    extensions: [
      "npx"
    ]
  },
  "image/vnd.pco.b16": {
    source: "iana",
    extensions: [
      "b16"
    ]
  },
  "image/vnd.radiance": {
    source: "iana"
  },
  "image/vnd.sealed.png": {
    source: "iana"
  },
  "image/vnd.sealedmedia.softseal.gif": {
    source: "iana"
  },
  "image/vnd.sealedmedia.softseal.jpg": {
    source: "iana"
  },
  "image/vnd.svf": {
    source: "iana"
  },
  "image/vnd.tencent.tap": {
    source: "iana",
    extensions: [
      "tap"
    ]
  },
  "image/vnd.valve.source.texture": {
    source: "iana",
    extensions: [
      "vtf"
    ]
  },
  "image/vnd.wap.wbmp": {
    source: "iana",
    extensions: [
      "wbmp"
    ]
  },
  "image/vnd.xiff": {
    source: "iana",
    extensions: [
      "xif"
    ]
  },
  "image/vnd.zbrush.pcx": {
    source: "iana",
    extensions: [
      "pcx"
    ]
  },
  "image/webp": {
    source: "apache",
    extensions: [
      "webp"
    ]
  },
  "image/wmf": {
    source: "iana",
    extensions: [
      "wmf"
    ]
  },
  "image/x-3ds": {
    source: "apache",
    extensions: [
      "3ds"
    ]
  },
  "image/x-cmu-raster": {
    source: "apache",
    extensions: [
      "ras"
    ]
  },
  "image/x-cmx": {
    source: "apache",
    extensions: [
      "cmx"
    ]
  },
  "image/x-freehand": {
    source: "apache",
    extensions: [
      "fh",
      "fhc",
      "fh4",
      "fh5",
      "fh7"
    ]
  },
  "image/x-icon": {
    source: "apache",
    compressible: !0,
    extensions: [
      "ico"
    ]
  },
  "image/x-jng": {
    source: "nginx",
    extensions: [
      "jng"
    ]
  },
  "image/x-mrsid-image": {
    source: "apache",
    extensions: [
      "sid"
    ]
  },
  "image/x-ms-bmp": {
    source: "nginx",
    compressible: !0,
    extensions: [
      "bmp"
    ]
  },
  "image/x-pcx": {
    source: "apache",
    extensions: [
      "pcx"
    ]
  },
  "image/x-pict": {
    source: "apache",
    extensions: [
      "pic",
      "pct"
    ]
  },
  "image/x-portable-anymap": {
    source: "apache",
    extensions: [
      "pnm"
    ]
  },
  "image/x-portable-bitmap": {
    source: "apache",
    extensions: [
      "pbm"
    ]
  },
  "image/x-portable-graymap": {
    source: "apache",
    extensions: [
      "pgm"
    ]
  },
  "image/x-portable-pixmap": {
    source: "apache",
    extensions: [
      "ppm"
    ]
  },
  "image/x-rgb": {
    source: "apache",
    extensions: [
      "rgb"
    ]
  },
  "image/x-tga": {
    source: "apache",
    extensions: [
      "tga"
    ]
  },
  "image/x-xbitmap": {
    source: "apache",
    extensions: [
      "xbm"
    ]
  },
  "image/x-xcf": {
    compressible: !1
  },
  "image/x-xpixmap": {
    source: "apache",
    extensions: [
      "xpm"
    ]
  },
  "image/x-xwindowdump": {
    source: "apache",
    extensions: [
      "xwd"
    ]
  },
  "message/cpim": {
    source: "iana"
  },
  "message/delivery-status": {
    source: "iana"
  },
  "message/disposition-notification": {
    source: "iana",
    extensions: [
      "disposition-notification"
    ]
  },
  "message/external-body": {
    source: "iana"
  },
  "message/feedback-report": {
    source: "iana"
  },
  "message/global": {
    source: "iana",
    extensions: [
      "u8msg"
    ]
  },
  "message/global-delivery-status": {
    source: "iana",
    extensions: [
      "u8dsn"
    ]
  },
  "message/global-disposition-notification": {
    source: "iana",
    extensions: [
      "u8mdn"
    ]
  },
  "message/global-headers": {
    source: "iana",
    extensions: [
      "u8hdr"
    ]
  },
  "message/http": {
    source: "iana",
    compressible: !1
  },
  "message/imdn+xml": {
    source: "iana",
    compressible: !0
  },
  "message/news": {
    source: "iana"
  },
  "message/partial": {
    source: "iana",
    compressible: !1
  },
  "message/rfc822": {
    source: "iana",
    compressible: !0,
    extensions: [
      "eml",
      "mime"
    ]
  },
  "message/s-http": {
    source: "iana"
  },
  "message/sip": {
    source: "iana"
  },
  "message/sipfrag": {
    source: "iana"
  },
  "message/tracking-status": {
    source: "iana"
  },
  "message/vnd.si.simp": {
    source: "iana"
  },
  "message/vnd.wfa.wsc": {
    source: "iana",
    extensions: [
      "wsc"
    ]
  },
  "model/3mf": {
    source: "iana",
    extensions: [
      "3mf"
    ]
  },
  "model/e57": {
    source: "iana"
  },
  "model/gltf+json": {
    source: "iana",
    compressible: !0,
    extensions: [
      "gltf"
    ]
  },
  "model/gltf-binary": {
    source: "iana",
    compressible: !0,
    extensions: [
      "glb"
    ]
  },
  "model/iges": {
    source: "iana",
    compressible: !1,
    extensions: [
      "igs",
      "iges"
    ]
  },
  "model/mesh": {
    source: "iana",
    compressible: !1,
    extensions: [
      "msh",
      "mesh",
      "silo"
    ]
  },
  "model/mtl": {
    source: "iana",
    extensions: [
      "mtl"
    ]
  },
  "model/obj": {
    source: "iana",
    extensions: [
      "obj"
    ]
  },
  "model/step": {
    source: "iana"
  },
  "model/step+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "stpx"
    ]
  },
  "model/step+zip": {
    source: "iana",
    compressible: !1,
    extensions: [
      "stpz"
    ]
  },
  "model/step-xml+zip": {
    source: "iana",
    compressible: !1,
    extensions: [
      "stpxz"
    ]
  },
  "model/stl": {
    source: "iana",
    extensions: [
      "stl"
    ]
  },
  "model/vnd.collada+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "dae"
    ]
  },
  "model/vnd.dwf": {
    source: "iana",
    extensions: [
      "dwf"
    ]
  },
  "model/vnd.flatland.3dml": {
    source: "iana"
  },
  "model/vnd.gdl": {
    source: "iana",
    extensions: [
      "gdl"
    ]
  },
  "model/vnd.gs-gdl": {
    source: "apache"
  },
  "model/vnd.gs.gdl": {
    source: "iana"
  },
  "model/vnd.gtw": {
    source: "iana",
    extensions: [
      "gtw"
    ]
  },
  "model/vnd.moml+xml": {
    source: "iana",
    compressible: !0
  },
  "model/vnd.mts": {
    source: "iana",
    extensions: [
      "mts"
    ]
  },
  "model/vnd.opengex": {
    source: "iana",
    extensions: [
      "ogex"
    ]
  },
  "model/vnd.parasolid.transmit.binary": {
    source: "iana",
    extensions: [
      "x_b"
    ]
  },
  "model/vnd.parasolid.transmit.text": {
    source: "iana",
    extensions: [
      "x_t"
    ]
  },
  "model/vnd.pytha.pyox": {
    source: "iana"
  },
  "model/vnd.rosette.annotated-data-model": {
    source: "iana"
  },
  "model/vnd.sap.vds": {
    source: "iana",
    extensions: [
      "vds"
    ]
  },
  "model/vnd.usdz+zip": {
    source: "iana",
    compressible: !1,
    extensions: [
      "usdz"
    ]
  },
  "model/vnd.valve.source.compiled-map": {
    source: "iana",
    extensions: [
      "bsp"
    ]
  },
  "model/vnd.vtu": {
    source: "iana",
    extensions: [
      "vtu"
    ]
  },
  "model/vrml": {
    source: "iana",
    compressible: !1,
    extensions: [
      "wrl",
      "vrml"
    ]
  },
  "model/x3d+binary": {
    source: "apache",
    compressible: !1,
    extensions: [
      "x3db",
      "x3dbz"
    ]
  },
  "model/x3d+fastinfoset": {
    source: "iana",
    extensions: [
      "x3db"
    ]
  },
  "model/x3d+vrml": {
    source: "apache",
    compressible: !1,
    extensions: [
      "x3dv",
      "x3dvz"
    ]
  },
  "model/x3d+xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "x3d",
      "x3dz"
    ]
  },
  "model/x3d-vrml": {
    source: "iana",
    extensions: [
      "x3dv"
    ]
  },
  "multipart/alternative": {
    source: "iana",
    compressible: !1
  },
  "multipart/appledouble": {
    source: "iana"
  },
  "multipart/byteranges": {
    source: "iana"
  },
  "multipart/digest": {
    source: "iana"
  },
  "multipart/encrypted": {
    source: "iana",
    compressible: !1
  },
  "multipart/form-data": {
    source: "iana",
    compressible: !1
  },
  "multipart/header-set": {
    source: "iana"
  },
  "multipart/mixed": {
    source: "iana"
  },
  "multipart/multilingual": {
    source: "iana"
  },
  "multipart/parallel": {
    source: "iana"
  },
  "multipart/related": {
    source: "iana",
    compressible: !1
  },
  "multipart/report": {
    source: "iana"
  },
  "multipart/signed": {
    source: "iana",
    compressible: !1
  },
  "multipart/vnd.bint.med-plus": {
    source: "iana"
  },
  "multipart/voice-message": {
    source: "iana"
  },
  "multipart/x-mixed-replace": {
    source: "iana"
  },
  "text/1d-interleaved-parityfec": {
    source: "iana"
  },
  "text/cache-manifest": {
    source: "iana",
    compressible: !0,
    extensions: [
      "appcache",
      "manifest"
    ]
  },
  "text/calendar": {
    source: "iana",
    extensions: [
      "ics",
      "ifb"
    ]
  },
  "text/calender": {
    compressible: !0
  },
  "text/cmd": {
    compressible: !0
  },
  "text/coffeescript": {
    extensions: [
      "coffee",
      "litcoffee"
    ]
  },
  "text/cql": {
    source: "iana"
  },
  "text/cql-expression": {
    source: "iana"
  },
  "text/cql-identifier": {
    source: "iana"
  },
  "text/css": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "css"
    ]
  },
  "text/csv": {
    source: "iana",
    compressible: !0,
    extensions: [
      "csv"
    ]
  },
  "text/csv-schema": {
    source: "iana"
  },
  "text/directory": {
    source: "iana"
  },
  "text/dns": {
    source: "iana"
  },
  "text/ecmascript": {
    source: "iana"
  },
  "text/encaprtp": {
    source: "iana"
  },
  "text/enriched": {
    source: "iana"
  },
  "text/fhirpath": {
    source: "iana"
  },
  "text/flexfec": {
    source: "iana"
  },
  "text/fwdred": {
    source: "iana"
  },
  "text/gff3": {
    source: "iana"
  },
  "text/grammar-ref-list": {
    source: "iana"
  },
  "text/html": {
    source: "iana",
    compressible: !0,
    extensions: [
      "html",
      "htm",
      "shtml"
    ]
  },
  "text/jade": {
    extensions: [
      "jade"
    ]
  },
  "text/javascript": {
    source: "iana",
    compressible: !0
  },
  "text/jcr-cnd": {
    source: "iana"
  },
  "text/jsx": {
    compressible: !0,
    extensions: [
      "jsx"
    ]
  },
  "text/less": {
    compressible: !0,
    extensions: [
      "less"
    ]
  },
  "text/markdown": {
    source: "iana",
    compressible: !0,
    extensions: [
      "markdown",
      "md"
    ]
  },
  "text/mathml": {
    source: "nginx",
    extensions: [
      "mml"
    ]
  },
  "text/mdx": {
    compressible: !0,
    extensions: [
      "mdx"
    ]
  },
  "text/mizar": {
    source: "iana"
  },
  "text/n3": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "n3"
    ]
  },
  "text/parameters": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/parityfec": {
    source: "iana"
  },
  "text/plain": {
    source: "iana",
    compressible: !0,
    extensions: [
      "txt",
      "text",
      "conf",
      "def",
      "list",
      "log",
      "in",
      "ini"
    ]
  },
  "text/provenance-notation": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/prs.fallenstein.rst": {
    source: "iana"
  },
  "text/prs.lines.tag": {
    source: "iana",
    extensions: [
      "dsc"
    ]
  },
  "text/prs.prop.logic": {
    source: "iana"
  },
  "text/raptorfec": {
    source: "iana"
  },
  "text/red": {
    source: "iana"
  },
  "text/rfc822-headers": {
    source: "iana"
  },
  "text/richtext": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rtx"
    ]
  },
  "text/rtf": {
    source: "iana",
    compressible: !0,
    extensions: [
      "rtf"
    ]
  },
  "text/rtp-enc-aescm128": {
    source: "iana"
  },
  "text/rtploopback": {
    source: "iana"
  },
  "text/rtx": {
    source: "iana"
  },
  "text/sgml": {
    source: "iana",
    extensions: [
      "sgml",
      "sgm"
    ]
  },
  "text/shaclc": {
    source: "iana"
  },
  "text/shex": {
    source: "iana",
    extensions: [
      "shex"
    ]
  },
  "text/slim": {
    extensions: [
      "slim",
      "slm"
    ]
  },
  "text/spdx": {
    source: "iana",
    extensions: [
      "spdx"
    ]
  },
  "text/strings": {
    source: "iana"
  },
  "text/stylus": {
    extensions: [
      "stylus",
      "styl"
    ]
  },
  "text/t140": {
    source: "iana"
  },
  "text/tab-separated-values": {
    source: "iana",
    compressible: !0,
    extensions: [
      "tsv"
    ]
  },
  "text/troff": {
    source: "iana",
    extensions: [
      "t",
      "tr",
      "roff",
      "man",
      "me",
      "ms"
    ]
  },
  "text/turtle": {
    source: "iana",
    charset: "UTF-8",
    extensions: [
      "ttl"
    ]
  },
  "text/ulpfec": {
    source: "iana"
  },
  "text/uri-list": {
    source: "iana",
    compressible: !0,
    extensions: [
      "uri",
      "uris",
      "urls"
    ]
  },
  "text/vcard": {
    source: "iana",
    compressible: !0,
    extensions: [
      "vcard"
    ]
  },
  "text/vnd.a": {
    source: "iana"
  },
  "text/vnd.abc": {
    source: "iana"
  },
  "text/vnd.ascii-art": {
    source: "iana"
  },
  "text/vnd.curl": {
    source: "iana",
    extensions: [
      "curl"
    ]
  },
  "text/vnd.curl.dcurl": {
    source: "apache",
    extensions: [
      "dcurl"
    ]
  },
  "text/vnd.curl.mcurl": {
    source: "apache",
    extensions: [
      "mcurl"
    ]
  },
  "text/vnd.curl.scurl": {
    source: "apache",
    extensions: [
      "scurl"
    ]
  },
  "text/vnd.debian.copyright": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/vnd.dmclientscript": {
    source: "iana"
  },
  "text/vnd.dvb.subtitle": {
    source: "iana",
    extensions: [
      "sub"
    ]
  },
  "text/vnd.esmertec.theme-descriptor": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/vnd.familysearch.gedcom": {
    source: "iana",
    extensions: [
      "ged"
    ]
  },
  "text/vnd.ficlab.flt": {
    source: "iana"
  },
  "text/vnd.fly": {
    source: "iana",
    extensions: [
      "fly"
    ]
  },
  "text/vnd.fmi.flexstor": {
    source: "iana",
    extensions: [
      "flx"
    ]
  },
  "text/vnd.gml": {
    source: "iana"
  },
  "text/vnd.graphviz": {
    source: "iana",
    extensions: [
      "gv"
    ]
  },
  "text/vnd.hans": {
    source: "iana"
  },
  "text/vnd.hgl": {
    source: "iana"
  },
  "text/vnd.in3d.3dml": {
    source: "iana",
    extensions: [
      "3dml"
    ]
  },
  "text/vnd.in3d.spot": {
    source: "iana",
    extensions: [
      "spot"
    ]
  },
  "text/vnd.iptc.newsml": {
    source: "iana"
  },
  "text/vnd.iptc.nitf": {
    source: "iana"
  },
  "text/vnd.latex-z": {
    source: "iana"
  },
  "text/vnd.motorola.reflex": {
    source: "iana"
  },
  "text/vnd.ms-mediapackage": {
    source: "iana"
  },
  "text/vnd.net2phone.commcenter.command": {
    source: "iana"
  },
  "text/vnd.radisys.msml-basic-layout": {
    source: "iana"
  },
  "text/vnd.senx.warpscript": {
    source: "iana"
  },
  "text/vnd.si.uricatalogue": {
    source: "iana"
  },
  "text/vnd.sosi": {
    source: "iana"
  },
  "text/vnd.sun.j2me.app-descriptor": {
    source: "iana",
    charset: "UTF-8",
    extensions: [
      "jad"
    ]
  },
  "text/vnd.trolltech.linguist": {
    source: "iana",
    charset: "UTF-8"
  },
  "text/vnd.wap.si": {
    source: "iana"
  },
  "text/vnd.wap.sl": {
    source: "iana"
  },
  "text/vnd.wap.wml": {
    source: "iana",
    extensions: [
      "wml"
    ]
  },
  "text/vnd.wap.wmlscript": {
    source: "iana",
    extensions: [
      "wmls"
    ]
  },
  "text/vtt": {
    source: "iana",
    charset: "UTF-8",
    compressible: !0,
    extensions: [
      "vtt"
    ]
  },
  "text/x-asm": {
    source: "apache",
    extensions: [
      "s",
      "asm"
    ]
  },
  "text/x-c": {
    source: "apache",
    extensions: [
      "c",
      "cc",
      "cxx",
      "cpp",
      "h",
      "hh",
      "dic"
    ]
  },
  "text/x-component": {
    source: "nginx",
    extensions: [
      "htc"
    ]
  },
  "text/x-fortran": {
    source: "apache",
    extensions: [
      "f",
      "for",
      "f77",
      "f90"
    ]
  },
  "text/x-gwt-rpc": {
    compressible: !0
  },
  "text/x-handlebars-template": {
    extensions: [
      "hbs"
    ]
  },
  "text/x-java-source": {
    source: "apache",
    extensions: [
      "java"
    ]
  },
  "text/x-jquery-tmpl": {
    compressible: !0
  },
  "text/x-lua": {
    extensions: [
      "lua"
    ]
  },
  "text/x-markdown": {
    compressible: !0,
    extensions: [
      "mkd"
    ]
  },
  "text/x-nfo": {
    source: "apache",
    extensions: [
      "nfo"
    ]
  },
  "text/x-opml": {
    source: "apache",
    extensions: [
      "opml"
    ]
  },
  "text/x-org": {
    compressible: !0,
    extensions: [
      "org"
    ]
  },
  "text/x-pascal": {
    source: "apache",
    extensions: [
      "p",
      "pas"
    ]
  },
  "text/x-processing": {
    compressible: !0,
    extensions: [
      "pde"
    ]
  },
  "text/x-sass": {
    extensions: [
      "sass"
    ]
  },
  "text/x-scss": {
    extensions: [
      "scss"
    ]
  },
  "text/x-setext": {
    source: "apache",
    extensions: [
      "etx"
    ]
  },
  "text/x-sfv": {
    source: "apache",
    extensions: [
      "sfv"
    ]
  },
  "text/x-suse-ymp": {
    compressible: !0,
    extensions: [
      "ymp"
    ]
  },
  "text/x-uuencode": {
    source: "apache",
    extensions: [
      "uu"
    ]
  },
  "text/x-vcalendar": {
    source: "apache",
    extensions: [
      "vcs"
    ]
  },
  "text/x-vcard": {
    source: "apache",
    extensions: [
      "vcf"
    ]
  },
  "text/xml": {
    source: "iana",
    compressible: !0,
    extensions: [
      "xml"
    ]
  },
  "text/xml-external-parsed-entity": {
    source: "iana"
  },
  "text/yaml": {
    compressible: !0,
    extensions: [
      "yaml",
      "yml"
    ]
  },
  "video/1d-interleaved-parityfec": {
    source: "iana"
  },
  "video/3gpp": {
    source: "iana",
    extensions: [
      "3gp",
      "3gpp"
    ]
  },
  "video/3gpp-tt": {
    source: "iana"
  },
  "video/3gpp2": {
    source: "iana",
    extensions: [
      "3g2"
    ]
  },
  "video/av1": {
    source: "iana"
  },
  "video/bmpeg": {
    source: "iana"
  },
  "video/bt656": {
    source: "iana"
  },
  "video/celb": {
    source: "iana"
  },
  "video/dv": {
    source: "iana"
  },
  "video/encaprtp": {
    source: "iana"
  },
  "video/ffv1": {
    source: "iana"
  },
  "video/flexfec": {
    source: "iana"
  },
  "video/h261": {
    source: "iana",
    extensions: [
      "h261"
    ]
  },
  "video/h263": {
    source: "iana",
    extensions: [
      "h263"
    ]
  },
  "video/h263-1998": {
    source: "iana"
  },
  "video/h263-2000": {
    source: "iana"
  },
  "video/h264": {
    source: "iana",
    extensions: [
      "h264"
    ]
  },
  "video/h264-rcdo": {
    source: "iana"
  },
  "video/h264-svc": {
    source: "iana"
  },
  "video/h265": {
    source: "iana"
  },
  "video/iso.segment": {
    source: "iana",
    extensions: [
      "m4s"
    ]
  },
  "video/jpeg": {
    source: "iana",
    extensions: [
      "jpgv"
    ]
  },
  "video/jpeg2000": {
    source: "iana"
  },
  "video/jpm": {
    source: "apache",
    extensions: [
      "jpm",
      "jpgm"
    ]
  },
  "video/jxsv": {
    source: "iana"
  },
  "video/mj2": {
    source: "iana",
    extensions: [
      "mj2",
      "mjp2"
    ]
  },
  "video/mp1s": {
    source: "iana"
  },
  "video/mp2p": {
    source: "iana"
  },
  "video/mp2t": {
    source: "iana",
    extensions: [
      "ts"
    ]
  },
  "video/mp4": {
    source: "iana",
    compressible: !1,
    extensions: [
      "mp4",
      "mp4v",
      "mpg4"
    ]
  },
  "video/mp4v-es": {
    source: "iana"
  },
  "video/mpeg": {
    source: "iana",
    compressible: !1,
    extensions: [
      "mpeg",
      "mpg",
      "mpe",
      "m1v",
      "m2v"
    ]
  },
  "video/mpeg4-generic": {
    source: "iana"
  },
  "video/mpv": {
    source: "iana"
  },
  "video/nv": {
    source: "iana"
  },
  "video/ogg": {
    source: "iana",
    compressible: !1,
    extensions: [
      "ogv"
    ]
  },
  "video/parityfec": {
    source: "iana"
  },
  "video/pointer": {
    source: "iana"
  },
  "video/quicktime": {
    source: "iana",
    compressible: !1,
    extensions: [
      "qt",
      "mov"
    ]
  },
  "video/raptorfec": {
    source: "iana"
  },
  "video/raw": {
    source: "iana"
  },
  "video/rtp-enc-aescm128": {
    source: "iana"
  },
  "video/rtploopback": {
    source: "iana"
  },
  "video/rtx": {
    source: "iana"
  },
  "video/scip": {
    source: "iana"
  },
  "video/smpte291": {
    source: "iana"
  },
  "video/smpte292m": {
    source: "iana"
  },
  "video/ulpfec": {
    source: "iana"
  },
  "video/vc1": {
    source: "iana"
  },
  "video/vc2": {
    source: "iana"
  },
  "video/vnd.cctv": {
    source: "iana"
  },
  "video/vnd.dece.hd": {
    source: "iana",
    extensions: [
      "uvh",
      "uvvh"
    ]
  },
  "video/vnd.dece.mobile": {
    source: "iana",
    extensions: [
      "uvm",
      "uvvm"
    ]
  },
  "video/vnd.dece.mp4": {
    source: "iana"
  },
  "video/vnd.dece.pd": {
    source: "iana",
    extensions: [
      "uvp",
      "uvvp"
    ]
  },
  "video/vnd.dece.sd": {
    source: "iana",
    extensions: [
      "uvs",
      "uvvs"
    ]
  },
  "video/vnd.dece.video": {
    source: "iana",
    extensions: [
      "uvv",
      "uvvv"
    ]
  },
  "video/vnd.directv.mpeg": {
    source: "iana"
  },
  "video/vnd.directv.mpeg-tts": {
    source: "iana"
  },
  "video/vnd.dlna.mpeg-tts": {
    source: "iana"
  },
  "video/vnd.dvb.file": {
    source: "iana",
    extensions: [
      "dvb"
    ]
  },
  "video/vnd.fvt": {
    source: "iana",
    extensions: [
      "fvt"
    ]
  },
  "video/vnd.hns.video": {
    source: "iana"
  },
  "video/vnd.iptvforum.1dparityfec-1010": {
    source: "iana"
  },
  "video/vnd.iptvforum.1dparityfec-2005": {
    source: "iana"
  },
  "video/vnd.iptvforum.2dparityfec-1010": {
    source: "iana"
  },
  "video/vnd.iptvforum.2dparityfec-2005": {
    source: "iana"
  },
  "video/vnd.iptvforum.ttsavc": {
    source: "iana"
  },
  "video/vnd.iptvforum.ttsmpeg2": {
    source: "iana"
  },
  "video/vnd.motorola.video": {
    source: "iana"
  },
  "video/vnd.motorola.videop": {
    source: "iana"
  },
  "video/vnd.mpegurl": {
    source: "iana",
    extensions: [
      "mxu",
      "m4u"
    ]
  },
  "video/vnd.ms-playready.media.pyv": {
    source: "iana",
    extensions: [
      "pyv"
    ]
  },
  "video/vnd.nokia.interleaved-multimedia": {
    source: "iana"
  },
  "video/vnd.nokia.mp4vr": {
    source: "iana"
  },
  "video/vnd.nokia.videovoip": {
    source: "iana"
  },
  "video/vnd.objectvideo": {
    source: "iana"
  },
  "video/vnd.radgamettools.bink": {
    source: "iana"
  },
  "video/vnd.radgamettools.smacker": {
    source: "iana"
  },
  "video/vnd.sealed.mpeg1": {
    source: "iana"
  },
  "video/vnd.sealed.mpeg4": {
    source: "iana"
  },
  "video/vnd.sealed.swf": {
    source: "iana"
  },
  "video/vnd.sealedmedia.softseal.mov": {
    source: "iana"
  },
  "video/vnd.uvvu.mp4": {
    source: "iana",
    extensions: [
      "uvu",
      "uvvu"
    ]
  },
  "video/vnd.vivo": {
    source: "iana",
    extensions: [
      "viv"
    ]
  },
  "video/vnd.youtube.yt": {
    source: "iana"
  },
  "video/vp8": {
    source: "iana"
  },
  "video/vp9": {
    source: "iana"
  },
  "video/webm": {
    source: "apache",
    compressible: !1,
    extensions: [
      "webm"
    ]
  },
  "video/x-f4v": {
    source: "apache",
    extensions: [
      "f4v"
    ]
  },
  "video/x-fli": {
    source: "apache",
    extensions: [
      "fli"
    ]
  },
  "video/x-flv": {
    source: "apache",
    compressible: !1,
    extensions: [
      "flv"
    ]
  },
  "video/x-m4v": {
    source: "apache",
    extensions: [
      "m4v"
    ]
  },
  "video/x-matroska": {
    source: "apache",
    compressible: !1,
    extensions: [
      "mkv",
      "mk3d",
      "mks"
    ]
  },
  "video/x-mng": {
    source: "apache",
    extensions: [
      "mng"
    ]
  },
  "video/x-ms-asf": {
    source: "apache",
    extensions: [
      "asf",
      "asx"
    ]
  },
  "video/x-ms-vob": {
    source: "apache",
    extensions: [
      "vob"
    ]
  },
  "video/x-ms-wm": {
    source: "apache",
    extensions: [
      "wm"
    ]
  },
  "video/x-ms-wmv": {
    source: "apache",
    compressible: !1,
    extensions: [
      "wmv"
    ]
  },
  "video/x-ms-wmx": {
    source: "apache",
    extensions: [
      "wmx"
    ]
  },
  "video/x-ms-wvx": {
    source: "apache",
    extensions: [
      "wvx"
    ]
  },
  "video/x-msvideo": {
    source: "apache",
    extensions: [
      "avi"
    ]
  },
  "video/x-sgi-movie": {
    source: "apache",
    extensions: [
      "movie"
    ]
  },
  "video/x-smv": {
    source: "apache",
    extensions: [
      "smv"
    ]
  },
  "x-conference/x-cooltalk": {
    source: "apache",
    extensions: [
      "ice"
    ]
  },
  "x-shader/x-fragment": {
    compressible: !0
  },
  "x-shader/x-vertex": {
    compressible: !0
  }
};
/*!
 * mime-db
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015-2022 Douglas Christopher Wilson
 * MIT Licensed
 */
var Mo = $o;
/*!
 * mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
(function(a) {
  var e = Mo, n = fa.extname, t = /^\s*([^;\s]*)(?:;|\s|$)/, i = /^text\//i;
  a.charset = o, a.charsets = { lookup: o }, a.contentType = s, a.extension = r, a.extensions = /* @__PURE__ */ Object.create(null), a.lookup = l, a.types = /* @__PURE__ */ Object.create(null), d(a.extensions, a.types);
  function o(c) {
    if (!c || typeof c != "string")
      return !1;
    var p = t.exec(c), u = p && e[p[1].toLowerCase()];
    return u && u.charset ? u.charset : p && i.test(p[1]) ? "UTF-8" : !1;
  }
  function s(c) {
    if (!c || typeof c != "string")
      return !1;
    var p = c.indexOf("/") === -1 ? a.lookup(c) : c;
    if (!p)
      return !1;
    if (p.indexOf("charset") === -1) {
      var u = a.charset(p);
      u && (p += "; charset=" + u.toLowerCase());
    }
    return p;
  }
  function r(c) {
    if (!c || typeof c != "string")
      return !1;
    var p = t.exec(c), u = p && a.extensions[p[1].toLowerCase()];
    return !u || !u.length ? !1 : u[0];
  }
  function l(c) {
    if (!c || typeof c != "string")
      return !1;
    var p = n("x." + c).toLowerCase().substr(1);
    return p && a.types[p] || !1;
  }
  function d(c, p) {
    var u = ["nginx", "apache", void 0, "iana"];
    Object.keys(e).forEach(function(f) {
      var v = e[f], x = v.extensions;
      if (!(!x || !x.length)) {
        c[f] = x;
        for (var g = 0; g < x.length; g++) {
          var w = x[g];
          if (p[w]) {
            var E = u.indexOf(e[p[w]].source), S = u.indexOf(v.source);
            if (p[w] !== "application/octet-stream" && (E > S || E === S && p[w].substr(0, 12) === "application/"))
              continue;
          }
          p[w] = f;
        }
      }
    });
  }
})(Gt);
var Ho = Wo;
function Wo(a) {
  var e = typeof setImmediate == "function" ? setImmediate : typeof process == "object" && typeof process.nextTick == "function" ? process.nextTick : null;
  e ? e(a) : setTimeout(a, 0);
}
var Dn = Ho, Xt = Vo;
function Vo(a) {
  var e = !1;
  return Dn(function() {
    e = !0;
  }), function(t, i) {
    e ? a(t, i) : Dn(function() {
      a(t, i);
    });
  };
}
var Jt = Go;
function Go(a) {
  Object.keys(a.jobs).forEach(Xo.bind(a)), a.jobs = {};
}
function Xo(a) {
  typeof this.jobs[a] == "function" && this.jobs[a]();
}
var In = Xt, Jo = Jt, Kt = Ko;
function Ko(a, e, n, t) {
  var i = n.keyedList ? n.keyedList[n.index] : n.index;
  n.jobs[i] = Yo(e, i, a[i], function(o, s) {
    i in n.jobs && (delete n.jobs[i], o ? Jo(n) : n.results[i] = s, t(o, n.results));
  });
}
function Yo(a, e, n, t) {
  var i;
  return a.length == 2 ? i = a(n, In(t)) : i = a(n, e, In(t)), i;
}
var Yt = Qo;
function Qo(a, e) {
  var n = !Array.isArray(a), t = {
    index: 0,
    keyedList: n || e ? Object.keys(a) : null,
    jobs: {},
    results: n ? {} : [],
    size: n ? Object.keys(a).length : a.length
  };
  return e && t.keyedList.sort(n ? e : function(i, o) {
    return e(a[i], a[o]);
  }), t;
}
var Zo = Jt, es = Xt, Qt = as;
function as(a) {
  Object.keys(this.jobs).length && (this.index = this.size, Zo(this), es(a)(null, this.results));
}
var ns = Kt, ts = Yt, is = Qt, os = ss;
function ss(a, e, n) {
  for (var t = ts(a); t.index < (t.keyedList || a).length; )
    ns(a, e, t, function(i, o) {
      if (i) {
        n(i, o);
        return;
      }
      if (Object.keys(t.jobs).length === 0) {
        n(null, t.results);
        return;
      }
    }), t.index++;
  return is.bind(t, n);
}
var ga = { exports: {} }, Bn = Kt, rs = Yt, cs = Qt;
ga.exports = ps;
ga.exports.ascending = Zt;
ga.exports.descending = ls;
function ps(a, e, n, t) {
  var i = rs(a, n);
  return Bn(a, e, i, function o(s, r) {
    if (s) {
      t(s, r);
      return;
    }
    if (i.index++, i.index < (i.keyedList || a).length) {
      Bn(a, e, i, o);
      return;
    }
    t(null, i.results);
  }), cs.bind(i, t);
}
function Zt(a, e) {
  return a < e ? -1 : a > e ? 1 : 0;
}
function ls(a, e) {
  return -1 * Zt(a, e);
}
var ei = ga.exports, us = ei, ds = ms;
function ms(a, e, n) {
  return us(a, e, null, n);
}
var fs = {
  parallel: os,
  serial: ds,
  serialOrdered: ei
}, ai = Object, xs = Error, hs = EvalError, vs = RangeError, bs = ReferenceError, gs = SyntaxError, dn = TypeError, ys = URIError, ws = Math.abs, Es = Math.floor, _s = Math.max, Ts = Math.min, Rs = Math.pow, Ss = Math.round, ks = Number.isNaN || function(e) {
  return e !== e;
}, js = ks, Cs = function(e) {
  return js(e) || e === 0 ? e : e < 0 ? -1 : 1;
}, Os = Object.getOwnPropertyDescriptor, ia = Os;
if (ia)
  try {
    ia([], "length");
  } catch {
    ia = null;
  }
var ni = ia, oa = Object.defineProperty || !1;
if (oa)
  try {
    oa({}, "a", { value: 1 });
  } catch {
    oa = !1;
  }
var As = oa, Ra, qn;
function ti() {
  return qn || (qn = 1, Ra = function() {
    if (typeof Symbol != "function" || typeof Object.getOwnPropertySymbols != "function")
      return !1;
    if (typeof Symbol.iterator == "symbol")
      return !0;
    var e = {}, n = Symbol("test"), t = Object(n);
    if (typeof n == "string" || Object.prototype.toString.call(n) !== "[object Symbol]" || Object.prototype.toString.call(t) !== "[object Symbol]")
      return !1;
    var i = 42;
    e[n] = i;
    for (var o in e)
      return !1;
    if (typeof Object.keys == "function" && Object.keys(e).length !== 0 || typeof Object.getOwnPropertyNames == "function" && Object.getOwnPropertyNames(e).length !== 0)
      return !1;
    var s = Object.getOwnPropertySymbols(e);
    if (s.length !== 1 || s[0] !== n || !Object.prototype.propertyIsEnumerable.call(e, n))
      return !1;
    if (typeof Object.getOwnPropertyDescriptor == "function") {
      var r = (
        /** @type {PropertyDescriptor} */
        Object.getOwnPropertyDescriptor(e, n)
      );
      if (r.value !== i || r.enumerable !== !0)
        return !1;
    }
    return !0;
  }), Ra;
}
var Sa, zn;
function Ps() {
  if (zn) return Sa;
  zn = 1;
  var a = typeof Symbol < "u" && Symbol, e = ti();
  return Sa = function() {
    return typeof a != "function" || typeof Symbol != "function" || typeof a("foo") != "symbol" || typeof Symbol("bar") != "symbol" ? !1 : e();
  }, Sa;
}
var ka, $n;
function ii() {
  return $n || ($n = 1, ka = typeof Reflect < "u" && Reflect.getPrototypeOf || null), ka;
}
var ja, Mn;
function oi() {
  if (Mn) return ja;
  Mn = 1;
  var a = ai;
  return ja = a.getPrototypeOf || null, ja;
}
var Fs = "Function.prototype.bind called on incompatible ", Ns = Object.prototype.toString, Ls = Math.max, Us = "[object Function]", Hn = function(e, n) {
  for (var t = [], i = 0; i < e.length; i += 1)
    t[i] = e[i];
  for (var o = 0; o < n.length; o += 1)
    t[o + e.length] = n[o];
  return t;
}, Ds = function(e, n) {
  for (var t = [], i = n, o = 0; i < e.length; i += 1, o += 1)
    t[o] = e[i];
  return t;
}, Is = function(a, e) {
  for (var n = "", t = 0; t < a.length; t += 1)
    n += a[t], t + 1 < a.length && (n += e);
  return n;
}, Bs = function(e) {
  var n = this;
  if (typeof n != "function" || Ns.apply(n) !== Us)
    throw new TypeError(Fs + n);
  for (var t = Ds(arguments, 1), i, o = function() {
    if (this instanceof i) {
      var c = n.apply(
        this,
        Hn(t, arguments)
      );
      return Object(c) === c ? c : this;
    }
    return n.apply(
      e,
      Hn(t, arguments)
    );
  }, s = Ls(0, n.length - t.length), r = [], l = 0; l < s; l++)
    r[l] = "$" + l;
  if (i = Function("binder", "return function (" + Is(r, ",") + "){ return binder.apply(this,arguments); }")(o), n.prototype) {
    var d = function() {
    };
    d.prototype = n.prototype, i.prototype = new d(), d.prototype = null;
  }
  return i;
}, qs = Bs, ya = Function.prototype.bind || qs, Ca, Wn;
function mn() {
  return Wn || (Wn = 1, Ca = Function.prototype.call), Ca;
}
var Oa, Vn;
function si() {
  return Vn || (Vn = 1, Oa = Function.prototype.apply), Oa;
}
var Aa, Gn;
function zs() {
  return Gn || (Gn = 1, Aa = typeof Reflect < "u" && Reflect && Reflect.apply), Aa;
}
var Pa, Xn;
function $s() {
  if (Xn) return Pa;
  Xn = 1;
  var a = ya, e = si(), n = mn(), t = zs();
  return Pa = t || a.call(n, e), Pa;
}
var Fa, Jn;
function Ms() {
  if (Jn) return Fa;
  Jn = 1;
  var a = ya, e = dn, n = mn(), t = $s();
  return Fa = function(o) {
    if (o.length < 1 || typeof o[0] != "function")
      throw new e("a function is required");
    return t(a, n, o);
  }, Fa;
}
var Na, Kn;
function Hs() {
  if (Kn) return Na;
  Kn = 1;
  var a = Ms(), e = ni, n;
  try {
    n = /** @type {{ __proto__?: typeof Array.prototype }} */
    [].__proto__ === Array.prototype;
  } catch (s) {
    if (!s || typeof s != "object" || !("code" in s) || s.code !== "ERR_PROTO_ACCESS")
      throw s;
  }
  var t = !!n && e && e(
    Object.prototype,
    /** @type {keyof typeof Object.prototype} */
    "__proto__"
  ), i = Object, o = i.getPrototypeOf;
  return Na = t && typeof t.get == "function" ? a([t.get]) : typeof o == "function" ? (
    /** @type {import('./get')} */
    function(r) {
      return o(r == null ? r : i(r));
    }
  ) : !1, Na;
}
var La, Yn;
function Ws() {
  if (Yn) return La;
  Yn = 1;
  var a = ii(), e = oi(), n = Hs();
  return La = a ? function(i) {
    return a(i);
  } : e ? function(i) {
    if (!i || typeof i != "object" && typeof i != "function")
      throw new TypeError("getProto: not an object");
    return e(i);
  } : n ? function(i) {
    return n(i);
  } : null, La;
}
var Vs = Function.prototype.call, Gs = Object.prototype.hasOwnProperty, Xs = ya, fn = Xs.call(Vs, Gs), T, Js = ai, Ks = xs, Ys = hs, Qs = vs, Zs = bs, Oe = gs, je = dn, er = ys, ar = ws, nr = Es, tr = _s, ir = Ts, or = Rs, sr = Ss, rr = Cs, ri = Function, Ua = function(a) {
  try {
    return ri('"use strict"; return (' + a + ").constructor;")();
  } catch {
  }
}, De = ni, cr = As, Da = function() {
  throw new je();
}, pr = De ? function() {
  try {
    return arguments.callee, Da;
  } catch {
    try {
      return De(arguments, "callee").get;
    } catch {
      return Da;
    }
  }
}() : Da, Ee = Ps()(), B = Ws(), lr = oi(), ur = ii(), ci = si(), Me = mn(), Re = {}, dr = typeof Uint8Array > "u" || !B ? T : B(Uint8Array), fe = {
  __proto__: null,
  "%AggregateError%": typeof AggregateError > "u" ? T : AggregateError,
  "%Array%": Array,
  "%ArrayBuffer%": typeof ArrayBuffer > "u" ? T : ArrayBuffer,
  "%ArrayIteratorPrototype%": Ee && B ? B([][Symbol.iterator]()) : T,
  "%AsyncFromSyncIteratorPrototype%": T,
  "%AsyncFunction%": Re,
  "%AsyncGenerator%": Re,
  "%AsyncGeneratorFunction%": Re,
  "%AsyncIteratorPrototype%": Re,
  "%Atomics%": typeof Atomics > "u" ? T : Atomics,
  "%BigInt%": typeof BigInt > "u" ? T : BigInt,
  "%BigInt64Array%": typeof BigInt64Array > "u" ? T : BigInt64Array,
  "%BigUint64Array%": typeof BigUint64Array > "u" ? T : BigUint64Array,
  "%Boolean%": Boolean,
  "%DataView%": typeof DataView > "u" ? T : DataView,
  "%Date%": Date,
  "%decodeURI%": decodeURI,
  "%decodeURIComponent%": decodeURIComponent,
  "%encodeURI%": encodeURI,
  "%encodeURIComponent%": encodeURIComponent,
  "%Error%": Ks,
  "%eval%": eval,
  // eslint-disable-line no-eval
  "%EvalError%": Ys,
  "%Float16Array%": typeof Float16Array > "u" ? T : Float16Array,
  "%Float32Array%": typeof Float32Array > "u" ? T : Float32Array,
  "%Float64Array%": typeof Float64Array > "u" ? T : Float64Array,
  "%FinalizationRegistry%": typeof FinalizationRegistry > "u" ? T : FinalizationRegistry,
  "%Function%": ri,
  "%GeneratorFunction%": Re,
  "%Int8Array%": typeof Int8Array > "u" ? T : Int8Array,
  "%Int16Array%": typeof Int16Array > "u" ? T : Int16Array,
  "%Int32Array%": typeof Int32Array > "u" ? T : Int32Array,
  "%isFinite%": isFinite,
  "%isNaN%": isNaN,
  "%IteratorPrototype%": Ee && B ? B(B([][Symbol.iterator]())) : T,
  "%JSON%": typeof JSON == "object" ? JSON : T,
  "%Map%": typeof Map > "u" ? T : Map,
  "%MapIteratorPrototype%": typeof Map > "u" || !Ee || !B ? T : B((/* @__PURE__ */ new Map())[Symbol.iterator]()),
  "%Math%": Math,
  "%Number%": Number,
  "%Object%": Js,
  "%Object.getOwnPropertyDescriptor%": De,
  "%parseFloat%": parseFloat,
  "%parseInt%": parseInt,
  "%Promise%": typeof Promise > "u" ? T : Promise,
  "%Proxy%": typeof Proxy > "u" ? T : Proxy,
  "%RangeError%": Qs,
  "%ReferenceError%": Zs,
  "%Reflect%": typeof Reflect > "u" ? T : Reflect,
  "%RegExp%": RegExp,
  "%Set%": typeof Set > "u" ? T : Set,
  "%SetIteratorPrototype%": typeof Set > "u" || !Ee || !B ? T : B((/* @__PURE__ */ new Set())[Symbol.iterator]()),
  "%SharedArrayBuffer%": typeof SharedArrayBuffer > "u" ? T : SharedArrayBuffer,
  "%String%": String,
  "%StringIteratorPrototype%": Ee && B ? B(""[Symbol.iterator]()) : T,
  "%Symbol%": Ee ? Symbol : T,
  "%SyntaxError%": Oe,
  "%ThrowTypeError%": pr,
  "%TypedArray%": dr,
  "%TypeError%": je,
  "%Uint8Array%": typeof Uint8Array > "u" ? T : Uint8Array,
  "%Uint8ClampedArray%": typeof Uint8ClampedArray > "u" ? T : Uint8ClampedArray,
  "%Uint16Array%": typeof Uint16Array > "u" ? T : Uint16Array,
  "%Uint32Array%": typeof Uint32Array > "u" ? T : Uint32Array,
  "%URIError%": er,
  "%WeakMap%": typeof WeakMap > "u" ? T : WeakMap,
  "%WeakRef%": typeof WeakRef > "u" ? T : WeakRef,
  "%WeakSet%": typeof WeakSet > "u" ? T : WeakSet,
  "%Function.prototype.call%": Me,
  "%Function.prototype.apply%": ci,
  "%Object.defineProperty%": cr,
  "%Object.getPrototypeOf%": lr,
  "%Math.abs%": ar,
  "%Math.floor%": nr,
  "%Math.max%": tr,
  "%Math.min%": ir,
  "%Math.pow%": or,
  "%Math.round%": sr,
  "%Math.sign%": rr,
  "%Reflect.getPrototypeOf%": ur
};
if (B)
  try {
    null.error;
  } catch (a) {
    var mr = B(B(a));
    fe["%Error.prototype%"] = mr;
  }
var fr = function a(e) {
  var n;
  if (e === "%AsyncFunction%")
    n = Ua("async function () {}");
  else if (e === "%GeneratorFunction%")
    n = Ua("function* () {}");
  else if (e === "%AsyncGeneratorFunction%")
    n = Ua("async function* () {}");
  else if (e === "%AsyncGenerator%") {
    var t = a("%AsyncGeneratorFunction%");
    t && (n = t.prototype);
  } else if (e === "%AsyncIteratorPrototype%") {
    var i = a("%AsyncGenerator%");
    i && B && (n = B(i.prototype));
  }
  return fe[e] = n, n;
}, Qn = {
  __proto__: null,
  "%ArrayBufferPrototype%": ["ArrayBuffer", "prototype"],
  "%ArrayPrototype%": ["Array", "prototype"],
  "%ArrayProto_entries%": ["Array", "prototype", "entries"],
  "%ArrayProto_forEach%": ["Array", "prototype", "forEach"],
  "%ArrayProto_keys%": ["Array", "prototype", "keys"],
  "%ArrayProto_values%": ["Array", "prototype", "values"],
  "%AsyncFunctionPrototype%": ["AsyncFunction", "prototype"],
  "%AsyncGenerator%": ["AsyncGeneratorFunction", "prototype"],
  "%AsyncGeneratorPrototype%": ["AsyncGeneratorFunction", "prototype", "prototype"],
  "%BooleanPrototype%": ["Boolean", "prototype"],
  "%DataViewPrototype%": ["DataView", "prototype"],
  "%DatePrototype%": ["Date", "prototype"],
  "%ErrorPrototype%": ["Error", "prototype"],
  "%EvalErrorPrototype%": ["EvalError", "prototype"],
  "%Float32ArrayPrototype%": ["Float32Array", "prototype"],
  "%Float64ArrayPrototype%": ["Float64Array", "prototype"],
  "%FunctionPrototype%": ["Function", "prototype"],
  "%Generator%": ["GeneratorFunction", "prototype"],
  "%GeneratorPrototype%": ["GeneratorFunction", "prototype", "prototype"],
  "%Int8ArrayPrototype%": ["Int8Array", "prototype"],
  "%Int16ArrayPrototype%": ["Int16Array", "prototype"],
  "%Int32ArrayPrototype%": ["Int32Array", "prototype"],
  "%JSONParse%": ["JSON", "parse"],
  "%JSONStringify%": ["JSON", "stringify"],
  "%MapPrototype%": ["Map", "prototype"],
  "%NumberPrototype%": ["Number", "prototype"],
  "%ObjectPrototype%": ["Object", "prototype"],
  "%ObjProto_toString%": ["Object", "prototype", "toString"],
  "%ObjProto_valueOf%": ["Object", "prototype", "valueOf"],
  "%PromisePrototype%": ["Promise", "prototype"],
  "%PromiseProto_then%": ["Promise", "prototype", "then"],
  "%Promise_all%": ["Promise", "all"],
  "%Promise_reject%": ["Promise", "reject"],
  "%Promise_resolve%": ["Promise", "resolve"],
  "%RangeErrorPrototype%": ["RangeError", "prototype"],
  "%ReferenceErrorPrototype%": ["ReferenceError", "prototype"],
  "%RegExpPrototype%": ["RegExp", "prototype"],
  "%SetPrototype%": ["Set", "prototype"],
  "%SharedArrayBufferPrototype%": ["SharedArrayBuffer", "prototype"],
  "%StringPrototype%": ["String", "prototype"],
  "%SymbolPrototype%": ["Symbol", "prototype"],
  "%SyntaxErrorPrototype%": ["SyntaxError", "prototype"],
  "%TypedArrayPrototype%": ["TypedArray", "prototype"],
  "%TypeErrorPrototype%": ["TypeError", "prototype"],
  "%Uint8ArrayPrototype%": ["Uint8Array", "prototype"],
  "%Uint8ClampedArrayPrototype%": ["Uint8ClampedArray", "prototype"],
  "%Uint16ArrayPrototype%": ["Uint16Array", "prototype"],
  "%Uint32ArrayPrototype%": ["Uint32Array", "prototype"],
  "%URIErrorPrototype%": ["URIError", "prototype"],
  "%WeakMapPrototype%": ["WeakMap", "prototype"],
  "%WeakSetPrototype%": ["WeakSet", "prototype"]
}, He = ya, pa = fn, xr = He.call(Me, Array.prototype.concat), hr = He.call(ci, Array.prototype.splice), Zn = He.call(Me, String.prototype.replace), la = He.call(Me, String.prototype.slice), vr = He.call(Me, RegExp.prototype.exec), br = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g, gr = /\\(\\)?/g, yr = function(e) {
  var n = la(e, 0, 1), t = la(e, -1);
  if (n === "%" && t !== "%")
    throw new Oe("invalid intrinsic syntax, expected closing `%`");
  if (t === "%" && n !== "%")
    throw new Oe("invalid intrinsic syntax, expected opening `%`");
  var i = [];
  return Zn(e, br, function(o, s, r, l) {
    i[i.length] = r ? Zn(l, gr, "$1") : s || o;
  }), i;
}, wr = function(e, n) {
  var t = e, i;
  if (pa(Qn, t) && (i = Qn[t], t = "%" + i[0] + "%"), pa(fe, t)) {
    var o = fe[t];
    if (o === Re && (o = fr(t)), typeof o > "u" && !n)
      throw new je("intrinsic " + e + " exists, but is not available. Please file an issue!");
    return {
      alias: i,
      name: t,
      value: o
    };
  }
  throw new Oe("intrinsic " + e + " does not exist!");
}, Er = function(e, n) {
  if (typeof e != "string" || e.length === 0)
    throw new je("intrinsic name must be a non-empty string");
  if (arguments.length > 1 && typeof n != "boolean")
    throw new je('"allowMissing" argument must be a boolean');
  if (vr(/^%?[^%]*%?$/, e) === null)
    throw new Oe("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
  var t = yr(e), i = t.length > 0 ? t[0] : "", o = wr("%" + i + "%", n), s = o.name, r = o.value, l = !1, d = o.alias;
  d && (i = d[0], hr(t, xr([0, 1], d)));
  for (var c = 1, p = !0; c < t.length; c += 1) {
    var u = t[c], h = la(u, 0, 1), f = la(u, -1);
    if ((h === '"' || h === "'" || h === "`" || f === '"' || f === "'" || f === "`") && h !== f)
      throw new Oe("property names with quotes must have matching quotes");
    if ((u === "constructor" || !p) && (l = !0), i += "." + u, s = "%" + i + "%", pa(fe, s))
      r = fe[s];
    else if (r != null) {
      if (!(u in r)) {
        if (!n)
          throw new je("base intrinsic for " + e + " exists, but the property is not available.");
        return;
      }
      if (De && c + 1 >= t.length) {
        var v = De(r, u);
        p = !!v, p && "get" in v && !("originalValue" in v.get) ? r = v.get : r = r[u];
      } else
        p = pa(r, u), r = r[u];
      p && !l && (fe[s] = r);
    }
  }
  return r;
}, Ia, et;
function _r() {
  if (et) return Ia;
  et = 1;
  var a = ti();
  return Ia = function() {
    return a() && !!Symbol.toStringTag;
  }, Ia;
}
var Tr = Er, at = Tr("%Object.defineProperty%", !0), Rr = _r()(), Sr = fn, kr = dn, Ye = Rr ? Symbol.toStringTag : null, jr = function(e, n) {
  var t = arguments.length > 2 && !!arguments[2] && arguments[2].force, i = arguments.length > 2 && !!arguments[2] && arguments[2].nonConfigurable;
  if (typeof t < "u" && typeof t != "boolean" || typeof i < "u" && typeof i != "boolean")
    throw new kr("if provided, the `overrideIfSet` and `nonConfigurable` options must be booleans");
  Ye && (t || !Sr(e, Ye)) && (at ? at(e, Ye, {
    configurable: !i,
    enumerable: !1,
    value: n,
    writable: !1
  }) : e[Ye] = n);
}, Cr = function(a, e) {
  return Object.keys(e).forEach(function(n) {
    a[n] = a[n] || e[n];
  }), a;
}, xn = zo, Or = ye, Ba = fa, Ar = cn, Pr = pn, Fr = xa.parse, Nr = qi, Lr = V.Stream, Ur = ln, qa = Gt, Dr = fs, Ir = jr, le = fn, Za = Cr;
function R(a) {
  if (!(this instanceof R))
    return new R(a);
  this._overheadLength = 0, this._valueLength = 0, this._valuesToMeasure = [], xn.call(this), a = a || {};
  for (var e in a)
    this[e] = a[e];
}
Or.inherits(R, xn);
R.LINE_BREAK = `\r
`;
R.DEFAULT_CONTENT_TYPE = "application/octet-stream";
R.prototype.append = function(a, e, n) {
  n = n || {}, typeof n == "string" && (n = { filename: n });
  var t = xn.prototype.append.bind(this);
  if ((typeof e == "number" || e == null) && (e = String(e)), Array.isArray(e)) {
    this._error(new Error("Arrays are not supported."));
    return;
  }
  var i = this._multiPartHeader(a, e, n), o = this._multiPartFooter();
  t(i), t(e), t(o), this._trackLength(i, e, n);
};
R.prototype._trackLength = function(a, e, n) {
  var t = 0;
  n.knownLength != null ? t += Number(n.knownLength) : Buffer.isBuffer(e) ? t = e.length : typeof e == "string" && (t = Buffer.byteLength(e)), this._valueLength += t, this._overheadLength += Buffer.byteLength(a) + R.LINE_BREAK.length, !(!e || !e.path && !(e.readable && le(e, "httpVersion")) && !(e instanceof Lr)) && (n.knownLength || this._valuesToMeasure.push(e));
};
R.prototype._lengthRetriever = function(a, e) {
  le(a, "fd") ? a.end != null && a.end != 1 / 0 && a.start != null ? e(null, a.end + 1 - (a.start ? a.start : 0)) : Nr.stat(a.path, function(n, t) {
    if (n) {
      e(n);
      return;
    }
    var i = t.size - (a.start ? a.start : 0);
    e(null, i);
  }) : le(a, "httpVersion") ? e(null, Number(a.headers["content-length"])) : le(a, "httpModule") ? (a.on("response", function(n) {
    a.pause(), e(null, Number(n.headers["content-length"]));
  }), a.resume()) : e("Unknown stream");
};
R.prototype._multiPartHeader = function(a, e, n) {
  if (typeof n.header == "string")
    return n.header;
  var t = this._getContentDisposition(e, n), i = this._getContentType(e, n), o = "", s = {
    // add custom disposition as third element or keep it two elements if not
    "Content-Disposition": ["form-data", 'name="' + a + '"'].concat(t || []),
    // if no content type. allow it to be empty array
    "Content-Type": [].concat(i || [])
  };
  typeof n.header == "object" && Za(s, n.header);
  var r;
  for (var l in s)
    if (le(s, l)) {
      if (r = s[l], r == null)
        continue;
      Array.isArray(r) || (r = [r]), r.length && (o += l + ": " + r.join("; ") + R.LINE_BREAK);
    }
  return "--" + this.getBoundary() + R.LINE_BREAK + o + R.LINE_BREAK;
};
R.prototype._getContentDisposition = function(a, e) {
  var n;
  if (typeof e.filepath == "string" ? n = Ba.normalize(e.filepath).replace(/\\/g, "/") : e.filename || a && (a.name || a.path) ? n = Ba.basename(e.filename || a && (a.name || a.path)) : a && a.readable && le(a, "httpVersion") && (n = Ba.basename(a.client._httpMessage.path || "")), n)
    return 'filename="' + n + '"';
};
R.prototype._getContentType = function(a, e) {
  var n = e.contentType;
  return !n && a && a.name && (n = qa.lookup(a.name)), !n && a && a.path && (n = qa.lookup(a.path)), !n && a && a.readable && le(a, "httpVersion") && (n = a.headers["content-type"]), !n && (e.filepath || e.filename) && (n = qa.lookup(e.filepath || e.filename)), !n && a && typeof a == "object" && (n = R.DEFAULT_CONTENT_TYPE), n;
};
R.prototype._multiPartFooter = function() {
  return (function(a) {
    var e = R.LINE_BREAK, n = this._streams.length === 0;
    n && (e += this._lastBoundary()), a(e);
  }).bind(this);
};
R.prototype._lastBoundary = function() {
  return "--" + this.getBoundary() + "--" + R.LINE_BREAK;
};
R.prototype.getHeaders = function(a) {
  var e, n = {
    "content-type": "multipart/form-data; boundary=" + this.getBoundary()
  };
  for (e in a)
    le(a, e) && (n[e.toLowerCase()] = a[e]);
  return n;
};
R.prototype.setBoundary = function(a) {
  if (typeof a != "string")
    throw new TypeError("FormData boundary must be a string");
  this._boundary = a;
};
R.prototype.getBoundary = function() {
  return this._boundary || this._generateBoundary(), this._boundary;
};
R.prototype.getBuffer = function() {
  for (var a = new Buffer.alloc(0), e = this.getBoundary(), n = 0, t = this._streams.length; n < t; n++)
    typeof this._streams[n] != "function" && (Buffer.isBuffer(this._streams[n]) ? a = Buffer.concat([a, this._streams[n]]) : a = Buffer.concat([a, Buffer.from(this._streams[n])]), (typeof this._streams[n] != "string" || this._streams[n].substring(2, e.length + 2) !== e) && (a = Buffer.concat([a, Buffer.from(R.LINE_BREAK)])));
  return Buffer.concat([a, Buffer.from(this._lastBoundary())]);
};
R.prototype._generateBoundary = function() {
  this._boundary = "--------------------------" + Ur.randomBytes(12).toString("hex");
};
R.prototype.getLengthSync = function() {
  var a = this._overheadLength + this._valueLength;
  return this._streams.length && (a += this._lastBoundary().length), this.hasKnownLength() || this._error(new Error("Cannot calculate proper length in synchronous way.")), a;
};
R.prototype.hasKnownLength = function() {
  var a = !0;
  return this._valuesToMeasure.length && (a = !1), a;
};
R.prototype.getLength = function(a) {
  var e = this._overheadLength + this._valueLength;
  if (this._streams.length && (e += this._lastBoundary().length), !this._valuesToMeasure.length) {
    process.nextTick(a.bind(this, null, e));
    return;
  }
  Dr.parallel(this._valuesToMeasure, this._lengthRetriever, function(n, t) {
    if (n) {
      a(n);
      return;
    }
    t.forEach(function(i) {
      e += i;
    }), a(null, e);
  });
};
R.prototype.submit = function(a, e) {
  var n, t, i = { method: "post" };
  return typeof a == "string" ? (a = Fr(a), t = Za({
    port: a.port,
    path: a.pathname,
    host: a.hostname,
    protocol: a.protocol
  }, i)) : (t = Za(a, i), t.port || (t.port = t.protocol === "https:" ? 443 : 80)), t.headers = this.getHeaders(a.headers), t.protocol === "https:" ? n = Pr.request(t) : n = Ar.request(t), this.getLength((function(o, s) {
    if (o && o !== "Unknown stream") {
      this._error(o);
      return;
    }
    if (s && n.setHeader("Content-Length", s), this.pipe(n), e) {
      var r, l = function(d, c) {
        return n.removeListener("error", l), n.removeListener("response", r), e.call(this, d, c);
      };
      r = l.bind(this, null), n.on("error", l), n.on("response", r);
    }
  }).bind(this)), n;
};
R.prototype._error = function(a) {
  this.error || (this.error = a, this.pause(), this.emit("error", a));
};
R.prototype.toString = function() {
  return "[object FormData]";
};
Ir(R.prototype, "FormData");
var Br = R;
const pi = /* @__PURE__ */ Ht(Br);
function en(a) {
  return m.isPlainObject(a) || m.isArray(a);
}
function li(a) {
  return m.endsWith(a, "[]") ? a.slice(0, -2) : a;
}
function nt(a, e, n) {
  return a ? a.concat(e).map(function(i, o) {
    return i = li(i), !n && o ? "[" + i + "]" : i;
  }).join(n ? "." : "") : e;
}
function qr(a) {
  return m.isArray(a) && !a.some(en);
}
const zr = m.toFlatObject(m, {}, null, function(e) {
  return /^is[A-Z]/.test(e);
});
function wa(a, e, n) {
  if (!m.isObject(a))
    throw new TypeError("target must be an object");
  e = e || new (pi || FormData)(), n = m.toFlatObject(n, {
    metaTokens: !0,
    dots: !1,
    indexes: !1
  }, !1, function(v, x) {
    return !m.isUndefined(x[v]);
  });
  const t = n.metaTokens, i = n.visitor || c, o = n.dots, s = n.indexes, l = (n.Blob || typeof Blob < "u" && Blob) && m.isSpecCompliantForm(e);
  if (!m.isFunction(i))
    throw new TypeError("visitor must be a function");
  function d(f) {
    if (f === null) return "";
    if (m.isDate(f))
      return f.toISOString();
    if (m.isBoolean(f))
      return f.toString();
    if (!l && m.isBlob(f))
      throw new b("Blob is not supported. Use a Buffer instead.");
    return m.isArrayBuffer(f) || m.isTypedArray(f) ? l && typeof Blob == "function" ? new Blob([f]) : Buffer.from(f) : f;
  }
  function c(f, v, x) {
    let g = f;
    if (f && !x && typeof f == "object") {
      if (m.endsWith(v, "{}"))
        v = t ? v : v.slice(0, -2), f = JSON.stringify(f);
      else if (m.isArray(f) && qr(f) || (m.isFileList(f) || m.endsWith(v, "[]")) && (g = m.toArray(f)))
        return v = li(v), g.forEach(function(E, S) {
          !(m.isUndefined(E) || E === null) && e.append(
            // eslint-disable-next-line no-nested-ternary
            s === !0 ? nt([v], S, o) : s === null ? v : v + "[]",
            d(E)
          );
        }), !1;
    }
    return en(f) ? !0 : (e.append(nt(x, v, o), d(f)), !1);
  }
  const p = [], u = Object.assign(zr, {
    defaultVisitor: c,
    convertValue: d,
    isVisitable: en
  });
  function h(f, v) {
    if (!m.isUndefined(f)) {
      if (p.indexOf(f) !== -1)
        throw Error("Circular reference detected in " + v.join("."));
      p.push(f), m.forEach(f, function(g, w) {
        (!(m.isUndefined(g) || g === null) && i.call(
          e,
          g,
          m.isString(w) ? w.trim() : w,
          v,
          u
        )) === !0 && h(g, v ? v.concat(w) : [w]);
      }), p.pop();
    }
  }
  if (!m.isObject(a))
    throw new TypeError("data must be an object");
  return h(a), e;
}
function tt(a) {
  const e = {
    "!": "%21",
    "'": "%27",
    "(": "%28",
    ")": "%29",
    "~": "%7E",
    "%20": "+",
    "%00": "\0"
  };
  return encodeURIComponent(a).replace(/[!'()~]|%20|%00/g, function(t) {
    return e[t];
  });
}
function ui(a, e) {
  this._pairs = [], a && wa(a, this, e);
}
const di = ui.prototype;
di.append = function(e, n) {
  this._pairs.push([e, n]);
};
di.toString = function(e) {
  const n = e ? function(t) {
    return e.call(this, t, tt);
  } : tt;
  return this._pairs.map(function(i) {
    return n(i[0]) + "=" + n(i[1]);
  }, "").join("&");
};
function $r(a) {
  return encodeURIComponent(a).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
}
function hn(a, e, n) {
  if (!e)
    return a;
  const t = n && n.encode || $r, i = m.isFunction(n) ? {
    serialize: n
  } : n, o = i && i.serialize;
  let s;
  if (o ? s = o(e, i) : s = m.isURLSearchParams(e) ? e.toString() : new ui(e, i).toString(t), s) {
    const r = a.indexOf("#");
    r !== -1 && (a = a.slice(0, r)), a += (a.indexOf("?") === -1 ? "?" : "&") + s;
  }
  return a;
}
class it {
  constructor() {
    this.handlers = [];
  }
  /**
   * Add a new interceptor to the stack
   *
   * @param {Function} fulfilled The function to handle `then` for a `Promise`
   * @param {Function} rejected The function to handle `reject` for a `Promise`
   * @param {Object} options The options for the interceptor, synchronous and runWhen
   *
   * @return {Number} An ID used to remove interceptor later
   */
  use(e, n, t) {
    return this.handlers.push({
      fulfilled: e,
      rejected: n,
      synchronous: t ? t.synchronous : !1,
      runWhen: t ? t.runWhen : null
    }), this.handlers.length - 1;
  }
  /**
   * Remove an interceptor from the stack
   *
   * @param {Number} id The ID that was returned by `use`
   *
   * @returns {void}
   */
  eject(e) {
    this.handlers[e] && (this.handlers[e] = null);
  }
  /**
   * Clear all interceptors from the stack
   *
   * @returns {void}
   */
  clear() {
    this.handlers && (this.handlers = []);
  }
  /**
   * Iterate over all the registered interceptors
   *
   * This method is particularly useful for skipping over any
   * interceptors that may have become `null` calling `eject`.
   *
   * @param {Function} fn The function to call for each interceptor
   *
   * @returns {void}
   */
  forEach(e) {
    m.forEach(this.handlers, function(t) {
      t !== null && e(t);
    });
  }
}
const vn = {
  silentJSONParsing: !0,
  forcedJSONParsing: !0,
  clarifyTimeoutError: !1
}, Mr = xa.URLSearchParams, za = "abcdefghijklmnopqrstuvwxyz", ot = "0123456789", mi = {
  DIGIT: ot,
  ALPHA: za,
  ALPHA_DIGIT: za + za.toUpperCase() + ot
}, Hr = (a = 16, e = mi.ALPHA_DIGIT) => {
  let n = "";
  const { length: t } = e, i = new Uint32Array(a);
  ln.randomFillSync(i);
  for (let o = 0; o < a; o++)
    n += e[i[o] % t];
  return n;
}, Wr = {
  isNode: !0,
  classes: {
    URLSearchParams: Mr,
    FormData: pi,
    Blob: typeof Blob < "u" && Blob || null
  },
  ALPHABET: mi,
  generateString: Hr,
  protocols: ["http", "https", "file", "data"]
}, bn = typeof window < "u" && typeof document < "u", an = typeof navigator == "object" && navigator || void 0, Vr = bn && (!an || ["ReactNative", "NativeScript", "NS"].indexOf(an.product) < 0), Gr = typeof WorkerGlobalScope < "u" && // eslint-disable-next-line no-undef
self instanceof WorkerGlobalScope && typeof self.importScripts == "function", Xr = bn && window.location.href || "http://localhost", Jr = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  hasBrowserEnv: bn,
  hasStandardBrowserEnv: Vr,
  hasStandardBrowserWebWorkerEnv: Gr,
  navigator: an,
  origin: Xr
}, Symbol.toStringTag, { value: "Module" })), N = {
  ...Jr,
  ...Wr
};
function Kr(a, e) {
  return wa(a, new N.classes.URLSearchParams(), {
    visitor: function(n, t, i, o) {
      return N.isNode && m.isBuffer(n) ? (this.append(t, n.toString("base64")), !1) : o.defaultVisitor.apply(this, arguments);
    },
    ...e
  });
}
function Yr(a) {
  return m.matchAll(/\w+|\[(\w*)]/g, a).map((e) => e[0] === "[]" ? "" : e[1] || e[0]);
}
function Qr(a) {
  const e = {}, n = Object.keys(a);
  let t;
  const i = n.length;
  let o;
  for (t = 0; t < i; t++)
    o = n[t], e[o] = a[o];
  return e;
}
function fi(a) {
  function e(n, t, i, o) {
    let s = n[o++];
    if (s === "__proto__") return !0;
    const r = Number.isFinite(+s), l = o >= n.length;
    return s = !s && m.isArray(i) ? i.length : s, l ? (m.hasOwnProp(i, s) ? i[s] = [i[s], t] : i[s] = t, !r) : ((!i[s] || !m.isObject(i[s])) && (i[s] = []), e(n, t, i[s], o) && m.isArray(i[s]) && (i[s] = Qr(i[s])), !r);
  }
  if (m.isFormData(a) && m.isFunction(a.entries)) {
    const n = {};
    return m.forEachEntry(a, (t, i) => {
      e(Yr(t), i, n, 0);
    }), n;
  }
  return null;
}
function Zr(a, e, n) {
  if (m.isString(a))
    try {
      return (e || JSON.parse)(a), m.trim(a);
    } catch (t) {
      if (t.name !== "SyntaxError")
        throw t;
    }
  return (n || JSON.stringify)(a);
}
const We = {
  transitional: vn,
  adapter: ["xhr", "http", "fetch"],
  transformRequest: [function(e, n) {
    const t = n.getContentType() || "", i = t.indexOf("application/json") > -1, o = m.isObject(e);
    if (o && m.isHTMLForm(e) && (e = new FormData(e)), m.isFormData(e))
      return i ? JSON.stringify(fi(e)) : e;
    if (m.isArrayBuffer(e) || m.isBuffer(e) || m.isStream(e) || m.isFile(e) || m.isBlob(e) || m.isReadableStream(e))
      return e;
    if (m.isArrayBufferView(e))
      return e.buffer;
    if (m.isURLSearchParams(e))
      return n.setContentType("application/x-www-form-urlencoded;charset=utf-8", !1), e.toString();
    let r;
    if (o) {
      if (t.indexOf("application/x-www-form-urlencoded") > -1)
        return Kr(e, this.formSerializer).toString();
      if ((r = m.isFileList(e)) || t.indexOf("multipart/form-data") > -1) {
        const l = this.env && this.env.FormData;
        return wa(
          r ? { "files[]": e } : e,
          l && new l(),
          this.formSerializer
        );
      }
    }
    return o || i ? (n.setContentType("application/json", !1), Zr(e)) : e;
  }],
  transformResponse: [function(e) {
    const n = this.transitional || We.transitional, t = n && n.forcedJSONParsing, i = this.responseType === "json";
    if (m.isResponse(e) || m.isReadableStream(e))
      return e;
    if (e && m.isString(e) && (t && !this.responseType || i)) {
      const s = !(n && n.silentJSONParsing) && i;
      try {
        return JSON.parse(e, this.parseReviver);
      } catch (r) {
        if (s)
          throw r.name === "SyntaxError" ? b.from(r, b.ERR_BAD_RESPONSE, this, null, this.response) : r;
      }
    }
    return e;
  }],
  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,
  xsrfCookieName: "XSRF-TOKEN",
  xsrfHeaderName: "X-XSRF-TOKEN",
  maxContentLength: -1,
  maxBodyLength: -1,
  env: {
    FormData: N.classes.FormData,
    Blob: N.classes.Blob
  },
  validateStatus: function(e) {
    return e >= 200 && e < 300;
  },
  headers: {
    common: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": void 0
    }
  }
};
m.forEach(["delete", "get", "head", "post", "put", "patch"], (a) => {
  We.headers[a] = {};
});
const ec = m.toObjectSet([
  "age",
  "authorization",
  "content-length",
  "content-type",
  "etag",
  "expires",
  "from",
  "host",
  "if-modified-since",
  "if-unmodified-since",
  "last-modified",
  "location",
  "max-forwards",
  "proxy-authorization",
  "referer",
  "retry-after",
  "user-agent"
]), ac = (a) => {
  const e = {};
  let n, t, i;
  return a && a.split(`
`).forEach(function(s) {
    i = s.indexOf(":"), n = s.substring(0, i).trim().toLowerCase(), t = s.substring(i + 1).trim(), !(!n || e[n] && ec[n]) && (n === "set-cookie" ? e[n] ? e[n].push(t) : e[n] = [t] : e[n] = e[n] ? e[n] + ", " + t : t);
  }), e;
}, st = Symbol("internals");
function Fe(a) {
  return a && String(a).trim().toLowerCase();
}
function sa(a) {
  return a === !1 || a == null ? a : m.isArray(a) ? a.map(sa) : String(a);
}
function nc(a) {
  const e = /* @__PURE__ */ Object.create(null), n = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let t;
  for (; t = n.exec(a); )
    e[t[1]] = t[2];
  return e;
}
const tc = (a) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(a.trim());
function $a(a, e, n, t, i) {
  if (m.isFunction(t))
    return t.call(this, e, n);
  if (i && (e = n), !!m.isString(e)) {
    if (m.isString(t))
      return e.indexOf(t) !== -1;
    if (m.isRegExp(t))
      return t.test(e);
  }
}
function ic(a) {
  return a.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (e, n, t) => n.toUpperCase() + t);
}
function oc(a, e) {
  const n = m.toCamelCase(" " + e);
  ["get", "set", "has"].forEach((t) => {
    Object.defineProperty(a, t + n, {
      value: function(i, o, s) {
        return this[t].call(this, e, i, o, s);
      },
      configurable: !0
    });
  });
}
let $ = class {
  constructor(e) {
    e && this.set(e);
  }
  set(e, n, t) {
    const i = this;
    function o(r, l, d) {
      const c = Fe(l);
      if (!c)
        throw new Error("header name must be a non-empty string");
      const p = m.findKey(i, c);
      (!p || i[p] === void 0 || d === !0 || d === void 0 && i[p] !== !1) && (i[p || l] = sa(r));
    }
    const s = (r, l) => m.forEach(r, (d, c) => o(d, c, l));
    if (m.isPlainObject(e) || e instanceof this.constructor)
      s(e, n);
    else if (m.isString(e) && (e = e.trim()) && !tc(e))
      s(ac(e), n);
    else if (m.isObject(e) && m.isIterable(e)) {
      let r = {}, l, d;
      for (const c of e) {
        if (!m.isArray(c))
          throw TypeError("Object iterator must return a key-value pair");
        r[d = c[0]] = (l = r[d]) ? m.isArray(l) ? [...l, c[1]] : [l, c[1]] : c[1];
      }
      s(r, n);
    } else
      e != null && o(n, e, t);
    return this;
  }
  get(e, n) {
    if (e = Fe(e), e) {
      const t = m.findKey(this, e);
      if (t) {
        const i = this[t];
        if (!n)
          return i;
        if (n === !0)
          return nc(i);
        if (m.isFunction(n))
          return n.call(this, i, t);
        if (m.isRegExp(n))
          return n.exec(i);
        throw new TypeError("parser must be boolean|regexp|function");
      }
    }
  }
  has(e, n) {
    if (e = Fe(e), e) {
      const t = m.findKey(this, e);
      return !!(t && this[t] !== void 0 && (!n || $a(this, this[t], t, n)));
    }
    return !1;
  }
  delete(e, n) {
    const t = this;
    let i = !1;
    function o(s) {
      if (s = Fe(s), s) {
        const r = m.findKey(t, s);
        r && (!n || $a(t, t[r], r, n)) && (delete t[r], i = !0);
      }
    }
    return m.isArray(e) ? e.forEach(o) : o(e), i;
  }
  clear(e) {
    const n = Object.keys(this);
    let t = n.length, i = !1;
    for (; t--; ) {
      const o = n[t];
      (!e || $a(this, this[o], o, e, !0)) && (delete this[o], i = !0);
    }
    return i;
  }
  normalize(e) {
    const n = this, t = {};
    return m.forEach(this, (i, o) => {
      const s = m.findKey(t, o);
      if (s) {
        n[s] = sa(i), delete n[o];
        return;
      }
      const r = e ? ic(o) : String(o).trim();
      r !== o && delete n[o], n[r] = sa(i), t[r] = !0;
    }), this;
  }
  concat(...e) {
    return this.constructor.concat(this, ...e);
  }
  toJSON(e) {
    const n = /* @__PURE__ */ Object.create(null);
    return m.forEach(this, (t, i) => {
      t != null && t !== !1 && (n[i] = e && m.isArray(t) ? t.join(", ") : t);
    }), n;
  }
  [Symbol.iterator]() {
    return Object.entries(this.toJSON())[Symbol.iterator]();
  }
  toString() {
    return Object.entries(this.toJSON()).map(([e, n]) => e + ": " + n).join(`
`);
  }
  getSetCookie() {
    return this.get("set-cookie") || [];
  }
  get [Symbol.toStringTag]() {
    return "AxiosHeaders";
  }
  static from(e) {
    return e instanceof this ? e : new this(e);
  }
  static concat(e, ...n) {
    const t = new this(e);
    return n.forEach((i) => t.set(i)), t;
  }
  static accessor(e) {
    const t = (this[st] = this[st] = {
      accessors: {}
    }).accessors, i = this.prototype;
    function o(s) {
      const r = Fe(s);
      t[r] || (oc(i, s), t[r] = !0);
    }
    return m.isArray(e) ? e.forEach(o) : o(e), this;
  }
};
$.accessor(["Content-Type", "Content-Length", "Accept", "Accept-Encoding", "User-Agent", "Authorization"]);
m.reduceDescriptors($.prototype, ({ value: a }, e) => {
  let n = e[0].toUpperCase() + e.slice(1);
  return {
    get: () => a,
    set(t) {
      this[n] = t;
    }
  };
});
m.freezeMethods($);
function Ma(a, e) {
  const n = this || We, t = e || n, i = $.from(t.headers);
  let o = t.data;
  return m.forEach(a, function(r) {
    o = r.call(n, o, i.normalize(), e ? e.status : void 0);
  }), i.normalize(), o;
}
function xi(a) {
  return !!(a && a.__CANCEL__);
}
let ve = class extends b {
  /**
   * A `CanceledError` is an object that is thrown when an operation is canceled.
   *
   * @param {string=} message The message.
   * @param {Object=} config The config.
   * @param {Object=} request The request.
   *
   * @returns {CanceledError} The created error.
   */
  constructor(e, n, t) {
    super(e ?? "canceled", b.ERR_CANCELED, n, t), this.name = "CanceledError", this.__CANCEL__ = !0;
  }
};
function Se(a, e, n) {
  const t = n.config.validateStatus;
  !n.status || !t || t(n.status) ? a(n) : e(new b(
    "Request failed with status code " + n.status,
    [b.ERR_BAD_REQUEST, b.ERR_BAD_RESPONSE][Math.floor(n.status / 100) - 4],
    n.config,
    n.request,
    n
  ));
}
function sc(a) {
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(a);
}
function rc(a, e) {
  return e ? a.replace(/\/?\/$/, "") + "/" + e.replace(/^\/+/, "") : a;
}
function gn(a, e, n) {
  let t = !sc(e);
  return a && (t || n == !1) ? rc(a, e) : e;
}
var hi = {}, cc = xa.parse, pc = {
  ftp: 21,
  gopher: 70,
  http: 80,
  https: 443,
  ws: 80,
  wss: 443
}, lc = String.prototype.endsWith || function(a) {
  return a.length <= this.length && this.indexOf(a, this.length - a.length) !== -1;
};
function uc(a) {
  var e = typeof a == "string" ? cc(a) : a || {}, n = e.protocol, t = e.host, i = e.port;
  if (typeof t != "string" || !t || typeof n != "string" || (n = n.split(":", 1)[0], t = t.replace(/:\d*$/, ""), i = parseInt(i) || pc[n] || 0, !dc(t, i)))
    return "";
  var o = ke("npm_config_" + n + "_proxy") || ke(n + "_proxy") || ke("npm_config_proxy") || ke("all_proxy");
  return o && o.indexOf("://") === -1 && (o = n + "://" + o), o;
}
function dc(a, e) {
  var n = (ke("npm_config_no_proxy") || ke("no_proxy")).toLowerCase();
  return n ? n === "*" ? !1 : n.split(/[,\s]/).every(function(t) {
    if (!t)
      return !0;
    var i = t.match(/^(.+):(\d+)$/), o = i ? i[1] : t, s = i ? parseInt(i[2]) : 0;
    return s && s !== e ? !0 : /^[.*]/.test(o) ? (o.charAt(0) === "*" && (o = o.slice(1)), !lc.call(a, o)) : a !== o;
  }) : !0;
}
function ke(a) {
  return process.env[a.toLowerCase()] || process.env[a.toUpperCase()] || "";
}
hi.getProxyForUrl = uc;
var yn = { exports: {} }, Qe = { exports: {} }, Ze = { exports: {} }, Ha, rt;
function mc() {
  if (rt) return Ha;
  rt = 1;
  var a = 1e3, e = a * 60, n = e * 60, t = n * 24, i = t * 7, o = t * 365.25;
  Ha = function(c, p) {
    p = p || {};
    var u = typeof c;
    if (u === "string" && c.length > 0)
      return s(c);
    if (u === "number" && isFinite(c))
      return p.long ? l(c) : r(c);
    throw new Error(
      "val is not a non-empty string or a valid number. val=" + JSON.stringify(c)
    );
  };
  function s(c) {
    if (c = String(c), !(c.length > 100)) {
      var p = /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
        c
      );
      if (p) {
        var u = parseFloat(p[1]), h = (p[2] || "ms").toLowerCase();
        switch (h) {
          case "years":
          case "year":
          case "yrs":
          case "yr":
          case "y":
            return u * o;
          case "weeks":
          case "week":
          case "w":
            return u * i;
          case "days":
          case "day":
          case "d":
            return u * t;
          case "hours":
          case "hour":
          case "hrs":
          case "hr":
          case "h":
            return u * n;
          case "minutes":
          case "minute":
          case "mins":
          case "min":
          case "m":
            return u * e;
          case "seconds":
          case "second":
          case "secs":
          case "sec":
          case "s":
            return u * a;
          case "milliseconds":
          case "millisecond":
          case "msecs":
          case "msec":
          case "ms":
            return u;
          default:
            return;
        }
      }
    }
  }
  function r(c) {
    var p = Math.abs(c);
    return p >= t ? Math.round(c / t) + "d" : p >= n ? Math.round(c / n) + "h" : p >= e ? Math.round(c / e) + "m" : p >= a ? Math.round(c / a) + "s" : c + "ms";
  }
  function l(c) {
    var p = Math.abs(c);
    return p >= t ? d(c, p, t, "day") : p >= n ? d(c, p, n, "hour") : p >= e ? d(c, p, e, "minute") : p >= a ? d(c, p, a, "second") : c + " ms";
  }
  function d(c, p, u, h) {
    var f = p >= u * 1.5;
    return Math.round(c / u) + " " + h + (f ? "s" : "");
  }
  return Ha;
}
var Wa, ct;
function vi() {
  if (ct) return Wa;
  ct = 1;
  function a(e) {
    t.debug = t, t.default = t, t.coerce = d, t.disable = r, t.enable = o, t.enabled = l, t.humanize = mc(), t.destroy = c, Object.keys(e).forEach((p) => {
      t[p] = e[p];
    }), t.names = [], t.skips = [], t.formatters = {};
    function n(p) {
      let u = 0;
      for (let h = 0; h < p.length; h++)
        u = (u << 5) - u + p.charCodeAt(h), u |= 0;
      return t.colors[Math.abs(u) % t.colors.length];
    }
    t.selectColor = n;
    function t(p) {
      let u, h = null, f, v;
      function x(...g) {
        if (!x.enabled)
          return;
        const w = x, E = Number(/* @__PURE__ */ new Date()), S = E - (u || E);
        w.diff = S, w.prev = u, w.curr = E, u = E, g[0] = t.coerce(g[0]), typeof g[0] != "string" && g.unshift("%O");
        let D = 0;
        g[0] = g[0].replace(/%([a-zA-Z%])/g, (F, I) => {
          if (F === "%%")
            return "%";
          D++;
          const Y = t.formatters[I];
          if (typeof Y == "function") {
            const se = g[D];
            F = Y.call(w, se), g.splice(D, 1), D--;
          }
          return F;
        }), t.formatArgs.call(w, g), (w.log || t.log).apply(w, g);
      }
      return x.namespace = p, x.useColors = t.useColors(), x.color = t.selectColor(p), x.extend = i, x.destroy = t.destroy, Object.defineProperty(x, "enabled", {
        enumerable: !0,
        configurable: !1,
        get: () => h !== null ? h : (f !== t.namespaces && (f = t.namespaces, v = t.enabled(p)), v),
        set: (g) => {
          h = g;
        }
      }), typeof t.init == "function" && t.init(x), x;
    }
    function i(p, u) {
      const h = t(this.namespace + (typeof u > "u" ? ":" : u) + p);
      return h.log = this.log, h;
    }
    function o(p) {
      t.save(p), t.namespaces = p, t.names = [], t.skips = [];
      const u = (typeof p == "string" ? p : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
      for (const h of u)
        h[0] === "-" ? t.skips.push(h.slice(1)) : t.names.push(h);
    }
    function s(p, u) {
      let h = 0, f = 0, v = -1, x = 0;
      for (; h < p.length; )
        if (f < u.length && (u[f] === p[h] || u[f] === "*"))
          u[f] === "*" ? (v = f, x = h, f++) : (h++, f++);
        else if (v !== -1)
          f = v + 1, x++, h = x;
        else
          return !1;
      for (; f < u.length && u[f] === "*"; )
        f++;
      return f === u.length;
    }
    function r() {
      const p = [
        ...t.names,
        ...t.skips.map((u) => "-" + u)
      ].join(",");
      return t.enable(""), p;
    }
    function l(p) {
      for (const u of t.skips)
        if (s(p, u))
          return !1;
      for (const u of t.names)
        if (s(p, u))
          return !0;
      return !1;
    }
    function d(p) {
      return p instanceof Error ? p.stack || p.message : p;
    }
    function c() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    return t.enable(t.load()), t;
  }
  return Wa = a, Wa;
}
var pt;
function fc() {
  return pt || (pt = 1, function(a, e) {
    e.formatArgs = t, e.save = i, e.load = o, e.useColors = n, e.storage = s(), e.destroy = /* @__PURE__ */ (() => {
      let l = !1;
      return () => {
        l || (l = !0, console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."));
      };
    })(), e.colors = [
      "#0000CC",
      "#0000FF",
      "#0033CC",
      "#0033FF",
      "#0066CC",
      "#0066FF",
      "#0099CC",
      "#0099FF",
      "#00CC00",
      "#00CC33",
      "#00CC66",
      "#00CC99",
      "#00CCCC",
      "#00CCFF",
      "#3300CC",
      "#3300FF",
      "#3333CC",
      "#3333FF",
      "#3366CC",
      "#3366FF",
      "#3399CC",
      "#3399FF",
      "#33CC00",
      "#33CC33",
      "#33CC66",
      "#33CC99",
      "#33CCCC",
      "#33CCFF",
      "#6600CC",
      "#6600FF",
      "#6633CC",
      "#6633FF",
      "#66CC00",
      "#66CC33",
      "#9900CC",
      "#9900FF",
      "#9933CC",
      "#9933FF",
      "#99CC00",
      "#99CC33",
      "#CC0000",
      "#CC0033",
      "#CC0066",
      "#CC0099",
      "#CC00CC",
      "#CC00FF",
      "#CC3300",
      "#CC3333",
      "#CC3366",
      "#CC3399",
      "#CC33CC",
      "#CC33FF",
      "#CC6600",
      "#CC6633",
      "#CC9900",
      "#CC9933",
      "#CCCC00",
      "#CCCC33",
      "#FF0000",
      "#FF0033",
      "#FF0066",
      "#FF0099",
      "#FF00CC",
      "#FF00FF",
      "#FF3300",
      "#FF3333",
      "#FF3366",
      "#FF3399",
      "#FF33CC",
      "#FF33FF",
      "#FF6600",
      "#FF6633",
      "#FF9900",
      "#FF9933",
      "#FFCC00",
      "#FFCC33"
    ];
    function n() {
      if (typeof window < "u" && window.process && (window.process.type === "renderer" || window.process.__nwjs))
        return !0;
      if (typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/))
        return !1;
      let l;
      return typeof document < "u" && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance || // Is firebug? http://stackoverflow.com/a/398120/376773
      typeof window < "u" && window.console && (window.console.firebug || window.console.exception && window.console.table) || // Is firefox >= v31?
      // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
      typeof navigator < "u" && navigator.userAgent && (l = navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/)) && parseInt(l[1], 10) >= 31 || // Double check webkit in userAgent just in case we are in a worker
      typeof navigator < "u" && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/);
    }
    function t(l) {
      if (l[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + l[0] + (this.useColors ? "%c " : " ") + "+" + a.exports.humanize(this.diff), !this.useColors)
        return;
      const d = "color: " + this.color;
      l.splice(1, 0, d, "color: inherit");
      let c = 0, p = 0;
      l[0].replace(/%[a-zA-Z%]/g, (u) => {
        u !== "%%" && (c++, u === "%c" && (p = c));
      }), l.splice(p, 0, d);
    }
    e.log = console.debug || console.log || (() => {
    });
    function i(l) {
      try {
        l ? e.storage.setItem("debug", l) : e.storage.removeItem("debug");
      } catch {
      }
    }
    function o() {
      let l;
      try {
        l = e.storage.getItem("debug") || e.storage.getItem("DEBUG");
      } catch {
      }
      return !l && typeof process < "u" && "env" in process && (l = process.env.DEBUG), l;
    }
    function s() {
      try {
        return localStorage;
      } catch {
      }
    }
    a.exports = vi()(e);
    const { formatters: r } = a.exports;
    r.j = function(l) {
      try {
        return JSON.stringify(l);
      } catch (d) {
        return "[UnexpectedJSONParseError]: " + d.message;
      }
    };
  }(Ze, Ze.exports)), Ze.exports;
}
var ea = { exports: {} }, Va, lt;
function xc() {
  return lt || (lt = 1, Va = (a, e = process.argv) => {
    const n = a.startsWith("-") ? "" : a.length === 1 ? "-" : "--", t = e.indexOf(n + a), i = e.indexOf("--");
    return t !== -1 && (i === -1 || t < i);
  }), Va;
}
var Ga, ut;
function hc() {
  if (ut) return Ga;
  ut = 1;
  const a = $i, e = Nt, n = xc(), { env: t } = process;
  let i;
  n("no-color") || n("no-colors") || n("color=false") || n("color=never") ? i = 0 : (n("color") || n("colors") || n("color=true") || n("color=always")) && (i = 1), "FORCE_COLOR" in t && (t.FORCE_COLOR === "true" ? i = 1 : t.FORCE_COLOR === "false" ? i = 0 : i = t.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(t.FORCE_COLOR, 10), 3));
  function o(l) {
    return l === 0 ? !1 : {
      level: l,
      hasBasic: !0,
      has256: l >= 2,
      has16m: l >= 3
    };
  }
  function s(l, d) {
    if (i === 0)
      return 0;
    if (n("color=16m") || n("color=full") || n("color=truecolor"))
      return 3;
    if (n("color=256"))
      return 2;
    if (l && !d && i === void 0)
      return 0;
    const c = i || 0;
    if (t.TERM === "dumb")
      return c;
    if (process.platform === "win32") {
      const p = a.release().split(".");
      return Number(p[0]) >= 10 && Number(p[2]) >= 10586 ? Number(p[2]) >= 14931 ? 3 : 2 : 1;
    }
    if ("CI" in t)
      return ["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((p) => p in t) || t.CI_NAME === "codeship" ? 1 : c;
    if ("TEAMCITY_VERSION" in t)
      return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(t.TEAMCITY_VERSION) ? 1 : 0;
    if (t.COLORTERM === "truecolor")
      return 3;
    if ("TERM_PROGRAM" in t) {
      const p = parseInt((t.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
      switch (t.TERM_PROGRAM) {
        case "iTerm.app":
          return p >= 3 ? 3 : 2;
        case "Apple_Terminal":
          return 2;
      }
    }
    return /-256(color)?$/i.test(t.TERM) ? 2 : /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(t.TERM) || "COLORTERM" in t ? 1 : c;
  }
  function r(l) {
    const d = s(l, l && l.isTTY);
    return o(d);
  }
  return Ga = {
    supportsColor: r,
    stdout: o(s(!0, e.isatty(1))),
    stderr: o(s(!0, e.isatty(2)))
  }, Ga;
}
var dt;
function vc() {
  return dt || (dt = 1, function(a, e) {
    const n = Nt, t = ye;
    e.init = c, e.log = r, e.formatArgs = o, e.save = l, e.load = d, e.useColors = i, e.destroy = t.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    ), e.colors = [6, 2, 3, 4, 5, 1];
    try {
      const u = hc();
      u && (u.stderr || u).level >= 2 && (e.colors = [
        20,
        21,
        26,
        27,
        32,
        33,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        56,
        57,
        62,
        63,
        68,
        69,
        74,
        75,
        76,
        77,
        78,
        79,
        80,
        81,
        92,
        93,
        98,
        99,
        112,
        113,
        128,
        129,
        134,
        135,
        148,
        149,
        160,
        161,
        162,
        163,
        164,
        165,
        166,
        167,
        168,
        169,
        170,
        171,
        172,
        173,
        178,
        179,
        184,
        185,
        196,
        197,
        198,
        199,
        200,
        201,
        202,
        203,
        204,
        205,
        206,
        207,
        208,
        209,
        214,
        215,
        220,
        221
      ]);
    } catch {
    }
    e.inspectOpts = Object.keys(process.env).filter((u) => /^debug_/i.test(u)).reduce((u, h) => {
      const f = h.substring(6).toLowerCase().replace(/_([a-z])/g, (x, g) => g.toUpperCase());
      let v = process.env[h];
      return /^(yes|on|true|enabled)$/i.test(v) ? v = !0 : /^(no|off|false|disabled)$/i.test(v) ? v = !1 : v === "null" ? v = null : v = Number(v), u[f] = v, u;
    }, {});
    function i() {
      return "colors" in e.inspectOpts ? !!e.inspectOpts.colors : n.isatty(process.stderr.fd);
    }
    function o(u) {
      const { namespace: h, useColors: f } = this;
      if (f) {
        const v = this.color, x = "\x1B[3" + (v < 8 ? v : "8;5;" + v), g = `  ${x};1m${h} \x1B[0m`;
        u[0] = g + u[0].split(`
`).join(`
` + g), u.push(x + "m+" + a.exports.humanize(this.diff) + "\x1B[0m");
      } else
        u[0] = s() + h + " " + u[0];
    }
    function s() {
      return e.inspectOpts.hideDate ? "" : (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function r(...u) {
      return process.stderr.write(t.formatWithOptions(e.inspectOpts, ...u) + `
`);
    }
    function l(u) {
      u ? process.env.DEBUG = u : delete process.env.DEBUG;
    }
    function d() {
      return process.env.DEBUG;
    }
    function c(u) {
      u.inspectOpts = {};
      const h = Object.keys(e.inspectOpts);
      for (let f = 0; f < h.length; f++)
        u.inspectOpts[h[f]] = e.inspectOpts[h[f]];
    }
    a.exports = vi()(e);
    const { formatters: p } = a.exports;
    p.o = function(u) {
      return this.inspectOpts.colors = this.useColors, t.inspect(u, this.inspectOpts).split(`
`).map((h) => h.trim()).join(" ");
    }, p.O = function(u) {
      return this.inspectOpts.colors = this.useColors, t.inspect(u, this.inspectOpts);
    };
  }(ea, ea.exports)), ea.exports;
}
var mt;
function bc() {
  return mt || (mt = 1, typeof process > "u" || process.type === "renderer" || process.browser === !0 || process.__nwjs ? Qe.exports = fc() : Qe.exports = vc()), Qe.exports;
}
var Ne, gc = function() {
  if (!Ne) {
    try {
      Ne = bc()("follow-redirects");
    } catch {
    }
    typeof Ne != "function" && (Ne = function() {
    });
  }
  Ne.apply(null, arguments);
}, Ve = xa, Ie = Ve.URL, yc = cn, wc = pn, wn = V.Writable, En = zi, bi = gc;
(function() {
  var e = typeof process < "u", n = typeof window < "u" && typeof document < "u", t = be(Error.captureStackTrace);
  !e && (n || !t) && console.warn("The follow-redirects package should be excluded from browser builds.");
})();
var _n = !1;
try {
  En(new Ie(""));
} catch (a) {
  _n = a.code === "ERR_INVALID_URL";
}
var Ec = [
  "auth",
  "host",
  "hostname",
  "href",
  "path",
  "pathname",
  "port",
  "protocol",
  "query",
  "search",
  "hash"
], Tn = ["abort", "aborted", "connect", "error", "socket", "timeout"], Rn = /* @__PURE__ */ Object.create(null);
Tn.forEach(function(a) {
  Rn[a] = function(e, n, t) {
    this._redirectable.emit(a, e, n, t);
  };
});
var nn = Ge(
  "ERR_INVALID_URL",
  "Invalid URL",
  TypeError
), tn = Ge(
  "ERR_FR_REDIRECTION_FAILURE",
  "Redirected request failed"
), _c = Ge(
  "ERR_FR_TOO_MANY_REDIRECTS",
  "Maximum number of redirects exceeded",
  tn
), Tc = Ge(
  "ERR_FR_MAX_BODY_LENGTH_EXCEEDED",
  "Request body larger than maxBodyLength limit"
), Rc = Ge(
  "ERR_STREAM_WRITE_AFTER_END",
  "write after end"
), Sc = wn.prototype.destroy || yi;
function X(a, e) {
  wn.call(this), this._sanitizeOptions(a), this._options = a, this._ended = !1, this._ending = !1, this._redirectCount = 0, this._redirects = [], this._requestBodyLength = 0, this._requestBodyBuffers = [], e && this.on("response", e);
  var n = this;
  this._onNativeResponse = function(t) {
    try {
      n._processResponse(t);
    } catch (i) {
      n.emit("error", i instanceof tn ? i : new tn({ cause: i }));
    }
  }, this._performRequest();
}
X.prototype = Object.create(wn.prototype);
X.prototype.abort = function() {
  kn(this._currentRequest), this._currentRequest.abort(), this.emit("abort");
};
X.prototype.destroy = function(a) {
  return kn(this._currentRequest, a), Sc.call(this, a), this;
};
X.prototype.write = function(a, e, n) {
  if (this._ending)
    throw new Rc();
  if (!xe(a) && !Cc(a))
    throw new TypeError("data should be a string, Buffer or Uint8Array");
  if (be(e) && (n = e, e = null), a.length === 0) {
    n && n();
    return;
  }
  this._requestBodyLength + a.length <= this._options.maxBodyLength ? (this._requestBodyLength += a.length, this._requestBodyBuffers.push({ data: a, encoding: e }), this._currentRequest.write(a, e, n)) : (this.emit("error", new Tc()), this.abort());
};
X.prototype.end = function(a, e, n) {
  if (be(a) ? (n = a, a = e = null) : be(e) && (n = e, e = null), !a)
    this._ended = this._ending = !0, this._currentRequest.end(null, null, n);
  else {
    var t = this, i = this._currentRequest;
    this.write(a, e, function() {
      t._ended = !0, i.end(null, null, n);
    }), this._ending = !0;
  }
};
X.prototype.setHeader = function(a, e) {
  this._options.headers[a] = e, this._currentRequest.setHeader(a, e);
};
X.prototype.removeHeader = function(a) {
  delete this._options.headers[a], this._currentRequest.removeHeader(a);
};
X.prototype.setTimeout = function(a, e) {
  var n = this;
  function t(s) {
    s.setTimeout(a), s.removeListener("timeout", s.destroy), s.addListener("timeout", s.destroy);
  }
  function i(s) {
    n._timeout && clearTimeout(n._timeout), n._timeout = setTimeout(function() {
      n.emit("timeout"), o();
    }, a), t(s);
  }
  function o() {
    n._timeout && (clearTimeout(n._timeout), n._timeout = null), n.removeListener("abort", o), n.removeListener("error", o), n.removeListener("response", o), n.removeListener("close", o), e && n.removeListener("timeout", e), n.socket || n._currentRequest.removeListener("socket", i);
  }
  return e && this.on("timeout", e), this.socket ? i(this.socket) : this._currentRequest.once("socket", i), this.on("socket", t), this.on("abort", o), this.on("error", o), this.on("response", o), this.on("close", o), this;
};
[
  "flushHeaders",
  "getHeader",
  "setNoDelay",
  "setSocketKeepAlive"
].forEach(function(a) {
  X.prototype[a] = function(e, n) {
    return this._currentRequest[a](e, n);
  };
});
["aborted", "connection", "socket"].forEach(function(a) {
  Object.defineProperty(X.prototype, a, {
    get: function() {
      return this._currentRequest[a];
    }
  });
});
X.prototype._sanitizeOptions = function(a) {
  if (a.headers || (a.headers = {}), a.host && (a.hostname || (a.hostname = a.host), delete a.host), !a.pathname && a.path) {
    var e = a.path.indexOf("?");
    e < 0 ? a.pathname = a.path : (a.pathname = a.path.substring(0, e), a.search = a.path.substring(e));
  }
};
X.prototype._performRequest = function() {
  var a = this._options.protocol, e = this._options.nativeProtocols[a];
  if (!e)
    throw new TypeError("Unsupported protocol " + a);
  if (this._options.agents) {
    var n = a.slice(0, -1);
    this._options.agent = this._options.agents[n];
  }
  var t = this._currentRequest = e.request(this._options, this._onNativeResponse);
  t._redirectable = this;
  for (var i of Tn)
    t.on(i, Rn[i]);
  if (this._currentUrl = /^\//.test(this._options.path) ? Ve.format(this._options) : (
    // When making a request to a proxy, […]
    // a client MUST send the target URI in absolute-form […].
    this._options.path
  ), this._isRedirect) {
    var o = 0, s = this, r = this._requestBodyBuffers;
    (function l(d) {
      if (t === s._currentRequest)
        if (d)
          s.emit("error", d);
        else if (o < r.length) {
          var c = r[o++];
          t.finished || t.write(c.data, c.encoding, l);
        } else s._ended && t.end();
    })();
  }
};
X.prototype._processResponse = function(a) {
  var e = a.statusCode;
  this._options.trackRedirects && this._redirects.push({
    url: this._currentUrl,
    headers: a.headers,
    statusCode: e
  });
  var n = a.headers.location;
  if (!n || this._options.followRedirects === !1 || e < 300 || e >= 400) {
    a.responseUrl = this._currentUrl, a.redirects = this._redirects, this.emit("response", a), this._requestBodyBuffers = [];
    return;
  }
  if (kn(this._currentRequest), a.destroy(), ++this._redirectCount > this._options.maxRedirects)
    throw new _c();
  var t, i = this._options.beforeRedirect;
  i && (t = Object.assign({
    // The Host header was set by nativeProtocol.request
    Host: a.req.getHeader("host")
  }, this._options.headers));
  var o = this._options.method;
  ((e === 301 || e === 302) && this._options.method === "POST" || // RFC7231§6.4.4: The 303 (See Other) status code indicates that
  // the server is redirecting the user agent to a different resource […]
  // A user agent can perform a retrieval request targeting that URI
  // (a GET or HEAD request if using HTTP) […]
  e === 303 && !/^(?:GET|HEAD)$/.test(this._options.method)) && (this._options.method = "GET", this._requestBodyBuffers = [], Xa(/^content-/i, this._options.headers));
  var s = Xa(/^host$/i, this._options.headers), r = Sn(this._currentUrl), l = s || r.host, d = /^\w+:/.test(n) ? this._currentUrl : Ve.format(Object.assign(r, { host: l })), c = kc(n, d);
  if (bi("redirecting to", c.href), this._isRedirect = !0, on(c, this._options), (c.protocol !== r.protocol && c.protocol !== "https:" || c.host !== l && !jc(c.host, l)) && Xa(/^(?:(?:proxy-)?authorization|cookie)$/i, this._options.headers), be(i)) {
    var p = {
      headers: a.headers,
      statusCode: e
    }, u = {
      url: d,
      method: o,
      headers: t
    };
    i(this._options, p, u), this._sanitizeOptions(this._options);
  }
  this._performRequest();
};
function gi(a) {
  var e = {
    maxRedirects: 21,
    maxBodyLength: 10485760
  }, n = {};
  return Object.keys(a).forEach(function(t) {
    var i = t + ":", o = n[i] = a[t], s = e[t] = Object.create(o);
    function r(d, c, p) {
      return Oc(d) ? d = on(d) : xe(d) ? d = on(Sn(d)) : (p = c, c = wi(d), d = { protocol: i }), be(c) && (p = c, c = null), c = Object.assign({
        maxRedirects: e.maxRedirects,
        maxBodyLength: e.maxBodyLength
      }, d, c), c.nativeProtocols = n, !xe(c.host) && !xe(c.hostname) && (c.hostname = "::1"), En.equal(c.protocol, i, "protocol mismatch"), bi("options", c), new X(c, p);
    }
    function l(d, c, p) {
      var u = s.request(d, c, p);
      return u.end(), u;
    }
    Object.defineProperties(s, {
      request: { value: r, configurable: !0, enumerable: !0, writable: !0 },
      get: { value: l, configurable: !0, enumerable: !0, writable: !0 }
    });
  }), e;
}
function yi() {
}
function Sn(a) {
  var e;
  if (_n)
    e = new Ie(a);
  else if (e = wi(Ve.parse(a)), !xe(e.protocol))
    throw new nn({ input: a });
  return e;
}
function kc(a, e) {
  return _n ? new Ie(a, e) : Sn(Ve.resolve(e, a));
}
function wi(a) {
  if (/^\[/.test(a.hostname) && !/^\[[:0-9a-f]+\]$/i.test(a.hostname))
    throw new nn({ input: a.href || a });
  if (/^\[/.test(a.host) && !/^\[[:0-9a-f]+\](:\d+)?$/i.test(a.host))
    throw new nn({ input: a.href || a });
  return a;
}
function on(a, e) {
  var n = e || {};
  for (var t of Ec)
    n[t] = a[t];
  return n.hostname.startsWith("[") && (n.hostname = n.hostname.slice(1, -1)), n.port !== "" && (n.port = Number(n.port)), n.path = n.search ? n.pathname + n.search : n.pathname, n;
}
function Xa(a, e) {
  var n;
  for (var t in e)
    a.test(t) && (n = e[t], delete e[t]);
  return n === null || typeof n > "u" ? void 0 : String(n).trim();
}
function Ge(a, e, n) {
  function t(i) {
    be(Error.captureStackTrace) && Error.captureStackTrace(this, this.constructor), Object.assign(this, i || {}), this.code = a, this.message = this.cause ? e + ": " + this.cause.message : e;
  }
  return t.prototype = new (n || Error)(), Object.defineProperties(t.prototype, {
    constructor: {
      value: t,
      enumerable: !1
    },
    name: {
      value: "Error [" + a + "]",
      enumerable: !1
    }
  }), t;
}
function kn(a, e) {
  for (var n of Tn)
    a.removeListener(n, Rn[n]);
  a.on("error", yi), a.destroy(e);
}
function jc(a, e) {
  En(xe(a) && xe(e));
  var n = a.length - e.length - 1;
  return n > 0 && a[n] === "." && a.endsWith(e);
}
function xe(a) {
  return typeof a == "string" || a instanceof String;
}
function be(a) {
  return typeof a == "function";
}
function Cc(a) {
  return typeof a == "object" && "length" in a;
}
function Oc(a) {
  return Ie && a instanceof Ie;
}
yn.exports = gi({ http: yc, https: wc });
yn.exports.wrap = gi;
var Ac = yn.exports;
const Pc = /* @__PURE__ */ Ht(Ac), ua = "1.13.4";
function Ei(a) {
  const e = /^([-+\w]{1,25})(:?\/\/|:)/.exec(a);
  return e && e[1] || "";
}
const Fc = /^(?:([^;]+);)?(?:[^;]+;)?(base64|),([\s\S]*)$/;
function Nc(a, e, n) {
  const t = n && n.Blob || N.classes.Blob, i = Ei(a);
  if (e === void 0 && t && (e = !0), i === "data") {
    a = i.length ? a.slice(i.length + 1) : a;
    const o = Fc.exec(a);
    if (!o)
      throw new b("Invalid URL", b.ERR_INVALID_URL);
    const s = o[1], r = o[2], l = o[3], d = Buffer.from(decodeURIComponent(l), r ? "base64" : "utf8");
    if (e) {
      if (!t)
        throw new b("Blob is not supported", b.ERR_NOT_SUPPORT);
      return new t([d], { type: s });
    }
    return d;
  }
  throw new b("Unsupported protocol " + i, b.ERR_NOT_SUPPORT);
}
const Ja = Symbol("internals");
class ft extends V.Transform {
  constructor(e) {
    e = m.toFlatObject(e, {
      maxRate: 0,
      chunkSize: 64 * 1024,
      minChunkSize: 100,
      timeWindow: 500,
      ticksRate: 2,
      samplesCount: 15
    }, null, (t, i) => !m.isUndefined(i[t])), super({
      readableHighWaterMark: e.chunkSize
    });
    const n = this[Ja] = {
      timeWindow: e.timeWindow,
      chunkSize: e.chunkSize,
      maxRate: e.maxRate,
      minChunkSize: e.minChunkSize,
      bytesSeen: 0,
      isCaptured: !1,
      notifiedBytesLoaded: 0,
      ts: Date.now(),
      bytes: 0,
      onReadCallback: null
    };
    this.on("newListener", (t) => {
      t === "progress" && (n.isCaptured || (n.isCaptured = !0));
    });
  }
  _read(e) {
    const n = this[Ja];
    return n.onReadCallback && n.onReadCallback(), super._read(e);
  }
  _transform(e, n, t) {
    const i = this[Ja], o = i.maxRate, s = this.readableHighWaterMark, r = i.timeWindow, l = 1e3 / r, d = o / l, c = i.minChunkSize !== !1 ? Math.max(i.minChunkSize, d * 0.01) : 0, p = (h, f) => {
      const v = Buffer.byteLength(h);
      i.bytesSeen += v, i.bytes += v, i.isCaptured && this.emit("progress", i.bytesSeen), this.push(h) ? process.nextTick(f) : i.onReadCallback = () => {
        i.onReadCallback = null, process.nextTick(f);
      };
    }, u = (h, f) => {
      const v = Buffer.byteLength(h);
      let x = null, g = s, w, E = 0;
      if (o) {
        const S = Date.now();
        (!i.ts || (E = S - i.ts) >= r) && (i.ts = S, w = d - i.bytes, i.bytes = w < 0 ? -w : 0, E = 0), w = d - i.bytes;
      }
      if (o) {
        if (w <= 0)
          return setTimeout(() => {
            f(null, h);
          }, r - E);
        w < g && (g = w);
      }
      g && v > g && v - g > c && (x = h.subarray(g), h = h.subarray(0, g)), p(h, x ? () => {
        process.nextTick(f, null, x);
      } : f);
    };
    u(e, function h(f, v) {
      if (f)
        return t(f);
      v ? u(v, h) : t(null);
    });
  }
}
const { asyncIterator: xt } = Symbol, _i = async function* (a) {
  a.stream ? yield* a.stream() : a.arrayBuffer ? yield await a.arrayBuffer() : a[xt] ? yield* a[xt]() : yield a;
}, Lc = N.ALPHABET.ALPHA_DIGIT + "-_", Be = typeof TextEncoder == "function" ? new TextEncoder() : new ye.TextEncoder(), me = `\r
`, Uc = Be.encode(me), Dc = 2;
class Ic {
  constructor(e, n) {
    const { escapeName: t } = this.constructor, i = m.isString(n);
    let o = `Content-Disposition: form-data; name="${t(e)}"${!i && n.name ? `; filename="${t(n.name)}"` : ""}${me}`;
    i ? n = Be.encode(String(n).replace(/\r?\n|\r\n?/g, me)) : o += `Content-Type: ${n.type || "application/octet-stream"}${me}`, this.headers = Be.encode(o + me), this.contentLength = i ? n.byteLength : n.size, this.size = this.headers.byteLength + this.contentLength + Dc, this.name = e, this.value = n;
  }
  async *encode() {
    yield this.headers;
    const { value: e } = this;
    m.isTypedArray(e) ? yield e : yield* _i(e), yield Uc;
  }
  static escapeName(e) {
    return String(e).replace(/[\r\n"]/g, (n) => ({
      "\r": "%0D",
      "\n": "%0A",
      '"': "%22"
    })[n]);
  }
}
const Bc = (a, e, n) => {
  const {
    tag: t = "form-data-boundary",
    size: i = 25,
    boundary: o = t + "-" + N.generateString(i, Lc)
  } = n || {};
  if (!m.isFormData(a))
    throw TypeError("FormData instance required");
  if (o.length < 1 || o.length > 70)
    throw Error("boundary must be 10-70 characters long");
  const s = Be.encode("--" + o + me), r = Be.encode("--" + o + "--" + me);
  let l = r.byteLength;
  const d = Array.from(a.entries()).map(([p, u]) => {
    const h = new Ic(p, u);
    return l += h.size, h;
  });
  l += s.byteLength * d.length, l = m.toFiniteNumber(l);
  const c = {
    "Content-Type": `multipart/form-data; boundary=${o}`
  };
  return Number.isFinite(l) && (c["Content-Length"] = l), e && e(c), Bi.from(async function* () {
    for (const p of d)
      yield s, yield* p.encode();
    yield r;
  }());
};
class qc extends V.Transform {
  __transform(e, n, t) {
    this.push(e), t();
  }
  _transform(e, n, t) {
    if (e.length !== 0 && (this._transform = this.__transform, e[0] !== 120)) {
      const i = Buffer.alloc(2);
      i[0] = 120, i[1] = 156, this.push(i, n);
    }
    this.__transform(e, n, t);
  }
}
const zc = (a, e) => m.isAsyncFn(a) ? function(...n) {
  const t = n.pop();
  a.apply(this, n).then((i) => {
    try {
      e ? t(null, ...e(i)) : t(null, i);
    } catch (o) {
      t(o);
    }
  }, t);
} : a;
function $c(a, e) {
  a = a || 10;
  const n = new Array(a), t = new Array(a);
  let i = 0, o = 0, s;
  return e = e !== void 0 ? e : 1e3, function(l) {
    const d = Date.now(), c = t[o];
    s || (s = d), n[i] = l, t[i] = d;
    let p = o, u = 0;
    for (; p !== i; )
      u += n[p++], p = p % a;
    if (i = (i + 1) % a, i === o && (o = (o + 1) % a), d - s < e)
      return;
    const h = c && d - c;
    return h ? Math.round(u * 1e3 / h) : void 0;
  };
}
function Mc(a, e) {
  let n = 0, t = 1e3 / e, i, o;
  const s = (d, c = Date.now()) => {
    n = c, i = null, o && (clearTimeout(o), o = null), a(...d);
  };
  return [(...d) => {
    const c = Date.now(), p = c - n;
    p >= t ? s(d, c) : (i = d, o || (o = setTimeout(() => {
      o = null, s(i);
    }, t - p)));
  }, () => i && s(i)];
}
const Ae = (a, e, n = 3) => {
  let t = 0;
  const i = $c(50, 250);
  return Mc((o) => {
    const s = o.loaded, r = o.lengthComputable ? o.total : void 0, l = s - t, d = i(l), c = s <= r;
    t = s;
    const p = {
      loaded: s,
      total: r,
      progress: r ? s / r : void 0,
      bytes: l,
      rate: d || void 0,
      estimated: d && r && c ? (r - s) / d : void 0,
      event: o,
      lengthComputable: r != null,
      [e ? "download" : "upload"]: !0
    };
    a(p);
  }, n);
}, da = (a, e) => {
  const n = a != null;
  return [(t) => e[0]({
    lengthComputable: n,
    total: a,
    loaded: t
  }), e[1]];
}, ma = (a) => (...e) => m.asap(() => a(...e));
function Hc(a) {
  if (!a || typeof a != "string" || !a.startsWith("data:")) return 0;
  const e = a.indexOf(",");
  if (e < 0) return 0;
  const n = a.slice(5, e), t = a.slice(e + 1);
  if (/;base64/i.test(n)) {
    let o = t.length;
    const s = t.length;
    for (let u = 0; u < s; u++)
      if (t.charCodeAt(u) === 37 && u + 2 < s) {
        const h = t.charCodeAt(u + 1), f = t.charCodeAt(u + 2);
        (h >= 48 && h <= 57 || h >= 65 && h <= 70 || h >= 97 && h <= 102) && (f >= 48 && f <= 57 || f >= 65 && f <= 70 || f >= 97 && f <= 102) && (o -= 2, u += 2);
      }
    let r = 0, l = s - 1;
    const d = (u) => u >= 2 && t.charCodeAt(u - 2) === 37 && // '%'
    t.charCodeAt(u - 1) === 51 && // '3'
    (t.charCodeAt(u) === 68 || t.charCodeAt(u) === 100);
    l >= 0 && (t.charCodeAt(l) === 61 ? (r++, l--) : d(l) && (r++, l -= 3)), r === 1 && l >= 0 && (t.charCodeAt(l) === 61 || d(l)) && r++;
    const p = Math.floor(o / 4) * 3 - (r || 0);
    return p > 0 ? p : 0;
  }
  return Buffer.byteLength(t, "utf8");
}
const ht = {
  flush: pe.constants.Z_SYNC_FLUSH,
  finishFlush: pe.constants.Z_SYNC_FLUSH
}, Wc = {
  flush: pe.constants.BROTLI_OPERATION_FLUSH,
  finishFlush: pe.constants.BROTLI_OPERATION_FLUSH
}, vt = m.isFunction(pe.createBrotliDecompress), { http: Vc, https: Gc } = Pc, Xc = /https:?/, bt = N.protocols.map((a) => a + ":"), gt = (a, [e, n]) => (a.on("end", n).on("error", n), e);
class Jc {
  constructor() {
    this.sessions = /* @__PURE__ */ Object.create(null);
  }
  getSession(e, n) {
    n = Object.assign({
      sessionTimeout: 1e3
    }, n);
    let t = this.sessions[e];
    if (t) {
      let c = t.length;
      for (let p = 0; p < c; p++) {
        const [u, h] = t[p];
        if (!u.destroyed && !u.closed && ye.isDeepStrictEqual(h, n))
          return u;
      }
    }
    const i = Ft.connect(e, n);
    let o;
    const s = () => {
      if (o)
        return;
      o = !0;
      let c = t, p = c.length, u = p;
      for (; u--; )
        if (c[u][0] === i) {
          p === 1 ? delete this.sessions[e] : c.splice(u, 1);
          return;
        }
    }, r = i.request, { sessionTimeout: l } = n;
    if (l != null) {
      let c, p = 0;
      i.request = function() {
        const u = r.apply(this, arguments);
        return p++, c && (clearTimeout(c), c = null), u.once("close", () => {
          --p || (c = setTimeout(() => {
            c = null, s();
          }, l));
        }), u;
      };
    }
    i.once("close", s);
    let d = [
      i,
      n
    ];
    return t ? t.push(d) : t = this.sessions[e] = [d], i;
  }
}
const Kc = new Jc();
function Yc(a, e) {
  a.beforeRedirects.proxy && a.beforeRedirects.proxy(a), a.beforeRedirects.config && a.beforeRedirects.config(a, e);
}
function Ti(a, e, n) {
  let t = e;
  if (!t && t !== !1) {
    const i = hi.getProxyForUrl(n);
    i && (t = new URL(i));
  }
  if (t) {
    if (t.username && (t.auth = (t.username || "") + ":" + (t.password || "")), t.auth) {
      if (!!(t.auth.username || t.auth.password))
        t.auth = (t.auth.username || "") + ":" + (t.auth.password || "");
      else if (typeof t.auth == "object")
        throw new b("Invalid proxy authorization", b.ERR_BAD_OPTION, { proxy: t });
      const s = Buffer.from(t.auth, "utf8").toString("base64");
      a.headers["Proxy-Authorization"] = "Basic " + s;
    }
    a.headers.host = a.hostname + (a.port ? ":" + a.port : "");
    const i = t.hostname || t.host;
    a.hostname = i, a.host = i, a.port = t.port, a.path = n, t.protocol && (a.protocol = t.protocol.includes(":") ? t.protocol : `${t.protocol}:`);
  }
  a.beforeRedirects.proxy = function(o) {
    Ti(o, e, o.href);
  };
}
const Qc = typeof process < "u" && m.kindOf(process) === "process", Zc = (a) => new Promise((e, n) => {
  let t, i;
  const o = (l, d) => {
    i || (i = !0, t && t(l, d));
  }, s = (l) => {
    o(l), e(l);
  }, r = (l) => {
    o(l, !0), n(l);
  };
  a(s, r, (l) => t = l).catch(r);
}), ep = ({ address: a, family: e }) => {
  if (!m.isString(a))
    throw TypeError("address must be a string");
  return {
    address: a,
    family: e || (a.indexOf(".") < 0 ? 6 : 4)
  };
}, yt = (a, e) => ep(m.isObject(a) ? a : { address: a, family: e }), ap = {
  request(a, e) {
    const n = a.protocol + "//" + a.hostname + ":" + (a.port || (a.protocol === "https:" ? 443 : 80)), { http2Options: t, headers: i } = a, o = Kc.getSession(n, t), {
      HTTP2_HEADER_SCHEME: s,
      HTTP2_HEADER_METHOD: r,
      HTTP2_HEADER_PATH: l,
      HTTP2_HEADER_STATUS: d
    } = Ft.constants, c = {
      [s]: a.protocol.replace(":", ""),
      [r]: a.method,
      [l]: a.path
    };
    m.forEach(i, (u, h) => {
      h.charAt(0) !== ":" && (c[h] = u);
    });
    const p = o.request(c);
    return p.once("response", (u) => {
      const h = p;
      u = Object.assign({}, u);
      const f = u[d];
      delete u[d], h.headers = u, h.statusCode = +f, e(h);
    }), p;
  }
}, np = Qc && function(e) {
  return Zc(async function(t, i, o) {
    let { data: s, lookup: r, family: l, httpVersion: d = 1, http2Options: c } = e;
    const { responseType: p, responseEncoding: u } = e, h = e.method.toUpperCase();
    let f, v = !1, x;
    if (d = +d, Number.isNaN(d))
      throw TypeError(`Invalid protocol version: '${e.httpVersion}' is not a number`);
    if (d !== 1 && d !== 2)
      throw TypeError(`Unsupported protocol version '${d}'`);
    const g = d === 2;
    if (r) {
      const _ = zc(r, (y) => m.isArray(y) ? y : [y]);
      r = (y, C, K) => {
        _(y, C, (U, Q, ce) => {
          if (U)
            return K(U);
          const W = m.isArray(Q) ? Q.map((Xe) => yt(Xe)) : [yt(Q, ce)];
          C.all ? K(U, W) : K(U, W[0].address, W[0].family);
        });
      };
    }
    const w = new Mi();
    function E(_) {
      try {
        w.emit("abort", !_ || _.type ? new ve(null, e, x) : _);
      } catch (y) {
        console.warn("emit error", y);
      }
    }
    w.once("abort", i);
    const S = () => {
      e.cancelToken && e.cancelToken.unsubscribe(E), e.signal && e.signal.removeEventListener("abort", E), w.removeAllListeners();
    };
    (e.cancelToken || e.signal) && (e.cancelToken && e.cancelToken.subscribe(E), e.signal && (e.signal.aborted ? E() : e.signal.addEventListener("abort", E))), o((_, y) => {
      if (f = !0, y) {
        v = !0, S();
        return;
      }
      const { data: C } = _;
      if (C instanceof V.Readable || C instanceof V.Duplex) {
        const K = V.finished(C, () => {
          K(), S();
        });
      } else
        S();
    });
    const D = gn(e.baseURL, e.url, e.allowAbsoluteUrls), P = new URL(D, N.hasBrowserEnv ? N.origin : void 0), F = P.protocol || bt[0];
    if (F === "data:") {
      if (e.maxContentLength > -1) {
        const y = String(e.url || D || "");
        if (Hc(y) > e.maxContentLength)
          return i(new b(
            "maxContentLength size of " + e.maxContentLength + " exceeded",
            b.ERR_BAD_RESPONSE,
            e
          ));
      }
      let _;
      if (h !== "GET")
        return Se(t, i, {
          status: 405,
          statusText: "method not allowed",
          headers: {},
          config: e
        });
      try {
        _ = Nc(e.url, p === "blob", {
          Blob: e.env && e.env.Blob
        });
      } catch (y) {
        throw b.from(y, b.ERR_BAD_REQUEST, e);
      }
      return p === "text" ? (_ = _.toString(u), (!u || u === "utf8") && (_ = m.stripBOM(_))) : p === "stream" && (_ = V.Readable.from(_)), Se(t, i, {
        data: _,
        status: 200,
        statusText: "OK",
        headers: new $(),
        config: e
      });
    }
    if (bt.indexOf(F) === -1)
      return i(new b(
        "Unsupported protocol " + F,
        b.ERR_BAD_REQUEST,
        e
      ));
    const I = $.from(e.headers).normalize();
    I.set("User-Agent", "axios/" + ua, !1);
    const { onUploadProgress: Y, onDownloadProgress: se } = e, ue = e.maxRate;
    let te, ae;
    if (m.isSpecCompliantForm(s)) {
      const _ = I.getContentType(/boundary=([-_\w\d]{10,70})/i);
      s = Bc(s, (y) => {
        I.set(y);
      }, {
        tag: `axios-${ua}-boundary`,
        boundary: _ && _[1] || void 0
      });
    } else if (m.isFormData(s) && m.isFunction(s.getHeaders)) {
      if (I.set(s.getHeaders()), !I.hasContentLength())
        try {
          const _ = await ye.promisify(s.getLength).call(s);
          Number.isFinite(_) && _ >= 0 && I.setContentLength(_);
        } catch {
        }
    } else if (m.isBlob(s) || m.isFile(s))
      s.size && I.setContentType(s.type || "application/octet-stream"), I.setContentLength(s.size || 0), s = V.Readable.from(_i(s));
    else if (s && !m.isStream(s)) {
      if (!Buffer.isBuffer(s)) if (m.isArrayBuffer(s))
        s = Buffer.from(new Uint8Array(s));
      else if (m.isString(s))
        s = Buffer.from(s, "utf-8");
      else
        return i(new b(
          "Data after transformation must be a string, an ArrayBuffer, a Buffer, or a Stream",
          b.ERR_BAD_REQUEST,
          e
        ));
      if (I.setContentLength(s.length, !1), e.maxBodyLength > -1 && s.length > e.maxBodyLength)
        return i(new b(
          "Request body larger than maxBodyLength limit",
          b.ERR_BAD_REQUEST,
          e
        ));
    }
    const ie = m.toFiniteNumber(I.getContentLength());
    m.isArray(ue) ? (te = ue[0], ae = ue[1]) : te = ae = ue, s && (Y || te) && (m.isStream(s) || (s = V.Readable.from(s, { objectMode: !1 })), s = V.pipeline([s, new ft({
      maxRate: m.toFiniteNumber(te)
    })], m.noop), Y && s.on("progress", gt(
      s,
      da(
        ie,
        Ae(ma(Y), !1, 3)
      )
    )));
    let re;
    if (e.auth) {
      const _ = e.auth.username || "", y = e.auth.password || "";
      re = _ + ":" + y;
    }
    if (!re && P.username) {
      const _ = P.username, y = P.password;
      re = _ + ":" + y;
    }
    re && I.delete("authorization");
    let J;
    try {
      J = hn(
        P.pathname + P.search,
        e.params,
        e.paramsSerializer
      ).replace(/^\?/, "");
    } catch (_) {
      const y = new Error(_.message);
      return y.config = e, y.url = e.url, y.exists = !0, i(y);
    }
    I.set(
      "Accept-Encoding",
      "gzip, compress, deflate" + (vt ? ", br" : ""),
      !1
    );
    const q = {
      path: J,
      method: h,
      headers: I.toJSON(),
      agents: { http: e.httpAgent, https: e.httpsAgent },
      auth: re,
      protocol: F,
      family: l,
      beforeRedirect: Yc,
      beforeRedirects: {},
      http2Options: c
    };
    !m.isUndefined(r) && (q.lookup = r), e.socketPath ? q.socketPath = e.socketPath : (q.hostname = P.hostname.startsWith("[") ? P.hostname.slice(1, -1) : P.hostname, q.port = P.port, Ti(q, e.proxy, F + "//" + P.hostname + (P.port ? ":" + P.port : "") + q.path));
    let H;
    const we = Xc.test(q.protocol);
    if (q.agent = we ? e.httpsAgent : e.httpAgent, g ? H = ap : e.transport ? H = e.transport : e.maxRedirects === 0 ? H = we ? pn : cn : (e.maxRedirects && (q.maxRedirects = e.maxRedirects), e.beforeRedirect && (q.beforeRedirects.config = e.beforeRedirect), H = we ? Gc : Vc), e.maxBodyLength > -1 ? q.maxBodyLength = e.maxBodyLength : q.maxBodyLength = 1 / 0, e.insecureHTTPParser && (q.insecureHTTPParser = e.insecureHTTPParser), x = H.request(q, function(y) {
      if (x.destroyed) return;
      const C = [y], K = m.toFiniteNumber(y.headers["content-length"]);
      if (se || ae) {
        const W = new ft({
          maxRate: m.toFiniteNumber(ae)
        });
        se && W.on("progress", gt(
          W,
          da(
            K,
            Ae(ma(se), !0, 3)
          )
        )), C.push(W);
      }
      let U = y;
      const Q = y.req || x;
      if (e.decompress !== !1 && y.headers["content-encoding"])
        switch ((h === "HEAD" || y.statusCode === 204) && delete y.headers["content-encoding"], (y.headers["content-encoding"] || "").toLowerCase()) {
          case "gzip":
          case "x-gzip":
          case "compress":
          case "x-compress":
            C.push(pe.createUnzip(ht)), delete y.headers["content-encoding"];
            break;
          case "deflate":
            C.push(new qc()), C.push(pe.createUnzip(ht)), delete y.headers["content-encoding"];
            break;
          case "br":
            vt && (C.push(pe.createBrotliDecompress(Wc)), delete y.headers["content-encoding"]);
        }
      U = C.length > 1 ? V.pipeline(C, m.noop) : C[0];
      const ce = {
        status: y.statusCode,
        statusText: y.statusMessage,
        headers: new $(y.headers),
        config: e,
        request: Q
      };
      if (p === "stream")
        ce.data = U, Se(t, i, ce);
      else {
        const W = [];
        let Xe = 0;
        U.on("data", function(M) {
          W.push(M), Xe += M.length, e.maxContentLength > -1 && Xe > e.maxContentLength && (v = !0, U.destroy(), E(new b(
            "maxContentLength size of " + e.maxContentLength + " exceeded",
            b.ERR_BAD_RESPONSE,
            e,
            Q
          )));
        }), U.on("aborted", function() {
          if (v)
            return;
          const M = new b(
            "stream has been aborted",
            b.ERR_BAD_RESPONSE,
            e,
            Q
          );
          U.destroy(M), i(M);
        }), U.on("error", function(M) {
          x.destroyed || i(b.from(M, null, e, Q));
        }), U.on("end", function() {
          try {
            let M = W.length === 1 ? W[0] : Buffer.concat(W);
            p !== "arraybuffer" && (M = M.toString(u), (!u || u === "utf8") && (M = m.stripBOM(M))), ce.data = M;
          } catch (M) {
            return i(b.from(M, null, e, ce.request, ce));
          }
          Se(t, i, ce);
        });
      }
      w.once("abort", (W) => {
        U.destroyed || (U.emit("error", W), U.destroy());
      });
    }), w.once("abort", (_) => {
      x.close ? x.close() : x.destroy(_);
    }), x.on("error", function(y) {
      i(b.from(y, null, e, x));
    }), x.on("socket", function(y) {
      y.setKeepAlive(!0, 1e3 * 60);
    }), e.timeout) {
      const _ = parseInt(e.timeout, 10);
      if (Number.isNaN(_)) {
        E(new b(
          "error trying to parse `config.timeout` to int",
          b.ERR_BAD_OPTION_VALUE,
          e,
          x
        ));
        return;
      }
      x.setTimeout(_, function() {
        if (f) return;
        let C = e.timeout ? "timeout of " + e.timeout + "ms exceeded" : "timeout exceeded";
        const K = e.transitional || vn;
        e.timeoutErrorMessage && (C = e.timeoutErrorMessage), E(new b(
          C,
          K.clarifyTimeoutError ? b.ETIMEDOUT : b.ECONNABORTED,
          e,
          x
        ));
      });
    } else
      x.setTimeout(0);
    if (m.isStream(s)) {
      let _ = !1, y = !1;
      s.on("end", () => {
        _ = !0;
      }), s.once("error", (C) => {
        y = !0, x.destroy(C);
      }), s.on("close", () => {
        !_ && !y && E(new ve("Request stream has been aborted", e, x));
      }), s.pipe(x);
    } else
      s && x.write(s), x.end();
  });
}, tp = N.hasStandardBrowserEnv ? /* @__PURE__ */ ((a, e) => (n) => (n = new URL(n, N.origin), a.protocol === n.protocol && a.host === n.host && (e || a.port === n.port)))(
  new URL(N.origin),
  N.navigator && /(msie|trident)/i.test(N.navigator.userAgent)
) : () => !0, ip = N.hasStandardBrowserEnv ? (
  // Standard browser envs support document.cookie
  {
    write(a, e, n, t, i, o, s) {
      if (typeof document > "u") return;
      const r = [`${a}=${encodeURIComponent(e)}`];
      m.isNumber(n) && r.push(`expires=${new Date(n).toUTCString()}`), m.isString(t) && r.push(`path=${t}`), m.isString(i) && r.push(`domain=${i}`), o === !0 && r.push("secure"), m.isString(s) && r.push(`SameSite=${s}`), document.cookie = r.join("; ");
    },
    read(a) {
      if (typeof document > "u") return null;
      const e = document.cookie.match(new RegExp("(?:^|; )" + a + "=([^;]*)"));
      return e ? decodeURIComponent(e[1]) : null;
    },
    remove(a) {
      this.write(a, "", Date.now() - 864e5, "/");
    }
  }
) : (
  // Non-standard browser env (web workers, react-native) lack needed support.
  {
    write() {
    },
    read() {
      return null;
    },
    remove() {
    }
  }
), wt = (a) => a instanceof $ ? { ...a } : a;
function ge(a, e) {
  e = e || {};
  const n = {};
  function t(d, c, p, u) {
    return m.isPlainObject(d) && m.isPlainObject(c) ? m.merge.call({ caseless: u }, d, c) : m.isPlainObject(c) ? m.merge({}, c) : m.isArray(c) ? c.slice() : c;
  }
  function i(d, c, p, u) {
    if (m.isUndefined(c)) {
      if (!m.isUndefined(d))
        return t(void 0, d, p, u);
    } else return t(d, c, p, u);
  }
  function o(d, c) {
    if (!m.isUndefined(c))
      return t(void 0, c);
  }
  function s(d, c) {
    if (m.isUndefined(c)) {
      if (!m.isUndefined(d))
        return t(void 0, d);
    } else return t(void 0, c);
  }
  function r(d, c, p) {
    if (p in e)
      return t(d, c);
    if (p in a)
      return t(void 0, d);
  }
  const l = {
    url: o,
    method: o,
    data: o,
    baseURL: s,
    transformRequest: s,
    transformResponse: s,
    paramsSerializer: s,
    timeout: s,
    timeoutMessage: s,
    withCredentials: s,
    withXSRFToken: s,
    adapter: s,
    responseType: s,
    xsrfCookieName: s,
    xsrfHeaderName: s,
    onUploadProgress: s,
    onDownloadProgress: s,
    decompress: s,
    maxContentLength: s,
    maxBodyLength: s,
    beforeRedirect: s,
    transport: s,
    httpAgent: s,
    httpsAgent: s,
    cancelToken: s,
    socketPath: s,
    responseEncoding: s,
    validateStatus: r,
    headers: (d, c, p) => i(wt(d), wt(c), p, !0)
  };
  return m.forEach(Object.keys({ ...a, ...e }), function(c) {
    const p = l[c] || i, u = p(a[c], e[c], c);
    m.isUndefined(u) && p !== r || (n[c] = u);
  }), n;
}
const Ri = (a) => {
  const e = ge({}, a);
  let { data: n, withXSRFToken: t, xsrfHeaderName: i, xsrfCookieName: o, headers: s, auth: r } = e;
  if (e.headers = s = $.from(s), e.url = hn(gn(e.baseURL, e.url, e.allowAbsoluteUrls), a.params, a.paramsSerializer), r && s.set(
    "Authorization",
    "Basic " + btoa((r.username || "") + ":" + (r.password ? unescape(encodeURIComponent(r.password)) : ""))
  ), m.isFormData(n)) {
    if (N.hasStandardBrowserEnv || N.hasStandardBrowserWebWorkerEnv)
      s.setContentType(void 0);
    else if (m.isFunction(n.getHeaders)) {
      const l = n.getHeaders(), d = ["content-type", "content-length"];
      Object.entries(l).forEach(([c, p]) => {
        d.includes(c.toLowerCase()) && s.set(c, p);
      });
    }
  }
  if (N.hasStandardBrowserEnv && (t && m.isFunction(t) && (t = t(e)), t || t !== !1 && tp(e.url))) {
    const l = i && o && ip.read(o);
    l && s.set(i, l);
  }
  return e;
}, op = typeof XMLHttpRequest < "u", sp = op && function(a) {
  return new Promise(function(n, t) {
    const i = Ri(a);
    let o = i.data;
    const s = $.from(i.headers).normalize();
    let { responseType: r, onUploadProgress: l, onDownloadProgress: d } = i, c, p, u, h, f;
    function v() {
      h && h(), f && f(), i.cancelToken && i.cancelToken.unsubscribe(c), i.signal && i.signal.removeEventListener("abort", c);
    }
    let x = new XMLHttpRequest();
    x.open(i.method.toUpperCase(), i.url, !0), x.timeout = i.timeout;
    function g() {
      if (!x)
        return;
      const E = $.from(
        "getAllResponseHeaders" in x && x.getAllResponseHeaders()
      ), D = {
        data: !r || r === "text" || r === "json" ? x.responseText : x.response,
        status: x.status,
        statusText: x.statusText,
        headers: E,
        config: a,
        request: x
      };
      Se(function(F) {
        n(F), v();
      }, function(F) {
        t(F), v();
      }, D), x = null;
    }
    "onloadend" in x ? x.onloadend = g : x.onreadystatechange = function() {
      !x || x.readyState !== 4 || x.status === 0 && !(x.responseURL && x.responseURL.indexOf("file:") === 0) || setTimeout(g);
    }, x.onabort = function() {
      x && (t(new b("Request aborted", b.ECONNABORTED, a, x)), x = null);
    }, x.onerror = function(S) {
      const D = S && S.message ? S.message : "Network Error", P = new b(D, b.ERR_NETWORK, a, x);
      P.event = S || null, t(P), x = null;
    }, x.ontimeout = function() {
      let S = i.timeout ? "timeout of " + i.timeout + "ms exceeded" : "timeout exceeded";
      const D = i.transitional || vn;
      i.timeoutErrorMessage && (S = i.timeoutErrorMessage), t(new b(
        S,
        D.clarifyTimeoutError ? b.ETIMEDOUT : b.ECONNABORTED,
        a,
        x
      )), x = null;
    }, o === void 0 && s.setContentType(null), "setRequestHeader" in x && m.forEach(s.toJSON(), function(S, D) {
      x.setRequestHeader(D, S);
    }), m.isUndefined(i.withCredentials) || (x.withCredentials = !!i.withCredentials), r && r !== "json" && (x.responseType = i.responseType), d && ([u, f] = Ae(d, !0), x.addEventListener("progress", u)), l && x.upload && ([p, h] = Ae(l), x.upload.addEventListener("progress", p), x.upload.addEventListener("loadend", h)), (i.cancelToken || i.signal) && (c = (E) => {
      x && (t(!E || E.type ? new ve(null, a, x) : E), x.abort(), x = null);
    }, i.cancelToken && i.cancelToken.subscribe(c), i.signal && (i.signal.aborted ? c() : i.signal.addEventListener("abort", c)));
    const w = Ei(i.url);
    if (w && N.protocols.indexOf(w) === -1) {
      t(new b("Unsupported protocol " + w + ":", b.ERR_BAD_REQUEST, a));
      return;
    }
    x.send(o || null);
  });
}, rp = (a, e) => {
  const { length: n } = a = a ? a.filter(Boolean) : [];
  if (e || n) {
    let t = new AbortController(), i;
    const o = function(d) {
      if (!i) {
        i = !0, r();
        const c = d instanceof Error ? d : this.reason;
        t.abort(c instanceof b ? c : new ve(c instanceof Error ? c.message : c));
      }
    };
    let s = e && setTimeout(() => {
      s = null, o(new b(`timeout of ${e}ms exceeded`, b.ETIMEDOUT));
    }, e);
    const r = () => {
      a && (s && clearTimeout(s), s = null, a.forEach((d) => {
        d.unsubscribe ? d.unsubscribe(o) : d.removeEventListener("abort", o);
      }), a = null);
    };
    a.forEach((d) => d.addEventListener("abort", o));
    const { signal: l } = t;
    return l.unsubscribe = () => m.asap(r), l;
  }
}, cp = function* (a, e) {
  let n = a.byteLength;
  if (n < e) {
    yield a;
    return;
  }
  let t = 0, i;
  for (; t < n; )
    i = t + e, yield a.slice(t, i), t = i;
}, pp = async function* (a, e) {
  for await (const n of lp(a))
    yield* cp(n, e);
}, lp = async function* (a) {
  if (a[Symbol.asyncIterator]) {
    yield* a;
    return;
  }
  const e = a.getReader();
  try {
    for (; ; ) {
      const { done: n, value: t } = await e.read();
      if (n)
        break;
      yield t;
    }
  } finally {
    await e.cancel();
  }
}, Et = (a, e, n, t) => {
  const i = pp(a, e);
  let o = 0, s, r = (l) => {
    s || (s = !0, t && t(l));
  };
  return new ReadableStream({
    async pull(l) {
      try {
        const { done: d, value: c } = await i.next();
        if (d) {
          r(), l.close();
          return;
        }
        let p = c.byteLength;
        if (n) {
          let u = o += p;
          n(u);
        }
        l.enqueue(new Uint8Array(c));
      } catch (d) {
        throw r(d), d;
      }
    },
    cancel(l) {
      return r(l), i.return();
    }
  }, {
    highWaterMark: 2
  });
}, _t = 64 * 1024, { isFunction: aa } = m, up = (({ Request: a, Response: e }) => ({
  Request: a,
  Response: e
}))(m.global), {
  ReadableStream: Tt,
  TextEncoder: Rt
} = m.global, St = (a, ...e) => {
  try {
    return !!a(...e);
  } catch {
    return !1;
  }
}, dp = (a) => {
  a = m.merge.call({
    skipUndefined: !0
  }, up, a);
  const { fetch: e, Request: n, Response: t } = a, i = e ? aa(e) : typeof fetch == "function", o = aa(n), s = aa(t);
  if (!i)
    return !1;
  const r = i && aa(Tt), l = i && (typeof Rt == "function" ? /* @__PURE__ */ ((f) => (v) => f.encode(v))(new Rt()) : async (f) => new Uint8Array(await new n(f).arrayBuffer())), d = o && r && St(() => {
    let f = !1;
    const v = new n(N.origin, {
      body: new Tt(),
      method: "POST",
      get duplex() {
        return f = !0, "half";
      }
    }).headers.has("Content-Type");
    return f && !v;
  }), c = s && r && St(() => m.isReadableStream(new t("").body)), p = {
    stream: c && ((f) => f.body)
  };
  i && ["text", "arrayBuffer", "blob", "formData", "stream"].forEach((f) => {
    !p[f] && (p[f] = (v, x) => {
      let g = v && v[f];
      if (g)
        return g.call(v);
      throw new b(`Response type '${f}' is not supported`, b.ERR_NOT_SUPPORT, x);
    });
  });
  const u = async (f) => {
    if (f == null)
      return 0;
    if (m.isBlob(f))
      return f.size;
    if (m.isSpecCompliantForm(f))
      return (await new n(N.origin, {
        method: "POST",
        body: f
      }).arrayBuffer()).byteLength;
    if (m.isArrayBufferView(f) || m.isArrayBuffer(f))
      return f.byteLength;
    if (m.isURLSearchParams(f) && (f = f + ""), m.isString(f))
      return (await l(f)).byteLength;
  }, h = async (f, v) => {
    const x = m.toFiniteNumber(f.getContentLength());
    return x ?? u(v);
  };
  return async (f) => {
    let {
      url: v,
      method: x,
      data: g,
      signal: w,
      cancelToken: E,
      timeout: S,
      onDownloadProgress: D,
      onUploadProgress: P,
      responseType: F,
      headers: I,
      withCredentials: Y = "same-origin",
      fetchOptions: se
    } = Ri(f), ue = e || fetch;
    F = F ? (F + "").toLowerCase() : "text";
    let te = rp([w, E && E.toAbortSignal()], S), ae = null;
    const ie = te && te.unsubscribe && (() => {
      te.unsubscribe();
    });
    let re;
    try {
      if (P && d && x !== "get" && x !== "head" && (re = await h(I, g)) !== 0) {
        let y = new n(v, {
          method: "POST",
          body: g,
          duplex: "half"
        }), C;
        if (m.isFormData(g) && (C = y.headers.get("content-type")) && I.setContentType(C), y.body) {
          const [K, U] = da(
            re,
            Ae(ma(P))
          );
          g = Et(y.body, _t, K, U);
        }
      }
      m.isString(Y) || (Y = Y ? "include" : "omit");
      const J = o && "credentials" in n.prototype, q = {
        ...se,
        signal: te,
        method: x.toUpperCase(),
        headers: I.normalize().toJSON(),
        body: g,
        duplex: "half",
        credentials: J ? Y : void 0
      };
      ae = o && new n(v, q);
      let H = await (o ? ue(ae, se) : ue(v, q));
      const we = c && (F === "stream" || F === "response");
      if (c && (D || we && ie)) {
        const y = {};
        ["status", "statusText", "headers"].forEach((Q) => {
          y[Q] = H[Q];
        });
        const C = m.toFiniteNumber(H.headers.get("content-length")), [K, U] = D && da(
          C,
          Ae(ma(D), !0)
        ) || [];
        H = new t(
          Et(H.body, _t, K, () => {
            U && U(), ie && ie();
          }),
          y
        );
      }
      F = F || "text";
      let _ = await p[m.findKey(p, F) || "text"](H, f);
      return !we && ie && ie(), await new Promise((y, C) => {
        Se(y, C, {
          data: _,
          headers: $.from(H.headers),
          status: H.status,
          statusText: H.statusText,
          config: f,
          request: ae
        });
      });
    } catch (J) {
      throw ie && ie(), J && J.name === "TypeError" && /Load failed|fetch/i.test(J.message) ? Object.assign(
        new b("Network Error", b.ERR_NETWORK, f, ae),
        {
          cause: J.cause || J
        }
      ) : b.from(J, J && J.code, f, ae);
    }
  };
}, mp = /* @__PURE__ */ new Map(), Si = (a) => {
  let e = a && a.env || {};
  const { fetch: n, Request: t, Response: i } = e, o = [
    t,
    i,
    n
  ];
  let s = o.length, r = s, l, d, c = mp;
  for (; r--; )
    l = o[r], d = c.get(l), d === void 0 && c.set(l, d = r ? /* @__PURE__ */ new Map() : dp(e)), c = d;
  return d;
};
Si();
const jn = {
  http: np,
  xhr: sp,
  fetch: {
    get: Si
  }
};
m.forEach(jn, (a, e) => {
  if (a) {
    try {
      Object.defineProperty(a, "name", { value: e });
    } catch {
    }
    Object.defineProperty(a, "adapterName", { value: e });
  }
});
const kt = (a) => `- ${a}`, fp = (a) => m.isFunction(a) || a === null || a === !1;
function xp(a, e) {
  a = m.isArray(a) ? a : [a];
  const { length: n } = a;
  let t, i;
  const o = {};
  for (let s = 0; s < n; s++) {
    t = a[s];
    let r;
    if (i = t, !fp(t) && (i = jn[(r = String(t)).toLowerCase()], i === void 0))
      throw new b(`Unknown adapter '${r}'`);
    if (i && (m.isFunction(i) || (i = i.get(e))))
      break;
    o[r || "#" + s] = i;
  }
  if (!i) {
    const s = Object.entries(o).map(
      ([l, d]) => `adapter ${l} ` + (d === !1 ? "is not supported by the environment" : "is not available in the build")
    );
    let r = n ? s.length > 1 ? `since :
` + s.map(kt).join(`
`) : " " + kt(s[0]) : "as no adapter specified";
    throw new b(
      "There is no suitable adapter to dispatch the request " + r,
      "ERR_NOT_SUPPORT"
    );
  }
  return i;
}
const ki = {
  /**
   * Resolve an adapter from a list of adapter names or functions.
   * @type {Function}
   */
  getAdapter: xp,
  /**
   * Exposes all known adapters
   * @type {Object<string, Function|Object>}
   */
  adapters: jn
};
function Ka(a) {
  if (a.cancelToken && a.cancelToken.throwIfRequested(), a.signal && a.signal.aborted)
    throw new ve(null, a);
}
function jt(a) {
  return Ka(a), a.headers = $.from(a.headers), a.data = Ma.call(
    a,
    a.transformRequest
  ), ["post", "put", "patch"].indexOf(a.method) !== -1 && a.headers.setContentType("application/x-www-form-urlencoded", !1), ki.getAdapter(a.adapter || We.adapter, a)(a).then(function(t) {
    return Ka(a), t.data = Ma.call(
      a,
      a.transformResponse,
      t
    ), t.headers = $.from(t.headers), t;
  }, function(t) {
    return xi(t) || (Ka(a), t && t.response && (t.response.data = Ma.call(
      a,
      a.transformResponse,
      t.response
    ), t.response.headers = $.from(t.response.headers))), Promise.reject(t);
  });
}
const Ea = {};
["object", "boolean", "number", "function", "string", "symbol"].forEach((a, e) => {
  Ea[a] = function(t) {
    return typeof t === a || "a" + (e < 1 ? "n " : " ") + a;
  };
});
const Ct = {};
Ea.transitional = function(e, n, t) {
  function i(o, s) {
    return "[Axios v" + ua + "] Transitional option '" + o + "'" + s + (t ? ". " + t : "");
  }
  return (o, s, r) => {
    if (e === !1)
      throw new b(
        i(s, " has been removed" + (n ? " in " + n : "")),
        b.ERR_DEPRECATED
      );
    return n && !Ct[s] && (Ct[s] = !0, console.warn(
      i(
        s,
        " has been deprecated since v" + n + " and will be removed in the near future"
      )
    )), e ? e(o, s, r) : !0;
  };
};
Ea.spelling = function(e) {
  return (n, t) => (console.warn(`${t} is likely a misspelling of ${e}`), !0);
};
function hp(a, e, n) {
  if (typeof a != "object")
    throw new b("options must be an object", b.ERR_BAD_OPTION_VALUE);
  const t = Object.keys(a);
  let i = t.length;
  for (; i-- > 0; ) {
    const o = t[i], s = e[o];
    if (s) {
      const r = a[o], l = r === void 0 || s(r, o, a);
      if (l !== !0)
        throw new b("option " + o + " must be " + l, b.ERR_BAD_OPTION_VALUE);
      continue;
    }
    if (n !== !0)
      throw new b("Unknown option " + o, b.ERR_BAD_OPTION);
  }
}
const ra = {
  assertOptions: hp,
  validators: Ea
}, ne = ra.validators;
let he = class {
  constructor(e) {
    this.defaults = e || {}, this.interceptors = {
      request: new it(),
      response: new it()
    };
  }
  /**
   * Dispatch a request
   *
   * @param {String|Object} configOrUrl The config specific for this request (merged with this.defaults)
   * @param {?Object} config
   *
   * @returns {Promise} The Promise to be fulfilled
   */
  async request(e, n) {
    try {
      return await this._request(e, n);
    } catch (t) {
      if (t instanceof Error) {
        let i = {};
        Error.captureStackTrace ? Error.captureStackTrace(i) : i = new Error();
        const o = i.stack ? i.stack.replace(/^.+\n/, "") : "";
        try {
          t.stack ? o && !String(t.stack).endsWith(o.replace(/^.+\n.+\n/, "")) && (t.stack += `
` + o) : t.stack = o;
        } catch {
        }
      }
      throw t;
    }
  }
  _request(e, n) {
    typeof e == "string" ? (n = n || {}, n.url = e) : n = e || {}, n = ge(this.defaults, n);
    const { transitional: t, paramsSerializer: i, headers: o } = n;
    t !== void 0 && ra.assertOptions(t, {
      silentJSONParsing: ne.transitional(ne.boolean),
      forcedJSONParsing: ne.transitional(ne.boolean),
      clarifyTimeoutError: ne.transitional(ne.boolean)
    }, !1), i != null && (m.isFunction(i) ? n.paramsSerializer = {
      serialize: i
    } : ra.assertOptions(i, {
      encode: ne.function,
      serialize: ne.function
    }, !0)), n.allowAbsoluteUrls !== void 0 || (this.defaults.allowAbsoluteUrls !== void 0 ? n.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls : n.allowAbsoluteUrls = !0), ra.assertOptions(n, {
      baseUrl: ne.spelling("baseURL"),
      withXsrfToken: ne.spelling("withXSRFToken")
    }, !0), n.method = (n.method || this.defaults.method || "get").toLowerCase();
    let s = o && m.merge(
      o.common,
      o[n.method]
    );
    o && m.forEach(
      ["delete", "get", "head", "post", "put", "patch", "common"],
      (f) => {
        delete o[f];
      }
    ), n.headers = $.concat(s, o);
    const r = [];
    let l = !0;
    this.interceptors.request.forEach(function(v) {
      typeof v.runWhen == "function" && v.runWhen(n) === !1 || (l = l && v.synchronous, r.unshift(v.fulfilled, v.rejected));
    });
    const d = [];
    this.interceptors.response.forEach(function(v) {
      d.push(v.fulfilled, v.rejected);
    });
    let c, p = 0, u;
    if (!l) {
      const f = [jt.bind(this), void 0];
      for (f.unshift(...r), f.push(...d), u = f.length, c = Promise.resolve(n); p < u; )
        c = c.then(f[p++], f[p++]);
      return c;
    }
    u = r.length;
    let h = n;
    for (; p < u; ) {
      const f = r[p++], v = r[p++];
      try {
        h = f(h);
      } catch (x) {
        v.call(this, x);
        break;
      }
    }
    try {
      c = jt.call(this, h);
    } catch (f) {
      return Promise.reject(f);
    }
    for (p = 0, u = d.length; p < u; )
      c = c.then(d[p++], d[p++]);
    return c;
  }
  getUri(e) {
    e = ge(this.defaults, e);
    const n = gn(e.baseURL, e.url, e.allowAbsoluteUrls);
    return hn(n, e.params, e.paramsSerializer);
  }
};
m.forEach(["delete", "get", "head", "options"], function(e) {
  he.prototype[e] = function(n, t) {
    return this.request(ge(t || {}, {
      method: e,
      url: n,
      data: (t || {}).data
    }));
  };
});
m.forEach(["post", "put", "patch"], function(e) {
  function n(t) {
    return function(o, s, r) {
      return this.request(ge(r || {}, {
        method: e,
        headers: t ? {
          "Content-Type": "multipart/form-data"
        } : {},
        url: o,
        data: s
      }));
    };
  }
  he.prototype[e] = n(), he.prototype[e + "Form"] = n(!0);
});
let vp = class ji {
  constructor(e) {
    if (typeof e != "function")
      throw new TypeError("executor must be a function.");
    let n;
    this.promise = new Promise(function(o) {
      n = o;
    });
    const t = this;
    this.promise.then((i) => {
      if (!t._listeners) return;
      let o = t._listeners.length;
      for (; o-- > 0; )
        t._listeners[o](i);
      t._listeners = null;
    }), this.promise.then = (i) => {
      let o;
      const s = new Promise((r) => {
        t.subscribe(r), o = r;
      }).then(i);
      return s.cancel = function() {
        t.unsubscribe(o);
      }, s;
    }, e(function(o, s, r) {
      t.reason || (t.reason = new ve(o, s, r), n(t.reason));
    });
  }
  /**
   * Throws a `CanceledError` if cancellation has been requested.
   */
  throwIfRequested() {
    if (this.reason)
      throw this.reason;
  }
  /**
   * Subscribe to the cancel signal
   */
  subscribe(e) {
    if (this.reason) {
      e(this.reason);
      return;
    }
    this._listeners ? this._listeners.push(e) : this._listeners = [e];
  }
  /**
   * Unsubscribe from the cancel signal
   */
  unsubscribe(e) {
    if (!this._listeners)
      return;
    const n = this._listeners.indexOf(e);
    n !== -1 && this._listeners.splice(n, 1);
  }
  toAbortSignal() {
    const e = new AbortController(), n = (t) => {
      e.abort(t);
    };
    return this.subscribe(n), e.signal.unsubscribe = () => this.unsubscribe(n), e.signal;
  }
  /**
   * Returns an object that contains a new `CancelToken` and a function that, when called,
   * cancels the `CancelToken`.
   */
  static source() {
    let e;
    return {
      token: new ji(function(i) {
        e = i;
      }),
      cancel: e
    };
  }
};
function bp(a) {
  return function(n) {
    return a.apply(null, n);
  };
}
function gp(a) {
  return m.isObject(a) && a.isAxiosError === !0;
}
const sn = {
  Continue: 100,
  SwitchingProtocols: 101,
  Processing: 102,
  EarlyHints: 103,
  Ok: 200,
  Created: 201,
  Accepted: 202,
  NonAuthoritativeInformation: 203,
  NoContent: 204,
  ResetContent: 205,
  PartialContent: 206,
  MultiStatus: 207,
  AlreadyReported: 208,
  ImUsed: 226,
  MultipleChoices: 300,
  MovedPermanently: 301,
  Found: 302,
  SeeOther: 303,
  NotModified: 304,
  UseProxy: 305,
  Unused: 306,
  TemporaryRedirect: 307,
  PermanentRedirect: 308,
  BadRequest: 400,
  Unauthorized: 401,
  PaymentRequired: 402,
  Forbidden: 403,
  NotFound: 404,
  MethodNotAllowed: 405,
  NotAcceptable: 406,
  ProxyAuthenticationRequired: 407,
  RequestTimeout: 408,
  Conflict: 409,
  Gone: 410,
  LengthRequired: 411,
  PreconditionFailed: 412,
  PayloadTooLarge: 413,
  UriTooLong: 414,
  UnsupportedMediaType: 415,
  RangeNotSatisfiable: 416,
  ExpectationFailed: 417,
  ImATeapot: 418,
  MisdirectedRequest: 421,
  UnprocessableEntity: 422,
  Locked: 423,
  FailedDependency: 424,
  TooEarly: 425,
  UpgradeRequired: 426,
  PreconditionRequired: 428,
  TooManyRequests: 429,
  RequestHeaderFieldsTooLarge: 431,
  UnavailableForLegalReasons: 451,
  InternalServerError: 500,
  NotImplemented: 501,
  BadGateway: 502,
  ServiceUnavailable: 503,
  GatewayTimeout: 504,
  HttpVersionNotSupported: 505,
  VariantAlsoNegotiates: 506,
  InsufficientStorage: 507,
  LoopDetected: 508,
  NotExtended: 510,
  NetworkAuthenticationRequired: 511,
  WebServerIsDown: 521,
  ConnectionTimedOut: 522,
  OriginIsUnreachable: 523,
  TimeoutOccurred: 524,
  SslHandshakeFailed: 525,
  InvalidSslCertificate: 526
};
Object.entries(sn).forEach(([a, e]) => {
  sn[e] = a;
});
function Ci(a) {
  const e = new he(a), n = Lt(he.prototype.request, e);
  return m.extend(n, he.prototype, e, { allOwnKeys: !0 }), m.extend(n, e, null, { allOwnKeys: !0 }), n.create = function(i) {
    return Ci(ge(a, i));
  }, n;
}
const A = Ci(We);
A.Axios = he;
A.CanceledError = ve;
A.CancelToken = vp;
A.isCancel = xi;
A.VERSION = ua;
A.toFormData = wa;
A.AxiosError = b;
A.Cancel = A.CanceledError;
A.all = function(e) {
  return Promise.all(e);
};
A.spread = bp;
A.isAxiosError = gp;
A.mergeConfig = ge;
A.AxiosHeaders = $;
A.formToJSON = (a) => fi(m.isHTMLForm(a) ? new FormData(a) : a);
A.getAdapter = ki.getAdapter;
A.HttpStatusCode = sn;
A.default = A;
const {
  Axios: el,
  AxiosError: al,
  CanceledError: nl,
  isCancel: tl,
  CancelToken: il,
  VERSION: ol,
  all: sl,
  Cancel: rl,
  isAxiosError: cl,
  spread: pl,
  toFormData: ll,
  AxiosHeaders: ul,
  HttpStatusCode: dl,
  formToJSON: ml,
  getAdapter: fl,
  mergeConfig: xl
} = A;
class yp {
  async testConnection(e) {
    var n;
    try {
      return { success: !0, version: ((n = (await A.get(`${e}/api/version`)).data) == null ? void 0 : n.version) || "Unknown" };
    } catch (t) {
      return { success: !1, error: t.message };
    }
  }
  async getModels(e) {
    var n;
    try {
      return { success: !0, models: (((n = (await A.get(`${e}/api/tags`)).data) == null ? void 0 : n.models) || []).map((o) => ({
        name: o.name,
        size: o.size,
        modified_at: o.modified_at
      })) };
    } catch (t) {
      return { success: !1, models: [], error: t.message };
    }
  }
  async checkModel(e, n) {
    var t;
    try {
      return { success: !0, found: (((t = (await A.get(`${e}/api/tags`)).data) == null ? void 0 : t.models) || []).some(
        (r) => r.name === n || r.name === `${n}:latest`
      ) };
    } catch (i) {
      return { success: !1, found: !1, error: i.message };
    }
  }
  async chatStream(e, n, t, i, o) {
    return new Promise((s, r) => {
      const l = new URL(`${e}/api/chat`), d = l.protocol === "https:", c = d ? Wi : Hi, p = JSON.stringify({ model: n, messages: t, stream: !0 }), u = c.request(
        {
          hostname: l.hostname,
          port: l.port || (d ? 443 : 80),
          path: l.pathname,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(p)
          }
        },
        (h) => {
          if (h.statusCode && (h.statusCode < 200 || h.statusCode >= 300)) {
            let x = "";
            h.on("data", (g) => x += g), h.on("end", () => r(new Error(`Ollama returned ${h.statusCode}: ${x}`)));
            return;
          }
          let f = "", v = "";
          h.on("data", (x) => {
            var w;
            f += x.toString();
            const g = f.split(`
`);
            f = g.pop() || "";
            for (const E of g)
              if (E.trim())
                try {
                  const S = JSON.parse(E);
                  if ((w = S.message) != null && w.content && (v += S.message.content, i(S.message.content)), S.done) {
                    s(v);
                    return;
                  }
                } catch {
                }
          }), h.on("end", () => {
            var x;
            if (f.trim())
              try {
                const g = JSON.parse(f);
                (x = g.message) != null && x.content && (v += g.message.content, i(g.message.content));
              } catch {
              }
            s(v);
          }), h.on("error", (x) => r(x));
        }
      );
      u.on("error", (h) => r(h)), o && o.addEventListener("abort", () => {
        u.destroy(), r(new Error("Chat stream aborted"));
      }), u.write(p), u.end();
    });
  }
  async getEmbedding(e, n, t) {
    var o;
    const i = await A.post(`${e}/api/embed`, {
      model: n,
      input: t
    });
    return ((o = i.data.embeddings) == null ? void 0 : o[0]) ?? i.data.embedding ?? [];
  }
}
class wp {
  async testConnection(e) {
    var n, t, i;
    try {
      return await A.get("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${e}`
        }
      }), { success: !0 };
    } catch (o) {
      const s = o;
      return { success: !1, error: ((i = (t = (n = s.response) == null ? void 0 : n.data) == null ? void 0 : t.error) == null ? void 0 : i.message) || s.message || "Unknown error" };
    }
  }
  async getEmbedding(e, n, t) {
    return (await A.post(
      "https://api.openai.com/v1/embeddings",
      {
        input: t,
        model: n
      },
      {
        headers: { Authorization: `Bearer ${e}` }
      }
    )).data.data[0].embedding;
  }
}
const Cn = Pt(import.meta.url), Ep = Cn("mammoth"), _p = Cn("cheerio");
class Tp {
  constructor(e, n, t, i) {
    this.db = e, this.pg = n, this.ollama = t, this.openai = i;
  }
  async processProject(e) {
    const n = this.db.getProject(e);
    if (!n) throw new Error("Project not found");
    const t = this.db.getProjectDocuments(e).filter((s) => s.status === "pending" || s.status === "failed");
    if (console.log(
      `[ProcessingManager] Found ${t.length} pending/failed documents for project ${e}. Total docs: ${this.db.getProjectDocuments(e).length}`
    ), t.length === 0)
      return { processed: 0, message: "No pending documents" };
    const i = n.vector_store_config;
    if (!i || !i.url)
      throw new Error("Vector Store not configured");
    let o = 0;
    for (const s of t) {
      const r = s;
      try {
        console.log(
          `[ProcessingManager] Processing document: ${r.name} (${r.id})`
        ), this.db.updateDocumentStatus(r.id, "processing");
        const l = await this.readDocument(r);
        if (!l || !l.trim())
          throw new Error("Empty document content");
        const d = n.chunking_config || {
          strategy: "fixed",
          chunk_size: 1e3,
          chunk_overlap: 100
        }, c = this.chunkText(l, d);
        if (console.log(
          `[ProcessingManager] Generated ${c.length} chunks for doc ${r.name}`
        ), c.length === 0)
          throw new Error("No chunks generated from document content");
        const p = [], u = [];
        if (!n.embedding_config || !n.embedding_config.provider)
          throw new Error(
            "Embedding configuration not set. Please configure embedding provider in Settings."
          );
        if (!n.embedding_config.model)
          throw new Error(
            "Embedding model not set. Please configure embedding model in Settings."
          );
        console.log(
          `[ProcessingManager] Using embedding provider: ${n.embedding_config.provider}, model: ${n.embedding_config.model}`
        );
        for (let h = 0; h < c.length; h++) {
          const f = c[h], v = ca();
          let x = [];
          if (n.embedding_config.provider === "ollama") {
            const g = n.embedding_config.api_key_ref || "http://localhost:11434";
            console.log(
              `[ProcessingManager] Getting embedding from Ollama: ${g}, chunk ${h + 1}/${c.length}`
            ), x = await this.ollama.getEmbedding(
              g,
              n.embedding_config.model,
              f
            );
          } else n.embedding_config.provider === "openai" && (x = await this.openai.getEmbedding(
            n.embedding_config.api_key_ref,
            n.embedding_config.model,
            f
          ));
          x && x.length > 0 ? (p.push({
            id: v,
            documentId: r.id,
            content: f,
            contentHash: ln.createHash("sha256").update(f).digest("hex"),
            embeddingId: ca()
          }), u.push(x)) : console.warn(
            `[ProcessingManager] Empty embedding for chunk ${h + 1}`
          );
        }
        if (console.log(
          `[ProcessingManager] Successfully embedded ${p.length}/${c.length} chunks`
        ), p.length > 0) {
          console.log(
            `[ProcessingManager] Storing ${p.length} chunks to PostgreSQL...`
          ), await this.pg.insertVectorData(
            i.url,
            i,
            r,
            l,
            n.embedding_config.model,
            p,
            u
          ), console.log("[ProcessingManager] Stored successfully!"), this.db.deleteDocumentChunks(r.id);
          for (let h = 0; h < p.length; h++) {
            const f = p[h];
            this.db.addChunk(r.id, f.id, f.content, h);
          }
        } else
          throw new Error("No chunks with embeddings were generated");
        this.db.updateDocumentStatus(r.id, "completed"), o++, console.log(`[ProcessingManager] Document ${r.name} completed.`);
      } catch (l) {
        console.error(
          `[ProcessingManager] Failed to process document ${r.id}:`,
          l
        ), this.db.updateDocumentStatus(r.id, "failed");
      }
    }
    return { processed: o, total: t.length };
  }
  async readDocument(e) {
    if (e.source_type === "url")
      try {
        console.log(`[ProcessingManager] Fetching URL: ${e.source_path}`);
        const t = await fetch(e.source_path, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; DocEmbedder/1.0)"
          }
        });
        if (!t.ok)
          throw new Error(
            `HTTP error: ${t.status} ${t.statusText}`
          );
        const i = await t.text(), o = _p.load(i);
        return o(
          "script, style, nav, footer, header, aside, iframe, noscript"
        ).remove(), (o("main, article, .content, #content, .post").text() || o("body").text()).replace(/\s+/g, " ").trim();
      } catch (t) {
        throw new Error(`Error fetching URL: ${t.message}`);
      }
    const n = fa.extname(e.source_path).toLowerCase();
    try {
      if (n === ".pdf") {
        const t = await Fn.readFile(e.source_path);
        try {
          const { PDFParse: i } = await import("./index-DGGgRdeM.js"), o = new i({ data: t }), s = await o.getText();
          return await o.destroy(), s.text;
        } catch (i) {
          console.log(
            "[ProcessingManager] Dynamic import failed, trying require:",
            i
          );
          const o = Cn("pdf-parse");
          if (o.PDFParse) {
            const s = new o.PDFParse({ data: t }), r = await s.getText();
            return await s.destroy(), r.text;
          } else {
            if (typeof o == "function")
              return (await o(t)).text;
            if (typeof o.default == "function")
              return (await o.default(t)).text;
            throw new Error("Cannot parse PDF: unsupported pdf-parse version");
          }
        }
      } else {
        if (n === ".docx")
          return console.log(
            `[ProcessingManager] Extracting text from DOCX: ${e.source_path}`
          ), (await Ep.extractRawText({ path: e.source_path })).value;
        if ([".txt", ".md", ".json", ".csv"].includes(n))
          return await Fn.readFile(e.source_path, "utf-8");
        throw new Error(`Unsupported file extension: ${n}`);
      }
    } catch (t) {
      throw new Error(`Error reading file: ${t.message}`);
    }
  }
  chunkText(e, n) {
    const t = n.strategy || "fixed", i = n.chunk_size || 1e3, o = n.chunk_overlap || 100;
    return t === "sentence" ? this.chunkBySentence(e, i) : this.chunkFixed(e, i, o);
  }
  chunkFixed(e, n, t) {
    n <= 0 && (n = 1e3), t >= n && (t = n - 10), t < 0 && (t = 0);
    const i = [];
    let o = 0;
    for (; o < e.length; ) {
      const s = Math.min(o + n, e.length);
      if (i.push(e.slice(o, s)), s === e.length) break;
      o += n - t;
    }
    return i;
  }
  chunkBySentence(e, n) {
    const t = e.match(/[^.!?]+[.!?]+(\s+|$)/g) || [e], i = [];
    let o = [], s = 0;
    for (let r = 0; r < t.length; r++) {
      const l = t[r];
      if (s + l.length > n && o.length > 0) {
        i.push(o.join("").trim());
        const d = o[o.length - 1];
        o = [], s = 0, d && d.length < n && (o.push(d), s += d.length);
      }
      o.push(l), s += l.length;
    }
    return o.length > 0 && i.push(o.join("").trim()), i;
  }
  async searchProject(e, n, t = 5) {
    const i = this.db.getProject(e);
    if (!i) throw new Error("Project not found");
    const o = i.vector_store_config;
    if (!o || !o.url)
      throw new Error("Vector Store not configured");
    let s = [];
    if (i.embedding_config.provider === "ollama") {
      const r = i.embedding_config.api_key_ref || "http://localhost:11434";
      s = await this.ollama.getEmbedding(
        r,
        i.embedding_config.model,
        n
      );
    } else i.embedding_config.provider === "openai" && (s = await this.openai.getEmbedding(
      i.embedding_config.api_key_ref,
      i.embedding_config.model,
      n
    ));
    if (s.length === 0)
      throw new Error("Failed to generate embedding for query");
    return await this.pg.searchVectors(
      o.url,
      o,
      s,
      t
    );
  }
}
const Rp = Li(import.meta.url), Oi = oe.dirname(Rp);
process.env.APP_ROOT = oe.join(Oi, "..");
const rn = process.env.VITE_DEV_SERVER_URL, hl = oe.join(process.env.APP_ROOT, "dist-electron"), Ai = oe.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = rn ? oe.join(process.env.APP_ROOT, "public") : Ai;
let j, k, Le, _e, Ot, Ya, Te = null;
function Pi() {
  const a = k.getSetting("window_bounds");
  j = new At({
    icon: oe.join(process.env.VITE_PUBLIC, "logo.png"),
    webPreferences: {
      preload: oe.join(Oi, "preload.mjs")
    },
    width: (a == null ? void 0 : a.width) || 1200,
    height: (a == null ? void 0 : a.height) || 800,
    x: a == null ? void 0 : a.x,
    y: a == null ? void 0 : a.y,
    titleBarStyle: "hidden",
    title: "Cartography",
    backgroundColor: "#09090b"
  }), j.on("close", () => {
    j && k.setSetting("window_bounds", j.getBounds());
  }), j.webContents.on("did-finish-load", () => {
    j == null || j.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), rn ? j.loadURL(rn) : j.loadFile(oe.join(Ai, "index.html"));
}
Ue.on("window-all-closed", () => {
  process.platform !== "darwin" && (Ue.quit(), j = null);
});
Ue.on("activate", () => {
  At.getAllWindows().length === 0 && Pi();
});
Ue.whenReady().then(() => {
  const a = Ue.getPath("userData");
  console.log("Initializing Database at:", a), k = new Ji(a), Le = new Yi(), _e = new yp(), Ot = new wp(), Ya = new Tp(
    k,
    Le,
    _e,
    Ot
  ), O.handle("get-projects", (e, n) => k.getAllProjects(n)), O.handle("create-project", (e, n, t, i) => k.createProject(n, t, i)), O.handle("update-project", (e, n, t) => k.updateProject(n, t)), O.handle("delete-project", async (e, n) => {
    try {
      const t = k.getProject(n);
      if (t && t.vector_store_config && t.vector_store_config.url) {
        console.log(`Cleaning up vectors for project ${n}...`);
        const i = k.getProjectDocuments(n);
        for (const o of i)
          await Le.deleteDocumentVectors(
            t.vector_store_config.url,
            t.vector_store_config,
            o.id
          );
      }
    } catch (t) {
      console.error("Error cleaning up vectors during project deletion:", t);
    }
    return k.deleteProject(n), { success: !0 };
  }), O.handle("get-project", (e, n) => k.getProject(n)), O.handle("archive-project", (e, n, t) => k.archiveProject(n, t)), O.handle("duplicate-project", (e, n) => {
    const t = k.getProject(n);
    if (!t) throw new Error("Project not found");
    const i = k.createProject(
      t.name + " (Copy)",
      t.description,
      t.color
    );
    return i && (t.embedding_config || t.chunking_config || t.vector_store_config) && k.updateProjectConfig(
      i.id,
      t.embedding_config,
      t.chunking_config,
      t.vector_store_config
    ), k.getProject(i.id);
  }), O.handle("export-project-config", async (e, n) => {
    if (!j) return null;
    const t = k.getProject(n);
    if (!t) throw new Error("Project not found");
    const i = await Ta.showSaveDialog(j, {
      title: "Export Project Configuration",
      defaultPath: `${t.name.replace(/[^a-z0-9]/gi, "_")}_config.json`,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (i.canceled || !i.filePath) return null;
    const o = {
      name: t.name,
      description: t.description,
      tags: t.tags,
      color: t.color,
      embedding_config: t.embedding_config,
      chunking_config: t.chunking_config,
      vector_store_config: t.vector_store_config
    };
    return await Pn.writeFile(i.filePath, JSON.stringify(o, null, 2)), i.filePath;
  }), O.handle("import-project-config", async () => {
    if (!j) return null;
    const e = await Ta.showOpenDialog(j, {
      title: "Import Project Configuration",
      filters: [{ name: "JSON", extensions: ["json"] }],
      properties: ["openFile"]
    });
    if (e.canceled || e.filePaths.length === 0) return null;
    const n = await Pn.readFile(e.filePaths[0], "utf-8"), t = JSON.parse(n), i = k.createProject(
      t.name || "Imported Project",
      t.description || "",
      t.color || "#2563eb"
    );
    return i && (t.embedding_config || t.chunking_config || t.vector_store_config) && k.updateProjectConfig(
      i.id,
      t.embedding_config,
      t.chunking_config,
      t.vector_store_config
    ), k.getProject(i.id);
  }), O.handle("window-minimize", () => {
    j == null || j.minimize();
  }), O.handle("window-maximize", () => {
    j != null && j.isMaximized() ? j.unmaximize() : j == null || j.maximize();
  }), O.handle("window-close", () => {
    j == null || j.close();
  }), O.handle("get-setting", (e, n) => k.getSetting(n)), O.handle("set-setting", (e, n, t) => k.setSetting(n, t)), O.handle("get-dashboard-stats", () => k.getDashboardStats()), O.handle("import-documents", async (e, n) => {
    if (!j) return [];
    const t = await Ta.showOpenDialog(j, {
      title: "Import Documents",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Documents", extensions: ["pdf", "txt", "md", "json"] }
      ]
    });
    if (t.canceled || t.filePaths.length === 0)
      return [];
    const i = [];
    for (const o of t.filePaths) {
      const s = oe.basename(o), r = k.addDocument(n, s, o, "file");
      i.push(r);
    }
    return i;
  }), O.handle("get-project-documents", (e, n) => k.getProjectDocuments(n)), O.handle("delete-document", async (e, n, t) => {
    const i = k.getProject(n);
    if (!i) throw new Error("Project not found");
    if (!k.getDocument(t)) throw new Error("Document not found");
    if (i.vector_store_config && i.vector_store_config.url && (console.log(
      `Attempting to delete vectors for doc ${t} from ${i.vector_store_config.provider}`
    ), i.vector_store_config.provider === "pgvector")) {
      const s = await Le.deleteDocumentVectors(
        i.vector_store_config.url,
        i.vector_store_config,
        t
      );
      s.success || console.warn("Failed to delete vectors from Postgres:", s.error);
    }
    return k.deleteDocument(t), { success: !0 };
  }), O.handle(
    "update-project-config",
    (e, n, t, i, o) => k.updateProjectConfig(
      n,
      t,
      i,
      o
    )
  ), O.handle("test-postgres-connection", async (e, n) => await Le.testConnection(n)), O.handle("test-ollama-connection", async (e, n) => await _e.testConnection(n)), O.handle("get-ollama-models", async (e, n) => await _e.getModels(n)), O.handle("check-ollama-model", async (e, n, t) => await _e.checkModel(n, t)), O.handle("process-project", async (e, n) => {
    const t = await Ya.processProject(n);
    if (An.isSupported()) {
      const i = k.getProject(n);
      new An({
        title: "Processing Complete",
        body: `${(i == null ? void 0 : i.name) || "Project"}: ${t.processed} document${t.processed !== 1 ? "s" : ""} processed.`
      }).show();
    }
    return t;
  }), O.handle("search-project", async (e, n, t, i) => await Ya.searchProject(n, t, i)), O.handle("chat-send", async (e, n, t, i, o) => {
    Te = new AbortController();
    const s = o ? [{ role: "system", content: o }, ...i] : i;
    try {
      await _e.chatStream(
        n,
        t,
        s,
        (r) => {
          e.sender.send("chat-token", r);
        },
        Te.signal
      ), e.sender.send("chat-done");
    } catch (r) {
      const l = r.message;
      l !== "Chat stream aborted" ? e.sender.send("chat-error", l) : e.sender.send("chat-done");
    } finally {
      Te = null;
    }
  }), O.handle("chat-abort", () => {
    Te && (Te.abort(), Te = null);
  }), Pi();
});
export {
  hl as MAIN_DIST,
  Ai as RENDERER_DIST,
  rn as VITE_DEV_SERVER_URL
};
