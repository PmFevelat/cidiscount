import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Before / After snapshot",
  description: "Capture + redesign slider",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
