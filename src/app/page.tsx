import Converter from "@/components/Converter";

const GITHUB_PROFILE_URL = "https://github.com/martinmalgor";
const REPO_URL = "https://github.com/martinmalgor/ankiconverter";
const TWITTER_URL = "https://x.com/techconmartin";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://ankiconverter.vercel.app";

export default function Home() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Anki to PDF Converter",
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    description:
      "Convert Anki .apkg flashcards to printable PDF in your browser. Private, instant, and free.",
    creator: {
      "@type": "Person",
      name: "Martin",
      url: GITHUB_PROFILE_URL,
      sameAs: [GITHUB_PROFILE_URL, TWITTER_URL],
    },
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    sourceOrganization: {
      "@type": "Organization",
      name: "Anki to PDF Converter",
      url: REPO_URL,
    },
  };

  return (
    <main className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <h1 className="text-4xl sm:text-5xl font-bold text-center tracking-tight">
          Anki to PDF{" "}
          <span className="text-blue-600">Converter</span>
        </h1>
        <p className="mt-4 text-lg text-gray-500 text-center max-w-lg">
          Convert your Anki flashcards (.apkg) to a clean, printable PDF.
          Free, instant, and 100% private — your files never leave your browser.
        </p>

        <div className="mt-10 w-full">
          <Converter />
        </div>
      </section>

      {/* SEO content */}
      <section className="bg-white border-t border-gray-100 px-4 py-16">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">
            How It Works
          </h2>
          <div className="grid sm:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl mb-2">📤</div>
              <h3 className="font-semibold">1. Upload</h3>
              <p className="text-sm text-gray-500 mt-1">
                Drop your .apkg file exported from Anki
              </p>
            </div>
            <div>
              <div className="text-3xl mb-2">⚡</div>
              <h3 className="font-semibold">2. Convert</h3>
              <p className="text-sm text-gray-500 mt-1">
                We parse your deck and format each card
              </p>
            </div>
            <div>
              <div className="text-3xl mb-2">📄</div>
              <h3 className="font-semibold">3. Download</h3>
              <p className="text-sm text-gray-500 mt-1">
                Get a beautifully formatted PDF instantly
              </p>
            </div>
          </div>

          <div className="mt-12 space-y-6 text-sm text-gray-600">
            <h2 className="text-xl font-bold text-gray-900">
              Why Convert Anki Flashcards to PDF?
            </h2>
            <p>
              Anki is a powerful spaced repetition app, but sometimes you need
              your flashcards in a portable format. Whether you want to print
              them for offline study, share them with classmates who don&apos;t
              use Anki, or just have a backup — a PDF is the easiest way to do
              it.
            </p>
            <p>
              Our converter works entirely in your browser using WebAssembly.
              Your .apkg file is never uploaded to any server, making it
              completely private and secure. It supports any standard Anki deck
              export and handles HTML formatting, special characters, and
              multi-field notes.
            </p>
          </div>

          <div className="mt-10 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <h2 className="text-sm font-semibold text-gray-900">Project Links</h2>
            <p className="mt-2 text-sm text-gray-600">
              Built by Martin. Explore the repository, follow updates, or check
              the profile:
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <a
                href={GITHUB_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
              >
                GitHub Profile
              </a>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
              >
                Repository
              </a>
              <a
                href={TWITTER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
              >
                Twitter / X (@techconmartin)
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-gray-400 border-t border-gray-100">
        Anki to PDF Converter — Free &amp; Open Source
      </footer>
    </main>
  );
}
