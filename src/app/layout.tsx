import type { Metadata } from "next";
import { Bricolage_Grotesque, Manrope, Geist_Mono } from "next/font/google";
import "./globals.css";

const heading = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
});

const body = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AssetFlow — Enterprise Asset Management",
  description: "Track, allocate, book, and audit organizational assets.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${heading.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
