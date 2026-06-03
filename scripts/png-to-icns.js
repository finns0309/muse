// Build assets/icon.icns from a single 1024×1024 source PNG.
// Use after exporting the icon from Figma.
//   npx electron scripts/png-to-icns.js [path-to-1024.png]
// Defaults to assets/icon.png.

const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OUT = path.join(__dirname, '..', 'assets');
const SRC = process.argv[2] || path.join(OUT, 'icon.png');
const ICONSET = path.join(__dirname, '..', 'icon.iconset');

app.whenReady().then(() => {
  const base = nativeImage.createFromPath(SRC);
  if (base.isEmpty()) { console.error('[icns] could not read', SRC); app.exit(1); return; }

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
  // Normalize the main png to exactly 1024 too.
  fs.writeFileSync(path.join(OUT, 'icon.png'), base.resize({ width: 1024, height: 1024 }).toPNG());
  execFileSync('iconutil', ['-c', 'icns', ICONSET, '-o', path.join(OUT, 'icon.icns')]);
  fs.rmSync(ICONSET, { recursive: true, force: true });
  console.log('[icns] wrote assets/icon.icns from', path.basename(SRC));
  app.quit();
});
