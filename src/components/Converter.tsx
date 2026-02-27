"use client";

import { useState, useCallback } from "react";
import { parseApkg, ParseResult } from "@/lib/parseApkg";
import { generatePdf, PdfDiagnostics } from "@/lib/generatePdf";

type Status = "idle" | "parsing" | "ready" | "generating" | "error";

export default function Converter() {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [diagnostics, setDiagnostics] = useState<PdfDiagnostics | null>(null);

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".apkg")) {
      setError("Please upload a valid .apkg file exported from Anki.");
      setStatus("error");
      return;
    }

    setStatus("parsing");
    setError("");
    setFileName(file.name.replace(".apkg", ""));

    try {
      const parsed = await parseApkg(file);
      setResult(parsed);
      setStatus("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse file.");
      setStatus("error");
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleDownload = async () => {
    if (!result) return;
    setStatus("generating");
    try {
      const diag = await generatePdf(result, fileName);
      setDiagnostics(diag);
      setStatus("ready");
    } catch {
      setError("Failed to generate PDF.");
      setStatus("error");
    }
  };

  const handleReset = () => {
    setStatus("idle");
    setResult(null);
    setFileName("");
    setError("");
    setDiagnostics(null);
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Upload zone */}
      {status === "idle" || status === "error" ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center w-full h-52 border-2 border-dashed rounded-2xl cursor-pointer transition-colors ${
            dragOver
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-blue-400 hover:bg-gray-50"
          }`}
        >
          <svg
            className="w-10 h-10 mb-3 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-sm text-gray-600 font-medium">
            Drop your <span className="font-semibold text-blue-600">.apkg</span>{" "}
            file here or click to browse
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Your file never leaves your browser
          </p>
          <input
            type="file"
            accept=".apkg"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      ) : null}

      {/* Parsing state */}
      {status === "parsing" && (
        <div className="flex flex-col items-center py-12">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-sm text-gray-600">
            Reading your Anki deck...
          </p>
        </div>
      )}

      {/* Ready state */}
      {(status === "ready" || status === "generating") && (
        <div className="text-center">
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="text-4xl mb-2">✅</div>
            <h3 className="text-lg font-semibold">{fileName}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {result?.cards.length} cards · {Object.keys(result?.images ?? {}).length} images
            </p>

            {/* Preview */}
            <div className="mt-4 text-left bg-gray-50 rounded-xl p-4 max-h-48 overflow-y-auto">
              {result?.cards.slice(0, 5).map((card, i) => (
                <div
                  key={i}
                  className="mb-3 pb-3 border-b border-gray-200 last:border-0 last:mb-0 last:pb-0"
                >
                  <p className="text-xs font-semibold text-blue-500 mb-0.5">
                    Front
                  </p>
                  <p className="text-sm text-gray-800 whitespace-pre-line">
                    {card.front.slice(0, 120)}
                    {card.front.length > 120 ? "..." : ""}
                  </p>
                  <p className="text-xs font-semibold text-emerald-500 mt-2 mb-0.5">
                    Back
                  </p>
                  <p className="text-sm text-gray-800 whitespace-pre-line">
                    {card.back.slice(0, 120)}
                    {card.back.length > 120 ? "..." : ""}
                  </p>
                </div>
              ))}
              {(result?.cards.length ?? 0) > 5 && (
                <p className="text-xs text-gray-400 text-center">
                  and {(result?.cards.length ?? 0) - 5} more...
                </p>
              )}
            </div>

            <button
              onClick={handleDownload}
              disabled={status === "generating"}
              className="mt-5 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
            >
              {status === "generating" ? "Generating..." : "Download PDF"}
            </button>
            
            {diagnostics && (
              <div className="mt-4 text-left bg-green-50 border border-green-200 rounded-xl p-3">
                <p className="text-xs font-semibold text-green-700 mb-2">
                  PDF Generation Report
                </p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-600">Cards rendered:</span>
                    <span className="ml-1 font-medium text-green-700">
                      {diagnostics.cardsRendered} / {diagnostics.cardsTotal}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Images hydrated:</span>
                    <span className="ml-1 font-medium text-gray-900">
                      {diagnostics.imagesHydrated}
                    </span>
                  </div>
                  {diagnostics.renderFailures > 0 && (
                    <div className="col-span-2">
                      <span className="text-gray-600">Render failures:</span>
                      <span className="ml-1 font-medium text-red-600">
                        {diagnostics.renderFailures}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            <button
              onClick={handleReset}
              className="mt-2 text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              Convert another file
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {status === "error" && error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4">
          {error}
        </div>
      )}
    </div>
  );
}
