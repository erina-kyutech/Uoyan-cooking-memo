'use strict';
const { J, sql, handler, HttpError, text, editorName, int } = require('../lib/core');

// メニュー表（値段）
//   GET  /api/pricelist?id=drink                 … 1枚分を読む（誰でも）
//   POST /api/pricelist { action:'update', id, version, data, editor } … 保存（version が違えば 409 で最新を返す）
//   POST /api/pricelist { action:'revert', history_id, editor }        … 履歴の状態に戻す
const ID_RE = /^[a-z]{1,20}$/;
const THEMES = ['chochin', 'brush', 'wa', 'hand', 'chalk', 'simple']; // public/menu-render.js の THEMES と同じ
const listId = (v) => { if (typeof v !== 'string' || !ID_RE.test(v)) throw new HttpError(404, 'not_found'); return v; };

const get = handler('GET', async (req) => {
  const id = listId((req.query || {}).id || 'drink');
  const rows = await sql()`select id, data, version, updated_at, updated_by from pricelists where id = ${id}`;
  if (!rows.length) throw new HttpError(404, 'not_found');
  return { pricelist: rows[0] };
});

// 値段: 空なら「なし」。0〜99999 の整数だけ
function price(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)); // 全角数字もOK
  if (!/^\d{1,5}$/.test(s)) throw new HttpError(400, 'invalid_price');
  return Number(s);
}
function arr(v, max, field) {
  if (!Array.isArray(v)) return [];
  if (v.length > max) throw new HttpError(400, 'too_many_' + field);
  return v;
}
// 画面から来た data を、決まった形だけ残して整える（知らない項目は捨てる）
function cleanDoc(d) {
  d = d && typeof d === 'object' ? d : {};
  return {
    title: text(d.title, 30, { field: 'title' }),
    theme: THEMES.includes(d.theme) ? d.theme : undefined,
    caution: text(d.caution, 200, { field: 'caution' }),
    blocks: arr(d.blocks, 20, 'blocks').map((b) => ({
      key: typeof b.key === 'string' && ID_RE.test(b.key) ? b.key : 'block',
      title: text(b.title, 20, { required: true, field: 'block_title' }),
      price: price(b.price),
      note: text(b.note, 200, { field: 'note' }) || undefined,
      groups: arr(b.groups, 10, 'groups').map((g) => ({
        label: text(g.label, 30, { field: 'label' }),
        price: price(g.price),
        note: text(g.note, 100, { field: 'note' }) || undefined,
        plus: g.plus ? true : undefined,
        items: arr(g.items, 30, 'items').map((i) => ({ name: text(i && i.name, 40, { required: true, field: 'item_name' }), price: price(i && i.price) })),
      })),
    })),
  };
}

const post = handler('POST', async (req, body) => {
  const editor = editorName(body.editor);
  const db = sql();
  if (body.action === 'revert') {
    const hid = int(body.history_id);
    const src = await db`select snapshot from history where id = ${hid} and target = 'pricelist'`;
    if (!src.length) throw new HttpError(404, 'not_found');
    const s = src[0].snapshot;
    const rows = await db`
      with up as (
        update pricelists set data = ${J(s.data)}::jsonb, version = version + 1, updated_at = now(), updated_by = ${editor}
        where id = ${listId(s.id)} returning *
      ),
      h as (insert into history (target, target_id, action, editor, snapshot)
            select 'pricelist', id, 'revert', ${editor}, to_jsonb(up) from up)
      select id, data, version, updated_at, updated_by from up`;
    if (!rows.length) throw new HttpError(404, 'not_found');
    return { ok: true, pricelist: rows[0] };
  }
  if (body.action !== 'update') throw new HttpError(400, 'invalid_action');
  const id = listId(body.id); const version = int(body.version); const data = cleanDoc(body.data);
  const rows = await db`
    with up as (
      update pricelists set data = ${J(data)}::jsonb, version = version + 1, updated_at = now(), updated_by = ${editor}
      where id = ${id} and version = ${version} returning *
    ),
    h as (insert into history (target, target_id, action, editor, snapshot)
          select 'pricelist', id, 'update', ${editor}, to_jsonb(up) from up)
    select id, data, version, updated_at, updated_by from up`;
  if (rows.length) return { ok: true, pricelist: rows[0] };
  const cur = await db`select id, data, version, updated_at, updated_by from pricelists where id = ${id}`;
  if (!cur.length) throw new HttpError(404, 'not_found');
  throw new HttpError(409, 'conflict', { pricelist: cur[0] });
});

module.exports = (req, res) => (req.method === 'GET' ? get(req, res) : post(req, res));
