"use client";

import { useEffect } from "react";
import html2canvas from "html2canvas";
import Meyda from "meyda";
import type { MeydaAnalyzer } from "meyda/dist/esm/meyda-wa";
import { detectChordFromChroma, NOTE_NAMES, type ChordQuality } from "@/lib/chords";
import { moodScores } from "@/lib/mood";

const CALL_EVERY = 14000, WINDOW = 12000, PAUSE_AFTER = 4000;

const MOODS: Record<string, { h: number; s: number; l: number }> = {
  frantic:       { h: 2,   s: 78, l: 60 },
  restless:      { h: 18,  s: 70, l: 58 },
  triumphant:    { h: 33,  s: 80, l: 60 },
  joyful:        { h: 48,  s: 85, l: 62 },
  playful:       { h: 150, s: 60, l: 58 },
  tender:        { h: 330, s: 55, l: 68 },
  contemplative: { h: 200, s: 55, l: 62 },
  wistful:       { h: 228, s: 50, l: 64 },
  melancholy:    { h: 252, s: 45, l: 58 },
  brooding:      { h: 275, s: 50, l: 52 },
  silent:        { h: 220, s: 15, l: 45 },
};

const BIND_MSGS = ["binding the draft…", "reading it back…", "titling…", "annotating the margins…"];

type SimChord = { name: string; quality: ChordQuality };
const SIM_SCENES: { name: string; chords: SimChord[]; rms: number; chordP: number; strumP: number }[] = [
  { name: "joyful",
    chords: [{ name: "C", quality: "major" }, { name: "G", quality: "major" },
             { name: "Am", quality: "minor" }, { name: "F", quality: "major" }],
    rms: .07, chordP: .02, strumP: .03 },
  { name: "melancholy",
    chords: [{ name: "Am", quality: "minor" }, { name: "Em", quality: "minor" },
             { name: "F", quality: "major" }, { name: "Dm", quality: "minor" }],
    rms: .03, chordP: .008, strumP: .006 },
  { name: "frantic",
    chords: [{ name: "E7", quality: "dom7" }, { name: "Bdim", quality: "dim" },
             { name: "Am", quality: "minor" }, { name: "F#dim", quality: "dim" }],
    rms: .11, chordP: .05, strumP: .09 },
  { name: "contemplative",
    chords: [{ name: "Csus2", quality: "sus" }, { name: "Gsus4", quality: "sus" },
             { name: "C", quality: "major" }],
    rms: .02, chordP: .004, strumP: .004 },
];

