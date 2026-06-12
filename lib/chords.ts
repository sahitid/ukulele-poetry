import { Chord } from "tonal";

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const FLAT_TO_SHARP: Record<string, string> = {
  Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#", Cb: "B", Fb: "E",
};

export type ChordQuality = "major" | "minor" | "dim" | "aug" | "sus" | "dom7";

export interface DetectedChord {
  name: string;       // display name, e.g. "Am", "Csus4", "G7"
  root: number;       // pitch class 0-11
  quality: ChordQuality;
  confidence: number; // 0-1, share of harmonic energy on chord tones
}

function qualityOf(symbol: string): ChordQuality {
  if (/dim|°|o7/.test(symbol)) return "dim";
  if (/aug|\+/.test(symbol)) return "aug";
  if (/sus/.test(symbol)) return "sus";
  if (/^[A-G][#b]?m(?!aj)/.test(symbol)) return "minor";
  if (/^[A-G][#b]?(7|9|13)/.test(symbol)) return "dom7";
  return "major";
}

/**
 * Identify a chord from a 12-bin chroma vector (Meyda's `chroma` feature).
 * Picks the strongest pitch classes and asks Tonal to name the chord they spell.
 */
export function detectChordFromChroma(chroma: number[]): DetectedChord | null {
  const total = chroma.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  const ranked = chroma
    .map((v, pc) => ({ pc, v: v / total }))
    .sort((a, b) => b.v - a.v);
  const max = ranked[0].v;
  if (max <= 0) return null;

  /* chord tones = pitch classes that hold their own against the loudest one */
  const picked = ranked.filter(({ v }) => v >= max * 0.45).slice(0, 4);
  if (picked.length < 3) return null;

  const confidence = picked.reduce((a, { v }) => a + v, 0);
  if (confidence < 0.55) return null;

  const notes = picked.map(({ pc }) => NOTE_NAMES[pc]);
  /* strongest pitch class goes first as the likely bass; drop any slash naming */
  const symbol = (Chord.detect(notes)[0] || "").split("/")[0];
  if (!symbol) return null;

  const tonic = Chord.get(symbol).tonic ?? "";
  const root = NOTE_NAMES.indexOf(FLAT_TO_SHARP[tonic] ?? tonic);
  if (root < 0) return null;

  /* tonal spells plain major triads as e.g. "CM" — show them as just "C" */
  const name = symbol.replace(/^([A-G][#b]?)M$/, "$1");
  return { name, root, quality: qualityOf(symbol), confidence };
}
