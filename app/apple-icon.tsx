import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const cormorant = await readFile(
    join(process.cwd(), "assets", "fonts", "Cormorant-Italic.woff"),
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0e14",
          color: "#f3ecdc",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Cormorant",
            fontStyle: "italic",
            fontSize: 132,
            lineHeight: 1,
          }}
        >
          u
        </div>
        <div
          style={{
            display: "flex",
            width: 64,
            height: 4,
            borderRadius: 2,
            marginTop: 8,
            background: "#e0b066",
          }}
        />
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Cormorant", data: cormorant, style: "italic", weight: 600 },
      ],
    },
  );
}
