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

  // ── HEADER ─────────────────────────────────────────────────────────────────
  const headerTopY = y;

  // Left: logo — resolve storage path to a signed URL before fetching
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
      const h = 40;
      const w = (img.w / img.h) * h;
      try {
        doc.addImage(img.dataUrl, "PNG", margin, y, w, h);
      } catch {
        try { doc.addImage(img.dataUrl, "JPEG", margin, y, w, h); } catch { /* ignore */ }
      }
      y += h + 8;
    }
  }

  // Left: company name, phone, email
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text(companyName, margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  if (companyPhone) { doc.text(companyPhone, margin, y); y += 12; }
  if (companyEmail) { doc.text(companyEmail, margin, y); y += 12; }

  // Right: large title + subtitle
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(41, 98, 255);
  doc.text("CAR RENTAL AGREEMENT", pageW - margin, headerTopY + 22, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text("Electronic Copy \u2022 Digital Format", pageW - margin, headerTopY + 38, { align: "right" });

  y = Math.max(y, headerTopY + 90);

  // Thick blue horizontal line
  doc.setDrawColor(41, 98, 255);
  doc.setLineWidth(2.5);
  doc.line(margin, y, pageW - margin, y);
  doc.setLineWidth(0.5);
  y += 20;

  // Document ID + Date of Issue row
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(`Document ID: ${contractNumber}`, margin, y);
  doc.text(`Date of Issue: ${today}`, pageW - margin, y, { align: "right" });
  y += 22;

  // ── SECTION HELPER ──────────────────────────────────────────────────────────
  let sectionNum = 0;
  const colW = (pageW - margin * 2) / 2;

  const section = (title: string, rows: [string, string][]) => {
    sectionNum++;
    const rowCount = Math.ceil(rows.length / 2);
    if (y + 32 + rowCount * 28 + 14 > pageH - margin - 160) {
      doc.addPage();
      y = margin;
    }

    // Numbered blue uppercase title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(41, 98, 255);
    doc.text(`${sectionNum}. ${title.toUpperCase()}`, margin, y);
    y += 8;

    // Thin gray separator
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 20;

    // Two-column rows: small gray uppercase label, bold black value below
    for (let r = 0; r < rowCount; r++) {
      for (let col = 0; col < 2; col++) {
        const idx = r * 2 + col;
        if (idx >= rows.length) continue;
        const x = margin + col * colW;
        const [label, value] = rows[idx];
        doc.setFont("helvetica", "normal");
        doc.setTextColor(140, 140, 140);
        doc.setFontSize(8);
        doc.text(label.toUpperCase(), x, y);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(20, 20, 20);
        doc.setFontSize(10);
        doc.text(String(value || "—"), x, y + 12, { maxWidth: colW - 16 });
      }
      y += 34;
    }
    y += 24;
  };

  // ── SECTIONS 1–3 ────────────────────────────────────────────────────────────
  const idLabel = c?.client_type === "Tourist" ? "Passport Number" : "Emirates ID";
  const idValue = c?.client_type === "Tourist"
    ? (c?.passport_number || "—")
    : (c?.emirates_id || "—");

  section("Client Details", [
    ["Full Name", c?.full_name || "—"],
    ["Phone", c?.phone || "—"],
    ["Nationality", c?.nationality || "—"],
    [idLabel, idValue],
  ]);

  section("Vehicle Details", [
    ["Plate Number", car?.plate || "—"],
    ["Make & Model", car ? `${car.make} ${car.model}` : "—"],
    ["Year", car ? String(car.year) : "—"],
    ["Initial Mileage", `${contract.initial_mileage.toLocaleString()} km`],
  ]);

  section("Contract Terms", [
    ["Start Date", fmtDate(contract.start_date)],
    ["End Date", fmtDate(contract.end_date)],
    [`${contract.rate_type} Rate`, `AED ${Number(contract.rate_amount).toLocaleString()}`],
    ["Total Amount", `AED ${Number(contract.total_amount).toLocaleString()}`],
    ["Deposit", `AED ${Number(contract.deposit_amount).toLocaleString()}`],
    ["Fuel Level", contract.fuel_level],
  ]);

  // ── SECTION 4: TERMS OF USE ─────────────────────────────────────────────────
  sectionNum++;
  if (y + 60 > pageH - margin - 160) { doc.addPage(); y = margin; }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(41, 98, 255);
  doc.text(`${sectionNum}. TERMS OF USE`, margin, y);
  y += 8;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageW - margin, y);
  y += 14;

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
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  for (const bullet of rawBullets) {
    if (y > pageH - margin - 160) { doc.addPage(); y = margin; }
    const split = doc.splitTextToSize(`\u2022 ${bullet}`, pageW - margin * 2 - 8);
    doc.text(split, margin, y);
    y += split.length * 13 + 6;
  }
  y += 20;

  // ── SIGNATURES ──────────────────────────────────────────────────────────────
  console.log("contract signatures:", !!contract.client_signature, !!contract.manager_signature);
  const sigBoxH = 60;
  const sigBoxW = (pageW - margin * 2 - 24) / 2;
  let sigY = y + 10;
  if (sigY + sigBoxH + 70 > pageH - 36) {
    doc.addPage();
    sigY = margin;
  }

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
  const footerY = pageH - 24;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.line(margin, footerY - 8, pageW - margin, footerY - 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(160, 160, 160);
  doc.text(`Date of Issue: ${today}`, margin, footerY);
  doc.text(`Document ID: ${contractNumber}`, pageW - margin, footerY, { align: "right" });

  const filename = `Contract_${contractNumber}_${(c?.full_name || "client").replace(/\s+/g, "_")}.pdf`;
  if (options?.returnBlob) {
    return doc.output("blob");
  } else {
    doc.save(filename);
  }
}
