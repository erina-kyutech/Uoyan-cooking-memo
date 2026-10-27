'use strict';
// うおやんクッキングメモ（画面）。素の JS。データは /api/state から読み、変更は /api/menu・/api/category・/api/notice に送る。

// ---------- 小さな道具 ----------
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 保存できなくても動く */ } },
};
const fmtTime = (t) => new Date(t).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

// サーバーのエラーコード → 画面に出す言葉
const ERRORS = {
  required_name: 'メニュー名を入れてね', required_category: 'カテゴリを選ぶか、新しいカテゴリ名を入れてね', required_editor: '名前を入れてね',
  too_long_name: 'メニュー名が長すぎるよ（60文字まで）', too_long_category: 'カテゴリ名が長すぎるよ（30文字まで）', too_long_editor: '名前は20文字までにしてね',
  too_long_steps: '手順の1行が長すぎるよ（300文字まで）', too_many_steps: '手順は30行までにしてね',
  too_long_tags: '時間タグの1行が長すぎるよ（40文字まで）', too_many_tags: '時間タグは10行までにしてね',
  too_long_plating: '盛り付けが長すぎるよ（300文字まで）', too_long_memo: 'メモが長すぎるよ（300文字まで）',
  too_long_note_steps: '共通メモの1行が長すぎるよ', too_many_note_steps: '共通メモは30行までにしてね', too_long_note_title: '見出しが長すぎるよ（40文字まで）',
  required_block_title: '種類の名前が空のところがあるよ', too_many_blocks: '種類は20個までにしてね', too_many_groups: '小見出しのまとまりは1つの種類に10個までにしてね', too_many_items: '1つのまとまりに入れられるのは30品までだよ',
  required_item_name: '品名が空の行があるよ。入れるか「×」で消してね', invalid_price: '値段は数字だけで入れてね（例：450）',
  required_title: 'タイトルを入れてね', too_long_title: 'タイトルが長すぎるよ（60文字まで）', too_long_body: '本文が長すぎるよ（1000文字まで）',
  not_found: '見つからなかった。もう一度読み込んでね',
  network: '通信できなかった。電波を確認して、もう一度押してね',
};
const errText = (e) => ERRORS[e.code] || '保存できなかった（' + e.code + '）。もう一度押してね';

