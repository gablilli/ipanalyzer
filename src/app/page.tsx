"use client";

import React, { useState, useCallback } from "react";
import JSZip from "jszip";
import DropZone from "@/components/DropZone";
import AppDetails from "@/components/AppDetails";
import FileTree from "@/components/FileTree";
import PlistEditor from "@/components/PlistEditor";
import VirusTotalPanel from "@/components/VirusTotalPanel";
import DebInjectorPanel from "@/components/DebInjectorPanel";
import { parseIPA, rebuildIPA, IPAInfo, InjectedIPAFile } from "@/lib/ipa-parser";

export default function Home() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ipaInfo, setIpaInfo] = useState<IPAInfo | null>(null);
  const [zip, setZip] = useState<JSZip | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState(false);
  const [modifiedPlist, setModifiedPlist] = useState<Record<string, unknown> | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [injectedFiles, setInjectedFiles] = useState<InjectedIPAFile[] | null>(null);

  const handleFileSelected = useCallback(async (file: File) => {
    setIsLoading(true);
    setError(null);
    setModifiedPlist(null);
    setInjectedFiles(null);
    setFileName(file.name);
    setCurrentFile(file);

    try {
      const result = await parseIPA(file);
      setIpaInfo(result.info);
      setZip(result.zip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse IPA file");
      setIpaInfo(null);
      setZip(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handlePlistSave = useCallback((data: Record<string, unknown>) => {
    setModifiedPlist(data);
  }, []);

  const handleDownload = useCallback(async () => {
    if (!zip || !ipaInfo) return;

    setIsDownloading(true);
    try {
      const plistToUse = modifiedPlist || ipaInfo.rawPlist;
      const blob = await rebuildIPA(zip, ipaInfo.appPath, plistToUse, injectedFiles || []);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName.endsWith(".ipa")
        ? fileName.slice(0, -4) + "_modified.ipa"
        : fileName + "_modified";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rebuild IPA");
    } finally {
      setIsDownloading(false);
    }
  }, [zip, ipaInfo, modifiedPlist, injectedFiles, fileName]);

  const handleReset = useCallback(() => {
    setIpaInfo(null);
    setZip(null);
    setError(null);
    setModifiedPlist(null);
    setInjectedFiles(null);
    setFileName("");
    setCurrentFile(null);
  }, []);

  if (!ipaInfo) {
    return (
      <div>
        <DropZone onFileSelected={handleFileSelected} isLoading={isLoading} />
        {error && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-destructive/10 border border-destructive rounded-md text-destructive px-4 py-2 text-xs">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <h1
              className="text-sm font-bold tracking-wider uppercase cursor-pointer hover:text-muted-foreground transition-colors shrink-0"
              onClick={handleReset}
            >
              IPA Analyzer
            </h1>
            <span className="text-xs text-muted-foreground truncate min-w-0">
              / {fileName}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleReset}
              className="text-xs px-2.5 py-1.5 border border-border rounded-md hover:border-muted-foreground transition-colors"
            >
              new file
            </button>
            <button
              onClick={handleDownload}
              disabled={isDownloading}
              className="text-xs px-2.5 py-1.5 border border-foreground rounded-md bg-foreground text-background hover:bg-transparent hover:text-foreground transition-colors disabled:opacity-50"
            >
              {isDownloading
                ? "building..."
                : modifiedPlist || (injectedFiles && injectedFiles.length > 0)
                  ? "download modified"
                  : "download ipa"}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4 sm:space-y-6">
        <AppDetails info={ipaInfo} />
        <VirusTotalPanel file={currentFile} />
        <DebInjectorPanel ipaAppPath={ipaInfo.appPath} onFilesReady={setInjectedFiles} />
        <PlistEditor
          key={fileName}
          plistData={modifiedPlist || ipaInfo.rawPlist}
          onSave={handlePlistSave}
        />
        <FileTree tree={ipaInfo.fileTree} />

        {(modifiedPlist || (injectedFiles && injectedFiles.length > 0)) && (
          <div className="border border-green-800 bg-green-900/10 rounded-md px-4 py-3 text-xs text-green-400 flex items-center justify-between">
            <span>
              changes pending — download to apply
              {injectedFiles && injectedFiles.length > 0 ? ` (${injectedFiles.length} DEB files)` : ""}
            </span>
            <button
              onClick={() => {
                setModifiedPlist(null);
                setInjectedFiles(null);
              }}
              className="text-xs underline hover:no-underline"
            >
              discard
            </button>
          </div>
        )}
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-destructive/10 border border-destructive rounded-md text-destructive px-4 py-2 text-xs">
          {error}
        </div>
      )}
    </div>
  );
}
