import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

interface ContractPdfData {
  id: string;
  start_date: string;
  end_date: string;
  rate_type: string;
  rate_amount: number;
  total_amount: number;
  deposit_amount: number;
  initial_mileage: number;
  fuel_level: string;
  special_conditions?: string | null;
  client_signature?: string | null;
  manager_signature?: string | null;
  clients: {
    full_name: string;
    phone: string;
    nationality: string;
    client_type: string;
    emirates_id: string | null;
    passport_number: string | null;
  } | null;
  cars: {
    plate: string;
    make: string;
    model: string;
    year: number;
  } | null;
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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
  // Fetch company profile (logo + name + phone + terms)
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
  const margin = 48;
  let y = margin;
  const contractNumber = `CTR-${contract.id.slice(0, 8).toUpperCase()}`;
  const today = fmtDate(new Date().toISOString());
  const c = contract.clients;
  const car = contract.cars;
  const navy: [number, number, number] = [15, 23, 42];
  const slate: [number, number, number] = [148, 163, 184];
  const lightLine: [number, number, number] = [226, 232, 240];

  const addFooter = () => {
    const footerY = pageH - 24;
    doc.setDrawColor(...lightLine);
    doc.setLineWidth(0.5);
    doc.line(margin, footerY - 8, pageW - margin, footerY - 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...slate);
    doc.text(`Date of Issue: ${today}`, margin, footerY);
    doc.text(`Document ID: ${contractNumber}`, pageW - margin, footerY, { align: "right" });
  };

  const addPageWithFooter = () => {
    addFooter();
    doc.addPage();
    y = margin;
  };

