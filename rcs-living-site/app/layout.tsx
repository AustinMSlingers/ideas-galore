import type { Metadata, Viewport } from "next";

import { baseInfo } from "@/lib/baseInfo";
import "./globals.css";

export const metadata: Metadata = {
  title: `${baseInfo.name} — ${baseInfo.tagline}`,
  description: baseInfo.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body text-body antialiased">{children}</body>
    </html>
  );
}
