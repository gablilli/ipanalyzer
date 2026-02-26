"use client";

import React, { useState } from "react";
import { FileEntry } from "@/lib/ipa-parser";

interface FileTreeProps {
  tree: FileEntry;
}

function FileNode({ entry, depth = 0 }: { entry: FileEntry; depth?: number }) {
  const [isOpen, setIsOpen] = useState(depth < 2);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (name: string, isDir: boolean) => {
    if (isDir) return isOpen ? "📂" : "📁";
    if (name.endsWith(".plist")) return "📋";
    if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "🖼️";
    if (name.endsWith(".strings") || name.endsWith(".lproj")) return "🌐";
    if (name.endsWith(".nib") || name.endsWith(".storyboardc")) return "🎨";
    if (name.endsWith(".car")) return "📦";
    if (name.endsWith(".dylib") || name.endsWith(".framework")) return "⚙️";
    if (name.endsWith(".bundle")) return "📎";
    if (name.endsWith(".ttf") || name.endsWith(".otf") || name.endsWith(".woff")) return "🔤";
    if (name.endsWith(".js") || name.endsWith(".json")) return "📄";
    if (name.endsWith(".mobileprovision")) return "🔐";
    return "📄";
  };

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-0.5 px-2 hover:bg-accent/50 cursor-pointer text-xs`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => entry.isDirectory && setIsOpen(!isOpen)}
      >
        <span className="shrink-0">
          {getFileIcon(entry.name, entry.isDirectory)}
        </span>
        <span className="truncate flex-1">{entry.name}</span>
        {!entry.isDirectory && entry.size > 0 && (
          <span className="text-muted-foreground shrink-0">
            {formatSize(entry.size)}
          </span>
        )}
      </div>
      {entry.isDirectory && isOpen && entry.children && (
        <div>
          {entry.children.map((child, i) => (
            <FileNode key={`${child.path}-${i}`} entry={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({ tree }: FileTreeProps) {
  return (
    <div className="border border-border overflow-hidden">
      <div className="bg-muted px-4 py-2 border-b border-border">
        <h3 className="text-xs font-bold tracking-wider uppercase">
          File Structure
        </h3>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {tree.children?.map((child, i) => (
          <FileNode key={`${child.path}-${i}`} entry={child} depth={0} />
        ))}
      </div>
    </div>
  );
}
