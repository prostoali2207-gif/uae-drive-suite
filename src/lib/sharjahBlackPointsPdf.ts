import { PDFDocument } from "pdf-lib";
import { supabase } from "@/integrations/supabase/client";

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
  fineDescription: string;
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

  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  const plate = `${values.plateCode} ${values.plateNumber}`.trim();
  const [{ data: client }, { data: car }, { data: owner }] = await Promise.all([
    supabase
      .from("clients")
      .select("license_type, license_issuing_country, traffic_file_number, unified_number")
      .eq("license_number", values.licenseNumber)
      .maybeSingle(),
    supabase
      .from("cars")
      .select("plate_emirate")
      .eq("plate", plate)
      .maybeSingle(),
    userId
      ? supabase
        .from("staff")
        .select("signature")
        .eq("owner_id", userId)
        .eq("role", "owner")
        .eq("status", "active")
        .not("signature", "is", null)
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const licenseSource = client?.license_type === "international"
    ? "International"
    : client?.license_type === "uae"
      ? "UAE"
      : client?.license_issuing_country?.trim() || values.licenseSource;
  const trafficFileNumber = client?.traffic_file_number?.trim() || values.trafficFileNumber;
  const unifiedNumber = client?.unified_number?.trim() || values.unifiedNumber;
  const plateSource = car?.plate_emirate?.trim() || values.plateSource;

  const templateBytes = await response.arrayBuffer();
  const template = await PDFDocument.load(templateBytes);
  const templatePage = template.getPages()[0];
  const { width: pageWidth, height: pageHeight } = templatePage.getSize();
  const pdf = await PDFDocument.create();
  const [background] = await pdf.embedPdf(templateBytes, [0]);
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawPage(background, { x: 0, y: 0, width: pageWidth, height: pageHeight });

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

  // The authority form has two fine-data columns. Keep its numbered rows,
  // but divide the fine-data area into date, violation, and fine number.
  const fineGridX = [18, 83, 177, 246];
  const fineGridTop = 612;
  const fineGridHeaderBottom = 594;
  const fineGridRowHeight = 16.5;
  const fineGridBottom = fineGridHeaderBottom - 10 * fineGridRowHeight;

  context.fillStyle = "#ffffff";
  context.fillRect(
    fineGridX[0] * scale,
    (pageHeight - fineGridTop) * scale,
    (fineGridX[3] - fineGridX[0]) * scale,
    (fineGridTop - fineGridBottom) * scale,
  );
  context.strokeStyle = "#767676";
  context.lineWidth = 0.55 * scale;
  context.beginPath();
  for (const x of fineGridX) {
    context.moveTo(x * scale, (pageHeight - fineGridTop) * scale);
    context.lineTo(x * scale, (pageHeight - fineGridBottom) * scale);
  }
  for (let row = 0; row <= 10; row += 1) {
    const y = row === 0 ? fineGridTop : fineGridHeaderBottom - (row - 1) * fineGridRowHeight;
    context.moveTo(fineGridX[0] * scale, (pageHeight - y) * scale);
    context.lineTo(fineGridX[3] * scale, (pageHeight - y) * scale);
  }
  context.stroke();

  context.fillStyle = "#0d0d0d";
  context.textAlign = "center";
  context.direction = "rtl";
  context.font = `600 ${8.2 * scale}px Arial, sans-serif`;
  ["التاريخ", "نوع المخالفة", "رقم المخالفة"].forEach((heading, index) => {
    context.fillText(
      heading,
      ((fineGridX[index] + fineGridX[index + 1]) / 2) * scale,
      (pageHeight - 598.5) * scale,
      (fineGridX[index + 1] - fineGridX[index] - 4) * scale,
    );
  });
  context.direction = "ltr";
  context.textAlign = "left";

  // A single fine occupies the first row. Wrap its description to two lines
  // rather than allowing long text to overlap the date or fine number.
  const fineDescription = values.fineDescription.trim();
  if (fineDescription) {
    const maxWidth = (fineGridX[2] - fineGridX[1] - 6) * scale;
    context.font = `600 ${7.2 * scale}px Arial, sans-serif`;
    const lines: string[] = [];
    for (const word of fineDescription.split(/\s+/)) {
      const current = lines[lines.length - 1] ?? "";
      const candidate = current ? `${current} ${word}` : word;
      if (current && context.measureText(candidate).width > maxWidth) {
        lines.push(word);
      } else if (lines.length) {
        lines[lines.length - 1] = candidate;
      } else {
        lines.push(candidate);
      }
    }
    if (lines.length > 2) lines.splice(1, lines.length - 1, lines.slice(1).join(" "));
    context.textAlign = "center";
    lines.forEach((line, index) => {
      const baseline = lines.length === 1 ? 583.5 : 587.2 - index * 7.5;
      context.fillText(line, ((fineGridX[1] + fineGridX[2]) / 2) * scale,
        (pageHeight - baseline) * scale, maxWidth);
    });
    context.textAlign = "left";
  }

  write(values.contractNumber, 334, 650, { size: 8, bold: true, maxWidth: 126 });
  write(values.clientName, 313, 602, { size: 8, bold: true, maxWidth: 150 });
  write(values.licenseNumber, 313, 585, { size: 8, bold: true, maxWidth: 150 });
  write(licenseSource, 313, 568, { size: 8, bold: true, maxWidth: 150 });
  write(trafficFileNumber, 313, 553, { size: 8, bold: true, maxWidth: 150 });
  write(unifiedNumber, 313, 541, { size: 8, bold: true, maxWidth: 150 });
  write(values.plateNumber, 313, 496, { size: 8, bold: true, maxWidth: 150 });
  write(values.plateCode, 313, 479, { size: 8, bold: true, maxWidth: 150 });
  write(plateSource, 313, 459, { size: 8, bold: true, maxWidth: 150 });
  write(values.vehicleType, 313, 446, { size: 8, bold: true, maxWidth: 150 });
  write(values.fineNumber, 181, 584, { size: 7.5, bold: true, maxWidth: 61 });
  write(values.fineDate, 21, 584, { size: 7.5, bold: true, maxWidth: 58 });

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
    const maxWidth = 165;
    const maxHeight = 95;
    const stampScale = Math.min(maxWidth / natural.width, maxHeight / natural.height);
    const width = natural.width * stampScale;
    const height = natural.height * stampScale;
    page.drawImage(stamp, {
      x: 166 - width / 2,
      y: 180,
      width,
      height,
    });
  }

  if (owner?.signature?.startsWith("data:image/png")) {
    const signature = await pdf.embedPng(owner.signature);
    const natural = signature.scale(1);
    const maxWidth = 94;
    const maxHeight = 30;
    const signatureScale = Math.min(maxWidth / natural.width, maxHeight / natural.height);
    const width = natural.width * signatureScale;
    const height = natural.height * signatureScale;
    page.drawImage(signature, {
      x: 166 - width / 2,
      y: 258,
      width,
      height,
    });
  }

  const bytes = await pdf.save();
  return new Blob([bytes], { type: "application/pdf" });
}
