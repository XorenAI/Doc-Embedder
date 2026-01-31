var Ot = Object.defineProperty;
var Ct = (a, e, n) => e in a ? Ot(a, e, { enumerable: !0, configurable: !0, writable: !0, value: n }) : a[e] = n;
var jn = (a, e, n) => Ct(a, typeof e != "symbol" ? e + "" : e, n);
import { app as Le, BrowserWindow as ki, ipcMain as N, dialog as At } from "electron";
import { fileURLToPath as Pt } from "node:url";
import oe from "node:path";
import Ft from "better-sqlite3";
import ma from "path";
import { randomFillSync as Lt, randomUUID as Nt } from "node:crypto";
import { createRequire as ji } from "module";
import ye from "util";
import V, { Readable as Ut } from "stream";
import sn from "http";
import rn from "https";
import fa from "url";
import Dt from "fs";
import cn from "crypto";
import Oi from "http2";
import It from "assert";
import Ci from "tty";
import Bt from "os";
import pe from "zlib";
import { EventEmitter as qt } from "events";
import On from "fs/promises";
const z = [];
for (let a = 0; a < 256; ++a)
  z.push((a + 256).toString(16).slice(1));
function zt(a, e = 0) {
  return (z[a[e + 0]] + z[a[e + 1]] + z[a[e + 2]] + z[a[e + 3]] + "-" + z[a[e + 4]] + z[a[e + 5]] + "-" + z[a[e + 6]] + z[a[e + 7]] + "-" + z[a[e + 8]] + z[a[e + 9]] + "-" + z[a[e + 10]] + z[a[e + 11]] + z[a[e + 12]] + z[a[e + 13]] + z[a[e + 14]] + z[a[e + 15]]).toLowerCase();
}
const aa = new Uint8Array(256);
let Ge = aa.length;
function Mt() {
  return Ge > aa.length - 16 && (Lt(aa), Ge = 0), aa.slice(Ge, Ge += 16);
}
const Cn = { randomUUID: Nt };
function $t(a, e, n) {
  var t;
  a = a || {};
  const i = a.random ?? ((t = a.rng) == null ? void 0 : t.call(a)) ?? Mt();
  if (i.length < 16)
    throw new Error("Random bytes length must be >= 16");
  return i[6] = i[6] & 15 | 64, i[8] = i[8] & 63 | 128, zt(i);
}
function ra(a, e, n) {
  return Cn.randomUUID && !a ? Cn.randomUUID() : $t(a);
}
class Ht {
  constructor(e) {
    jn(this, "db");
    const n = ma.join(e, "doc-embedder.db");
    this.db = new Ft(n), this.db.pragma("journal_mode = WAL"), this._runMigrations();
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
    const i = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(e);
    return i ? JSON.parse(i.value) : null;
  }
  setSetting(e, n) {
    this.db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(e, JSON.stringify(n));
  }
  // --- Projects ---
  getAllProjects() {
    return this.db.prepare(`
      SELECT p.*, 
        (SELECT COUNT(*) FROM documents d WHERE d.project_id = p.id) as document_count,
        (SELECT COUNT(*) FROM chunks c JOIN documents d ON c.document_id = d.id WHERE d.project_id = p.id) as chunk_count
      FROM projects p
      WHERE archived = 0
      ORDER BY updated_at DESC
    `).all().map(this._parseProject);
  }
  createProject(e, n = "", i = "blue") {
    const t = ra();
    return this.db.prepare(`
      INSERT INTO projects (id, name, description, color) VALUES (?, ?, ?, ?)
    `).run(t, e, n, i), this.getProject(t);
  }
  updateProject(e, n) {
    const i = [], t = [];
    return n.name !== void 0 && (i.push("name = ?"), t.push(n.name)), n.description !== void 0 && (i.push("description = ?"), t.push(n.description)), n.color !== void 0 && (i.push("color = ?"), t.push(n.color)), i.length === 0 ? this.getProject(e) : (i.push("updated_at = CURRENT_TIMESTAMP"), t.push(e), this.db.prepare(`
      UPDATE projects SET ${i.join(", ")} WHERE id = ?
    `).run(...t), this.getProject(e));
  }
  deleteProject(e) {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(e);
  }
  getProject(e) {
    const i = this.db.prepare("SELECT * FROM projects WHERE id = ?").get(e);
    return i ? this._parseProject(i) : null;
  }
  getDashboardStats() {
    const e = this.db.prepare("SELECT COUNT(*) as count FROM projects WHERE archived = 0").get(), n = this.db.prepare("SELECT COUNT(*) as count FROM documents").get(), i = this.db.prepare("SELECT COUNT(*) as count FROM chunks").get(), t = this.db.prepare("SELECT COUNT(*) as count FROM vector_store_connections").get(), o = this.db.prepare(
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
      totalChunks: i.count,
      activeVectorStores: t.count,
      recentActivity: o
    };
  }
  // --- Documents ---
  addDocument(e, n, i, t = "file") {
    const o = ra();
    return this.db.prepare(`
      INSERT INTO documents (id, project_id, name, source_type, source_path, status)
      VALUES (?, ?, ?, ?, ?, 'pending')
    `).run(o, e, n, t, i), this.getDocument(o);
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
  addChunk(e, n, i, t = 0) {
    this.db.prepare(`
      INSERT INTO chunks (id, document_id, content, position) VALUES (?, ?, ?, ?)
    `).run(n, e, i, t);
  }
  getDocumentChunks(e) {
    return this.db.prepare(
      "SELECT * FROM chunks WHERE document_id = ? ORDER BY position"
    ).all(e);
  }
  deleteDocumentChunks(e) {
    this.db.prepare("DELETE FROM chunks WHERE document_id = ?").run(e);
  }
  updateProjectConfig(e, n, i = null, t = null) {
    return this.db.prepare(`
      UPDATE projects 
      SET embedding_config = ?, chunking_config = ?, vector_store_config = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      JSON.stringify(n),
      i ? JSON.stringify(i) : null,
      t ? JSON.stringify(t) : null,
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
const Wt = ji(import.meta.url), { Client: Xe } = Wt("pg");
class Vt {
  async testConnection(e) {
    const n = new Xe({
      connectionString: e
    });
    try {
      await n.connect();
      const t = (await n.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE';
      `)).rows.map(
        (o) => o.table_name
      );
      return await n.end(), { success: !0, tables: t };
    } catch (i) {
      try {
        await n.end();
      } catch {
      }
      return { success: !1, error: i.message };
    }
  }
  async insertVectorData(e, n, i, t, o, s, r) {
    const l = n.documentTable || "documents", m = n.chunkTable || "chunks", c = n.embeddingTable || "embeddings", p = new Xe({ connectionString: e });
    try {
      await p.connect(), await p.query("BEGIN"), await p.query(
        `INSERT INTO ${l} (document_id, source, title, content, doc_metadata, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (document_id) DO NOTHING`,
        [
          i.id,
          i.source_type,
          i.name,
          t,
          i.metadata ? JSON.stringify(i.metadata) : null
        ]
      );
      for (let u = 0; u < s.length; u++) {
        const h = s[u], f = r[u];
        await p.query(
          `INSERT INTO ${m} (chunk_id, document_id, content, content_hash, created_at) VALUES ($1, $2, $3, $4, NOW()) ON CONFLICT (chunk_id) DO NOTHING`,
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
  async searchVectors(e, n, i, t = 5) {
    const o = n.documentTable || "documents", s = n.chunkTable || "chunks", r = n.embeddingTable || "embeddings", l = new Xe({ connectionString: e });
    try {
      await l.connect();
      const m = `[${i.join(",")}]`, c = `
        SELECT 
          c.content, 
          d.title as document_name, 
          (1 - (e.embedding <=> $1)) as similarity
        FROM ${r} e
        JOIN ${s} c ON e.chunk_id = c.chunk_id
        JOIN ${o} d ON c.document_id = d.document_id
        ORDER BY e.embedding <=> $1
        LIMIT $2;
      `, p = await l.query(c, [m, t]);
      return await l.end(), p.rows;
    } catch (m) {
      try {
        await l.end();
      } catch {
      }
      throw m;
    }
  }
  async deleteDocumentVectors(e, n, i) {
    const t = n.documentTable || "documents", o = n.chunkTable || "chunks", s = n.embeddingTable || "embeddings", r = new Xe({ connectionString: e });
    try {
      return await r.connect(), await r.query("BEGIN"), await r.query(
        `DELETE FROM ${s} 
         WHERE chunk_id IN (
           SELECT chunk_id FROM ${o} WHERE document_id = $1
         )`,
        [i]
      ), await r.query(`DELETE FROM ${o} WHERE document_id = $1`, [
        i
      ]), await r.query(`DELETE FROM ${t} WHERE document_id = $1`, [
        i
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
function Ai(a, e) {
  return function() {
    return a.apply(e, arguments);
  };
}
const { toString: Gt } = Object.prototype, { getPrototypeOf: pn } = Object, { iterator: xa, toStringTag: Pi } = Symbol, ha = /* @__PURE__ */ ((a) => (e) => {
  const n = Gt.call(e);
  return a[n] || (a[n] = n.slice(8, -1).toLowerCase());
})(/* @__PURE__ */ Object.create(null)), Z = (a) => (a = a.toLowerCase(), (e) => ha(e) === a), va = (a) => (e) => typeof e === a, { isArray: Ce } = Array, ke = va("undefined");
function Ie(a) {
  return a !== null && !ke(a) && a.constructor !== null && !ke(a.constructor) && G(a.constructor.isBuffer) && a.constructor.isBuffer(a);
}
const Fi = Z("ArrayBuffer");
function Xt(a) {
  let e;
  return typeof ArrayBuffer < "u" && ArrayBuffer.isView ? e = ArrayBuffer.isView(a) : e = a && a.buffer && Fi(a.buffer), e;
}
const Jt = va("string"), G = va("function"), Li = va("number"), Be = (a) => a !== null && typeof a == "object", Kt = (a) => a === !0 || a === !1, na = (a) => {
  if (ha(a) !== "object")
    return !1;
  const e = pn(a);
  return (e === null || e === Object.prototype || Object.getPrototypeOf(e) === null) && !(Pi in a) && !(xa in a);
}, Yt = (a) => {
  if (!Be(a) || Ie(a))
    return !1;
  try {
    return Object.keys(a).length === 0 && Object.getPrototypeOf(a) === Object.prototype;
  } catch {
    return !1;
  }
}, Qt = Z("Date"), Zt = Z("File"), eo = Z("Blob"), ao = Z("FileList"), no = (a) => Be(a) && G(a.pipe), io = (a) => {
  let e;
  return a && (typeof FormData == "function" && a instanceof FormData || G(a.append) && ((e = ha(a)) === "formdata" || // detect form-data instance
  e === "object" && G(a.toString) && a.toString() === "[object FormData]"));
}, to = Z("URLSearchParams"), [oo, so, ro, co] = ["ReadableStream", "Request", "Response", "Headers"].map(Z), po = (a) => a.trim ? a.trim() : a.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
function qe(a, e, { allOwnKeys: n = !1 } = {}) {
  if (a === null || typeof a > "u")
    return;
  let i, t;
  if (typeof a != "object" && (a = [a]), Ce(a))
    for (i = 0, t = a.length; i < t; i++)
      e.call(null, a[i], i, a);
  else {
    if (Ie(a))
      return;
    const o = n ? Object.getOwnPropertyNames(a) : Object.keys(a), s = o.length;
    let r;
    for (i = 0; i < s; i++)
      r = o[i], e.call(null, a[r], r, a);
  }
}
function Ni(a, e) {
  if (Ie(a))
    return null;
  e = e.toLowerCase();
  const n = Object.keys(a);
  let i = n.length, t;
  for (; i-- > 0; )
    if (t = n[i], e === t.toLowerCase())
      return t;
  return null;
}
const de = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : global, Ui = (a) => !ke(a) && a !== de;
function Ka() {
  const { caseless: a, skipUndefined: e } = Ui(this) && this || {}, n = {}, i = (t, o) => {
    const s = a && Ni(n, o) || o;
    na(n[s]) && na(t) ? n[s] = Ka(n[s], t) : na(t) ? n[s] = Ka({}, t) : Ce(t) ? n[s] = t.slice() : (!e || !ke(t)) && (n[s] = t);
  };
  for (let t = 0, o = arguments.length; t < o; t++)
    arguments[t] && qe(arguments[t], i);
  return n;
}
const lo = (a, e, n, { allOwnKeys: i } = {}) => (qe(e, (t, o) => {
  n && G(t) ? Object.defineProperty(a, o, {
    value: Ai(t, n),
    writable: !0,
    enumerable: !0,
    configurable: !0
  }) : Object.defineProperty(a, o, {
    value: t,
    writable: !0,
    enumerable: !0,
    configurable: !0
  });
}, { allOwnKeys: i }), a), uo = (a) => (a.charCodeAt(0) === 65279 && (a = a.slice(1)), a), mo = (a, e, n, i) => {
  a.prototype = Object.create(e.prototype, i), Object.defineProperty(a.prototype, "constructor", {
    value: a,
    writable: !0,
    enumerable: !1,
    configurable: !0
  }), Object.defineProperty(a, "super", {
    value: e.prototype
  }), n && Object.assign(a.prototype, n);
}, fo = (a, e, n, i) => {
  let t, o, s;
  const r = {};
  if (e = e || {}, a == null) return e;
  do {
    for (t = Object.getOwnPropertyNames(a), o = t.length; o-- > 0; )
      s = t[o], (!i || i(s, a, e)) && !r[s] && (e[s] = a[s], r[s] = !0);
    a = n !== !1 && pn(a);
  } while (a && (!n || n(a, e)) && a !== Object.prototype);
  return e;
}, xo = (a, e, n) => {
  a = String(a), (n === void 0 || n > a.length) && (n = a.length), n -= e.length;
  const i = a.indexOf(e, n);
  return i !== -1 && i === n;
}, ho = (a) => {
  if (!a) return null;
  if (Ce(a)) return a;
  let e = a.length;
  if (!Li(e)) return null;
  const n = new Array(e);
  for (; e-- > 0; )
    n[e] = a[e];
  return n;
}, vo = /* @__PURE__ */ ((a) => (e) => a && e instanceof a)(typeof Uint8Array < "u" && pn(Uint8Array)), bo = (a, e) => {
  const i = (a && a[xa]).call(a);
  let t;
  for (; (t = i.next()) && !t.done; ) {
    const o = t.value;
    e.call(a, o[0], o[1]);
  }
}, go = (a, e) => {
  let n;
  const i = [];
  for (; (n = a.exec(e)) !== null; )
    i.push(n);
  return i;
}, yo = Z("HTMLFormElement"), wo = (a) => a.toLowerCase().replace(
  /[-_\s]([a-z\d])(\w*)/g,
  function(n, i, t) {
    return i.toUpperCase() + t;
  }
), An = (({ hasOwnProperty: a }) => (e, n) => a.call(e, n))(Object.prototype), Eo = Z("RegExp"), Di = (a, e) => {
  const n = Object.getOwnPropertyDescriptors(a), i = {};
  qe(n, (t, o) => {
    let s;
    (s = e(t, o, a)) !== !1 && (i[o] = s || t);
  }), Object.defineProperties(a, i);
}, _o = (a) => {
  Di(a, (e, n) => {
    if (G(a) && ["arguments", "caller", "callee"].indexOf(n) !== -1)
      return !1;
    const i = a[n];
    if (G(i)) {
      if (e.enumerable = !1, "writable" in e) {
        e.writable = !1;
        return;
      }
      e.set || (e.set = () => {
        throw Error("Can not rewrite read-only method '" + n + "'");
      });
    }
  });
}, To = (a, e) => {
  const n = {}, i = (t) => {
    t.forEach((o) => {
      n[o] = !0;
    });
  };
  return Ce(a) ? i(a) : i(String(a).split(e)), n;
}, Ro = () => {
}, So = (a, e) => a != null && Number.isFinite(a = +a) ? a : e;
function ko(a) {
  return !!(a && G(a.append) && a[Pi] === "FormData" && a[xa]);
}
const jo = (a) => {
  const e = new Array(10), n = (i, t) => {
    if (Be(i)) {
      if (e.indexOf(i) >= 0)
        return;
      if (Ie(i))
        return i;
      if (!("toJSON" in i)) {
        e[t] = i;
        const o = Ce(i) ? [] : {};
        return qe(i, (s, r) => {
          const l = n(s, t + 1);
          !ke(l) && (o[r] = l);
        }), e[t] = void 0, o;
      }
    }
    return i;
  };
  return n(a, 0);
}, Oo = Z("AsyncFunction"), Co = (a) => a && (Be(a) || G(a)) && G(a.then) && G(a.catch), Ii = ((a, e) => a ? setImmediate : e ? ((n, i) => (de.addEventListener("message", ({ source: t, data: o }) => {
  t === de && o === n && i.length && i.shift()();
}, !1), (t) => {
  i.push(t), de.postMessage(n, "*");
}))(`axios@${Math.random()}`, []) : (n) => setTimeout(n))(
  typeof setImmediate == "function",
  G(de.postMessage)
), Ao = typeof queueMicrotask < "u" ? queueMicrotask.bind(de) : typeof process < "u" && process.nextTick || Ii, Po = (a) => a != null && G(a[xa]), d = {
  isArray: Ce,
  isArrayBuffer: Fi,
  isBuffer: Ie,
  isFormData: io,
  isArrayBufferView: Xt,
  isString: Jt,
  isNumber: Li,
  isBoolean: Kt,
  isObject: Be,
  isPlainObject: na,
  isEmptyObject: Yt,
  isReadableStream: oo,
  isRequest: so,
  isResponse: ro,
  isHeaders: co,
  isUndefined: ke,
  isDate: Qt,
  isFile: Zt,
  isBlob: eo,
  isRegExp: Eo,
  isFunction: G,
  isStream: no,
  isURLSearchParams: to,
  isTypedArray: vo,
  isFileList: ao,
  forEach: qe,
  merge: Ka,
  extend: lo,
  trim: po,
  stripBOM: uo,
  inherits: mo,
  toFlatObject: fo,
  kindOf: ha,
  kindOfTest: Z,
  endsWith: xo,
  toArray: ho,
  forEachEntry: bo,
  matchAll: go,
  isHTMLForm: yo,
  hasOwnProperty: An,
  hasOwnProp: An,
  // an alias to avoid ESLint no-prototype-builtins detection
  reduceDescriptors: Di,
  freezeMethods: _o,
  toObjectSet: To,
  toCamelCase: wo,
  noop: Ro,
  toFiniteNumber: So,
  findKey: Ni,
  global: de,
  isContextDefined: Ui,
  isSpecCompliantForm: ko,
  toJSONObject: jo,
  isAsyncFn: Oo,
  isThenable: Co,
  setImmediate: Ii,
  asap: Ao,
  isIterable: Po
};
let b = class Bi extends Error {
  static from(e, n, i, t, o, s) {
    const r = new Bi(e.message, n || e.code, i, t, o);
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
  constructor(e, n, i, t, o) {
    super(e), this.name = "AxiosError", this.isAxiosError = !0, n && (this.code = n), i && (this.config = i), t && (this.request = t), o && (this.response = o, this.status = o.status);
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
      config: d.toJSONObject(this.config),
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
function qi(a) {
  return a && a.__esModule && Object.prototype.hasOwnProperty.call(a, "default") ? a.default : a;
}
var zi = V.Stream, Fo = ye, Lo = ee;
function ee() {
  this.source = null, this.dataSize = 0, this.maxDataSize = 1024 * 1024, this.pauseStream = !0, this._maxDataSizeExceeded = !1, this._released = !1, this._bufferedEvents = [];
}
Fo.inherits(ee, zi);
ee.create = function(a, e) {
  var n = new this();
  e = e || {};
  for (var i in e)
    n[i] = e[i];
  n.source = a;
  var t = a.emit;
  return a.emit = function() {
    return n._handleEmit(arguments), t.apply(a, arguments);
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
  var a = zi.prototype.pipe.apply(this, arguments);
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
var No = ye, Mi = V.Stream, Pn = Lo, Uo = F;
function F() {
  this.writable = !1, this.readable = !0, this.dataSize = 0, this.maxDataSize = 2 * 1024 * 1024, this.pauseStreams = !0, this._released = !1, this._streams = [], this._currentStream = null, this._insideLoop = !1, this._pendingNext = !1;
}
No.inherits(F, Mi);
F.create = function(a) {
  var e = new this();
  a = a || {};
  for (var n in a)
    e[n] = a[n];
  return e;
};
F.isStreamLike = function(a) {
  return typeof a != "function" && typeof a != "string" && typeof a != "boolean" && typeof a != "number" && !Buffer.isBuffer(a);
};
F.prototype.append = function(a) {
  var e = F.isStreamLike(a);
  if (e) {
    if (!(a instanceof Pn)) {
      var n = Pn.create(a, {
        maxDataSize: 1 / 0,
        pauseStream: this.pauseStreams
      });
      a.on("data", this._checkDataSize.bind(this)), a = n;
    }
    this._handleErrors(a), this.pauseStreams && a.pause();
  }
  return this._streams.push(a), this;
};
F.prototype.pipe = function(a, e) {
  return Mi.prototype.pipe.call(this, a, e), this.resume(), a;
};
F.prototype._getNext = function() {
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
F.prototype._realGetNext = function() {
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
    var i = F.isStreamLike(n);
    i && (n.on("data", this._checkDataSize.bind(this)), this._handleErrors(n)), this._pipeNext(n);
  }).bind(this));
};
F.prototype._pipeNext = function(a) {
  this._currentStream = a;
  var e = F.isStreamLike(a);
  if (e) {
    a.on("end", this._getNext.bind(this)), a.pipe(this, { end: !1 });
    return;
  }
  var n = a;
  this.write(n), this._getNext();
};
F.prototype._handleErrors = function(a) {
  var e = this;
  a.on("error", function(n) {
    e._emitError(n);
  });
};
F.prototype.write = function(a) {
  this.emit("data", a);
};
F.prototype.pause = function() {
  this.pauseStreams && (this.pauseStreams && this._currentStream && typeof this._currentStream.pause == "function" && this._currentStream.pause(), this.emit("pause"));
};
F.prototype.resume = function() {
  this._released || (this._released = !0, this.writable = !0, this._getNext()), this.pauseStreams && this._currentStream && typeof this._currentStream.resume == "function" && this._currentStream.resume(), this.emit("resume");
};
F.prototype.end = function() {
  this._reset(), this.emit("end");
};
F.prototype.destroy = function() {
  this._reset(), this.emit("close");
};
F.prototype._reset = function() {
  this.writable = !1, this._streams = [], this._currentStream = null;
};
F.prototype._checkDataSize = function() {
  if (this._updateDataSize(), !(this.dataSize <= this.maxDataSize)) {
    var a = "DelayedStream#maxDataSize of " + this.maxDataSize + " bytes exceeded.";
    this._emitError(new Error(a));
  }
};
F.prototype._updateDataSize = function() {
  this.dataSize = 0;
  var a = this;
  this._streams.forEach(function(e) {
    e.dataSize && (a.dataSize += e.dataSize);
  }), this._currentStream && this._currentStream.dataSize && (this.dataSize += this._currentStream.dataSize);
};
F.prototype._emitError = function(a) {
  this._reset(), this.emit("error", a);
};
var $i = {};
const Do = {
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
var Io = Do;
/*!
 * mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */
(function(a) {
  var e = Io, n = ma.extname, i = /^\s*([^;\s]*)(?:;|\s|$)/, t = /^text\//i;
  a.charset = o, a.charsets = { lookup: o }, a.contentType = s, a.extension = r, a.extensions = /* @__PURE__ */ Object.create(null), a.lookup = l, a.types = /* @__PURE__ */ Object.create(null), m(a.extensions, a.types);
  function o(c) {
    if (!c || typeof c != "string")
      return !1;
    var p = i.exec(c), u = p && e[p[1].toLowerCase()];
    return u && u.charset ? u.charset : p && t.test(p[1]) ? "UTF-8" : !1;
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
    var p = i.exec(c), u = p && a.extensions[p[1].toLowerCase()];
    return !u || !u.length ? !1 : u[0];
  }
  function l(c) {
    if (!c || typeof c != "string")
      return !1;
    var p = n("x." + c).toLowerCase().substr(1);
    return p && a.types[p] || !1;
  }
  function m(c, p) {
    var u = ["nginx", "apache", void 0, "iana"];
    Object.keys(e).forEach(function(f) {
      var v = e[f], x = v.extensions;
      if (!(!x || !x.length)) {
        c[f] = x;
        for (var y = 0; y < x.length; y++) {
          var E = x[y];
          if (p[E]) {
            var _ = u.indexOf(e[p[E]].source), k = u.indexOf(v.source);
            if (p[E] !== "application/octet-stream" && (_ > k || _ === k && p[E].substr(0, 12) === "application/"))
              continue;
          }
          p[E] = f;
        }
      }
    });
  }
})($i);
var Bo = qo;
function qo(a) {
  var e = typeof setImmediate == "function" ? setImmediate : typeof process == "object" && typeof process.nextTick == "function" ? process.nextTick : null;
  e ? e(a) : setTimeout(a, 0);
}
var Fn = Bo, Hi = zo;
function zo(a) {
  var e = !1;
  return Fn(function() {
    e = !0;
  }), function(i, t) {
    e ? a(i, t) : Fn(function() {
      a(i, t);
    });
  };
}
var Wi = Mo;
function Mo(a) {
  Object.keys(a.jobs).forEach($o.bind(a)), a.jobs = {};
}
function $o(a) {
  typeof this.jobs[a] == "function" && this.jobs[a]();
}
var Ln = Hi, Ho = Wi, Vi = Wo;
function Wo(a, e, n, i) {
  var t = n.keyedList ? n.keyedList[n.index] : n.index;
  n.jobs[t] = Vo(e, t, a[t], function(o, s) {
    t in n.jobs && (delete n.jobs[t], o ? Ho(n) : n.results[t] = s, i(o, n.results));
  });
}
function Vo(a, e, n, i) {
  var t;
  return a.length == 2 ? t = a(n, Ln(i)) : t = a(n, e, Ln(i)), t;
}
var Gi = Go;
function Go(a, e) {
  var n = !Array.isArray(a), i = {
    index: 0,
    keyedList: n || e ? Object.keys(a) : null,
    jobs: {},
    results: n ? {} : [],
    size: n ? Object.keys(a).length : a.length
  };
  return e && i.keyedList.sort(n ? e : function(t, o) {
    return e(a[t], a[o]);
  }), i;
}
var Xo = Wi, Jo = Hi, Xi = Ko;
function Ko(a) {
  Object.keys(this.jobs).length && (this.index = this.size, Xo(this), Jo(a)(null, this.results));
}
var Yo = Vi, Qo = Gi, Zo = Xi, es = as;
function as(a, e, n) {
  for (var i = Qo(a); i.index < (i.keyedList || a).length; )
    Yo(a, e, i, function(t, o) {
      if (t) {
        n(t, o);
        return;
      }
      if (Object.keys(i.jobs).length === 0) {
        n(null, i.results);
        return;
      }
    }), i.index++;
  return Zo.bind(i, n);
}
var ba = { exports: {} }, Nn = Vi, ns = Gi, is = Xi;
ba.exports = ts;
ba.exports.ascending = Ji;
ba.exports.descending = os;
function ts(a, e, n, i) {
  var t = ns(a, n);
  return Nn(a, e, t, function o(s, r) {
    if (s) {
      i(s, r);
      return;
    }
    if (t.index++, t.index < (t.keyedList || a).length) {
      Nn(a, e, t, o);
      return;
    }
    i(null, t.results);
  }), is.bind(t, i);
}
function Ji(a, e) {
  return a < e ? -1 : a > e ? 1 : 0;
}
function os(a, e) {
  return -1 * Ji(a, e);
}
var Ki = ba.exports, ss = Ki, rs = cs;
function cs(a, e, n) {
  return ss(a, e, null, n);
}
var ps = {
  parallel: es,
  serial: rs,
  serialOrdered: Ki
}, Yi = Object, ls = Error, us = EvalError, ds = RangeError, ms = ReferenceError, fs = SyntaxError, ln = TypeError, xs = URIError, hs = Math.abs, vs = Math.floor, bs = Math.max, gs = Math.min, ys = Math.pow, ws = Math.round, Es = Number.isNaN || function(e) {
  return e !== e;
}, _s = Es, Ts = function(e) {
  return _s(e) || e === 0 ? e : e < 0 ? -1 : 1;
}, Rs = Object.getOwnPropertyDescriptor, ia = Rs;
if (ia)
  try {
    ia([], "length");
  } catch {
    ia = null;
  }
var Qi = ia, ta = Object.defineProperty || !1;
if (ta)
  try {
    ta({}, "a", { value: 1 });
  } catch {
    ta = !1;
  }
var Ss = ta, _a, Un;
function Zi() {
  return Un || (Un = 1, _a = function() {
    if (typeof Symbol != "function" || typeof Object.getOwnPropertySymbols != "function")
      return !1;
    if (typeof Symbol.iterator == "symbol")
      return !0;
    var e = {}, n = Symbol("test"), i = Object(n);
    if (typeof n == "string" || Object.prototype.toString.call(n) !== "[object Symbol]" || Object.prototype.toString.call(i) !== "[object Symbol]")
      return !1;
    var t = 42;
    e[n] = t;
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
      if (r.value !== t || r.enumerable !== !0)
        return !1;
    }
    return !0;
  }), _a;
}
var Ta, Dn;
function ks() {
  if (Dn) return Ta;
  Dn = 1;
  var a = typeof Symbol < "u" && Symbol, e = Zi();
  return Ta = function() {
    return typeof a != "function" || typeof Symbol != "function" || typeof a("foo") != "symbol" || typeof Symbol("bar") != "symbol" ? !1 : e();
  }, Ta;
}
var Ra, In;
function et() {
  return In || (In = 1, Ra = typeof Reflect < "u" && Reflect.getPrototypeOf || null), Ra;
}
var Sa, Bn;
function at() {
  if (Bn) return Sa;
  Bn = 1;
  var a = Yi;
  return Sa = a.getPrototypeOf || null, Sa;
}
var js = "Function.prototype.bind called on incompatible ", Os = Object.prototype.toString, Cs = Math.max, As = "[object Function]", qn = function(e, n) {
  for (var i = [], t = 0; t < e.length; t += 1)
    i[t] = e[t];
  for (var o = 0; o < n.length; o += 1)
    i[o + e.length] = n[o];
  return i;
}, Ps = function(e, n) {
  for (var i = [], t = n, o = 0; t < e.length; t += 1, o += 1)
    i[o] = e[t];
  return i;
}, Fs = function(a, e) {
  for (var n = "", i = 0; i < a.length; i += 1)
    n += a[i], i + 1 < a.length && (n += e);
  return n;
}, Ls = function(e) {
  var n = this;
  if (typeof n != "function" || Os.apply(n) !== As)
    throw new TypeError(js + n);
  for (var i = Ps(arguments, 1), t, o = function() {
    if (this instanceof t) {
      var c = n.apply(
        this,
        qn(i, arguments)
      );
      return Object(c) === c ? c : this;
    }
    return n.apply(
      e,
      qn(i, arguments)
    );
  }, s = Cs(0, n.length - i.length), r = [], l = 0; l < s; l++)
    r[l] = "$" + l;
  if (t = Function("binder", "return function (" + Fs(r, ",") + "){ return binder.apply(this,arguments); }")(o), n.prototype) {
    var m = function() {
    };
    m.prototype = n.prototype, t.prototype = new m(), m.prototype = null;
  }
  return t;
}, Ns = Ls, ga = Function.prototype.bind || Ns, ka, zn;
function un() {
  return zn || (zn = 1, ka = Function.prototype.call), ka;
}
var ja, Mn;
function nt() {
  return Mn || (Mn = 1, ja = Function.prototype.apply), ja;
}
var Oa, $n;
function Us() {
  return $n || ($n = 1, Oa = typeof Reflect < "u" && Reflect && Reflect.apply), Oa;
}
var Ca, Hn;
function Ds() {
  if (Hn) return Ca;
  Hn = 1;
  var a = ga, e = nt(), n = un(), i = Us();
  return Ca = i || a.call(n, e), Ca;
}
var Aa, Wn;
function Is() {
  if (Wn) return Aa;
  Wn = 1;
  var a = ga, e = ln, n = un(), i = Ds();
  return Aa = function(o) {
    if (o.length < 1 || typeof o[0] != "function")
      throw new e("a function is required");
    return i(a, n, o);
  }, Aa;
}
var Pa, Vn;
function Bs() {
  if (Vn) return Pa;
  Vn = 1;
  var a = Is(), e = Qi, n;
  try {
    n = /** @type {{ __proto__?: typeof Array.prototype }} */
    [].__proto__ === Array.prototype;
  } catch (s) {
    if (!s || typeof s != "object" || !("code" in s) || s.code !== "ERR_PROTO_ACCESS")
      throw s;
  }
  var i = !!n && e && e(
    Object.prototype,
    /** @type {keyof typeof Object.prototype} */
    "__proto__"
  ), t = Object, o = t.getPrototypeOf;
  return Pa = i && typeof i.get == "function" ? a([i.get]) : typeof o == "function" ? (
    /** @type {import('./get')} */
    function(r) {
      return o(r == null ? r : t(r));
    }
  ) : !1, Pa;
}
var Fa, Gn;
function qs() {
  if (Gn) return Fa;
  Gn = 1;
  var a = et(), e = at(), n = Bs();
  return Fa = a ? function(t) {
    return a(t);
  } : e ? function(t) {
    if (!t || typeof t != "object" && typeof t != "function")
      throw new TypeError("getProto: not an object");
    return e(t);
  } : n ? function(t) {
    return n(t);
  } : null, Fa;
}
var zs = Function.prototype.call, Ms = Object.prototype.hasOwnProperty, $s = ga, dn = $s.call(zs, Ms), T, Hs = Yi, Ws = ls, Vs = us, Gs = ds, Xs = ms, je = fs, Se = ln, Js = xs, Ks = hs, Ys = vs, Qs = bs, Zs = gs, er = ys, ar = ws, nr = Ts, it = Function, La = function(a) {
  try {
    return it('"use strict"; return (' + a + ").constructor;")();
  } catch {
  }
}, Ne = Qi, ir = Ss, Na = function() {
  throw new Se();
}, tr = Ne ? function() {
  try {
    return arguments.callee, Na;
  } catch {
    try {
      return Ne(arguments, "callee").get;
    } catch {
      return Na;
    }
  }
}() : Na, Ee = ks()(), B = qs(), or = at(), sr = et(), tt = nt(), ze = un(), _e = {}, rr = typeof Uint8Array > "u" || !B ? T : B(Uint8Array), fe = {
  __proto__: null,
  "%AggregateError%": typeof AggregateError > "u" ? T : AggregateError,
  "%Array%": Array,
  "%ArrayBuffer%": typeof ArrayBuffer > "u" ? T : ArrayBuffer,
  "%ArrayIteratorPrototype%": Ee && B ? B([][Symbol.iterator]()) : T,
  "%AsyncFromSyncIteratorPrototype%": T,
  "%AsyncFunction%": _e,
  "%AsyncGenerator%": _e,
  "%AsyncGeneratorFunction%": _e,
  "%AsyncIteratorPrototype%": _e,
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
  "%Error%": Ws,
  "%eval%": eval,
  // eslint-disable-line no-eval
  "%EvalError%": Vs,
  "%Float16Array%": typeof Float16Array > "u" ? T : Float16Array,
  "%Float32Array%": typeof Float32Array > "u" ? T : Float32Array,
  "%Float64Array%": typeof Float64Array > "u" ? T : Float64Array,
  "%FinalizationRegistry%": typeof FinalizationRegistry > "u" ? T : FinalizationRegistry,
  "%Function%": it,
  "%GeneratorFunction%": _e,
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
  "%Object%": Hs,
  "%Object.getOwnPropertyDescriptor%": Ne,
  "%parseFloat%": parseFloat,
  "%parseInt%": parseInt,
  "%Promise%": typeof Promise > "u" ? T : Promise,
  "%Proxy%": typeof Proxy > "u" ? T : Proxy,
  "%RangeError%": Gs,
  "%ReferenceError%": Xs,
  "%Reflect%": typeof Reflect > "u" ? T : Reflect,
  "%RegExp%": RegExp,
  "%Set%": typeof Set > "u" ? T : Set,
  "%SetIteratorPrototype%": typeof Set > "u" || !Ee || !B ? T : B((/* @__PURE__ */ new Set())[Symbol.iterator]()),
  "%SharedArrayBuffer%": typeof SharedArrayBuffer > "u" ? T : SharedArrayBuffer,
  "%String%": String,
  "%StringIteratorPrototype%": Ee && B ? B(""[Symbol.iterator]()) : T,
  "%Symbol%": Ee ? Symbol : T,
  "%SyntaxError%": je,
  "%ThrowTypeError%": tr,
  "%TypedArray%": rr,
  "%TypeError%": Se,
  "%Uint8Array%": typeof Uint8Array > "u" ? T : Uint8Array,
  "%Uint8ClampedArray%": typeof Uint8ClampedArray > "u" ? T : Uint8ClampedArray,
  "%Uint16Array%": typeof Uint16Array > "u" ? T : Uint16Array,
  "%Uint32Array%": typeof Uint32Array > "u" ? T : Uint32Array,
  "%URIError%": Js,
  "%WeakMap%": typeof WeakMap > "u" ? T : WeakMap,
  "%WeakRef%": typeof WeakRef > "u" ? T : WeakRef,
  "%WeakSet%": typeof WeakSet > "u" ? T : WeakSet,
  "%Function.prototype.call%": ze,
  "%Function.prototype.apply%": tt,
  "%Object.defineProperty%": ir,
  "%Object.getPrototypeOf%": or,
  "%Math.abs%": Ks,
  "%Math.floor%": Ys,
  "%Math.max%": Qs,
  "%Math.min%": Zs,
  "%Math.pow%": er,
  "%Math.round%": ar,
  "%Math.sign%": nr,
  "%Reflect.getPrototypeOf%": sr
};
if (B)
  try {
    null.error;
  } catch (a) {
    var cr = B(B(a));
    fe["%Error.prototype%"] = cr;
  }
var pr = function a(e) {
  var n;
  if (e === "%AsyncFunction%")
    n = La("async function () {}");
  else if (e === "%GeneratorFunction%")
    n = La("function* () {}");
  else if (e === "%AsyncGeneratorFunction%")
    n = La("async function* () {}");
  else if (e === "%AsyncGenerator%") {
    var i = a("%AsyncGeneratorFunction%");
    i && (n = i.prototype);
  } else if (e === "%AsyncIteratorPrototype%") {
    var t = a("%AsyncGenerator%");
    t && B && (n = B(t.prototype));
  }
  return fe[e] = n, n;
}, Xn = {
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
}, Me = ga, ca = dn, lr = Me.call(ze, Array.prototype.concat), ur = Me.call(tt, Array.prototype.splice), Jn = Me.call(ze, String.prototype.replace), pa = Me.call(ze, String.prototype.slice), dr = Me.call(ze, RegExp.prototype.exec), mr = /[^%.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|%$))/g, fr = /\\(\\)?/g, xr = function(e) {
  var n = pa(e, 0, 1), i = pa(e, -1);
  if (n === "%" && i !== "%")
    throw new je("invalid intrinsic syntax, expected closing `%`");
  if (i === "%" && n !== "%")
    throw new je("invalid intrinsic syntax, expected opening `%`");
  var t = [];
  return Jn(e, mr, function(o, s, r, l) {
    t[t.length] = r ? Jn(l, fr, "$1") : s || o;
  }), t;
}, hr = function(e, n) {
  var i = e, t;
  if (ca(Xn, i) && (t = Xn[i], i = "%" + t[0] + "%"), ca(fe, i)) {
    var o = fe[i];
    if (o === _e && (o = pr(i)), typeof o > "u" && !n)
      throw new Se("intrinsic " + e + " exists, but is not available. Please file an issue!");
    return {
      alias: t,
      name: i,
      value: o
    };
  }
  throw new je("intrinsic " + e + " does not exist!");
}, vr = function(e, n) {
  if (typeof e != "string" || e.length === 0)
    throw new Se("intrinsic name must be a non-empty string");
  if (arguments.length > 1 && typeof n != "boolean")
    throw new Se('"allowMissing" argument must be a boolean');
  if (dr(/^%?[^%]*%?$/, e) === null)
    throw new je("`%` may not be present anywhere but at the beginning and end of the intrinsic name");
  var i = xr(e), t = i.length > 0 ? i[0] : "", o = hr("%" + t + "%", n), s = o.name, r = o.value, l = !1, m = o.alias;
  m && (t = m[0], ur(i, lr([0, 1], m)));
  for (var c = 1, p = !0; c < i.length; c += 1) {
    var u = i[c], h = pa(u, 0, 1), f = pa(u, -1);
    if ((h === '"' || h === "'" || h === "`" || f === '"' || f === "'" || f === "`") && h !== f)
      throw new je("property names with quotes must have matching quotes");
    if ((u === "constructor" || !p) && (l = !0), t += "." + u, s = "%" + t + "%", ca(fe, s))
      r = fe[s];
    else if (r != null) {
      if (!(u in r)) {
        if (!n)
          throw new Se("base intrinsic for " + e + " exists, but the property is not available.");
        return;
      }
      if (Ne && c + 1 >= i.length) {
        var v = Ne(r, u);
        p = !!v, p && "get" in v && !("originalValue" in v.get) ? r = v.get : r = r[u];
      } else
        p = ca(r, u), r = r[u];
      p && !l && (fe[s] = r);
    }
  }
  return r;
}, Ua, Kn;
function br() {
  if (Kn) return Ua;
  Kn = 1;
  var a = Zi();
  return Ua = function() {
    return a() && !!Symbol.toStringTag;
  }, Ua;
}
var gr = vr, Yn = gr("%Object.defineProperty%", !0), yr = br()(), wr = dn, Er = ln, Je = yr ? Symbol.toStringTag : null, _r = function(e, n) {
  var i = arguments.length > 2 && !!arguments[2] && arguments[2].force, t = arguments.length > 2 && !!arguments[2] && arguments[2].nonConfigurable;
  if (typeof i < "u" && typeof i != "boolean" || typeof t < "u" && typeof t != "boolean")
    throw new Er("if provided, the `overrideIfSet` and `nonConfigurable` options must be booleans");
  Je && (i || !wr(e, Je)) && (Yn ? Yn(e, Je, {
    configurable: !t,
    enumerable: !1,
    value: n,
    writable: !1
  }) : e[Je] = n);
}, Tr = function(a, e) {
  return Object.keys(e).forEach(function(n) {
    a[n] = a[n] || e[n];
  }), a;
}, mn = Uo, Rr = ye, Da = ma, Sr = sn, kr = rn, jr = fa.parse, Or = Dt, Cr = V.Stream, Ar = cn, Ia = $i, Pr = ps, Fr = _r, le = dn, Ya = Tr;
function R(a) {
  if (!(this instanceof R))
    return new R(a);
  this._overheadLength = 0, this._valueLength = 0, this._valuesToMeasure = [], mn.call(this), a = a || {};
  for (var e in a)
    this[e] = a[e];
}
Rr.inherits(R, mn);
R.LINE_BREAK = `\r
`;
R.DEFAULT_CONTENT_TYPE = "application/octet-stream";
R.prototype.append = function(a, e, n) {
  n = n || {}, typeof n == "string" && (n = { filename: n });
  var i = mn.prototype.append.bind(this);
  if ((typeof e == "number" || e == null) && (e = String(e)), Array.isArray(e)) {
    this._error(new Error("Arrays are not supported."));
    return;
  }
  var t = this._multiPartHeader(a, e, n), o = this._multiPartFooter();
  i(t), i(e), i(o), this._trackLength(t, e, n);
};
R.prototype._trackLength = function(a, e, n) {
  var i = 0;
  n.knownLength != null ? i += Number(n.knownLength) : Buffer.isBuffer(e) ? i = e.length : typeof e == "string" && (i = Buffer.byteLength(e)), this._valueLength += i, this._overheadLength += Buffer.byteLength(a) + R.LINE_BREAK.length, !(!e || !e.path && !(e.readable && le(e, "httpVersion")) && !(e instanceof Cr)) && (n.knownLength || this._valuesToMeasure.push(e));
};
R.prototype._lengthRetriever = function(a, e) {
  le(a, "fd") ? a.end != null && a.end != 1 / 0 && a.start != null ? e(null, a.end + 1 - (a.start ? a.start : 0)) : Or.stat(a.path, function(n, i) {
    if (n) {
      e(n);
      return;
    }
    var t = i.size - (a.start ? a.start : 0);
    e(null, t);
  }) : le(a, "httpVersion") ? e(null, Number(a.headers["content-length"])) : le(a, "httpModule") ? (a.on("response", function(n) {
    a.pause(), e(null, Number(n.headers["content-length"]));
  }), a.resume()) : e("Unknown stream");
};
R.prototype._multiPartHeader = function(a, e, n) {
  if (typeof n.header == "string")
    return n.header;
  var i = this._getContentDisposition(e, n), t = this._getContentType(e, n), o = "", s = {
    // add custom disposition as third element or keep it two elements if not
    "Content-Disposition": ["form-data", 'name="' + a + '"'].concat(i || []),
    // if no content type. allow it to be empty array
    "Content-Type": [].concat(t || [])
  };
  typeof n.header == "object" && Ya(s, n.header);
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
  if (typeof e.filepath == "string" ? n = Da.normalize(e.filepath).replace(/\\/g, "/") : e.filename || a && (a.name || a.path) ? n = Da.basename(e.filename || a && (a.name || a.path)) : a && a.readable && le(a, "httpVersion") && (n = Da.basename(a.client._httpMessage.path || "")), n)
    return 'filename="' + n + '"';
};
R.prototype._getContentType = function(a, e) {
  var n = e.contentType;
  return !n && a && a.name && (n = Ia.lookup(a.name)), !n && a && a.path && (n = Ia.lookup(a.path)), !n && a && a.readable && le(a, "httpVersion") && (n = a.headers["content-type"]), !n && (e.filepath || e.filename) && (n = Ia.lookup(e.filepath || e.filename)), !n && a && typeof a == "object" && (n = R.DEFAULT_CONTENT_TYPE), n;
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
  for (var a = new Buffer.alloc(0), e = this.getBoundary(), n = 0, i = this._streams.length; n < i; n++)
    typeof this._streams[n] != "function" && (Buffer.isBuffer(this._streams[n]) ? a = Buffer.concat([a, this._streams[n]]) : a = Buffer.concat([a, Buffer.from(this._streams[n])]), (typeof this._streams[n] != "string" || this._streams[n].substring(2, e.length + 2) !== e) && (a = Buffer.concat([a, Buffer.from(R.LINE_BREAK)])));
  return Buffer.concat([a, Buffer.from(this._lastBoundary())]);
};
R.prototype._generateBoundary = function() {
  this._boundary = "--------------------------" + Ar.randomBytes(12).toString("hex");
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
  Pr.parallel(this._valuesToMeasure, this._lengthRetriever, function(n, i) {
    if (n) {
      a(n);
      return;
    }
    i.forEach(function(t) {
      e += t;
    }), a(null, e);
  });
};
R.prototype.submit = function(a, e) {
  var n, i, t = { method: "post" };
  return typeof a == "string" ? (a = jr(a), i = Ya({
    port: a.port,
    path: a.pathname,
    host: a.hostname,
    protocol: a.protocol
  }, t)) : (i = Ya(a, t), i.port || (i.port = i.protocol === "https:" ? 443 : 80)), i.headers = this.getHeaders(a.headers), i.protocol === "https:" ? n = kr.request(i) : n = Sr.request(i), this.getLength((function(o, s) {
    if (o && o !== "Unknown stream") {
      this._error(o);
      return;
    }
    if (s && n.setHeader("Content-Length", s), this.pipe(n), e) {
      var r, l = function(m, c) {
        return n.removeListener("error", l), n.removeListener("response", r), e.call(this, m, c);
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
Fr(R.prototype, "FormData");
var Lr = R;
const ot = /* @__PURE__ */ qi(Lr);
function Qa(a) {
  return d.isPlainObject(a) || d.isArray(a);
}
function st(a) {
  return d.endsWith(a, "[]") ? a.slice(0, -2) : a;
}
function Qn(a, e, n) {
  return a ? a.concat(e).map(function(t, o) {
    return t = st(t), !n && o ? "[" + t + "]" : t;
  }).join(n ? "." : "") : e;
}
function Nr(a) {
  return d.isArray(a) && !a.some(Qa);
}
const Ur = d.toFlatObject(d, {}, null, function(e) {
  return /^is[A-Z]/.test(e);
});
function ya(a, e, n) {
  if (!d.isObject(a))
    throw new TypeError("target must be an object");
  e = e || new (ot || FormData)(), n = d.toFlatObject(n, {
    metaTokens: !0,
    dots: !1,
    indexes: !1
  }, !1, function(v, x) {
    return !d.isUndefined(x[v]);
  });
  const i = n.metaTokens, t = n.visitor || c, o = n.dots, s = n.indexes, l = (n.Blob || typeof Blob < "u" && Blob) && d.isSpecCompliantForm(e);
  if (!d.isFunction(t))
    throw new TypeError("visitor must be a function");
  function m(f) {
    if (f === null) return "";
    if (d.isDate(f))
      return f.toISOString();
    if (d.isBoolean(f))
      return f.toString();
    if (!l && d.isBlob(f))
      throw new b("Blob is not supported. Use a Buffer instead.");
    return d.isArrayBuffer(f) || d.isTypedArray(f) ? l && typeof Blob == "function" ? new Blob([f]) : Buffer.from(f) : f;
  }
  function c(f, v, x) {
    let y = f;
    if (f && !x && typeof f == "object") {
      if (d.endsWith(v, "{}"))
        v = i ? v : v.slice(0, -2), f = JSON.stringify(f);
      else if (d.isArray(f) && Nr(f) || (d.isFileList(f) || d.endsWith(v, "[]")) && (y = d.toArray(f)))
        return v = st(v), y.forEach(function(_, k) {
          !(d.isUndefined(_) || _ === null) && e.append(
            // eslint-disable-next-line no-nested-ternary
            s === !0 ? Qn([v], k, o) : s === null ? v : v + "[]",
            m(_)
          );
        }), !1;
    }
    return Qa(f) ? !0 : (e.append(Qn(x, v, o), m(f)), !1);
  }
  const p = [], u = Object.assign(Ur, {
    defaultVisitor: c,
    convertValue: m,
    isVisitable: Qa
  });
  function h(f, v) {
    if (!d.isUndefined(f)) {
      if (p.indexOf(f) !== -1)
        throw Error("Circular reference detected in " + v.join("."));
      p.push(f), d.forEach(f, function(y, E) {
        (!(d.isUndefined(y) || y === null) && t.call(
          e,
          y,
          d.isString(E) ? E.trim() : E,
          v,
          u
        )) === !0 && h(y, v ? v.concat(E) : [E]);
      }), p.pop();
    }
  }
  if (!d.isObject(a))
    throw new TypeError("data must be an object");
  return h(a), e;
}
function Zn(a) {
  const e = {
    "!": "%21",
    "'": "%27",
    "(": "%28",
    ")": "%29",
    "~": "%7E",
    "%20": "+",
    "%00": "\0"
  };
  return encodeURIComponent(a).replace(/[!'()~]|%20|%00/g, function(i) {
    return e[i];
  });
}
function rt(a, e) {
  this._pairs = [], a && ya(a, this, e);
}
const ct = rt.prototype;
ct.append = function(e, n) {
  this._pairs.push([e, n]);
};
ct.toString = function(e) {
  const n = e ? function(i) {
    return e.call(this, i, Zn);
  } : Zn;
  return this._pairs.map(function(t) {
    return n(t[0]) + "=" + n(t[1]);
  }, "").join("&");
};
function Dr(a) {
  return encodeURIComponent(a).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+");
}
function fn(a, e, n) {
  if (!e)
    return a;
  const i = n && n.encode || Dr, t = d.isFunction(n) ? {
    serialize: n
  } : n, o = t && t.serialize;
  let s;
  if (o ? s = o(e, t) : s = d.isURLSearchParams(e) ? e.toString() : new rt(e, t).toString(i), s) {
    const r = a.indexOf("#");
    r !== -1 && (a = a.slice(0, r)), a += (a.indexOf("?") === -1 ? "?" : "&") + s;
  }
  return a;
}
class ei {
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
  use(e, n, i) {
    return this.handlers.push({
      fulfilled: e,
      rejected: n,
      synchronous: i ? i.synchronous : !1,
      runWhen: i ? i.runWhen : null
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
    d.forEach(this.handlers, function(i) {
      i !== null && e(i);
    });
  }
}
const xn = {
  silentJSONParsing: !0,
  forcedJSONParsing: !0,
  clarifyTimeoutError: !1
}, Ir = fa.URLSearchParams, Ba = "abcdefghijklmnopqrstuvwxyz", ai = "0123456789", pt = {
  DIGIT: ai,
  ALPHA: Ba,
  ALPHA_DIGIT: Ba + Ba.toUpperCase() + ai
}, Br = (a = 16, e = pt.ALPHA_DIGIT) => {
  let n = "";
  const { length: i } = e, t = new Uint32Array(a);
  cn.randomFillSync(t);
  for (let o = 0; o < a; o++)
    n += e[t[o] % i];
  return n;
}, qr = {
  isNode: !0,
  classes: {
    URLSearchParams: Ir,
    FormData: ot,
    Blob: typeof Blob < "u" && Blob || null
  },
  ALPHABET: pt,
  generateString: Br,
  protocols: ["http", "https", "file", "data"]
}, hn = typeof window < "u" && typeof document < "u", Za = typeof navigator == "object" && navigator || void 0, zr = hn && (!Za || ["ReactNative", "NativeScript", "NS"].indexOf(Za.product) < 0), Mr = typeof WorkerGlobalScope < "u" && // eslint-disable-next-line no-undef
self instanceof WorkerGlobalScope && typeof self.importScripts == "function", $r = hn && window.location.href || "http://localhost", Hr = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  hasBrowserEnv: hn,
  hasStandardBrowserEnv: zr,
  hasStandardBrowserWebWorkerEnv: Mr,
  navigator: Za,
  origin: $r
}, Symbol.toStringTag, { value: "Module" })), P = {
  ...Hr,
  ...qr
};
function Wr(a, e) {
  return ya(a, new P.classes.URLSearchParams(), {
    visitor: function(n, i, t, o) {
      return P.isNode && d.isBuffer(n) ? (this.append(i, n.toString("base64")), !1) : o.defaultVisitor.apply(this, arguments);
    },
    ...e
  });
}
function Vr(a) {
  return d.matchAll(/\w+|\[(\w*)]/g, a).map((e) => e[0] === "[]" ? "" : e[1] || e[0]);
}
function Gr(a) {
  const e = {}, n = Object.keys(a);
  let i;
  const t = n.length;
  let o;
  for (i = 0; i < t; i++)
    o = n[i], e[o] = a[o];
  return e;
}
function lt(a) {
  function e(n, i, t, o) {
    let s = n[o++];
    if (s === "__proto__") return !0;
    const r = Number.isFinite(+s), l = o >= n.length;
    return s = !s && d.isArray(t) ? t.length : s, l ? (d.hasOwnProp(t, s) ? t[s] = [t[s], i] : t[s] = i, !r) : ((!t[s] || !d.isObject(t[s])) && (t[s] = []), e(n, i, t[s], o) && d.isArray(t[s]) && (t[s] = Gr(t[s])), !r);
  }
  if (d.isFormData(a) && d.isFunction(a.entries)) {
    const n = {};
    return d.forEachEntry(a, (i, t) => {
      e(Vr(i), t, n, 0);
    }), n;
  }
  return null;
}
function Xr(a, e, n) {
  if (d.isString(a))
    try {
      return (e || JSON.parse)(a), d.trim(a);
    } catch (i) {
      if (i.name !== "SyntaxError")
        throw i;
    }
  return (n || JSON.stringify)(a);
}
const $e = {
  transitional: xn,
  adapter: ["xhr", "http", "fetch"],
  transformRequest: [function(e, n) {
    const i = n.getContentType() || "", t = i.indexOf("application/json") > -1, o = d.isObject(e);
    if (o && d.isHTMLForm(e) && (e = new FormData(e)), d.isFormData(e))
      return t ? JSON.stringify(lt(e)) : e;
    if (d.isArrayBuffer(e) || d.isBuffer(e) || d.isStream(e) || d.isFile(e) || d.isBlob(e) || d.isReadableStream(e))
      return e;
    if (d.isArrayBufferView(e))
      return e.buffer;
    if (d.isURLSearchParams(e))
      return n.setContentType("application/x-www-form-urlencoded;charset=utf-8", !1), e.toString();
    let r;
    if (o) {
      if (i.indexOf("application/x-www-form-urlencoded") > -1)
        return Wr(e, this.formSerializer).toString();
      if ((r = d.isFileList(e)) || i.indexOf("multipart/form-data") > -1) {
        const l = this.env && this.env.FormData;
        return ya(
          r ? { "files[]": e } : e,
          l && new l(),
          this.formSerializer
        );
      }
    }
    return o || t ? (n.setContentType("application/json", !1), Xr(e)) : e;
  }],
  transformResponse: [function(e) {
    const n = this.transitional || $e.transitional, i = n && n.forcedJSONParsing, t = this.responseType === "json";
    if (d.isResponse(e) || d.isReadableStream(e))
      return e;
    if (e && d.isString(e) && (i && !this.responseType || t)) {
      const s = !(n && n.silentJSONParsing) && t;
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
    FormData: P.classes.FormData,
    Blob: P.classes.Blob
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
d.forEach(["delete", "get", "head", "post", "put", "patch"], (a) => {
  $e.headers[a] = {};
});
const Jr = d.toObjectSet([
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
]), Kr = (a) => {
  const e = {};
  let n, i, t;
  return a && a.split(`
`).forEach(function(s) {
    t = s.indexOf(":"), n = s.substring(0, t).trim().toLowerCase(), i = s.substring(t + 1).trim(), !(!n || e[n] && Jr[n]) && (n === "set-cookie" ? e[n] ? e[n].push(i) : e[n] = [i] : e[n] = e[n] ? e[n] + ", " + i : i);
  }), e;
}, ni = Symbol("internals");
function Ae(a) {
  return a && String(a).trim().toLowerCase();
}
function oa(a) {
  return a === !1 || a == null ? a : d.isArray(a) ? a.map(oa) : String(a);
}
function Yr(a) {
  const e = /* @__PURE__ */ Object.create(null), n = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
  let i;
  for (; i = n.exec(a); )
    e[i[1]] = i[2];
  return e;
}
const Qr = (a) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(a.trim());
function qa(a, e, n, i, t) {
  if (d.isFunction(i))
    return i.call(this, e, n);
  if (t && (e = n), !!d.isString(e)) {
    if (d.isString(i))
      return e.indexOf(i) !== -1;
    if (d.isRegExp(i))
      return i.test(e);
  }
}
function Zr(a) {
  return a.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (e, n, i) => n.toUpperCase() + i);
}
function ec(a, e) {
  const n = d.toCamelCase(" " + e);
  ["get", "set", "has"].forEach((i) => {
    Object.defineProperty(a, i + n, {
      value: function(t, o, s) {
        return this[i].call(this, e, t, o, s);
      },
      configurable: !0
    });
  });
}
let M = class {
  constructor(e) {
    e && this.set(e);
  }
  set(e, n, i) {
    const t = this;
    function o(r, l, m) {
      const c = Ae(l);
      if (!c)
        throw new Error("header name must be a non-empty string");
      const p = d.findKey(t, c);
      (!p || t[p] === void 0 || m === !0 || m === void 0 && t[p] !== !1) && (t[p || l] = oa(r));
    }
    const s = (r, l) => d.forEach(r, (m, c) => o(m, c, l));
    if (d.isPlainObject(e) || e instanceof this.constructor)
      s(e, n);
    else if (d.isString(e) && (e = e.trim()) && !Qr(e))
      s(Kr(e), n);
    else if (d.isObject(e) && d.isIterable(e)) {
      let r = {}, l, m;
      for (const c of e) {
        if (!d.isArray(c))
          throw TypeError("Object iterator must return a key-value pair");
        r[m = c[0]] = (l = r[m]) ? d.isArray(l) ? [...l, c[1]] : [l, c[1]] : c[1];
      }
      s(r, n);
    } else
      e != null && o(n, e, i);
    return this;
  }
  get(e, n) {
    if (e = Ae(e), e) {
      const i = d.findKey(this, e);
      if (i) {
        const t = this[i];
        if (!n)
          return t;
        if (n === !0)
          return Yr(t);
        if (d.isFunction(n))
          return n.call(this, t, i);
        if (d.isRegExp(n))
          return n.exec(t);
        throw new TypeError("parser must be boolean|regexp|function");
      }
    }
  }
  has(e, n) {
    if (e = Ae(e), e) {
      const i = d.findKey(this, e);
      return !!(i && this[i] !== void 0 && (!n || qa(this, this[i], i, n)));
    }
    return !1;
  }
  delete(e, n) {
    const i = this;
    let t = !1;
    function o(s) {
      if (s = Ae(s), s) {
        const r = d.findKey(i, s);
        r && (!n || qa(i, i[r], r, n)) && (delete i[r], t = !0);
      }
    }
    return d.isArray(e) ? e.forEach(o) : o(e), t;
  }
  clear(e) {
    const n = Object.keys(this);
    let i = n.length, t = !1;
    for (; i--; ) {
      const o = n[i];
      (!e || qa(this, this[o], o, e, !0)) && (delete this[o], t = !0);
    }
    return t;
  }
  normalize(e) {
    const n = this, i = {};
    return d.forEach(this, (t, o) => {
      const s = d.findKey(i, o);
      if (s) {
        n[s] = oa(t), delete n[o];
        return;
      }
      const r = e ? Zr(o) : String(o).trim();
      r !== o && delete n[o], n[r] = oa(t), i[r] = !0;
    }), this;
  }
  concat(...e) {
    return this.constructor.concat(this, ...e);
  }
  toJSON(e) {
    const n = /* @__PURE__ */ Object.create(null);
    return d.forEach(this, (i, t) => {
      i != null && i !== !1 && (n[t] = e && d.isArray(i) ? i.join(", ") : i);
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
    const i = new this(e);
    return n.forEach((t) => i.set(t)), i;
  }
  static accessor(e) {
    const i = (this[ni] = this[ni] = {
      accessors: {}
    }).accessors, t = this.prototype;
    function o(s) {
      const r = Ae(s);
      i[r] || (ec(t, s), i[r] = !0);
    }
    return d.isArray(e) ? e.forEach(o) : o(e), this;
  }
};
M.accessor(["Content-Type", "Content-Length", "Accept", "Accept-Encoding", "User-Agent", "Authorization"]);
d.reduceDescriptors(M.prototype, ({ value: a }, e) => {
  let n = e[0].toUpperCase() + e.slice(1);
  return {
    get: () => a,
    set(i) {
      this[n] = i;
    }
  };
});
d.freezeMethods(M);
function za(a, e) {
  const n = this || $e, i = e || n, t = M.from(i.headers);
  let o = i.data;
  return d.forEach(a, function(r) {
    o = r.call(n, o, t.normalize(), e ? e.status : void 0);
  }), t.normalize(), o;
}
function ut(a) {
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
  constructor(e, n, i) {
    super(e ?? "canceled", b.ERR_CANCELED, n, i), this.name = "CanceledError", this.__CANCEL__ = !0;
  }
};
function Te(a, e, n) {
  const i = n.config.validateStatus;
  !n.status || !i || i(n.status) ? a(n) : e(new b(
    "Request failed with status code " + n.status,
    [b.ERR_BAD_REQUEST, b.ERR_BAD_RESPONSE][Math.floor(n.status / 100) - 4],
    n.config,
    n.request,
    n
  ));
}
function ac(a) {
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(a);
}
function nc(a, e) {
  return e ? a.replace(/\/?\/$/, "") + "/" + e.replace(/^\/+/, "") : a;
}
function vn(a, e, n) {
  let i = !ac(e);
  return a && (i || n == !1) ? nc(a, e) : e;
}
var dt = {}, ic = fa.parse, tc = {
  ftp: 21,
  gopher: 70,
  http: 80,
  https: 443,
  ws: 80,
  wss: 443
}, oc = String.prototype.endsWith || function(a) {
  return a.length <= this.length && this.indexOf(a, this.length - a.length) !== -1;
};
function sc(a) {
  var e = typeof a == "string" ? ic(a) : a || {}, n = e.protocol, i = e.host, t = e.port;
  if (typeof i != "string" || !i || typeof n != "string" || (n = n.split(":", 1)[0], i = i.replace(/:\d*$/, ""), t = parseInt(t) || tc[n] || 0, !rc(i, t)))
    return "";
  var o = Re("npm_config_" + n + "_proxy") || Re(n + "_proxy") || Re("npm_config_proxy") || Re("all_proxy");
  return o && o.indexOf("://") === -1 && (o = n + "://" + o), o;
}
function rc(a, e) {
  var n = (Re("npm_config_no_proxy") || Re("no_proxy")).toLowerCase();
  return n ? n === "*" ? !1 : n.split(/[,\s]/).every(function(i) {
    if (!i)
      return !0;
    var t = i.match(/^(.+):(\d+)$/), o = t ? t[1] : i, s = t ? parseInt(t[2]) : 0;
    return s && s !== e ? !0 : /^[.*]/.test(o) ? (o.charAt(0) === "*" && (o = o.slice(1)), !oc.call(a, o)) : a !== o;
  }) : !0;
}
function Re(a) {
  return process.env[a.toLowerCase()] || process.env[a.toUpperCase()] || "";
}
dt.getProxyForUrl = sc;
var bn = { exports: {} }, Ke = { exports: {} }, Ye = { exports: {} }, Ma, ii;
function cc() {
  if (ii) return Ma;
  ii = 1;
  var a = 1e3, e = a * 60, n = e * 60, i = n * 24, t = i * 7, o = i * 365.25;
  Ma = function(c, p) {
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
            return u * t;
          case "days":
          case "day":
          case "d":
            return u * i;
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
    return p >= i ? Math.round(c / i) + "d" : p >= n ? Math.round(c / n) + "h" : p >= e ? Math.round(c / e) + "m" : p >= a ? Math.round(c / a) + "s" : c + "ms";
  }
  function l(c) {
    var p = Math.abs(c);
    return p >= i ? m(c, p, i, "day") : p >= n ? m(c, p, n, "hour") : p >= e ? m(c, p, e, "minute") : p >= a ? m(c, p, a, "second") : c + " ms";
  }
  function m(c, p, u, h) {
    var f = p >= u * 1.5;
    return Math.round(c / u) + " " + h + (f ? "s" : "");
  }
  return Ma;
}
var $a, ti;
function mt() {
  if (ti) return $a;
  ti = 1;
  function a(e) {
    i.debug = i, i.default = i, i.coerce = m, i.disable = r, i.enable = o, i.enabled = l, i.humanize = cc(), i.destroy = c, Object.keys(e).forEach((p) => {
      i[p] = e[p];
    }), i.names = [], i.skips = [], i.formatters = {};
    function n(p) {
      let u = 0;
      for (let h = 0; h < p.length; h++)
        u = (u << 5) - u + p.charCodeAt(h), u |= 0;
      return i.colors[Math.abs(u) % i.colors.length];
    }
    i.selectColor = n;
    function i(p) {
      let u, h = null, f, v;
      function x(...y) {
        if (!x.enabled)
          return;
        const E = x, _ = Number(/* @__PURE__ */ new Date()), k = _ - (u || _);
        E.diff = k, E.prev = u, E.curr = _, u = _, y[0] = i.coerce(y[0]), typeof y[0] != "string" && y.unshift("%O");
        let U = 0;
        y[0] = y[0].replace(/%([a-zA-Z%])/g, (A, D) => {
          if (A === "%%")
            return "%";
          U++;
          const Y = i.formatters[D];
          if (typeof Y == "function") {
            const se = y[U];
            A = Y.call(E, se), y.splice(U, 1), U--;
          }
          return A;
        }), i.formatArgs.call(E, y), (E.log || i.log).apply(E, y);
      }
      return x.namespace = p, x.useColors = i.useColors(), x.color = i.selectColor(p), x.extend = t, x.destroy = i.destroy, Object.defineProperty(x, "enabled", {
        enumerable: !0,
        configurable: !1,
        get: () => h !== null ? h : (f !== i.namespaces && (f = i.namespaces, v = i.enabled(p)), v),
        set: (y) => {
          h = y;
        }
      }), typeof i.init == "function" && i.init(x), x;
    }
    function t(p, u) {
      const h = i(this.namespace + (typeof u > "u" ? ":" : u) + p);
      return h.log = this.log, h;
    }
    function o(p) {
      i.save(p), i.namespaces = p, i.names = [], i.skips = [];
      const u = (typeof p == "string" ? p : "").trim().replace(/\s+/g, ",").split(",").filter(Boolean);
      for (const h of u)
        h[0] === "-" ? i.skips.push(h.slice(1)) : i.names.push(h);
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
        ...i.names,
        ...i.skips.map((u) => "-" + u)
      ].join(",");
      return i.enable(""), p;
    }
    function l(p) {
      for (const u of i.skips)
        if (s(p, u))
          return !1;
      for (const u of i.names)
        if (s(p, u))
          return !0;
      return !1;
    }
    function m(p) {
      return p instanceof Error ? p.stack || p.message : p;
    }
    function c() {
      console.warn("Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.");
    }
    return i.enable(i.load()), i;
  }
  return $a = a, $a;
}
var oi;
function pc() {
  return oi || (oi = 1, function(a, e) {
    e.formatArgs = i, e.save = t, e.load = o, e.useColors = n, e.storage = s(), e.destroy = /* @__PURE__ */ (() => {
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
    function i(l) {
      if (l[0] = (this.useColors ? "%c" : "") + this.namespace + (this.useColors ? " %c" : " ") + l[0] + (this.useColors ? "%c " : " ") + "+" + a.exports.humanize(this.diff), !this.useColors)
        return;
      const m = "color: " + this.color;
      l.splice(1, 0, m, "color: inherit");
      let c = 0, p = 0;
      l[0].replace(/%[a-zA-Z%]/g, (u) => {
        u !== "%%" && (c++, u === "%c" && (p = c));
      }), l.splice(p, 0, m);
    }
    e.log = console.debug || console.log || (() => {
    });
    function t(l) {
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
    a.exports = mt()(e);
    const { formatters: r } = a.exports;
    r.j = function(l) {
      try {
        return JSON.stringify(l);
      } catch (m) {
        return "[UnexpectedJSONParseError]: " + m.message;
      }
    };
  }(Ye, Ye.exports)), Ye.exports;
}
var Qe = { exports: {} }, Ha, si;
function lc() {
  return si || (si = 1, Ha = (a, e = process.argv) => {
    const n = a.startsWith("-") ? "" : a.length === 1 ? "-" : "--", i = e.indexOf(n + a), t = e.indexOf("--");
    return i !== -1 && (t === -1 || i < t);
  }), Ha;
}
var Wa, ri;
function uc() {
  if (ri) return Wa;
  ri = 1;
  const a = Bt, e = Ci, n = lc(), { env: i } = process;
  let t;
  n("no-color") || n("no-colors") || n("color=false") || n("color=never") ? t = 0 : (n("color") || n("colors") || n("color=true") || n("color=always")) && (t = 1), "FORCE_COLOR" in i && (i.FORCE_COLOR === "true" ? t = 1 : i.FORCE_COLOR === "false" ? t = 0 : t = i.FORCE_COLOR.length === 0 ? 1 : Math.min(parseInt(i.FORCE_COLOR, 10), 3));
  function o(l) {
    return l === 0 ? !1 : {
      level: l,
      hasBasic: !0,
      has256: l >= 2,
      has16m: l >= 3
    };
  }
  function s(l, m) {
    if (t === 0)
      return 0;
    if (n("color=16m") || n("color=full") || n("color=truecolor"))
      return 3;
    if (n("color=256"))
      return 2;
    if (l && !m && t === void 0)
      return 0;
    const c = t || 0;
    if (i.TERM === "dumb")
      return c;
    if (process.platform === "win32") {
      const p = a.release().split(".");
      return Number(p[0]) >= 10 && Number(p[2]) >= 10586 ? Number(p[2]) >= 14931 ? 3 : 2 : 1;
    }
    if ("CI" in i)
      return ["TRAVIS", "CIRCLECI", "APPVEYOR", "GITLAB_CI", "GITHUB_ACTIONS", "BUILDKITE"].some((p) => p in i) || i.CI_NAME === "codeship" ? 1 : c;
    if ("TEAMCITY_VERSION" in i)
      return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(i.TEAMCITY_VERSION) ? 1 : 0;
    if (i.COLORTERM === "truecolor")
      return 3;
    if ("TERM_PROGRAM" in i) {
      const p = parseInt((i.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
      switch (i.TERM_PROGRAM) {
        case "iTerm.app":
          return p >= 3 ? 3 : 2;
        case "Apple_Terminal":
          return 2;
      }
    }
    return /-256(color)?$/i.test(i.TERM) ? 2 : /^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(i.TERM) || "COLORTERM" in i ? 1 : c;
  }
  function r(l) {
    const m = s(l, l && l.isTTY);
    return o(m);
  }
  return Wa = {
    supportsColor: r,
    stdout: o(s(!0, e.isatty(1))),
    stderr: o(s(!0, e.isatty(2)))
  }, Wa;
}
var ci;
function dc() {
  return ci || (ci = 1, function(a, e) {
    const n = Ci, i = ye;
    e.init = c, e.log = r, e.formatArgs = o, e.save = l, e.load = m, e.useColors = t, e.destroy = i.deprecate(
      () => {
      },
      "Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`."
    ), e.colors = [6, 2, 3, 4, 5, 1];
    try {
      const u = uc();
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
      const f = h.substring(6).toLowerCase().replace(/_([a-z])/g, (x, y) => y.toUpperCase());
      let v = process.env[h];
      return /^(yes|on|true|enabled)$/i.test(v) ? v = !0 : /^(no|off|false|disabled)$/i.test(v) ? v = !1 : v === "null" ? v = null : v = Number(v), u[f] = v, u;
    }, {});
    function t() {
      return "colors" in e.inspectOpts ? !!e.inspectOpts.colors : n.isatty(process.stderr.fd);
    }
    function o(u) {
      const { namespace: h, useColors: f } = this;
      if (f) {
        const v = this.color, x = "\x1B[3" + (v < 8 ? v : "8;5;" + v), y = `  ${x};1m${h} \x1B[0m`;
        u[0] = y + u[0].split(`
`).join(`
` + y), u.push(x + "m+" + a.exports.humanize(this.diff) + "\x1B[0m");
      } else
        u[0] = s() + h + " " + u[0];
    }
    function s() {
      return e.inspectOpts.hideDate ? "" : (/* @__PURE__ */ new Date()).toISOString() + " ";
    }
    function r(...u) {
      return process.stderr.write(i.formatWithOptions(e.inspectOpts, ...u) + `
`);
    }
    function l(u) {
      u ? process.env.DEBUG = u : delete process.env.DEBUG;
    }
    function m() {
      return process.env.DEBUG;
    }
    function c(u) {
      u.inspectOpts = {};
      const h = Object.keys(e.inspectOpts);
      for (let f = 0; f < h.length; f++)
        u.inspectOpts[h[f]] = e.inspectOpts[h[f]];
    }
    a.exports = mt()(e);
    const { formatters: p } = a.exports;
    p.o = function(u) {
      return this.inspectOpts.colors = this.useColors, i.inspect(u, this.inspectOpts).split(`
`).map((h) => h.trim()).join(" ");
    }, p.O = function(u) {
      return this.inspectOpts.colors = this.useColors, i.inspect(u, this.inspectOpts);
    };
  }(Qe, Qe.exports)), Qe.exports;
}
var pi;
function mc() {
  return pi || (pi = 1, typeof process > "u" || process.type === "renderer" || process.browser === !0 || process.__nwjs ? Ke.exports = pc() : Ke.exports = dc()), Ke.exports;
}
var Pe, fc = function() {
  if (!Pe) {
    try {
      Pe = mc()("follow-redirects");
    } catch {
    }
    typeof Pe != "function" && (Pe = function() {
    });
  }
  Pe.apply(null, arguments);
}, He = fa, Ue = He.URL, xc = sn, hc = rn, gn = V.Writable, yn = It, ft = fc;
(function() {
  var e = typeof process < "u", n = typeof window < "u" && typeof document < "u", i = be(Error.captureStackTrace);
  !e && (n || !i) && console.warn("The follow-redirects package should be excluded from browser builds.");
})();
var wn = !1;
try {
  yn(new Ue(""));
} catch (a) {
  wn = a.code === "ERR_INVALID_URL";
}
var vc = [
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
], En = ["abort", "aborted", "connect", "error", "socket", "timeout"], _n = /* @__PURE__ */ Object.create(null);
En.forEach(function(a) {
  _n[a] = function(e, n, i) {
    this._redirectable.emit(a, e, n, i);
  };
});
var en = We(
  "ERR_INVALID_URL",
  "Invalid URL",
  TypeError
), an = We(
  "ERR_FR_REDIRECTION_FAILURE",
  "Redirected request failed"
), bc = We(
  "ERR_FR_TOO_MANY_REDIRECTS",
  "Maximum number of redirects exceeded",
  an
), gc = We(
  "ERR_FR_MAX_BODY_LENGTH_EXCEEDED",
  "Request body larger than maxBodyLength limit"
), yc = We(
  "ERR_STREAM_WRITE_AFTER_END",
  "write after end"
), wc = gn.prototype.destroy || ht;
function X(a, e) {
  gn.call(this), this._sanitizeOptions(a), this._options = a, this._ended = !1, this._ending = !1, this._redirectCount = 0, this._redirects = [], this._requestBodyLength = 0, this._requestBodyBuffers = [], e && this.on("response", e);
  var n = this;
  this._onNativeResponse = function(i) {
    try {
      n._processResponse(i);
    } catch (t) {
      n.emit("error", t instanceof an ? t : new an({ cause: t }));
    }
  }, this._performRequest();
}
X.prototype = Object.create(gn.prototype);
X.prototype.abort = function() {
  Rn(this._currentRequest), this._currentRequest.abort(), this.emit("abort");
};
X.prototype.destroy = function(a) {
  return Rn(this._currentRequest, a), wc.call(this, a), this;
};
X.prototype.write = function(a, e, n) {
  if (this._ending)
    throw new yc();
  if (!xe(a) && !Tc(a))
    throw new TypeError("data should be a string, Buffer or Uint8Array");
  if (be(e) && (n = e, e = null), a.length === 0) {
    n && n();
    return;
  }
  this._requestBodyLength + a.length <= this._options.maxBodyLength ? (this._requestBodyLength += a.length, this._requestBodyBuffers.push({ data: a, encoding: e }), this._currentRequest.write(a, e, n)) : (this.emit("error", new gc()), this.abort());
};
X.prototype.end = function(a, e, n) {
  if (be(a) ? (n = a, a = e = null) : be(e) && (n = e, e = null), !a)
    this._ended = this._ending = !0, this._currentRequest.end(null, null, n);
  else {
    var i = this, t = this._currentRequest;
    this.write(a, e, function() {
      i._ended = !0, t.end(null, null, n);
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
  function i(s) {
    s.setTimeout(a), s.removeListener("timeout", s.destroy), s.addListener("timeout", s.destroy);
  }
  function t(s) {
    n._timeout && clearTimeout(n._timeout), n._timeout = setTimeout(function() {
      n.emit("timeout"), o();
    }, a), i(s);
  }
  function o() {
    n._timeout && (clearTimeout(n._timeout), n._timeout = null), n.removeListener("abort", o), n.removeListener("error", o), n.removeListener("response", o), n.removeListener("close", o), e && n.removeListener("timeout", e), n.socket || n._currentRequest.removeListener("socket", t);
  }
  return e && this.on("timeout", e), this.socket ? t(this.socket) : this._currentRequest.once("socket", t), this.on("socket", i), this.on("abort", o), this.on("error", o), this.on("response", o), this.on("close", o), this;
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
  var i = this._currentRequest = e.request(this._options, this._onNativeResponse);
  i._redirectable = this;
  for (var t of En)
    i.on(t, _n[t]);
  if (this._currentUrl = /^\//.test(this._options.path) ? He.format(this._options) : (
    // When making a request to a proxy, […]
    // a client MUST send the target URI in absolute-form […].
    this._options.path
  ), this._isRedirect) {
    var o = 0, s = this, r = this._requestBodyBuffers;
    (function l(m) {
      if (i === s._currentRequest)
        if (m)
          s.emit("error", m);
        else if (o < r.length) {
          var c = r[o++];
          i.finished || i.write(c.data, c.encoding, l);
        } else s._ended && i.end();
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
  if (Rn(this._currentRequest), a.destroy(), ++this._redirectCount > this._options.maxRedirects)
    throw new bc();
  var i, t = this._options.beforeRedirect;
  t && (i = Object.assign({
    // The Host header was set by nativeProtocol.request
    Host: a.req.getHeader("host")
  }, this._options.headers));
  var o = this._options.method;
  ((e === 301 || e === 302) && this._options.method === "POST" || // RFC7231§6.4.4: The 303 (See Other) status code indicates that
  // the server is redirecting the user agent to a different resource […]
  // A user agent can perform a retrieval request targeting that URI
  // (a GET or HEAD request if using HTTP) […]
  e === 303 && !/^(?:GET|HEAD)$/.test(this._options.method)) && (this._options.method = "GET", this._requestBodyBuffers = [], Va(/^content-/i, this._options.headers));
  var s = Va(/^host$/i, this._options.headers), r = Tn(this._currentUrl), l = s || r.host, m = /^\w+:/.test(n) ? this._currentUrl : He.format(Object.assign(r, { host: l })), c = Ec(n, m);
  if (ft("redirecting to", c.href), this._isRedirect = !0, nn(c, this._options), (c.protocol !== r.protocol && c.protocol !== "https:" || c.host !== l && !_c(c.host, l)) && Va(/^(?:(?:proxy-)?authorization|cookie)$/i, this._options.headers), be(t)) {
    var p = {
      headers: a.headers,
      statusCode: e
    }, u = {
      url: m,
      method: o,
      headers: i
    };
    t(this._options, p, u), this._sanitizeOptions(this._options);
  }
  this._performRequest();
};
function xt(a) {
  var e = {
    maxRedirects: 21,
    maxBodyLength: 10485760
  }, n = {};
  return Object.keys(a).forEach(function(i) {
    var t = i + ":", o = n[t] = a[i], s = e[i] = Object.create(o);
    function r(m, c, p) {
      return Rc(m) ? m = nn(m) : xe(m) ? m = nn(Tn(m)) : (p = c, c = vt(m), m = { protocol: t }), be(c) && (p = c, c = null), c = Object.assign({
        maxRedirects: e.maxRedirects,
        maxBodyLength: e.maxBodyLength
      }, m, c), c.nativeProtocols = n, !xe(c.host) && !xe(c.hostname) && (c.hostname = "::1"), yn.equal(c.protocol, t, "protocol mismatch"), ft("options", c), new X(c, p);
    }
    function l(m, c, p) {
      var u = s.request(m, c, p);
      return u.end(), u;
    }
    Object.defineProperties(s, {
      request: { value: r, configurable: !0, enumerable: !0, writable: !0 },
      get: { value: l, configurable: !0, enumerable: !0, writable: !0 }
    });
  }), e;
}
function ht() {
}
function Tn(a) {
  var e;
  if (wn)
    e = new Ue(a);
  else if (e = vt(He.parse(a)), !xe(e.protocol))
    throw new en({ input: a });
  return e;
}
function Ec(a, e) {
  return wn ? new Ue(a, e) : Tn(He.resolve(e, a));
}
function vt(a) {
  if (/^\[/.test(a.hostname) && !/^\[[:0-9a-f]+\]$/i.test(a.hostname))
    throw new en({ input: a.href || a });
  if (/^\[/.test(a.host) && !/^\[[:0-9a-f]+\](:\d+)?$/i.test(a.host))
    throw new en({ input: a.href || a });
  return a;
}
function nn(a, e) {
  var n = e || {};
  for (var i of vc)
    n[i] = a[i];
  return n.hostname.startsWith("[") && (n.hostname = n.hostname.slice(1, -1)), n.port !== "" && (n.port = Number(n.port)), n.path = n.search ? n.pathname + n.search : n.pathname, n;
}
function Va(a, e) {
  var n;
  for (var i in e)
    a.test(i) && (n = e[i], delete e[i]);
  return n === null || typeof n > "u" ? void 0 : String(n).trim();
}
function We(a, e, n) {
  function i(t) {
    be(Error.captureStackTrace) && Error.captureStackTrace(this, this.constructor), Object.assign(this, t || {}), this.code = a, this.message = this.cause ? e + ": " + this.cause.message : e;
  }
  return i.prototype = new (n || Error)(), Object.defineProperties(i.prototype, {
    constructor: {
      value: i,
      enumerable: !1
    },
    name: {
      value: "Error [" + a + "]",
      enumerable: !1
    }
  }), i;
}
function Rn(a, e) {
  for (var n of En)
    a.removeListener(n, _n[n]);
  a.on("error", ht), a.destroy(e);
}
function _c(a, e) {
  yn(xe(a) && xe(e));
  var n = a.length - e.length - 1;
  return n > 0 && a[n] === "." && a.endsWith(e);
}
function xe(a) {
  return typeof a == "string" || a instanceof String;
}
function be(a) {
  return typeof a == "function";
}
function Tc(a) {
  return typeof a == "object" && "length" in a;
}
function Rc(a) {
  return Ue && a instanceof Ue;
}
bn.exports = xt({ http: xc, https: hc });
bn.exports.wrap = xt;
var Sc = bn.exports;
const kc = /* @__PURE__ */ qi(Sc), la = "1.13.4";
function bt(a) {
  const e = /^([-+\w]{1,25})(:?\/\/|:)/.exec(a);
  return e && e[1] || "";
}
const jc = /^(?:([^;]+);)?(?:[^;]+;)?(base64|),([\s\S]*)$/;
function Oc(a, e, n) {
  const i = n && n.Blob || P.classes.Blob, t = bt(a);
  if (e === void 0 && i && (e = !0), t === "data") {
    a = t.length ? a.slice(t.length + 1) : a;
    const o = jc.exec(a);
    if (!o)
      throw new b("Invalid URL", b.ERR_INVALID_URL);
    const s = o[1], r = o[2], l = o[3], m = Buffer.from(decodeURIComponent(l), r ? "base64" : "utf8");
    if (e) {
      if (!i)
        throw new b("Blob is not supported", b.ERR_NOT_SUPPORT);
      return new i([m], { type: s });
    }
    return m;
  }
  throw new b("Unsupported protocol " + t, b.ERR_NOT_SUPPORT);
}
const Ga = Symbol("internals");
class li extends V.Transform {
  constructor(e) {
    e = d.toFlatObject(e, {
      maxRate: 0,
      chunkSize: 64 * 1024,
      minChunkSize: 100,
      timeWindow: 500,
      ticksRate: 2,
      samplesCount: 15
    }, null, (i, t) => !d.isUndefined(t[i])), super({
      readableHighWaterMark: e.chunkSize
    });
    const n = this[Ga] = {
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
    this.on("newListener", (i) => {
      i === "progress" && (n.isCaptured || (n.isCaptured = !0));
    });
  }
  _read(e) {
    const n = this[Ga];
    return n.onReadCallback && n.onReadCallback(), super._read(e);
  }
  _transform(e, n, i) {
    const t = this[Ga], o = t.maxRate, s = this.readableHighWaterMark, r = t.timeWindow, l = 1e3 / r, m = o / l, c = t.minChunkSize !== !1 ? Math.max(t.minChunkSize, m * 0.01) : 0, p = (h, f) => {
      const v = Buffer.byteLength(h);
      t.bytesSeen += v, t.bytes += v, t.isCaptured && this.emit("progress", t.bytesSeen), this.push(h) ? process.nextTick(f) : t.onReadCallback = () => {
        t.onReadCallback = null, process.nextTick(f);
      };
    }, u = (h, f) => {
      const v = Buffer.byteLength(h);
      let x = null, y = s, E, _ = 0;
      if (o) {
        const k = Date.now();
        (!t.ts || (_ = k - t.ts) >= r) && (t.ts = k, E = m - t.bytes, t.bytes = E < 0 ? -E : 0, _ = 0), E = m - t.bytes;
      }
      if (o) {
        if (E <= 0)
          return setTimeout(() => {
            f(null, h);
          }, r - _);
        E < y && (y = E);
      }
      y && v > y && v - y > c && (x = h.subarray(y), h = h.subarray(0, y)), p(h, x ? () => {
        process.nextTick(f, null, x);
      } : f);
    };
    u(e, function h(f, v) {
      if (f)
        return i(f);
      v ? u(v, h) : i(null);
    });
  }
}
const { asyncIterator: ui } = Symbol, gt = async function* (a) {
  a.stream ? yield* a.stream() : a.arrayBuffer ? yield await a.arrayBuffer() : a[ui] ? yield* a[ui]() : yield a;
}, Cc = P.ALPHABET.ALPHA_DIGIT + "-_", De = typeof TextEncoder == "function" ? new TextEncoder() : new ye.TextEncoder(), me = `\r
`, Ac = De.encode(me), Pc = 2;
class Fc {
  constructor(e, n) {
    const { escapeName: i } = this.constructor, t = d.isString(n);
    let o = `Content-Disposition: form-data; name="${i(e)}"${!t && n.name ? `; filename="${i(n.name)}"` : ""}${me}`;
    t ? n = De.encode(String(n).replace(/\r?\n|\r\n?/g, me)) : o += `Content-Type: ${n.type || "application/octet-stream"}${me}`, this.headers = De.encode(o + me), this.contentLength = t ? n.byteLength : n.size, this.size = this.headers.byteLength + this.contentLength + Pc, this.name = e, this.value = n;
  }
  async *encode() {
    yield this.headers;
    const { value: e } = this;
    d.isTypedArray(e) ? yield e : yield* gt(e), yield Ac;
  }
  static escapeName(e) {
    return String(e).replace(/[\r\n"]/g, (n) => ({
      "\r": "%0D",
      "\n": "%0A",
      '"': "%22"
    })[n]);
  }
}
const Lc = (a, e, n) => {
  const {
    tag: i = "form-data-boundary",
    size: t = 25,
    boundary: o = i + "-" + P.generateString(t, Cc)
  } = n || {};
  if (!d.isFormData(a))
    throw TypeError("FormData instance required");
  if (o.length < 1 || o.length > 70)
    throw Error("boundary must be 10-70 characters long");
  const s = De.encode("--" + o + me), r = De.encode("--" + o + "--" + me);
  let l = r.byteLength;
  const m = Array.from(a.entries()).map(([p, u]) => {
    const h = new Fc(p, u);
    return l += h.size, h;
  });
  l += s.byteLength * m.length, l = d.toFiniteNumber(l);
  const c = {
    "Content-Type": `multipart/form-data; boundary=${o}`
  };
  return Number.isFinite(l) && (c["Content-Length"] = l), e && e(c), Ut.from(async function* () {
    for (const p of m)
      yield s, yield* p.encode();
    yield r;
  }());
};
class Nc extends V.Transform {
  __transform(e, n, i) {
    this.push(e), i();
  }
  _transform(e, n, i) {
    if (e.length !== 0 && (this._transform = this.__transform, e[0] !== 120)) {
      const t = Buffer.alloc(2);
      t[0] = 120, t[1] = 156, this.push(t, n);
    }
    this.__transform(e, n, i);
  }
}
const Uc = (a, e) => d.isAsyncFn(a) ? function(...n) {
  const i = n.pop();
  a.apply(this, n).then((t) => {
    try {
      e ? i(null, ...e(t)) : i(null, t);
    } catch (o) {
      i(o);
    }
  }, i);
} : a;
function Dc(a, e) {
  a = a || 10;
  const n = new Array(a), i = new Array(a);
  let t = 0, o = 0, s;
  return e = e !== void 0 ? e : 1e3, function(l) {
    const m = Date.now(), c = i[o];
    s || (s = m), n[t] = l, i[t] = m;
    let p = o, u = 0;
    for (; p !== t; )
      u += n[p++], p = p % a;
    if (t = (t + 1) % a, t === o && (o = (o + 1) % a), m - s < e)
      return;
    const h = c && m - c;
    return h ? Math.round(u * 1e3 / h) : void 0;
  };
}
function Ic(a, e) {
  let n = 0, i = 1e3 / e, t, o;
  const s = (m, c = Date.now()) => {
    n = c, t = null, o && (clearTimeout(o), o = null), a(...m);
  };
  return [(...m) => {
    const c = Date.now(), p = c - n;
    p >= i ? s(m, c) : (t = m, o || (o = setTimeout(() => {
      o = null, s(t);
    }, i - p)));
  }, () => t && s(t)];
}
const Oe = (a, e, n = 3) => {
  let i = 0;
  const t = Dc(50, 250);
  return Ic((o) => {
    const s = o.loaded, r = o.lengthComputable ? o.total : void 0, l = s - i, m = t(l), c = s <= r;
    i = s;
    const p = {
      loaded: s,
      total: r,
      progress: r ? s / r : void 0,
      bytes: l,
      rate: m || void 0,
      estimated: m && r && c ? (r - s) / m : void 0,
      event: o,
      lengthComputable: r != null,
      [e ? "download" : "upload"]: !0
    };
    a(p);
  }, n);
}, ua = (a, e) => {
  const n = a != null;
  return [(i) => e[0]({
    lengthComputable: n,
    total: a,
    loaded: i
  }), e[1]];
}, da = (a) => (...e) => d.asap(() => a(...e));
function Bc(a) {
  if (!a || typeof a != "string" || !a.startsWith("data:")) return 0;
  const e = a.indexOf(",");
  if (e < 0) return 0;
  const n = a.slice(5, e), i = a.slice(e + 1);
  if (/;base64/i.test(n)) {
    let o = i.length;
    const s = i.length;
    for (let u = 0; u < s; u++)
      if (i.charCodeAt(u) === 37 && u + 2 < s) {
        const h = i.charCodeAt(u + 1), f = i.charCodeAt(u + 2);
        (h >= 48 && h <= 57 || h >= 65 && h <= 70 || h >= 97 && h <= 102) && (f >= 48 && f <= 57 || f >= 65 && f <= 70 || f >= 97 && f <= 102) && (o -= 2, u += 2);
      }
    let r = 0, l = s - 1;
    const m = (u) => u >= 2 && i.charCodeAt(u - 2) === 37 && // '%'
    i.charCodeAt(u - 1) === 51 && // '3'
    (i.charCodeAt(u) === 68 || i.charCodeAt(u) === 100);
    l >= 0 && (i.charCodeAt(l) === 61 ? (r++, l--) : m(l) && (r++, l -= 3)), r === 1 && l >= 0 && (i.charCodeAt(l) === 61 || m(l)) && r++;
    const p = Math.floor(o / 4) * 3 - (r || 0);
    return p > 0 ? p : 0;
  }
  return Buffer.byteLength(i, "utf8");
}
const di = {
  flush: pe.constants.Z_SYNC_FLUSH,
  finishFlush: pe.constants.Z_SYNC_FLUSH
}, qc = {
  flush: pe.constants.BROTLI_OPERATION_FLUSH,
  finishFlush: pe.constants.BROTLI_OPERATION_FLUSH
}, mi = d.isFunction(pe.createBrotliDecompress), { http: zc, https: Mc } = kc, $c = /https:?/, fi = P.protocols.map((a) => a + ":"), xi = (a, [e, n]) => (a.on("end", n).on("error", n), e);
class Hc {
  constructor() {
    this.sessions = /* @__PURE__ */ Object.create(null);
  }
  getSession(e, n) {
    n = Object.assign({
      sessionTimeout: 1e3
    }, n);
    let i = this.sessions[e];
    if (i) {
      let c = i.length;
      for (let p = 0; p < c; p++) {
        const [u, h] = i[p];
        if (!u.destroyed && !u.closed && ye.isDeepStrictEqual(h, n))
          return u;
      }
    }
    const t = Oi.connect(e, n);
    let o;
    const s = () => {
      if (o)
        return;
      o = !0;
      let c = i, p = c.length, u = p;
      for (; u--; )
        if (c[u][0] === t) {
          p === 1 ? delete this.sessions[e] : c.splice(u, 1);
          return;
        }
    }, r = t.request, { sessionTimeout: l } = n;
    if (l != null) {
      let c, p = 0;
      t.request = function() {
        const u = r.apply(this, arguments);
        return p++, c && (clearTimeout(c), c = null), u.once("close", () => {
          --p || (c = setTimeout(() => {
            c = null, s();
          }, l));
        }), u;
      };
    }
    t.once("close", s);
    let m = [
      t,
      n
    ];
    return i ? i.push(m) : i = this.sessions[e] = [m], t;
  }
}
const Wc = new Hc();
function Vc(a, e) {
  a.beforeRedirects.proxy && a.beforeRedirects.proxy(a), a.beforeRedirects.config && a.beforeRedirects.config(a, e);
}
function yt(a, e, n) {
  let i = e;
  if (!i && i !== !1) {
    const t = dt.getProxyForUrl(n);
    t && (i = new URL(t));
  }
  if (i) {
    if (i.username && (i.auth = (i.username || "") + ":" + (i.password || "")), i.auth) {
      if (!!(i.auth.username || i.auth.password))
        i.auth = (i.auth.username || "") + ":" + (i.auth.password || "");
      else if (typeof i.auth == "object")
        throw new b("Invalid proxy authorization", b.ERR_BAD_OPTION, { proxy: i });
      const s = Buffer.from(i.auth, "utf8").toString("base64");
      a.headers["Proxy-Authorization"] = "Basic " + s;
    }
    a.headers.host = a.hostname + (a.port ? ":" + a.port : "");
    const t = i.hostname || i.host;
    a.hostname = t, a.host = t, a.port = i.port, a.path = n, i.protocol && (a.protocol = i.protocol.includes(":") ? i.protocol : `${i.protocol}:`);
  }
  a.beforeRedirects.proxy = function(o) {
    yt(o, e, o.href);
  };
}
const Gc = typeof process < "u" && d.kindOf(process) === "process", Xc = (a) => new Promise((e, n) => {
  let i, t;
  const o = (l, m) => {
    t || (t = !0, i && i(l, m));
  }, s = (l) => {
    o(l), e(l);
  }, r = (l) => {
    o(l, !0), n(l);
  };
  a(s, r, (l) => i = l).catch(r);
}), Jc = ({ address: a, family: e }) => {
  if (!d.isString(a))
    throw TypeError("address must be a string");
  return {
    address: a,
    family: e || (a.indexOf(".") < 0 ? 6 : 4)
  };
}, hi = (a, e) => Jc(d.isObject(a) ? a : { address: a, family: e }), Kc = {
  request(a, e) {
    const n = a.protocol + "//" + a.hostname + ":" + (a.port || (a.protocol === "https:" ? 443 : 80)), { http2Options: i, headers: t } = a, o = Wc.getSession(n, i), {
      HTTP2_HEADER_SCHEME: s,
      HTTP2_HEADER_METHOD: r,
      HTTP2_HEADER_PATH: l,
      HTTP2_HEADER_STATUS: m
    } = Oi.constants, c = {
      [s]: a.protocol.replace(":", ""),
      [r]: a.method,
      [l]: a.path
    };
    d.forEach(t, (u, h) => {
      h.charAt(0) !== ":" && (c[h] = u);
    });
    const p = o.request(c);
    return p.once("response", (u) => {
      const h = p;
      u = Object.assign({}, u);
      const f = u[m];
      delete u[m], h.headers = u, h.statusCode = +f, e(h);
    }), p;
  }
}, Yc = Gc && function(e) {
  return Xc(async function(i, t, o) {
    let { data: s, lookup: r, family: l, httpVersion: m = 1, http2Options: c } = e;
    const { responseType: p, responseEncoding: u } = e, h = e.method.toUpperCase();
    let f, v = !1, x;
    if (m = +m, Number.isNaN(m))
      throw TypeError(`Invalid protocol version: '${e.httpVersion}' is not a number`);
    if (m !== 1 && m !== 2)
      throw TypeError(`Unsupported protocol version '${m}'`);
    const y = m === 2;
    if (r) {
      const w = Uc(r, (g) => d.isArray(g) ? g : [g]);
      r = (g, S, K) => {
        w(g, S, (L, Q, ce) => {
          if (L)
            return K(L);
          const W = d.isArray(Q) ? Q.map((Ve) => hi(Ve)) : [hi(Q, ce)];
          S.all ? K(L, W) : K(L, W[0].address, W[0].family);
        });
      };
    }
    const E = new qt();
    function _(w) {
      try {
        E.emit("abort", !w || w.type ? new ve(null, e, x) : w);
      } catch (g) {
        console.warn("emit error", g);
      }
    }
    E.once("abort", t);
    const k = () => {
      e.cancelToken && e.cancelToken.unsubscribe(_), e.signal && e.signal.removeEventListener("abort", _), E.removeAllListeners();
    };
    (e.cancelToken || e.signal) && (e.cancelToken && e.cancelToken.subscribe(_), e.signal && (e.signal.aborted ? _() : e.signal.addEventListener("abort", _))), o((w, g) => {
      if (f = !0, g) {
        v = !0, k();
        return;
      }
      const { data: S } = w;
      if (S instanceof V.Readable || S instanceof V.Duplex) {
        const K = V.finished(S, () => {
          K(), k();
        });
      } else
        k();
    });
    const U = vn(e.baseURL, e.url, e.allowAbsoluteUrls), C = new URL(U, P.hasBrowserEnv ? P.origin : void 0), A = C.protocol || fi[0];
    if (A === "data:") {
      if (e.maxContentLength > -1) {
        const g = String(e.url || U || "");
        if (Bc(g) > e.maxContentLength)
          return t(new b(
            "maxContentLength size of " + e.maxContentLength + " exceeded",
            b.ERR_BAD_RESPONSE,
            e
          ));
      }
      let w;
      if (h !== "GET")
        return Te(i, t, {
          status: 405,
          statusText: "method not allowed",
          headers: {},
          config: e
        });
      try {
        w = Oc(e.url, p === "blob", {
          Blob: e.env && e.env.Blob
        });
      } catch (g) {
        throw b.from(g, b.ERR_BAD_REQUEST, e);
      }
      return p === "text" ? (w = w.toString(u), (!u || u === "utf8") && (w = d.stripBOM(w))) : p === "stream" && (w = V.Readable.from(w)), Te(i, t, {
        data: w,
        status: 200,
        statusText: "OK",
        headers: new M(),
        config: e
      });
    }
    if (fi.indexOf(A) === -1)
      return t(new b(
        "Unsupported protocol " + A,
        b.ERR_BAD_REQUEST,
        e
      ));
    const D = M.from(e.headers).normalize();
    D.set("User-Agent", "axios/" + la, !1);
    const { onUploadProgress: Y, onDownloadProgress: se } = e, ue = e.maxRate;
    let ie, ae;
    if (d.isSpecCompliantForm(s)) {
      const w = D.getContentType(/boundary=([-_\w\d]{10,70})/i);
      s = Lc(s, (g) => {
        D.set(g);
      }, {
        tag: `axios-${la}-boundary`,
        boundary: w && w[1] || void 0
      });
    } else if (d.isFormData(s) && d.isFunction(s.getHeaders)) {
      if (D.set(s.getHeaders()), !D.hasContentLength())
        try {
          const w = await ye.promisify(s.getLength).call(s);
          Number.isFinite(w) && w >= 0 && D.setContentLength(w);
        } catch {
        }
    } else if (d.isBlob(s) || d.isFile(s))
      s.size && D.setContentType(s.type || "application/octet-stream"), D.setContentLength(s.size || 0), s = V.Readable.from(gt(s));
    else if (s && !d.isStream(s)) {
      if (!Buffer.isBuffer(s)) if (d.isArrayBuffer(s))
        s = Buffer.from(new Uint8Array(s));
      else if (d.isString(s))
        s = Buffer.from(s, "utf-8");
      else
        return t(new b(
          "Data after transformation must be a string, an ArrayBuffer, a Buffer, or a Stream",
          b.ERR_BAD_REQUEST,
          e
        ));
      if (D.setContentLength(s.length, !1), e.maxBodyLength > -1 && s.length > e.maxBodyLength)
        return t(new b(
          "Request body larger than maxBodyLength limit",
          b.ERR_BAD_REQUEST,
          e
        ));
    }
    const te = d.toFiniteNumber(D.getContentLength());
    d.isArray(ue) ? (ie = ue[0], ae = ue[1]) : ie = ae = ue, s && (Y || ie) && (d.isStream(s) || (s = V.Readable.from(s, { objectMode: !1 })), s = V.pipeline([s, new li({
      maxRate: d.toFiniteNumber(ie)
    })], d.noop), Y && s.on("progress", xi(
      s,
      ua(
        te,
        Oe(da(Y), !1, 3)
      )
    )));
    let re;
    if (e.auth) {
      const w = e.auth.username || "", g = e.auth.password || "";
      re = w + ":" + g;
    }
    if (!re && C.username) {
      const w = C.username, g = C.password;
      re = w + ":" + g;
    }
    re && D.delete("authorization");
    let J;
    try {
      J = fn(
        C.pathname + C.search,
        e.params,
        e.paramsSerializer
      ).replace(/^\?/, "");
    } catch (w) {
      const g = new Error(w.message);
      return g.config = e, g.url = e.url, g.exists = !0, t(g);
    }
    D.set(
      "Accept-Encoding",
      "gzip, compress, deflate" + (mi ? ", br" : ""),
      !1
    );
    const q = {
      path: J,
      method: h,
      headers: D.toJSON(),
      agents: { http: e.httpAgent, https: e.httpsAgent },
      auth: re,
      protocol: A,
      family: l,
      beforeRedirect: Vc,
      beforeRedirects: {},
      http2Options: c
    };
    !d.isUndefined(r) && (q.lookup = r), e.socketPath ? q.socketPath = e.socketPath : (q.hostname = C.hostname.startsWith("[") ? C.hostname.slice(1, -1) : C.hostname, q.port = C.port, yt(q, e.proxy, A + "//" + C.hostname + (C.port ? ":" + C.port : "") + q.path));
    let H;
    const we = $c.test(q.protocol);
    if (q.agent = we ? e.httpsAgent : e.httpAgent, y ? H = Kc : e.transport ? H = e.transport : e.maxRedirects === 0 ? H = we ? rn : sn : (e.maxRedirects && (q.maxRedirects = e.maxRedirects), e.beforeRedirect && (q.beforeRedirects.config = e.beforeRedirect), H = we ? Mc : zc), e.maxBodyLength > -1 ? q.maxBodyLength = e.maxBodyLength : q.maxBodyLength = 1 / 0, e.insecureHTTPParser && (q.insecureHTTPParser = e.insecureHTTPParser), x = H.request(q, function(g) {
      if (x.destroyed) return;
      const S = [g], K = d.toFiniteNumber(g.headers["content-length"]);
      if (se || ae) {
        const W = new li({
          maxRate: d.toFiniteNumber(ae)
        });
        se && W.on("progress", xi(
          W,
          ua(
            K,
            Oe(da(se), !0, 3)
          )
        )), S.push(W);
      }
      let L = g;
      const Q = g.req || x;
      if (e.decompress !== !1 && g.headers["content-encoding"])
        switch ((h === "HEAD" || g.statusCode === 204) && delete g.headers["content-encoding"], (g.headers["content-encoding"] || "").toLowerCase()) {
          case "gzip":
          case "x-gzip":
          case "compress":
          case "x-compress":
            S.push(pe.createUnzip(di)), delete g.headers["content-encoding"];
            break;
          case "deflate":
            S.push(new Nc()), S.push(pe.createUnzip(di)), delete g.headers["content-encoding"];
            break;
          case "br":
            mi && (S.push(pe.createBrotliDecompress(qc)), delete g.headers["content-encoding"]);
        }
      L = S.length > 1 ? V.pipeline(S, d.noop) : S[0];
      const ce = {
        status: g.statusCode,
        statusText: g.statusMessage,
        headers: new M(g.headers),
        config: e,
        request: Q
      };
      if (p === "stream")
        ce.data = L, Te(i, t, ce);
      else {
        const W = [];
        let Ve = 0;
        L.on("data", function($) {
          W.push($), Ve += $.length, e.maxContentLength > -1 && Ve > e.maxContentLength && (v = !0, L.destroy(), _(new b(
            "maxContentLength size of " + e.maxContentLength + " exceeded",
            b.ERR_BAD_RESPONSE,
            e,
            Q
          )));
        }), L.on("aborted", function() {
          if (v)
            return;
          const $ = new b(
            "stream has been aborted",
            b.ERR_BAD_RESPONSE,
            e,
            Q
          );
          L.destroy($), t($);
        }), L.on("error", function($) {
          x.destroyed || t(b.from($, null, e, Q));
        }), L.on("end", function() {
          try {
            let $ = W.length === 1 ? W[0] : Buffer.concat(W);
            p !== "arraybuffer" && ($ = $.toString(u), (!u || u === "utf8") && ($ = d.stripBOM($))), ce.data = $;
          } catch ($) {
            return t(b.from($, null, e, ce.request, ce));
          }
          Te(i, t, ce);
        });
      }
      E.once("abort", (W) => {
        L.destroyed || (L.emit("error", W), L.destroy());
      });
    }), E.once("abort", (w) => {
      x.close ? x.close() : x.destroy(w);
    }), x.on("error", function(g) {
      t(b.from(g, null, e, x));
    }), x.on("socket", function(g) {
      g.setKeepAlive(!0, 1e3 * 60);
    }), e.timeout) {
      const w = parseInt(e.timeout, 10);
      if (Number.isNaN(w)) {
        _(new b(
          "error trying to parse `config.timeout` to int",
          b.ERR_BAD_OPTION_VALUE,
          e,
          x
        ));
        return;
      }
      x.setTimeout(w, function() {
        if (f) return;
        let S = e.timeout ? "timeout of " + e.timeout + "ms exceeded" : "timeout exceeded";
        const K = e.transitional || xn;
        e.timeoutErrorMessage && (S = e.timeoutErrorMessage), _(new b(
          S,
          K.clarifyTimeoutError ? b.ETIMEDOUT : b.ECONNABORTED,
          e,
          x
        ));
      });
    } else
      x.setTimeout(0);
    if (d.isStream(s)) {
      let w = !1, g = !1;
      s.on("end", () => {
        w = !0;
      }), s.once("error", (S) => {
        g = !0, x.destroy(S);
      }), s.on("close", () => {
        !w && !g && _(new ve("Request stream has been aborted", e, x));
      }), s.pipe(x);
    } else
      s && x.write(s), x.end();
  });
}, Qc = P.hasStandardBrowserEnv ? /* @__PURE__ */ ((a, e) => (n) => (n = new URL(n, P.origin), a.protocol === n.protocol && a.host === n.host && (e || a.port === n.port)))(
  new URL(P.origin),
  P.navigator && /(msie|trident)/i.test(P.navigator.userAgent)
) : () => !0, Zc = P.hasStandardBrowserEnv ? (
  // Standard browser envs support document.cookie
  {
    write(a, e, n, i, t, o, s) {
      if (typeof document > "u") return;
      const r = [`${a}=${encodeURIComponent(e)}`];
      d.isNumber(n) && r.push(`expires=${new Date(n).toUTCString()}`), d.isString(i) && r.push(`path=${i}`), d.isString(t) && r.push(`domain=${t}`), o === !0 && r.push("secure"), d.isString(s) && r.push(`SameSite=${s}`), document.cookie = r.join("; ");
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
), vi = (a) => a instanceof M ? { ...a } : a;
function ge(a, e) {
  e = e || {};
  const n = {};
  function i(m, c, p, u) {
    return d.isPlainObject(m) && d.isPlainObject(c) ? d.merge.call({ caseless: u }, m, c) : d.isPlainObject(c) ? d.merge({}, c) : d.isArray(c) ? c.slice() : c;
  }
  function t(m, c, p, u) {
    if (d.isUndefined(c)) {
      if (!d.isUndefined(m))
        return i(void 0, m, p, u);
    } else return i(m, c, p, u);
  }
  function o(m, c) {
    if (!d.isUndefined(c))
      return i(void 0, c);
  }
  function s(m, c) {
    if (d.isUndefined(c)) {
      if (!d.isUndefined(m))
        return i(void 0, m);
    } else return i(void 0, c);
  }
  function r(m, c, p) {
    if (p in e)
      return i(m, c);
    if (p in a)
      return i(void 0, m);
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
    headers: (m, c, p) => t(vi(m), vi(c), p, !0)
  };
  return d.forEach(Object.keys({ ...a, ...e }), function(c) {
    const p = l[c] || t, u = p(a[c], e[c], c);
    d.isUndefined(u) && p !== r || (n[c] = u);
  }), n;
}
const wt = (a) => {
  const e = ge({}, a);
  let { data: n, withXSRFToken: i, xsrfHeaderName: t, xsrfCookieName: o, headers: s, auth: r } = e;
  if (e.headers = s = M.from(s), e.url = fn(vn(e.baseURL, e.url, e.allowAbsoluteUrls), a.params, a.paramsSerializer), r && s.set(
    "Authorization",
    "Basic " + btoa((r.username || "") + ":" + (r.password ? unescape(encodeURIComponent(r.password)) : ""))
  ), d.isFormData(n)) {
    if (P.hasStandardBrowserEnv || P.hasStandardBrowserWebWorkerEnv)
      s.setContentType(void 0);
    else if (d.isFunction(n.getHeaders)) {
      const l = n.getHeaders(), m = ["content-type", "content-length"];
      Object.entries(l).forEach(([c, p]) => {
        m.includes(c.toLowerCase()) && s.set(c, p);
      });
    }
  }
  if (P.hasStandardBrowserEnv && (i && d.isFunction(i) && (i = i(e)), i || i !== !1 && Qc(e.url))) {
    const l = t && o && Zc.read(o);
    l && s.set(t, l);
  }
  return e;
}, ep = typeof XMLHttpRequest < "u", ap = ep && function(a) {
  return new Promise(function(n, i) {
    const t = wt(a);
    let o = t.data;
    const s = M.from(t.headers).normalize();
    let { responseType: r, onUploadProgress: l, onDownloadProgress: m } = t, c, p, u, h, f;
    function v() {
      h && h(), f && f(), t.cancelToken && t.cancelToken.unsubscribe(c), t.signal && t.signal.removeEventListener("abort", c);
    }
    let x = new XMLHttpRequest();
    x.open(t.method.toUpperCase(), t.url, !0), x.timeout = t.timeout;
    function y() {
      if (!x)
        return;
      const _ = M.from(
        "getAllResponseHeaders" in x && x.getAllResponseHeaders()
      ), U = {
        data: !r || r === "text" || r === "json" ? x.responseText : x.response,
        status: x.status,
        statusText: x.statusText,
        headers: _,
        config: a,
        request: x
      };
      Te(function(A) {
        n(A), v();
      }, function(A) {
        i(A), v();
      }, U), x = null;
    }
    "onloadend" in x ? x.onloadend = y : x.onreadystatechange = function() {
      !x || x.readyState !== 4 || x.status === 0 && !(x.responseURL && x.responseURL.indexOf("file:") === 0) || setTimeout(y);
    }, x.onabort = function() {
      x && (i(new b("Request aborted", b.ECONNABORTED, a, x)), x = null);
    }, x.onerror = function(k) {
      const U = k && k.message ? k.message : "Network Error", C = new b(U, b.ERR_NETWORK, a, x);
      C.event = k || null, i(C), x = null;
    }, x.ontimeout = function() {
      let k = t.timeout ? "timeout of " + t.timeout + "ms exceeded" : "timeout exceeded";
      const U = t.transitional || xn;
      t.timeoutErrorMessage && (k = t.timeoutErrorMessage), i(new b(
        k,
        U.clarifyTimeoutError ? b.ETIMEDOUT : b.ECONNABORTED,
        a,
        x
      )), x = null;
    }, o === void 0 && s.setContentType(null), "setRequestHeader" in x && d.forEach(s.toJSON(), function(k, U) {
      x.setRequestHeader(U, k);
    }), d.isUndefined(t.withCredentials) || (x.withCredentials = !!t.withCredentials), r && r !== "json" && (x.responseType = t.responseType), m && ([u, f] = Oe(m, !0), x.addEventListener("progress", u)), l && x.upload && ([p, h] = Oe(l), x.upload.addEventListener("progress", p), x.upload.addEventListener("loadend", h)), (t.cancelToken || t.signal) && (c = (_) => {
      x && (i(!_ || _.type ? new ve(null, a, x) : _), x.abort(), x = null);
    }, t.cancelToken && t.cancelToken.subscribe(c), t.signal && (t.signal.aborted ? c() : t.signal.addEventListener("abort", c)));
    const E = bt(t.url);
    if (E && P.protocols.indexOf(E) === -1) {
      i(new b("Unsupported protocol " + E + ":", b.ERR_BAD_REQUEST, a));
      return;
    }
    x.send(o || null);
  });
}, np = (a, e) => {
  const { length: n } = a = a ? a.filter(Boolean) : [];
  if (e || n) {
    let i = new AbortController(), t;
    const o = function(m) {
      if (!t) {
        t = !0, r();
        const c = m instanceof Error ? m : this.reason;
        i.abort(c instanceof b ? c : new ve(c instanceof Error ? c.message : c));
      }
    };
    let s = e && setTimeout(() => {
      s = null, o(new b(`timeout of ${e}ms exceeded`, b.ETIMEDOUT));
    }, e);
    const r = () => {
      a && (s && clearTimeout(s), s = null, a.forEach((m) => {
        m.unsubscribe ? m.unsubscribe(o) : m.removeEventListener("abort", o);
      }), a = null);
    };
    a.forEach((m) => m.addEventListener("abort", o));
    const { signal: l } = i;
    return l.unsubscribe = () => d.asap(r), l;
  }
}, ip = function* (a, e) {
  let n = a.byteLength;
  if (n < e) {
    yield a;
    return;
  }
  let i = 0, t;
  for (; i < n; )
    t = i + e, yield a.slice(i, t), i = t;
}, tp = async function* (a, e) {
  for await (const n of op(a))
    yield* ip(n, e);
}, op = async function* (a) {
  if (a[Symbol.asyncIterator]) {
    yield* a;
    return;
  }
  const e = a.getReader();
  try {
    for (; ; ) {
      const { done: n, value: i } = await e.read();
      if (n)
        break;
      yield i;
    }
  } finally {
    await e.cancel();
  }
}, bi = (a, e, n, i) => {
  const t = tp(a, e);
  let o = 0, s, r = (l) => {
    s || (s = !0, i && i(l));
  };
  return new ReadableStream({
    async pull(l) {
      try {
        const { done: m, value: c } = await t.next();
        if (m) {
          r(), l.close();
          return;
        }
        let p = c.byteLength;
        if (n) {
          let u = o += p;
          n(u);
        }
        l.enqueue(new Uint8Array(c));
      } catch (m) {
        throw r(m), m;
      }
    },
    cancel(l) {
      return r(l), t.return();
    }
  }, {
    highWaterMark: 2
  });
}, gi = 64 * 1024, { isFunction: Ze } = d, sp = (({ Request: a, Response: e }) => ({
  Request: a,
  Response: e
}))(d.global), {
  ReadableStream: yi,
  TextEncoder: wi
} = d.global, Ei = (a, ...e) => {
  try {
    return !!a(...e);
  } catch {
    return !1;
  }
}, rp = (a) => {
  a = d.merge.call({
    skipUndefined: !0
  }, sp, a);
  const { fetch: e, Request: n, Response: i } = a, t = e ? Ze(e) : typeof fetch == "function", o = Ze(n), s = Ze(i);
  if (!t)
    return !1;
  const r = t && Ze(yi), l = t && (typeof wi == "function" ? /* @__PURE__ */ ((f) => (v) => f.encode(v))(new wi()) : async (f) => new Uint8Array(await new n(f).arrayBuffer())), m = o && r && Ei(() => {
    let f = !1;
    const v = new n(P.origin, {
      body: new yi(),
      method: "POST",
      get duplex() {
        return f = !0, "half";
      }
    }).headers.has("Content-Type");
    return f && !v;
  }), c = s && r && Ei(() => d.isReadableStream(new i("").body)), p = {
    stream: c && ((f) => f.body)
  };
  t && ["text", "arrayBuffer", "blob", "formData", "stream"].forEach((f) => {
    !p[f] && (p[f] = (v, x) => {
      let y = v && v[f];
      if (y)
        return y.call(v);
      throw new b(`Response type '${f}' is not supported`, b.ERR_NOT_SUPPORT, x);
    });
  });
  const u = async (f) => {
    if (f == null)
      return 0;
    if (d.isBlob(f))
      return f.size;
    if (d.isSpecCompliantForm(f))
      return (await new n(P.origin, {
        method: "POST",
        body: f
      }).arrayBuffer()).byteLength;
    if (d.isArrayBufferView(f) || d.isArrayBuffer(f))
      return f.byteLength;
    if (d.isURLSearchParams(f) && (f = f + ""), d.isString(f))
      return (await l(f)).byteLength;
  }, h = async (f, v) => {
    const x = d.toFiniteNumber(f.getContentLength());
    return x ?? u(v);
  };
  return async (f) => {
    let {
      url: v,
      method: x,
      data: y,
      signal: E,
      cancelToken: _,
      timeout: k,
      onDownloadProgress: U,
      onUploadProgress: C,
      responseType: A,
      headers: D,
      withCredentials: Y = "same-origin",
      fetchOptions: se
    } = wt(f), ue = e || fetch;
    A = A ? (A + "").toLowerCase() : "text";
    let ie = np([E, _ && _.toAbortSignal()], k), ae = null;
    const te = ie && ie.unsubscribe && (() => {
      ie.unsubscribe();
    });
    let re;
    try {
      if (C && m && x !== "get" && x !== "head" && (re = await h(D, y)) !== 0) {
        let g = new n(v, {
          method: "POST",
          body: y,
          duplex: "half"
        }), S;
        if (d.isFormData(y) && (S = g.headers.get("content-type")) && D.setContentType(S), g.body) {
          const [K, L] = ua(
            re,
            Oe(da(C))
          );
          y = bi(g.body, gi, K, L);
        }
      }
      d.isString(Y) || (Y = Y ? "include" : "omit");
      const J = o && "credentials" in n.prototype, q = {
        ...se,
        signal: ie,
        method: x.toUpperCase(),
        headers: D.normalize().toJSON(),
        body: y,
        duplex: "half",
        credentials: J ? Y : void 0
      };
      ae = o && new n(v, q);
      let H = await (o ? ue(ae, se) : ue(v, q));
      const we = c && (A === "stream" || A === "response");
      if (c && (U || we && te)) {
        const g = {};
        ["status", "statusText", "headers"].forEach((Q) => {
          g[Q] = H[Q];
        });
        const S = d.toFiniteNumber(H.headers.get("content-length")), [K, L] = U && ua(
          S,
          Oe(da(U), !0)
        ) || [];
        H = new i(
          bi(H.body, gi, K, () => {
            L && L(), te && te();
          }),
          g
        );
      }
      A = A || "text";
      let w = await p[d.findKey(p, A) || "text"](H, f);
      return !we && te && te(), await new Promise((g, S) => {
        Te(g, S, {
          data: w,
          headers: M.from(H.headers),
          status: H.status,
          statusText: H.statusText,
          config: f,
          request: ae
        });
      });
    } catch (J) {
      throw te && te(), J && J.name === "TypeError" && /Load failed|fetch/i.test(J.message) ? Object.assign(
        new b("Network Error", b.ERR_NETWORK, f, ae),
        {
          cause: J.cause || J
        }
      ) : b.from(J, J && J.code, f, ae);
    }
  };
}, cp = /* @__PURE__ */ new Map(), Et = (a) => {
  let e = a && a.env || {};
  const { fetch: n, Request: i, Response: t } = e, o = [
    i,
    t,
    n
  ];
  let s = o.length, r = s, l, m, c = cp;
  for (; r--; )
    l = o[r], m = c.get(l), m === void 0 && c.set(l, m = r ? /* @__PURE__ */ new Map() : rp(e)), c = m;
  return m;
};
Et();
const Sn = {
  http: Yc,
  xhr: ap,
  fetch: {
    get: Et
  }
};
d.forEach(Sn, (a, e) => {
  if (a) {
    try {
      Object.defineProperty(a, "name", { value: e });
    } catch {
    }
    Object.defineProperty(a, "adapterName", { value: e });
  }
});
const _i = (a) => `- ${a}`, pp = (a) => d.isFunction(a) || a === null || a === !1;
function lp(a, e) {
  a = d.isArray(a) ? a : [a];
  const { length: n } = a;
  let i, t;
  const o = {};
  for (let s = 0; s < n; s++) {
    i = a[s];
    let r;
    if (t = i, !pp(i) && (t = Sn[(r = String(i)).toLowerCase()], t === void 0))
      throw new b(`Unknown adapter '${r}'`);
    if (t && (d.isFunction(t) || (t = t.get(e))))
      break;
    o[r || "#" + s] = t;
  }
  if (!t) {
    const s = Object.entries(o).map(
      ([l, m]) => `adapter ${l} ` + (m === !1 ? "is not supported by the environment" : "is not available in the build")
    );
    let r = n ? s.length > 1 ? `since :
` + s.map(_i).join(`
`) : " " + _i(s[0]) : "as no adapter specified";
    throw new b(
      "There is no suitable adapter to dispatch the request " + r,
      "ERR_NOT_SUPPORT"
    );
  }
  return t;
}
const _t = {
  /**
   * Resolve an adapter from a list of adapter names or functions.
   * @type {Function}
   */
  getAdapter: lp,
  /**
   * Exposes all known adapters
   * @type {Object<string, Function|Object>}
   */
  adapters: Sn
};
function Xa(a) {
  if (a.cancelToken && a.cancelToken.throwIfRequested(), a.signal && a.signal.aborted)
    throw new ve(null, a);
}
function Ti(a) {
  return Xa(a), a.headers = M.from(a.headers), a.data = za.call(
    a,
    a.transformRequest
  ), ["post", "put", "patch"].indexOf(a.method) !== -1 && a.headers.setContentType("application/x-www-form-urlencoded", !1), _t.getAdapter(a.adapter || $e.adapter, a)(a).then(function(i) {
    return Xa(a), i.data = za.call(
      a,
      a.transformResponse,
      i
    ), i.headers = M.from(i.headers), i;
  }, function(i) {
    return ut(i) || (Xa(a), i && i.response && (i.response.data = za.call(
      a,
      a.transformResponse,
      i.response
    ), i.response.headers = M.from(i.response.headers))), Promise.reject(i);
  });
}
const wa = {};
["object", "boolean", "number", "function", "string", "symbol"].forEach((a, e) => {
  wa[a] = function(i) {
    return typeof i === a || "a" + (e < 1 ? "n " : " ") + a;
  };
});
const Ri = {};
wa.transitional = function(e, n, i) {
  function t(o, s) {
    return "[Axios v" + la + "] Transitional option '" + o + "'" + s + (i ? ". " + i : "");
  }
  return (o, s, r) => {
    if (e === !1)
      throw new b(
        t(s, " has been removed" + (n ? " in " + n : "")),
        b.ERR_DEPRECATED
      );
    return n && !Ri[s] && (Ri[s] = !0, console.warn(
      t(
        s,
        " has been deprecated since v" + n + " and will be removed in the near future"
      )
    )), e ? e(o, s, r) : !0;
  };
};
wa.spelling = function(e) {
  return (n, i) => (console.warn(`${i} is likely a misspelling of ${e}`), !0);
};
function up(a, e, n) {
  if (typeof a != "object")
    throw new b("options must be an object", b.ERR_BAD_OPTION_VALUE);
  const i = Object.keys(a);
  let t = i.length;
  for (; t-- > 0; ) {
    const o = i[t], s = e[o];
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
const sa = {
  assertOptions: up,
  validators: wa
}, ne = sa.validators;
let he = class {
  constructor(e) {
    this.defaults = e || {}, this.interceptors = {
      request: new ei(),
      response: new ei()
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
    } catch (i) {
      if (i instanceof Error) {
        let t = {};
        Error.captureStackTrace ? Error.captureStackTrace(t) : t = new Error();
        const o = t.stack ? t.stack.replace(/^.+\n/, "") : "";
        try {
          i.stack ? o && !String(i.stack).endsWith(o.replace(/^.+\n.+\n/, "")) && (i.stack += `
` + o) : i.stack = o;
        } catch {
        }
      }
      throw i;
    }
  }
  _request(e, n) {
    typeof e == "string" ? (n = n || {}, n.url = e) : n = e || {}, n = ge(this.defaults, n);
    const { transitional: i, paramsSerializer: t, headers: o } = n;
    i !== void 0 && sa.assertOptions(i, {
      silentJSONParsing: ne.transitional(ne.boolean),
      forcedJSONParsing: ne.transitional(ne.boolean),
      clarifyTimeoutError: ne.transitional(ne.boolean)
    }, !1), t != null && (d.isFunction(t) ? n.paramsSerializer = {
      serialize: t
    } : sa.assertOptions(t, {
      encode: ne.function,
      serialize: ne.function
    }, !0)), n.allowAbsoluteUrls !== void 0 || (this.defaults.allowAbsoluteUrls !== void 0 ? n.allowAbsoluteUrls = this.defaults.allowAbsoluteUrls : n.allowAbsoluteUrls = !0), sa.assertOptions(n, {
      baseUrl: ne.spelling("baseURL"),
      withXsrfToken: ne.spelling("withXSRFToken")
    }, !0), n.method = (n.method || this.defaults.method || "get").toLowerCase();
    let s = o && d.merge(
      o.common,
      o[n.method]
    );
    o && d.forEach(
      ["delete", "get", "head", "post", "put", "patch", "common"],
      (f) => {
        delete o[f];
      }
    ), n.headers = M.concat(s, o);
    const r = [];
    let l = !0;
    this.interceptors.request.forEach(function(v) {
      typeof v.runWhen == "function" && v.runWhen(n) === !1 || (l = l && v.synchronous, r.unshift(v.fulfilled, v.rejected));
    });
    const m = [];
    this.interceptors.response.forEach(function(v) {
      m.push(v.fulfilled, v.rejected);
    });
    let c, p = 0, u;
    if (!l) {
      const f = [Ti.bind(this), void 0];
      for (f.unshift(...r), f.push(...m), u = f.length, c = Promise.resolve(n); p < u; )
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
      c = Ti.call(this, h);
    } catch (f) {
      return Promise.reject(f);
    }
    for (p = 0, u = m.length; p < u; )
      c = c.then(m[p++], m[p++]);
    return c;
  }
  getUri(e) {
    e = ge(this.defaults, e);
    const n = vn(e.baseURL, e.url, e.allowAbsoluteUrls);
    return fn(n, e.params, e.paramsSerializer);
  }
};
d.forEach(["delete", "get", "head", "options"], function(e) {
  he.prototype[e] = function(n, i) {
    return this.request(ge(i || {}, {
      method: e,
      url: n,
      data: (i || {}).data
    }));
  };
});
d.forEach(["post", "put", "patch"], function(e) {
  function n(i) {
    return function(o, s, r) {
      return this.request(ge(r || {}, {
        method: e,
        headers: i ? {
          "Content-Type": "multipart/form-data"
        } : {},
        url: o,
        data: s
      }));
    };
  }
  he.prototype[e] = n(), he.prototype[e + "Form"] = n(!0);
});
let dp = class Tt {
  constructor(e) {
    if (typeof e != "function")
      throw new TypeError("executor must be a function.");
    let n;
    this.promise = new Promise(function(o) {
      n = o;
    });
    const i = this;
    this.promise.then((t) => {
      if (!i._listeners) return;
      let o = i._listeners.length;
      for (; o-- > 0; )
        i._listeners[o](t);
      i._listeners = null;
    }), this.promise.then = (t) => {
      let o;
      const s = new Promise((r) => {
        i.subscribe(r), o = r;
      }).then(t);
      return s.cancel = function() {
        i.unsubscribe(o);
      }, s;
    }, e(function(o, s, r) {
      i.reason || (i.reason = new ve(o, s, r), n(i.reason));
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
    const e = new AbortController(), n = (i) => {
      e.abort(i);
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
      token: new Tt(function(t) {
        e = t;
      }),
      cancel: e
    };
  }
};
function mp(a) {
  return function(n) {
    return a.apply(null, n);
  };
}
function fp(a) {
  return d.isObject(a) && a.isAxiosError === !0;
}
const tn = {
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
Object.entries(tn).forEach(([a, e]) => {
  tn[e] = a;
});
function Rt(a) {
  const e = new he(a), n = Ai(he.prototype.request, e);
  return d.extend(n, he.prototype, e, { allOwnKeys: !0 }), d.extend(n, e, null, { allOwnKeys: !0 }), n.create = function(t) {
    return Rt(ge(a, t));
  }, n;
}
const j = Rt($e);
j.Axios = he;
j.CanceledError = ve;
j.CancelToken = dp;
j.isCancel = ut;
j.VERSION = la;
j.toFormData = ya;
j.AxiosError = b;
j.Cancel = j.CanceledError;
j.all = function(e) {
  return Promise.all(e);
};
j.spread = mp;
j.isAxiosError = fp;
j.mergeConfig = ge;
j.AxiosHeaders = M;
j.formToJSON = (a) => lt(d.isHTMLForm(a) ? new FormData(a) : a);
j.getAdapter = _t.getAdapter;
j.HttpStatusCode = tn;
j.default = j;
const {
  Axios: Vp,
  AxiosError: Gp,
  CanceledError: Xp,
  isCancel: Jp,
  CancelToken: Kp,
  VERSION: Yp,
  all: Qp,
  Cancel: Zp,
  isAxiosError: el,
  spread: al,
  toFormData: nl,
  AxiosHeaders: il,
  HttpStatusCode: tl,
  formToJSON: ol,
  getAdapter: sl,
  mergeConfig: rl
} = j;
class xp {
  async testConnection(e) {
    var n;
    try {
      return { success: !0, version: ((n = (await j.get(`${e}/api/version`)).data) == null ? void 0 : n.version) || "Unknown" };
    } catch (i) {
      return { success: !1, error: i.message };
    }
  }
  async checkModel(e, n) {
    var i;
    try {
      return { success: !0, found: (((i = (await j.get(`${e}/api/tags`)).data) == null ? void 0 : i.models) || []).some(
        (r) => r.name === n || r.name === `${n}:latest`
      ) };
    } catch (t) {
      return { success: !1, found: !1, error: t.message };
    }
  }
  async getEmbedding(e, n, i) {
    var o;
    const t = await j.post(`${e}/api/embed`, {
      model: n,
      input: i
    });
    return ((o = t.data.embeddings) == null ? void 0 : o[0]) ?? t.data.embedding ?? [];
  }
}
class hp {
  async testConnection(e) {
    var n, i, t;
    try {
      return await j.get("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${e}`
        }
      }), { success: !0 };
    } catch (o) {
      const s = o;
      return { success: !1, error: ((t = (i = (n = s.response) == null ? void 0 : n.data) == null ? void 0 : i.error) == null ? void 0 : t.message) || s.message || "Unknown error" };
    }
  }
  async getEmbedding(e, n, i) {
    return (await j.post(
      "https://api.openai.com/v1/embeddings",
      {
        input: i,
        model: n
      },
      {
        headers: { Authorization: `Bearer ${e}` }
      }
    )).data.data[0].embedding;
  }
}
const kn = ji(import.meta.url), vp = kn("mammoth"), bp = kn("cheerio");
class gp {
  constructor(e, n, i, t) {
    this.db = e, this.pg = n, this.ollama = i, this.openai = t;
  }
  async processProject(e) {
    const n = this.db.getProject(e);
    if (!n) throw new Error("Project not found");
    const i = this.db.getProjectDocuments(e).filter((s) => s.status === "pending" || s.status === "failed");
    if (console.log(
      `[ProcessingManager] Found ${i.length} pending/failed documents for project ${e}. Total docs: ${this.db.getProjectDocuments(e).length}`
    ), i.length === 0)
      return { processed: 0, message: "No pending documents" };
    const t = n.vector_store_config;
    if (!t || !t.url)
      throw new Error("Vector Store not configured");
    let o = 0;
    for (const s of i) {
      const r = s;
      try {
        console.log(
          `[ProcessingManager] Processing document: ${r.name} (${r.id})`
        ), this.db.updateDocumentStatus(r.id, "processing");
        const l = await this.readDocument(r);
        if (!l || !l.trim())
          throw new Error("Empty document content");
        const m = n.chunking_config || {
          strategy: "fixed",
          chunk_size: 1e3,
          chunk_overlap: 100
        }, c = this.chunkText(l, m);
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
          const f = c[h], v = ra();
          let x = [];
          if (n.embedding_config.provider === "ollama") {
            const y = n.embedding_config.api_key_ref || "http://localhost:11434";
            console.log(
              `[ProcessingManager] Getting embedding from Ollama: ${y}, chunk ${h + 1}/${c.length}`
            ), x = await this.ollama.getEmbedding(
              y,
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
            contentHash: cn.createHash("sha256").update(f).digest("hex"),
            embeddingId: ra()
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
            t.url,
            t,
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
    return { processed: o, total: i.length };
  }
  async readDocument(e) {
    if (e.source_type === "url")
      try {
        console.log(`[ProcessingManager] Fetching URL: ${e.source_path}`);
        const i = await fetch(e.source_path, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; DocEmbedder/1.0)"
          }
        });
        if (!i.ok)
          throw new Error(
            `HTTP error: ${i.status} ${i.statusText}`
          );
        const t = await i.text(), o = bp.load(t);
        return o(
          "script, style, nav, footer, header, aside, iframe, noscript"
        ).remove(), (o("main, article, .content, #content, .post").text() || o("body").text()).replace(/\s+/g, " ").trim();
      } catch (i) {
        throw new Error(`Error fetching URL: ${i.message}`);
      }
    const n = ma.extname(e.source_path).toLowerCase();
    try {
      if (n === ".pdf") {
        const i = await On.readFile(e.source_path);
        try {
          const { PDFParse: t } = await import("./index-DGGgRdeM.js"), o = new t({ data: i }), s = await o.getText();
          return await o.destroy(), s.text;
        } catch (t) {
          console.log(
            "[ProcessingManager] Dynamic import failed, trying require:",
            t
          );
          const o = kn("pdf-parse");
          if (o.PDFParse) {
            const s = new o.PDFParse({ data: i }), r = await s.getText();
            return await s.destroy(), r.text;
          } else {
            if (typeof o == "function")
              return (await o(i)).text;
            if (typeof o.default == "function")
              return (await o.default(i)).text;
            throw new Error("Cannot parse PDF: unsupported pdf-parse version");
          }
        }
      } else {
        if (n === ".docx")
          return console.log(
            `[ProcessingManager] Extracting text from DOCX: ${e.source_path}`
          ), (await vp.extractRawText({ path: e.source_path })).value;
        if ([".txt", ".md", ".json", ".csv"].includes(n))
          return await On.readFile(e.source_path, "utf-8");
        throw new Error(`Unsupported file extension: ${n}`);
      }
    } catch (i) {
      throw new Error(`Error reading file: ${i.message}`);
    }
  }
  chunkText(e, n) {
    const i = n.strategy || "fixed", t = n.chunk_size || 1e3, o = n.chunk_overlap || 100;
    return i === "sentence" ? this.chunkBySentence(e, t) : this.chunkFixed(e, t, o);
  }
  chunkFixed(e, n, i) {
    n <= 0 && (n = 1e3), i >= n && (i = n - 10), i < 0 && (i = 0);
    const t = [];
    let o = 0;
    for (; o < e.length; ) {
      const s = Math.min(o + n, e.length);
      if (t.push(e.slice(o, s)), s === e.length) break;
      o += n - i;
    }
    return t;
  }
  chunkBySentence(e, n) {
    const i = e.match(/[^.!?]+[.!?]+(\s+|$)/g) || [e], t = [];
    let o = [], s = 0;
    for (let r = 0; r < i.length; r++) {
      const l = i[r];
      if (s + l.length > n && o.length > 0) {
        t.push(o.join("").trim());
        const m = o[o.length - 1];
        o = [], s = 0, m && m.length < n && (o.push(m), s += m.length);
      }
      o.push(l), s += l.length;
    }
    return o.length > 0 && t.push(o.join("").trim()), t;
  }
  async searchProject(e, n, i = 5) {
    const t = this.db.getProject(e);
    if (!t) throw new Error("Project not found");
    const o = t.vector_store_config;
    if (!o || !o.url)
      throw new Error("Vector Store not configured");
    let s = [];
    if (t.embedding_config.provider === "ollama") {
      const r = t.embedding_config.api_key_ref || "http://localhost:11434";
      s = await this.ollama.getEmbedding(
        r,
        t.embedding_config.model,
        n
      );
    } else t.embedding_config.provider === "openai" && (s = await this.openai.getEmbedding(
      t.embedding_config.api_key_ref,
      t.embedding_config.model,
      n
    ));
    if (s.length === 0)
      throw new Error("Failed to generate embedding for query");
    return await this.pg.searchVectors(
      o.url,
      o,
      s,
      i
    );
  }
}
const yp = Pt(import.meta.url), St = oe.dirname(yp);
process.env.APP_ROOT = oe.join(St, "..");
const on = process.env.VITE_DEV_SERVER_URL, cl = oe.join(process.env.APP_ROOT, "dist-electron"), kt = oe.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = on ? oe.join(process.env.APP_ROOT, "public") : kt;
let O, I, Fe, ea, Si, Ja;
function jt() {
  O = new ki({
    icon: oe.join(process.env.VITE_PUBLIC, "logo.png"),
    webPreferences: {
      preload: oe.join(St, "preload.mjs")
      // Security warning: enabling nodeIntegration is not recommended, but for local tools sometimes useful.
      // We stick to preload.
    },
    width: 1200,
    height: 800,
    titleBarStyle: "hidden",
    // Premium look: frameless/hidden title bar if we implement custom one.
    // Setting titleBarStyle 'hidden' effectively hides standard frame on Mac, on Windows it might need checks.
    // For now keep standard or 'hidden' with traffic lights offset.
    title: "Cartography",
    backgroundColor: "#09090b"
    // match theme
  }), O.webContents.on("did-finish-load", () => {
    O == null || O.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), on ? O.loadURL(on) : O.loadFile(oe.join(kt, "index.html"));
}
Le.on("window-all-closed", () => {
  process.platform !== "darwin" && (Le.quit(), O = null);
});
Le.on("activate", () => {
  ki.getAllWindows().length === 0 && jt();
});
Le.whenReady().then(() => {
  const a = Le.getPath("userData");
  console.log("Initializing Database at:", a), I = new Ht(a), Fe = new Vt(), ea = new xp(), Si = new hp(), Ja = new gp(
    I,
    Fe,
    ea,
    Si
  ), N.handle("get-projects", () => I.getAllProjects()), N.handle("create-project", (e, n, i, t) => I.createProject(n, i, t)), N.handle("update-project", (e, n, i) => I.updateProject(n, i)), N.handle("delete-project", async (e, n) => {
    try {
      const i = I.getProject(n);
      if (i && i.vector_store_config && i.vector_store_config.url) {
        console.log(`Cleaning up vectors for project ${n}...`);
        const t = I.getProjectDocuments(n);
        for (const o of t)
          await Fe.deleteDocumentVectors(
            i.vector_store_config.url,
            i.vector_store_config,
            o.id
          );
      }
    } catch (i) {
      console.error("Error cleaning up vectors during project deletion:", i);
    }
    return I.deleteProject(n), { success: !0 };
  }), N.handle("get-project", (e, n) => I.getProject(n)), N.handle("window-minimize", () => {
    O == null || O.minimize();
  }), N.handle("window-maximize", () => {
    O != null && O.isMaximized() ? O.unmaximize() : O == null || O.maximize();
  }), N.handle("window-close", () => {
    O == null || O.close();
  }), N.handle("get-setting", (e, n) => I.getSetting(n)), N.handle("set-setting", (e, n, i) => I.setSetting(n, i)), N.handle("get-dashboard-stats", () => I.getDashboardStats()), N.handle("import-documents", async (e, n) => {
    if (!O) return [];
    const i = await At.showOpenDialog(O, {
      title: "Import Documents",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Documents", extensions: ["pdf", "txt", "md", "json"] }
      ]
    });
    if (i.canceled || i.filePaths.length === 0)
      return [];
    const t = [];
    for (const o of i.filePaths) {
      const s = oe.basename(o), r = I.addDocument(n, s, o, "file");
      t.push(r);
    }
    return t;
  }), N.handle("get-project-documents", (e, n) => I.getProjectDocuments(n)), N.handle("delete-document", async (e, n, i) => {
    const t = I.getProject(n);
    if (!t) throw new Error("Project not found");
    if (!I.getDocument(i)) throw new Error("Document not found");
    if (t.vector_store_config && t.vector_store_config.url && (console.log(
      `Attempting to delete vectors for doc ${i} from ${t.vector_store_config.provider}`
    ), t.vector_store_config.provider === "pgvector")) {
      const s = await Fe.deleteDocumentVectors(
        t.vector_store_config.url,
        t.vector_store_config,
        i
      );
      s.success || console.warn("Failed to delete vectors from Postgres:", s.error);
    }
    return I.deleteDocument(i), { success: !0 };
  }), N.handle(
    "update-project-config",
    (e, n, i, t, o) => I.updateProjectConfig(
      n,
      i,
      t,
      o
    )
  ), N.handle("test-postgres-connection", async (e, n) => await Fe.testConnection(n)), N.handle("test-ollama-connection", async (e, n) => await ea.testConnection(n)), N.handle("check-ollama-model", async (e, n, i) => await ea.checkModel(n, i)), N.handle("process-project", async (e, n) => await Ja.processProject(n)), N.handle("search-project", async (e, n, i, t) => await Ja.searchProject(n, i, t)), jt();
});
export {
  cl as MAIN_DIST,
  kt as RENDERER_DIST,
  on as VITE_DEV_SERVER_URL
};
