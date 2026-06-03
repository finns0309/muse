// One-off icon renderer. Runs icon SVGs through Electron's Chromium, writes
// PNGs, then assembles:
//   assets/icon.icns + assets/icon.png   — app icon (concept 8)
//   assets/trayTemplate.png  + @2x        — menu-bar tray (monochrome template)
// Usage: npx electron scripts/render-icon.js

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, '..', 'assets');
const ICONSET = path.join(__dirname, '..', 'icon.iconset');

// App icon — light squircle, dark chevron, accent dot (concept 8).
const APP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 160 160">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fbfbfd"/><stop offset="1" stop-color="#e9e9ee"/>
  </linearGradient></defs>
  <rect width="160" height="160" fill="url(#g)"/>
  <path d="M56 50 L88 80 L56 110" fill="none" stroke="#1c1c1e" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="102" cy="80" r="6.5" fill="#6eb5ff"/>
</svg>`;

// Tray template — transparent bg, solid black chevron (macOS tints it). Bolder
// + centered so it reads at 16px. No color (template images are monochrome).
const TRAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
  <path d="M16 11 L30 22 L16 33" fill="none" stroke="#000" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function page(svg, w, h) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;width:${w}px;height:${h}px;background:transparent}svg{display:block}</style>
</head><body>${svg}</body></html>`;
}

async function shoot(win, file, w, h, sizes) {
  await win.loadFile(file);
  await new Promise((r) => setTimeout(r, 150));
  const out = {};
  for (const px of sizes) {
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
    out[px] = img.resize({ width: px, height: px }).toPNG();
  }
  return out;
}

app.whenReady().then(async () => {
  const tmpApp = path.join(os.tmpdir(), 'muse-icon.html');
  const tmpTray = path.join(os.tmpdir(), 'muse-tray.html');
  fs.writeFileSync(tmpApp, page(APP_SVG, 1024, 1024));
  fs.writeFileSync(tmpTray, page(TRAY_SVG, 44, 44));

  // App icon
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, webPreferences: { offscreen: false } });
  const app1 = await shoot(win, tmpApp, 1024, 1024, [16, 32, 64, 128, 256, 512, 1024]);
  fs.mkdirSync(ICONSET, { recursive: true });
  const map = [
    ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024],
  ];
  for (const [name, px] of map) fs.writeFileSync(path.join(ICONSET, name), app1[px]);
  fs.writeFileSync(path.join(OUT, 'icon.png'), app1[1024]);
  execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', path.join(OUT, 'icon.icns')]);
  fs.rmSync(ICONSET, { recursive: true, force: true });

  // Tray template
  const winT = new BrowserWindow({ width: 44, height: 44, show: false, transparent: true,
    backgroundColor: '#00000000', webPreferences: { offscreen: false } });
  const tray = await shoot(winT, tmpTray, 44, 44, [16, 32]);
  fs.writeFileSync(path.join(OUT, 'trayTemplate.png'), tray[16]);
  fs.writeFileSync(path.join(OUT, 'trayTemplate@2x.png'), tray[32]);

  win.destroy(); winT.destroy();
  fs.rmSync(tmpApp, { force: true }); fs.rmSync(tmpTray, { force: true });
  console.log('[icon] wrote icon.icns, icon.png, trayTemplate.png (+@2x)');
  app.quit();
});
