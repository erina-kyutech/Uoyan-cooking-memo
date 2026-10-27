'use strict';
// メニュー表のイラスト（ブランドなし）。お酒ごとに小さな「場面」を SVG で描く。
// 色は図形の fill に書いてあるので、デザインごとに CSS で上書きできる（手書き＝線画、黒板＝チョーク風）。
(function () {
  const ice = (x, y, s, r = 0) => `<rect class="i-ice" x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.18}" fill="#ffffff" fill-opacity=".55" transform="rotate(${r} ${x + s / 2} ${y + s / 2})"/>`;

  // 輪切り（レモン・オレンジ・グレープフルーツ）
  function slice(cx, cy, r, rind, flesh, pith = '#fff8dc') {
    let seg = '';
    for (let i = 0; i < 8; i++) {
      const a1 = (i / 8) * Math.PI * 2 + 0.06, a2 = ((i + 1) / 8) * Math.PI * 2 - 0.06, ri = r * 0.74, rc = r * 0.12;
      seg += `<path d="M${cx + rc * Math.cos((a1 + a2) / 2)} ${cy + rc * Math.sin((a1 + a2) / 2)} L${cx + ri * Math.cos(a1)} ${cy + ri * Math.sin(a1)} A${ri} ${ri} 0 0 1 ${cx + ri * Math.cos(a2)} ${cy + ri * Math.sin(a2)} Z" fill="${flesh}"/>`;
    }
    return `<g class="i-slice"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${rind}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.86}" fill="${pith}"/>${seg}</g>`;
  }
  const lemon = (cx, cy, r) => slice(cx, cy, r, '#f2c12e', '#f9df63');
  const orange = (cx, cy, r) => slice(cx, cy, r, '#ee8a1c', '#f8b24a');
  const grapefruit = (cx, cy, r) => slice(cx, cy, r, '#f08a5a', '#f7a08a');

  // 梅の実
  const ume = (cx, cy, r, c = '#a7c957') => `<g class="i-ume"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>
    <path d="M${cx} ${cy - r * 0.95} Q${cx - r * 0.25} ${cy} ${cx} ${cy + r * 0.9}" fill="none" stroke="#6a8f2f" stroke-width="${r * 0.08}" stroke-opacity=".6"/>
    <ellipse cx="${cx - r * 0.38}" cy="${cy - r * 0.35}" rx="${r * 0.22}" ry="${r * 0.14}" fill="#fff" fill-opacity=".55"/>
    <path d="M${cx} ${cy - r} q${r * 0.1} ${-r * 0.35} ${r * 0.35} ${-r * 0.45}" fill="none" stroke="#6b4a2a" stroke-width="${r * 0.12}"/></g>`;
  const leaf = (x, y, s, rot = 0) => `<path class="i-leaf" d="M${x} ${y} q${s * 0.5} ${-s * 0.45} ${s} 0 q${-s * 0.5} ${s * 0.45} ${-s} 0 Z" fill="#6fa443" transform="rotate(${rot} ${x} ${y})"/>`;

  // ぶどう
  function grapes(cx, cy, s, c = '#6b3a7a') {
    const pts = [[0, 0], [-1, 0], [1, 0], [-0.5, 0.85], [0.5, 0.85], [0, 1.7], [-1.5, -0.1], [1.5, -0.1], [-1, 0.85], [1, 0.85]];
    return `<g class="i-grape"><path d="M${cx} ${cy - s * 1.2} l0 ${s * 0.8}" stroke="#6b4a2a" stroke-width="${s * 0.18}"/>${leaf(cx, cy - s * 0.9, s * 1.6, -25)}
      ${pts.map(([x, y]) => `<circle cx="${cx + x * s * 0.9}" cy="${cy + y * s * 0.9}" r="${s * 0.55}" fill="${c}"/><circle cx="${cx + x * s * 0.9 - s * 0.18}" cy="${cy + y * s * 0.9 - s * 0.18}" r="${s * 0.14}" fill="#fff" fill-opacity=".45"/>`).join('')}</g>`;
  }

  // 背の高いグラス（サワー・ハイボール・ジュース）
  function tall(x, y, w, h, liquid, { lemonIn = false, straw = '', foam = false } = {}) {
    const top = y + h * 0.16;
    return `<g class="i-glass">
      ${straw ? `<path d="M${x + w * 0.62} ${y - h * 0.12} L${x + w * 0.5} ${y + h * 0.7}" stroke="${straw}" stroke-width="${w * 0.08}" stroke-linecap="round"/>` : ''}
      <path class="i-glassbody" d="M${x} ${y} L${x + w} ${y} L${x + w * 0.93} ${y + h - 5} Q${x + w * 0.92} ${y + h} ${x + w * 0.85} ${y + h} L${x + w * 0.15} ${y + h} Q${x + w * 0.08} ${y + h} ${x + w * 0.07} ${y + h - 5} Z" fill="#ffffff" fill-opacity=".45" stroke="#8a7a5a" stroke-opacity=".35" stroke-width="1.5"/>
      <path class="i-liquid" d="M${x + w * 0.035} ${top} L${x + w * 0.965} ${top} L${x + w * 0.9} ${y + h - 6} Q${x + w * 0.89} ${y + h - 3} ${x + w * 0.83} ${y + h - 3} L${x + w * 0.17} ${y + h - 3} Q${x + w * 0.11} ${y + h - 3} ${x + w * 0.1} ${y + h - 6} Z" fill="${liquid}"/>
      ${foam ? `<rect x="${x + w * 0.04}" y="${top - 4}" width="${w * 0.92}" height="${h * 0.08}" rx="3" fill="#fffaf0"/>` : ''}
      ${ice(x + w * 0.14, top + h * 0.04, w * 0.36, -10)}${ice(x + w * 0.5, top + h * 0.14, w * 0.34, 12)}${ice(x + w * 0.2, top + h * 0.38, w * 0.32, 6)}
      ${lemonIn ? `<g clip-path="none">${lemon(x + w * 0.72, top + h * 0.5, w * 0.2)}</g>` : ''}
      <circle cx="${x + w * 0.66}" cy="${y + h * 0.82}" r="${w * 0.035}" fill="#fff" fill-opacity=".8"/><circle cx="${x + w * 0.4}" cy="${y + h * 0.9}" r="${w * 0.028}" fill="#fff" fill-opacity=".8"/>
      <path class="i-hl" d="M${x + w * 0.12} ${y + h * 0.08} L${x + w * 0.17} ${y + h * 0.9}" stroke="#fff" stroke-opacity=".75" stroke-width="${w * 0.06}" stroke-linecap="round"/></g>`;
  }

  // ロックグラス（焼酎・梅酒）
  function rock(x, y, w, h, liquid) {
    return `<g class="i-glass">
      <path class="i-glassbody" d="M${x} ${y} L${x + w} ${y} L${x + w * 0.94} ${y + h} L${x + w * 0.06} ${y + h} Z" fill="#ffffff" fill-opacity=".45" stroke="#8a7a5a" stroke-opacity=".35" stroke-width="1.5"/>
      <path class="i-liquid" d="M${x + w * 0.03} ${y + h * 0.3} L${x + w * 0.97} ${y + h * 0.3} L${x + w * 0.92} ${y + h - 3} L${x + w * 0.08} ${y + h - 3} Z" fill="${liquid}"/>
      ${ice(x + w * 0.12, y + h * 0.12, w * 0.38, -12)}${ice(x + w * 0.48, y + h * 0.2, w * 0.36, 10)}
      <rect x="${x + w * 0.06}" y="${y + h - 5}" width="${w * 0.88}" height="5" fill="#8a7a5a" fill-opacity=".25"/>
      <path class="i-hl" d="M${x + w * 0.1} ${y + h * 0.1} L${x + w * 0.14} ${y + h * 0.85}" stroke="#fff" stroke-opacity=".75" stroke-width="${w * 0.05}" stroke-linecap="round"/></g>`;
  }

  // ジョッキ
  function mug(x, y, w, h) {
    return `<g class="i-mug">
      <path d="M${x + w * 0.78} ${y + h * 0.3} Q${x + w * 1.04} ${y + h * 0.3} ${x + w * 1.02} ${y + h * 0.55} Q${x + w * 1.0} ${y + h * 0.78} ${x + w * 0.78} ${y + h * 0.78}" fill="none" stroke="#d9d2c0" stroke-width="${w * 0.08}"/>
      <rect class="i-glassbody" x="${x}" y="${y + h * 0.14}" width="${w * 0.8}" height="${h * 0.86}" rx="${w * 0.08}" fill="#ffffff" fill-opacity=".5" stroke="#8a7a5a" stroke-opacity=".35" stroke-width="1.5"/>
      <rect class="i-liquid" x="${x + w * 0.04}" y="${y + h * 0.24}" width="${w * 0.72}" height="${h * 0.72}" rx="${w * 0.06}" fill="#f2b632"/>
      <path class="i-foam" d="M${x - w * 0.03} ${y + h * 0.28} Q${x + w * 0.02} ${y + h * 0.02} ${x + w * 0.2} ${y + h * 0.1} Q${x + w * 0.32} ${y - h * 0.04} ${x + w * 0.46} ${y + h * 0.07} Q${x + w * 0.62} ${y - h * 0.02} ${x + w * 0.72} ${y + h * 0.12} Q${x + w * 0.86} ${y + h * 0.12} ${x + w * 0.83} ${y + h * 0.28} Z" fill="#fffaf0"/>
      <circle cx="${x + w * 0.3}" cy="${y + h * 0.6}" r="${w * 0.03}" fill="#fff" fill-opacity=".8"/><circle cx="${x + w * 0.55}" cy="${y + h * 0.75}" r="${w * 0.025}" fill="#fff" fill-opacity=".8"/><circle cx="${x + w * 0.45}" cy="${y + h * 0.45}" r="${w * 0.02}" fill="#fff" fill-opacity=".8"/>
      <path class="i-hl" d="M${x + w * 0.12} ${y + h * 0.32} L${x + w * 0.12} ${y + h * 0.88}" stroke="#fff" stroke-opacity=".6" stroke-width="${w * 0.06}" stroke-linecap="round"/></g>`;
  }

  // 瓶（ラベルは無地）
  function bottle(x, y, w, h, body, label, cap = '#c9a24a') {
    const nk = w * 0.32;
    return `<g class="i-bottle">
      <rect x="${x + (w - nk) / 2}" y="${y}" width="${nk}" height="${h * 0.07}" rx="2" fill="${cap}"/>
      <path class="i-bottlebody" d="M${x + (w - nk) / 2} ${y + h * 0.07} L${x + (w + nk) / 2} ${y + h * 0.07} L${x + (w + nk) / 2} ${y + h * 0.27} Q${x + w} ${y + h * 0.34} ${x + w} ${y + h * 0.45} L${x + w} ${y + h * 0.95} Q${x + w} ${y + h} ${x + w * 0.9} ${y + h} L${x + w * 0.1} ${y + h} Q${x} ${y + h} ${x} ${y + h * 0.95} L${x} ${y + h * 0.45} Q${x} ${y + h * 0.34} ${x + (w - nk) / 2} ${y + h * 0.27} Z" fill="${body}"/>
      <rect class="i-label" x="${x}" y="${y + h * 0.55}" width="${w}" height="${h * 0.26}" fill="${label}"/>
      <rect x="${x + w * 0.18}" y="${y + h * 0.62}" width="${w * 0.64}" height="${h * 0.03}" fill="#000" fill-opacity=".18"/><rect x="${x + w * 0.28}" y="${y + h * 0.69}" width="${w * 0.44}" height="${h * 0.025}" fill="#000" fill-opacity=".14"/>
      <path class="i-hl" d="M${x + w * 0.18} ${y + h * 0.42} L${x + w * 0.18} ${y + h * 0.92}" stroke="#fff" stroke-opacity=".35" stroke-width="${w * 0.1}" stroke-linecap="round"/></g>`;
  }

  // ワイングラス
  function wglass(x, y, w, h, liquid) {
    const bowl = h * 0.5;
    return `<g class="i-glass">
      <path class="i-glassbody" d="M${x} ${y} L${x + w} ${y} Q${x + w * 1.04} ${y + bowl * 0.9} ${x + w / 2} ${y + bowl} Q${x - w * 0.04} ${y + bowl * 0.9} ${x} ${y} Z" fill="#ffffff" fill-opacity=".45" stroke="#8a7a5a" stroke-opacity=".4" stroke-width="1.3"/>
      <path class="i-liquid" d="M${x + w * 0.03} ${y + bowl * 0.42} L${x + w * 0.97} ${y + bowl * 0.42} Q${x + w * 0.96} ${y + bowl * 0.88} ${x + w / 2} ${y + bowl * 0.95} Q${x + w * 0.04} ${y + bowl * 0.88} ${x + w * 0.03} ${y + bowl * 0.42} Z" fill="${liquid}"/>
      <rect x="${x + w * 0.47}" y="${y + bowl}" width="${w * 0.06}" height="${h * 0.42}" fill="#b9ae96"/>
      <ellipse cx="${x + w / 2}" cy="${y + h * 0.95}" rx="${w * 0.36}" ry="${h * 0.04}" fill="#b9ae96"/>
      <path class="i-hl" d="M${x + w * 0.16} ${y + bowl * 0.12} Q${x + w * 0.12} ${y + bowl * 0.5} ${x + w * 0.24} ${y + bowl * 0.72}" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="${w * 0.06}" stroke-linecap="round"/></g>`;
  }

  // お酒ごとの場面。viewBox は 200×150 にそろえる
  const SCENES = {
    sour: () => `${tall(28, 8, 62, 132, '#f6dc6a', { lemonIn: true })}${tall(96, 22, 58, 118, '#e2566c')}${lemon(150, 124, 22)}${grapefruit(178, 104, 18)}${leaf(132, 98, 22, -30)}`,
    highball: () => `${bottle(124, 10, 40, 132, '#c98a2c', '#f1e4c4')}${tall(36, 26, 66, 118, '#e9b54a', { lemonIn: true })}${lemon(28, 128, 16)}`,
    beer: () => `${bottle(132, 6, 36, 138, '#7a4a18', '#efe6d2')}${mug(22, 34, 104, 110)}`,
    wine: () => `${grapes(150, 102, 13)}${wglass(30, 18, 54, 124, '#7a1424')}${wglass(82, 30, 50, 114, '#efe39a')}`,
    shochu: () => `${bottle(18, 6, 40, 138, '#f3efe6', '#e5dcc6', '#d9d3c4')}${bottle(64, 14, 38, 130, '#2e2016', '#7a2a1a', '#2a1a10')}${rock(110, 72, 72, 68, '#f3e6c4')}`,
    soft: () => `${tall(26, 14, 60, 126, '#4a2312', { straw: '#e5483a' })}${tall(92, 26, 56, 114, '#f6a630', { straw: '#3a9a5a' })}${orange(160, 120, 22)}${lemon(180, 92, 14)}`,
    umeshu: () => `${rock(20, 62, 78, 78, '#d98f2e')}${rock(96, 70, 72, 70, '#7a1e22')}${ume(176, 122, 16)}${ume(152, 132, 13, '#c4d65e')}${leaf(168, 100, 22, -40)}`,
  };

  function scene(key, cls = '') {
    const f = SCENES[key];
    return f ? `<svg class="scene ${cls}" viewBox="0 0 200 150" aria-hidden="true">${f()}</svg>` : '';
  }
  // 見出しの飾り（レモンとグラス／ジョッキ）
  const deco = (side) => (side === 'left'
    ? `<svg class="deco deco-l" viewBox="0 0 200 150" aria-hidden="true">${tall(70, 10, 60, 128, '#f6dc6a', { lemonIn: true })}${lemon(40, 120, 26)}${lemon(150, 128, 18)}${leaf(26, 86, 26, -20)}</svg>`
    : `<svg class="deco deco-r" viewBox="0 0 200 150" aria-hidden="true">${mug(56, 26, 100, 116)}${ume(36, 128, 14)}</svg>`);

  window.MenuIllust = { scene, deco, keys: Object.keys(SCENES) };
})();
