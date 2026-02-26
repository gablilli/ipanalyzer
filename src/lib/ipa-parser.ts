import JSZip from "jszip";
import plist from "plist";

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

function parseBinaryPlist(buffer: ArrayBuffer): Record<string, unknown> {
  const uint8 = new Uint8Array(buffer);
  const header = new TextDecoder().decode(uint8.slice(0, 6));

  if (header === "bplist") {
    const nodeBuffer = Buffer.from(uint8);
    const parsed = plist.parse(nodeBuffer as unknown as string) as plist.PlistValue;
    const xml = plist.build(parsed);
    return plist.parse(xml) as Record<string, unknown>;
  }

  const text = new TextDecoder().decode(uint8);
  return plist.parse(text) as Record<string, unknown>;
}

async function findAppIcon(
  zip: JSZip,
  appPath: string,
  iconFiles: string[]
): Promise<string | null> {
  const candidates = [
    ...iconFiles.map((f) => `${appPath}/${f}`),
    ...iconFiles.map((f) => `${appPath}/${f}@2x.png`),
    ...iconFiles.map((f) => `${appPath}/${f}@3x.png`),
    ...iconFiles.map((f) => `${appPath}/${f}.png`),
    `${appPath}/AppIcon60x60@2x.png`,
    `${appPath}/AppIcon76x76@2x~ipad.png`,
    `${appPath}/AppIcon60x60@3x.png`,
    `${appPath}/Icon-60@2x.png`,
    `${appPath}/Icon-60@3x.png`,
    `${appPath}/Icon.png`,
    `${appPath}/Icon@2x.png`,
  ];

  for (const candidate of candidates) {
    const file = zip.file(candidate);
    if (file) {
      try {
        const blob = await file.async("blob");
        return URL.createObjectURL(blob);
      } catch {
        continue;
      }
    }
  }

  const iconPattern = /AppIcon.*\.png$/i;
  const allFiles = Object.keys(zip.files);
  const iconFile = allFiles.find(
    (f) => f.startsWith(appPath) && iconPattern.test(f)
  );
  if (iconFile) {
    const file = zip.file(iconFile);
    if (file) {
      try {
        const blob = await file.async("blob");
        return URL.createObjectURL(blob);
      } catch {
        return null;
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
    plistData = parseBinaryPlist(plistBuffer);
  } catch {
    const text = await infoPlistFile.async("text");
    plistData = plist.parse(text) as Record<string, unknown>;
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
