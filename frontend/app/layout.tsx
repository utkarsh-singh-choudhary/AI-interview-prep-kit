import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "AI Interview Prep Kit", description: "Personalized interview preparation kits" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
