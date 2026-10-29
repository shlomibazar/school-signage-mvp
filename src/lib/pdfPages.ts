/** Convert PDF pages in the browser without bundling pdfjs-dist into Next.js. */
type PdfPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
  cleanup: () => void;
};
type PdfDocument = {
  numPages: number;
  getPage: (number: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: Uint8Array }) => { promise: Promise<PdfDocument> };
};
declare global { interface Window { pdfjsLib?: PdfJs } }

let loader: Promise<PdfJs> | undefined;
function loadPdfJs(): Promise<PdfJs> {
  if (typeof window === 'undefined') return Promise.reject(new Error('PDF conversion is browser-only'));
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!loader) {
    loader = new Promise<PdfJs>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/pdfjs/pdf.min.js';
      script.async = true;
      script.onload = () => window.pdfjsLib ? resolve(window.pdfjsLib) : reject(new Error('PDF library did not initialize'));
      script.onerror = () => reject(new Error('Failed to load PDF library'));
      document.head.appendChild(script);
    }).catch(error => { loader = undefined; throw error; });
  }
  return loader;
}

export async function pdfPages(file: File): Promise<File[]> {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return [file];
  const pdfjs = await loadPdfJs();
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.js';
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    if (doc.numPages > 30) throw new Error('ניתן לצרף PDF של עד 30 עמודים');
    const results: File[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 2400 / base.width, 3200 / base.height) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('לא ניתן להמיר את עמוד ה-PDF');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('המרת PDF נכשלה')), 'image/png'));
      results.push(new File([blob], `${file.name.replace(/\.pdf$/i, '')} - עמוד ${n}.png`, { type: 'image/png' }));
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
    }
    return results;
  } finally { await doc.destroy(); }
}