export default function Home() {
  useEffect(() => {
    /* ───────── state ───────── */
    const S = {
      audio: null as AudioContext | null,
      meyda: null as MeydaAnalyzer | null,
      micStream: null as MediaStream | null,
      running: false, sim: false,
      calibrating: false, calSamples: [] as number[], noiseFloor: 0.006, sens: 1,
      chords: [] as { name: string; quality: ChordQuality; root: number; confidence: number; t: number }[],
      noteEvents: [] as { pc: number; t: number }[],
      strums: [] as number[],
      rms: 0, rmsAvg: 0.0001, rmsPeak: 0.04,
      chromaHist: [] as number[][],
      pendingChord: null as string | null,
      curChord: null as string | null, lastTonalT: -1e9, lastEventT: 0,
      lastChord: "—",
      poem: [] as string[], writing: false, apiKey: null as string | null, lastCall: 0,
      silenceSince: -1e9,
      mood: "silent", moodScore: 0, moodHist: [] as string[],
      err: null as string | null, toast: null as string | null, toastT: 0,
      recorder: null as MediaRecorder | null, recChunks: [] as Blob[],
      finalOpen: false,
      title: null as string | null,
      annotations: {} as Record<number, { emotion: string; note: string }>,
      titledAt: -1, notesOn: false,
    };

    const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
      document.getElementById(id) as T;

    function emotionColor(word: string) {
      if (MOODS[word]) return MOODS[word];
      let h = 0; for (const c of word) h = (h * 31 + c.charCodeAt(0)) % 360;
      return { h, s: 55, l: 55 };
    }

    /* ───────── audio in ───────── */
    async function startMic() {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      S.micStream = stream;
      const AC = window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext!;
      S.audio = new AC();
      /* contexts created after an await can start suspended despite the click */
      if (S.audio.state === "suspended") await S.audio.resume();
      const src = S.audio.createMediaStreamSource(stream);
      S.meyda = Meyda.createMeydaAnalyzer({
        audioContext: S.audio,
        source: src,
        bufferSize: 4096,
        featureExtractors: ["chroma", "rms"],
        callback: (f: { chroma?: number[]; rms?: number }) => {
          if (f.chroma && typeof f.rms === "number") onFeatures(f.chroma, f.rms);
        },
      });
      S.meyda.start();
      try {
        S.recorder = new MediaRecorder(stream);
        S.recChunks = [];
        S.recorder.ondataavailable = e => { if (e.data.size) S.recChunks.push(e.data); };
        S.recorder.start(1000);
      } catch (e) { console.warn("recording unavailable", e); }
      recalibrate();
      loop();
    }

    /* ───────── chord listening (speech fails, harmony passes) ───────── */
    function inputGate() { return Math.max(0.009, S.noiseFloor * 2.6) * S.sens; }
    function recalibrate() {
      S.calibrating = true; S.calSamples = [];
      setTimeout(() => {
        const xs = S.calSamples;
        const mean = xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
        const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length));
        S.noiseFloor = Math.max(0.005, mean + 3 * sd);
        S.calibrating = false;
        S.toast = "recalibrated · floor " + S.noiseFloor.toFixed(3); S.toastT = performance.now();
      }, 1400);
    }

    /* runs every analysis frame (~93ms): chroma → chord, with smoothing + stability */
    function onFeatures(chroma: number[], rms: number) {
      S.rms = rms;
      if (S.calibrating) { S.calSamples.push(rms); return; }
      const now = performance.now();
      if (rms < inputGate()) { S.pendingChord = null; S.chromaHist = []; return; }

      S.chromaHist.push(chroma);
      if (S.chromaHist.length > 3) S.chromaHist.shift();
      const avg = S.chromaHist[0].map((_, i) =>
        S.chromaHist.reduce((a, c) => a + c[i], 0) / S.chromaHist.length);

      /* presence: tonal sound counts as playing even before a chord is named —
         strums, the pause state, and "hearing you" all hang off this */
      const total = avg.reduce((a, b) => a + b, 0);
      if (total > 0) {
        const top4 = [...avg].sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0) / total;
        if (top4 > 0.5) {
          S.lastTonalT = now; S.silenceSince = now;
          const domPc = avg.indexOf(Math.max(...avg));
          const last = S.noteEvents.at(-1);
          if (!last || last.pc !== domPc || now - last.t > 400)
            S.noteEvents.push({ pc: domPc, t: now });
        }
      }

      const det = detectChordFromChroma(avg);
      if (!det) { S.pendingChord = null; return; }
      /* a chord must survive two consecutive frames before it counts */
      if (S.pendingChord !== det.name) { S.pendingChord = det.name; return; }
      if (det.name !== S.curChord || now - S.lastEventT > 1200) {
        S.chords.push({ ...det, t: now });
        S.curChord = det.name; S.lastEventT = now;
        S.lastChord = det.name;
      }
    }

    function loop() {
      if (!S.running) return;
      requestAnimationFrame(loop);
      if (S.sim) { simulateTick(); return; }
      const now = performance.now();

      if (S.calibrating) { renderStrip(now); return; }

      S.rmsAvg = S.rmsAvg * 0.97 + S.rms * 0.03;
      if (S.rms > Math.max(S.noiseFloor * 4, S.rmsAvg * 2.2)
        && now - S.lastTonalT < 600
        && (!S.strums.length || now - S.strums.at(-1)! > 180)) {
        S.strums.push(now); S.silenceSince = now; firePulse();
      }
      S.strums = S.strums.filter(t => now - t < WINDOW);
      S.chords = S.chords.filter(c => now - c.t < WINDOW);
      S.noteEvents = S.noteEvents.filter(e => now - e.t < WINDOW);

      /* loudness is judged against the player's own recent peak (slow decay) */
      S.rmsPeak = Math.max(S.rmsPeak * 0.9995, S.rms, 0.03);
      document.documentElement.style.setProperty("--energy", energy().toFixed(3));
      document.body.classList.toggle("paused", now - S.silenceSince > PAUSE_AFTER);
      updateMood(now);
      renderStrip(now);
      maybeWrite(now);
    }

    function firePulse() {
      const d = document.createElement("div");
      d.className = "pulse";
      document.body.appendChild(d);
      setTimeout(() => d.remove(), 1200);
    }

    /* ───────── features & mood (from chord qualities) ───────── */
    /* "how loud, for this player" — full strums near your peak ≈ .7, soft picking ≈ .2 */
    const energy = () => Math.min(1, S.rms / (S.rmsPeak * 1.4));

    function features() {
      const spm = Math.round(S.strums.length * (60000 / WINDOW));
      const cs = S.chords;
      let minor = 0, tense = 0, floaty = 0, changes = 0;
      cs.forEach((c, i) => {
        if (c.quality === "minor") minor++;
        else if (c.quality === "dim" || c.quality === "aug") { tense++; minor += 0.5; }
        else if (c.quality === "sus") floaty++;
        else if (c.quality === "dom7") tense += 0.5;
        if (i > 0 && c.name !== cs[i - 1].name) changes++;
      });
      const n = Math.max(1, cs.length);
      const progression: string[] = [];
      for (const c of cs)
        if (!progression.length || progression.at(-1) !== c.name) progression.push(c.name);
      return {
        progression: progression.slice(-8),
        notes: [...new Set(S.noteEvents.map(e => NOTE_NAMES[e.pc]))].slice(0, 8),
        spm,
        energy: +energy().toFixed(2),
        minorness: +Math.min(1, minor / n).toFixed(2),
        tension: +Math.min(1, tense / n).toFixed(2),
        floaty: +Math.min(1, floaty / n).toFixed(2),
        changesPerMin: Math.round(changes * (60000 / WINDOW)),
      };
    }

    function updateMood(now: number) {
      if (!S.chords.length && now - S.silenceSince > 5000) { setMood("silent"); return; }
      if (S.chords.length < 2) return;
      const scores = moodScores(features());
      let top = "wistful", topV = -1;
      for (const k in scores) if (scores[k] > topV) { top = k; topV = scores[k]; }
      if (top !== S.mood && topV < S.moodScore + 0.04) return;
      setMood(top, topV);
    }
    function setMood(m: string, score = 0) {
      if (m === S.mood) { S.moodScore = score; return; }
      S.mood = m; S.moodScore = score;
      if (m !== "silent" && (!S.moodHist.length || S.moodHist.at(-1) !== m)) S.moodHist.push(m);
      const p = MOODS[m], r = document.documentElement.style;
      r.setProperty("--mood-h", String(p.h));
      r.setProperty("--mood-s", p.s + "%");
      r.setProperty("--mood-l", p.l + "%");
    }

    function renderStrip(now: number) {
      const f = features();
      $("tChord").textContent = S.lastChord;
      $("tStrum").textContent = String(f.spm);
      $("tEnergy").textContent = Math.round(f.energy * 100) + "%";
      $("tMinor").textContent = Math.round(f.minorness * 100) + "%";
      $("tMood").textContent = S.mood;
      $("gateTick").style.left = Math.min(98, inputGate() * 9 * 100) + "%";
      $("status").textContent = S.calibrating ? "calibrating — stay quiet…"
        : (S.toast && now - S.toastT < 1800) ? S.toast
        : S.writing ? "writing…"
        : S.err ? S.err
        : (now - S.silenceSince > PAUSE_AFTER) ? "paused — play to continue"
        : "hearing you";
    }

    /* ───────── claude calls ───────── */
    async function callClaude(prompt: string): Promise<string> {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (S.apiKey) {
        headers["x-api-key"] = S.apiKey;
        headers["anthropic-version"] = "2023-06-01";
        headers["anthropic-dangerous-direct-browser-access"] = "true";
      }
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers,
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        let msg = "";
        try {
          const j = await res.json();
          msg = (j.error && j.error.message) || "";
        } catch {}
        throw new Error("api " + res.status + (msg ? ": " + msg.slice(0, 90) : ""));
      }
      const data = await res.json();
      return ((data.content || []) as { type: string; text?: string }[])
        .map(b => (b.type === "text" ? b.text : "")).join("\n").trim();
    }

    /* ───────── the poet ───────── */
    async function maybeWrite(now: number) {
      if (S.writing || S.finalOpen) return;
      if (now - S.lastCall < CALL_EVERY) return;
      if (now - S.silenceSince > PAUSE_AFTER) return;
      if (S.chords.length < 2 && S.noteEvents.length < 4) return;
      S.lastCall = now; S.writing = true;
      try {
        const f = features();
        const sofar = S.poem.slice(-10).join("\n") || "(the page is blank)";
        const text = await callClaude(
`You are a poet improvising live while listening to someone play an electric-acoustic ukulele at an event called "Rough Draft" — a showcase for unfinished work. You write the poem in public, draft-style.

What you just heard (last ~12 seconds):
- chord progression: ${f.progression.join(" → ") || "no full chords — melodic single-note picking"}
- notes heard: ${f.notes.join(", ") || "none clearly"}
- chord changes per minute: ${f.changesPerMin}
- strums per minute: ${f.spm}
- energy (0-1): ${f.energy}
- minorness (0-1): ${f.minorness}
- harmonic tension, dim/aug/7th chords (0-1): ${f.tension}
- suspension, unresolved sus chords (0-1): ${f.floaty}
- detected mood: ${S.mood}

The poem so far:
${sofar}

Write the NEXT 2 or 3 short lines of the poem (each under 9 words). Rules:
- Embody the mood "${S.mood}" — but write about anything that mood evokes, never the words "ukulele" or "music" literally. Be concrete and strange, not greeting-card.
- Lowercase. No rhyming unless the mood is joyful or playful.
- This is a rough draft: in AT MOST one line, you may revise yourself mid-line by wrapping a rejected word or short phrase in tildes, immediately followed by its replacement. Example: "the harbor lights ~tremble~ flinch"
- You may wrap ONE word total in *asterisks* to emphasize it.
- Return ONLY the poem lines, one per line. No preamble, no quotes.`);
        S.err = null;
        const lines = text.split("\n").map(s => s.trim()).filter(Boolean).slice(0, 3);
        for (const ln of lines) await typeLine(ln);
      } catch (e) {
        console.error(e);
        if (!S.apiKey) { S.err = "needs api key"; showKeyInput(); }
        else if (String(e).includes("Failed to fetch")) S.err = "network/cors error — check connection";
        else S.err = String((e as Error).message || e).toLowerCase().slice(0, 60);
      } finally { S.writing = false; }
    }

    function parseLine(raw: string) {
      const segs: { text: string; kind: "plain" | "struck" | "em" }[] = [];
      let rest = raw;
      const re = /(~[^~]+~)|(\*[^*]+\*)/;
      while (rest.length) {
        const m = rest.match(re);
        if (!m) { segs.push({ text: rest, kind: "plain" }); break; }
        if (m.index! > 0) segs.push({ text: rest.slice(0, m.index), kind: "plain" });
        const tok = m[0];
        segs.push(tok[0] === "~"
          ? { text: tok.slice(1, -1), kind: "struck" }
          : { text: tok.slice(1, -1), kind: "em" });
        rest = rest.slice(m.index! + tok.length);
      }
      return segs;
    }

    async function typeLine(raw: string) {
      S.poem.push(raw.replace(/~[^~]+~\s*/g, "").replace(/\*/g, ""));
      const poemEl = $("poem");
      [...poemEl.children].forEach(el => {
        if (el.classList.contains("old")) el.classList.replace("old", "older");
        else if (el.classList.contains("line")) el.classList.add("old");
      });
      while (poemEl.querySelectorAll(".line").length > 9)
        poemEl.removeChild(poemEl.querySelector(".line")!);
      document.querySelectorAll("#cursor").forEach(c => c.remove());

      const lineEl = document.createElement("div");
      lineEl.className = "line shown";
      poemEl.appendChild(lineEl);
      const cursor = document.createElement("span");
      cursor.id = "cursor";

      for (const seg of parseLine(raw)) {
        const span = document.createElement("span");
        if (seg.kind === "struck") span.className = "struck";
        if (seg.kind === "em") {
          const em = document.createElement("em");
          span.appendChild(em);
          lineEl.appendChild(span); lineEl.appendChild(cursor);
          for (const ch of seg.text) { em.textContent += ch; await sleep(46 + Math.random() * 60); }
          continue;
        }
        lineEl.appendChild(span); lineEl.appendChild(cursor);
        for (const ch of seg.text) {
          span.textContent += ch;
          await sleep(seg.kind === "struck" ? 28 : 46 + Math.random() * 60);
        }
        if (seg.kind === "struck") await sleep(650);
      }
      cursor.remove();
      poemEl.appendChild(cursor.cloneNode());
      await sleep(700);
    }
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

    /* ───────── finalize: bind → title+annotate → manuscript page ───────── */
    async function titleAndAnnotate() {
      if (S.titledAt === S.poem.length && S.title) return; /* cached */
      const numbered = S.poem.map((l, i) => i + ": " + l).join("\n");
      const raw = await callClaude(
`Here is a poem that was improvised live from ukulele playing. Moods detected during the session, in order: ${S.moodHist.join(", ") || "unknown"}.

Poem (lines indexed from 0):
${numbered}

Return ONLY valid JSON (no markdown fences, no commentary) in exactly this shape:
{"title":"<a short evocative lowercase title, 2-5 words, no quotes inside>","annotations":[{"i":<line index>,"emotion":"<one lowercase word>","note":"<an emotional margin-note for that line, under 7 words, lowercase>"}]}

Annotate every line. Vary the emotion words — be precise (e.g. yearning, defiant, hushed, giddy), not generic.`);
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean) as {
        title?: string;
        annotations?: { i?: number; emotion?: string; note?: string }[];
      };
      S.title = (parsed.title || "untitled draft").trim();
      S.annotations = {};
      for (const a of (parsed.annotations || []))
        if (typeof a.i === "number")
          S.annotations[a.i] = { emotion: String(a.emotion || "").trim(), note: String(a.note || "").trim() };
      S.titledAt = S.poem.length;
    }

    function renderPage() {
      $("pTitle").textContent = S.title || "untitled draft";
      const stamp = new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
      $("pMeta").textContent = stamp + (S.moodHist.length ? "  ·  " + S.moodHist.join(" → ") : "");
      const wrap = $("pLines"); wrap.innerHTML = "";
      if (!S.poem.length) {
        wrap.innerHTML = "<div class='pline'>(the page is still blank — play something first)</div>";
      }
      S.poem.forEach((l, i) => {
        const row = document.createElement("div");
        row.className = "pline";
        const t = document.createElement("span");
        t.className = "ptext"; t.textContent = l;
        row.appendChild(t);
        const a = S.annotations[i];
        if (a && a.emotion) {
          row.classList.add("noted");
          const c = emotionColor(a.emotion);
          row.style.setProperty("--emC", `hsl(${c.h},${c.s}%,${c.l}%)`);
          row.style.setProperty("--emA", `hsla(${c.h},${c.s}%,${c.l}%,.14)`);
          const n = document.createElement("span");
          n.className = "pnote";
          n.textContent = a.emotion + (a.note ? " — " + a.note : "");
          row.appendChild(n);
        }
        wrap.appendChild(row);
      });
      const moodP = MOODS[S.moodHist.at(-1) || "wistful"] || MOODS.wistful;
      $("page").style.setProperty("--pg-bg-mood", `hsl(${moodP.h},30%,14%)`);
      if ($("page").classList.contains("theme-mood"))
        $("page").style.background = `hsl(${moodP.h},30%,14%)`;
      else $("page").style.background = "";
      $("pFoot").textContent = "rough draft · written live by a ukulele & a language model";
    }

    async function openFinal() {
      if (S.finalOpen) return;
      S.finalOpen = true;
      const bind = $("binding");
      bind.classList.remove("hidden"); bind.classList.add("fadein");
      let mi = 0;
      const cycle = setInterval(() => {
        mi = (mi + 1) % BIND_MSGS.length;
        $("bindMsg").textContent = BIND_MSGS[mi];
      }, 1100);
      const minWait = sleep(1600);
      try { if (S.poem.length) await Promise.race([titleAndAnnotate(), sleep(9000)]); }
      catch (e) {
        console.warn("title/annotate failed", e);
        if (!S.title) S.title = S.poem[0] ? S.poem[0].split(" ").slice(0, 4).join(" ") : "untitled draft";
      }
      await minWait;
      clearInterval(cycle);
      renderPage();
      bind.classList.add("hidden"); bind.classList.remove("fadein");
      const fin = $("final");
      fin.classList.remove("hidden"); fin.classList.add("fadein");
    }
    function closeFinal() {
      S.finalOpen = false;
      $("final").classList.add("hidden"); $("final").classList.remove("fadein");
    }

    /* customization segs */
    document.querySelectorAll<HTMLElement>(".seg[data-set]").forEach(seg => {
      seg.onclick = e => {
        const btn = (e.target as HTMLElement).closest("button");
        if (!btn) return;
        seg.querySelectorAll("button").forEach(b => b.classList.remove("on"));
        btn.classList.add("on");
        const set = seg.dataset.set!;
        const pg = $("page");
        [...pg.classList].forEach(c => { if (c.startsWith(set + "-")) pg.classList.remove(c); });
        pg.classList.add(btn.dataset.v!);
        if (set === "theme") renderPage();
      };
    });
    $("notesToggle").onclick = () => {
      S.notesOn = !S.notesOn;
      $("page").classList.toggle("notes-on", S.notesOn);
      $("notesToggle").textContent = "notes: " + (S.notesOn ? "on" : "hover");
    };

    /* share & export */
    function download(blob: Blob, name: string) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    }
    $("dlImage").onclick = async () => {
      try {
        const canvas = await html2canvas($("page"), { scale: 2, useCORS: true,
          backgroundColor: getComputedStyle($("page")).backgroundColor });
        canvas.toBlob(b => {
          if (!b) return;
          const file = new File([b], "rough-draft.png", { type: "image/png" });
          if (navigator.canShare && navigator.canShare({ files: [file] }))
            navigator.share({ files: [file], title: S.title || "rough draft" }).catch(() => download(b, "rough-draft.png"));
          else download(b, "rough-draft.png");
        }, "image/png");
      } catch (e) { console.error(e); alert("image capture failed — see console"); }
    };
    $("shareTweet").onclick = async () => {
      const btn = $("shareTweet"), orig = btn.textContent;
      const lines = S.poem.slice(0, 4).join("\n");
      const text = (S.title ? S.title + "\n\n" : "") + lines +
        (S.poem.length > 4 ? "\n…" : "") + "\n\n— written live by my ukulele";
      let note = "image downloaded — attach it";
      try {
        const canvas = await html2canvas($("page"), { scale: 2, useCORS: true,
          backgroundColor: getComputedStyle($("page")).backgroundColor });
        const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, "image/png"));
        if (blob && navigator.clipboard && window.ClipboardItem) {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          note = "image copied — paste it into the tweet";
        } else if (blob) download(blob, "rough-draft.png");
      } catch (e) {
        console.warn("image for tweet failed", e);
        try {
          const blob = await new Promise<Blob | null>(r =>
            html2canvas($("page"), { scale: 2 }).then(c => c.toBlob(r, "image/png")));
          if (blob) download(blob, "rough-draft.png");
        } catch { note = "couldn't make image — text only"; }
      }
      btn.textContent = note;
      setTimeout(() => { btn.textContent = orig; }, 4000);
      window.open("https://twitter.com/intent/tweet?text=" +
        encodeURIComponent(text.slice(0, 270)), "_blank");
    };
    $("dlPoem").onclick = () => {
      const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
      const txt = [(S.title || "untitled draft"), stamp, "", ...S.poem, "",
        S.moodHist.length ? ("moods heard: " + S.moodHist.join(" → ")) : "",
        "rough draft · written live by a ukulele & a language model"].join("\n");
      download(new Blob([txt], { type: "text/plain" }), "rough-draft-poem.txt");
    };
    $("dlAudio").onclick = () => {
      if (!S.recorder || (S.recorder.state !== "recording" && !S.recChunks.length)) {
        alert("no recording in this session (simulate mode has no audio)"); return;
      }
      const finish = () => {
        const type = S.recorder!.mimeType || "audio/webm";
        download(new Blob(S.recChunks, { type }),
          "rough-draft-recording." + (type.includes("ogg") ? "ogg" : "webm"));
      };
      if (S.recorder.state === "recording") {
        /* wait for the recorder to hand over the final chunk before assembling */
        S.recorder.addEventListener("dataavailable", () => setTimeout(finish, 0), { once: true });
        S.recorder.requestData();
      } else finish();
    };
    function resetDraft() {
      S.poem = []; S.moodHist = []; $("poem").innerHTML = "";
      S.title = null; S.annotations = {}; S.titledAt = -1;
      S.recChunks = [];
      if (S.recorder && S.recorder.state === "recording") {
        S.recorder.stop();
        setTimeout(() => { try { S.recChunks = []; S.recorder!.start(1000); } catch {} }, 200);
      }
      closeFinal();
      S.toast = "fresh page"; S.toastT = performance.now();
    }
    $("newDraft").onclick = resetDraft;
    $("newDraftTop").onclick = resetDraft;
    $("closeFinal").onclick = closeFinal;
    $("finishBtn").onclick = openFinal;

    /* ───────── inline key control (bottom bar) ───────── */
    function renderKey() {
      $("keyBtn").textContent = "key: " + (S.apiKey ? "●●·" + S.apiKey.slice(-4) : "blank");
    }
    function openKeyEdit() {
      $("keyField").style.display = ""; $("keyOk").style.display = "";
      $("keyDel").style.display = S.apiKey ? "" : "none";
      $<HTMLInputElement>("keyField").value = S.apiKey || ""; $("keyField").focus();
    }
    function closeKeyEdit() {
      $("keyField").style.display = "none"; $("keyOk").style.display = "none";
      $("keyDel").style.display = "none";
    }
    function showKeyInput() { openKeyEdit(); }
    $("keyBtn").onclick = () => {
      if ($("keyField").style.display === "none") openKeyEdit(); else closeKeyEdit();
    };
    $("keyOk").onclick = () => {
      S.apiKey = $<HTMLInputElement>("keyField").value.trim() || null;
      S.err = null; renderKey(); closeKeyEdit();
      S.toast = S.apiKey ? "key saved" : "key cleared"; S.toastT = performance.now();
    };
    $("keyDel").onclick = () => {
      S.apiKey = null; S.err = null; renderKey(); closeKeyEdit();
      S.toast = "key deleted"; S.toastT = performance.now();
    };
    $("keyField").onkeydown = e => {
      if (e.key === "Enter") $("keyOk").click();
      if (e.key === "Escape") closeKeyEdit();
    };
    renderKey();

    const onKeydown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "f" || e.key === "F") { if (S.finalOpen) closeFinal(); else openFinal(); }
      if ((e.key === "c" || e.key === "C") && S.running && !S.sim) { recalibrate(); }
      if (e.key === "]") {
        S.sens = Math.min(8, S.sens * 1.3);
        S.toast = "sensitivity gate × " + S.sens.toFixed(1) + " (stricter)"; S.toastT = performance.now();
      }
      if (e.key === "[") {
        S.sens = Math.max(.4, S.sens / 1.3);
        S.toast = "sensitivity gate × " + S.sens.toFixed(1) + " (looser)"; S.toastT = performance.now();
      }
    };
    document.addEventListener("keydown", onKeydown);

    /* ───────── simulate mode ───────── */
    let simPhase = 0, simScene = 0, simSceneT = 0;
    function simulateTick() {
      const now = performance.now();
      simPhase += 0.016;
      if (now - simSceneT > 20000) { simScene = (simScene + 1) % SIM_SCENES.length; simSceneT = now; }
      const sc = SIM_SCENES[simScene];
      S.rms = sc.rms + 0.015 * Math.sin(simPhase * 1.7) + Math.random() * 0.01;
      if (Math.random() < sc.chordP) {
        const ch = sc.chords[Math.floor(Math.random() * sc.chords.length)];
        S.chords.push({ name: ch.name, quality: ch.quality, root: 0, confidence: 1, t: now });
        S.lastChord = ch.name; S.curChord = ch.name; S.lastTonalT = now;
        S.silenceSince = now;
      }
      if (Math.random() < sc.strumP) { S.strums.push(now); S.silenceSince = now; firePulse(); }
      S.chords = S.chords.filter(c => now - c.t < WINDOW);
      S.strums = S.strums.filter(t => now - t < WINDOW);
      S.rmsPeak = Math.max(S.rmsPeak * 0.9995, S.rms, 0.03);
      document.documentElement.style.setProperty("--energy", energy().toFixed(3));
      document.body.classList.toggle("paused", now - S.silenceSince > PAUSE_AFTER);
      updateMood(now);
      renderStrip(now);
      maybeWrite(now);
    }

    /* ───────── boot ───────── */
    $("startBtn").onclick = async () => {
      $("gate").classList.add("hidden");
      S.running = true;
      try { await startMic(); }
      catch {
        alert("mic blocked. browsers only allow mic on localhost or https.\n\nrun locally:\n  npm run dev\nthen open http://localhost:3000");
        $("gate").classList.remove("hidden"); S.running = false;
      }
    };
    $("simBtn").onclick = () => {
      $("gate").classList.add("hidden");
      S.running = true; S.sim = true; simSceneT = performance.now();
      S.silenceSince = performance.now();
      requestAnimationFrame(loop);
    };

    return () => {
      S.running = false;
      document.removeEventListener("keydown", onKeydown);
      try { S.meyda?.stop(); } catch {}
      try { if (S.recorder && S.recorder.state === "recording") S.recorder.stop(); } catch {}
      S.micStream?.getTracks().forEach(t => t.stop());
      S.audio?.close().catch(() => {});
      document.body.classList.remove("paused");
    };
  }, []);

  return (
    <>
      <div id="wash"></div>
      <div id="grain"></div>

      <div id="stage"><div id="poem"></div></div>
      <button id="newDraftTop" title="wipe the page + restart recording">new draft</button>

      <div id="strip">
        <span id="status">waiting</span>
        <span>chord <b id="tChord">—</b></span>
        <span>strums/min <b id="tStrum">0</b></span>
        <span>energy <b id="tEnergy">0%</b></span>
        <span>minor <b id="tMinor">0%</b></span>
        <span><span id="moodDot"></span><b id="tMood">—</b></span>
        <div id="meter"><i></i><s id="gateTick"></s></div>
        <span id="keyCtl">
          <button id="keyBtn">key: blank</button>
          <input id="keyField" type="password" placeholder="sk-ant-…" style={{ display: "none" }} />
          <button id="keyOk" style={{ display: "none" }}>save</button>
          <button id="keyDel" style={{ display: "none" }}>delete</button>
        </span>
        <button id="finishBtn" title="or press F">finish draft</button>
      </div>

      <div className="overlay" id="gate">
        <h1>play, and it writes.<br />badly at first. that&apos;s the point.</h1>
        <p>a ukulele feeds a poet. it calibrates to the room, ignores talking,
           and listens for the actual chords you strum — major, minor, sus, the works.
           color is the mood it hears, pulses are your strums, and the draft revises
           itself in public. F finishes the draft · C recalibrates the room ·
           [ and ] adjust sensitivity. your api key lives in the bottom bar.</p>
        <div className="row">
          <button className="btn" id="startBtn">start listening</button>
          <button className="btn ghost" id="simBtn">simulate (no uke)</button>
        </div>
      </div>

      <div className="overlay hidden" id="binding">
        <div id="bindCursor"></div>
        <div id="bindMsg">binding the draft…</div>
      </div>

      <div className="overlay hidden" id="final">
        <div id="finalBar">
          <div className="seg" data-set="theme">
            <button data-v="theme-paper" className="on">paper</button>
            <button data-v="theme-ink">ink</button>
            <button data-v="theme-mood">mood</button>
          </div>
          <div className="seg" data-set="font">
            <button data-v="font-serif" className="on">serif</button>
            <button data-v="font-mono">mono</button>
            <button data-v="font-sans">sans</button>
          </div>
          <div className="seg" data-set="size">
            <button data-v="size-s">s</button>
            <button data-v="size-m" className="on">m</button>
            <button data-v="size-l">l</button>
          </div>
          <div className="seg" data-set="align">
            <button data-v="align-left" className="on">left</button>
            <button data-v="align-center">center</button>
          </div>
          <div className="seg">
            <button id="notesToggle">notes: hover</button>
          </div>
        </div>

        <div id="page" className="theme-paper font-serif size-m align-left">
          <div id="pTitle"></div>
          <div id="pMeta"></div>
          <div id="pLines"></div>
          <div id="pFoot"></div>
        </div>

        <div className="row">
          <button className="btn" id="dlImage">save as image</button>
          <button className="btn" id="shareTweet">share on x</button>
          <button className="btn ghost" id="dlPoem">poem .txt</button>
          <button className="btn ghost" id="dlAudio">recording</button>
          <button className="btn ghost" id="newDraft">new draft</button>
          <button className="btn ghost" id="closeFinal">keep playing</button>
        </div>
      </div>
    </>
  );
}
