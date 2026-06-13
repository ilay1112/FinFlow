import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { type Invoice, type BusinessSettings } from '../../context/FinanceContext';

/**
 * Returns a Blob of the rendered invoice PDF without triggering a download.
 * Used for Drive upload and email attachment.
 */
export const generateInvoicePDFBlob = async (
  elementId: string = 'invoice-template-portal'
): Promise<Blob | null> => {
  const element = document.getElementById(elementId);
  if (!element) return null;

  try {
    const canvas = await html2canvas(element, {
      scale: 2.0,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.85);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

    return pdf.output('blob');
  } catch (error) {
    console.error('PDF blob generation failed:', error);
    return null;
  }
};

/**
 * Advanced PDF generator using html2canvas.
 * This approach renders the invoice to a high-resolution canvas first,
 * capturing perfectly ordered RTL Hebrew, numbers, and layout elements
 * exactly as they appear in the browser.
 */
export const generateInvoicePDF = async (
  invoice: Invoice, 
  _business: BusinessSettings,
  elementId: string = 'invoice-template-portal'
) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error('Invoice template element not found');
    alert('PDF Generation failed: Template not found.');
    return false;
  }

  try {
    // 1. Capture the element to canvas
    // We use a high scale for print quality (2.0+)
    const canvas = await html2canvas(element, {
      scale: 2.0,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.85);

    // 2. Create jsPDF document (A4)
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    // 3. Add the image to the PDF
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    
    // 4. Trigger download
    pdf.save(`invoice_${invoice.id}.pdf`);
    return true;
  } catch (error) {
    console.error('html2canvas PDF generation failed:', error);
    alert('Failed to generate PDF. Check console for details.');
    return false;
  }
};