async function api(path, body) {
  let r;
  try {
    r = await fetch('/api/' + path, body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch (_) { const e = new Error('network'); e.code = 'network'; throw e; }
  let j = {}; try { j = await r.json(); } catch (_) { /* 本文なし */ }
  if (!r.ok) { const e = new Error(j.error || 'http_' + r.status); e.code = j.error || 'http_' + r.status; e.status = r.status; e.body = j; throw e; }
  return j;
}

// ---------- 状態 ----------
let S = { categories: [], menus: [], trash: [], notices: [], noticeTrash: [], pricelists: [] };
let section = ['shop', 'menu'].includes(store.get('uoyan_section')) ? store.get('uoyan_section') : 'cook'; // 上の大きいタブ: 調理 / お店のこと / メニュー表
let cat = 'すべて';
let editing = false;
let editor = store.get('uoyan_editor') || '';
const openIds = new Set(); // 開いているカード（描き直しても開いたままにする）

try { const c = JSON.parse(store.get('uoyan_cache') || 'null'); if (c && Array.isArray(c.menus)) S = { notices: [], noticeTrash: [], pricelists: [], ...c }; } catch (_) { /* キャッシュなし */ }

// 調理とお店のことで、言葉を変える
const LABELS = {
  cook: { item: 'メニュー', unit: '品', name: 'メニュー名', namePh: '例：だし巻き卵', tags: '時間タグ', tagsPh: 'チン 1分&#10;揚げる 40秒',
    tagsHint: '1行に1つ。「チン」「焼く」「揚げる」で始めると色がつくよ。なければ空でOK', plating: '盛り付け', platingPh: '例：大葉、大根おろし、柑橘', catPh: '例：デザート' },
  shop: { item: '項目', unit: '件', name: 'タイトル', namePh: '例：閉店後の掃除', tags: 'タグ', tagsPh: '毎日&#10;閉店後',
    tagsHint: '1行に1つ。いつやるか、など。なければ空でOK', plating: '気をつけること', platingPh: '例：洗剤は薄めて使う', catPh: '例：掃除、ドリンク' },
};
const sectionOf = (catName) => { const c = S.categories.find((x) => x.name === catName); return c && c.section === 'shop' ? 'shop' : 'cook'; };

// お知らせ: 作ってから2週間は一番上に出る。この端末でまだ見ていないものに NEW をつける
const NOTICE_DAYS = 14;
const isActive = (n) => (Date.parse(S.now || '') || Date.now()) - Date.parse(n.created_at) < NOTICE_DAYS * 864e5;
let seen; try { seen = new Set(JSON.parse(store.get('uoyan_seen') || '[]')); } catch (_) { seen = new Set(); }
const newIds = new Set();
function markSeen() {
  for (const n of S.notices) if (isActive(n) && !seen.has(n.id)) { newIds.add(n.id); seen.add(n.id); }
  store.set('uoyan_seen', JSON.stringify([...seen].slice(-300)));
}

async function load() {
  try {
    S = await api('state');
    store.set('uoyan_cache', JSON.stringify(S));
    markSeen();
    setStatus('');
  } catch (_) {
    setStatus(S.menus.length ? '最新の内容を読み込めなかった。前に開いたときの内容を表示しているよ' : '読み込めなかった。電波を確認して、ページを開き直してね');
  }
  render();
}
function setStatus(t) { const el = $('#status'); el.textContent = t; el.hidden = !t; }

// ---------- 時間タグの色 ----------
function tagClass(t) {
  if (/^(チン|レンチン|レンジ)/.test(t)) return 'c-chin';
  if (/^(焼|鉄板|フライパン|七輪|炙)/.test(t)) return 'c-yaki';
  if (/^揚/.test(t)) return 'c-age';
  if (/要確認|注意/.test(t)) return 'c-warn';
  return 'c-plain';
}

// ---------- 描画 ----------
const tabs = $('#tabs'), main = $('#main'), q = $('#q');

function categoriesInOrder() {
  const names = S.categories.map((c) => c.name);
  for (const m of S.menus) if (!names.includes(m.category)) names.push(m.category);
  return names.map((n) => S.categories.find((c) => c.name === n) || { name: n, section: 'cook', note_title: '', note_steps: [], version: 0 })
    .filter((c) => (c.section === 'shop' ? 'shop' : 'cook') === section);
}

function renderTabs(cats) {
  const names = ['すべて', ...cats.map((c) => c.name)];
  if (!names.includes(cat)) cat = 'すべて';
  tabs.innerHTML = names.map((n) => `<button class="tab" type="button" aria-pressed="${n === cat}" data-tab="${esc(n)}">${esc(n)}</button>`).join('');
}

function card(m) {
  const chips = (m.tags || []).map((t) => `<span class="chip ${tagClass(t)}">${esc(t)}</span>`).join('');
  let body = '';
  if (m.steps && m.steps.length) body += `<ol>${m.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
  let dl = '';
  if (m.plating) dl += `<dt>${LABELS[sectionOf(m.category)].plating}</dt><dd>${esc(m.plating)}</dd>`;
  if (m.memo) dl += `<dt>メモ</dt><dd>${esc(m.memo)}</dd>`;
  if (dl) body += `<dl class="row">${dl}</dl>`;
  if (editing) {
    body += `<div class="actions">
      <button class="btn btn-small" type="button" data-act="edit" data-id="${m.id}">編集</button>
      <button class="btn btn-small" type="button" data-act="history" data-id="${m.id}">履歴</button>
      <button class="btn btn-small btn-danger" type="button" data-act="delete" data-id="${m.id}">ゴミ箱へ</button>
    </div>`;
  }
  const open = openIds.has(m.id) || q.value.trim() ? ' open' : '';
  return `<details class="card" data-id="${m.id}"${open}><summary><div class="name">${esc(m.name)}</div>${chips ? `<div class="chips">${chips}</div>` : ''}</summary><div class="body">${body || '<p style="margin:0;color:var(--muted)">手順はまだ書かれていないよ</p>'}</div></details>`;
}

function noteBox(c) {
  const has = c.note_title || (c.note_steps && c.note_steps.length);
  if (!has && !editing) return '';
  if (!has) return `<div class="add-row" style="margin-bottom:10px"><button class="btn btn-small add-btn" type="button" data-act="note" data-cat="${esc(c.name)}">＋ このカテゴリの共通メモを書く</button></div>`;
  const btns = editing ? `<span class="add-row">
      <button class="btn btn-small" type="button" data-act="note" data-cat="${esc(c.name)}">編集</button>
      <button class="btn btn-small" type="button" data-act="note-history" data-cat="${esc(c.name)}">履歴</button></span>` : '';
  return `<div class="note"><div class="note-head"><b>${esc(c.note_title || c.name + 'の共通メモ')}</b>${btns}</div>${
    c.note_steps.length ? `<ol>${c.note_steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}</div>`;
}

function render() {
  document.body.classList.toggle('editing', editing);
  $('#editHint').hidden = !editing;
  $('#legend').hidden = section !== 'cook';
  for (const b of document.querySelectorAll('[data-section]')) b.setAttribute('aria-pressed', b.dataset.section === section);
  $('#bar').hidden = section === 'menu';
  if (section === 'menu') { $('#legend').hidden = true; renderNotices(); main.innerHTML = renderMenuTab(); fitPreview(); renderTrash(); renderDock(); return; }
  const L = LABELS[section];
  renderNotices();
  const cats = categoriesInOrder().filter((c) => editing || S.menus.some((m) => m.category === c.name));
  renderTabs(cats);
  const term = q.value.trim();
  let html = '';
  for (const c of cats) {
    if (cat !== 'すべて' && c.name !== cat) continue;
    const items = S.menus.filter((m) => m.category === c.name && (!term || m.name.includes(term) || c.name.includes(term)));
    if (term && !items.length) continue;
    const add = editing ? `<button class="btn add-btn" type="button" data-act="add" data-cat="${esc(c.name)}">＋ ${esc(c.name)}に${L.item}を追加</button>` : '';
    html += `<section><h2>${esc(c.name)}${items.length ? `<small>${items.length}${L.unit}</small>` : ''}</h2>${term ? '' : noteBox(c)}<div class="list">${items.map(card).join('')}${add}</div></section>`;
  }
  if (editing && !term) html += `<section><button class="btn add-btn" type="button" data-act="add" data-cat="">＋ 新しいカテゴリで${L.item}を追加</button></section>`;
  if (!html) {
    html = term ? `<p class="empty">「${esc(term)}」に当てはまる${L.item}がないよ</p>`
      : !S.menus.length && !S.categories.length ? '<p class="loading">読み込み中…</p>'
      : section === 'shop' ? '<p class="empty">まだ何も書かれていないよ。<br>下の「✏ 編集する」から、掃除やドリンクのことを追加できるよ</p>' : '';
  }
  main.innerHTML = html;
  renderTrash();
  renderDock();
}

function renderTrash() {
  const el = $('#trash');
  el.hidden = !editing;
  if (!editing) { el.innerHTML = ''; return; }
  const nt = (S.noticeTrash || []).map((n) => `
    <div class="trash-item"><div><b>${esc(n.title)}</b><small>お知らせ・${fmtTime(n.deleted_at)} ${esc(n.deleted_by || '')}さんが削除</small></div>
    <span class="add-row"><button class="btn btn-small" type="button" data-act="notice-history" data-id="${n.id}">履歴</button>
    <button class="btn btn-small btn-primary" type="button" data-act="notice-restore" data-id="${n.id}">戻す</button></span></div>`).join('');
  const total = S.trash.length + (S.noticeTrash || []).length;
  el.innerHTML = `<h2>ゴミ箱<small>${total}件</small></h2>${nt}${total ? S.trash.map((m) => `
    <div class="trash-item"><div><b>${esc(m.name)}</b><small>${esc(m.category)}・${fmtTime(m.deleted_at)} ${esc(m.deleted_by || '')}さんが削除</small></div>
    <span class="add-row"><button class="btn btn-small" type="button" data-act="history" data-id="${m.id}">履歴</button>
    <button class="btn btn-small btn-primary" type="button" data-act="restore" data-id="${m.id}">戻す</button></span></div>`).join('')
    : '<p style="color:var(--muted);font-size:.85rem">ゴミ箱は空だよ</p>'}`;
}

function renderDock() {
  $('#dock').innerHTML = editing
    ? `<div class="who">編集中：<b>${esc(editor)}</b>（<button type="button" data-act="rename">名前を変える</button>）</div>
       <button class="btn" type="button" data-act="feed">変更履歴</button>
       <button class="btn btn-primary" type="button" data-act="edit-off">✓ 終わる</button>`
    : `<button class="btn" type="button" data-act="feed">変更履歴</button>
       <button class="btn wide" type="button" data-act="edit-on">✏ 編集する</button>`;
}

// ---------- メニュー表 ----------
const drink = () => (S.pricelists || []).find((p) => p.id === 'drink');

function renderMenuTab() {
  const pl = drink();
  if (!pl) return '<p class="loading">読み込み中…</p>';
  const by = pl.updated_by && pl.updated_by !== '初期データ' ? `（${esc(pl.updated_by)}さん）` : '';
  return `<div class="mt">
    <div class="mt-head"><h2>ドリンクメニュー</h2><span>最終更新 ${fmtTime(pl.updated_at)}${by}</span></div>
    <div class="mt-design"><span>デザイン：<b>${esc(themeName(pl.data.theme))}</b></span><button class="btn btn-small" type="button" data-act="design">デザインを選ぶ</button></div>
    <a class="mt-preview" href="/menu.html" aria-label="ドリンクメニュー表を大きく開く">${DrinkMenu.render(pl.data)}</a>
    <div class="mt-actions">
      <a class="btn btn-primary" href="/menu.html">大きく開く・印刷・PDF</a>
      <button class="btn btn-accent" type="button" data-act="price-edit">値段・品名を変える</button>
      <button class="btn" type="button" data-act="price-history">履歴</button>
    </div>
    <p class="notice-none">値段は税抜きで入れてね。税込（10%）は自動で計算されるよ。</p>
  </div>`;
}

const themeName = (id) => (DrinkMenu.THEMES.find((t) => t.id === (id || 'chochin')) || DrinkMenu.THEMES[0]).name;

// デザインを選ぶ。小さい見本を並べて、押したらそのデザインで保存（値段はそのまま）
function designPicker(pl) {
  const cur = pl.data.theme || 'chochin';
  const s = openSheet(`<h3>デザインを選ぶ</h3>
    <p style="margin:0;font-size:.85rem;color:var(--muted)">中身（お酒と値段）は同じで、見た目だけ変わるよ。選ぶとみんなのメニュー表がそのデザインになる。</p>
    <div class="dz">${DrinkMenu.THEMES.map((t) => `<button type="button" data-theme="${t.id}" aria-pressed="${t.id === cur}">
      <span class="thumb">${DrinkMenu.render(pl.data, t.id)}</span><span><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span></button>`).join('')}</div>
    <p class="err" id="dzErr" hidden></p>
    <div class="sheet-actions"><button class="btn" type="button" id="dzClose">閉じる</button></div>`);
  const fitThumbs = () => { for (const th of s.querySelectorAll('.thumb')) { th.firstElementChild.style.transform = 'scale(' + th.clientWidth / 1000 + ')'; DrinkMenu.fit(th.firstElementChild); } };
  fitThumbs(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitThumbs);
  $('#dzClose', s).onclick = closeSheet;
  s.querySelector('.dz').addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme]'); if (!b || b.dataset.theme === cur) return;
    withName(async () => {
      try {
        await api('pricelist', { action: 'update', id: 'drink', version: pl.version, data: { ...pl.data, theme: b.dataset.theme }, editor });
        closeSheet(); toast('「' + themeName(b.dataset.theme) + '」にしたよ'); await load();
      } catch (er) {
        const x = $('#dzErr', s); x.textContent = er.code === 'conflict' ? '他の人が先にメニュー表を変更したよ。閉じて、もう一度選んでね' : errText(er); x.hidden = false;
        if (er.code === 'conflict') load();
      }
    });
  });
}

