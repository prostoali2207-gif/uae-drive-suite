import jsPDF from "jspdf";
import QRCode from "qrcode";

export interface ReplacementAddendumPdfData {
  contractId: string;
  replacementId: string;
  replacementNo: number;
  replacementType: string;
  reason: string;
  replacementDateTime: string;
  company: {
    name: string;
    phone?: string | null;
    email?: string | null;
  };
  oldVehicle: {
    plate?: string | null;
    make?: string | null;
    model?: string | null;
    mileage?: string | number | null;
    fuel?: string | number | null;
    notes?: string | null;
  };
  newVehicle: {
    plate?: string | null;
    make?: string | null;
    model?: string | null;
    mileage?: string | number | null;
    fuel?: string | number | null;
    notes?: string | null;
  };
  customerSignature: string;
  companySignature: string;
}

const INSPECTION_BASE_URL = "https://uae-drive-suite.vercel.app/inspection";

const RESPONSIBILITY_TRANSFER_CLAUSE =
  "The customer's responsibility for the old vehicle ends at the return date/time stated above. The customer's responsibility for the replacement vehicle starts from the handover date/time stated above. All terms of the original Rental Agreement remain valid unless stated otherwise in this Addendum.";

function valueOrDash(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function vehicleLabel(vehicle: { plate?: string | null; make?: string | null; model?: string | null }): string {
  const name = [vehicle.make, vehicle.model].filter(Boolean).join(" ");
  return [vehicle.plate, name].filter(Boolean).join(" - ") || "-";
}

function formatFuel(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    if (numeric === 100) return "Full";
    if (numeric === 75) return "3/4";
    if (numeric === 50) return "1/2";
    if (numeric === 25) return "1/4";
    if (numeric === 0) return "Empty";
  }
  return String(value);
}

