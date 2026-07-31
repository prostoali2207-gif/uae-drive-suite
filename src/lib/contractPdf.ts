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
  const margin = 40;
  const contentW = pageW - margin * 2;
  const footerY = pageH - 38;
  const contentBottomY = footerY - 24;
  let y = margin;

  const contractNumber = `CTR-${contract.id.slice(0, 8).toUpperCase()}`;
  const today = fmtDate(new Date().toISOString());
  const c = contract.clients;
  const car = contract.cars;
  const additionalDrivers = contract.contract_drivers ?? [];

  const navy: [number, number, number] = [20, 34, 55];
  const blue: [number, number, number] = [20, 91, 160];
  const muted: [number, number, number] = [91, 105, 122];
  const line: [number, number, number] = [218, 224, 232];
  const soft: [number, number, number] = [246, 248, 251];
  const green: [number, number, number] = [28, 122, 79];

  const valueOrDash = (value?: string | number | null) => value === null || value === undefined || value === "" ? "-" : String(value);
  const firstValue = (...values: Array<string | number | null | undefined>) => {
    const value = values.find((item) => item !== null && item !== undefined && String(item).trim() !== "");
    return value === null || value === undefined ? "" : String(value);
  };
  const money = (value: number) => `AED ${Number(value || 0).toLocaleString()}`;
  const km = (value: number) => `${Number(value || 0).toLocaleString()} km`;
  const idLabel = c?.client_type === "Tourist" ? "Passport Number" : "Emirates ID";
  const idValue = c?.client_type === "Tourist" ? valueOrDash(c?.passport_number) : valueOrDash(c?.emirates_id);
  const licenseNumber = firstValue(
    c?.license_number, c?.driver_license_number, c?.driving_license_number, c?.licenseNo,
    c?.drivingLicenseNo, c?.drivers_license, c?.license, c?.driving_license,
    c?.client_license_number, c?.driverLicenseNumber,
    (contract as any)?.license_number, (contract as any)?.driver_license_number,
    (contract as any)?.driving_license_number,
  );
  const vehicleColor = firstValue(
    car?.color, car?.vehicle_color, car?.car_color, car?.colour,
    (contract as any)?.color, (contract as any)?.vehicle_color,
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
      const h = 34;
      const w = Math.min((logoImage.w / logoImage.h) * h, 52);
      try {
        doc.addImage(logoImage.dataUrl, "PNG", margin, logoY, w, h);
      } catch {
        try { doc.addImage(logoImage.dataUrl, "JPEG", margin, logoY, w, h); } catch { /* ignore */ }
      }
    } else {
      doc.setFillColor(...navy);
      doc.roundedRect(margin, logoY, 34, 34, 6, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text(companyName.charAt(0).toUpperCase(), margin + 17, logoY + 22, { align: "center" });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...navy);
    doc.text(companyName, margin + 62, logoY + 14, { maxWidth: 245 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text("Car Rental", margin + 62, logoY + 29);
    if (companyPhone) doc.text(companyPhone, pageW - margin, logoY + 12, { align: "right" });
    if (companyEmail) doc.text(companyEmail, pageW - margin, logoY + 27, { align: "right" });
    y = 92;
    setStroke(line, 0.7);
    doc.line(margin, y, pageW - margin, y);
    y += 27;
  };

  const drawTitle = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(21);
    doc.setTextColor(...navy);
    doc.text("CAR RENTAL AGREEMENT", margin, y);
    const badgeW = 116;
    doc.setFillColor(236, 248, 241);
    doc.setDrawColor(189, 225, 204);
    doc.roundedRect(pageW - margin - badgeW, y - 16, badgeW, 25, 12, 12, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...green);
    doc.text("SIGNED & BINDING", pageW - margin - badgeW / 2, y, { align: "center" });
    y += 25;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...muted);
    doc.text(`Document ID: ${contractNumber}`, margin, y);
    doc.text(`Date of Issue: ${today}`, pageW - margin, y, { align: "right" });
    y += 28;
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

  const infoPanel = (x: number, panelY: number, w: number, rows: [string, string][]) => {
    const rowH = 34;
    const h = rows.length * rowH + 10;
    doc.setFillColor(255, 255, 255);
    setStroke(line, 0.65);
    doc.roundedRect(x, panelY, w, h, 5, 5, "FD");
    rows.forEach(([label, value], index) => {
      const itemY = panelY + 10 + index * rowH;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.setTextColor(...muted);
      doc.text(label, x + 12, itemY + 8);
      doc.setFont(/AED|\d/.test(value) ? "courier" : "helvetica", "bold");
      doc.setFontSize(8.7);
      doc.setTextColor(...navy);
      doc.text(valueOrDash(value), x + 12, itemY + 22, { maxWidth: w - 24 });
      if (index < rows.length - 1) {
        setStroke(line, 0.4);
        doc.line(x + 12, itemY + 29, x + w - 12, itemY + 29);
      }
    });
    return h;
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

  const amountBlock = (x: number, blockY: number, w: number, label: string, value: string, primary = false) => {
    doc.setFillColor(primary ? 240 : 255, primary ? 246 : 255, primary ? 252 : 255);
    setStroke(primary ? blue : line, primary ? 0.9 : 0.6);
    doc.roundedRect(x, blockY, w, 64, 5, 5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(primary ? blue[0] : muted[0], primary ? blue[1] : muted[1], primary ? blue[2] : muted[2]);
    doc.text(label, x + 12, blockY + 20, { maxWidth: w - 24 });
    doc.setFont("courier", "bold");
    doc.setFontSize(primary ? 13 : 11);
    doc.setTextColor(...navy);
    doc.text(value, x + 12, blockY + 45, { maxWidth: w - 24 });
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
    const termsText = termsEn.replace(/\r\n?/g, "\n").trim() ||
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

  const gap = 18;
  const colW = (contentW - gap) / 2;
  const detailsTop = y;
  sectionTitle(1, "Client Details");
  const clientPanelY = y;
  const clientH = infoPanel(margin, clientPanelY, colW, [
    ["Full Name", valueOrDash(c?.full_name)],
    ["Phone", valueOrDash(c?.phone)],
    ["Nationality", valueOrDash(c?.nationality)],
    ["License Number", valueOrDash(licenseNumber)],
    [idLabel, idValue],
  ]);

  y = detailsTop;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...blue);
  doc.text("2. VEHICLE DETAILS", margin + colW + gap, y);
  y += 11;
  setStroke(line, 0.55);
  doc.line(margin + colW + gap, y, pageW - margin, y);
  y += 14;
  infoPanel(margin + colW + gap, y, colW, [
    ["Plate Number", valueOrDash(car?.plate)],
    ["Make & Model", car ? `${car.make} ${car.model}` : "-"],
    ["Year", car ? String(car.year) : "-"],
    ["Color", valueOrDash(vehicleColor)],
  ]);

  y = clientPanelY + clientH + 20;
  if (additionalDrivers.length > 0) {
    sectionTitle(3, "Authorized Additional Drivers");
    const driverH = 42;
    doc.setFillColor(...soft);
    setStroke(line, 0.55);
    doc.roundedRect(margin, y, contentW, additionalDrivers.length * driverH + 8, 5, 5, "FD");
    additionalDrivers.forEach((driver, index) => {
      const rowY = y + 8 + index * driverH;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(...muted);
      doc.text(`DRIVER ${driver.position}`, margin + 12, rowY + 10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...navy);
      doc.text(valueOrDash(driver.clients?.full_name), margin + 12, rowY + 26, { maxWidth: 250 });
      doc.setFont("courier", "normal");
      doc.setFontSize(8.3);
      doc.text(`Licence ${valueOrDash(driver.clients?.license_number)}`, pageW - margin - 12, rowY + 26, { align: "right" });
      if (index < additionalDrivers.length - 1) {
        setStroke(line, 0.4);
        doc.line(margin + 12, rowY + 35, pageW - margin - 12, rowY + 35);
      }
    });
    y += additionalDrivers.length * driverH + 28;
  }

  sectionTitle(additionalDrivers.length > 0 ? 4 : 3, "Rental Period");
  const periodW = (contentW - 20) / 3;
  keyField(margin, y, periodW, "Start", fmtDateTime(contract.start_date, contract.start_time));
  keyField(margin + periodW + 10, y, periodW, "End", fmtDateTime(contract.end_date, contract.end_time));
  keyField(margin + (periodW + 10) * 2, y, periodW, "Rate Type", contract.rate_type);
  y += 66;

  sectionTitle(additionalDrivers.length > 0 ? 5 : 4, "Financial Summary");
  const amountGap = 10;
  const amountW = (contentW - amountGap * 2) / 3;
  amountBlock(margin, y, amountW, `${contract.rate_type} Rate`, money(contract.rate_amount));
  amountBlock(margin + amountW + amountGap, y, amountW, "Total Rental Amount", money(contract.total_amount), true);
  amountBlock(margin + (amountW + amountGap) * 2, y, amountW, "Deposit Held", money(contract.deposit_amount), true);
  y += 77;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(...muted);
  doc.text("Fines, parking and toll charges are billed separately as incurred.", margin, y);

  addPage();
  sectionTitle(additionalDrivers.length > 0 ? 6 : 5, "Vehicle Condition at Pick-up");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(...muted);
  doc.text("Recorded at vehicle handover. Inspection photos remain linked to this agreement.", margin, y);
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
  doc.text("Scan the QR code to open the vehicle inspection record and photos.", margin + 18, y + 52, { maxWidth: contentW - 130 });
  if (inspectionQr) doc.addImage(inspectionQr, "PNG", pageW - margin - 88, y + 14, 88, 88);
  y += 142;

  addTermsPage(false);
  drawTerms();

  addPage();
  sectionTitle(additionalDrivers.length > 0 ? 8 : 7, "Return Check-in");
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
  doc.text("Return mileage, fuel level, damage notes and return photos will be recorded during check-in.", margin + 18, y + 52, { maxWidth: contentW - 36 });
  y += 122;

  sectionTitle(additionalDrivers.length > 0 ? 9 : 8, "Agreement & Signatures");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(...navy);
  doc.text("By signing below, all required parties confirm that they have read, understood and accepted this Car Rental Agreement.", margin, y, { maxWidth: contentW });
  y += 34;

  const sigGap = 14;
  const sigW = (contentW - sigGap) / 2;
  const sigH = 126;
  const sigY = y;
  const drawSignatureBox = (x: number, title: string, signer: string, sig?: string | null) => {
    doc.setFillColor(255, 255, 255);
    setStroke(line, 0.7);
    doc.roundedRect(x, sigY, sigW, sigH, 6, 6, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.8);
    doc.setTextColor(...blue);
    doc.text(title, x + 16, sigY + 21);
    if (sig?.startsWith("data:image")) {
      try { doc.addImage(sig, "PNG", x + 32, sigY + 31, sigW - 64, 43); } catch { /* ignore */ }
    }
    setStroke(line, 0.55);
    doc.line(x + 24, sigY + 78, x + sigW - 24, sigY + 78);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...navy);
    doc.text(valueOrDash(signer), x + 24, sigY + 96, { maxWidth: sigW - 48 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.6);
    doc.setTextColor(...muted);
    doc.text(`Date: ${today}`, x + 24, sigY + 114);
  };

  drawSignatureBox(margin, "CUSTOMER", c?.full_name || "", contract.client_signature);
  drawSignatureBox(margin + sigW + sigGap, "COMPANY REPRESENTATIVE", companyName, contract.manager_signature);
  y = sigY + sigH + 22;
  const finalW = (contentW - 12) / 2;
  amountBlock(margin, y, finalW, "Total Rental Amount", money(contract.total_amount), true);
  amountBlock(margin + finalW + 12, y, finalW, "Deposit Held", money(contract.deposit_amount), true);

  const driversPerPage = 3;
  for (let offset = 0; offset < additionalDrivers.length; offset += driversPerPage) {
    const pageDrivers = additionalDrivers.slice(offset, offset + driversPerPage);
    addPage();
    sectionTitle(10, "Additional Driver Signatures");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(...muted);
    doc.text("Each driver confirms that their driving documents are valid and accepts the driving obligations in this agreement.", margin, y, { maxWidth: contentW });
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
        try { doc.addImage(driver.signature, "PNG", margin + 34, boxY + 82, 190, 44); } catch { /* ignore */ }
      }
      setStroke(line, 0.55);
      doc.line(margin + 28, boxY + 130, margin + 250, boxY + 130);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.6);
      doc.setTextColor(...muted);
      doc.text(`Date: ${today}`, margin + 28, boxY + 149);
      y = boxY + 182;
    });
  }

  renderFooters();
  const filename = `Contract_${contractNumber}_${(c?.full_name || "client").replace(/\s+/g, "_")}.pdf`;
  if (options?.returnBlob) return doc.output("blob");
  doc.save(filename);
}
