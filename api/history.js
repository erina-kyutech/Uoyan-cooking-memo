'use strict';
const { sql, handler, HttpError, text } = require('../lib/core');

// 1つのメニュー（またはカテゴリの共通メモ）の変更履歴。新しい順に最大50件
// 例: GET /api/history?target=menu&id=<メニューのid>
module.exports = handler('GET', async (req) => {
  const q = req.query || {};
  const target = q.target === 'category' ? 'category' : q.target === 'menu' ? 'menu' : null;
  if (!target) throw new HttpError(400, 'invalid_target');
  const id = text(q.id, 60, { required: true, field: 'id' });
  const rows = await sql()`
    select id, action, editor, created_at, snapshot from history
    where target = ${target} and target_id = ${id}
    order by id desc limit 50`;
  return { history: rows.map((r) => ({ ...r, id: Number(r.id) })) };
});
