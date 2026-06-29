import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
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
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0e14",
          color: "#f3ecdc",
          fontFamily: "Cormorant",
          fontStyle: "italic",
          fontSize: 52,
          paddingBottom: 6,
        }}
      >
        u
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
