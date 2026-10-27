'use strict';
// DB への接続。本番は Neon（DATABASE_URL）。
// ローカルのテスト用に DATABASE_URL=pglite:<フォルダ> と書くと、PGlite（ブラウザ不要の組み込み Postgres）を使う。
// どちらも sql`...` のタグ付きテンプレートで「行の配列」を返す同じ使い方になる。
const fs = require('fs');
const path = require('path');

let _sql;

function sql() {
  if (_sql) return _sql;
  const url = String(process.env.DATABASE_URL || '').replace(/^﻿/, '').trim();
  if (!url) throw new Error('DATABASE_URL is not set');
  if (url.startsWith('pglite:')) _sql = pgliteSql(url.slice(7));
  else {
    const { neon } = require('@neondatabase/serverless');
    const n = neon(url);
    _sql = n;
    _sql.exec = async (text) => { for (const s of splitSql(text)) await n(s); };
  }
  return _sql;
}

function pgliteSql(dir) {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite(dir || undefined);
  const tag = (strings, ...vals) => {
    let text = strings[0];
    for (let i = 0; i < vals.length; i++) text += '$' + (i + 1) + strings[i + 1];
    return db.query(text, vals.map((v) => (v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v))).then((r) => r.rows);
  };
  tag.exec = (text) => db.exec(text);
  return tag;
}

const splitSql = (text) => text.replace(/--.*$/gm, '').split(';').map((s) => s.trim()).filter(Boolean);

// テーブル作成と初期データ投入。関数が起動するたびに1回だけ実行する（何度実行しても安全）
let _ready;
function ready() {
  if (!_ready) _ready = migrate().catch((e) => { _ready = null; throw e; });
  return _ready;
}

async function migrate() {
  const db = sql();
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.json'), 'utf8'));
  // meta に 'seeded' を入れられた1回だけ初期データを入れる（同時に2つ起動しても二重にならない）
  await db`
    with s as (insert into meta (key, value) values ('seeded', now()::text) on conflict do nothing returning 1),
    c as (
      insert into categories (name, sort, note_title, note_steps)
      select x.name, x.sort, x.note_title, x.note_steps
      from jsonb_to_recordset(${JSON.stringify(seed.categories)}::jsonb) as x(name text, sort int, note_title text, note_steps jsonb)
      where exists (select 1 from s)
      on conflict do nothing
      returning *
    ),
    ch as (
      insert into history (target, target_id, action, editor, snapshot)
      select 'category', c.name, 'create', '初期データ', to_jsonb(c) from c
    ),
    m as (
      insert into menus (category, name, tags, steps, plating, memo, sort, updated_by)
    select x.category, x.name, x.tags, x.steps, x.plating, x.memo, x.sort, '初期データ'
    from jsonb_to_recordset(${JSON.stringify(seed.menus)}::jsonb) as x(category text, name text, tags jsonb, steps jsonb, plating text, memo text, sort int)
      where exists (select 1 from s)
      returning *
    )
    insert into history (target, target_id, action, editor, snapshot)
    select 'menu', m.id::text, 'create', '初期データ', to_jsonb(m) from m`;
}

module.exports = { sql, ready };
