"use client";

import React from "react";
import { IPAInfo } from "@/lib/ipa-parser";

interface AppDetailsProps {
  info: IPAInfo;
}

export default function AppDetails({ info }: AppDetailsProps) {
  const details = [
    { label: "Bundle Name", value: info.appName },
    { label: "Display Name", value: info.bundleDisplayName },
    { label: "Bundle ID", value: info.bundleId },
    { label: "Version", value: info.bundleShortVersion },
    { label: "Build", value: info.bundleVersion },
    { label: "Min iOS", value: info.minimumOSVersion },
    { label: "Platform", value: info.platformName },
    { label: "Executable", value: info.executable },
    { label: "Devices", value: info.supportedDevices.join(", ") || "Unknown" },
  ];

  return (
    <div className="border border-border overflow-hidden">
      <div className="bg-muted px-4 py-2 border-b border-border">
        <h3 className="text-xs font-bold tracking-wider uppercase">
          App Details
        </h3>
      </div>
      <div className="flex flex-col sm:flex-row">
        {info.appIcon && (
          <div className="p-6 flex items-center justify-center border-b sm:border-b-0 sm:border-r border-border">
            <img
              src={info.appIcon}
              alt="App Icon"
              className="w-24 h-24 object-contain"
              style={{ imageRendering: "auto" }}
            />
          </div>
        )}
        <div className="flex-1 divide-y divide-border">
          {details.map((detail) => (
            <div
              key={detail.label}
              className="flex items-center px-4 py-2 text-xs"
            >
              <span className="text-muted-foreground w-32 shrink-0 uppercase tracking-wide">
                {detail.label}
              </span>
              <span className="truncate" title={detail.value}>
                {detail.value || "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
