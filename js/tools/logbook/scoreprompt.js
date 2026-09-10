// "Open the score?" (WSHED-103). When practice starts on a goal that has a
// score on this device, offer to open it — the way the goal page asks before
// practicing a lesson goal. Unlike that prompt the clock is already running;
// this only decides where you look. Nothing is asked when there is no score,
// or when its file is on another device and not in the cloud (nothing to open).
import { logbook } from "../../lib/logbook.js";
import { icon } from "../../lib/icons.js";
import { esc, openSheet } from "./util.js";
import { haptic } from "./motion.js";
import { scoreStore } from "../../lib/scores/store.js";
import { cloud } from "../../lib/scores/cloud.js";

/** Resolves true when the reader was opened. Safe to call for any goal. */
export async function offerScore(goalId) {
  const s = logbook.scoreForGoal(goalId);
  if (!s) return false;
  await scoreStore.ready();
  const here = scoreStore.has(s.id);
  if (!here && !cloud.has(s.id)) return false;
  let opened = false;
  const { body, close, closed } = openSheet({
    title: "open the score?",
    cls: "lb-acct-wrap lb-lesson-wrap lb-score-prompt",
    html: `
      <ul class="lb-acct-list">
        <li><button type="button" class="lb-acct-row" id="lb-score-open">${icon("score")}<span><b>open ${esc(s.title)}</b><small>${s.pages} page${s.pages === 1 ? "" : "s"} · ${here ? "the clock keeps running" : "downloads from your cloud space first"}</small></span></button></li>
        <li><button type="button" class="lb-acct-row" id="lb-score-stay">${icon("log")}<span><b>stay here</b><small>the score is one tap away on the hero</small></span></button></li>
      </ul>`,
  });
  body.querySelector("#lb-score-open").addEventListener("click", () => { opened = true; haptic(); close(); location.hash = `#/scores/${encodeURIComponent(s.id)}`; });
  body.querySelector("#lb-score-stay").addEventListener("click", () => close());
  await closed;
  return opened;
}
