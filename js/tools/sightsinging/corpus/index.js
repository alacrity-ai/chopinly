// The full corpus: campaign books + the classic 18. Merged, indexed, and
// filterable. Validation lives in melodies.js (validateCorpus) and runs over
// this list in node tests and the dev gallery.
import { CLASSIC } from "./classic.js";
import { BOOK1 } from "./book1.js";
import { BOOK2 } from "./book2.js";
import { BOOK3 } from "./book3.js";
import { BOOK4 } from "./book4.js";
import { BOOK5 } from "./book5.js";

export const MELODIES = [...BOOK1, ...BOOK2, ...BOOK3, ...BOOK4, ...BOOK5, ...CLASSIC];

export const byId = new Map(MELODIES.map((m) => [m.id, m]));

/** Filtered view of the corpus. clefs: array of clef names (empty/absent = all). */
export function pool({ difficulty = 0, clefs = null, exclude = [] } = {}) {
  const skip = new Set(exclude);
  return MELODIES.filter((m) =>
    (!difficulty || m.difficulty === difficulty) &&
    (!clefs || !clefs.length || clefs.includes(m.clef)) &&
    !skip.has(m.id));
}

export { BOOKS, LESSONS, STAR_THRESHOLDS, starsFor } from "./campaign.js";
