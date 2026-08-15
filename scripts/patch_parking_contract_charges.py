from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing anchor: {label}")
    return text.replace(old, new, 1)


path = Path("src/pages/ContractDetail.tsx")
text = path.read_text()

if "interface ParkingRow {" not in text:
    text = replace_once(text, "interface PaymentRow {", """interface ParkingRow {
  id: string;
  parking_date: string;
  location: string;
  parking_zone?: string | null;
  amount: number;
  status: string;
  notes?: string | null;
  car_id: string | null;
  cars: { plate: string; make: string; model: string } | null;
}

interface PaymentRow {""", "ParkingRow")

    text = replace_once(text, """type ChargeImportEvidence = {
  finesLastImportAt: string | null;
  salikLastImportAt: string | null;
};""", """type ChargeImportEvidence = {
  finesLastImportAt: string | null;
  salikLastImportAt: string | null;
  parkingLastImportAt: string | null;
};""", "charge evidence")

    text = text.replace('type: "Rental" | "Salik" | "Payment" | "Fine" | "Deposit";', 'type: "Rental" | "Salik" | "Parking" | "Payment" | "Fine" | "Deposit";')

    text = replace_once(text, """  salik?: number;
  fees?: number;""", """  salik?: number;
  parking?: number;
  fees?: number;""", "saved allocations")
    text = replace_once(text, 'category: "rental" | "fines" | "salik" | "fees";', 'category: "rental" | "fines" | "salik" | "parking" | "fees";', "display category")
    text = replace_once(text, """    salik: Number(value.salik) || undefined,
    fees: Number(value.fees) || undefined,""", """    salik: Number(value.salik) || undefined,
    parking: Number(value.parking) || undefined,
    fees: Number(value.fees) || undefined,""", "saved allocation reader")
    text = replace_once(text, """  salik: "Salik",
};""", """  salik: "Salik",
  parking: "Parking",
};""", "allocation labels")
    text = text.replace('(["rental", "fees", "fines", "salik"] as const)', '(["rental", "fees", "fines", "salik", "parking"] as const)')

    text = replace_once(text, """    if (line.id.startsWith("salik-")) {""", """    if (line.id.startsWith("parking-")) {
      label = "Parking";
    }

    if (line.id.startsWith("salik-")) {""", "expanded payment parking label")

    text = replace_once(text, """  const [fines, setFines] = useState<FineRow[]>([]);
  const [salik, setSalik] = useState<SalikRow[]>([]);""", """  const [fines, setFines] = useState<FineRow[]>([]);
  const [salik, setSalik] = useState<SalikRow[]>([]);
  const [parking, setParking] = useState<ParkingRow[]>([]);""", "parking state")
    text = replace_once(text, """    finesLastImportAt: null,
    salikLastImportAt: null,
  });""", """    finesLastImportAt: null,
    salikLastImportAt: null,
    parkingLastImportAt: null,
  });""", "parking evidence state")

    text = replace_once(text, """        paymentsRes,
        finesRes,
        salikRes,
        latestFinesImportRes,
        latestSalikImportRes,
        documentsRes,""", """        paymentsRes,
        finesRes,
        salikRes,
        parkingRes,
        latestFinesImportRes,
        latestSalikImportRes,
        latestParkingImportRes,
        documentsRes,""", "fetch result tuple")

    text = replace_once(text, """        supabase
          .from("salik")
          .select("id, charge_date, trip_time, transaction_id, toll_gate, direction, trips, amount, status, car_id, cars(plate, make, model)")
          .eq("contract_id", c.id)
          .order("charge_date", { ascending: false }),
        supabase
          .from("fines")""", """        supabase
          .from("salik")
          .select("id, charge_date, trip_time, transaction_id, toll_gate, direction, trips, amount, status, car_id, cars(plate, make, model)")
          .eq("contract_id", c.id)
          .order("charge_date", { ascending: false }),
        (supabase as any)
          .from("parking_charges")
          .select("id, parking_date, location, parking_zone, amount, status, notes, car_id, cars(plate, make, model)")
          .eq("contract_id", c.id)
          .order("parking_date", { ascending: false }),
        supabase
          .from("fines")""", "parking query")

    text = replace_once(text, """        supabase
          .from("salik")
          .select("created_at")
          .eq("owner_id", c.owner_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from("contract_documents")""", """        supabase
          .from("salik")
          .select("created_at")
          .eq("owner_id", c.owner_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from("parking_charges")
          .select("created_at")
          .eq("owner_id", c.owner_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        (supabase as any)
          .from("contract_documents")""", "parking import evidence query")

    text = replace_once(text, """      if (!salikRes.error) setSalik(salikRes.data || []);
      if (documentsRes.error)""", """      if (!salikRes.error) setSalik(salikRes.data || []);
      if (!parkingRes.error) setParking((parkingRes.data || []) as ParkingRow[]);
      if (documentsRes.error)""", "set parking")

    text = replace_once(text, """        salikLastImportAt:
          !latestSalikImportRes.error && latestSalikImportRes.data
            ? (latestSalikImportRes.data as { created_at: string }).created_at
            : null,
      });""", """        salikLastImportAt:
          !latestSalikImportRes.error && latestSalikImportRes.data
            ? (latestSalikImportRes.data as { created_at: string }).created_at
            : null,
        parkingLastImportAt:
          !latestParkingImportRes.error && latestParkingImportRes.data
            ? (latestParkingImportRes.data as { created_at: string }).created_at
            : null,
      });""", "set parking import evidence")
    text = replace_once(text, "setChargeImportEvidence({ finesLastImportAt: null, salikLastImportAt: null });", "setParking([]);\n      setChargeImportEvidence({ finesLastImportAt: null, salikLastImportAt: null, parkingLastImportAt: null });", "clear parking")

    # Financial panel receives Parking.
    text = replace_once(text, """  salik: SalikRow[];
  chargeImportEvidence: ChargeImportEvidence;""", """  salik: SalikRow[];
  parking: ParkingRow[];
  chargeImportEvidence: ChargeImportEvidence;""", "financial props")
    text = replace_once(text, """  fines,
  salik,
  chargeImportEvidence,""", """  fines,
  salik,
  parking,
  chargeImportEvidence,""", "financial args")
    text = replace_once(text, """              fines={fines}
              salik={salik}
              chargeImportEvidence={chargeImportEvidence}""", """              fines={fines}
              salik={salik}
              parking={parking}
              chargeImportEvidence={chargeImportEvidence}""", "financial prop call")

    # Payment allocation line lookup.
    text = replace_once(text, """    salik.forEach((charge) => {
      lookup.set(`salik-${charge.id}`, {
        category: "salik",
        label: charge.transaction_id ? `Salik ${charge.transaction_id}` : charge.toll_gate ? `Salik ${charge.toll_gate}` : "Salik",
      });
    });

    return lookup;
  }, [contract.id, contractFees, fines, rentalExtensionCharges, rentalExtensions, salik]);""", """    salik.forEach((charge) => {
      lookup.set(`salik-${charge.id}`, {
        category: "salik",
        label: charge.transaction_id ? `Salik ${charge.transaction_id}` : charge.toll_gate ? `Salik ${charge.toll_gate}` : "Salik",
      });
    });
    parking.forEach((charge) => {
      lookup.set(`parking-${charge.id}`, {
        category: "parking",
        label: charge.location ? `Parking ${charge.location}` : "Parking",
      });
    });

    return lookup;
  }, [contract.id, contractFees, fines, parking, rentalExtensionCharges, rentalExtensions, salik]);""", "parking allocation lookup")

    # Parking open item and verification.
    text = replace_once(text, """  const salikVerificationLabel = getChargeVerificationLabel(salik.length, chargeImportEvidence.salikLastImportAt);""", """  const salikVerificationLabel = getChargeVerificationLabel(salik.length, chargeImportEvidence.salikLastImportAt);
  const parkingVerificationLabel = getChargeVerificationLabel(parking.length, chargeImportEvidence.parkingLastImportAt);""", "parking verification")
    text = replace_once(text, """      if (line.category === "fines") {""", """      if (line.category === "parking") {
        groups.set("parking", {
          id: "parking",
          title: "Parking",
          detail: `${parking.filter((charge) => charge.status.toLowerCase() !== "paid").length} charges`,
          meta: parkingVerificationLabel,
          due: nextDue,
          icon: CarFront,
          iconTone: "violet",
        });
      }

      if (line.category === "fines") {""", "parking open item")
    text = replace_once(text, """    otherFees,
    rentalExtensions,
    salik,
    salikVerificationLabel,""", """    otherFees,
    parking,
    parkingVerificationLabel,
    rentalExtensions,
    salik,
    salikVerificationLabel,""", "open item deps")

    # Transaction History > Charges row.
    text = replace_once(text, """    const finesTotal = fines.reduce((sum, fine) => sum + Number(fine.amount), 0);
    const salikTotal = salik.reduce((sum, charge) => sum + Number(charge.amount), 0);""", """    const latestParkingDate = parking.reduce((latest, charge) => {
      const currentTime = new Date(charge.parking_date).getTime() || 0;
      const latestTime = latest ? new Date(latest).getTime() || 0 : 0;
      return currentTime > latestTime ? charge.parking_date : latest;
    }, parking[0]?.parking_date ?? contract.start_date) || contract.start_date;
    const finesTotal = fines.reduce((sum, fine) => sum + Number(fine.amount), 0);
    const salikTotal = salik.reduce((sum, charge) => sum + Number(charge.amount), 0);
    const parkingTotal = parking.reduce((sum, charge) => sum + Number(charge.amount), 0);""", "parking totals")
    text = replace_once(text, """      ...(salik.length > 0 ? [{
        id: "salik-summary",
        date: latestSalikDate,
        group: "charges" as const,
        type: "Salik",
        description: "Salik Charges",
        details: `${salikTripCount} ${salikTripCount === 1 ? "trip" : "trips"}`,
        amount: salikTotal,
        amountTone: "debit" as const,
        reference: contractNumberLabel(contract.id),
        icon: Route,
        iconTone: "green" as const,
      }] : []),""", """      ...(salik.length > 0 ? [{
        id: "salik-summary",
        date: latestSalikDate,
        group: "charges" as const,
        type: "Salik",
        description: "Salik Charges",
        details: `${salikTripCount} ${salikTripCount === 1 ? "trip" : "trips"}`,
        amount: salikTotal,
        amountTone: "debit" as const,
        reference: contractNumberLabel(contract.id),
        icon: Route,
        iconTone: "green" as const,
      }] : []),
      ...(parking.length > 0 ? [{
        id: "parking-summary",
        date: latestParkingDate,
        group: "charges" as const,
        type: "Parking",
        description: "Parking",
        details: `${parking.length} ${parking.length === 1 ? "charge" : "charges"}`,
        amount: parkingTotal,
        amountTone: "debit" as const,
        reference: contractNumberLabel(contract.id),
        icon: CarFront,
        iconTone: "violet" as const,
      }] : []),""", "parking transaction")
    text = replace_once(text, """    payments,
    rentalExtensionCharges,
    rentalExtensions,
    salik,
  ]);""", """    payments,
    parking,
    rentalExtensionCharges,
    rentalExtensions,
    salik,
  ]);""", "transaction deps")
    text = replace_once(text, 'if (transaction.type === "Salik") return "bg-emerald-950 text-emerald-300";', 'if (transaction.type === "Salik") return "bg-emerald-950 text-emerald-300";\n    if (transaction.type === "Parking") return "bg-violet-950 text-violet-300";', "parking icon")

    # Ledger makes Parking part of contract balance.
    text = replace_once(text, """    salik.forEach((s) =>
      entries.push({
        id: `salik-${s.id}`,
        date: s.charge_date,
        type: "Salik",
        description: `${s.trips} toll trips`,
        debit: Number(s.amount),
        credit: 0,
        status: s.status,
      }),
    );""", """    salik.forEach((s) =>
      entries.push({
        id: `salik-${s.id}`,
        date: s.charge_date,
        type: "Salik",
        description: `${s.trips} toll trips`,
        debit: Number(s.amount),
        credit: 0,
        status: s.status,
      }),
    );
    parking.forEach((charge) =>
      entries.push({
        id: `parking-${charge.id}`,
        date: charge.parking_date,
        type: "Parking",
        description: charge.location ? `Parking · ${charge.location}` : "Parking",
        debit: Number(charge.amount),
        credit: 0,
        status: charge.status,
      }),
    );""", "parking ledger")
    text = replace_once(text, "}, [contract, fines, salik, payments, days]);", "}, [contract, fines, salik, parking, payments, days]);", "ledger deps")

    # Payment allocations include linked Parking lines.
    text = replace_once(text, """    ...salik.map((charge) => ({
        id: `salik-${charge.id}`,
        category: "salik" as const,
        label: charge.transaction_id ? `Salik ${charge.transaction_id}` : charge.toll_gate ? `Salik ${charge.toll_gate}` : "Salik",
        due: Number(charge.amount),
        overdueImmediately: true,
      })),
  ];""", """    ...salik.map((charge) => ({
        id: `salik-${charge.id}`,
        category: "salik" as const,
        label: charge.transaction_id ? `Salik ${charge.transaction_id}` : charge.toll_gate ? `Salik ${charge.toll_gate}` : "Salik",
        due: Number(charge.amount),
        overdueImmediately: true,
      })),
    ...parking.map((charge) => ({
        id: `parking-${charge.id}`,
        category: "parking" as const,
        label: charge.location ? `Parking ${charge.location}` : "Parking",
        due: Number(charge.amount),
        overdueImmediately: true,
      })),
  ];""", "parking gross lines")
    text = text.replace('Record<"rental" | "fines" | "salik" | "fees", number>', 'Record<"rental" | "fines" | "salik" | "parking" | "fees", number>')
    text = text.replace("salik: 0,\n      fees: 0,", "salik: 0,\n      parking: 0,\n      fees: 0,")
    text = text.replace("salik: 0,\n        fees: 0,", "salik: 0,\n        parking: 0,\n        fees: 0,")

    path.write_text(text)

