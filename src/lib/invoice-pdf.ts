import { PDF } from "@/lib/invoice-config";

/**
 * এক ক্লিকে DOM → PDF ডাউনলোড (print dialog ছাড়াই)।
 * jspdf + html2canvas dynamic import করা হয়, তাই initial bundle বাড়ে না।
 */
export async function downloadInvoicePdf(
  element: HTMLElement,
  invoiceNo: string,
  clientName: string,
) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    // html2canvas-pro: Tailwind v4-এর oklch() রঙ সাপোর্ট করে (মূল html2canvas করে না)
    import("html2canvas-pro"),
    import("jspdf"),
  ]);

  const canvas = await html2canvas(element, {
    scale: PDF.scale,
    backgroundColor: "#ffffff",
    useCORS: true,
    logging: false,
    windowWidth: element.scrollWidth,
    onclone: (doc: Document) => {
      // ক্লোন করা DOM-এ ট্রান্সপারেন্ট/থিম বর্ডার যেন সাদা পেজে ঠিক দেখায়
      doc.querySelectorAll<HTMLElement>(".invoice-sheet, .invoice-sheet *").forEach((el) => {
        el.style.boxShadow = "none";
      });
    },
  });

  const pdf = new jsPDF({
    orientation: PDF.orientation,
    unit: "mm",
    format: PDF.pageSize,
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const m = PDF.marginMm;
  const imgW = pageW - m * 2;
  const imgH = (canvas.height * imgW) / canvas.width;
  const img = canvas.toDataURL("image/jpeg", 0.95);

  if (imgH <= pageH - m * 2) {
    pdf.addImage(img, "JPEG", m, m, imgW, imgH);
  } else {
    // লম্বা ইনভয়েস — একাধিক পেজে ভাগ
    let remaining = imgH;
    let offset = 0;
    while (remaining > 0) {
      pdf.addImage(img, "JPEG", m, m - offset, imgW, imgH);
      remaining -= pageH - m * 2;
      offset += pageH - m * 2;
      if (remaining > 0) pdf.addPage();
    }
  }

  pdf.save(PDF.fileName(invoiceNo, clientName || "client"));
}
