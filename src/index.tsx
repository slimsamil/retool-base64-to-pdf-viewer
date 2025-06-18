import { type FC, useState, useEffect, useRef } from "react";
import { Retool } from "@tryretool/custom-component-support";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Funktion zum Umwandeln eines Base64-Strings in ein Blob mit dynamischem Content-Type
const base64ToBlob = (base64: string, contentType: string): Blob => {
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

// Helper to detect Content-Type: PDF vs JPEG
const detectContentType = (base64: string): string => {
  // PDF base64 begins with "JVBER" ("%PDF")
  if (base64.startsWith('JVBER')) return 'application/pdf';
  // JPEG base64 often begins with '/9j/'
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  // Fallback: treat as PDF
  return 'application/pdf';
};

export const PDFViewer: FC = () => {
  // Retool-State: Base64-Daten und Dateiname
  const [base64Data, _setBase64Data] = Retool.useStateString({ name: "base64Data" });
  const [fileName, _setFileName] = Retool.useStateString({ name: "pdfName" });

  // Lokale States
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(1.0);

  // Refs für PDF-Seiten (nur relevant für PDF)
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Erstelle Blob-URL bei Änderung von base64Data
  useEffect(() => {
    if (!base64Data) {
      setBlobUrl(null);
      setContentType(null);
      setNumPages(0);
      setCurrentPage(1);
      return;
    }
    setLoading(true);
    try {
      const type = detectContentType(base64Data);
      setContentType(type);
      const blob = base64ToBlob(base64Data, type);
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
    } catch (error) {
      console.error("Error decoding Base64:", error);
      setBlobUrl(null);
      setContentType(null);
    } finally {
      setLoading(false);
    }
  }, [base64Data]);

  // PDF: on load success
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
  };

  // PDF: IntersectionObserver für Seitenzählung
  useEffect(() => {
    if (contentType !== 'application/pdf' || numPages === 0) return;
    const observer = new IntersectionObserver(
      entries => {
        let bestRatio = 0;
        let newPage = 0;
        entries.forEach(entry => {
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            const idx = pageRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx !== -1) newPage = idx + 1;
          }
        });
        if (newPage > 0) setCurrentPage(newPage);
      },
      { threshold: 0.5 }
    );
    pageRefs.current.forEach(ref => ref && observer.observe(ref));
    return () => observer.disconnect();
  }, [contentType, numPages]);

  // Navigation: zu spezifischer Seite scrollen
  const goToPage = (page: number) => {
    if (contentType !== 'application/pdf') return;
    setCurrentPage(page);
    const pageEl = pageRefs.current[page - 1];
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };
  const goToPrevPage = () => goToPage(Math.max(1, currentPage - 1));
  const goToNextPage = () => goToPage(Math.min(numPages, currentPage + 1));

  // Zoom-Funktionen (nur PDF)
  const zoomIn = () => contentType === 'application/pdf' && setScale(prev => Math.min(prev + 0.1, 3.0));
  const zoomOut = () => contentType === 'application/pdf' && setScale(prev => Math.max(prev - 0.1, 0.5));

  // Download-Link
  const downloadLink = blobUrl || '#';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', border: '1px solid #ccc', borderRadius: '5px', overflow: 'hidden' }}>
      <style>{`
        .viewer-container { overflow-y: auto; padding: 10px; scrollbar-width: none; -ms-overflow-style: none;
        }
        .viewer-container::-webkit-scrollbar { display: none; }
      `}</style>

      <div className="viewer-container" style={{ flex: 1 }}>
        {loading && <p>Loading...</p>}

        {!loading && blobUrl && contentType === 'application/pdf' && (
          <Document file={blobUrl} onLoadSuccess={onDocumentLoadSuccess}>
            {Array.from({ length: numPages }, (_, i) => (
              <div key={i} ref={el => (pageRefs.current[i] = el)} style={{ marginBottom: '20px' }}>
                <Page pageNumber={i + 1} scale={scale} />
              </div>
            ))}
          </Document>
        )}

        {!loading && blobUrl && contentType?.startsWith('image/') && (
          <img src={blobUrl} alt={fileName || 'image'} style={{ maxWidth: '100%', maxHeight: '100%', margin: 'auto', display: 'block' }} />
        )}

        {!loading && !blobUrl && <p style={{ color: 'white' }}>Keine Datei zum Anzeigen gefunden</p>}
      </div>

      {/* Toolbar */}
      <footer style={{ display: 'flex', alignItems: 'center', padding: '0 10px', height: '40px', borderTop: '1px solid #ccc' }}>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* PDF Navigation Buttons */}
          {contentType === 'application/pdf' && (
            <>
              <button onClick={goToPrevPage} disabled={currentPage <= 1} title="Previous page"><ChevronLeft size={18} /></button>
              <button onClick={goToNextPage} disabled={currentPage >= numPages} title="Next page"><ChevronRight size={18} /></button>
              <button onClick={zoomIn} title="Zoom In"><ZoomIn size={18} /></button>
              <button onClick={zoomOut} title="Zoom Out"><ZoomOut size={18} /></button>
            </>
          )}

          {/* Download */}
          <a href={downloadLink} download={fileName || ''} aria-disabled={!blobUrl} title="Download" style={{ display: 'flex', alignItems: 'center' }}>
            <Download size={19} />
          </a>
        </div>
      </footer>
    </div>
  );
};
