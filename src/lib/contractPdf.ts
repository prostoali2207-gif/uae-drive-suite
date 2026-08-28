import jsPDF from "jspdf";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";

interface ContractPdfData {
  id: string;
  start_date: string;
  end_date: string;
  start_time?: string | null;
  end_time?: string | null;
  rate_type: string;
  rate_amount: number;
  total_amount: number;
  deposit_amount: number;
  initial_mileage: number;
  fuel_level: string;
  special_conditions?: string | null;
  client_signature?: string | null;
  manager_signature?: string | null;
  contract_drivers?: Array<{
    id: string;
    position: number;
    signature: string | null;
    clients: {
      full_name: string;
      license_number: string;
      license_expiry: string | null;
    } | null;
  }>;
  clients: {
    full_name: string;
    phone: string;
    nationality: string;
    client_type: string;
    emirates_id: string | null;
    passport_number: string | null;
    license_number?: string | null;
    driver_license_number?: string | null;
    driving_license_number?: string | null;
    licenseNo?: string | null;
    drivingLicenseNo?: string | null;
    drivers_license?: string | null;
    license?: string | null;
    driving_license?: string | null;
    client_license_number?: string | null;
    driverLicenseNumber?: string | null;
  } | null;
  cars: {
    plate: string;
    make: string;
    model: string;
    year: number;
    color: string | null;
    vehicle_color?: string | null;
    car_color?: string | null;
    colour?: string | null;
  } | null;
}

const DEFAULT_KEY_CONDITIONS = [
  "Driver must meet the legal age and licence requirements.",
  "A valid driving licence is required before handover.",
  "The rental starts only after the required payment is received.",
  "Additional drivers require prior company approval.",
  "Insurance is subject to policy terms and applicable excess.",
  "Return the vehicle with the same fuel level as supplied.",
  "Excess mileage is charged under the agreed rental rate.",
  "The renter is responsible for Salik, parking and traffic fines.",
  "Any refundable deposit is handled separately from rent.",
  "Late return may result in an additional rental charge.",
  "Accidents must be reported immediately with a police report.",
  "The renter is responsible for uninsured loss or damage.",
  "Smoking and pets are prohibited unless approved.",
  "Off-road driving, racing and illegal use are prohibited.",
  "This agreement is governed by applicable UAE law.",
  "Signing confirms acceptance of the full agreement.",
];

