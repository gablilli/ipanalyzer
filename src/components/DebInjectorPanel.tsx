"use client";

import React, { useCallback, useState } from "react";
import { InjectedIPAFile } from "@/lib/ipa-parser";
import { extractDebAppFiles } from "@/lib/deb-injector";

interface DebInjectorPanelProps {
  ipaAppPath: string;
  onFilesReady: (files: InjectedIPAFile[] | null) => void;
}

export default function DebInjectorPanel({ ipaAppPath, onFilesReady }: DebInjectorPanelProps) {
  const [debName, setDebName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileCount, setFileCount] = useState(0);

  const handleDebSelected = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsProcessing(true);
      setError(null);
      setStatus(null);
      setDebName(file.name);

      try {
        const result = await extractDebAppFiles(file, ipaAppPath);
        onFilesReady(result.files);
        setFileCount(result.files.length);
        setStatus(`Injected ${result.files.length} files from ${result.appBundleName}`);
      } catch (err) {
        setFileCount(0);
        onFilesReady(null);
        setError(err instanceof Error ? err.message : "Failed to process DEB");
      } finally {
        setIsProcessing(false);
        event.target.value = "";
      }
    },
    [ipaAppPath, onFilesReady]
  );

  const handleClear = useCallback(() => {
    setDebName("");
    setStatus(null);
    setError(null);
    setFileCount(0);
    onFilesReady(null);
  }, [onFilesReady]);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-muted px-4 py-2 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-wider uppercase">DEB Injector</h3>
        {fileCount > 0 && (
          <button
            onClick={handleClear}
            className="text-xs px-3 py-1 border border-border rounded-md hover:border-muted-foreground transition-colors"
          >
            clear
          </button>
        )}
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs px-3 py-1.5 border border-border rounded-md hover:border-muted-foreground transition-colors cursor-pointer">
            {isProcessing ? "processing..." : "select .deb"}
            <input
              type="file"
              accept=".deb"
              className="hidden"
              onChange={handleDebSelected}
              disabled={isProcessing}
            />
          </label>
          {debName && <span className="text-xs text-muted-foreground truncate">{debName}</span>}
        </div>

        <p className="text-xs text-muted-foreground">
          Extracts <span className="text-foreground">data.tar(.gz)</span> from the DEB and overlays the package
          <span className="text-foreground"> .app</span> files into this IPA before download.
        </p>

        {status && <p className="text-xs text-green-400">{status}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
