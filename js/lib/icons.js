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
  share: `<path d="M12 14.5V3.5"/><path d="M8.2 7.3L12 3.5l3.8 3.8"/><path d="M5 11.5v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>`,
  home: `<path d="M4.5 11.2 12 5l7.5 6.2"/><path d="M6.5 10v9h11v-9"/><path d="M10.2 19v-4.6h3.6V19"/>`,
  signout: `<path d="M10 5H6.5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1H10"/><path d="M14 8.4 17.6 12 14 15.6"/><path d="M17.4 12H9.5"/>`,
  eraser: `<path d="M5.2 15.3 13.6 6.9a1.5 1.5 0 0 1 2.1 0l2.9 2.9a1.5 1.5 0 0 1 0 2.1L12.2 18.3a1 1 0 0 1-.7.3H7.9a1 1 0 0 1-.7-.3l-2-2a1 1 0 0 1 0-1Z"/><path d="M9.6 11l4.4 4.4"/><path d="M13 18.6h6"/>`,
  trash: `<path d="M5.5 7.5h13"/><path d="M9.5 7.5V5.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7"/><path d="M7 7.5l.8 10.6a1 1 0 0 0 1 .9h6.4a1 1 0 0 0 1-.9L17 7.5"/><path d="M10.3 10.5v5M13.7 10.5v5"/>`,
  check: `<path d="M5 12.5l4.2 4.2L19 7.5" stroke-width="2.4"/>`,
  // the pickers' chevron (WSHED-128): a small down caret instead of the ▾ text glyph
  chev: `<path d="M7 10l5 5 5-5" stroke-width="2.3"/>`,
  // Favorites (v109, WSHED-148): the panel's ×
  close: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke-width="2.2"/>`,
  // Gesture mode (v102, WSHED-130): a drawn stroke
  gesture: `<path d="M3.6 15.6c2.3-7.6 5-7.6 6.2 0s3.7 7.6 6.2 0"/><path d="M16 15.6l2 1.7 2-2.2"/>`,
  // Pen | Touch (v101, WSHED-129): a pencil and a pointing finger
  nib: `<path d="M15 4.2l4.8 4.8L8.4 20.4H3.6v-4.8Z"/><path d="M12.8 6.4l4.8 4.8"/>`,
  // bars (v104, WSHED-132): two barlines with a plus between (insert one) or a minus (delete one)
  barPlus: `<path d="M5 4.5v15M19 4.5v15"/><path d="M12 8.6v6.8M8.6 12h6.8"/>`,
  barMinus: `<path d="M5 4.5v15M19 4.5v15"/><path d="M8.6 12h6.8"/>`,
  // pickup (v113, WSHED-151): a bar whose left edge is provisional — a dashed barline before a short bar
  barShort: `<path d="M19 4.5v15"/><path d="M9 4.5v15" stroke-dasharray="2.4 2.2"/><path d="M12 12h4"/>`,
  finger: `<path d="M10.6 12.4V4.9a1.5 1.5 0 0 1 3 0v6.9"/><path d="M13.6 11.6l3.6 1a2.3 2.3 0 0 1 1.7 2.2v1.6c0 3.4-2.5 5.4-5.4 5.4h-1.3a4.9 4.9 0 0 1-3.9-2l-2.6-3.5a1.4 1.4 0 0 1 2.2-1.7l1.7 2.1"/>`,
  palette: `<path d="M12 4.5a7.5 7.5 0 1 0 0 15h1.2a1.6 1.6 0 0 0 1.1-2.8 1.6 1.6 0 0 1 1.1-2.7h1.4a2.7 2.7 0 0 0 2.7-2.7A7.5 7.5 0 0 0 12 4.5Z"/><circle cx="8.3" cy="11.2" r="1.1" fill="currentColor" stroke="none"/><circle cx="11" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="8.6" r="1.1" fill="currentColor" stroke="none"/>`,
  keys: `<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M8 6v7.5M12 6v7.5M16 6v7.5"/><path d="M6.6 6v5h2.8V6M10.6 6v5h2.8V6M14.6 6v5h2.8V6" fill="currentColor" stroke="none"/>`,
  mic: `<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M6 11.5a6 6 0 0 0 12 0"/><path d="M12 17.5v3M9 20.5h6"/>`,
  cursor: `<path d="M7.2 4.2 18.4 13.6l-5 .9 2.9 5.4-2.3 1.2-2.9-5.4-3.9 3.5Z" fill="currentColor" stroke="none"/>`,
  hand: `<path d="M8.6 12.6V6.4a1.3 1.3 0 0 1 2.6 0v5.2"/><path d="M11.2 11.2V4.9a1.3 1.3 0 0 1 2.6 0v6.3"/><path d="M13.8 11.6V6.1a1.3 1.3 0 0 1 2.6 0v6.4"/><path d="M16.4 12.5V8.6a1.3 1.3 0 0 1 2.6 0v5.9c0 3.5-2.5 5.5-5.4 5.5h-1.3a4.9 4.9 0 0 1-3.9-2L5.3 14.4a1.4 1.4 0 0 1 2.2-1.7l1.1 1.4"/>`,
  skipBack: `<path d="M17.5 5.6v12.8c0 .8-.9 1.3-1.6.9L6.6 13a1.1 1.1 0 0 1 0-1.9l9.3-6.4c.7-.4 1.6.1 1.6.9Z" fill="currentColor" stroke="none"/><rect x="4.2" y="5.5" width="2.2" height="13" rx="0.9" fill="currentColor" stroke="none"/>`,
  skipFwd: `<path d="M6.5 5.6v12.8c0 .8.9 1.3 1.6.9l9.3-6.3a1.1 1.1 0 0 0 0-1.9L8.1 4.7c-.7-.4-1.6.1-1.6.9Z" fill="currentColor" stroke="none"/><rect x="17.6" y="5.5" width="2.2" height="13" rx="0.9" fill="currentColor" stroke="none"/>`,
  pause: `<rect x="6.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor" stroke="none"/><rect x="13.5" y="5.5" width="4" height="13" rx="1.2" fill="currentColor" stroke="none"/>`,
  sliders: `<path d="M4 7.5h9"/><path d="M17.5 7.5H20"/><circle cx="15" cy="7.5" r="2.1"/><path d="M4 16.5h2.5"/><path d="M11 16.5h9"/><circle cx="8.5" cy="16.5" r="2.1"/>`,
  star: `<path d="M12 3.8l2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.4l-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7Z"/>`,
  cloud: `<path d="M7 18.5h10.5a3.5 3.5 0 0 0 .5-7 5.5 5.5 0 0 0-10.6-1.2A4.1 4.1 0 0 0 7 18.5Z"/>`,
  flip: `<path d="M4.5 8.5h13l-3-3"/><path d="M19.5 15.5h-13l3 3"/>`,
  ear: `<path d="M7.5 9.5a4.5 4.5 0 0 1 9 0c0 2.2-1.4 3-2.2 4.2-.6.9-.5 2-1 2.9a2.2 2.2 0 0 1-4 .1"/><path d="M10.2 9.6a1.8 1.8 0 0 1 3.6 0c0 1-.9 1.3-1.3 2"/>`,
  chart: `<path d="M4.5 19.5h15"/><path d="M7 16v-5M12 16V6.5M17 16v-8"/>`,
  undo: `<path d="M5.6 8.6A7 7 0 1 1 4.3 13"/><path d="M5.1 4.6v4.2h4.2"/>`,
  highlighter: `<path d="M8.5 15.5 15.8 8.2a1.5 1.5 0 0 1 2.1 0l.9.9a1.5 1.5 0 0 1 0 2.1l-7.3 7.3H8.5v-3Z"/><path d="M6 21h12" stroke-width="2.6"/><path d="M14.5 9.5l3 3"/>`,
  finger: `<path d="M9 11.5V5.2a1.6 1.6 0 0 1 3.2 0v5.3"/><path d="M12.2 10.5a1.5 1.5 0 0 1 3 0v1.4a1.5 1.5 0 0 1 3 0v1.4a1.4 1.4 0 0 1 2.8.3v2.6c0 2.6-2.1 4.6-4.7 4.6h-2.1a5 5 0 0 1-4-2L7 15.4a1.5 1.5 0 0 1 2.4-1.8l1.6 1.9"/>`,
  score: `<path d="M6.5 4.5h8.5l3.5 3.5v11.5h-12V4.5Z"/><path d="M9 10h7M9 12.5h7M9 15h7M9 17.5h4"/>`,
  bookmark: `<path d="M7 4.5h10v15l-5-3.6-5 3.6v-15Z"/>`,
  more: `<circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none"/>`,
  plus: `<path d="M12 5.5v13M5.5 12h13"/>`,
  grip: `<circle cx="9" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="17.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="17.5" r="1.3" fill="currentColor" stroke="none"/>`,
  tag: `<path d="M4.5 5.5h7.2l7.8 7.8-6.9 6.9-7.8-7.8V5.5Z"/><circle cx="8.6" cy="9.6" r="1.2" fill="currentColor" stroke="none"/>`,
  group: `<path d="M4.5 7.5h15M4.5 12h9M4.5 16.5h12"/>`,
  copy: `<rect x="8.5" y="8.5" width="10.5" height="10.5" rx="1.6"/><path d="M5.5 15V6.5a1 1 0 0 1 1-1H15"/>`,
  cut: `<circle cx="7.5" cy="16.5" r="2.4"/><circle cx="16.5" cy="16.5" r="2.4"/><path d="M9.3 14.9 17.5 4.5M14.7 14.9 6.5 4.5"/>`,
  paste: `<rect x="6" y="6.5" width="12" height="13" rx="1.6"/><rect x="9.2" y="4.5" width="5.6" height="3.4" rx="1"/><path d="M9.5 12.5h5M9.5 15.5h3.5"/>`,
  log: `<path d="M6 4.5h9.5l3 3V19.5H6V4.5Z"/><path d="M9 10h6M9 13.5h6M9 17h3.5"/>`,
};

/** icon("play") → inline SVG string. Decorative by default (aria-hidden). */
export function icon(name) {
  return `<svg class="ic ic-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name]}</svg>`;
}
