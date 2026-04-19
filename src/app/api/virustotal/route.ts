import { NextRequest, NextResponse } from "next/server";

const SHA256_PATTERN = /^[a-fA-F0-9]{64}$/;

export async function GET(request: NextRequest) {
  const hash = request.nextUrl.searchParams.get("hash");
  const apiKey = request.headers.get("x-vt-api-key");

  if (!hash || !apiKey) {
    return NextResponse.json(
      { error: "Missing hash or API key" },
      { status: 400 }
    );
  }

  if (!SHA256_PATTERN.test(hash)) {
    return NextResponse.json(
      { error: "Invalid SHA-256 hash" },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `https://www.virustotal.com/api/v3/files/${encodeURIComponent(hash)}`,
      {
        headers: {
          "x-apikey": apiKey,
          "Accept": "application/json",
        },
      }
    );

    if (response.status === 404) {
      return NextResponse.json({ notFound: true }, { status: 200 });
    }

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: `VirusTotal API error: ${response.status}`, details: text },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reach VirusTotal" },
      { status: 502 }
    );
  }
}
