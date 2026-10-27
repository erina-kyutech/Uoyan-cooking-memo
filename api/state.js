'use strict';
const { sql, handler, menuOut } = require('../lib/core');

// 全部読む: カテゴリ、表示中のメニュー、お知らせ、メニュー表（値段）、ゴミ箱の中身（メニューとお知らせ）
module.exports = handler('GET', async () => {
  const db = sql();
  const [categories, menus, trash, notices, noticeTrash, pricelists] = await Promise.all([
    db`select name, sort, section, note_title, note_steps, version from categories order by sort, name`,
    db`select m.* from menus m left join categories c on c.name = m.category
       where m.deleted_at is null order by coalesce(c.sort, 99999), m.sort, m.created_at`,
    db`select * from menus where deleted_at is not null order by deleted_at desc limit 100`,
    db`select * from notices where deleted_at is null order by created_at desc limit 100`,
    db`select * from notices where deleted_at is not null order by deleted_at desc limit 50`,
    db`select id, data, version, updated_at, updated_by from pricelists order by id`,
  ]);
  return { categories, menus: menus.map(menuOut), trash: trash.map(menuOut), notices, noticeTrash, pricelists, now: new Date().toISOString() };
});
