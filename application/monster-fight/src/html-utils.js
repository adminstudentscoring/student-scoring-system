/** HTML escaping and icon markup helpers (Monster Fight browser bundle). */

export function escapeHtml(text) {
  const s = String(text ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderIconWrap({ imgSrc, fallbackEmoji, alt, wrapClass }) {
  const src = String(imgSrc || '').trim();
  const fb = String(fallbackEmoji || '').trim() || '❓';
  const a = String(alt || '').trim() || '';
  const cls = String(wrapClass || '').trim();
  if (!src) {
    return `<span class="${cls}"><span class="mf-emoji-fallback">${escapeHtml(fb)}</span></span>`;
  }
  return `
      <span class="${cls}">
        <img class="mf-icon-img" src="${escapeHtml(src)}" alt="${escapeHtml(a)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
        <span class="mf-emoji-fallback" style="display:none;">${escapeHtml(fb)}</span>
      </span>
    `;
}
