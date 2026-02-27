import JSZip from "jszip";
import plist from "plist";
import { parseBinaryPlist } from "./bplist-browser";
import { convertPngToStandard } from "./cgbi-png";

export interface FileEntry {
  path: string;
  name: string;
  size: number;
  isDirectory: boolean;
  children?: FileEntry[];
}

export interface IPAInfo {
  appName: string;
  bundleId: string;
  bundleDisplayName: string;
  bundleVersion: string;
  bundleShortVersion: string;
  minimumOSVersion: string;
  platformName: string;
  executable: string;
  supportedDevices: string[];
  iconFiles: string[];
  rawPlist: Record<string, unknown>;
  appIcon: string | null;
  fileTree: FileEntry;
  appPath: string;
}

function buildFileTree(zip: JSZip): FileEntry {
  const root: FileEntry = {
    path: "",
    name: "IPA Root",
    size: 0,
    isDirectory: true,
    children: [],
  };

  const entries: { path: string; size: number; isDir: boolean }[] = [];
  zip.forEach((relativePath, file) => {
    entries.push({
      path: relativePath,
      size: file.dir ? 0 : (file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize || 0,
      isDir: file.dir,
    });
  });

  entries.sort((a, b) => a.path.localeCompare(b.path));

  for (const entry of entries) {
    const parts = entry.path.replace(/\/$/, "").split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!current.children) current.children = [];

      let existing = current.children.find((c) => c.name === part);
      if (!existing) {
        existing = {
          path: parts.slice(0, i + 1).join("/"),
          name: part,
          size: isLast ? entry.size : 0,
          isDirectory: isLast ? entry.isDir : true,
          children: isLast && !entry.isDir ? undefined : [],
        };
        current.children.push(existing);
      }

      if (!isLast) {
        current = existing;
      }
    }
  }

  return root;
}

function parsePlistData(buffer: ArrayBuffer): Record<string, unknown> {
  const uint8 = new Uint8Array(buffer);
  const header = new TextDecoder().decode(uint8.slice(0, 6));

  if (header === "bplist") {
    // Binary plist — use browser-compatible binary parser
    return parseBinaryPlist(uint8);
  }

  // XML plist — decode as text and parse
  const text = new TextDecoder().decode(uint8).trim();
  if (!text.startsWith("<?xml") && !text.startsWith("<plist") && !text.startsWith("<!DOCTYPE")) {
    throw new Error("Unrecognized plist format");
  }
  return plist.parse(text) as Record<string, unknown>;
}

