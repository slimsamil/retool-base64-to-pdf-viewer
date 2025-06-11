import { type FC, useState, useEffect, useRef } from "react";
import { Retool } from "@tryretool/custom-component-support";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, Download, ZoomIn, ZoomOut } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// Funktion zum Umwandeln eines Base64-Strings in ein Blob
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
  // Retool-State: PDF als Base64 und PDF-Name
  const [base64Data, _setBase64Data] = Retool.useStateString({ name: "base64Data" });
  const [pdfName, _setPdfName] = Retool.useStateString({ name: "pdfName" });

  // Lokale States
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(1.0);

  // Refs für die einzelnen Seiten
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // PDF aus Base64 erzeugen
  useEffect(() => {
    if (!base64Data) {
      setPdfBlobUrl(null);
      setNumPages(0);
      setCurrentPage(1);
      return;
    }
    setLoading(true);
    try {
      const blob = base64ToBlob(base64Data);
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
    } catch (error) {
      console.error("Error decoding Base64 PDF:", error);
      setPdfBlobUrl(null);
    } finally {
      setLoading(false);
    }
  }, [base64Data]);

  // Wird aufgerufen, sobald das PDF geladen wurde
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1); // immer auf Seite 1 starten
  };

  // IntersectionObserver: Aktualisiert den currentPage-Wert, wenn durch Scrollen eine andere Seite sichtbar wird
  useEffect(() => {
    if (!numPages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let bestRatio = 0;
        let newCurrentPage = 0;
        entries.forEach((entry) => {
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            const index = pageRefs.current.indexOf(entry.target as HTMLDivElement);
            if (index !== -1) {
              newCurrentPage = index + 1;
            }
          }
        });
        if (newCurrentPage > 0) {
          setCurrentPage(newCurrentPage);
        }
      },
      { threshold: 0.5 }
    );
    pageRefs.current.forEach((ref) => {
      if (ref) observer.observe(ref);
    });
    return () => {
      observer.disconnect();
    };
  }, [numPages]);

  // Scrollt zu einer bestimmten Seite und aktualisiert den Zustand sofort
  const goToPage = (page: number) => {
    setCurrentPage(page);
    const pageEl = pageRefs.current[page - 1];
    if (pageEl) {
      // "center" sorgt dafür, dass die Seite im Mittelpunkt des Viewports erscheint
      pageEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  };

  const goToPrevPage = () => {
    const targetPage = Math.max(1, currentPage - 1);
    goToPage(targetPage);
  };

  const goToNextPage = () => {
    const targetPage = Math.min(numPages, currentPage + 1);
    goToPage(targetPage);
  };

  // Zoom-Funktionen
  const zoomIn = () => setScale((prev) => Math.min(prev + 0.1, 3.0));
  const zoomOut = () => setScale((prev) => Math.max(prev - 0.1, 0.5));

  // Download-Link (wenn kein PDF vorhanden, wird "#" gesetzt)
  const downloadLink = pdfBlobUrl || "#";

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        border: "1px solid #ccc",
        borderRadius: "5px",
        overflow: "hidden",
      }}
    >
      {/* CSS-Regeln zum Ausblenden der Scrollbalken */}
      <style>{`
        .pdf-container {
          overflow-y: auto;
          padding: 10px;
          scrollbar-width: none; /* Firefox */
          -ms-overflow-style: none;  /* Internet Explorer 10+ */
        }
        .pdf-container::-webkit-scrollbar {
          display: none; /* Chrome, Safari und Opera */
        }
      `}</style>

      {/* PDF-Anzeige-Bereich */}
      <div className="pdf-container" style={{ flex: 1 }}>
        {loading && <p>Loading PDF...</p>}
        {!loading && pdfBlobUrl && (
          <Document file={pdfBlobUrl} onLoadSuccess={onDocumentLoadSuccess}>
            {Array.from({ length: numPages }, (_, index) => (
              <div
                key={index}
                ref={(el) => (pageRefs.current[index] = el)}
                style={{ marginBottom: "20px" }}
              >
                <Page pageNumber={index + 1} scale={scale} />
              </div>
            ))}
          </Document>
        )}
        {!loading && !pdfBlobUrl && <p style={{ color: "white" }}>Keine PDF zum Anzeigen gefunden</p>}
      </div>

      {/* Toolbar als Footer am unteren Ende */}
      <footer
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          height: "40px",
          borderTop: "1px solid #ccc",
        }}
      >
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
          {/* Vorherige Seite */}
          <button
            type="button"
            title="Previous page"
            onClick={goToPrevPage}
            disabled={currentPage <= 1 || numPages === 0}
            style={{ backgroundColor: "transparent", border: "none", cursor: "pointer" }}
          >
            <ChevronLeft size={18} color="black" />
          </button>
          {/* Nächste Seite */}
          <button
            type="button"
            title="Next page"
            onClick={goToNextPage}
            disabled={currentPage >= numPages || numPages === 0}
            style={{ backgroundColor: "transparent", border: "none", cursor: "pointer" }}
          >
            <ChevronRight size={18} color="black" />
          </button>
          {/* Zoom In */}
          <button
            type="button"
            title="Zoom In"
            onClick={zoomIn}
            style={{ backgroundColor: "transparent", border: "none", cursor: "pointer" }}
          >
            <ZoomIn size={18} color="black" />
          </button>
          {/* Zoom Out */}
          <button
            type="button"
            title="Zoom Out"
            onClick={zoomOut}
            style={{ backgroundColor: "transparent", border: "none", cursor: "pointer" }}
          >
            <ZoomOut size={18} color="black" />
          </button>
          {/* Download-Button */}
          <a
            href={downloadLink}
            aria-disabled={!pdfBlobUrl}
            download
            title="Download"
            style={{
              backgroundColor: "transparent",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textDecoration: "none",
              cursor: pdfBlobUrl ? "pointer" : "default",
            }}
          >
            <Download size={19} color="black" />
          </a>
        </div>
      </footer>
    </div>
  );
};
