// minimal accent swap so all three demos share behavior.
const PALETTE = [
  { id: 'teal',   hex: '#5fb3a3' },
  { id: 'gold',   hex: '#c6a15b' },
  { id: 'rose',   hex: '#c87d8a' },
  { id: 'indigo', hex: '#6f7fa8' },
  { id: 'sage',   hex: '#8fa872' },
  { id: 'clay',   hex: '#c8775a' },
];

function applyAccent(hex) {
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty(
    '--accent-soft',
    `color-mix(in srgb, ${hex} 18%, transparent)`
  );
  document.documentElement.style.setProperty(
    '--accent-wash',
    `color-mix(in srgb, ${hex} 8%, transparent)`
  );
  for (const el of document.querySelectorAll('.swatch')) {
    el.classList.toggle('active', el.dataset.hex === hex);
  }
}

function mountPicker(initial) {
  const wrap = document.createElement('div');
  wrap.className = 'accent-picker';
  wrap.innerHTML = `<span class="label">ACCENT</span>`;
  for (const p of PALETTE) {
    const s = document.createElement('button');
    s.className = 'swatch';
    s.dataset.hex = p.hex;
    s.title = p.id;
    s.style.background = p.hex;
    s.addEventListener('click', () => applyAccent(p.hex));
    wrap.appendChild(s);
  }
  document.body.appendChild(wrap);
  applyAccent(initial || PALETTE[0].hex);
}