async function tryLoadIcon(
  zip: JSZip,
  path: string
): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  try {
    const uint8 = await file.async("uint8array");
    // Try CgBI conversion (also handles standard PNGs)
    const url = await convertPngToStandard(uint8);
    if (url) return url;
    // Fallback: try as raw blob (for JPEG or other formats)
    const buf = new ArrayBuffer(uint8.byteLength);
    new Uint8Array(buf).set(uint8);
    const blob = new Blob([buf], { type: "image/png" });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

async function findAppIcon(
  zip: JSZip,
  appPath: string,
  iconFiles: string[]
): Promise<string | null> {
  // Build candidate list from plist icon names
  const candidates = [
    ...iconFiles.map((f) => `${appPath}/${f}`),
    ...iconFiles.map((f) => `${appPath}/${f}@3x.png`),
    ...iconFiles.map((f) => `${appPath}/${f}@2x.png`),
    ...iconFiles.map((f) => `${appPath}/${f}.png`),
    `${appPath}/AppIcon60x60@3x.png`,
    `${appPath}/AppIcon60x60@2x.png`,
    `${appPath}/AppIcon76x76@2x~ipad.png`,
    `${appPath}/Icon-60@3x.png`,
    `${appPath}/Icon-60@2x.png`,
    `${appPath}/Icon@2x.png`,
    `${appPath}/Icon.png`,
  ];

  for (const candidate of candidates) {
    const url = await tryLoadIcon(zip, candidate);
    if (url) return url;
  }

  // Fallback: search for any AppIcon PNG in the app bundle
  const allFiles = Object.keys(zip.files);
  const iconPattern = /AppIcon.*\.png$/i;
  // Prefer larger icons (sort by name descending to get @3x before @2x)
  const iconMatches = allFiles
    .filter((f) => f.startsWith(appPath + "/") && iconPattern.test(f) && !zip.files[f].dir)
    .sort((a, b) => b.localeCompare(a));

  for (const iconPath of iconMatches) {
    const url = await tryLoadIcon(zip, iconPath);
    if (url) return url;
  }

  // Last resort: iTunesArtwork in IPA root (standard JPEG/PNG, not CgBI)
  for (const artworkPath of ["iTunesArtwork@2x", "iTunesArtwork"]) {
    const file = zip.file(artworkPath);
    if (file) {
      try {
        const blob = await file.async("blob");
        return URL.createObjectURL(blob);
      } catch {
        continue;
      }
    }
  }

  return null;
}

export async function parseIPA(file: File): Promise<{ info: IPAInfo; zip: JSZip }> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  const payloadFiles = Object.keys(zip.files);
  const appPath = payloadFiles.find(
    (f) => f.match(/^Payload\/[^/]+\.app\/$/)
  );

  if (!appPath) {
    throw new Error("Invalid IPA: No .app bundle found in Payload/");
  }

  const appPathClean = appPath.replace(/\/$/, "");
  const infoPlistPath = `${appPathClean}/Info.plist`;
  const infoPlistFile = zip.file(infoPlistPath);

  if (!infoPlistFile) {
    throw new Error("Invalid IPA: Info.plist not found");
  }

  const plistBuffer = await infoPlistFile.async("arraybuffer");
  let plistData: Record<string, unknown>;

  try {
    plistData = parsePlistData(plistBuffer);
  } catch {
    // Only try XML fallback if data actually looks like XML text
    const text = new TextDecoder().decode(new Uint8Array(plistBuffer)).trim();
    if (text.startsWith("<")) {
      try {
        plistData = plist.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error("Failed to parse Info.plist: unsupported format");
      }
    } else {
      throw new Error("Failed to parse Info.plist: unsupported binary format");
    }
  }

  const icons = plistData.CFBundleIcons as Record<string, unknown> | undefined;
  const primaryIcon = icons?.CFBundlePrimaryIcon as Record<string, unknown> | undefined;
  const iconFileNames = (primaryIcon?.CFBundleIconFiles as string[]) || [];

  const ipadIcons = plistData["CFBundleIcons~ipad"] as Record<string, unknown> | undefined;
  const ipadPrimary = ipadIcons?.CFBundlePrimaryIcon as Record<string, unknown> | undefined;
  const ipadIconFiles = (ipadPrimary?.CFBundleIconFiles as string[]) || [];

  const allIconFiles = [...new Set([...iconFileNames, ...ipadIconFiles])];

  const appIcon = await findAppIcon(zip, appPathClean, allIconFiles);

  const supportedDeviceFamilies = plistData.UIDeviceFamily as number[] | undefined;
  const devices: string[] = [];
  if (supportedDeviceFamilies) {
    if (supportedDeviceFamilies.includes(1)) devices.push("iPhone");
    if (supportedDeviceFamilies.includes(2)) devices.push("iPad");
  }

  const info: IPAInfo = {
    appName: (plistData.CFBundleName as string) || "",
    bundleId: (plistData.CFBundleIdentifier as string) || "",
    bundleDisplayName: (plistData.CFBundleDisplayName as string) || "",
    bundleVersion: (plistData.CFBundleVersion as string) || "",
    bundleShortVersion: (plistData.CFBundleShortVersionString as string) || "",
    minimumOSVersion: (plistData.MinimumOSVersion as string) || "",
    platformName: (plistData.DTPlatformName as string) || "iphoneos",
    executable: (plistData.CFBundleExecutable as string) || "",
    supportedDevices: devices,
    iconFiles: allIconFiles,
    rawPlist: plistData,
    appIcon,
    fileTree: buildFileTree(zip),
    appPath: appPathClean,
  };

  return { info, zip };
}

export async function rebuildIPA(
  zip: JSZip,
  appPath: string,
  modifiedPlist: Record<string, unknown>
): Promise<Blob> {
  const infoPlistPath = `${appPath}/Info.plist`;
  const xmlPlist = plist.build(modifiedPlist as plist.PlistValue);
  zip.file(infoPlistPath, xmlPlist);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
