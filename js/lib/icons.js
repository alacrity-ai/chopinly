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
  log: `<path d="M6 4.5h9.5l3 3V19.5H6V4.5Z"/><path d="M9 10h6M9 13.5h6M9 17h3.5"/>`,
};

/** icon("play") → inline SVG string. Decorative by default (aria-hidden). */
export function icon(name) {
  return `<svg class="ic ic-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;
}
