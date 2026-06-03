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
  if (!iso) return "-";
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
  const margin = 34;
  const contentW = pageW - margin * 2;
  let y = margin;

  const contractNumber = `CTR-${contract.id.slice(0, 8).toUpperCase()}`;
  const today = fmtDate(new Date().toISOString());
  const c = contract.clients;
  const car = contract.cars;

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
  const money = (value: number) => `AED ${Number(value || 0).toLocaleString()}`;
  const km = (value: number) => `${Number(value || 0).toLocaleString()} km`;
  const idLabel = c?.client_type === "Tourist" ? "Passport Number" : "Emirates ID";
  const idValue = c?.client_type === "Tourist" ? valueOrDash(c?.passport_number) : valueOrDash(c?.emirates_id);

  let logoImage: { dataUrl: string; w: number; h: number } | null = null;
  if (logoUrl) {
    let fetchUrl = logoUrl;
    if (!logoUrl.startsWith("http")) {
      const { data: signed } = await supabase.storage.from("company-logos").createSignedUrl(logoUrl, 60);
      if (signed?.signedUrl) fetchUrl = signed.signedUrl;
    }
    logoImage = await loadImage(fetchUrl);
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

  const footer = (pageNo: number) => {
    const footerY = pageH - 42;
    doc.setDrawColor(...blue);
    doc.setLineWidth(1);
    doc.line(margin, footerY, pageW - margin, footerY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(`Document ID: ${contractNumber}   |   Date of Issue: ${today}`, margin, footerY + 17);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...blue);
    doc.text("PDF Layout v2", pageW / 2, footerY + 17, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...muted);
    doc.text(`Page ${pageNo} of 3`, pageW - margin, footerY + 17, { align: "right" });
  };

  const startPage = (pageNo: number) => {
    if (pageNo > 1) doc.addPage();
    pageFrame();
    y = pageNo === 1 ? margin : margin + 20;
  };

  const sectionTitle = (num: number, title: string, suffix = "") => {
    const label = `${num}.  ${title.toUpperCase()}`;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...blue);
    doc.text(label, margin, y);
    if (suffix) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...muted);
      doc.text(suffix.toUpperCase(), margin + doc.getTextWidth(label) + 8, y);
    }
    y += 17;
  };

  const iconBadge = (x: number, rowY: number, text: string) => {
    doc.setFillColor(...blueSoft);
    doc.setDrawColor(205, 224, 245);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, rowY, 22, 22, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...blue);
    doc.text(text, x + 11, rowY + 14, { align: "center" });
  };

  const fieldCard = (x: number, rowY: number, w: number, label: string, value: string, icon: string) => {
    doc.setFillColor(255, 255, 255);
    setStroke(line, 0.6);
    doc.roundedRect(x, rowY, w, 42, 4, 4, "FD");
    iconBadge(x + 8, rowY + 10, icon);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(label, x + 38, rowY + 15);
    doc.setFont(String(value).startsWith("AED ") || /\d/.test(value) ? "courier" : "helvetica", "bold");
    doc.setFontSize(8.7);
    doc.setTextColor(...ink);
    doc.text(valueOrDash(value), x + 38, rowY + 28, { maxWidth: w - 46 });
  };

  const listCard = (x: number, rowY: number, w: number, rows: [string, string, string][]) => {
    const h = rows.length * 43 + 8;
    doc.setFillColor(255, 255, 255);
    setStroke(line, 0.7);
    doc.roundedRect(x, rowY, w, h, 4, 4, "FD");
    rows.forEach(([label, value, icon], index) => {
      const itemY = rowY + 8 + index * 43;
      iconBadge(x + 9, itemY + 7, icon);
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

  const statTile = (x: number, rowY: number, w: number, label: string, value: string, icon: string) => {
    doc.setFillColor(255, 255, 255);
    setStroke(line, 0.6);
    doc.roundedRect(x, rowY, w, 64, 3, 3, "FD");
    iconBadge(x + w / 2 - 11, rowY + 8, icon);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.4);
    doc.setTextColor(...muted);
    doc.text(label, x + w / 2, rowY + 39, { align: "center", maxWidth: w - 8 });
    doc.setFont(value.startsWith("AED") || /\d/.test(value) ? "courier" : "helvetica", "bold");
    doc.setFontSize(8.2);
    doc.setTextColor(...ink);
    doc.text(value, x + w / 2, rowY + 55, { align: "center", maxWidth: w - 8 });
  };

  const fuelGauge = (x: number, rowY: number, level: string) => {
    const normalized = String(level || "").toLowerCase();
    const ratio = normalized === "full" ? 1 : normalized === "3/4" ? 0.75 : normalized === "half" || normalized === "1/2" ? 0.5 : normalized === "1/4" ? 0.25 : 0;
    doc.setFillColor(236, 242, 248);
    doc.roundedRect(x, rowY, 48, 7, 3, 3, "F");
    doc.setFillColor(...blue);
    doc.roundedRect(x, rowY, 48 * ratio, 7, 3, 3, "F");
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
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...ink);
    doc.text(companyName, logoX + 42, logoY + 12, { maxWidth: 210 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...blue);
    doc.text("Car Rental", logoX + 42, logoY + 27);
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
    doc.text("Signed by both parties - legally binding", margin, y);
    y += 24;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`Document ID: ${contractNumber}    |    Date of Issue: ${today}`, margin, y);
    y += 34;
  };

  const drawTerms = () => {
    const termsText = termsEn.trim() ||
      "The renter agrees to return the vehicle in the same condition as received.\n\nAny traffic fines, Salik charges, or damages incurred during the rental period are the responsibility of the renter.\n\nThe deposit will be refunded after inspection upon vehicle return.";
    const rawBullets = termsText
      .split(/\n{2,}/)
      .flatMap((chunk) => chunk.split(/(?=\(\d+\))/))
      .map((b) => b.replace(/\n/g, " ").trim())
      .filter(Boolean);
    let clipped = false;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.3);
    doc.setTextColor(...ink);
    rawBullets.forEach((bullet, index) => {
      if (y > pageH - 72) {
        clipped = true;
        return;
      }
      const numbered = bullet.match(/^(\(?\d+\)?[.)]?)\s*(.*)$/);
      const clauseText = numbered?.[2] || bullet;
      const split = doc.splitTextToSize(clauseText, contentW - 50);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...ink);
      doc.text(`${index + 1}.`, margin, y);
      doc.setFont("helvetica", "normal");
      doc.text(split, margin + 28, y);
      y += split.length * 11.5 + 11;
    });
    if (clipped) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(7.5);
      doc.setTextColor(...muted);
      doc.text("Additional terms continue in the company profile.", margin, pageH - 66);
    }
  };

  startPage(1);
  drawHeader();

  const twoColGap = 22;
  const colW = (contentW - twoColGap) / 2;
  const topY = y;
  sectionTitle(1, "Client Details");
  const clientY = y;
  const clientH = listCard(margin, clientY, colW, [
    ["Full Name", valueOrDash(c?.full_name), "CL"],
    ["Phone", valueOrDash(c?.phone), "PH"],
    ["Nationality", valueOrDash(c?.nationality), "NA"],
    ["License Number", valueOrDash((c as any)?.license_number), "DL"],
    [idLabel, idValue, "ID"],
  ]);

  y = topY;
  const vehicleX = margin + colW + twoColGap;
  sectionTitle(2, "Vehicle Details");
  listCard(vehicleX, y, colW, [
    ["Plate Number", valueOrDash(car?.plate), "PL"],
    ["Make & Model", car ? `${car.make} ${car.model}` : "-", "VM"],
    ["Year", car ? String(car.year) : "-", "YR"],
    ["Initial Mileage", km(contract.initial_mileage), "KM"],
  ]);

  y = clientY + clientH + 34;
  sectionTitle(3, "Rental Period");
  const periodY = y;
  fieldCard(margin, periodY, 160, "Start Date", fmtDate(contract.start_date), "ST");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...blue);
  doc.text("->", margin + 180, periodY + 26);
  fieldCard(margin + 210, periodY, 160, "End Date", fmtDate(contract.end_date), "EN");
  fieldCard(margin + 390, periodY, contentW - 390, "Rate Type", contract.rate_type, "RT");
  y = periodY + 68;

  sectionTitle(4, "Financial Summary");
  const tileW = contentW / 5;
  const financeY = y;
  doc.setFillColor(...panel);
  setStroke(line, 0.7);
  doc.roundedRect(margin, financeY, contentW, 78, 4, 4, "FD");
  statTile(margin, financeY, tileW, `${contract.rate_type} Rate`, money(contract.rate_amount), "RA");
  statTile(margin + tileW, financeY, tileW, "Total Rental Amount", money(contract.total_amount), "TR");
  statTile(margin + tileW * 2, financeY, tileW, "Deposit Held", money(contract.deposit_amount), "DP");
  statTile(margin + tileW * 3, financeY, tileW, "Mileage", km(contract.initial_mileage), "KM");
  statTile(margin + tileW * 4, financeY, tileW, "Traffic Charges", "Per contract", "TC");
  y = financeY + 105;

  sectionTitle(5, "Vehicle Condition at Pick-up");
  const condY = y;
  const condW = contentW / 4;
  fieldCard(margin, condY, condW, "Fuel Level", valueOrDash(contract.fuel_level), "FL");
  fuelGauge(margin + 74, condY + 26, contract.fuel_level);
  fieldCard(margin + condW, condY, condW, "Mileage", km(contract.initial_mileage), "KM");
  fieldCard(margin + condW * 2, condY, condW, "Exterior Condition", contract.special_conditions || "Good", "EX");
  fieldCard(margin + condW * 3, condY, condW, "Interior Condition", "Good", "IN");
  y = condY + 64;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("Customer Initials: ____________________", margin, y + 22);
  footer(1);

  startPage(2);
  sectionTitle(6, "Terms of Use");
  y += 6;
  drawTerms();
  footer(2);

  startPage(3);
  sectionTitle(7, "Return Condition", "(to be filled at return)");
  const returnY = y;
  const returnW = contentW - 160;
  doc.setFillColor(255, 255, 255);
  setStroke(line, 0.7);
  doc.roundedRect(margin, returnY, returnW, 155, 4, 4, "FD");
  [
    ["Fuel Level", "FL"],
    ["Mileage", "KM"],
    ["Exterior Condition", "EX"],
    ["Interior Condition", "IN"],
    ["Notes / Damage", "NO"],
  ].forEach(([label, icon], index) => {
    const rowY = returnY + 18 + index * 27;
    iconBadge(margin + 12, rowY - 9, icon);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...ink);
    doc.text(label, margin + 45, rowY + 4);
    setStroke(line, 0.6);
    doc.line(margin + 185, rowY + 4, margin + returnW - 18, rowY + 4);
  });

  const photoX = margin + returnW + 14;
  doc.setFillColor(...panel);
  setStroke(line, 0.7);
  doc.roundedRect(photoX, returnY, 146, 155, 4, 4, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...blue);
  doc.text("Inspection Photos", photoX + 73, returnY + 34, { align: "center" });
  iconBadge(photoX + 62, returnY + 56, "PH");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...ink);
  doc.text("Pick-up Photos: Not attached yet", photoX + 73, returnY + 92, { align: "center", maxWidth: 120 });
  doc.text("Return Photos: Not attached yet", photoX + 73, returnY + 111, { align: "center", maxWidth: 120 });
  doc.text("Inspection Report ID: -", photoX + 73, returnY + 130, { align: "center", maxWidth: 120 });
  doc.text("QR / Link: Coming soon", photoX + 73, returnY + 147, { align: "center", maxWidth: 120 });
  y = returnY + 190;

  sectionTitle(8, "Agreement & Signatures");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...ink);
  doc.text("By signing below, both parties confirm that they have read, understood, and agreed to all terms and conditions stated in this Car Rental Agreement.", margin, y, { maxWidth: contentW });
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
    doc.text(valueOrDash(signer), x + sigW / 2, sigY + 92, { align: "center", maxWidth: sigW - 36 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Date: ${today}`, x + sigW / 2, sigY + 108, { align: "center" });
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
  footer(3);

  const filename = `Contract_${contractNumber}_${(c?.full_name || "client").replace(/\s+/g, "_")}.pdf`;
  if (options?.returnBlob) {
    return doc.output("blob");
  } else {
    doc.save(filename);
  }
}