// 1000px で組んだメニュー表を、枠の幅に合わせて縮める
function fitPreview() {
  const box = main.querySelector('.mt-preview'); if (!box) return;
  const dm = box.querySelector('.dm');
  const sc = box.clientWidth / 1000;
  dm.style.transform = 'scale(' + sc + ')';
  box.style.height = Math.round(1414 * sc) + 'px';
  DrinkMenu.fit(dm);
}
addEventListener('resize', fitPreview);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitPreview);

// 値段・品名の編集。種類（ブロック）・小見出し（グループ）・品を、追加・削除・名前変更できる。
// data をコピーして、入力のたびに書き換える。保存は1枚まるごと
function priceForm(pl) {
  let version = pl.version;
  const d = JSON.parse(JSON.stringify(pl.data));
  const orig = new Map(DrinkMenu.flatten(pl.data).map((x) => [x.key, x.price]));
  let confirmDel = ''; // 種類・小見出しは2回押しで消す
  let fitOk = '';      // 縮小の警告を見たうえでの2回目の保存か
  const s = openSheet(`<h3>ドリンクメニューを編集</h3>
    <p style="margin:0;font-size:.85rem;color:var(--muted)">値段は税抜き（税込は自動）。「各」に値段を入れると、その中が全部同じ値段になるよ。変えたところは色がつく。</p>
    <div class="warnbox" id="peConflict" hidden></div>
    <div class="pe" id="pe"></div>
    <button class="btn add-btn" type="button" id="peAddBlock">＋ 種類を追加（例：日本酒）</button>
    <div class="warnbox" id="peFit" hidden></div>
    <p class="err" id="peErr" hidden></p>
    <div class="sheet-actions"><button class="btn" type="button" id="peCancel">やめる</button><button class="btn btn-accent" type="button" id="peSave">保存する</button></div>`);
  const box = $('#pe', s);
  const taxText = (v) => (/^\d+$/.test(String(v ?? '').trim()) ? `税込${DrinkMenu.tax(Number(v))}円` : '');
  const priceBox = (path, v, key, ph) => `<span class="pe-price"><input inputmode="numeric" data-path="${path}" data-key="${esc(key)}" value="${v ?? ''}" placeholder="${ph}" aria-label="値段"></span>`;
  const each = (path, v, key) => `<div class="pe-each">各 ${priceBox(path, v, key, 'なし')}<span class="pe-tax" data-tax="${path}">${taxText(v)}</span></div>`;
  const xBtn = (kind, id, label) => `<button class="pe-x${confirmDel === kind + id ? ' pe-x-on' : ''}" type="button" data-del${kind}="${id}" aria-label="${label}">${confirmDel === kind + id ? '消す？' : '×'}</button>`;
  function draw() {
    box.innerHTML = d.blocks.map((b, bi) => {
      const bl = b.title;
      return `<div class="pe-block">
        <div class="pe-bhead"><input class="pe-title" data-path="${bi}.title" value="${esc(b.title)}" placeholder="種類の名前（例：日本酒）" maxlength="20" aria-label="種類の名前">${xBtn('block', bi, 'この種類を消す')}</div>
        ${each(`${bi}.price`, b.price, bl + '（各）')}
        ${b.groups.map((g, gi) => {
          const gl = g.label ? bl + '／' + g.label : bl;
          const ph = g.price != null && g.price !== '' ? '各' + g.price : b.price != null && b.price !== '' ? '各' + b.price : '値段';
          return `<div class="pe-group">
            <div class="pe-glabel"><input data-path="${bi}.${gi}.label" value="${esc(g.label)}" placeholder="小見出し（なくてもOK）" maxlength="30" aria-label="小見出し">${xBtn('group', bi + '.' + gi, 'この小見出しのまとまりを消す')}</div>
            ${g.plus ? '<span class="pe-note">追加料金（＋○円）の行</span>' : each(`${bi}.${gi}.price`, g.price, g.label ? gl + '（各）' : `#${bi}.${gi}（各）`)}
            ${g.items.map((it, ii) => `<div class="pe-row">
              <input data-path="${bi}.${gi}.${ii}.name" value="${esc(it.name)}" aria-label="品名" placeholder="品名" maxlength="40">
              ${priceBox(`${bi}.${gi}.${ii}.price`, it.price, gl + '／' + it.name, ph)}
              <button class="pe-x" type="button" data-del="${bi}.${gi}.${ii}" aria-label="この品を消す">×</button></div>`).join('')}
            <button class="pe-add" type="button" data-add="${bi}.${gi}">＋ 品を追加</button></div>`;
        }).join('')}
        <button class="pe-add" type="button" data-addgroup="${bi}">＋ 小見出しのまとまりを追加</button></div>`;
    }).join('');
    for (const inp of box.querySelectorAll('input[data-key]')) mark(inp);
  }
  function mark(inp) {
    const k = inp.dataset.key;
    inp.classList.toggle('pe-changed', String(orig.has(k) ? orig.get(k) ?? '' : '') !== inp.value.trim());
  }
  function set(path, val) {
    const p = path.split('.'); const f = p.pop();
    const b = d.blocks[p[0]];
    const obj = p.length === 1 ? b : p.length === 2 ? b.groups[p[1]] : b.groups[p[1]].items[p[2]];
    obj[f] = val;
  }
  box.addEventListener('input', (e) => {
    const inp = e.target.closest('input[data-path]'); if (!inp) return;
    set(inp.dataset.path, inp.value);
    fitOk = '';
    if (inp.dataset.key) {
      mark(inp);
      const t = box.querySelector(`[data-tax="${inp.dataset.path}"]`); if (t) t.textContent = taxText(inp.value);
    }
  });
  box.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    fitOk = '';
    if (t.dataset.del) { const [bi, gi, ii] = t.dataset.del.split('.').map(Number); d.blocks[bi].groups[gi].items.splice(ii, 1); draw(); return; }
    if (t.dataset.delgroup) {
      if (confirmDel !== 'group' + t.dataset.delgroup) { confirmDel = 'group' + t.dataset.delgroup; draw(); return; }
      const [bi, gi] = t.dataset.delgroup.split('.').map(Number); d.blocks[bi].groups.splice(gi, 1); confirmDel = ''; draw(); return;
    }
    if (t.dataset.delblock) {
      if (confirmDel !== 'block' + t.dataset.delblock) { confirmDel = 'block' + t.dataset.delblock; draw(); return; }
      d.blocks.splice(Number(t.dataset.delblock), 1); confirmDel = ''; draw(); return;
    }
    if (t.dataset.add) {
      const [bi, gi] = t.dataset.add.split('.').map(Number);
      d.blocks[bi].groups[gi].items.push({ name: '', price: '' }); draw();
      const rows = box.querySelectorAll(`[data-path^="${bi}.${gi}."][data-path$=".name"]`); if (rows.length) rows[rows.length - 1].focus();
      return;
    }
    if (t.dataset.addgroup) {
      const bi = Number(t.dataset.addgroup);
      d.blocks[bi].groups.push({ label: '', items: [{ name: '', price: '' }] }); draw();
      const ins = box.querySelectorAll(`[data-path="${bi}.${d.blocks[bi].groups.length - 1}.label"]`); if (ins.length) ins[0].focus();
    }
  });
  $('#peAddBlock', s).onclick = () => {
    const key = 'x' + Math.random().toString(36).replace(/[^a-z]/g, '').slice(0, 7);
    d.blocks.push({ key, title: '', groups: [{ label: '', items: [{ name: '', price: '' }] }] });
    fitOk = ''; draw();
    const ins = box.querySelectorAll('.pe-title'); ins[ins.length - 1].focus();
  };
  draw();

  // 保存する形に整える: 空の品・空のまとまり・空の種類は捨てる
  function cleaned() {
    const out = JSON.parse(JSON.stringify(d));
    out.blocks = out.blocks.map((b) => ({ ...b, groups: b.groups.map((g) => ({ ...g, items: g.items.filter((i) => String(i.name || '').trim()) }))
      .filter((g) => g.items.length) })).filter((b) => String(b.title || '').trim() || b.groups.length);
    return out;
  }
  // 試しに描いて、1枚に収まるか・どれくらい縮むかを見る
  function checkFit(data) {
    const tmp = document.createElement('div');
    tmp.style.cssText = 'position:fixed;left:-30000px;top:0;width:1000px;height:1414px;visibility:hidden';
    document.body.appendChild(tmp);
    try { return DrinkMenu.mount(tmp, data); } finally { tmp.remove(); }
  }
  $('#peCancel', s).onclick = closeSheet;
  $('#peSave', s).onclick = (e) => busy(e.currentTarget, async () => {
    const err = $('#peErr', s); err.hidden = true;
    const data = cleaned();
    if (data.blocks.some((b) => !String(b.title || '').trim())) { err.textContent = '種類の名前が空のところがあるよ'; err.hidden = false; return; }
    const r = checkFit(data);
    const key = JSON.stringify(data);
    const fbox = $('#peFit', s);
    if ((!r.fits || r.scale < 0.94) && fitOk !== key) {
      fitOk = key;
      fbox.innerHTML = !r.fits
        ? '<b>1枚に入りきらないよ</b><span>いちばん小さくしても、はみ出すところがある。品を減らすか、このまま保存してあとで直してね。保存するなら、もう一度「保存する」を押してね。</span>'
        : `<b>文字が少し小さくなるよ（いまの約${Math.round(r.scale * 100)}%）</b><span>1枚に収まるように、全体を縮めて印刷される。これでいいなら、もう一度「保存する」を押してね。</span>`;
      fbox.hidden = false; fbox.scrollIntoView({ block: 'nearest' });
      return;
    }
    try {
      await api('pricelist', { action: 'update', id: 'drink', version, data, editor });
      closeSheet(); toast('メニュー表を更新したよ'); await load();
    } catch (er) {
      if (er.code === 'conflict') {
        const cur = er.body.pricelist; version = cur.version;
        const box2 = $('#peConflict', s);
        box2.innerHTML = `<b>${esc(cur.updated_by)}さんが先に変更したよ（${fmtTime(cur.updated_at)}）</b><span>「変更履歴」で中身を確認して、自分の内容で上書きしていいなら、もう一度「保存する」を押してね。</span>`;
        box2.hidden = false; box2.scrollIntoView({ block: 'nearest' }); load();
      } else { err.textContent = errText(er); err.hidden = false; }
    }
  });
}

