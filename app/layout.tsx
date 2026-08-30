import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skylark BI Agent — Monday.com Business Intelligence",
  description: "AI-powered business intelligence agent for Skylark Drones deals pipeline and work order tracking. Query your monday.com data with natural language.",
  keywords: ["Skylark Drones", "Business Intelligence", "Monday.com", "AI Agent", "Deal Pipeline", "Work Orders"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
