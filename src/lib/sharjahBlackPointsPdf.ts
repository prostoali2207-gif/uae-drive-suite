import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

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

const TEMPLATE_URL = "/external-forms/Sharjah_Black_Points_Blank_Template.pdf";

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

export async function createSharjahBlackPointsPdf(values: SharjahBlackPointsValues): Promise<Blob> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) throw new Error("Blank form template could not be loaded");

  const pdf = await PDFDocument.load(await response.arrayBuffer());
  const page = pdf.getPages()[0];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.05, 0.05, 0.05);

  const write = (text: string, x: number, y: number, options: { size?: number; maxWidth?: number; bold?: boolean } = {}) => {
    const size = options.size ?? 8;
    const selectedFont = options.bold ? bold : font;
    let output = text || "";
    if (options.maxWidth) {
      while (output.length > 2 && selectedFont.widthOfTextAtSize(output, size) > options.maxWidth) output = output.slice(0, -1);
    }
    page.drawText(output, { x, y, size, font: selectedFont, color: ink });
  };

  write(values.contractNumber, 334, 647, { bold: true, maxWidth: 126 });
  write(values.clientName, 313, 598, { bold: true, maxWidth: 150 });
  write(values.licenseNumber, 313, 581, { maxWidth: 150 });
  write(values.licenseSource, 313, 565, { maxWidth: 150 });
  write(values.trafficFileNumber, 313, 548, { maxWidth: 150 });
  write(values.unifiedNumber, 313, 532, { maxWidth: 150 });
  write(values.plateNumber, 313, 492, { bold: true, maxWidth: 150 });
  write(values.plateCode, 313, 475, { maxWidth: 150 });
  write(values.plateSource, 313, 459, { maxWidth: 150 });
  write(values.vehicleType, 313, 442, { maxWidth: 150 });
  write(values.fineNumber, 143, 582, { bold: true, maxWidth: 96 });
  write(values.fineDate, 30, 582, { maxWidth: 100 });

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

  write(values.requestDate, 373, 271, { maxWidth: 80 });
  write(values.phone, 245, 271, { maxWidth: 90 });

  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}
