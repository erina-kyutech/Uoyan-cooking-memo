'use strict';
require('./env');
const { sql, ready } = require('./db');

class HttpError extends Error {
  constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; }
}

// 共通ハンドラ: メソッド検証・JSON本文・DB準備・エラー整形・キャッシュ無効化
function handler(method, fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (req.method !== method) throw new HttpError(405, 'method_not_allowed');
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      await ready();
      const out = await fn(req, body && typeof body === 'object' ? body : {});
      res.status(200).json(out);
    } catch (e) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.code, ...(e.extra || {}) });
      console.error(e);
      res.status(500).json({ error: 'server_error' });
    }
  };
}

// 文字列を整える: 制御文字を消して前後の空白を取る。長すぎたら 400
function text(v, max, { required = false, field = 'text' } = {}) {
  const s = String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '').trim();
  if (required && !s) throw new HttpError(400, 'required_' + field);
  if ([...s].length > max) throw new HttpError(400, 'too_long_' + field);
  return s;
}

// 1行1項目のリスト（手順・時間タグ）。文字列なら改行で分ける。空行は捨てる
function lines(v, maxItems, maxLen, field) {
  const arr = Array.isArray(v) ? v : String(v == null ? '' : v).split(/\r?\n/);
  const out = arr.map((x) => text(x, maxLen, { field })).filter(Boolean);
  if (out.length > maxItems) throw new HttpError(400, 'too_many_' + field);
  return out;
}

const editorName = (v) => text(v, 20, { required: true, field: 'editor' });

function menuInput(m) {
  m = m && typeof m === 'object' ? m : {};
  return {
    category: text(m.category, 30, { required: true, field: 'category' }),
    name: text(m.name, 60, { required: true, field: 'name' }),
    tags: lines(m.tags, 10, 40, 'tags'),
    steps: lines(m.steps, 30, 300, 'steps'),
    plating: text(m.plating, 300, { field: 'plating' }),
    memo: text(m.memo, 300, { field: 'memo' }),
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(v) { if (typeof v !== 'string' || !UUID_RE.test(v)) throw new HttpError(404, 'not_found'); return v; }
function int(v) { const n = Number(v); if (!Number.isInteger(n) || n < 0) throw new HttpError(400, 'invalid_version'); return n; }

// 画面に返すメニューの形
const menuOut = (r) => r && ({
  id: r.id, category: r.category, name: r.name, tags: r.tags, steps: r.steps, plating: r.plating, memo: r.memo,
  sort: r.sort, version: r.version, updated_at: r.updated_at, updated_by: r.updated_by,
  deleted_at: r.deleted_at || null, deleted_by: r.deleted_by || null,
});

// カテゴリが無ければ一番後ろに作る
async function ensureCategory(name) {
  await sql()`
    insert into categories (name, sort)
    select ${name}, coalesce(max(sort), 0) + 10 from categories
    on conflict (name) do nothing`;
}

const J = (v) => JSON.stringify(v);

module.exports = { J, sql, HttpError, handler, text, lines, editorName, menuInput, uuid, int, menuOut, ensureCategory };
