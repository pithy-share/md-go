import html2pdf from 'html2pdf.js';
import { markdownToExportHtml } from './markdown';

export async function markdownToPdfBase64(markdown: string, title: string): Promise<string> {
  const fullHtml = markdownToExportHtml(markdown, title);

  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '210mm';
  container.innerHTML = fullHtml;
  document.body.appendChild(container);

  try {
    const opt = {
      margin: [10, 10, 10, 10] as [number, number, number, number],
      filename: `${title || 'document'}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        logging: false,
        letterRendering: true,
        useCORS: true,
      },
      jsPDF: {
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait' as const,
      },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };

    const pdfBlob = await html2pdf().set(opt).from(container).outputPdf('blob');
    return await blobToBase64(pdfBlob as Blob);
  } finally {
    document.body.removeChild(container);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
