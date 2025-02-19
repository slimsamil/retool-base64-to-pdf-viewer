import { type FC } from "react";
import { Retool } from "@tryretool/custom-component-support";
import { useState, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Function to convert Base64 string to Blob
const base64ToBlob = (base64: string, contentType = "application/pdf"): Blob => {
  const byteCharacters = atob(base64);
  const byteArrays: Uint8Array[] = [];

  for (let i = 0; i < byteCharacters.length; i += 512) {
    const slice = byteCharacters.slice(i, i + 512);
    const byteNumbers = new Uint8Array(slice.length);

    for (let j = 0; j < slice.length; j++) {
      byteNumbers[j] = slice.charCodeAt(j);
    }

    byteArrays.push(byteNumbers);
  }

  return new Blob(byteArrays, { type: contentType });
};

export const PDFViewer: FC = () => {
  const [base64Data, _setBase64Data] = Retool.useStateString({
    name: "base64Data", // Expecting Base64 string from Retool
  });

  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    if (base64Data) {
      try {
        const blob = base64ToBlob(base64Data);
        setPdfBlobUrl(URL.createObjectURL(blob));
      } catch (error) {
        console.error("Error decoding Base64 PDF:", error);
      }
    }
  }, [base64Data]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
  };

  const handleDownload = () => {
    if (pdfBlobUrl) {
      const a = document.createElement("a");
      a.href = pdfBlobUrl;
      a.download = "document.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  return (
    <div className="flex flex-col items-center space-y-4 p-4 bg-gray-100 rounded-lg shadow-md">
      {/* Sticky Controls */}
      <div className="sticky top-0 w-full flex justify-between items-center bg-white p-3 shadow-md z-10 space-x-4 border-b">
        {/* Previous Page */}
        <button
          className="p-3 bg-gray-200 hover:bg-gray-300 rounded-lg disabled:opacity-50"
          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
          disabled={currentPage <= 1}
        >
          <ChevronLeft size={20} />
        </button>

        {/* Page Indicator */}
        <span className="text-lg font-semibold flex-1 text-center">
          Page {currentPage} / {numPages || "?"}
        </span>

        {/* Next Page */}
        <button
          className="p-3 bg-gray-200 hover:bg-gray-300 rounded-lg disabled:opacity-50"
          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, numPages || 1))}
          disabled={numPages === null || currentPage >= numPages}
        >
          <ChevronRight size={20} />
        </button>

        {/* Download Button */}
        <button
          className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg"
          onClick={handleDownload}
          disabled={!pdfBlobUrl}
        >
          <Download size={20} />
        </button>
      </div>

      {/* PDF Viewer */}
      <div className="border rounded-lg bg-white p-2 shadow-md w-full max-h-[80vh] overflow-auto">
        {pdfBlobUrl ? (
          <Document file={pdfBlobUrl} onLoadSuccess={onDocumentLoadSuccess}>
            <Page pageNumber={currentPage} />
          </Document>
        ) : (
          <p>Loading PDF...</p>
        )}
      </div>
    </div>
  );
};
