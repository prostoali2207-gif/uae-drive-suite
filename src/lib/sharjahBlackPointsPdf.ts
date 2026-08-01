import { PDFDocument } from "pdf-lib";

export type SharjahBlackPointsValues = {
  contractNumber: string;
  clientName: string;
  licenseNumber: string;
  licenseSource: string;
  trafficFileNumber: string;
  unifiedNumber: string;
  plateNumber: string;
  plateCode: string;
  plateSource: string;
  vehicleType: string;
  fineNumber: string;
  fineDate: string;
  rentalStart: string;
  rentalEnd: string;
  phone: string;
  requestDate: string;
};

const TEMPLATE_URL = "/templates/Sharjah_Black_Points_Blank_Template.pdf";

const splitDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: "", month: "", year: "", hour: "", minute: "" };
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year"), hour: get("hour"), minute: get("minute") };
};

export async function createSharjahBlackPointsPdf(values: SharjahBlackPointsValues, stampPng?: Uint8Array): Promise<Blob> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error("Blank form template could not be loaded");

  const templateBytes = await response.arrayBuffer();
  const template = await PDFDocument.load(templateBytes);
  const templatePage = template.getPages()[0];
  const { width: pageWidth, height: pageHeight } = templatePage.getSize();
  const pdf = await PDFDocument.create();
  const [background] = await pdf.embedPdf(templateBytes, [0]);
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawPage(background, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  // Render completed values as one high-resolution image layer. Some mobile PDF
  // viewers incorrectly apply character spacing to pdf-lib's subset fonts. A
  // canvas layer keeps normal word spacing and looks identical in every viewer.
  const scale = 4;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(pageWidth * scale);
  canvas.height = Math.round(pageHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PDF text layer could not be prepared");
  context.fillStyle = "#0d0d0d";
  context.textBaseline = "alphabetic";

  const write = (text: string, x: number, y: number, options: { size?: number; maxWidth?: number; bold?: boolean } = {}) => {
    const output = (text || "").trim();
    if (!output) return;
    let size = options.size ?? 9;
    const weight = options.bold ? 600 : 500;
    const setFont = () => { context.font = `${weight} ${size * scale}px Arial, sans-serif`; };
    setFont();
    if (options.maxWidth) {
      while (size > 6.5 && context.measureText(output).width > options.maxWidth * scale) {
        size -= 0.25;
        setFont();
      }
    }
    context.fillText(output, x * scale, (pageHeight - y) * scale);
  };

  write(values.contractNumber, 334, 650, { size: 8, bold: true, maxWidth: 126 });
  write(values.clientName, 313, 602, { size: 8, bold: true, maxWidth: 150 });
  write(values.licenseNumber, 313, 585, { size: 8, bold: true, maxWidth: 150 });
  write(values.licenseSource, 313, 565, { maxWidth: 150 });
  write(values.trafficFileNumber, 313, 548, { maxWidth: 150 });
  write(values.unifiedNumber, 313, 532, { maxWidth: 150 });
  write(values.plateNumber, 313, 496, { size: 8, bold: true, maxWidth: 150 });
  write(values.plateCode, 313, 479, { size: 8, bold: true, maxWidth: 150 });
  write(values.plateSource, 313, 459, { maxWidth: 150 });
  write(values.vehicleType, 313, 446, { size: 8, bold: true, maxWidth: 150 });
  write(values.fineNumber, 143, 585, { size: 8, bold: true, maxWidth: 96 });
  write(values.fineDate, 30, 585, { size: 8, bold: true, maxWidth: 100 });

  const start = splitDateTime(values.rentalStart);
  const end = splitDateTime(values.rentalEnd);
  const periodY = [377, 362];
  [start, end].forEach((period, index) => {
    write(period.day, 410, periodY[index], { bold: true });
    write(period.month, 322, periodY[index], { bold: true });
    write(period.year, 224, periodY[index], { bold: true });
    write(period.hour, 132, periodY[index], { bold: true });
    write(period.minute, 43, periodY[index], { bold: true });
  });

  write(values.requestDate, 373, 271, { size: 8, bold: true, maxWidth: 80 });
  write(values.phone, 245, 271, { size: 8, bold: true, maxWidth: 90 });

  const overlayBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PDF text layer could not be prepared")), "image/png");
  });
  const overlay = await pdf.embedPng(await overlayBlob.arrayBuffer());
  page.drawImage(overlay, { x: 0, y: 0, width: pageWidth, height: pageHeight });

  if (stampPng?.length) {
    const stamp = await pdf.embedPng(stampPng);
    const natural = stamp.scale(1);
    const maxWidth = 74;
    const maxHeight = 44;
    const scale = Math.min(maxWidth / natural.width, maxHeight / natural.height);
    const width = natural.width * scale;
    const height = natural.height * scale;
    page.drawImage(stamp, {
      x: 166 - width / 2,
      y: 258,
      width,
      height,
    });
  }

  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}