  const sectionHeading = (title: string) => {
    doc.setDrawColor(...lightLine);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 11;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...slate);
    doc.text(title.toUpperCase(), margin, y);
    y += 18;
  };

  const fuelFillCount = (fuelLevel: string) => {
    const normalized = String(fuelLevel || "").trim().toLowerCase();
    if (normalized === "full") return 5;
    if (normalized === "3/4") return 3;
    if (normalized === "1/2" || normalized === "half") return 2;
    if (normalized === "1/4") return 1;
    return 0;
  };

  const drawFuelIndicator = (x: number, baseY: number, fuelLevel: string) => {
    const fillCount = fuelFillCount(fuelLevel);
    const square = 6;
    const gap = 2;
    const top = baseY + 3;
    for (let i = 0; i < 5; i++) {
      const squareX = x + i * (square + gap);
      doc.setDrawColor(...slate);
      doc.setLineWidth(0.6);
      if (i < fillCount) {
        doc.setFillColor(...navy);
        doc.rect(squareX, top, square, square, "F");
      } else {
        doc.rect(squareX, top, square, square);
      }
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...navy);
    doc.text(String(fuelLevel || "—"), x + 5 * square + 5 * gap + 4, baseY + 10);
  };

  // ── HEADER ─────────────────────────────────────────────────────────────────
  const headerTopY = y;
  const headerH = 76;
  doc.setFillColor(...navy);
  doc.rect(0, headerTopY - 8, pageW, headerH, "F");

  // Left: logo — resolve storage path to a signed URL before fetching
  let logoDrawn = false;
  if (logoUrl) {
    let fetchUrl = logoUrl;
    if (!logoUrl.startsWith("http")) {
      const { data: signed } = await supabase.storage
        .from("company-logos")
        .createSignedUrl(logoUrl, 60);
      if (signed?.signedUrl) fetchUrl = signed.signedUrl;
    }
    const img = await loadImage(fetchUrl);
    if (img) {
      const h = 34;
      const w = Math.min((img.w / img.h) * h, 34);
      try {
        doc.setFillColor(255, 255, 255);
        doc.circle(margin + 18, headerTopY + 24, 20, "F");
        doc.addImage(img.dataUrl, "PNG", margin + 18 - w / 2, headerTopY + 7, w, h);
        logoDrawn = true;
      } catch {
        try {
          doc.setFillColor(255, 255, 255);
          doc.circle(margin + 18, headerTopY + 24, 20, "F");
          doc.addImage(img.dataUrl, "JPEG", margin + 18 - w / 2, headerTopY + 7, w, h);
          logoDrawn = true;
        } catch { /* ignore */ }
      }
    }
  }
  if (!logoDrawn) {
    doc.setFillColor(255, 255, 255);
    doc.circle(margin + 18, headerTopY + 24, 20, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...navy);
    doc.text(companyName.charAt(0).toUpperCase(), margin + 18, headerTopY + 29, { align: "center" });
  }

  // Left: company name, phone, email
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(companyName, margin + 52, headerTopY + 18, { maxWidth: pageW / 2 - 80 });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  let contactY = headerTopY + 34;
  if (companyPhone) { doc.text(companyPhone, margin + 52, contactY); contactY += 11; }
  if (companyEmail) { doc.text(companyEmail, margin + 52, contactY); }

  // Right: large title + subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("CAR RENTAL AGREEMENT", pageW - margin, headerTopY + 24, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text("Signed by both parties \u2014 legally binding", pageW - margin, headerTopY + 41, { align: "right" });

  y = headerTopY + headerH + 18;

  // Document ID + Date of Issue row
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...slate);
  doc.text(`Document ID: ${contractNumber}`, margin, y);
  doc.text(`Date of Issue: ${today}`, pageW - margin, y, { align: "right" });
  y += 22;

  // ── SECTION HELPER ──────────────────────────────────────────────────────────
  const colW = (pageW - margin * 2 - 18) / 2;

  const section = (title: string, rows: [string, string, "fuel"?][]) => {
    const rowCount = Math.ceil(rows.length / 2);
    if (y + 32 + rowCount * 28 + 14 > pageH - margin - 160) {
      addPageWithFooter();
    }

    sectionHeading(title);

    // Two-column rows: small gray uppercase label, bold black value below
    for (let r = 0; r < rowCount; r++) {
      for (let col = 0; col < 2; col++) {
        const idx = r * 2 + col;
        if (idx >= rows.length) continue;
        const x = margin + col * colW;
        const [label, value, kind] = rows[idx];
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...slate);
        doc.setFontSize(8);
        doc.text(label.toUpperCase(), x, y);
        if (kind === "fuel") {
          drawFuelIndicator(x, y + 8, value);
        } else {
          doc.setFont(String(value).startsWith("AED ") ? "courier" : "helvetica", "bold");
          doc.setTextColor(...navy);
          doc.setFontSize(10);
        doc.text(String(value || "—"), x, y + 12, { maxWidth: colW - 16 });
      }
        }
      y += 34;
    }
    y += 24;
  };

  const valueOrDash = (value?: string | number | null) => {
    if (value === null || value === undefined || value === "") return "-";
    return String(value);
  };

  const detailGrid = (rows: [string, string, "fuel"?][], columns = 2) => {
    const width = columns === 2 ? colW : pageW - margin * 2;
    const gap = columns === 2 ? 18 : 0;
    const rowCount = Math.ceil(rows.length / columns);
    for (let r = 0; r < rowCount; r++) {
      for (let col = 0; col < columns; col++) {
        const idx = r * columns + col;
        if (idx >= rows.length) continue;
        const x = margin + col * (width + gap);
        const [label, value, kind] = rows[idx];
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...slate);
        doc.setFontSize(7.5);
        doc.text(label.toUpperCase(), x, y);
        if (kind === "fuel") {
          drawFuelIndicator(x, y + 8, value);
        } else {
          doc.setFont(String(value).startsWith("AED ") ? "courier" : "helvetica", "bold");
          doc.setTextColor(...navy);
          doc.setFontSize(9.5);
          doc.text(valueOrDash(value), x, y + 12, { maxWidth: width - 6 });
        }
      }
      y += 31;
    }
  };

  const boxedSection = (title: string, rows: [string, string, "fuel"?][], columns = 2) => {
    sectionHeading(title);
    detailGrid(rows, columns);
    y += 12;
  };

  // ── SECTIONS 1–3 ────────────────────────────────────────────────────────────
  const idLabel = c?.client_type === "Tourist" ? "Passport Number" : "Emirates ID";
  const idValue = c?.client_type === "Tourist"
    ? (c?.passport_number || "—")
    : (c?.emirates_id || "—");

  boxedSection("Client Details", [
    ["Full Name", c?.full_name || "—"],
    ["Phone", c?.phone || "—"],
    ["Nationality", c?.nationality || "—"],
    ["License Number", (c as any)?.license_number || "—"],
    [idLabel, idValue],
  ]);

  boxedSection("Vehicle Details", [
    ["Plate Number", car?.plate || "—"],
    ["Make & Model", car ? `${car.make} ${car.model}` : "—"],
    ["Year", car ? String(car.year) : "—"],
    ["Initial Mileage", `${contract.initial_mileage.toLocaleString()} km`],
  ]);

  boxedSection("Rental Period", [
    ["Start Date", fmtDate(contract.start_date)],
    ["End Date", fmtDate(contract.end_date)],
  ]);

  boxedSection("Financial Summary", [
    [`${contract.rate_type} Rate`, `AED ${Number(contract.rate_amount).toLocaleString()}`],
    ["Total Amount", `AED ${Number(contract.total_amount).toLocaleString()}`],
    ["Deposit", `AED ${Number(contract.deposit_amount).toLocaleString()}`],
  ]);

  boxedSection("Vehicle Condition at Pick-up", [
    ["Mileage", `${contract.initial_mileage.toLocaleString()} km`],
    ["Fuel Level", contract.fuel_level, "fuel"],
    ["Condition Notes", contract.special_conditions || "No visible damage recorded at pick-up"],
  ]);

  // ── SECTION 4: TERMS OF USE ─────────────────────────────────────────────────
  addPageWithFooter();
  sectionHeading("Terms of Use");

  const termsText = termsEn.trim() ||
    "The renter agrees to return the vehicle in the same condition as received.\n\nAny traffic fines, Salik charges, or damages incurred during the rental period are the responsibility of the renter.\n\nThe deposit will be refunded after inspection upon vehicle return.";

  // Split into bullet points by double-newline OR by numbered patterns like (1), (2), ...
  // Single \n inside a paragraph is NOT a bullet split — it is just soft-wrapping.
  const rawBullets = termsText
    .split(/\n{2,}/)                        // split on blank lines first
    .flatMap((chunk) =>
      chunk.split(/(?=\(\d+\))/)            // also split before "(1)", "(2)" etc.
    )
    .map((b) => b.replace(/\n/g, " ").trim()) // collapse single \n to space
    .filter(Boolean);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...navy);
  for (const bullet of rawBullets) {
    if (y > pageH - margin - 42) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...slate);
      doc.text("Additional terms continue in the company profile.", margin, pageH - margin - 22);
      break;
    }
    const numbered = bullet.match(/^(\(?\d+\)?[.)]?)\s*(.*)$/);
    const clauseNumber = numbered?.[1] || "-";
    const clauseText = numbered?.[2] || bullet;
    const split = doc.splitTextToSize(clauseText, pageW - margin * 2 - 26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...slate);
    doc.text(clauseNumber, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...navy);
    doc.text(split, margin + 22, y);
    y += split.length * 11 + 5;
  }
  y += 20;

  // ── SIGNATURES ──────────────────────────────────────────────────────────────
  addPageWithFooter();

  sectionHeading("Return Condition");
  detailGrid([
    ["Return Mileage", "To be recorded"],
    ["Return Fuel Level", "To be recorded"],
    ["New Damage", "To be inspected"],
    ["Deposit Review", "After return inspection"],
  ]);
  y += 12;

  boxedSection("Vehicle Inspection Photos", [
    ["Pick-up Photos", "Not attached yet"],
    ["Return Photos", "Not attached yet"],
    ["Inspection Report ID", "-"],
    ["QR / Link", "Coming soon"],
  ]);

  console.log("contract signatures:", !!contract.client_signature, !!contract.manager_signature);
  const sigBoxH = 60;
  const sigBoxW = (pageW - margin * 2 - 24) / 2;
  const summaryY = y + 8;
  const sigY = summaryY + 28;

  doc.setFont("courier", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...navy);
  doc.text(`Total Rental Amount: AED ${Number(contract.total_amount).toLocaleString()}`, margin, summaryY);
  doc.text(`Deposit Held: AED ${Number(contract.deposit_amount).toLocaleString()}`, pageW - margin, summaryY, { align: "right" });

  // Left box coords: x=margin, y=sigY, w=sigBoxW, h=sigBoxH
  // Right box coords: x=margin+sigBoxW+24, y=sigY, w=sigBoxW, h=sigBoxH
  doc.setDrawColor(160, 160, 160);
  doc.setLineWidth(0.8);
  doc.setLineDashPattern([5, 3], 0);
  doc.rect(margin, sigY, sigBoxW, sigBoxH);
  doc.rect(margin + sigBoxW + 24, sigY, sigBoxW, sigBoxH);
  doc.setLineDashPattern([], 0);
  doc.setLineWidth(0.5);

  // Left box — client signature
  if (contract.client_signature && contract.client_signature.startsWith("data:image")) {
    try {
      doc.addImage(contract.client_signature, "PNG", margin + 8, sigY + 8, sigBoxW - 16, sigBoxH - 16);
    } catch (e) { console.log("client sig error", e); }
  }

  // Right box — manager signature
  if (contract.manager_signature && contract.manager_signature.startsWith("data:image")) {
    try {
      doc.addImage(contract.manager_signature, "PNG", margin + sigBoxW + 24 + 8, sigY + 8, sigBoxW - 16, sigBoxH - 16);
    } catch (e) { console.log("manager sig error", e); }
  }

  const boxBottom = sigY + sigBoxH + 12;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(20, 20, 20);
  doc.text("CUSTOMER SIGNATURE", margin, boxBottom);
  doc.text("COMPANY REPRESENTATIVE", margin + sigBoxW + 24, boxBottom);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text(c?.full_name || "", margin, boxBottom + 14);
  doc.text(`Date: ${today}`, margin, boxBottom + 26);
  doc.text(companyName, margin + sigBoxW + 24, boxBottom + 14);
  doc.text(`Date: ${today}`, margin + sigBoxW + 24, boxBottom + 26);

  // ── FOOTER ──────────────────────────────────────────────────────────────────
  addFooter();

  const filename = `Contract_${contractNumber}_${(c?.full_name || "client").replace(/\s+/g, "_")}.pdf`;
  if (options?.returnBlob) {
    return doc.output("blob");
  } else {
    doc.save(filename);
  }
}