// ---------- お知らせ ----------
function noticeCard(n, withNew) {
  const btns = editing ? `<div class="actions">
      <button class="btn btn-small" type="button" data-act="notice-edit" data-id="${n.id}">編集</button>
      <button class="btn btn-small" type="button" data-act="notice-history" data-id="${n.id}">履歴</button>
      <button class="btn btn-small btn-danger" type="button" data-act="notice-delete" data-id="${n.id}">ゴミ箱へ</button></div>` : '';
  return `<article class="notice" data-notice="${n.id}">
    <div class="notice-head"><b>${esc(n.title)}</b>${withNew && newIds.has(n.id) ? '<span class="new">NEW</span>' : ''}</div>
    ${n.body ? `<p class="notice-body">${esc(n.body)}</p>` : ''}
    <div class="notice-meta">${fmtTime(n.created_at)}　${esc(n.created_by)}さん${n.updated_by && n.updated_by !== n.created_by ? `（${esc(n.updated_by)}さんが修正）` : ''}</div>
    ${btns}</article>`;
}

function renderNotices() {
  const el = $('#notices');
  const active = S.notices.filter(isActive);
  const past = S.notices.length - active.length;
  if (q.value.trim()) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="notices-head"><h2>お知らせ${active.length ? `<small>${active.length}件</small>` : ''}</h2>
      <button class="btn btn-small" type="button" data-act="notice-add">＋ 書く</button></div>
    ${active.length ? `<div class="notice-list">${active.map((n) => noticeCard(n, true)).join('')}</div>`
      : '<p class="notice-none">いまお知らせはないよ</p>'}
    ${past ? `<button class="linkbtn" type="button" data-act="notice-past">過去のお知らせ（${past}件）</button>` : ''}`;
}

function pastNotices() {
  const list = S.notices.filter((n) => !isActive(n));
  const s = openSheet(`<h3>過去のお知らせ</h3>
    <p style="margin:0;font-size:.85rem;color:var(--muted)">書いてから${NOTICE_DAYS}日たったお知らせ。</p>
    <div class="notice-list">${list.map((n) => noticeCard(n, false)).join('') || '<p class="notice-none">まだないよ</p>'}</div>
    <div class="sheet-actions"><button class="btn" type="button" id="pClose">閉じる</button></div>`);
  $('#pClose', s).onclick = closeSheet;
}

function noticeForm(n) {
  const isNew = !n;
  n = n || { title: '', body: '' };
  let version = n.version;
  const s = openSheet(`
    <h3>${isNew ? 'お知らせを書く' : 'お知らせを編集'}</h3>
    <div class="warnbox" id="ntConflict" hidden></div>
    <div class="field"><label for="ntTitle">タイトル</label><input id="ntTitle" maxlength="60" value="${esc(n.title)}" placeholder="例：ビールサーバーについて"></div>
    <div class="field"><label for="ntBody">内容</label><textarea id="ntBody" rows="5" placeholder="例：発泡酒がなくなったので、どっちのサーバーで出しても生ビールになってます">${esc(n.body)}</textarea>
      <span class="hint">書いてから${NOTICE_DAYS}日間、いちばん上に出るよ。そのあとは「過去のお知らせ」に移る</span></div>
    <p class="err" id="ntErr" hidden></p>
    <div class="sheet-actions"><button class="btn" type="button" id="ntCancel">やめる</button><button class="btn btn-accent" type="button" id="ntSave">${isNew ? 'みんなに知らせる' : '保存する'}</button></div>`);
  $('#ntCancel', s).onclick = closeSheet;
  $('#ntSave', s).onclick = (e) => busy(e.currentTarget, async () => {
    const notice = { title: $('#ntTitle', s).value, body: $('#ntBody', s).value };
    const err = $('#ntErr', s); err.hidden = true;
    try {
      const r = isNew ? await api('notice', { action: 'create', editor, notice })
        : await api('notice', { action: 'update', editor, id: n.id, version, notice });
      seen.add(r.notice.id); // 自分が書いたものには NEW をつけない
      closeSheet(); toast(isNew ? 'お知らせを出したよ' : '保存したよ'); await load(); window.scrollTo(0, 0);
    } catch (er) {
      if (er.code === 'conflict') {
        const cur = er.body.notice; version = cur.version;
        const box = $('#ntConflict', s);
        box.innerHTML = `<b>${esc(cur.updated_by)}さんが先に変更したよ</b><span>いまの内容：${esc(cur.title)}</span><span style="white-space:pre-wrap">${esc(cur.body)}</span><span>自分の内容で上書きしていいなら、もう一度「保存する」を押してね。</span>`;
        box.hidden = false; load();
      } else if (er.code === 'deleted') { err.textContent = '他の人がゴミ箱に入れたよ。ゴミ箱から戻してから編集してね'; err.hidden = false; load(); }
      else { err.textContent = errText(er); err.hidden = false; }
    }
  });
}

function confirmDeleteNotice(n) {
  const s = openSheet(`
    <h3>お知らせ「${esc(n.title)}」をゴミ箱に入れる？</h3>
    <p style="margin:0;font-size:.9rem">ゴミ箱に入れても、いちばん下の「ゴミ箱」からいつでも戻せるよ。</p>
    <p class="err" id="ndErr" hidden></p>
    <div class="sheet-actions"><button class="btn" type="button" id="ndNo">やめる</button><button class="btn btn-danger" type="button" id="ndYes">ゴミ箱に入れる</button></div>`);
  $('#ndNo', s).onclick = closeSheet;
  $('#ndYes', s).onclick = (e) => busy(e.currentTarget, async () => {
    try { await api('notice', { action: 'delete', editor, id: n.id }); closeSheet(); toast('ゴミ箱に入れたよ'); await load(); }
    catch (er) { const x = $('#ndErr', s); x.textContent = errText(er); x.hidden = false; }
  });
}

// 名前がまだなら聞いてから実行する
const withName = (fn) => (editor ? fn() : askName(fn));

// ---------- 下から出る入力画面 ----------
let sheetEl = null;
function openSheet(html) {
  closeSheet();
  sheetEl = document.createElement('div');
  sheetEl.className = 'backdrop';
  sheetEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  sheetEl.addEventListener('click', (e) => { if (e.target === sheetEl) closeSheet(); });
  document.body.appendChild(sheetEl);
  document.body.style.overflow = 'hidden';
  const f = sheetEl.querySelector('input,textarea,select'); if (f && matchMedia('(hover:hover)').matches) f.focus();
  return sheetEl;
}
function closeSheet() {
  if (sheetEl) { sheetEl.remove(); sheetEl = null; document.body.style.overflow = ''; }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

let toastTimer;
function toast(t) {
  let el = $('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = t;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2600);
}

// 送信中はボタンを押せなくする
async function busy(btn, fn) {
  if (btn.disabled) return;
  const label = btn.textContent; btn.disabled = true; btn.textContent = '保存中…';
  try { await fn(); } finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = label; } }
}

// ---------- 名前 ----------
function askName(then) {
  const s = openSheet(`
    <h3>あなたの名前</h3>
    <p style="margin:0;font-size:.88rem;color:var(--muted)">誰が変えたか履歴に残すために使うよ。この端末では次から聞かない。</p>
    <div class="field"><label for="nm">名前</label><input id="nm" maxlength="20" value="${esc(editor)}" placeholder="例：えりな"></div>
    <p class="err" id="nmErr" hidden></p>
    <div class="sheet-actions"><button class="btn" type="button" id="nmCancel">やめる</button><button class="btn btn-primary" type="button" id="nmOk">決定</button></div>`);
  const ok = () => {
    const v = $('#nm', s).value.trim();
    if (!v) { const e = $('#nmErr', s); e.textContent = '名前を入れてね'; e.hidden = false; return; }
    editor = v; store.set('uoyan_editor', v); closeSheet(); then();
  };
  $('#nmOk', s).onclick = ok;
  $('#nm', s).addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  $('#nmCancel', s).onclick = closeSheet;
}

// ---------- メニューの追加・編集 ----------
function menuForm(m, presetCat) {
  const isNew = !m;
  m = m || { category: presetCat || '', name: '', tags: [], steps: [], plating: '', memo: '' };
  let version = m.version;
  const sec = isNew || !m.category ? section : sectionOf(m.category);
  const L = LABELS[sec];
  const names = S.categories.filter((c) => (c.section === 'shop' ? 'shop' : 'cook') === sec).map((c) => c.name);
  const known = names.includes(m.category);
  const s = openSheet(`
    <h3>${isNew ? L.item + 'を追加' : '「' + esc(m.name) + '」を編集'}</h3>
    <div class="warnbox" id="conflict" hidden></div>
    <div class="field"><label for="fCat">カテゴリ</label>
      <select id="fCat">${names.map((n) => `<option${n === m.category ? ' selected' : ''}>${esc(n)}</option>`).join('')}
      <option value="__new"${known ? '' : ' selected'}>＋ 新しいカテゴリ</option></select>
      <input id="fCatNew" maxlength="30" placeholder="新しいカテゴリ名（${L.catPh}）" value="${known ? '' : esc(m.category)}"${known ? ' hidden' : ''}></div>
    <div class="field"><label for="fName">${L.name}</label><input id="fName" maxlength="60" value="${esc(m.name)}" placeholder="${L.namePh}"></div>
    <div class="field"><label for="fTags">${L.tags}</label>
      <textarea id="fTags" rows="2" placeholder="${L.tagsPh}">${esc((m.tags || []).join('\n'))}</textarea>
      <span class="hint">${L.tagsHint}</span></div>
    <div class="field"><label for="fSteps">手順</label>
      <textarea id="fSteps" rows="6" placeholder="1行に1つずつ書いてね">${esc((m.steps || []).join('\n'))}</textarea>
      <span class="hint">1行が1つの手順になる（番号は自動でつく）</span></div>
    <div class="field"><label for="fPlating">${L.plating}</label><textarea id="fPlating" rows="2" placeholder="${L.platingPh}">${esc(m.plating)}</textarea></div>
    <div class="field"><label for="fMemo">メモ</label><textarea id="fMemo" rows="2" placeholder="例：小さいときは6分">${esc(m.memo)}</textarea></div>
    <p class="err" id="fErr" hidden></p>
    <div class="sheet-actions"><button class="btn" type="button" id="fCancel">やめる</button><button class="btn btn-accent" type="button" id="fSave">${isNew ? '追加する' : '保存する'}</button></div>`);
  const sel = $('#fCat', s), catNew = $('#fCatNew', s);
  sel.onchange = () => { catNew.hidden = sel.value !== '__new'; if (!catNew.hidden) catNew.focus(); };
  $('#fCancel', s).onclick = closeSheet;
  $('#fSave', s).onclick = (e) => busy(e.currentTarget, async () => {
    const menu = {
      category: sel.value === '__new' ? catNew.value : sel.value,
      name: $('#fName', s).value, tags: $('#fTags', s).value, steps: $('#fSteps', s).value,
      plating: $('#fPlating', s).value, memo: $('#fMemo', s).value, section: sec,
    };
    const err = $('#fErr', s); err.hidden = true;
    try {
      const r = isNew
        ? await api('menu', { action: 'create', editor, menu })
        : await api('menu', { action: 'update', editor, id: m.id, version, menu });
      openIds.add(r.menu.id);
      closeSheet();
      toast(isNew ? '「' + r.menu.name + '」を追加したよ' : '保存したよ');
      cat = cat === 'すべて' ? cat : r.menu.category;
      await load();
    } catch (e) {
      if (e.code === 'conflict') {
        // 誰かが先に保存した。自分の入力は残したまま、相手の内容を見せる。もう一度押すと自分の内容で保存する
        const cur = e.body.menu; version = cur.version;
        const box = $('#conflict', s);
        box.innerHTML = `<b>${esc(cur.updated_by)}さんが先に変更したよ（${fmtTime(cur.updated_at)}）</b>
          <span>いまの内容：</span><ol>${cur.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
          <span>確認して、自分の内容で上書きしていいなら、もう一度「保存する」を押してね。</span>`;
        box.hidden = false; box.scrollIntoView({ block: 'nearest' });
        load();
      } else if (e.code === 'deleted') {
        err.textContent = '他の人がゴミ箱に入れたよ。ゴミ箱から戻してから編集してね'; err.hidden = false; load();
      } else { err.textContent = errText(e); err.hidden = false; }
    }
  });
}

// ---------- ゴミ箱 ----------
function confirmDelete(m) {
  const s = openSheet(`
    <h3>「${esc(m.name)}」をゴミ箱に入れる？</h3>
    <p style="margin:0;font-size:.9rem">ゴミ箱に入れても、いちばん下の「ゴミ箱」からいつでも戻せるよ。</p>
    <p class="err" id="dErr" hidden></p>
    <div class="sheet-actions"><button class="btn" type="button" id="dNo">やめる</button><button class="btn btn-danger" type="button" id="dYes">ゴミ箱に入れる</button></div>`);
  $('#dNo', s).onclick = closeSheet;
  $('#dYes', s).onclick = (e) => busy(e.currentTarget, async () => {
    try { await api('menu', { action: 'delete', editor, id: m.id }); closeSheet(); toast('ゴミ箱に入れたよ'); await load(); }
    catch (er) { const x = $('#dErr', s); x.textContent = errText(er); x.hidden = false; }
  });
}

// ---------- 履歴 ----------
const ACTION_LABEL = { create: '追加', update: '編集', delete: 'ゴミ箱へ', restore: 'ゴミ箱から戻す', revert: '履歴から戻す' };
const ACTION_VERB = { create: 'を追加', update: 'を編集', delete: 'をゴミ箱に入れた', restore: 'をゴミ箱から戻した', revert: 'を前の状態に戻した' };
const FIELD_LABEL = { title: 'タイトル', body: '内容', name: 'メニュー名', category: 'カテゴリ', tags: '時間タグ', steps: '手順', plating: '盛り付け', memo: 'メモ', note_title: '見出し', note_steps: '共通メモ' };
const FIELDS = { menu: ['name', 'category', 'tags', 'steps', 'plating', 'memo'], category: ['note_title', 'note_steps'], notice: ['title', 'body'] };

// 1つ前の状態(prev)と比べて、何が変わったかを「－ 消した行」「＋ 足した行」で見せる
function priceDiffHtml(h) {
  if (h.action === 'create' || !h.prev) return '';
  const A = new Map(DrinkMenu.flatten(h.prev.data).map((x) => [x.key, x.price]));
  const B = new Map(DrinkMenu.flatten(h.snapshot.data).map((x) => [x.key, x.price]));
  const yen = (v) => (v == null ? '' : ' ' + v + '円');
  const out = [];
  if ((h.prev.data.theme || 'chochin') !== (h.snapshot.data.theme || 'chochin')) out.push(`<div class="diff-line diff-chg">デザイン：${esc(themeName(h.prev.data.theme))} → <b>${esc(themeName(h.snapshot.data.theme))}</b></div>`);
  for (const [k, v] of B) {
    if (!A.has(k)) out.push(`<div class="diff-line diff-add">${esc(k + yen(v))}</div>`);
    else if (A.get(k) !== v) out.push(`<div class="diff-line diff-chg">${esc(k)}：${A.get(k) ?? '（なし）'}円 → <b>${v ?? '（なし）'}円</b></div>`);
  }
  for (const [k, v] of A) if (!B.has(k)) out.push(`<div class="diff-line diff-del">${esc(k + yen(v))}</div>`);
  return out.length ? `<div class="diff">${out.join('')}</div>` : '<div class="diff" style="color:var(--muted)">中身の変更はなし</div>';
}

function diffHtml(h) {
  if (h.target === 'pricelist') return priceDiffHtml(h);
  if (h.action === 'delete' || h.action === 'restore') return '';
  const prev = h.action === 'create' ? {} : h.prev;
  if (!prev) return '';
  const del = (x) => `<div class="diff-line diff-del">${esc(x)}</div>`;
  const add = (x) => `<div class="diff-line diff-add">${esc(x)}</div>`;
  const out = [];
  for (const f of FIELDS[h.target]) {
    let a = prev[f], b = h.snapshot[f];
    if (f === 'body') { a = String(a || '').split('\n').filter(Boolean); b = String(b || '').split('\n').filter(Boolean); }
    let lines = '';
    if (Array.isArray(a) || Array.isArray(b)) {
      const A = a || [], B = b || [];
      if (JSON.stringify(A) === JSON.stringify(B)) continue;
      lines = A.filter((x) => !B.includes(x)).map(del).join('') + B.filter((x) => !A.includes(x)).map(add).join('');
      if (!lines) lines = '<div class="diff-line">順番を入れ替えた</div>';
    } else {
      if ((a || '') === (b || '')) continue;
      lines = (a ? del(a) : '') + (b ? add(b) : '');
    }
    out.push(`<div class="diff-field"><span>${FIELD_LABEL[f]}</span>${lines}</div>`);
  }
  return out.length ? `<div class="diff">${out.join('')}</div>` : '<div class="diff" style="color:var(--muted)">中身の変更はなし</div>';
}

// ある時点の中身（全部）
function snapHtml(kind, sn) {
  if (kind === 'pricelist') return DrinkMenu.flatten(sn.data).filter((x) => x.price != null).map((x) => `<div>${esc(x.key)}：${x.price}円</div>`).join('');
  if (kind === 'notice') return `<b>${esc(sn.title)}</b>${sn.body ? `<div style="white-space:pre-wrap">${esc(sn.body)}</div>` : ''}`;
  const steps = (kind === 'menu' ? sn.steps : sn.note_steps) || [];
  return kind === 'menu'
    ? `<b>${esc(sn.name)}</b>${sn.tags && sn.tags.length ? `<div class="chips">${sn.tags.map((t) => `<span class="chip ${tagClass(t)}">${esc(t)}</span>`).join('')}</div>` : ''}
       ${steps.length ? `<ol>${steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
       ${sn.plating ? `<div>盛り付け：${esc(sn.plating)}</div>` : ''}${sn.memo ? `<div>メモ：${esc(sn.memo)}</div>` : ''}`
    : `<b>${esc(sn.note_title || '（見出しなし）')}</b>${steps.length ? `<ol>${steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '<div>（共通メモなし）</div>'}`;
}

// 全部のメニューの最近の変更（誰でも見られる）
async function showFeed() {
  const s = openSheet(`<h3>変更履歴</h3>
    <p style="margin:0;font-size:.85rem;color:var(--muted)">最近の変更100件。「－」が消した行、「＋」が足した行。</p>
    <div class="hist" id="feed"><p class="loading">読み込み中…</p></div>
    <div class="sheet-actions"><button class="btn" type="button" id="fdClose">閉じる</button></div>`);
  $('#fdClose', s).onclick = closeSheet;
  let list;
  try { list = (await api('history')).history; }
  catch (e) { $('#feed', s).innerHTML = `<p class="err">${esc(errText(e))}</p>`; return; }
  if (!list.length) { $('#feed', s).innerHTML = '<p style="color:var(--muted)">まだ誰も変更していないよ</p>'; return; }
  $('#feed', s).innerHTML = list.map((h) => {
    const sn = h.snapshot;
    const isMenu = h.target === 'menu';
    const title = isMenu ? `「${esc(sn.name)}」${ACTION_VERB[h.action] || ''}<small>${esc(sn.category)}</small>`
      : h.target === 'notice' ? `お知らせ「${esc(sn.title)}」${ACTION_VERB[h.action] || ''}`
      : h.target === 'pricelist' ? `${esc((sn.data && sn.data.title) || 'メニュー表')}${h.action === 'update' ? 'の値段・品名を変更' : ACTION_VERB[h.action] || ''}`
      : `「${esc(sn.name)}」の共通メモ${ACTION_VERB[h.action] || ''}`;
    const alive = isMenu ? S.menus.some((m) => m.id === h.target_id)
      : h.target === 'notice' ? S.notices.some((n) => n.id === h.target_id) : true;
    return `<div class="hist-item">
      <div class="hist-top"><b>${esc(h.editor)}さん</b><span>${fmtTime(h.created_at)}</span></div>
      <div class="feed-title">${title}</div>
      ${diffHtml(h)}
      ${alive ? `<button class="linkbtn" type="button" data-jump="${esc(h.target)}" data-id="${esc(h.target_id)}">${isMenu ? 'これを見る' : h.target === 'notice' ? 'このお知らせを見る' : h.target === 'pricelist' ? 'メニュー表を見る' : 'このカテゴリを見る'}</button>` : ''}
    </div>`;
  }).join('');
  $('#feed', s).addEventListener('click', (e) => {
    const b = e.target.closest('[data-jump]'); if (!b) return;
    closeSheet(); jumpTo(b.dataset.jump, b.dataset.id);
  });
}

function jumpTo(kind, id) {
  q.value = '';
  if (kind === 'pricelist') { section = 'menu'; render(); window.scrollTo(0, 0); return; }
  if (kind === 'notice') {
    const n = S.notices.find((x) => x.id === id); if (!n) return;
    if (!isActive(n)) { render(); pastNotices(); return; }
    render(); const el = document.querySelector(`[data-notice="${CSS.escape(id)}"]`); if (el) el.scrollIntoView({ block: 'center' });
  } else if (kind === 'menu') {
    const m = S.menus.find((x) => x.id === id); if (!m) return;
    section = sectionOf(m.category); cat = m.category; openIds.add(id); render();
    const el = main.querySelector(`details.card[data-id="${CSS.escape(id)}"]`);
    if (el) el.scrollIntoView({ block: 'center' });
  } else { section = sectionOf(id); cat = id; render(); window.scrollTo(0, 0); }
}

// 1つのメニュー（または共通メモ）の履歴。編集モードなら「この状態に戻す」ができる
async function showHistory(kind, id, title) {
  const s = openSheet(`<h3>「${esc(title)}」の履歴</h3><div class="hist" id="hist"><p class="loading">読み込み中…</p></div>
    <div class="sheet-actions"><button class="btn" type="button" id="hClose">閉じる</button></div>`);
  $('#hClose', s).onclick = closeSheet;
  let list;
  try { list = (await api('history?target=' + kind + '&id=' + encodeURIComponent(id))).history; }
  catch (e) { $('#hist', s).innerHTML = `<p class="err">${esc(errText(e))}</p>`; return; }
  if (!list.length) { $('#hist', s).innerHTML = '<p style="color:var(--muted)">まだ履歴がないよ</p>'; return; }
  $('#hist', s).innerHTML = list.map((h, i) => {
    const first = h.editor === '初期データ';
    const label = first ? '最初の状態' : ACTION_LABEL[h.action] || h.action;
    return `<div class="hist-item">
      <div class="hist-top"><b>${esc(first ? '' : h.editor + 'さん：')}${esc(label)}${i === 0 ? '<span class="badge">いまの状態</span>' : ''}</b><span>${fmtTime(h.created_at)}</span></div>
      ${first ? '' : diffHtml(h)}
      <details><summary>この時点の中身を全部見る</summary><div class="snap">${snapHtml(kind, h.snapshot)}</div></details>
      ${i === 0 || !editing ? '' : `<div><button class="btn btn-small" type="button" data-revert="${h.id}">この状態に戻す</button></div>`}
    </div>`;
  }).join('');
  $('#hist', s).addEventListener('click', (e) => {
    const b = e.target.closest('[data-revert]'); if (!b) return;
    busy(b, async () => {
      try {
        await api(kind, { action: 'revert', editor, history_id: Number(b.dataset.revert) });
        closeSheet(); toast('元に戻したよ'); await load();
      } catch (er) { toast(errText(er)); }
    });
  });
}

// ---------- カテゴリの共通メモ ----------
function noteForm(c) {
  let version = c.version;
  const s = openSheet(`
    <h3>「${esc(c.name)}」の共通メモ</h3>
    <div class="warnbox" id="nConflict" hidden></div>
    <div class="field"><label for="nTitle">見出し</label><input id="nTitle" maxlength="40" value="${esc(c.note_title)}" placeholder="例：${esc(c.name)}共通"></div>
    <div class="field"><label for="nSteps">内容</label><textarea id="nSteps" rows="6" placeholder="1行に1つずつ">${esc((c.note_steps || []).join('\n'))}</textarea>
      <span class="hint">このカテゴリのいちばん上に出るよ。全部消すと共通メモは表示されなくなる</span></div>
    <p class="err" id="nErr" hidden></p>
    <div class="sheet-actions"><button class="btn" type="button" id="nCancel">やめる</button><button class="btn btn-accent" type="button" id="nSave">保存する</button></div>`);
  $('#nCancel', s).onclick = closeSheet;
  $('#nSave', s).onclick = (e) => busy(e.currentTarget, async () => {
    const err = $('#nErr', s); err.hidden = true;
    try {
      await api('category', { action: 'update', editor, name: c.name, version, note_title: $('#nTitle', s).value, note_steps: $('#nSteps', s).value });
      closeSheet(); toast('保存したよ'); await load();
    } catch (er) {
      if (er.code === 'conflict') {
        const cur = er.body.category; version = cur.version;
        const box = $('#nConflict', s);
        box.innerHTML = `<b>他の人が先に変更したよ</b><span>いまの内容：</span><ol>${cur.note_steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol><span>自分の内容で上書きしていいなら、もう一度「保存する」を押してね。</span>`;
        box.hidden = false; load();
      } else { err.textContent = errText(er); err.hidden = false; }
    }
  });
}

// ---------- 操作の受け付け ----------
const findMenu = (id) => S.menus.find((m) => m.id === id) || S.trash.find((m) => m.id === id);
const findCat = (n) => categoriesInOrder().find((c) => c.name === n);

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) { cat = t.dataset.tab; render(); return; }
  const sb = e.target.closest('[data-section]');
  if (sb) { section = sb.dataset.section; store.set('uoyan_section', section); cat = 'すべて'; render(); window.scrollTo(0, 0); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'edit-on') { if (editor) { editing = true; render(); } else askName(() => { editing = true; render(); toast('編集モードにしたよ'); }); return; }
  if (act === 'edit-off') { editing = false; render(); return; }
  if (act === 'rename') { askName(render); return; }
  if (act === 'feed') { showFeed(); return; }
  if (act === 'notice-add') { withName(() => noticeForm()); return; }
  if (act === 'notice-past') { pastNotices(); return; }
  if (act === 'price-edit') { const pl = drink(); if (pl) withName(() => priceForm(pl)); return; }
  if (act === 'design') { const pl = drink(); if (pl) designPicker(pl); return; }
  if (act === 'price-history') { showHistory('pricelist', 'drink', 'ドリンクメニュー表'); return; }
  if (act.startsWith('notice-')) {
    const n = S.notices.find((x) => x.id === b.dataset.id) || (S.noticeTrash || []).find((x) => x.id === b.dataset.id); if (!n) return;
    if (act === 'notice-edit') noticeForm(n);
    else if (act === 'notice-delete') confirmDeleteNotice(n);
    else if (act === 'notice-history') showHistory('notice', n.id, n.title);
    else if (act === 'notice-restore') busy(b, async () => {
      try { await api('notice', { action: 'restore', editor, id: n.id }); toast('お知らせを戻したよ'); await load(); }
      catch (er) { toast(errText(er)); }
    });
    return;
  }
  if (act === 'add') { menuForm(null, b.dataset.cat); return; }
  if (act === 'note') { menuOrNote(b.dataset.cat); return; }
  if (act === 'note-history') { showHistory('category', b.dataset.cat, b.dataset.cat + 'の共通メモ'); return; }
  const m = findMenu(b.dataset.id); if (!m) return;
  if (act === 'edit') menuForm(m);
  else if (act === 'delete') confirmDelete(m);
  else if (act === 'history') showHistory('menu', m.id, m.name);
  else if (act === 'restore') busy(b, async () => {
    try { await api('menu', { action: 'restore', editor, id: m.id }); openIds.add(m.id); toast('「' + m.name + '」を戻したよ'); await load(); }
    catch (er) { toast(errText(er)); }
  });
});
function menuOrNote(name) { const c = findCat(name); if (c) noteForm(c); }

// カードの開け閉めを覚えておく
main.addEventListener('toggle', (e) => {
  const d = e.target; if (!d.matches || !d.matches('details.card')) return;
  if (d.open) openIds.add(d.dataset.id); else openIds.delete(d.dataset.id);
}, true);

q.addEventListener('input', render);
// 画面に戻ってきたら最新を読み直す（入力画面を開いている間は読み直さない）
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !sheetEl) load(); });

if (S.menus.length) render();
load();
