// The Woodshed icon set: one visual voice for every control glyph.
// 24×24 viewBox, stroke = currentColor at 1.8 with round caps (fills where a
// solid read is stronger). Buttons stay text-free; meaning rides on
// aria-label/title supplied by the caller.
const P = {
  // back/next: a centred caret, heavier than the rest so it reads at a glance (WSHED-47)
  back: `<path d="M15 5 8 12l7 7" stroke-width="2.9"/>`,
  next: `<path d="M9 5l7 7-7 7" stroke-width="2.9"/>`,
  play: `<path d="M8.2 5.4v13.2c0 .8.9 1.3 1.6.9l10-6.6c.6-.4.6-1.4 0-1.8l-10-6.6c-.7-.4-1.6.1-1.6.9Z" fill="currentColor" stroke="none"/>`,
  stop: `<rect x="6.8" y="6.8" width="10.4" height="10.4" rx="1.6" fill="currentColor" stroke="none"/>`,
  hear: `<path d="M4.5 9.5v5h3.2l4.3 3.6V5.9L7.7 9.5H4.5Z" fill="currentColor" stroke="none"/>
         <path d="M15 9.2a4 4 0 0 1 0 5.6"/><path d="M17.6 6.8a7.4 7.4 0 0 1 0 10.4"/>`,
  redo: `<path d="M18.4 8.6A7 7 0 1 0 19.7 13"/><path d="M18.9 4.6v4.2h-4.2"/>`,
  click: `<path d="M10 4.5h4l2.8 14a1 1 0 0 1-1 1.2H8.2a1 1 0 0 1-1-1.2l2.8-14Z"/>
          <path d="M11.2 15.5 16 7.8"/><circle cx="16.4" cy="7.2" r="1.4" fill="currentColor" stroke="none"/>`,
  map: `<path d="M4.5 6.5 9.5 4.5 14.5 6.5 19.5 4.5v13l-5 2-5-2-5 2v-13Z"/><path d="M9.5 4.8v12.4M14.5 6.8v12.4"/>`,
  pencil: `<path d="M5 19.2l.9-3.6L15.6 5.9a1.6 1.6 0 0 1 2.3 0l.9.9a1.6 1.6 0 0 1 0 2.3l-9.7 9.7L5 19.2Z"/><path d="M13.9 7.6l3.2 3.2"/>`,
  user: `<circle cx="12" cy="8.2" r="3.6"/><path d="M4.8 19.5c.9-3.6 3.6-5.4 7.2-5.4s6.3 1.8 7.2 5.4"/>`,
  info: `<circle cx="12" cy="12" r="8.6"/><path d="M12 11.2v5.2"/><path d="M12 7.7v.3" stroke-width="2.6"/>`,
  download: `<path d="M12 4.5v10.2"/><path d="M8.2 11l3.8 3.8 3.8-3.8"/><path d="M5 16.5v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/>`,
  home: `<path d="M4.5 11.2 12 5l7.5 6.2"/><path d="M6.5 10v9h11v-9"/><path d="M10.2 19v-4.6h3.6V19"/>`,
  signout: `<path d="M10 5H6.5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1H10"/><path d="M14 8.4 17.6 12 14 15.6"/><path d="M17.4 12H9.5"/>`,
  eraser: `<path d="M5.2 15.3 13.6 6.9a1.5 1.5 0 0 1 2.1 0l2.9 2.9a1.5 1.5 0 0 1 0 2.1L12.2 18.3a1 1 0 0 1-.7.3H7.9a1 1 0 0 1-.7-.3l-2-2a1 1 0 0 1 0-1Z"/><path d="M9.6 11l4.4 4.4"/><path d="M13 18.6h6"/>`,
  trash: `<path d="M5.5 7.5h13"/><path d="M9.5 7.5V5.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7"/><path d="M7 7.5l.8 10.6a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9L17 7.5"/><path d="M10.3 10.5v5M13.7 10.5v5"/>`,
  check: `<path d="M5 12.5l4.2 4.2L19 7.5" stroke-width="2.4"/>`,
  palette: `<path d="M12 4.5a7.5 7.5 0 1 0 0 15h1.2a1.6 1.6 0 0 0 1.1-2.8 1.6 1.6 0 0 1 1.1-2.7h1.4a2.7 2.7 0 0 0 2.7-2.7A7.5 7.5 0 0 0 12 4.5Z"/><circle cx="8.3" cy="11.2" r="1.1" fill="currentColor" stroke="none"/><circle cx="11" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="8.6" r="1.1" fill="currentColor" stroke="none"/>`,
  keys: `<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M8 6v7.5M12 6v7.5M16 6v7.5"/><path d="M6.6 6v5h2.8V6M10.6 6v5h2.8V6M14.6 6v5h2.8V6" fill="currentColor" stroke="none"/>`,
  chart: `<path d="M4.5 19.5h15"/><path d="M7 16v-5M12 16V6.5M17 16v-8"/>`,
  log: `<path d="M6 4.5h9.5l3 3V19.5H6V4.5Z"/><path d="M9 10h6M9 13.5h6M9 17h3.5"/>`,
};

/** icon("play") → inline SVG string. Decorative by default (aria-hidden). */
export function icon(name) {
  return `<svg class="ic ic-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;
}
