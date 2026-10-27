// API テスト。使い方: `npm run dev` でサーバーを起動して、別の画面で `npm test`
// （DATABASE_URL を設定しないと、テスト用の組み込みDB .pglite/ を使う。本番のDBでは実行しないこと）
const assert = require('assert');
const BASE = process.env.BASE || 'http://localhost:3000';

async function api(path, body) {
  const r = await fetch(BASE + '/api/' + path, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let j = {}; try { j = await r.json(); } catch (_) {}
  return { status: r.status, body: j };
}
const ok = (r, msg) => assert.strictEqual(r.status, 200, msg + ' → ' + r.status + ' ' + JSON.stringify(r.body));
let n = 0;
const test = async (name, fn) => { await fn(); console.log('  ✓ ' + name); n++; };

(async () => {
  console.log('API tests @ ' + BASE);
  let s, made;

  await test('1. 最初から初期データ（8カテゴリ・50品以上）が入っている', async () => {
    s = await api('state'); ok(s, 'state');
    assert.ok(s.body.categories.length >= 8);
    assert.ok(s.body.menus.length >= 50);
    const pizza = s.body.categories.find((c) => c.name === 'ピザ');
    assert.ok(pizza.note_steps.length === 5, 'ピザの共通メモ');
  });

  await test('2. 追加: 手順は改行区切りの文字列でも受け付け、空行は捨てる', async () => {
    const r = await api('menu', { action: 'create', editor: 'テスト', menu: {
      category: 'テスト用', name: 'だし巻き', tags: 'チン 30秒\n\n焼く 3分', steps: '卵を溶く\n焼く\n', plating: '大根おろし', memo: '' } });
    ok(r, 'create');
    made = r.body.menu;
    assert.deepStrictEqual(made.tags, ['チン 30秒', '焼く 3分']);
    assert.deepStrictEqual(made.steps, ['卵を溶く', '焼く']);
    s = await api('state');
    assert.ok(s.body.categories.some((c) => c.name === 'テスト用'), '新しいカテゴリが自動でできる');
  });

  await test('3. 名前・カテゴリ・編集者が空なら保存しない', async () => {
    let r = await api('menu', { action: 'create', editor: 'テスト', menu: { category: 'テスト用', name: '  ' } });
    assert.strictEqual(r.status, 400); assert.strictEqual(r.body.error, 'required_name');
    r = await api('menu', { action: 'create', editor: '', menu: { category: 'テスト用', name: 'x' } });
    assert.strictEqual(r.body.error, 'required_editor');
  });

  await test('4. 編集: version が合えば保存、古い version なら 409 で最新を返す（上書きしない）', async () => {
    const a = await api('menu', { action: 'update', editor: 'Aさん', id: made.id, version: made.version, menu: { ...made, steps: ['卵を溶く', '3分焼く'] } });
    ok(a, 'update');
    assert.strictEqual(a.body.menu.version, made.version + 1);
    const b = await api('menu', { action: 'update', editor: 'Bさん', id: made.id, version: made.version, menu: { ...made, steps: ['上書き'] } });
    assert.strictEqual(b.status, 409); assert.strictEqual(b.body.error, 'conflict');
    assert.deepStrictEqual(b.body.menu.steps, ['卵を溶く', '3分焼く']);
    made = a.body.menu;
  });

  await test('5. ゴミ箱へ → 一覧から消えてゴミ箱に入る → 戻せる', async () => {
    ok(await api('menu', { action: 'delete', editor: 'テスト', id: made.id }), 'delete');
    s = await api('state');
    assert.ok(!s.body.menus.some((m) => m.id === made.id));
    assert.ok(s.body.trash.some((m) => m.id === made.id && m.deleted_by === 'テスト'));
    const e = await api('menu', { action: 'update', editor: 'テスト', id: made.id, version: made.version + 1, menu: made });
    assert.strictEqual(e.body.error, 'deleted', 'ゴミ箱の中は編集できない');
    ok(await api('menu', { action: 'restore', editor: 'テスト', id: made.id }), 'restore');
    s = await api('state');
    assert.ok(s.body.menus.some((m) => m.id === made.id));
  });

  await test('6. 履歴: 新しい順に残り、前の状態に戻せる', async () => {
    const h = await api('history?target=menu&id=' + made.id); ok(h, 'history');
    assert.deepStrictEqual(h.body.history.map((x) => x.action), ['restore', 'delete', 'update', 'create']);
    const first = h.body.history[3];
    assert.deepStrictEqual(first.snapshot.steps, ['卵を溶く', '焼く']);
    const r = await api('menu', { action: 'revert', editor: 'テスト', history_id: first.id }); ok(r, 'revert');
    assert.deepStrictEqual(r.body.menu.steps, ['卵を溶く', '焼く']);
  });

  await test('7. 初期データのメニューにも「最初の状態」の履歴がある', async () => {
    const tako = s.body.menus.find((m) => m.name === 'タコから');
    const h = await api('history?target=menu&id=' + tako.id);
    assert.strictEqual(h.body.history.at(-1).editor, '初期データ');
  });

  await test('8. カテゴリの共通メモ: 編集・古い version は 409・履歴から戻す', async () => {
    s = await api('state');
    const c = s.body.categories.find((x) => x.name === 'やっこ');
    const r = await api('category', { action: 'update', editor: 'テスト', name: 'やっこ', version: c.version, note_title: 'やっこ共通', note_steps: '大葉を敷く\n豆腐をのせる' });
    ok(r, 'category update');
    assert.deepStrictEqual(r.body.category.note_steps, ['大葉を敷く', '豆腐をのせる']);
    const old = await api('category', { action: 'update', editor: 'テスト', name: 'やっこ', version: c.version, note_title: 'x', note_steps: [] });
    assert.strictEqual(old.status, 409);
    const h = await api('history?target=category&id=' + encodeURIComponent('やっこ'));
    const rv = await api('category', { action: 'revert', editor: 'テスト', history_id: h.body.history.at(-1).id });
    ok(rv, 'category revert');
    assert.deepStrictEqual(rv.body.category.note_steps, c.note_steps);
  });

  await test('9. 不正な入力: 存在しないid・未知の操作・GET/POST違い', async () => {
    assert.strictEqual((await api('menu', { action: 'delete', editor: 'テスト', id: 'abc' })).status, 404);
    assert.strictEqual((await api('menu', { action: 'drop', editor: 'テスト' })).status, 400);
    assert.strictEqual((await api('state', {})).status, 405);
    assert.strictEqual((await api('menu', { action: 'create', editor: 'テスト', menu: { category: 'テスト用', name: 'x', steps: 'a'.repeat(301) } })).body.error, 'too_long_steps');
  });

  // 後片付け: テストで作ったメニューはゴミ箱へ
  await api('menu', { action: 'delete', editor: 'テスト', id: made.id });
  console.log(n + ' tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
