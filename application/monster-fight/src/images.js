/** Image path helpers for Monster Fight assets. */

export function getImagesBase() {
  try {
    if (window.location && window.location.protocol === 'file:') return 'images/';
  } catch {}
  return '/application/monster-fight/images/';
}

export function imageSrcForFile(file) {
  const f = String(file || '').trim();
  if (!f) return '';
  const parts = f.split('/').filter(Boolean).map(encodeURIComponent);
  return `${getImagesBase()}${parts.join('/')}`;
}

export function applyBackgroundTheme(theme) {
  const t = String(theme || '').trim() || 'white';
  const body = document.body;
  if (!body) return;

  if (t === 'image') {
    const url = imageSrcForFile('Background/Background.jpg') || 'images/Background/Background.jpg';
    body.style.setProperty('--mf-bg-url', `url("${url}")`);
    body.classList.add('mf-bg-image');
    body.style.background = '';
    body.style.backgroundColor = '';
    return;
  }

  body.classList.remove('mf-bg-image');
  body.style.removeProperty('--mf-bg-url');
  body.style.background = '#ffffff';
}
