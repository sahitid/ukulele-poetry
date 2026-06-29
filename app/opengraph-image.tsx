import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt =
  "ukulele poetry — play a ukulele and a poem is written live as it listens";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const asset = (...p: string[]) => join(process.cwd(), ...p);

export default async function Image() {
  const [photoBuf, cormorant, mono] = await Promise.all([
    readFile(asset("public", "intro-poster.png")),
    readFile(asset("assets", "fonts", "Cormorant-Italic.woff")),
    readFile(asset("assets", "fonts", "JetBrainsMono.woff")),
  ]);
  const photo = Uint8Array.from(photoBuf).buffer;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: "#0b0e14",
        }}
      >
        {/* the photo */}
        {/* @ts-expect-error satori accepts ArrayBuffer for <img src> at runtime */}
        <img
          src={photo}
          width={size.width}
          height={size.height}
          style={{
            position: "absolute",
            inset: 0,
            width: size.width,
            height: size.height,
            objectFit: "cover",
          }}
        />

        {/* legibility wash */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(105deg, rgba(11,14,20,0.9) 0%, rgba(11,14,20,0.7) 42%, rgba(11,14,20,0.2) 78%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "linear-gradient(to top, rgba(11,14,20,0.8) 0%, rgba(11,14,20,0) 50%)",
          }}
        />

        {/* caption */}
        <div
          style={{
            position: "absolute",
            left: 84,
            bottom: 76,
            display: "flex",
            flexDirection: "column",
            maxWidth: 760,
          }}
        >
          <div
            style={{
              fontFamily: "JetBrains Mono",
              fontSize: 22,
              letterSpacing: 8,
              textTransform: "uppercase",
              color: "#e0b066",
              marginBottom: 18,
            }}
          >
            the instrument that writes
          </div>
          <div
            style={{
              fontFamily: "Cormorant",
              fontStyle: "italic",
              fontSize: 132,
              lineHeight: 1,
              color: "#f3ecdc",
              letterSpacing: -1,
            }}
          >
            ukulele poetry
          </div>
          <div
            style={{
              fontFamily: "JetBrains Mono",
              fontSize: 26,
              lineHeight: 1.5,
              color: "rgba(237,230,214,0.72)",
              marginTop: 26,
              maxWidth: 680,
            }}
          >
            play, and a few lines of a poem show up — written as it listens,
            crossed out, kept going. nothing here is meant to be finished.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Cormorant", data: cormorant, style: "italic", weight: 600 },
        { name: "JetBrains Mono", data: mono, style: "normal", weight: 400 },
      ],
    },
  );
}
