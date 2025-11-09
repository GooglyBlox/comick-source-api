import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Comick Source API",
  description:
    "RESTful API for manga and comic metadata. Search across multiple sources, retrieve chapter lists, and monitor source health. Supports MangaPark, AsuraScan, AtsuMoe, and more.",
  keywords: [
    "manga",
    "comic",
    "api",
    "metadata",
    "scraper",
    "mangapark",
    "asurascan",
  ],
  authors: [{ name: "GooglyBlox" }],
  openGraph: {
    title: "Comick Source API",
    description: "RESTful API for manga and comic metadata",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