function formatMileage(value?: string | number | null): string {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toLocaleString()} km` : String(value);
}

export async function generateReplacementAddendumPdf(
  addendum: ReplacementAddendumPdfData,
  options?: { returnBlob?: boolean },
): Promise<Blob | void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentW = pageW - margin * 2;
  const inspectionUrl = `${INSPECTION_BASE_URL}/${addendum.contractId}`;
  const today = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  let inspectionQr = "";
  try {
    inspectionQr = await QRCode.toDataURL(inspectionUrl, { width: 130 });
  } catch {
    inspectionQr = "";
  }

  const blue: [number, number, number] = [0, 90, 179];
  const ink: [number, number, number] = [15, 23, 42];
  const muted: [number, number, number] = [86, 100, 120];
  const line: [number, number, number] = [214, 224, 235];
  const panel: [number, number, number] = [249, 251, 253];

  const setText = (size: number, color: [number, number, number] = ink, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };

  const field = (x: number, y: number, w: number, label: string, value: string, h = 48) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...line);
    doc.setLineWidth(0.7);
    doc.roundedRect(x, y, w, h, 4, 4, "FD");
    setText(7, muted, "normal");
    doc.text(label, x + 10, y + 16);
    setText(9, ink, /\d/.test(value) ? "bold" : "bold");
    doc.text(valueOrDash(value), x + 10, y + 32, { maxWidth: w - 20 });
  };

  const sectionTitle = (title: string, y: number) => {
    setText(10, blue, "bold");
    doc.text(title.toUpperCase(), margin, y);
    doc.setDrawColor(...blue);
    doc.setLineWidth(0.8);
    doc.line(margin, y + 7, pageW - margin, y + 7);
  };

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setDrawColor(...line);
  doc.rect(16, 16, pageW - 32, pageH - 32);

  setText(16, ink, "bold");
  doc.text(addendum.company.name || "Rental Company", margin, 58);
  setText(8, muted);
  const contact = [addendum.company.phone, addendum.company.email].filter(Boolean).join(" | ");
  if (contact) doc.text(contact, pageW - margin, 58, { align: "right", maxWidth: 220 });

  setText(25, ink, "bold");
  doc.text("VEHICLE REPLACEMENT ADDENDUM", margin, 112);
  setText(8.5, muted);
  doc.text(`Original Contract ID: ${addendum.contractId}`, margin, 132);
  doc.text(`Replacement No. ${addendum.replacementNo} | Date of Issue: ${today}`, margin, 146);

  sectionTitle("Replacement Summary", 188);
  const colGap = 12;
  const colW = (contentW - colGap) / 2;
  field(margin, 208, colW, "Replacement Type", addendum.replacementType);
  field(margin + colW + colGap, 208, colW, "Reason", addendum.reason);
  field(margin, 268, contentW, "Replacement Date & Time", addendum.replacementDateTime, 44);

  sectionTitle("Vehicle Handover Details", 344);
  const oldRows: [string, string][] = [
    ["Vehicle", vehicleLabel(addendum.oldVehicle)],
    ["Return Mileage", formatMileage(addendum.oldVehicle.mileage)],
    ["Return Fuel", formatFuel(addendum.oldVehicle.fuel)],
    ["Return Notes", valueOrDash(addendum.oldVehicle.notes)],
  ];
  const newRows: [string, string][] = [
    ["Vehicle", vehicleLabel(addendum.newVehicle)],
    ["Handover Mileage", formatMileage(addendum.newVehicle.mileage)],
    ["Handover Fuel", formatFuel(addendum.newVehicle.fuel)],
    ["Handover Notes", valueOrDash(addendum.newVehicle.notes)],
  ];
  oldRows.forEach(([label, value], index) => field(margin, 364 + index * 50, colW, `Old Vehicle - ${label}`, value));
  newRows.forEach(([label, value], index) => field(margin + colW + colGap, 364 + index * 50, colW, `Replacement Vehicle - ${label}`, value));

  const qrY = 584;
  sectionTitle("Inspection Photos", qrY);
  doc.setFillColor(...panel);
  doc.setDrawColor(...line);
  doc.roundedRect(margin, qrY + 20, contentW, 86, 4, 4, "FD");
  setText(9, ink, "bold");
  doc.text("Inspection photos are attached to the replacement inspection record.", margin + 14, qrY + 46);
  setText(8, muted);
  doc.text(inspectionUrl, margin + 14, qrY + 64, { maxWidth: contentW - 104 });
  if (inspectionQr) doc.addImage(inspectionQr, "PNG", pageW - margin - 64, qrY + 31, 54, 54);

  const clauseY = 722;
  sectionTitle("Responsibility Transfer", clauseY);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...line);
  doc.roundedRect(margin, clauseY + 20, contentW, 72, 4, 4, "FD");
  setText(8.5, ink);
  doc.text(doc.splitTextToSize(RESPONSIBILITY_TRANSFER_CLAUSE, contentW - 28), margin + 14, clauseY + 43);

  doc.addPage();
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, pageW, pageH, "F");
  doc.setDrawColor(...line);
  doc.rect(16, 16, pageW - 32, pageH - 32);

  setText(16, ink, "bold");
  doc.text("Vehicle Replacement Addendum", margin, 58);
  setText(8.5, muted);
  doc.text(`Original Contract ID: ${addendum.contractId}`, margin, 76);

  sectionTitle("Agreement & Signatures", 120);
  setText(9, ink);
  doc.text(
    "By signing below, both parties confirm that they have reviewed this Vehicle Replacement Addendum and agree to the responsibility transfer stated above.",
    margin,
    148,
    { maxWidth: contentW },
  );

  const sigW = (contentW - 18) / 2;
  const sigY = 204;
  const drawSignature = (x: number, title: string, signer: string, signature: string) => {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...line);
    doc.roundedRect(x, sigY, sigW, 150, 4, 4, "FD");
    setText(8.5, blue, "bold");
    doc.text(title, x + sigW / 2, sigY + 22, { align: "center" });
    if (signature?.startsWith("data:image")) {
      try {
        doc.addImage(signature, "PNG", x + 35, sigY + 38, sigW - 70, 50);
      } catch {
        // Keep the PDF valid even if a signature image cannot be embedded.
      }
    }
    doc.setDrawColor(...line);
    doc.line(x + 28, sigY + 95, x + sigW - 28, sigY + 95);
    setText(8.5, ink, "bold");
    doc.text(valueOrDash(signer), x + 28, sigY + 116, { maxWidth: sigW - 56 });
    setText(8, ink);
    doc.text(`Date: ${today}`, x + 28, sigY + 134);
  };

  drawSignature(margin, "CUSTOMER", "Customer", addendum.customerSignature);
  drawSignature(margin + sigW + 18, "COMPANY REPRESENTATIVE", addendum.company.name, addendum.companySignature);

  setText(8, muted);
  doc.text("All terms of the original Rental Agreement remain valid unless stated otherwise in this Addendum.", margin, pageH - 52, {
    maxWidth: contentW,
  });

  const filename = `Replacement_Addendum_${addendum.replacementNo}_${addendum.contractId.slice(0, 8).toUpperCase()}.pdf`;
  if (options?.returnBlob) return doc.output("blob");
  doc.save(filename);
}

export const replacementAddendumInspectionUrl = (contractId: string) => `${INSPECTION_BASE_URL}/${contractId}`;
export const replacementAddendumResponsibilityClause = RESPONSIBILITY_TRANSFER_CLAUSE;
