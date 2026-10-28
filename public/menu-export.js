'use strict';
// メニュー表を「余白なしの A4 1枚」の PDF / 画像にする。
// ブラウザの印刷機能（iPhone だと余白・URL・日付が勝手に入る）は使わず、
// 1) メニュー表を SVG に包んで高解像度の画像にする → 2) その画像を1ページの PDF に貼る、を自分でやる。
(function () {
  const W = 1000, H = 1414;            // メニュー表の大きさ（px）
  const SCALE = 2.48;                  // 2480×3507px ≒ A4 を 300dpi
  const A4 = [595.28, 841.89];         // A4（pt）

  // 使っているフォントを、メニューに出てくる文字だけ取り込む（Google Fonts の text= で小さくできる）
  const FONT_Q = 'family=Yusei+Magic&family=Dela+Gothic+One&family=Yuji+Syuku&family=Shippori+Mincho+B1:wght@600&family=Klee+One:wght@600&family=Zen+Maru+Gothic:wght@700&family=Zen+Kaku+Gothic+New:wght@500;700';
  const toDataURL = (blob) => new Promise((ok, ng) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = ng; r.readAsDataURL(blob); });
  async function fontCss(text) {
    try {
      const chars = [...new Set(text + '0123456789円各（）税込＋〈〉【】・！？ー')].join('');
      const r = await fetch('https://fonts.googleapis.com/css2?' + FONT_Q + '&text=' + encodeURIComponent(chars));
      if (!r.ok) return '';
      let css = await r.text();
      for (const u of new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))) {
        const b = await (await fetch(u)).blob();
        css = css.split(u).join(await toDataURL(b));
      }
      return css;
    } catch (_) { return ''; } // 取れなければ、端末の文字で描く
  }
  let cssCache;
  async function pageCss() {
    if (!cssCache) cssCache = Promise.all(['/menu.css', '/menu-themes.css'].map((u) => fetch(u).then((r) => r.text()))).then((a) => a.join('\n'));
    return cssCache;
  }

  // .dm（描いて fit 済みのもの）を、キャンバスに描く
  async function toCanvas(dm) {
    const clone = dm.cloneNode(true);
    clone.style.transform = 'none';
    clone.style.margin = '0';
    const css = (await pageCss()) + '\n' + (await fontCss(dm.textContent));
    const wrap = document.createElementNS('http://www.w3.org/1999/xhtml', 'div');
    wrap.setAttribute('style', `width:${W}px;height:${H}px;margin:0;font-size:16px;line-height:1.2`);
    const st = document.createElementNS('http://www.w3.org/1999/xhtml', 'style');
    st.textContent = css;
    wrap.appendChild(st);
    wrap.appendChild(clone);
    const xml = new XMLSerializer().serializeToString(wrap);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">${xml}</foreignObject></svg>`;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    await new Promise((r) => setTimeout(r, 250)); // Safari はフォントの読み込みが少し遅れる
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * SCALE); cv.height = Math.round(H * SCALE);
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    await new Promise((r) => setTimeout(r, 50));
    ctx.drawImage(img, 0, 0, cv.width, cv.height); // 2回描くと、フォントの抜けが出にくい
    return cv;
  }
  const canvasBlob = (cv, type, q) => new Promise((ok, ng) => cv.toBlob((b) => (b ? ok(b) : ng(new Error('toBlob'))), type, q));

  // JPEG 1枚を A4 いっぱいに貼った PDF を組み立てる
  async function jpegToPdf(jpeg, w, h) {
    const bytes = new Uint8Array(await jpeg.arrayBuffer());
    const enc = new TextEncoder();
    const parts = []; const offsets = []; let len = 0;
    const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
    push('%PDF-1.4\n%âãÏÓ\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
    offsets[4] = len;
    push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);
    push(bytes);
    push('\nendstream\nendobj\n');
    const content = `q ${A4[0]} 0 0 ${A4[1]} 0 0 cm /Im0 Do Q`;
    obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    const xref = len;
    let x = 'xref\n0 6\n0000000000 65535 f \n';
    for (let i = 1; i <= 5; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  }

  // スマホは共有シート（ファイルに保存・プリント・LINE など）、パソコンはダウンロード
  async function deliver(blob, name) {
    const file = new File([blob], name, { type: blob.type });
    const mobile = matchMedia('(pointer: coarse)').matches;
    if (mobile && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 5000);
    return 'downloaded';
  }

  async function exportMenu(dm, kind, baseName) {
    const cv = await toCanvas(dm);
    if (kind === 'png') return deliver(await canvasBlob(cv, 'image/png'), baseName + '.png');
    const jpeg = await canvasBlob(cv, 'image/jpeg', 0.92);
    return deliver(await jpegToPdf(jpeg, cv.width, cv.height), baseName + '.pdf');
  }

  window.MenuExport = { exportMenu, toCanvas, jpegToPdf };
})();
