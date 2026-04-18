declare module "lzma-purejs" {
  const lzmajs: {
    decompressFile(input: Uint8Array | number[]): Uint8Array | number[];
  };

  export default lzmajs;
}
