# rough draft 🎶✍️

*the instrument that writes*

play a ukulele, and a poet writes along with you — live, in public, badly at first. that's the point.

this little app listens to the room, figures out the *mood* of what you're playing (joyful? brooding? frantic?), and asks Claude to scribble the next few lines of a poem. it second-guesses itself, crosses words out mid-line, and keeps going. when you're done, it binds everything into a tiny manuscript page you can save, share, or quietly delete forever.

it was built for an event called **Rough Draft** — a showcase for unfinished things.

## how it works

- 🎤 **it listens.** your mic feeds a pitch detector that's deliberately picky — it calibrates to the room's noise floor and only counts in-tune, held notes as music. talking gets ignored.
- 🎨 **it feels.** strums per minute, energy, harmonic darkness, and register get mashed into a mood. the whole screen washes itself in that mood's color.
- ✍️ **it writes.** every ~14 seconds, what it heard gets handed to Claude, who improvises the next 2–3 lines of the poem — lowercase, a little strange, occasionally striking out its own words.
- 📜 **it binds.** press **F** (or "finish draft") and the poem gets a title and tiny emotional margin notes, laid out on a manuscript page. pick paper or ink, serif or mono. save it as an image. tweet it. download the audio of your session.

## play with it

```bash
npm install
npm run dev
```

open [http://localhost:3000](http://localhost:3000), grab a ukulele (or hit **simulate** if you don't have one lying around), and click **start listening**.

you'll need an Anthropic API key for the poetry — there's a little `key:` button tucked into the bottom bar. it lives in memory only, never saved anywhere.

### tiny keyboard

| key | what it does |
|-----|--------------|
| `F` | finish the draft (or go back to playing) |
| `C` | recalibrate to the room |
| `[` / `]` | loosen / tighten the music gate |

## the bones

- [Next.js](https://nextjs.org) (app router) + [Tailwind CSS](https://tailwindcss.com)
- Web Audio API for pitch detection (autocorrelation, nothing fancy)
- [Claude](https://www.anthropic.com) as the poet
- [html2canvas](https://html2canvas.hertzen.com) for turning poems into pictures
- Cormorant Garamond & JetBrains Mono, because a poem deserves a nice outfit

the original single-file version lives in `reference/uke_poet.html`, preserved like a first draft should be.

## deploy

it's a Next.js app, so [Vercel](https://vercel.com/new) will take it as-is:

```bash
vercel
```

(mic access needs https or localhost — vercel gives you https for free, so you're covered.)

---

*rough draft · written live by a ukulele & a language model*
