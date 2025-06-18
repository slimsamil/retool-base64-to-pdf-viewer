import { type FC, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Retool } from "@tryretool/custom-component-support";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

const detectContentType = (base64: string): string => {
  if (base64.startsWith('JVBER')) return 'application/pdf';
  if (base64.startsWith('/9j/')) return 'image/jpeg';
  if (base64.startsWith('iVBOR')) return 'image/png';
  if (base64.startsWith('R0lGOD')) return 'image/gif';
  if (base64.startsWith('UklGR')) return 'image/webp';
  return 'application/pdf'; // Default fallback
};

export const PDFViewer: FC = () => {
  const [base64Data] = Retool.useStateString({ name: "base64Data" });
  const [fileName] = Retool.useStateString({ name: "pdfName" });

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [contentType, setContentType] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [pageWidth, setPageWidth] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const previousBlobUrl = useRef<string | null>(null);

  // Memoized blob creation
  const blobData = useMemo(() => {
    if (!base64Data) return null;
    
    try {
      const type = detectContentType(base64Data);
      const blob = base64ToBlob(base64Data, type);
      return { blob, type };
    } catch (error) {
      console.error("Error decoding Base64:", error);
      return null;
    }
  }, [base64Data]);

  // Handle blob URL creation and cleanup
  useEffect(() => {
    // Cleanup previous blob URL
    if (previousBlobUrl.current) {
      URL.revokeObjectURL(previousBlobUrl.current);
      previousBlobUrl.current = null;
    }

    if (!blobData) {
      setBlobUrl(null);
      setContentType(null);
      setNumPages(0);
      setCurrentPage(1);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = URL.createObjectURL(blobData.blob);
      setBlobUrl(url);
      setContentType(blobData.type);
      previousBlobUrl.current = url;
    } catch (error) {
      console.error("Error creating blob URL:", error);
      setError("Fehler beim Laden der Datei");
      setBlobUrl(null);
      setContentType(null);
    } finally {
      setLoading(false);
    }
  }, [blobData]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (previousBlobUrl.current) {
        URL.revokeObjectURL(previousBlobUrl.current);
      }
    };
  }, []);

  // Throttled resize handler
  const handleResize = useCallback(() => {
    if (containerRef.current) {
      setContainerWidth(containerRef.current.offsetWidth);
    }
  }, []);

  useEffect(() => {
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [handleResize]);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setCurrentPage(1);
    setError(null);
    // Initialize page refs array
    pageRefs.current = new Array(numPages).fill(null);
  }, []);

  const onDocumentLoadError = useCallback((error: Error) => {
    console.error("PDF load error:", error);
    setError("Fehler beim Laden des PDF");
    setNumPages(0);
  }, []);

  // Intersection Observer für Seitenerkennung
  useEffect(() => {
    if (contentType !== 'application/pdf' || numPages === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestRatio = 0;
        let newPage = 0;
        
        entries.forEach((entry) => {
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            const idx = pageRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx !== -1) {
              newPage = idx + 1;
            }
          }
        });
        
        if (newPage > 0 && newPage !== currentPage) {
          setCurrentPage(newPage);
        }
      },
      { 
        threshold: 0.5,
        rootMargin: '-50px 0px -50px 0px' // Bessere Seitenerkennung
      }
    );

    const currentRefs = pageRefs.current.filter(ref => ref !== null);
    currentRefs.forEach(ref => observer.observe(ref));

    return () => observer.disconnect();
  }, [contentType, numPages, currentPage]);

  const goToPage = useCallback((page: number) => {
    if (contentType !== 'application/pdf' || page < 1 || page > numPages) return;
    
    const pageEl = pageRefs.current[page - 1];
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [contentType, numPages]);

  const goToPrevPage = useCallback(() => {
    goToPage(Math.max(1, currentPage - 1));
  }, [currentPage, goToPage]);

  const goToNextPage = useCallback(() => {
    goToPage(Math.min(numPages, currentPage + 1));
  }, [currentPage, numPages, goToPage]);

  const calcAutoScale = useCallback(() => {
    if (!containerWidth || !pageWidth) return 1.0;
    const scale = (containerWidth - 40) / pageWidth; // 40px für Padding
    return Math.min(Math.max(scale, 0.5), 3.0); // Begrenze Skalierung
  }, [containerWidth, pageWidth]);

  const onPageLoadSuccess = useCallback(({ width }: { width: number }) => {
    if (!pageWidth) {
      setPageWidth(width);
    }
  }, [pageWidth]);

  const downloadLink = blobUrl || '#';
  const isDownloadDisabled = !blobUrl;

  return (
    <div style={{ 
      height: '100%',
      width: '100%',
      display: 'flex', 
      flexDirection: 'column', 
      border: '1px solid #ccc', 
      borderRadius: '5px', 
      overflow: 'hidden',
      backgroundColor: '#f5f5f5',
      position: 'relative'
    }}>
      <style>{`
        /* Retool container overrides */
        body, html {
          overflow: hidden !important;
        }
        
        /* Hide Retool's outer scrollbars */
        .retool-canvas {
          overflow: hidden !important;
        }
        
        .viewer-container { 
          overflow-y: auto; 
          padding: 20px; 
          scrollbar-width: thin; 
          scrollbar-color: #888 #f1f1f1;
          background: #f5f5f5;
          height: 100%;
        }
        .viewer-container::-webkit-scrollbar { 
          width: 8px; 
        }
        .viewer-container::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        .viewer-container::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 4px;
        }
        .viewer-container::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        .page-container {
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          border-radius: 4px;
          overflow: hidden;
          background: white;
        }
        .navigation-button {
          background: #007bff;
          color: white;
          border: none;
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          display: flex;
          align-items: center;
          transition: background-color 0.2s;
        }
        .navigation-button:hover:not(:disabled) {
          background: #0056b3;
        }
        .navigation-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        .download-link {
          color: #007bff;
          text-decoration: none;
          display: flex;
          align-items: center;
          padding: 8px 12px;
          border-radius: 4px;
          transition: background-color 0.2s;
        }
        .download-link:hover:not([aria-disabled="true"]) {
          background-color: #f0f8ff;
        }
        .download-link[aria-disabled="true"] {
          color: #ccc;
          cursor: not-allowed;
        }
      `}</style>
      
      <div ref={containerRef} className="viewer-container" style={{ flex: 1 }}>
        {loading && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '200px',
            color: '#666' 
          }}>
            <p>Lädt...</p>
          </div>
        )}

        {error && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '200px',
            color: '#d32f2f' 
          }}>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && blobUrl && contentType === 'application/pdf' && (
          <Document 
            file={blobUrl} 
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading=""
          >
            {Array.from({ length: numPages }, (_, i) => (
              <div 
                key={`page_${i + 1}`} 
                ref={el => (pageRefs.current[i] = el)} 
                className="page-container"
              >
                <Page
                  pageNumber={i + 1}
                  scale={calcAutoScale()}
                  onLoadSuccess={onPageLoadSuccess}
                  loading=""
                />
              </div>
            ))}
          </Document>
        )}

        {!loading && !error && blobUrl && contentType?.startsWith('image/') && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <img 
              src={blobUrl} 
              alt={fileName || 'Bild'} 
              style={{ 
                maxWidth: '100%', 
                maxHeight: '100%',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }} 
            />
          </div>
        )}

        {!loading && !error && !blobUrl && (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '200px',
            color: '#666' 
          }}>
            <p>Keine Datei zum Anzeigen gefunden</p>
          </div>
        )}
      </div>
      
      <footer style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        padding: '10px 15px', 
        borderTop: '1px solid #ccc',
        backgroundColor: 'white'
      }}>
        <div style={{ color: '#666', fontSize: '14px' }}>
          {contentType === 'application/pdf' && numPages > 0 && (
            <span>Seite {currentPage} von {numPages}</span>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {contentType === 'application/pdf' && numPages > 0 && (
            <>
              <button 
                className="navigation-button"
                onClick={goToPrevPage} 
                disabled={currentPage <= 1} 
                title="Vorherige Seite"
              >
                <ChevronLeft size={18} />
              </button>
              <button 
                className="navigation-button"
                onClick={goToNextPage} 
                disabled={currentPage >= numPages} 
                title="Nächste Seite"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}
          <a 
            href={downloadLink} 
            download={fileName || 'download'} 
            aria-disabled={isDownloadDisabled}
            className="download-link"
            title="Herunterladen"
            onClick={isDownloadDisabled ? (e) => e.preventDefault() : undefined}
          >
            <Download size={19} />
          </a>
        </div>
      </footer>
    </div>
  );
};