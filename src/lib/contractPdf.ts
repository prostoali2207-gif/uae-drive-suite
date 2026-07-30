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

function fmtDate(iso: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(date: string, time?: string | null): string {
  const formattedDate = fmtDate(date);
  if (!time) return formattedDate;
  const [hours, minutes] = time.split(":");
  if (!hours || !minutes) return formattedDate;
  return `${formattedDate} ${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
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

export async function generateContractPdf(contract: ContractPdfData, options?: { returnBlob?: boolean }): Promise<Blob | void> {
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
  const margin = 34;
  const contentW = pageW - margin * 2;
  let y = margin;

  const contractNumber = `CTR-${contract.id.slice(0, 8).toUpperCase()}`;
  const today = fmtDate(new Date().toISOString());
  const c = contract.clients;
  const car = contract.cars;
  const additionalDrivers = contract.contract_drivers ?? [];

  const blue: [number, number, number] = [0, 90, 179];
  const blueSoft: [number, number, number] = [240, 247, 255];
  const ink: [number, number, number] = [15, 23, 42];
  const muted: [number, number, number] = [86, 100, 120];
  const line: [number, number, number] = [214, 224, 235];
  const panel: [number, number, number] = [249, 251, 253];

  const valueOrDash = (value?: string | number | null) => {
    if (value === null || value === undefined || value === "") return "-";
    return String(value);
  };
  const firstValue = (...values: Array<string | number | null | undefined>) => {
    const value = values.find((v) => v !== null && v !== undefined && String(v).trim() !== "");
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
    (c as any)?.license_number,
    (c as any)?.driver_license_number,
    (c as any)?.driving_license_number,
    (c as any)?.licenseNo,
    (c as any)?.drivingLicenseNo,
    (c as any)?.drivers_license,
    (c as any)?.license,
    (c as any)?.driving_license,
    (c as any)?.client_license_number,
    (c as any)?.driverLicenseNumber,
    (contract as any)?.license_number,
    (contract as any)?.driver_license_number,
    (contract as any)?.driving_license_number,
    (contract as any)?.licenseNo,
    (contract as any)?.drivingLicenseNo,
    (contract as any)?.drivers_license,
    (contract as any)?.license,
    (contract as any)?.driving_license,
    (contract as any)?.client_license_number,
    (contract as any)?.driverLicenseNumber,
  );
  const vehicleColor = firstValue(
    car?.color,
    car?.vehicle_color,
    car?.car_color,
    car?.colour,
    (car as any)?.color,
    (car as any)?.vehicle_color,
    (car as any)?.car_color,
    (car as any)?.colour,
    (contract as any)?.color,
    (contract as any)?.vehicle_color,
    (contract as any)?.car_color,
    (contract as any)?.colour,
  );
  const exteriorCondition = firstValue(
    (contract as any)?.exterior_condition,
    (contract as any)?.exteriorCondition,
    contract.special_conditions,
  );
  const interiorCondition = firstValue(
    (contract as any)?.interior_condition,
    (contract as any)?.interiorCondition,
  );

  let logoImage: { dataUrl: string; w: number; h: number } | null = null;
  let inspectionQr: string | null = null;
  if (logoUrl) {
    let fetchUrl = logoUrl;
    if (!logoUrl.startsWith("http")) {
      const { data: signed } = await supabase.storage.from("company-logos").createSignedUrl(logoUrl, 60);
      if (signed?.signedUrl) fetchUrl = signed.signedUrl;
    }
    logoImage = await loadImage(fetchUrl);
  }
  try {
    inspectionQr = await QRCode.toDataURL(`https://uae-drive-suite.vercel.app/inspection/${contract.id}`, { width: 120 });
  } catch {
    inspectionQr = null;
  }

  const setStroke = (color: [number, number, number] = line, width = 0.7) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(width);
  };

  const pageFrame = () => {
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, pageW, pageH, "F");
    setStroke(line, 0.7);
    doc.rect(10, 10, pageW - 20, pageH - 20);
  };

  const footerY = pageH - 42;
  const contentBottomY = footerY - 24;

  const footer = (pageNo: number, pageTotal: number) => {
    doc.setDrawColor(...blue);
    doc.setLineWidth(1);
    doc.line(margin, footerY, pageW - margin, footerY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(`Page ${pageNo} of ${pageTotal}`, pageW - margin, footerY + 17, { align: "right" });
  };

  const startPage = (pageNo: number) => {
    if (pageNo > 1) doc.addPage();
    pageFrame();
    y = pageNo === 1 ? margin : margin + 20;
  };

  const addContentPage = () => {
    doc.addPage();
    pageFrame();
    y = margin + 20;
  };

  const renderFooters = () => {
    const pageTotal = doc.getNumberOfPages();
    for (let pageNo = 1; pageNo <= pageTotal; pageNo += 1) {
      doc.setPage(pageNo);
      footer(pageNo, pageTotal);
    }
  };

  const sectionTitle = (num: number, title: string, suffix = "", x = margin) => {
    const label = `${num}.  ${title.toUpperCase()}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...blue);
    doc.text(label, x, y);
    if (suffix) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text(suffix.toUpperCase(), x + doc.getTextWidth(label) + 8, y);
    }
    y += 17;
  };

  const iconBadge = (x: number, rowY: number) => {
    doc.setFillColor(...blueSoft);
    doc.setDrawColor(205, 224, 245);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, rowY, 22, 22, 3, 3, "FD");
    doc.setFillColor(...blue);
    doc.circle(x + 11, rowY + 11, 3, "F");
  };

  const fieldCard = (x: number, rowY: number, w: number, label: string, value: string) => {
    doc.setFillColor(255, 255, 255);
    setStroke(line, 0.6);
    doc.roundedRect(x, rowY, w, 42, 4, 4, "FD");
    iconBadge(x + 8, rowY + 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(label, x + 38, rowY + 15);
    doc.setFont(String(value).startsWith("AED ") || /\d/.test(value) ? "courier" : "helvetica", "bold");
    doc.setFontSize(8.7);
    doc.setTextColor(...ink);
    doc.text(valueOrDash(value), x + 38, rowY + 28, { maxWidth: w - 46 });
  };

  const summaryTile = (x: number, rowY: number, w: number, label: string, value: string, accent = false) => {
    doc.setFillColor(accent ? 244 : 255, accent ? 248 : 255, accent ? 252 : 255);
    setStroke(accent ? blue : line, accent ? 0.85 : 0.6);
    doc.roundedRect(x, rowY, w, 62, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.4);
    doc.setTextColor(accent ? blue[0] : muted[0], accent ? blue[1] : muted[1], accent ? blue[2] : muted[2]);
    doc.text(label, x + 10, rowY + 20, { maxWidth: w - 20 });
    doc.setFont(value.startsWith("AED") || /\d/.test(value) ? "courier" : "helvetica", "bold");
    doc.setFontSize(accent ? 11.5 : 9.4);
    doc.setTextColor(...ink);
    doc.text(value, x + 10, rowY + 43, { maxWidth: w - 20 });
  };

  const listCard = (x: number, rowY: number, w: number, rows: [string, string][]) => {
    const h = rows.length * 43 + 8;
    doc.setFillColor(255, 255, 255);
    setStroke(line, 0.7);
    doc.roundedRect(x, rowY, w, h, 4, 4, "FD");
    rows.forEach(([label, value], index) => {
      const itemY = rowY + 8 + index * 43;
      iconBadge(x + 9, itemY + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(...muted);
      doc.text(label, x + 40, itemY + 14);
      doc.setFont(/\d|AED/.test(value) ? "courier" : "helvetica", "bold");
      doc.setFontSize(8.8);
      doc.setTextColor(...ink);
      doc.text(valueOrDash(value), x + 40, itemY + 28, { maxWidth: w - 50 });
      if (index < rows.length - 1) {
        setStroke(line, 0.45);
        doc.line(x + 40, itemY + 38, x + w - 10, itemY + 38);
      }
    });
    return h;
  };

  const drawHeader = () => {
    const logoX = margin;
    const logoY = margin - 3;
    if (logoImage) {
      const h = 28;
      const w = Math.min((logoImage.w / logoImage.h) * h, 34);
      try {
        doc.addImage(logoImage.dataUrl, "PNG", logoX, logoY, w, h);
      } catch {
        try { doc.addImage(logoImage.dataUrl, "JPEG", logoX, logoY, w, h); } catch { /* ignore */ }
      }
    } else {
      doc.setFillColor(...blueSoft);
      doc.circle(logoX + 14, logoY + 14, 14, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...blue);
      doc.text(companyName.charAt(0).toUpperCase(), logoX + 14, logoY + 18, { align: "center" });
    }
    if (!logoImage) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(...ink);
      doc.text(companyName, logoX + 42, logoY + 12, { maxWidth: 210 });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...blue);
      doc.text("Car Rental", logoX + 42, logoY + 27);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...ink);
    if (companyPhone) doc.text(companyPhone, pageW - margin, logoY + 10, { align: "right" });
    if (companyEmail) doc.text(companyEmail, pageW - margin, logoY + 25, { align: "right" });
    y = 94;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...ink);
    doc.text("CAR RENTAL AGREEMENT", margin, y);
    y += 17;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    doc.text("Signed by all required parties - legally binding", margin, y);
    y += 24;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`Document ID: ${contractNumber}    |    Date of Issue: ${today}`, margin, y);
    y += 34;
  };

  const termsSectionNumber = additionalDrivers.length > 0 ? 7 : 6;
  const drawTermsContinuationTitle = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...blue);
    doc.text(`${termsSectionNumber}.  TERMS OF USE — CONTINUED`, margin, y);
    y += 23;
  };

  const addTermsContinuationPage = () => {
    addContentPage();
    drawTermsContinuationTitle();
  };

  const drawTerms = () => {
    const termsText = termsEn.replace(/\r\n?/g, "\n").trim() ||
      "The renter agrees to return the vehicle in the same condition as received.\n\nAny traffic fines, Salik charges, or damages incurred during the rental period are the responsibility of the renter.\n\nThe deposit will be refunded after inspection upon vehicle return.";
    const paragraphs = termsText.replace(/\r\n?/g, "\n").split("\n");
    const lineHeight = 11.5;
    const paragraphGap = 4.5;
    const blankLineGap = 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.3);
    doc.setTextColor(...ink);

    const getParagraphHeight = (lines: string[]) => lines.length * lineHeight;

    paragraphs.forEach((paragraph) => {
      const text = paragraph.trim();
      if (!text) {
        y += blankLineGap;
        if (y > contentBottomY) addTermsContinuationPage();
        return;
      }

      const lines = doc.splitTextToSize(text, contentW);
      const paragraphHeight = getParagraphHeight(lines);
      const availableOnFreshTermsPage = contentBottomY - (margin + 43);
      if (y + paragraphHeight > contentBottomY) addTermsContinuationPage();
      lines.forEach((lineText: string) => {
        if (paragraphHeight > availableOnFreshTermsPage && y + lineHeight > contentBottomY) addTermsContinuationPage();
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.3);
        doc.setTextColor(...ink);
        doc.text(lineText, margin, y);
        y += lineHeight;
      });
      y += paragraphGap;
    });
  };

  const ensureBlockFits = (height: number) => {
    if (y + height > contentBottomY) addContentPage();
  };

  startPage(1);
  drawHeader();

  const twoColGap = 22;
  const colW = (contentW - twoColGap) / 2;
  const topY = y;
  sectionTitle(1, "Client Details");
  const clientY = y;
  const clientH = listCard(margin, clientY, colW, [
    ["Full Name", valueOrDash(c?.full_name)],
    ["Phone", valueOrDash(c?.phone)],
    ["Nationality", valueOrDash(c?.nationality)],
    ["License Number", valueOrDash(licenseNumber)],
    [idLabel, idValue],
  ]);

  y = topY;
  const vehicleX = margin + colW + twoColGap;
  sectionTitle(2, "Vehicle Details", "", vehicleX);
  listCard(vehicleX, y, colW, [
    ["Plate Number", valueOrDash(car?.plate)],
    ["Make & Model", car ? `${car.make} ${car.model}` : "-"],
    ["Year", car ? String(car.year) : "-"],
    ["Color", vehicleColor || "—"],
  ]);

  y = clientY + clientH + 18;
  if (additionalDrivers.length > 0) {
    sectionTitle(3, "Authorized Additional Drivers");
    const driverRows = additionalDrivers.map((driver) => [
      `Driver ${driver.position}`,
      `${valueOrDash(driver.clients?.full_name)} · Licence ${valueOrDash(driver.clients?.license_number)}`,
    ] as [string, string]);
    const driversH = listCard(margin, y, contentW, driverRows);
    y += driversH + 22;
  } else {
    y += 16;
  }

  sectionTitle(additionalDrivers.length > 0 ? 4 : 3, "Rental Period");
  const periodY = y;
  const periodGap = 12;
  const periodW = (contentW - periodGap * 2) / 3;
  fieldCard(margin, periodY, periodW, "Start Date", fmtDateTime(contract.start_date, contract.start_time));
  fieldCard(margin + periodW + periodGap, periodY, periodW, "End Date", fmtDateTime(contract.end_date, contract.end_time));
  fieldCard(margin + (periodW + periodGap) * 2, periodY, periodW, "Rate Type", contract.rate_type);
  y = periodY + 68;

  sectionTitle(additionalDrivers.length > 0 ? 5 : 4, "Financial Summary");
  const tileGap = 10;
  const tileW = (contentW - tileGap * 3) / 4;
  const financeY = y;
  doc.setFillColor(...panel);
  setStroke(line, 0.7);
  doc.roundedRect(margin, financeY, contentW, 78, 4, 4, "FD");
  summaryTile(margin + 9, financeY + 9, tileW, `${contract.rate_type} Rate`, money(contract.rate_amount));
  summaryTile(margin + 9 + tileW + tileGap, financeY + 9, tileW, "Total Rental Amount", money(contract.total_amount), true);
  summaryTile(margin + 9 + (tileW + tileGap) * 2, financeY + 9, tileW, "Deposit Held", money(contract.deposit_amount), true);
  summaryTile(margin + 9 + (tileW + tileGap) * 3, financeY + 9, tileW, "Fines, parking & tolls", "Charged as incurred");
  y = financeY + 103;

  ensureBlockFits(170);
  sectionTitle(additionalDrivers.length > 0 ? 6 : 5, "Vehicle Condition at Pick-up");
  const condY = y;
  const condGap = 10;
  const conditionRows: [string, string][] = [
    ["Initial Mileage", km(contract.initial_mileage)],
    ["Fuel Level", valueOrDash(contract.fuel_level)],
  ];
  if (exteriorCondition) conditionRows.push(["Exterior Condition", exteriorCondition]);
  if (interiorCondition) conditionRows.push(["Interior Condition", interiorCondition]);
  const condW = (contentW - condGap * (conditionRows.length - 1)) / conditionRows.length;
  conditionRows.forEach(([label, value], index) => fieldCard(margin + (condW + condGap) * index, condY, condW, label, value));
  const qrY = condY + 54;
  doc.setFillColor(255, 255, 255);
  setStroke(line, 0.6);
  doc.roundedRect(margin, qrY, contentW, 64, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.8);
  doc.setTextColor(...ink);
  doc.text("Inspection Photos", margin + 16, qrY + 24);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  doc.text("Scan to view vehicle inspection photos.", margin + 16, qrY + 42);
  if (inspectionQr) doc.addImage(inspectionQr, "PNG", pageW - margin - 54, qrY + 5, 54, 54);

  startPage(2);
  sectionTitle(termsSectionNumber, "Terms of Use");
  y += 6;
  drawTerms();

  addContentPage();
  sectionTitle(additionalDrivers.length > 0 ? 8 : 7, "Return Check-in");
  const returnY = y;
  doc.setFillColor(255, 255, 255);
  setStroke(line, 0.7);
  doc.roundedRect(margin, returnY, contentW, 84, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...ink);
  doc.text("To be completed when the vehicle is returned.", margin + 18, returnY + 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("Return mileage, fuel level, damage notes, and photos will be recorded at check-in.", margin + 18, returnY + 51, { maxWidth: contentW - 36 });
  y = returnY + 120;

  ensureBlockFits(253);
  sectionTitle(additionalDrivers.length > 0 ? 9 : 8, "Agreement & Signatures");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...ink);
  doc.text("By signing below, all required parties confirm that they have read, understood, and agreed to all terms and conditions stated in this Car Rental Agreement.", margin, y, { maxWidth: contentW });
  y += 28;

  const sigW = (contentW - 12) / 2;
  const sigH = 118;
  const sigY = y;
  const drawSignatureBox = (x: number, title: string, signer: string, sig?: string | null) => {
    doc.setFillColor(255, 255, 255);
    setStroke(line, 0.7);
    doc.roundedRect(x, sigY, sigW, sigH, 4, 4, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...blue);
    doc.text(title, x + sigW / 2, sigY + 20, { align: "center" });
    if (sig && sig.startsWith("data:image")) {
      try { doc.addImage(sig, "PNG", x + 45, sigY + 30, sigW - 90, 42); } catch { /* ignore */ }
    }
    setStroke(line, 0.6);
    doc.line(x + 36, sigY + 74, x + sigW - 36, sigY + 74);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...ink);
    doc.text(valueOrDash(signer), x + 36, sigY + 92, { maxWidth: sigW - 72 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...ink);
    doc.text(`Date: ${today}`, x + 36, sigY + 108);
  };
  drawSignatureBox(margin, "CUSTOMER", c?.full_name || "", contract.client_signature);
  drawSignatureBox(margin + sigW + 12, "COMPANY REPRESENTATIVE", companyName, contract.manager_signature);
  y = sigY + sigH + 20;

  doc.setFillColor(...panel);
  setStroke(line, 0.7);
  doc.roundedRect(margin, y, contentW, 70, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...blue);
  doc.text("Total Rental Amount", margin + contentW * 0.25, y + 25, { align: "center" });
  doc.text("Deposit Held", margin + contentW * 0.75, y + 25, { align: "center" });
  doc.setFont("courier", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...blue);
  doc.text(money(contract.total_amount), margin + contentW * 0.25, y + 49, { align: "center" });
  doc.text(money(contract.deposit_amount), margin + contentW * 0.75, y + 49, { align: "center" });
  setStroke(line, 0.8);
  doc.line(margin + contentW / 2, y + 14, margin + contentW / 2, y + 58);

  const driversPerPage = 3;
  for (let offset = 0; offset < additionalDrivers.length; offset += driversPerPage) {
    const pageDrivers = additionalDrivers.slice(offset, offset + driversPerPage);
    addContentPage();
    sectionTitle(10, "Additional Driver Signatures");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...ink);
    doc.text("Each driver confirms that their driving documents are valid and agrees to the driving obligations in this rental agreement.", margin, y, { maxWidth: contentW });
    y += 30;

    pageDrivers.forEach((driver) => {
      const client = driver.clients;
      const boxY = y;
      doc.setFillColor(255, 255, 255);
      setStroke(line, 0.7);
      doc.roundedRect(margin, boxY, contentW, 174, 4, 4, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...blue);
      doc.text(`ADDITIONAL DRIVER ${driver.position}`, margin + 14, boxY + 22);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text("Full Name", margin + 14, boxY + 45);
      doc.text("License Number", margin + 205, boxY + 45);
      doc.text("License Expiry", margin + 390, boxY + 45);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...ink);
      doc.text(valueOrDash(client?.full_name), margin + 14, boxY + 60, { maxWidth: 170 });
      doc.text(valueOrDash(client?.license_number), margin + 205, boxY + 60, { maxWidth: 160 });
      doc.text(client?.license_expiry ? fmtDate(client.license_expiry) : "-", margin + 390, boxY + 60, { maxWidth: 120 });
      if (driver.signature?.startsWith("data:image")) {
        try { doc.addImage(driver.signature, "PNG", margin + 40, boxY + 78, 190, 50); } catch { /* ignore */ }
      }
      setStroke(line, 0.6);
      doc.line(margin + 30, boxY + 132, margin + 250, boxY + 132);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...ink);
      doc.text(`Date: ${today}`, margin + 30, boxY + 151);
      y = boxY + 190;
    });
  }

  renderFooters();
  const filename = `Contract_${contractNumber}_${(c?.full_name || "client").replace(/\s+/g, "_")}.pdf`;
  if (options?.returnBlob) return doc.output("blob");
  doc.save(filename);
}
