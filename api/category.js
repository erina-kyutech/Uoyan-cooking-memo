'use strict';
const { J, sql, handler, HttpError, text, lines, editorName, int } = require('../lib/core');

// カテゴリの共通メモ（例: ピザの焼き方）を編集(update)・履歴から戻す(revert)
module.exports = handler('POST', async (req, body) => {
  const editor = editorName(body.editor);
  const db = sql();

  if (body.action === 'revert') {
    const hid = int(body.history_id);
    const src = await db`select snapshot from history where id = ${hid} and target = 'category'`;
    if (!src.length) throw new HttpError(404, 'not_found');
    const s = src[0].snapshot;
    const rows = await db`
      with up as (
        update categories set note_title = ${s.note_title || ''}, note_steps = ${J(s.note_steps || [])}::jsonb,
               version = version + 1, updated_at = now()
        where name = ${s.name} returning *
      ),
      h as (insert into history (target, target_id, action, editor, snapshot)
            select 'category', name, 'revert', ${editor}, to_jsonb(up) from up)
      select name, sort, note_title, note_steps, version from up`;
    if (!rows.length) throw new HttpError(404, 'not_found');
    return { ok: true, category: rows[0] };
  }

  if (body.action !== 'update') throw new HttpError(400, 'invalid_action');
  const name = text(body.name, 30, { required: true, field: 'category' });
  const version = int(body.version);
  const noteTitle = text(body.note_title, 40, { field: 'note_title' });
  const noteSteps = lines(body.note_steps, 30, 300, 'note_steps');
  const rows = await db`
    with up as (
      update categories set note_title = ${noteTitle}, note_steps = ${J(noteSteps)}::jsonb,
             version = version + 1, updated_at = now()
      where name = ${name} and version = ${version} returning *
    ),
    h as (insert into history (target, target_id, action, editor, snapshot)
          select 'category', name, 'update', ${editor}, to_jsonb(up) from up)
    select name, sort, note_title, note_steps, version from up`;
  if (rows.length) return { ok: true, category: rows[0] };
  const cur = await db`select name, sort, note_title, note_steps, version from categories where name = ${name}`;
  if (!cur.length) throw new HttpError(404, 'not_found');
  throw new HttpError(409, 'conflict', { category: cur[0] });
});
