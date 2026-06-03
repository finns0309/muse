// Rasterize assets/icon-source.svg into the app icon set.
//   npx electron scripts/build-icon-from-svg.js
// Renders the ACTUAL svg file (so the built icon == what you see in Figma),
// at an exact 1024×1024 content area (frame:false + useContentSize avoids the
// title-bar offset that skewed earlier renders), then builds icon.icns.

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, '..', 'assets');
const SVG = path.join(OUT, 'icon-source.svg');
const ICONSET = path.join(__dirname, '..', 'icon.iconset');

app.whenReady().then(async () => {
  const svgText = fs.readFileSync(SVG, 'utf8');
  // Inline the SVG into a zero-margin page sized exactly 1024×1024.
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:1024px;height:1024px;overflow:hidden}
    svg{display:block;width:1024px;height:1024px}
  </style></head><body>${svgText}</body></html>`;
  const tmp = path.join(os.tmpdir(), 'muse-icon-build.html');
  fs.writeFileSync(tmp, html);

  const win = new BrowserWindow({
    width: 1024, height: 1024,
    frame: false, show: false, useContentSize: true,
    webPreferences: { offscreen: false },
  });
  await win.loadFile(tmp);
  await new Promise((r) => setTimeout(r, 200));

  const base = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  win.destroy();
  fs.rmSync(tmp, { force: true });

  fs.mkdirSync(ICONSET, { recursive: true });
  const map = [
    ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024],
  ];
  for (const [name, px] of map) {
    fs.writeFileSync(path.join(ICONSET, name), base.resize({ width: px, height: px }).toPNG());
  }
  fs.writeFileSync(path.join(OUT, 'icon.png'), base.resize({ width: 1024, height: 1024 }).toPNG());
  execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', path.join(OUT, 'icon.icns')]);
  fs.rmSync(ICONSET, { recursive: true, force: true });
  console.log('[icon] built icon.icns + icon.png from icon-source.svg');
  app.quit();
});
