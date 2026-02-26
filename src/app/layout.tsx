import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IPA Analyzer",
  description: "Analyze, inspect and modify iOS IPA files in the browser",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased select-none">
        {children}
      </body>
    </html>
  );
}
