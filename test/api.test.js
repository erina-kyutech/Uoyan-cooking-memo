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

  await test('10. お店のこと: section=shop で新しいカテゴリを作ると shop になる', async () => {
    const r = await api('menu', { action: 'create', editor: 'テスト', menu: { category: 'テスト掃除', section: 'shop', name: '閉店後の掃除', steps: '床を拭く' } });
    ok(r, 'create shop');
    s = await api('state');
    assert.strictEqual(s.body.categories.find((c) => c.name === 'テスト掃除').section, 'shop');
    assert.strictEqual(s.body.categories.find((c) => c.name === 'ピザ').section, 'cook', '既存は調理');
    await api('menu', { action: 'delete', editor: 'テスト', id: r.body.menu.id });
  });

  await test('11. お知らせ: 追加・編集(409あり)・ゴミ箱・戻す・履歴から戻す', async () => {
    const c = await api('notice', { action: 'create', editor: 'えりな', notice: { title: 'ビールサーバー', body: '発泡酒がなくなったので、どっちで出しても生です' } });
    ok(c, 'notice create');
    let n = c.body.notice;
    s = await api('state');
    assert.ok(s.body.notices.some((x) => x.id === n.id && x.created_by === 'えりな'));
    const u = await api('notice', { action: 'update', editor: 'Aさん', id: n.id, version: n.version, notice: { title: 'ビールサーバー（重要）', body: n.body } });
    ok(u, 'notice update');
    const old = await api('notice', { action: 'update', editor: 'Bさん', id: n.id, version: n.version, notice: { title: 'x', body: '' } });
    assert.strictEqual(old.status, 409);
    ok(await api('notice', { action: 'delete', editor: 'テスト', id: n.id }), 'notice delete');
    s = await api('state');
    assert.ok(!s.body.notices.some((x) => x.id === n.id) && s.body.noticeTrash.some((x) => x.id === n.id));
    ok(await api('notice', { action: 'restore', editor: 'テスト', id: n.id }), 'notice restore');
    const h = await api('history?target=notice&id=' + n.id);
    assert.deepStrictEqual(h.body.history.map((x) => x.action), ['restore', 'delete', 'update', 'create']);
    const rv = await api('notice', { action: 'revert', editor: 'テスト', history_id: h.body.history[3].id });
    assert.strictEqual(rv.body.notice.title, 'ビールサーバー');
    const feed = await api('history');
    assert.ok(feed.body.history.some((x) => x.target === 'notice'), '全体の変更履歴にも出る');
    assert.strictEqual((await api('notice', { action: 'create', editor: 'テスト', notice: { title: '' } })).body.error, 'required_title');
    await api('notice', { action: 'delete', editor: 'テスト', id: n.id });
  });

  await test('12. メニュー表: 初期データ・値段の変更・409・不正な値段・履歴から戻す', async () => {
    let g = await api('pricelist?id=drink'); ok(g, 'pricelist get');
    const pl = g.body.pricelist;
    assert.strictEqual(pl.data.blocks.find((b) => b.key === 'sour').price, 400);
    const d = JSON.parse(JSON.stringify(pl.data));
    d.blocks.find((b) => b.key === 'sour').price = '420';
    d.blocks.find((b) => b.key === 'highball').groups[0].items[0].price = '４８０'; // 全角数字もOK
    d.blocks.find((b) => b.key === 'umeshu').groups[0].items.push({ name: '新しい梅酒' });
    const u = await api('pricelist', { action: 'update', id: 'drink', version: pl.version, data: d, editor: 'えりな' }); ok(u, 'pricelist update');
    assert.strictEqual(u.body.pricelist.data.blocks.find((b) => b.key === 'sour').price, 420);
    assert.strictEqual(u.body.pricelist.data.blocks.find((b) => b.key === 'highball').groups[0].items[0].price, 480);
    const old = await api('pricelist', { action: 'update', id: 'drink', version: pl.version, data: d, editor: 'Bさん' });
    assert.strictEqual(old.status, 409);
    const bad = JSON.parse(JSON.stringify(d)); bad.blocks[0].price = '4百';
    assert.strictEqual((await api('pricelist', { action: 'update', id: 'drink', version: u.body.pricelist.version, data: bad, editor: 'えりな' })).body.error, 'invalid_price');
    s = await api('state');
    assert.strictEqual(s.body.pricelists.find((p) => p.id === 'drink').version, u.body.pricelist.version, 'state にも入る');
    const h = await api('history?target=pricelist&id=drink');
    assert.deepStrictEqual(h.body.history.map((x) => x.action), ['update', 'create']);
    const rv = await api('pricelist', { action: 'revert', editor: 'えりな', history_id: h.body.history[1].id }); ok(rv, 'revert');
    assert.strictEqual(rv.body.pricelist.data.blocks.find((b) => b.key === 'sour').price, 400);
  });

  // 後片付け: テストで作ったメニューはゴミ箱へ
  await api('menu', { action: 'delete', editor: 'テスト', id: made.id });
  console.log(n + ' tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
