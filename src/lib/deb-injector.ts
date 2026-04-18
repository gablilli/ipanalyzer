import { InjectedIPAFile } from "./ipa-parser";

interface ArEntry {
  name: string;
  data: Uint8Array;
}

interface TarEntry {
  path: string;
  data: Uint8Array;
}

function decodeAscii(bytes: Uint8Array): string {
  return new TextDecoder("ascii").decode(bytes);
}

function parseArEntries(bytes: Uint8Array): ArEntry[] {
  const signature = decodeAscii(bytes.slice(0, 8));
  if (signature !== "!<arch>\n") {
    throw new Error("Invalid DEB: missing ar archive header");
  }

  const entries: ArEntry[] = [];
  let offset = 8;
  while (offset + 60 <= bytes.length) {
    const header = bytes.slice(offset, offset + 60);
    const nameRaw = decodeAscii(header.slice(0, 16)).trim();
    const sizeRaw = decodeAscii(header.slice(48, 58)).trim();
    const size = parseInt(sizeRaw, 10);
    if (Number.isNaN(size) || !Number.isFinite(size) || size < 0) {
      throw new Error("Invalid DEB: malformed ar member size");
    }

    let dataStart = offset + 60;
    let memberName = nameRaw.replace(/\/$/, "");

    if (nameRaw.startsWith("#1/")) {
      const nameLength = parseInt(nameRaw.slice(3), 10);
      if (
        Number.isNaN(nameLength) ||
        !Number.isFinite(nameLength) ||
        nameLength < 0 ||
        dataStart + nameLength > bytes.length
      ) {
        throw new Error("Invalid DEB: malformed extended filename");
      }
      memberName = decodeAscii(bytes.slice(dataStart, dataStart + nameLength)).replace(/\0+$/, "");
      dataStart += nameLength;
    }

    const payloadSize = nameRaw.startsWith("#1/") ? size - (dataStart - (offset + 60)) : size;
    if (payloadSize < 0 || dataStart + payloadSize > bytes.length) {
      throw new Error("Invalid DEB: ar member payload out of range");
    }

    entries.push({
      name: memberName,
      data: bytes.slice(dataStart, dataStart + payloadSize),
    });

    offset = offset + 60 + size + (size % 2);
  }

  return entries;
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser does not support gzip decompression");
  }
  const payload = Uint8Array.from(data);
  const stream = new Blob([payload]).stream().pipeThrough(new DecompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function unlzma(data: Uint8Array): Promise<Uint8Array> {
  const lzmajs = await import("lzma-purejs");
  const result = lzmajs.default.decompressFile(data) as Uint8Array | number[];
  return result instanceof Uint8Array ? result : new Uint8Array(result);
}

function readTarString(bytes: Uint8Array, start: number, length: number): string {
  const end = start + length;
  let i = start;
  while (i < end && bytes[i] !== 0) i++;
  return decodeAscii(bytes.slice(start, i));
}

function parseTarOctal(bytes: Uint8Array, start: number, length: number): number {
  const raw = readTarString(bytes, start, length).trim().replace(/\0/g, "");
  if (!raw) return 0;
  return parseInt(raw, 8);
}

function parseTarEntries(bytes: Uint8Array): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= bytes.length) {
    const header = bytes.slice(offset, offset + 512);
    const isZeroBlock = header.every((b) => b === 0);
    if (isZeroBlock) break;

    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const typeFlag = readTarString(header, 156, 1);
    const size = parseTarOctal(header, 124, 12);

    const fullPath = `${prefix ? `${prefix}/` : ""}${name}`.replace(/^\.?\//, "");
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > bytes.length) {
      throw new Error("Invalid DEB: tar member out of range");
    }

    if (typeFlag === "" || typeFlag === "0") {
      entries.push({
        path: fullPath,
        data: bytes.slice(dataStart, dataEnd),
      });
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  return entries;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.?\//, "");
}

export async function extractDebAppFiles(
  debFile: File,
  ipaAppPath: string
): Promise<{ files: InjectedIPAFile[]; appBundleName: string; multipleAppBundles: boolean }> {
  const debBytes = new Uint8Array(await debFile.arrayBuffer());
  const arEntries = parseArEntries(debBytes);
  const dataEntry = arEntries.find((entry) => /^data\.tar(\..+)?$/.test(entry.name));

  if (!dataEntry) {
    throw new Error("Invalid DEB: data.tar archive not found");
  }

  let tarBytes = dataEntry.data;
  if (dataEntry.name.endsWith(".gz")) {
    tarBytes = await gunzip(dataEntry.data);
  } else if (dataEntry.name.endsWith(".lzma")) {
    tarBytes = await unlzma(dataEntry.data);
  } else if (dataEntry.name !== "data.tar") {
    throw new Error(`Unsupported DEB compression: ${dataEntry.name}`);
  }

  const tarEntries = parseTarEntries(tarBytes);
  const appCandidates = new Map<string, { relPath: string; data: Uint8Array }[]>();

  for (const entry of tarEntries) {
    const normalized = normalizePath(entry.path);
    const match = normalized.match(/(?:^|\/)([^/]+\.app)\/(.+)$/);
    if (!match) continue;
    const appName = match[1];
    const relPath = match[2];
    if (!appCandidates.has(appName)) {
      appCandidates.set(appName, []);
    }
    appCandidates.get(appName)!.push({ relPath, data: entry.data });
  }

  if (appCandidates.size === 0) {
    throw new Error("No .app payload found inside DEB data.tar");
  }

  const selected = Array.from(appCandidates.entries()).sort((a, b) => b[1].length - a[1].length)[0];
  if (!selected) {
    throw new Error("No .app payload found inside DEB data.tar");
  }
  const [appBundleName, selectedFiles] = selected;

  const files: InjectedIPAFile[] = selectedFiles.map((f) => ({
    path: `${ipaAppPath}/${f.relPath}`,
    data: f.data,
  }));

  return { files, appBundleName, multipleAppBundles: appCandidates.size > 1 };
}
