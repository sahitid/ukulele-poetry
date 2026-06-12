export interface MoodFeatures {
  spm: number;           // strums per minute
  energy: number;        // 0-1, relative to the player's own recent peak
  minorness: number;     // 0-1, share of minor (+ diminished) chords
  tension: number;       // 0-1, dim/aug/dom7 presence
  floaty: number;        // 0-1, unresolved sus chords
  changesPerMin: number; // chord changes per minute
}

/**
 * Score every mood from the musical features; the caller takes the max.
 * Tuned for casual ukulele playing: spm tops out around 70, chord changes
 * around 12/min, and "loud" means loud for this player, not in absolute terms.
 */
export function moodScores(f: MoodFeatures): Record<string, number> {
  const spmN = Math.min(1, f.spm / 70), chg = Math.min(1, f.changesPerMin / 12),
    e = f.energy, m = f.minorness, t = f.tension, fl = f.floaty;
  const bell = (x: number, c: number, w: number) => Math.max(0, 1 - Math.abs(x - c) / w);
  return {
    frantic:       (f.spm > 100 ? 1 : 0) * (spmN * .4 + e * .35 + chg * .25),
    restless:      t * .45 + chg * .3 + e * .3,
    triumphant:    Math.max(0, 1 - m - t) * .35 + e * .4 + chg * .25,
    joyful:        Math.max(0, 1 - m - t * .5) * .45 + e * .3 + chg * .25,
    playful:       (1 - m) * .3 + fl * .25 + chg * .35 + bell(e, .5, .4) * .1,
    tender:        Math.max(0, 1 - m - fl * .7) * .45 + bell(e, .25, .3) * .35 + (1 - chg) * .2,
    contemplative: fl * .3 + (1 - spmN) * .25 + (1 - chg) * .25 + bell(e, .3, .35) * .2,
    wistful:       bell(m, .45, .25) * .5 + (1 - spmN) * .25 + (1 - e) * .15,
    melancholy:    m * .5 + (1 - spmN) * .25 + (1 - e) * .25,
    brooding:      m * .25 + t * .5 + e * .25,
  };
}
