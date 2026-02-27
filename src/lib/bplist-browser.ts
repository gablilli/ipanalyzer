/**
 * Browser-compatible binary plist parser.
 * Adapted from bplist-parser (MIT License) by joeferner.
 * Original: https://github.com/joeferner/node-bplist-parser
 *
 * Stripped of Node.js `fs` dependency and `big-integer` for browser use.
 * Uses DataView for reading binary data from ArrayBuffer.
 */

const EPOCH = 978307200000;
const MAX_OBJECT_SIZE = 100 * 1000 * 1000;
const MAX_OBJECT_COUNT = 32768;

export function parseBinaryPlist(data: Uint8Array): Record<string, unknown> {
  const header = new TextDecoder().decode(data.slice(0, 6));
  if (header !== "bplist") {
    throw new Error("Invalid binary plist. Expected 'bplist' at offset 0.");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const trailerStart = data.length - 32;

  const offsetSize = data[trailerStart + 6];
  const objectRefSize = data[trailerStart + 7];
  const numObjects = view.getUint32(trailerStart + 12);
  const topObject = view.getUint32(trailerStart + 20);
  const offsetTableOffset = view.getUint32(trailerStart + 28);

  if (numObjects > MAX_OBJECT_COUNT) {
    throw new Error("maxObjectCount exceeded");
  }

  const offsetTable: number[] = [];
  for (let i = 0; i < numObjects; i++) {
    offsetTable[i] = readUIntFromBytes(data, offsetTableOffset + i * offsetSize, offsetSize);
  }

  function parseObject(tableOffset: number): unknown {
    const offset = offsetTable[tableOffset];
    const type = data[offset];
    const objType = (type & 0xf0) >> 4;
    const objInfo = type & 0x0f;

    switch (objType) {
      case 0x0:
        return parseSimple(objInfo);
      case 0x1:
        return parseInteger(offset, objInfo);
      case 0x2:
        return parseReal(offset, objInfo);
      case 0x3:
        return parseDate(offset);
      case 0x4:
        return parseData(offset, objInfo);
      case 0x5:
        return parsePlistString(offset, objInfo, false);
      case 0x6:
        return parsePlistString(offset, objInfo, true);
      case 0x8:
        return parseUID(offset, objInfo);
      case 0xa:
        return parseArray(offset, objInfo);
      case 0xd:
        return parseDictionary(offset, objInfo);
      default:
        throw new Error("Unhandled type 0x" + objType.toString(16));
    }
  }

  function parseSimple(objInfo: number): unknown {
    switch (objInfo) {
      case 0x0:
        return null;
      case 0x8:
        return false;
      case 0x9:
        return true;
      case 0xf:
        return null;
      default:
        throw new Error("Unhandled simple type 0x" + objInfo.toString(16));
    }
  }

  function parseInteger(offset: number, objInfo: number): number {
    const length = Math.pow(2, objInfo);
    if (length > MAX_OBJECT_SIZE) {
      throw new Error("Integer too large");
    }
    let result = 0;
    for (let i = 0; i < length; i++) {
      result = result * 256 + data[offset + 1 + i];
    }
    // Handle signed integers for 4+ byte values
    if (length >= 4 && data[offset + 1] & 0x80) {
      result -= Math.pow(2, length * 8);
    }
    return result;
  }

  function parseReal(offset: number, objInfo: number): number {
    const length = Math.pow(2, objInfo);
    if (length > MAX_OBJECT_SIZE) {
      throw new Error("Real too large");
    }
    if (length === 4) {
      return view.getFloat32(offset + 1);
    }
    if (length === 8) {
      return view.getFloat64(offset + 1);
    }
    return 0;
  }

  function parseDate(offset: number): Date {
    const timestamp = view.getFloat64(offset + 1);
    return new Date(EPOCH + 1000 * timestamp);
  }

  function parseData(offset: number, objInfo: number): Uint8Array {
    let dataoffset = 1;
    let length = objInfo;
    if (objInfo === 0xf) {
      const r = readLengthField(offset);
      dataoffset = r.offset;
      length = r.length;
    }
    if (length > MAX_OBJECT_SIZE) {
      throw new Error("Data too large");
    }
    return data.slice(offset + dataoffset, offset + dataoffset + length);
  }

  function parsePlistString(offset: number, objInfo: number, isUtf16: boolean): string {
    let stroffset = 1;
    let length = objInfo;
    if (objInfo === 0xf) {
      const r = readLengthField(offset);
      stroffset = r.offset;
      length = r.length;
    }
    if (isUtf16) {
      const byteLen = length * 2;
      if (byteLen > MAX_OBJECT_SIZE) {
        throw new Error("String too large");
      }
      const strBytes = data.slice(offset + stroffset, offset + stroffset + byteLen);
      // UTF-16 BE → string via TextDecoder
      return new TextDecoder("utf-16be").decode(strBytes);
    } else {
      if (length > MAX_OBJECT_SIZE) {
        throw new Error("String too large");
      }
      return new TextDecoder("utf-8").decode(
        data.slice(offset + stroffset, offset + stroffset + length)
      );
    }
  }

  function parseUID(offset: number, objInfo: number): { UID: number } {
    const length = objInfo + 1;
    if (length > MAX_OBJECT_SIZE) {
      throw new Error("UID too large");
    }
    return { UID: readUIntFromBytes(data, offset + 1, length) };
  }

  function parseArray(offset: number, objInfo: number): unknown[] {
    let arrayoffset = 1;
    let length = objInfo;
    if (objInfo === 0xf) {
      const r = readLengthField(offset);
      arrayoffset = r.offset;
      length = r.length;
    }
    if (length * objectRefSize > MAX_OBJECT_SIZE) {
      throw new Error("Array too large");
    }
    const arr: unknown[] = [];
    for (let i = 0; i < length; i++) {
      const objRef = readUIntFromBytes(data, offset + arrayoffset + i * objectRefSize, objectRefSize);
      arr.push(parseObject(objRef));
    }
    return arr;
  }

  function parseDictionary(offset: number, objInfo: number): Record<string, unknown> {
    let dictoffset = 1;
    let length = objInfo;
    if (objInfo === 0xf) {
      const r = readLengthField(offset);
      dictoffset = r.offset;
      length = r.length;
    }
    if (length * 2 * objectRefSize > MAX_OBJECT_SIZE) {
      throw new Error("Dictionary too large");
    }
    const dict: Record<string, unknown> = {};
    for (let i = 0; i < length; i++) {
      const keyRef = readUIntFromBytes(data, offset + dictoffset + i * objectRefSize, objectRefSize);
      const valRef = readUIntFromBytes(
        data,
        offset + dictoffset + length * objectRefSize + i * objectRefSize,
        objectRefSize
      );
      const key = parseObject(keyRef) as string;
      const val = parseObject(valRef);
      dict[key] = val;
    }
    return dict;
  }

  function readLengthField(offset: number): { offset: number; length: number } {
    const intType = data[offset + 1];
    const intInfo = intType & 0x0f;
    const intLength = Math.pow(2, intInfo);
    const length = readUIntFromBytes(data, offset + 2, intLength);
    return { offset: 2 + intLength, length };
  }

  const result = parseObject(topObject);
  return (result ?? {}) as Record<string, unknown>;
}

function readUIntFromBytes(data: Uint8Array, start: number, length: number): number {
  let val = 0;
  for (let i = 0; i < length; i++) {
    val = val * 256 + data[start + i];
  }
  return val;
}
