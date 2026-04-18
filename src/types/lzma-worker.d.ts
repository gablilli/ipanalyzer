declare module "lzma/src/lzma_worker.js" {
  interface LzmaApi {
    decompress(
      byteArray: Uint8Array | number[],
      onFinish: (result: Uint8Array | number[] | null, error?: unknown) => void
    ): void;
  }

  const value: {
    LZMA?: LzmaApi;
    LZMA_WORKER?: LzmaApi;
  };

  export default value;
  export const LZMA: LzmaApi | undefined;
}
