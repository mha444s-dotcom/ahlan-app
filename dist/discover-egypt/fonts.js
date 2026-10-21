// Keep the supplied fonts without registering extra Cairo weights under the
// application's own font family. Chrome does not register @font-face in shadows.
export const originalFontStylesheet = 'https://fonts.googleapis.com/css2?family=Alexandria:wght@400;500;600;700;800&family=Amiri:wght@400;700&family=Cairo:wght@400;500;600;700;800;900&display=swap';
let pending;
export function installDiscoverFonts() {
  if (!pending) pending = fetch(originalFontStylesheet).then(async response => {
    if (!response.ok) return false;
    const original = await response.text();
    const style = document.createElement('style'); style.dataset.discoverFonts = '';
    style.textContent = original.replace(/font-family:\s*(['"]?)(Cairo|Alexandria|Amiri)\1\s*;/g, (_, quote, family) => `font-family: 'AhlanDiscover${family}';`);
    document.head.append(style); return true;
  }).catch(() => false); // The original remote font dependency may be offline.
  return pending;
}
