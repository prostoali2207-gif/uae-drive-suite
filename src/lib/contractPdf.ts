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

export async function generateContractPdf(contract: ContractPdfData) {
  // Fetch company profile (logo + name)
  const { data: { user } } = await supabase.auth.getUser();
  let companyName = "Rental Company";
  let logoUrl: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_name, logo_url")
      .eq("id", user.id)
      .single();
    if (profile) {
      companyName = profile.company_name || companyName;
      logoUrl = profile.logo_url;
    }
  }

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;

  // Header: logo + company name
  if (logoUrl) {
    const img = await loadImage(logoUrl);
    if (img) {
      const h = 48;
      const w = (img.w / img.h) * h;
      try {
        doc.addImage(img.dataUrl, "PNG", margin, y, w, h);
      } catch {
        try { doc.addImage(img.dataUrl, "JPEG", margin, y, w, h); } catch { /* ignore */ }
      }
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20, 20, 20);
  doc.text(companyName, pageW - margin, y + 18, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text("Vehicle Rental Agreement", pageW - margin, y + 36, { align: "right" });

  y += 70;
  doc.setDrawColor(220);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  // Contract title + number
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 20, 20);
  doc.text("Rental Contract", margin, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110, 110, 110);
  const contractNumber = `#${contract.id.slice(0, 8).toUpperCase()}`;
  doc.text(`Contract ${contractNumber}`, pageW - margin, y, { align: "right" });
  y += 22;

  // Helper: section
  const section = (title: string, rows: [string, string][]) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(title, margin, y);
    y += 6;
    doc.setDrawColor(235);
    doc.line(margin, y, pageW - margin, y);
    y += 12;

    const colW = (pageW - margin * 2) / 2;
    doc.setFontSize(10);
    rows.forEach(([label, value], i) => {
      const col = i % 2;
      const x = margin + col * colW;
      if (col === 0 && i > 0) y += 22;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(130, 130, 130);
      doc.text(label, x, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(String(value || "—"), x, y + 12, { maxWidth: colW - 12 });
    });
    y += 28;
  };

  const c = contract.clients;
  const car = contract.cars;
  const idLine = c?.client_type === "Tourist"
    ? `Passport: ${c?.passport_number || "—"}`
    : `Emirates ID: ${c?.emirates_id || "—"}`;

  section("Client Details", [
    ["Full Name", c?.full_name || "—"],
    ["Phone", c?.phone || "—"],
    ["Nationality", c?.nationality || "—"],
    ["ID / Passport", idLine.replace(/^[^:]+:\s*/, "")],
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

  // Special conditions
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  doc.text("Special Conditions", margin, y);
  y += 6;
  doc.setDrawColor(235);
  doc.line(margin, y, pageW - margin, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  const conditions = contract.special_conditions?.trim() ||
    "The renter agrees to return the vehicle in the same condition as received. Any traffic fines, Salik charges, or damages incurred during the rental period are the responsibility of the renter. The deposit will be refunded after inspection upon vehicle return.";
  const split = doc.splitTextToSize(conditions, pageW - margin * 2);
  doc.text(split, margin, y);
  y += split.length * 12 + 30;

  // Signatures
  const sigY = Math.max(y, pageH - margin - 90);
  const colW = (pageW - margin * 2 - 40) / 2;

  doc.setDrawColor(60);
  doc.line(margin, sigY + 40, margin + colW, sigY + 40);
  doc.line(pageW - margin - colW, sigY + 40, pageW - margin, sigY + 40);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text("Company Representative", margin, sigY + 54);
  doc.text("Client Signature", pageW - margin - colW, sigY + 54);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text(companyName, margin, sigY + 68);
  doc.text(c?.full_name || "", pageW - margin - colW, sigY + 68);
  doc.text(`Date: ${fmtDate(new Date().toISOString())}`, margin, sigY + 82);
  doc.text(`Date: ${fmtDate(new Date().toISOString())}`, pageW - margin - colW, sigY + 82);

  const filename = `Contract_${contractNumber.replace("#", "")}_${(c?.full_name || "client").replace(/\s+/g, "_")}.pdf`;
  doc.save(filename);
}
