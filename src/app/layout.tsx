import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ankiconverter.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Anki to PDF Converter — Convert .apkg Flashcards to PDF Free",
  description:
    "Free online tool to convert Anki flashcards (.apkg files) to beautifully formatted PDF documents. No signup required. Works entirely in your browser.",
  applicationName: "Anki to PDF Converter",
  keywords: [
    "anki to pdf",
    "apkg to pdf",
    "convert anki cards",
    "anki flashcards pdf",
    "anki export pdf",
    "flashcard converter",
    "anki deck pdf",
  ],
  authors: [{ name: "Martin", url: "https://github.com/martinmalgor" }],
  creator: "Martin",
  publisher: "Anki to PDF Converter",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Anki to PDF Converter",
    description:
      "Convert your Anki flashcards (.apkg) to PDF instantly. Free, private, no upload to any server.",
    url: SITE_URL,
    siteName: "Anki to PDF Converter",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Anki to PDF Converter",
    description:
      "Convert your Anki flashcards (.apkg) to PDF instantly. Free, private, no upload to any server.",
    creator: "@techconmartin",
    site: "@techconmartin",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