modal_path = Path("src/components/RecordPaymentModal.tsx")
modal = modal_path.read_text()
if 'type AllocationCategory = "rental" | "fines" | "salik" | "parking" | "fees";' not in modal:
    modal = modal.replace('type: "Rental" | "Salik" | "Payment" | "Fine" | "Deposit";', 'type: "Rental" | "Salik" | "Parking" | "Payment" | "Fine" | "Deposit";')
    modal = modal.replace('type AllocationCategory = "rental" | "fines" | "salik" | "fees";', 'type AllocationCategory = "rental" | "fines" | "salik" | "parking" | "fees";')
    modal = modal.replace("""    salik: number;
    fees: number;""", """    salik: number;
    parking: number;
    fees: number;""")
    modal = modal.replace("""      salik: unpaidEntries
        .filter((entry) => entry.type === "Salik")
        .reduce((sum, entry) => sum + Number(entry.amount), 0),
      fees: 0,""", """      salik: unpaidEntries
        .filter((entry) => entry.type === "Salik")
        .reduce((sum, entry) => sum + Number(entry.amount), 0),
      parking: unpaidEntries
        .filter((entry) => entry.type === "Parking")
        .reduce((sum, entry) => sum + Number(entry.amount), 0),
      fees: 0,""")
    modal = modal.replace('{ id: "salik", category: "salik", label: "Salik", due: Number(dues.salik) },', '{ id: "salik", category: "salik", label: "Salik", due: Number(dues.salik) },\n      { id: "parking", category: "parking", label: "Parking", due: Number(dues.parking) },')
    modal = modal.replace("salik: 0,\n        fees: 0,", "salik: 0,\n        parking: 0,\n        fees: 0,")
    modal_path.write_text(modal)

print("Parking contract charge patch applied")
