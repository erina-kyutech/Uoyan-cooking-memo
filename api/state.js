'use strict';
const { sql, handler, menuOut } = require('../lib/core');

// 全部読む: カテゴリ、表示中のメニュー、ゴミ箱の中身
module.exports = handler('GET', async () => {
  const db = sql();
  const [categories, menus, trash] = await Promise.all([
    db`select name, sort, note_title, note_steps, version from categories order by sort, name`,
    db`select m.* from menus m left join categories c on c.name = m.category
       where m.deleted_at is null order by coalesce(c.sort, 99999), m.sort, m.created_at`,
    db`select * from menus where deleted_at is not null order by deleted_at desc limit 100`,
  ]);
  return { categories, menus: menus.map(menuOut), trash: trash.map(menuOut) };
});
