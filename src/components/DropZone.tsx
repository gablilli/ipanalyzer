"use client";

import React, { useCallback, useState } from "react";

interface DropZoneProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
}

export default function DropZone({ onFileSelected, isLoading }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.name.endsWith(".ipa")) {
          onFileSelected(file);
        }
      }
    },
    [onFileSelected]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        onFileSelected(files[0]);
      }
    },
    [onFileSelected]
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8 p-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-wider uppercase">
          IPA Analyzer
        </h1>
        <p className="text-muted-foreground text-sm tracking-wide">
          analyze, inspect & modify iOS apps in the browser
        </p>
      </div>

      <div
        onDragEnter={handleDragIn}
        onDragLeave={handleDragOut}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`
          w-full max-w-lg border border-dashed rounded-xl p-8 sm:p-16
          flex flex-col items-center justify-center gap-4
          transition-colors duration-200 cursor-pointer
          ${isDragging ? "border-foreground bg-accent/50" : "border-border hover:border-muted-foreground"}
          ${isLoading ? "opacity-50 pointer-events-none" : ""}
        `}
        onClick={() => document.getElementById("file-input")?.click()}
      >
        {isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-6 h-6 border border-foreground border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">analyzing ipa...</p>
          </div>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              className="text-muted-foreground"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-sm text-muted-foreground">
              drop .ipa file here or click to browse
            </p>
            <p className="text-xs text-muted-foreground/50">
              supports iOS .ipa files
            </p>
          </>
        )}
      </div>

      <input
        id="file-input"
        type="file"
        accept=".ipa"
        className="hidden"
        onChange={handleFileInput}
      />

      <p className="text-xs text-muted-foreground/40">
        star it ❤️! —{" "}
        <a
          href="https://github.com/gablilli/ipanalyzer"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-muted-foreground transition-colors"
        >
          github.com/gablilli/ipanalyzer
        </a>
      </p>
    </div>
  );
}
