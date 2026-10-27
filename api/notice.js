'use strict';
const { sql, handler, HttpError, editorName, noticeInput, uuid, int } = require('../lib/core');

// お知らせの 追加(create)・編集(update)・ゴミ箱へ(delete)・ゴミ箱から戻す(restore)・履歴から戻す(revert)
// menu.js と同じく「お知らせを変える」と「履歴を1行足す」を1つのSQL文で行う。
// 一番上に出るのは作ってから2週間（画面側で created_at を見て分ける）
module.exports = handler('POST', async (req, body) => {
  const editor = editorName(body.editor);
  const fn = ACTIONS[body.action];
  if (!fn) throw new HttpError(400, 'invalid_action');
  return fn(body, editor);
});

const ACTIONS = {
  async create(body, editor) {
    const n = noticeInput(body.notice);
    const rows = await sql()`
      with ins as (
        insert into notices (title, body, created_by, updated_by) values (${n.title}, ${n.body}, ${editor}, ${editor})
        returning *
      ),
      h as (insert into history (target, target_id, action, editor, snapshot)
            select 'notice', id::text, 'create', ${editor}, to_jsonb(ins) from ins)
      select * from ins`;
    return { ok: true, notice: rows[0] };
  },

  async update(body, editor) {
    const id = uuid(body.id); const version = int(body.version); const n = noticeInput(body.notice);
    const db = sql();
    const rows = await db`
      with up as (
        update notices set title = ${n.title}, body = ${n.body}, version = version + 1, updated_at = now(), updated_by = ${editor}
        where id = ${id} and version = ${version} and deleted_at is null returning *
      ),
      h as (insert into history (target, target_id, action, editor, snapshot)
            select 'notice', id::text, 'update', ${editor}, to_jsonb(up) from up)
      select * from up`;
    if (rows.length) return { ok: true, notice: rows[0] };
    const cur = await db`select * from notices where id = ${id}`;
    if (!cur.length) throw new HttpError(404, 'not_found');
    if (cur[0].deleted_at) throw new HttpError(409, 'deleted', { notice: cur[0] });
    throw new HttpError(409, 'conflict', { notice: cur[0] });
  },

  async delete(body, editor) {
    const id = uuid(body.id);
    const rows = await sql()`
      with up as (
        update notices set deleted_at = now(), deleted_by = ${editor}, version = version + 1
        where id = ${id} and deleted_at is null returning *
      ),
      h as (insert into history (target, target_id, action, editor, snapshot)
            select 'notice', id::text, 'delete', ${editor}, to_jsonb(up) from up)
      select * from up`;
    if (!rows.length) throw new HttpError(404, 'not_found');
    return { ok: true, notice: rows[0] };
  },

  async restore(body, editor) {
    const id = uuid(body.id);
    const rows = await sql()`
      with up as (
        update notices set deleted_at = null, deleted_by = null, version = version + 1, updated_at = now(), updated_by = ${editor}
        where id = ${id} and deleted_at is not null returning *
      ),
      h as (insert into history (target, target_id, action, editor, snapshot)
            select 'notice', id::text, 'restore', ${editor}, to_jsonb(up) from up)
      select * from up`;
    if (!rows.length) throw new HttpError(404, 'not_found');
    return { ok: true, notice: rows[0] };
  },

  async revert(body, editor) {
    const hid = int(body.history_id);
    const src = await sql()`select snapshot from history where id = ${hid} and target = 'notice'`;
    if (!src.length) throw new HttpError(404, 'not_found');
    const s = src[0].snapshot;
    const rows = await sql()`
      with up as (
        update notices set title = ${s.title}, body = ${s.body || ''}, deleted_at = null, deleted_by = null,
               version = version + 1, updated_at = now(), updated_by = ${editor}
        where id = ${uuid(s.id)} returning *
      ),
      h as (insert into history (target, target_id, action, editor, snapshot)
            select 'notice', id::text, 'revert', ${editor}, to_jsonb(up) from up)
      select * from up`;
    if (!rows.length) throw new HttpError(404, 'not_found');
    return { ok: true, notice: rows[0] };
  },
};
