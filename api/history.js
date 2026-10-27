'use strict';
const { sql, handler, HttpError, text } = require('../lib/core');

// 変更履歴。新しい順。各行に「1つ前の状態」(prev) も付けるので、画面で何が変わったか比べられる
//   GET /api/history                         … 全部のメニュー・共通メモの最近の変更（初期データは除く）最大100件
//   GET /api/history?target=menu&id=<id>     … 1つのメニューの履歴 最大50件
//   GET /api/history?target=category&id=<名> … 1つのカテゴリの共通メモの履歴 最大50件
module.exports = handler('GET', async (req) => {
  const q = req.query || {};
  const db = sql();
  let rows;
  if (!q.target && !q.id) {
    rows = await db`
      select * from (
        select id, target, target_id, action, editor, created_at, snapshot,
               lag(snapshot) over (partition by target, target_id order by id) as prev
        from history
      ) h
      where editor <> '初期データ'
      order by id desc limit 100`;
  } else {
    const target = q.target === 'category' ? 'category' : q.target === 'menu' ? 'menu' : null;
    if (!target) throw new HttpError(400, 'invalid_target');
    const id = text(q.id, 60, { required: true, field: 'id' });
    rows = await db`
      select id, target, target_id, action, editor, created_at, snapshot,
             lag(snapshot) over (order by id) as prev
      from history
      where target = ${target} and target_id = ${id}
      order by id desc limit 50`;
  }
  return { history: rows.map((r) => ({ ...r, id: Number(r.id), prev: r.prev || null })) };
});
