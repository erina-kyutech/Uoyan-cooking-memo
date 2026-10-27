'use strict';
// ドリンクメニュー表を、データ（品名と値段）から組み立てる。
// 画面の大きさは 1000×1414px（A4縦の比率）で作って、表示するときに縮める。
// 値段は税抜きで持ち、税込（10%）はここで計算する。
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tax = (p) => Math.floor((p * 110) / 100);

  // 値段の表示。each=true なら「各」をつける
  function price(p, { each = false, size = 'm', color = 'red', plus = false } = {}) {
    if (p === undefined || p === null) return '';
    return `<div class="pr pr-${size} pr-${color}"><span class="pn">${each ? '<i>各</i>' : ''}${plus ? '＋' : ''}${p}<small>円</small></span><span class="tx">（税込${tax(p)}円）</span></div>`;
  }

  // 提灯の見出し
  // 文字が多いときは小さくして、提灯の中に収める
  const lantern = (title, h) => {
    const len = [...String(title || '')].length || 1;
    const fs = Math.min(40, Math.floor((h - 34) / len));
    return `<div class="lantern" style="height:${h}px;--fs:${fs}px"><span>${esc(title)}</span></div>`;
  };

  // ---- 写真のかわりの、ブランドなしのイラスト ----
  function glass(fill, w = 46, h = 92, ice = true) {
    return `<svg class="ill" width="${w}" height="${h}" viewBox="0 0 46 92" aria-hidden="true">
      <path d="M4 6 L42 6 L39 86 Q39 90 35 90 L11 90 Q7 90 7 86 Z" fill="rgba(255,255,255,.55)" stroke="rgba(120,90,40,.45)" stroke-width="1.5"/>
      <path d="M6.5 22 L39.5 22 L38 84 Q38 87 35 87 L11 87 Q8 87 8 84 Z" fill="${fill}"/>
      ${ice ? '<rect x="11" y="26" width="12" height="11" rx="2" fill="rgba(255,255,255,.55)" transform="rotate(-8 17 31)"/><rect x="24" y="40" width="12" height="11" rx="2" fill="rgba(255,255,255,.5)" transform="rotate(10 30 45)"/><rect x="12" y="55" width="11" height="10" rx="2" fill="rgba(255,255,255,.45)"/>' : ''}
      <circle cx="30" cy="66" r="1.6" fill="rgba(255,255,255,.7)"/><circle cx="20" cy="74" r="1.3" fill="rgba(255,255,255,.7)"/><circle cx="33" cy="30" r="1.2" fill="rgba(255,255,255,.7)"/>
      <path d="M9 10 L10 82" stroke="rgba(255,255,255,.7)" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  }
  function bottle(body, label, w = 34, h = 120) {
    return `<svg class="ill" width="${w}" height="${h}" viewBox="0 0 34 120" aria-hidden="true">
      <rect x="13" y="2" width="8" height="8" rx="1.5" fill="#c9a24a"/>
      <path d="M13 10 L21 10 L21 34 Q31 42 31 54 L31 112 Q31 117 26 117 L8 117 Q3 117 3 112 L3 54 Q3 42 13 34 Z" fill="${body}"/>
      <rect x="3" y="62" width="28" height="34" fill="${label}"/>
      <rect x="3" y="62" width="28" height="4" fill="rgba(0,0,0,.18)"/>
      <path d="M8 48 L8 108" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-linecap="round"/></svg>`;
  }
  function mug(w = 74, h = 86) {
    return `<svg class="ill" width="${w}" height="${h}" viewBox="0 0 74 86" aria-hidden="true">
      <path d="M58 28 Q72 28 72 44 Q72 60 58 60" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="6"/>
      <rect x="4" y="16" width="54" height="66" rx="6" fill="#f2b632" stroke="rgba(255,255,255,.85)" stroke-width="3"/>
      <path d="M4 22 Q10 6 22 12 Q30 2 40 10 Q52 4 58 20 L58 28 L4 28 Z" fill="#fffaf0"/>
      <path d="M12 34 L12 74" stroke="rgba(255,255,255,.55)" stroke-width="4" stroke-linecap="round"/></svg>`;
  }
  function wine(fill, w = 34, h = 84) {
    return `<svg class="ill" width="${w}" height="${h}" viewBox="0 0 34 84" aria-hidden="true">
      <path d="M3 4 L31 4 Q33 34 17 42 Q1 34 3 4 Z" fill="rgba(255,255,255,.55)" stroke="rgba(90,70,40,.5)" stroke-width="1.3"/>
      <path d="M4 20 L30 20 Q29 36 17 40 Q5 36 4 20 Z" fill="${fill}"/>
      <rect x="16" y="42" width="2.4" height="32" fill="rgba(90,70,40,.5)"/><ellipse cx="17" cy="78" rx="12" ry="3.5" fill="rgba(90,70,40,.45)"/></svg>`;
  }
  function tumbler(fill, w = 56, h = 64) {
    return `<svg class="ill" width="${w}" height="${h}" viewBox="0 0 56 64" aria-hidden="true">
      <path d="M3 4 L53 4 L49 58 Q49 61 45 61 L11 61 Q7 61 7 58 Z" fill="rgba(255,255,255,.5)" stroke="rgba(120,90,40,.45)" stroke-width="1.4"/>
      <path d="M5 18 L51 18 L48.5 57 Q48 59 45 59 L11 59 Q8 59 7.5 57 Z" fill="${fill}"/>
      <rect x="12" y="20" width="14" height="13" rx="2" fill="rgba(255,255,255,.5)" transform="rotate(-10 19 26)"/><rect x="28" y="24" width="14" height="13" rx="2" fill="rgba(255,255,255,.45)" transform="rotate(12 35 30)"/></svg>`;
  }
  const HB_COLORS = ['#e9b54a', '#5a2a16', '#e0a63c', '#efb349'];

  // ---- 部品 ----
  const blockOf = (d, key) => (d.blocks || []).find((b) => b.key === key) || { title: '', groups: [] };
  const grp = (b, i) => (b.groups && b.groups[i]) || { label: '', items: [] };
  const names = (g) => (g.items || []).map((i) => i.name);
  // グループの「各○円」。無ければ品の値段がみんな同じならそれ
  const groupPrice = (g, b) => g.price ?? b.price ?? (g.items && g.items.length && g.items.every((i) => i.price === g.items[0].price) ? g.items[0].price : undefined);

  function render(d) {
    const sour = blockOf(d, 'sour'), hb = blockOf(d, 'highball'), beer = blockOf(d, 'beer');
    const wineB = blockOf(d, 'wine'), sho = blockOf(d, 'shochu'), soft = blockOf(d, 'soft'), ume = blockOf(d, 'umeshu');

    // サワー
    const sRec = grp(sour, 0), sAll = grp(sour, 1), sBig = grp(sour, 2);
    const bigItem = (sBig.items || [])[0];
    const sourHtml = `<div class="sour">
      ${lantern(sour.title, 210)}
      <div class="sour-rec"><b class="rec-label">${esc(sRec.label)}</b><span class="ume-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <ul class="dots">${names(sRec).map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>
      <hr class="rule">
      <ul class="plain">${names(sAll).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      ${bigItem ? `<div class="pill"><span>${esc(bigItem.name)}</span><span class="pill-pr">＋${bigItem.price ?? ''}円</span><span class="pill-tx">（税込${bigItem.price != null ? tax(bigItem.price) : ''}円）</span></div>` : ''}
      <div class="sour-price">${price(sour.price ?? groupPrice(sAll, sour), { each: true, size: 'xl' })}</div>
      <p class="caution">${esc(d.caution)}</p>
    </div>`;

    // ハイボール
    const hbA = grp(hb, 0), hbP = grp(hb, 1);
    const hbHtml = `<div class="hb">
      <div class="hb-cols">${(hbA.items || []).map((it, i) => `<div class="hb-col">
          <div class="vname">${esc(it.name)}</div>
          <div class="hb-ill">${i === 0 ? bottle('#c98a2c', '#f1e4c4', 18, 72) : ''}${glass(HB_COLORS[i % 4], 37, 74)}</div>
          ${price(it.price ?? hbA.price ?? hb.price, { size: 's' })}</div>`).join('')}</div>
      <div class="hb-premium"><b class="br-label">【${esc(hbP.label)}】</b>
        ${(hbP.items || []).map((it) => `<div class="hb-p">${bottle('#b9792a', '#ece0c6', 24, 90)}<div><div class="hb-pn">${esc(it.name)}</div>${price(it.price ?? hbP.price, { size: 'm' })}</div></div>`).join('')}
      </div>
      ${lantern(hb.title, 300)}
    </div>`;

    // ビール
    const bBot = grp(beer, 0), bDraft = grp(beer, 1), bNon = grp(beer, 2);
    const nonItem = (bNon.items || [])[0] || {};
    const beerHtml = `<div class="beer">
      <div class="beer-col"><b class="br-label">【${esc(bBot.label)}】</b>
        <ul class="beer-list">${names(bBot).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        <div class="beer-ill">${bottle('#6b3d12', '#2b2116', 36, 118)}${bottle('#7a5a2a', '#d9d6cf', 36, 118)}${bottle('#704213', '#e8c98a', 36, 118)}</div>
        ${price(groupPrice(bBot, beer), { each: true, color: 'white' })}</div>
      <div class="beer-col beer-draft"><div class="draft-name">${esc(bDraft.label)}</div>
        ${(bDraft.items || []).map((it, i) => `${i ? '<div class="dash"></div>' : ''}<div class="draft-item"><div>${esc(it.name)}</div>${price(it.price, { color: 'white' })}</div>`).join('')}
        <div class="draft-ill">${mug(58, 68)}</div></div>
      <div class="beer-col beer-non"><div class="non-label">${esc(bNon.label)}</div>${bNon.note ? `<div class="non-note">${esc(bNon.note)}</div>` : ''}
        <div class="non-name">${esc(nonItem.name)}</div>
        <div class="non-row">${bNon.note ? `<div class="non-pop">${esc(bNon.note)}</div>` : ''}<div class="non-ill">${bottle('#c08a36', '#eef2f6', 36, 120)}${mug(66, 78)}</div></div>
        ${price(nonItem.price ?? bNon.price, { color: 'white' })}</div>
      ${lantern(beer.title, 270)}
    </div>`;

    // ワイン・焼酎
    const wG = grp(wineB, 0);
    const shoGroups = sho.groups || [];
    const normal = shoGroups.filter((g) => !/プレミアム/.test(g.label));
    const prem = shoGroups.filter((g) => /プレミアム/.test(g.label));
    const midHtml = `<div class="mid">
      <div class="wine">${lantern(wineB.title, 200)}
        <div class="wine-text">${names(wG).map((n) => `<div>${esc(n)}</div>`).join('')}${wG.note ? `<div>${esc(wG.note)}</div>` : ''}</div>
        <div class="wine-ill">${wine('#f3e9a8')}${wine('#6d1420')}</div>
        <div class="wine-price">${price(wineB.price ?? groupPrice(wG, wineB), { each: (wG.items || []).length > 0, size: 'm' })}</div></div>
      <div class="sho">
        ${normal.map((g, i) => `<div class="sho-col${(g.items || []).length === 1 ? ' sho-one' : ''}"><b class="br-label">【${esc(g.label)}】</b>
          ${(g.items || []).length === 1 ? `<div class="vname big">${esc(g.items[0].name)}</div><div class="sho-ill">${bottle('#f4f1ea', '#f4f1ea', 34, 116)}</div>`
            : `<ul class="sho-list">${names(g).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`}
          <div class="sho-price">${price(groupPrice(g, sho), { each: (g.items || []).length > 1, size: 'm' })}</div></div>`).join('')}
        ${prem.map((g) => `<div class="sho-prem"><b class="br-label">【${esc(g.label)}】</b>
          <ul class="sho-list">${names(g).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
          <div class="sho-ill">${bottle('#2a1e14', '#3b2a1c', 36, 124)}${bottle('#2c1d12', '#6a1f14', 36, 124)}</div>
          ${price(groupPrice(g, sho), { each: (g.items || []).length > 1, size: 'm' })}</div>`).join('')}
        ${sho.note ? `<p class="sho-note">${esc(sho.note)}</p>` : ''}
      </div>
      ${lantern(sho.title, 200)}
    </div>`;

    // ソフトドリンク・梅酒
    const sG = grp(soft, 0), uG = grp(ume, 0);
    const botHtml = `<div class="bot">
      <div class="soft-ill">${tumbler('#e7a43a', 70, 80)}${tumbler('#f4f0e6', 64, 74)}${tumbler('#4a2312', 58, 90)}${tumbler('#efc26a', 62, 70)}</div>
      <ul class="soft-list">${names(sG).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
      <div class="soft-price">${price(soft.price ?? groupPrice(sG, soft), { each: true, size: 'm' })}</div>
      ${lantern(soft.title, 250)}
      <div class="ume"><ul class="ume-list">${names(uG).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
        <div class="ume-price">${price(ume.price ?? groupPrice(uG, ume), { each: true, size: 'm' })}</div></div>
      <div class="ume-ill">${tumbler('#d9963a', 58, 66)}${tumbler('#6e1d1a', 54, 62)}</div>
      ${lantern(ume.title, 230)}
    </div>`;

    return `<div class="dm">
      <div class="top">${sourHtml}<div class="top-r">${hbHtml}${beerHtml}</div></div>
      <div class="line"></div>${midHtml}<div class="line"></div>${botHtml}
    </div>`;
  }

  // 何が変わったか比べる用: 「サワー／プレーン」→ 値段 のような平らな一覧にする
  function flatten(d) {
    const out = [];
    for (const b of (d && d.blocks) || []) {
      if (b.price != null) out.push({ key: b.title + '（各）', price: b.price });
      for (const g of b.groups || []) {
        const gl = g.label ? b.title + '／' + g.label : b.title;
        if (g.price != null) out.push({ key: gl + '（各）', price: g.price });
        for (const i of g.items || []) out.push({ key: gl + '／' + i.name, price: i.price });
      }
    }
    return out;
  }

  window.DrinkMenu = { render, tax, flatten };
})();
