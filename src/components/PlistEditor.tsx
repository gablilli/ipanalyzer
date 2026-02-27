"use client";

import React, { useState, useCallback } from "react";

interface PlistEditorProps {
  plistData: Record<string, unknown>;
  onSave: (data: Record<string, unknown>) => void;
}

function PlistValue({
  keyName,
  value,
  onChange,
  depth = 0,
}: {
  keyName: string;
  value: unknown;
  onChange: (key: string, newValue: unknown) => void;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = useState(depth < 1);

  if (value === null || value === undefined) {
    return (
      <div
        className="flex items-center gap-2 py-1 px-2 text-xs"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span className="text-muted-foreground w-48 shrink-0 truncate">{keyName}</span>
        <span className="text-muted-foreground/50 italic">null</span>
      </div>
    );
  }

  if (typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
    const obj = value as Record<string, unknown>;
    return (
      <div>
        <div
          className="flex items-center gap-2 py-1 px-2 text-xs hover:bg-accent/50 cursor-pointer"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="shrink-0">{isOpen ? "▼" : "▶"}</span>
          <span className="font-bold">{keyName}</span>
          <span className="text-muted-foreground">
            {`{${Object.keys(obj).length}}`}
          </span>
        </div>
        {isOpen && (
          <div>
            {Object.entries(obj).map(([k, v]) => (
              <PlistValue
                key={k}
                keyName={k}
                value={v}
                onChange={(childKey, newVal) => {
                  const newObj = { ...obj, [childKey]: newVal };
                  onChange(keyName, newObj);
                }}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div>
        <div
          className="flex items-center gap-2 py-1 px-2 text-xs hover:bg-accent/50 cursor-pointer"
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="shrink-0">{isOpen ? "▼" : "▶"}</span>
          <span className="font-bold">{keyName}</span>
          <span className="text-muted-foreground">[{value.length}]</span>
        </div>
        {isOpen && (
          <div>
            {value.map((item, index) => (
              <PlistValue
                key={index}
                keyName={`[${index}]`}
                value={item}
                onChange={(_, newVal) => {
                  const newArr = [...value];
                  newArr[index] = newVal;
                  onChange(keyName, newArr);
                }}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <div
        className="flex items-center gap-2 py-1 px-2 text-xs"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span className="text-muted-foreground w-48 shrink-0 truncate">{keyName}</span>
        <button
          className={`px-2 py-0.5 border rounded text-xs ${
            value ? "border-green-600 text-green-400" : "border-red-600 text-red-400"
          }`}
          onClick={() => onChange(keyName, !value)}
        >
          {value ? "true" : "false"}
        </button>
      </div>
    );
  }

  if (value instanceof Date) {
    return (
      <div
        className="flex items-center gap-2 py-1 px-2 text-xs"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span className="text-muted-foreground w-48 shrink-0 truncate">{keyName}</span>
        <span className="text-blue-400">{value.toISOString()}</span>
      </div>
    );
  }

  if (typeof value === "number") {
    return (
      <div
        className="flex items-center gap-2 py-1 px-2 text-xs"
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <span className="text-muted-foreground w-48 shrink-0 truncate">{keyName}</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(keyName, Number(e.target.value))}
          className="bg-transparent border border-border px-2 py-0.5 w-32 text-xs focus:outline-none focus:border-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 py-1 px-2 text-xs"
      style={{ paddingLeft: `${depth * 16 + 8}px` }}
    >
      <span className="text-muted-foreground w-48 shrink-0 truncate" title={keyName}>{keyName}</span>
      <input
        type="text"
        value={String(value)}
        onChange={(e) => onChange(keyName, e.target.value)}
        className="bg-transparent border border-border px-2 py-0.5 flex-1 text-xs focus:outline-none focus:border-muted-foreground min-w-0"
      />
    </div>
  );
}

export default function PlistEditor({ plistData, onSave }: PlistEditorProps) {
  const [data, setData] = useState<Record<string, unknown>>(
    JSON.parse(JSON.stringify(plistData))
  );
  const [hasChanges, setHasChanges] = useState(false);

  const handleChange = useCallback(
    (key: string, newValue: unknown) => {
      setData((prev) => {
        const newData = { ...prev, [key]: newValue };
        setHasChanges(true);
        return newData;
      });
    },
    []
  );

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-muted px-4 py-2 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-wider uppercase">
          Info.plist
        </h3>
        {hasChanges && (
          <button
            onClick={() => onSave(data)}
            className="text-xs px-3 py-1 border border-foreground rounded-md hover:bg-foreground hover:text-background transition-colors"
          >
            apply changes
          </button>
        )}
      </div>
      <div className="max-h-[500px] overflow-y-auto">
        {Object.entries(data).map(([key, value]) => (
          <PlistValue
            key={key}
            keyName={key}
            value={value}
            onChange={handleChange}
            depth={0}
          />
        ))}
      </div>
    </div>
  );
}
