"use client";

import React, { useState, useCallback, useEffect } from "react";

interface VirusTotalResult {
  harmless: number;
  malicious: number;
  suspicious: number;
  undetected: number;
  timeout: number;
  total: number;
  scanDate: string;
  permalink: string;
  sha256: string;
  engines: { name: string; result: string | null; category: string }[];
}

interface VirusTotalPanelProps {
  file: File | null;
}

const VT_KEY_STORAGE = "vt-api-key";

function formatHash(hash: string): string {
  return `${hash.slice(0, 16)}...${hash.slice(-8)}`;
}

async function computeSHA256(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function VirusTotalPanel({ file }: VirusTotalPanelProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [sha256, setSha256] = useState<string | null>(null);
  const [isHashing, setIsHashing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<VirusTotalResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(VT_KEY_STORAGE);
    if (stored) setApiKey(stored);
  }, []);

  useEffect(() => {
    setSha256(null);
    setResult(null);
    setError(null);
    setNotFound(false);
  }, [file]);

  const handleSaveKey = useCallback(() => {
    localStorage.setItem(VT_KEY_STORAGE, apiKey);
    setShowKeyInput(false);
  }, [apiKey]);

  const handleScan = useCallback(async () => {
    if (!file) return;

    if (!apiKey) {
      setShowKeyInput(true);
      return;
    }

    setError(null);
    setResult(null);
    setNotFound(false);

    let hash = sha256;
    if (!hash) {
      setIsHashing(true);
      try {
        hash = await computeSHA256(file);
        setSha256(hash);
      } catch (err) {
        setError("Failed to compute file hash: " + (err instanceof Error ? err.message : "unknown error"));
        setIsHashing(false);
        return;
      }
      setIsHashing(false);
    }

    setIsScanning(true);
    try {
      const res = await fetch(`/api/virustotal?hash=${hash}`, {
        headers: { "x-vt-api-key": apiKey },
      });

      const data = await res.json();

      if (data.notFound) {
        setNotFound(true);
        setIsScanning(false);
        return;
      }

      if (data.error) {
        setError(data.error);
        setIsScanning(false);
        return;
      }

      const attrs = data.data?.attributes;
      if (!attrs) {
        setError("Unexpected response from VirusTotal");
        setIsScanning(false);
        return;
      }

      const stats = attrs.last_analysis_stats || {};
      const results = attrs.last_analysis_results || {};

      const engines = Object.entries(results).map(
        ([name, info]: [string, unknown]) => {
          const engine = info as { result: string | null; category: string };
          return {
            name,
            result: engine.result,
            category: engine.category,
          };
        }
      );

      // Sort: malicious/suspicious first, then alphabetical
      engines.sort((a, b) => {
        const aWeight = a.category === "malicious" ? 0 : a.category === "suspicious" ? 1 : 2;
        const bWeight = b.category === "malicious" ? 0 : b.category === "suspicious" ? 1 : 2;
        if (aWeight !== bWeight) return aWeight - bWeight;
        return a.name.localeCompare(b.name);
      });

      setResult({
        harmless: stats.harmless || 0,
        malicious: stats.malicious || 0,
        suspicious: stats.suspicious || 0,
        undetected: stats.undetected || 0,
        timeout: stats.timeout || 0,
        total:
          (stats.harmless || 0) +
          (stats.malicious || 0) +
          (stats.suspicious || 0) +
          (stats.undetected || 0) +
          (stats.timeout || 0),
        scanDate: attrs.last_analysis_date
          ? new Date(attrs.last_analysis_date * 1000).toISOString().replace("T", " ").slice(0, 19)
          : "Unknown",
        permalink: `https://www.virustotal.com/gui/file/${hash}`,
        sha256: hash!,
        engines,
      });
    } catch (err) {
      setError("Failed to connect to VirusTotal: " + (err instanceof Error ? err.message : "unknown error"));
    } finally {
      setIsScanning(false);
    }
  }, [file, apiKey, sha256]);

  const detections = result ? result.malicious + result.suspicious : 0;
  const isClean = result && detections === 0;
  const isDangerous = result && detections > 0;

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="bg-muted px-4 py-2 border-b border-border flex items-center justify-between">
        <h3 className="text-xs font-bold tracking-wider uppercase">
          VirusTotal
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            title="Configure API key"
          >
            {apiKey ? "🔑" : "⚙️ set api key"}
          </button>
        </div>
      </div>

      {showKeyInput && (
        <div className="px-4 py-3 border-b border-border bg-muted/50">
          <p className="text-xs text-muted-foreground mb-2">
            enter your{" "}
            <a
              href="https://www.virustotal.com/gui/my-apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              VirusTotal API key
            </a>
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="paste api key here..."
              className="flex-1 bg-background border border-border rounded-md px-2 py-1 text-xs focus:outline-none focus:border-muted-foreground"
            />
            <button
              onClick={handleSaveKey}
              className="text-xs px-3 py-1 border border-border rounded-md hover:border-muted-foreground transition-colors"
            >
              save
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-3">
        {!result && !error && !notFound && (
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              {sha256 ? (
                <span>
                  sha256: <span className="text-foreground">{formatHash(sha256)}</span>
                </span>
              ) : (
                "check this ipa against virustotal threat database"
              )}
            </div>
            <button
              onClick={handleScan}
              disabled={isHashing || isScanning}
              className="text-xs px-3 py-1.5 border border-foreground rounded-md bg-foreground text-background hover:bg-transparent hover:text-foreground transition-colors disabled:opacity-50"
            >
              {isHashing ? "hashing..." : isScanning ? "scanning..." : "scan"}
            </button>
          </div>
        )}

        {notFound && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">⚠️</span>
              <span>file not found in virustotal database</span>
            </div>
            {sha256 && (
              <p className="text-xs text-muted-foreground">
                sha256: {formatHash(sha256)}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              this file has never been submitted to virustotal.{" "}
              <a
                href="https://www.virustotal.com/gui/home/upload"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                upload it manually
              </a>
              {" "}to get a scan report.
            </p>
            <button
              onClick={() => {
                setNotFound(false);
                setResult(null);
              }}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-destructive">
              <span>✕</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              dismiss
            </button>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm font-bold ${
                    isClean ? "text-green-400" : isDangerous ? "text-red-400" : "text-foreground"
                  }`}
                >
                  {detections}/{result.total}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 border rounded ${
                    isClean
                      ? "border-green-800 text-green-400"
                      : "border-red-800 text-red-400"
                  }`}
                >
                  {isClean ? "clean" : `${detections} detection${detections > 1 ? "s" : ""}`}
                </span>
              </div>
              <a
                href={result.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                view on virustotal ↗
              </a>
            </div>

            {/* Details */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>scan date: {result.scanDate}</p>
              <p>
                sha256: {formatHash(result.sha256)}
              </p>
            </div>

            {/* Detection bar */}
            <div className="w-full h-1.5 bg-muted flex overflow-hidden">
              {result.malicious > 0 && (
                <div
                  className="bg-red-500 h-full"
                  style={{ width: `${(result.malicious / result.total) * 100}%` }}
                />
              )}
              {result.suspicious > 0 && (
                <div
                  className="bg-yellow-500 h-full"
                  style={{ width: `${(result.suspicious / result.total) * 100}%` }}
                />
              )}
              {result.undetected > 0 && (
                <div
                  className="bg-muted-foreground/30 h-full"
                  style={{ width: `${(result.undetected / result.total) * 100}%` }}
                />
              )}
              {result.harmless > 0 && (
                <div
                  className="bg-green-500 h-full"
                  style={{ width: `${(result.harmless / result.total) * 100}%` }}
                />
              )}
            </div>

            {/* Stats breakdown */}
            <div className="flex gap-4 text-xs">
              <span className="text-red-400">⬤ {result.malicious} malicious</span>
              {result.suspicious > 0 && (
                <span className="text-yellow-400">⬤ {result.suspicious} suspicious</span>
              )}
              <span className="text-muted-foreground">⬤ {result.undetected} undetected</span>
              <span className="text-green-400">⬤ {result.harmless} harmless</span>
            </div>

            {/* Engine list (only show detections if any) */}
            {isDangerous && (
              <div className="border-t border-border pt-2 mt-2">
                <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider">
                  detections
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {result.engines
                    .filter((e) => e.category === "malicious" || e.category === "suspicious")
                    .map((engine) => (
                      <div
                        key={engine.name}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-muted-foreground">{engine.name}</span>
                        <span
                          className={
                            engine.category === "malicious"
                              ? "text-red-400"
                              : "text-yellow-400"
                          }
                        >
                          {engine.result || engine.category}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Rescan */}
            <button
              onClick={() => {
                setResult(null);
                setNotFound(false);
                setError(null);
              }}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              scan again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