function fmtDate(iso: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(date: string, time?: string | null): string {
  const formattedDate = fmtDate(date);
  if (!time) return formattedDate;
  const [hours, minutes] = time.split(":");
  if (!hours || !minutes) return formattedDate;
  return `${formattedDate} ${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
}

function getKeyConditions(terms: string): string[] {
  const parsed = terms
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\(?\d{1,2}\)?[.)-]?|[-•])\s*/, "").trim())
    .filter(Boolean);

  if (parsed.length < 8) return DEFAULT_KEY_CONDITIONS;
  return [...parsed.slice(0, 16), ...DEFAULT_KEY_CONDITIONS].slice(0, 16);
}

async function loadImage(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const img = new Image();
        img.onload = () => resolve({ dataUrl, w: img.width, h: img.height });
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateContractPdf(
  contract: ContractPdfData,
  options?: { returnBlob?: boolean },
): Promise<Blob | void> {
  const { data: { user } } = await supabase.auth.getUser();
  let companyName = "Rental Company";
  let companyPhone = "";
  let companyEmail = "";
  let termsEn = "";
  let logoUrl: string | null = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_name, logo_url, phone_number, terms_en, email")
      .eq("id", user.id)
      .single();

    if (profile) {
      const p = profile as {
        company_name?: string | null;
        logo_url?: string | null;
        phone_number?: string | null;
        terms_en?: string | null;
        email?: string | null;
      };
      companyName = p.company_name || companyName;
      logoUrl = p.logo_url || null;
      companyPhone = p.phone_number || "";
      companyEmail = p.email || user.email || "";
      termsEn = p.terms_en || "";
    }
  }

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentW = pageW - margin * 2;
  const footerY = pageH - 38;
  const contentBottomY = footerY - 24;
  let y = margin;

  const contractNumber = `CTR-${contract.id.slice(0, 8).toUpperCase()}`;
  const c = contract.clients;
  const car = contract.cars;
  const additionalDrivers = [...(contract.contract_drivers ?? [])].sort((a, b) => a.position - b.position);
  const firstAdditionalDriver = additionalDrivers[0];
  const keyConditions = getKeyConditions(termsEn);

  const navy: [number, number, number] = [20, 34, 55];
  const blue: [number, number, number] = [20, 91, 160];
  const muted: [number, number, number] = [91, 105, 122];
  const line: [number, number, number] = [218, 224, 232];
  const soft: [number, number, number] = [246, 248, 251];
  const green: [number, number, number] = [28, 122, 79];

  const valueOrDash = (value?: string | number | null) =>
    value === null || value === undefined || value === "" ? "-" : String(value);
  const firstValue = (...values: Array<string | number | null | undefined>) => {
    const value = values.find((item) => item !== null && item !== undefined && String(item).trim() !== "");
    return value === null || value === undefined ? "" : String(value);
  };
  const money = (value: number) => `AED ${Number(value || 0).toLocaleString()}`;
  const km = (value: number) => `${Number(value || 0).toLocaleString()} km`;
  const idLabel = c?.client_type === "Tourist" ? "Passport Number" : "Emirates ID";
  const idValue = c?.client_type === "Tourist" ? valueOrDash(c?.passport_number) : valueOrDash(c?.emirates_id);
  const licenseNumber = firstValue(
    c?.license_number,
    c?.driver_license_number,
    c?.driving_license_number,
    c?.licenseNo,
    c?.drivingLicenseNo,
    c?.drivers_license,
    c?.license,
    c?.driving_license,
    c?.client_license_number,
    c?.driverLicenseNumber,
    (contract as any)?.license_number,
    (contract as any)?.driver_license_number,
    (contract as any)?.driving_license_number,
  );
  const vehicleColor = firstValue(
    car?.color,
    car?.vehicle_color,
    car?.car_color,
    car?.colour,
    (contract as any)?.color,
    (contract as any)?.vehicle_color,
  );

  let logoImage: { dataUrl: string; w: number; h: number } | null = null;
  let inspectionQr: string | null = null;

  if (logoUrl) {
    let fetchUrl = logoUrl;
    if (!logoUrl.startsWith("http")) {
      const { data: signed } = await supabase.storage
        .from("company-logos")
        .createSignedUrl(logoUrl, 60);
      if (signed?.signedUrl) fetchUrl = signed.signedUrl;
    }
    logoImage = await loadImage(fetchUrl);
  }

  try {
    inspectionQr = await QRCode.toDataURL(
      `https://uae-drive-suite.vercel.app/inspection/${contract.id}`,
      { width: 120 },
    );
  } catch {
    inspectionQr = null;
  }

  const setStroke = (color: [number, number, number] = line, width = 0.7) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(width);
  };

  const startPage = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, "F");
    y = margin;
  };

  const addPage = () => {
    doc.addPage();
    startPage();
  };

  const footer = (pageNo: number, pageTotal: number) => {
    setStroke(line, 0.6);
    doc.line(margin, footerY, pageW - margin, footerY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(contractNumber, margin, footerY + 16);
    doc.text(`Page ${pageNo} of ${pageTotal}`, pageW - margin, footerY + 16, { align: "right" });
  };

  const renderFooters = () => {
    const pageTotal = doc.getNumberOfPages();
    for (let pageNo = 1; pageNo <= pageTotal; pageNo += 1) {
      doc.setPage(pageNo);
      footer(pageNo, pageTotal);
    }
  };

  const drawBrandHeader = () => {
    const logoY = margin - 4;
    if (logoImage) {
      const h = 30;
      const w = Math.min((logoImage.w / logoImage.h) * h, 48);
      try {
        doc.addImage(logoImage.dataUrl, "PNG", margin, logoY, w, h);
      } catch {
        try {
          doc.addImage(logoImage.dataUrl, "JPEG", margin, logoY, w, h);
        } catch {
          // ignore unsupported image
        }
      }
    } else {
      doc.setFillColor(...navy);
      doc.roundedRect(margin, logoY, 30, 30, 5, 5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(255, 255, 255);
      doc.text(companyName.charAt(0).toUpperCase(), margin + 15, logoY + 20, { align: "center" });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...navy);
    doc.text(companyName, margin + 56, logoY + 12, { maxWidth: 235 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text("Car Rental", margin + 56, logoY + 26);
    if (companyPhone) doc.text(companyPhone, pageW - margin, logoY + 10, { align: "right" });
    if (companyEmail) doc.text(companyEmail, pageW - margin, logoY + 24, { align: "right" });
    y = 82;
    setStroke(line, 0.7);
    doc.line(margin, y, pageW - margin, y);
    y += 20;
  };

  const drawTitle = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(...navy);
    doc.text("CAR RENTAL AGREEMENT", margin, y);
    const badgeW = 112;
    doc.setFillColor(236, 248, 241);
    doc.setDrawColor(189, 225, 204);
    doc.roundedRect(pageW - margin - badgeW, y - 15, badgeW, 23, 11, 11, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(...green);
    doc.text("SIGNED & BINDING", pageW - margin - badgeW / 2, y - 1, { align: "center" });
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.8);
    doc.setTextColor(...muted);
    doc.text(`Document ID: ${contractNumber}`, margin, y);
    y += 18;
  };

  const compactHeader = (title: string, x: number, headerY: number, w: number) => {
    doc.setFillColor(...navy);
    doc.roundedRect(x, headerY, w, 19, 4, 4, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(255, 255, 255);
    doc.text(title, x + 10, headerY + 13);
  };

  const compactPanel = (
    x: number,
    panelY: number,
    w: number,
    title: string,
    rows: [string, string][],
  ) => {
    const rowH = 22;
    const h = 19 + rows.length * rowH + 5;
    setStroke(line, 0.6);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, panelY, w, h, 4, 4, "FD");
    compactHeader(title, x, panelY, w);
    rows.forEach(([label, value], index) => {
      const rowY = panelY + 19 + index * rowH;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.3);
      doc.setTextColor(...muted);
      doc.text(label, x + 9, rowY + 9);
      doc.setFont(/AED|\d/.test(value) ? "courier" : "helvetica", "bold");
      doc.setFontSize(7.8);
      doc.setTextColor(...navy);
      doc.text(valueOrDash(value), x + w * 0.43, rowY + 9, { maxWidth: w * 0.53 });
      if (index < rows.length - 1) {
        setStroke(line, 0.35);
        doc.line(x + 9, rowY + 16, x + w - 9, rowY + 16);
      }
    });
    return h;
  };

  const compactFieldRow = (
    rowY: number,
    title: string,
    fields: Array<[string, string]>,
    height = 48,
  ) => {
    compactHeader(title, margin, rowY, contentW);
    const bodyY = rowY + 19;
    const fieldW = contentW / fields.length;
    setStroke(line, 0.55);
    doc.setFillColor(255, 255, 255);
    doc.rect(margin, bodyY, contentW, height - 19, "FD");
    fields.forEach(([label, value], index) => {
      const x = margin + index * fieldW;
      if (index > 0) doc.line(x, bodyY, x, bodyY + height - 19);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.1);
      doc.setTextColor(...muted);
      doc.text(label, x + fieldW / 2, bodyY + 10, { align: "center", maxWidth: fieldW - 8 });
      doc.setFont(/AED|\d/.test(value) ? "courier" : "helvetica", "bold");
      doc.setFontSize(7.7);
      doc.setTextColor(...navy);
      doc.text(valueOrDash(value), x + fieldW / 2, bodyY + 24, { align: "center", maxWidth: fieldW - 8 });
    });
    return height;
  };

  const addContainedSignatureImage = (
    sig: string,
    boxX: number,
    boxY: number,
    boxW: number,
    boxH: number,
  ) => {
    try {
      const props = doc.getImageProperties(sig);
      const naturalW = Number(props.width) || boxW;
      const naturalH = Number(props.height) || boxH;
      const scale = Math.min(boxW / naturalW, boxH / naturalH);
      const renderW = naturalW * scale;
      const renderH = naturalH * scale;
      const renderX = boxX + (boxW - renderW) / 2;
      const renderY = boxY + (boxH - renderH) / 2;
      doc.addImage(sig, "PNG", renderX, renderY, renderW, renderH);
    } catch {
      // ignore invalid signature image
    }
  };

  const drawCompactSignature = (
    x: number,
    sigY: number,
    w: number,
    title: string,
    signer: string,
    sig?: string | null,
  ) => {
    setStroke(line, 0.6);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, sigY, w, 66, 4, 4, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.7);
    doc.setTextColor(...blue);
    doc.text(title, x + 9, sigY + 13);
    if (sig?.startsWith("data:image")) {
      addContainedSignatureImage(sig, x + 12, sigY + 16, w - 24, 27);
    }
    setStroke(line, 0.45);
    doc.line(x + 12, sigY + 45, x + w - 12, sigY + 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.8);
    doc.setTextColor(...navy);
    doc.text(valueOrDash(signer), x + 12, sigY + 56, { maxWidth: w - 24 });
  };

  const sectionTitle = (num: number, title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...blue);
    doc.text(`${num}. ${title.toUpperCase()}`, margin, y);
    y += 11;
    setStroke(line, 0.55);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
  };

  const keyField = (x: number, fieldY: number, w: number, label: string, value: string) => {
    doc.setFillColor(...soft);
    setStroke(line, 0.55);
    doc.roundedRect(x, fieldY, w, 46, 5, 5, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(...muted);
    doc.text(label, x + 12, fieldY + 15);
    doc.setFont(/AED|\d/.test(value) ? "courier" : "helvetica", "bold");
    doc.setFontSize(9.3);
    doc.setTextColor(...navy);
    doc.text(valueOrDash(value), x + 12, fieldY + 32, { maxWidth: w - 24 });
  };

  const addTermsPage = (continued = false) => {
    addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...blue);
    doc.text(`7. TERMS OF USE${continued ? " — CONTINUED" : ""}`, margin, y);
    y += 22;
  };

  const drawTerms = () => {
    const termsText =
      termsEn.replace(/\r\n?/g, "\n").trim() ||
      "The renter agrees to return the vehicle in the same condition as received.\n\nAny traffic fines, Salik charges, or damages incurred during the rental period are the responsibility of the renter.\n\nThe deposit will be refunded after inspection upon vehicle return.";
    const paragraphs = termsText.split("\n");
    const lineHeight = 12.2;
    const paragraphGap = 5;
    doc.setFontSize(8.7);
    paragraphs.forEach((paragraph) => {
      const text = paragraph.trim();
      if (!text) {
        y += 7;
        return;
      }
      const lines = doc.splitTextToSize(text, contentW);
      if (y + lines.length * lineHeight > contentBottomY) addTermsPage(true);
      lines.forEach((lineText: string) => {
        if (y + lineHeight > contentBottomY) addTermsPage(true);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.7);
        doc.setTextColor(...navy);
        doc.text(lineText, margin, y);
        y += lineHeight;
      });
      y += paragraphGap;
    });
  };

  startPage();
  drawBrandHeader();
  drawTitle();

  const gap = 12;
  const colW = (contentW - gap) / 2;
  const detailsY = y;
  const clientH = compactPanel(margin, detailsY, colW, "CLIENT / DRIVER DETAILS", [
    ["Full Name", valueOrDash(c?.full_name)],
    ["Phone", valueOrDash(c?.phone)],
    ["Nationality", valueOrDash(c?.nationality)],
    ["Licence Number", valueOrDash(licenseNumber)],
    [idLabel, idValue],
  ]);
  compactPanel(margin + colW + gap, detailsY, colW, "VEHICLE DETAILS", [
    ["Plate Number", valueOrDash(car?.plate)],
    ["Make & Model", car ? `${car.make} ${car.model}` : "-"],
    ["Year / Color", car ? `${car.year} / ${valueOrDash(vehicleColor)}` : "-"],
    ["Initial Mileage", km(contract.initial_mileage)],
    ["Fuel Level", valueOrDash(contract.fuel_level)],
  ]);
  y = detailsY + clientH + 10;

  y += compactFieldRow(y, "RENTAL SUMMARY", [
    ["Start", fmtDateTime(contract.start_date, contract.start_time)],
    ["End", fmtDateTime(contract.end_date, contract.end_time)],
    ["Rate Type", contract.rate_type],
    ["Rental Rate", money(contract.rate_amount)],
    ["Total Rental", money(contract.total_amount)],
    ["Deposit Held", money(contract.deposit_amount)],
  ], 56);
  y += 10;

  compactHeader("16 KEY CONDITIONS — FULL TERMS CONTINUE ON THE FOLLOWING PAGES", margin, y, contentW);
  const conditionsTop = y + 25;
  const conditionsGap = 12;
  const conditionsColW = (contentW - conditionsGap) / 2;
  const conditionLineH = 8.9;
  let maxConditionBottom = conditionsTop;

  keyConditions.forEach((condition, index) => {
    const column = index < 8 ? 0 : 1;
    const row = index % 8;
    const x = margin + column * (conditionsColW + conditionsGap);
    const itemY = conditionsTop + row * 30;
    const lines = doc.splitTextToSize(condition, conditionsColW - 28).slice(0, 2);
    doc.setFillColor(...navy);
    doc.circle(x + 8, itemY + 5, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.setTextColor(255, 255, 255);
    doc.text(String(index + 1), x + 8, itemY + 7, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.7);
    doc.setTextColor(...navy);
    doc.text(lines, x + 20, itemY + 3, { lineHeightFactor: 1.15 });
    maxConditionBottom = Math.max(maxConditionBottom, itemY + lines.length * conditionLineH + 6);
  });

  y = maxConditionBottom + 8;
  const signatureCount = firstAdditionalDriver ? 3 : 2;
  const signatureGap = 10;
  const signatureW = (contentW - signatureGap * (signatureCount - 1)) / signatureCount;
  drawCompactSignature(
    margin,
    y,
    signatureW,
    "CUSTOMER",
    c?.full_name || "",
    contract.client_signature,
  );

  if (firstAdditionalDriver) {
    drawCompactSignature(
      margin + signatureW + signatureGap,
      y,
      signatureW,
      `ADDITIONAL DRIVER ${firstAdditionalDriver.position}`,
      firstAdditionalDriver.clients?.full_name || "",
      firstAdditionalDriver.signature,
    );
    drawCompactSignature(
      margin + (signatureW + signatureGap) * 2,
      y,
      signatureW,
      "COMPANY REPRESENTATIVE",
      companyName,
      contract.manager_signature,
    );
  } else {
    drawCompactSignature(
      margin + signatureW + signatureGap,
      y,
      signatureW,
      "COMPANY REPRESENTATIVE",
      companyName,
      contract.manager_signature,
    );
  }

  addPage();
  sectionTitle(6, "Vehicle Condition at Pick-up");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(...muted);
  doc.text(
    "Recorded at vehicle handover. Inspection photos remain linked to this agreement.",
    margin,
    y,
  );
  y += 24;
  const conditionW = (contentW - 12) / 2;
  keyField(margin, y, conditionW, "Initial Mileage", km(contract.initial_mileage));
  keyField(margin + conditionW + 12, y, conditionW, "Fuel Level", valueOrDash(contract.fuel_level));
  y += 70;

  doc.setFillColor(...soft);
  setStroke(line, 0.65);
  doc.roundedRect(margin, y, contentW, 116, 6, 6, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text("Inspection Photos", margin + 18, y + 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(...muted);
  doc.text(
    "Scan the QR code to open the vehicle inspection record and photos.",
    margin + 18,
    y + 52,
    { maxWidth: contentW - 130 },
  );
  if (inspectionQr) doc.addImage(inspectionQr, "PNG", pageW - margin - 88, y + 14, 88, 88);
  y += 142;

  addTermsPage(false);
  drawTerms();

  addPage();
  sectionTitle(8, "Return Check-in");
  doc.setFillColor(...soft);
  setStroke(line, 0.65);
  doc.roundedRect(margin, y, contentW, 92, 6, 6, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...navy);
  doc.text("To be completed when the vehicle is returned", margin + 18, y + 29);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(...muted);
  doc.text(
    "Return mileage, fuel level, damage notes and return photos will be recorded during check-in.",
    margin + 18,
    y + 52,
    { maxWidth: contentW - 36 },
  );
  y += 122;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...blue);
  doc.text(
    additionalDrivers.length > 1 ? "SIGNATURES ARE RECORDED IN THIS AGREEMENT" : "SIGNATURES ARE RECORDED ON PAGE 1",
    margin,
    y,
  );
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(...muted);
  doc.text(
    additionalDrivers.length > 1
      ? "The customer, company representative and first additional driver sign on page 1. Further approved drivers sign on the additional driver signature pages."
      : "The signed first page forms part of this complete agreement and applies to all following pages.",
    margin,
    y,
    { maxWidth: contentW },
  );

  const remainingDrivers = firstAdditionalDriver ? additionalDrivers.slice(1) : additionalDrivers;
  const driversPerPage = 3;
  for (let offset = 0; offset < remainingDrivers.length; offset += driversPerPage) {
    const pageDrivers = remainingDrivers.slice(offset, offset + driversPerPage);
    addPage();
    sectionTitle(10, "Additional Driver Signatures");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(...muted);
    doc.text(
      "Each driver confirms that their driving documents are valid and accepts the driving obligations in this agreement.",
      margin,
      y,
      { maxWidth: contentW },
    );
    y += 30;

    pageDrivers.forEach((driver) => {
      const client = driver.clients;
      const boxY = y;
      doc.setFillColor(255, 255, 255);
      setStroke(line, 0.7);
      doc.roundedRect(margin, boxY, contentW, 164, 6, 6, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...blue);
      doc.text(`ADDITIONAL DRIVER ${driver.position}`, margin + 16, boxY + 23);
      const driverColW = (contentW - 32) / 3;
      const driverFields: [string, string][] = [
        ["Full Name", valueOrDash(client?.full_name)],
        ["License Number", valueOrDash(client?.license_number)],
        ["License Expiry", client?.license_expiry ? fmtDate(client.license_expiry) : "-"],
      ];
      driverFields.forEach(([label, value], index) => {
        const fieldX = margin + 16 + driverColW * index;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.8);
        doc.setTextColor(...muted);
        doc.text(label, fieldX, boxY + 48);
        doc.setFont(/\d/.test(value) ? "courier" : "helvetica", "bold");
        doc.setFontSize(8.4);
        doc.setTextColor(...navy);
        doc.text(value, fieldX, boxY + 64, { maxWidth: driverColW - 12 });
      });
      if (driver.signature?.startsWith("data:image")) {
        addContainedSignatureImage(driver.signature, margin + 28, boxY + 78, 222, 48);
      }
      setStroke(line, 0.55);
      doc.line(margin + 28, boxY + 130, margin + 250, boxY + 130);
      y = boxY + 182;
    });
  }

  renderFooters();
  const filename = `Contract_${contractNumber}_${(c?.full_name || "client").replace(/\s+/g, "_")}.pdf`;
  if (options?.returnBlob) return doc.output("blob");
  doc.save(filename);
}
