'use strict';
const { J, sql, handler, HttpError, editorName, menuInput, uuid, int, menuOut, ensureCategory } = require('../lib/core');

// メニューの 追加(create)・編集(update)・ゴミ箱へ(delete)・ゴミ箱から戻す(restore)・履歴から戻す(revert)
// どの操作も「メニューを変える」と「履歴を1行足す」を1つのSQL文でまとめて行う（片方だけ成功することはない）。
// history.snapshot には「操作したあとの中身」が入る。
module.exports = handler('POST', async (req, body) => {
  const editor = editorName(body.editor);
  const fn = ACTIONS[body.action];
  if (!fn) throw new HttpError(400, 'invalid_action');
  return fn(body, editor);
});

const ACTIONS = {
  async create(body, editor) {
    const m = menuInput(body.menu);
    await ensureCategory(m.category, m.section);
    const rows = await sql()`
      with ins as (
        insert into menus (category, name, tags, steps, plating, memo, sort, updated_by)
        select ${m.category}, ${m.name}, ${J(m.tags)}::jsonb, ${J(m.steps)}::jsonb, ${m.plating}, ${m.memo},
               coalesce((select max(sort) from menus where category = ${m.category}), 0) + 10, ${editor}
        returning *
      ),
      h as (insert into history (target, target_id, action, editor, snapshot)
            select 'menu', id::text, 'create', ${editor}, to_jsonb(ins) from ins)
      select * from ins`;
    return { ok: true, menu: menuOut(rows[0]) };
  },

  // version が画面で読んだときと同じときだけ保存する。違えば誰かが先に変えたので 409 と最新の中身を返す
  async update(body, editor) {
    const id = uuid(body.id); const version = int(body.version); const m = menuInput(body.menu);
    await ensureCategory(m.category, m.section);
    const db = sql();
    const rows = await db`
      with up as (
        update menus set category = ${m.category}, name = ${m.name}, tags = ${J(m.tags)}::jsonb, steps = ${J(m.steps)}::jsonb,
               plating = ${m.plating}, memo = ${m.memo},
               sort = case when category = ${m.category} then sort
                           else coalesce((select max(sort) from menus where category = ${m.category}), 0) + 10 end,
               version = version + 1, updated_at = now(), updated_by = ${editor}
        where id = ${id} and version = ${version} and deleted_at is null
        returning *
      ),
      h as (insert into history (target, target_id, action, editor, snapshot)
            select 'menu', id::text, 'update', ${editor}, to_jsonb(up) from up)
      select * from up`;
    if (rows.length) return { ok: true, menu: menuOut(rows[0]) };
    const cur = await db`select * from menus where id = ${id}`;
    if (!cur.length) throw new HttpError(404, 'not_found');
    if (cur[0].deleted_at) throw new HttpError(409, 'deleted', { menu: menuOut(cur[0]) });
    throw new HttpError(409, 'conflict', { menu: menuOut(cur[0]) });
  },

  async delete(body, editor) {
    const id = uuid(body.id);
    const rows = await sql()`
      with up as (
        update menus set deleted_at = now(), deleted_by = ${editor}, version = version + 1
        where id = ${id} and deleted_at is null returning *
      ),
      h as (insert into history (target, target_id, action, editor, snapshot)
            select 'menu', id::text, 'delete', ${editor}, to_jsonb(up) from up)
      select * from up`;
    if (!rows.length) throw new HttpError(404, 'not_found');
    return { ok: true, menu: menuOut(rows[0]) };
  },

  async restore(body, editor) {
    const id = uuid(body.id);
    const rows = await sql()`
      with up as (
        update menus set deleted_at = null, deleted_by = null, version = version + 1, updated_at = now(), updated_by = ${editor}
        where id = ${id} and deleted_at is not null returning *
      ),
      h as (insert into history (target, target_id, action, editor, snapshot)
            select 'menu', id::text, 'restore', ${editor}, to_jsonb(up) from up)
      select * from up`;
    if (!rows.length) throw new HttpError(404, 'not_found');
    return { ok: true, menu: menuOut(rows[0]) };
  },

  // 履歴の1行の状態に戻す（ゴミ箱に入っていたら表示中に戻す）
  async revert(body, editor) {
    const hid = int(body.history_id);
    const src = await sql()`select snapshot from history where id = ${hid} and target = 'menu'`;
    if (!src.length) throw new HttpError(404, 'not_found');
    const s = src[0].snapshot;
    await ensureCategory(s.category);
    const rows = await sql()`
      with up as (
        update menus set category = ${s.category}, name = ${s.name}, tags = ${J(s.tags)}::jsonb, steps = ${J(s.steps)}::jsonb,
               plating = ${s.plating || ''}, memo = ${s.memo || ''}, deleted_at = null, deleted_by = null,
               version = version + 1, updated_at = now(), updated_by = ${editor}
        where id = ${uuid(s.id)} returning *
      ),
      h as (insert into history (target, target_id, action, editor, snapshot)
            select 'menu', id::text, 'revert', ${editor}, to_jsonb(up) from up)
      select * from up`;
    if (!rows.length) throw new HttpError(404, 'not_found');
    return { ok: true, menu: menuOut(rows[0]) };
  },
};
