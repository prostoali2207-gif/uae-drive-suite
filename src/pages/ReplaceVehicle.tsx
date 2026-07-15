import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ReplaceVehicleModal } from "@/components/ReplaceVehicleModal";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

interface ReplacementContractSummary {
  id: string;
  car_id: string;
  start_date: string;
  start_time: string | null;
  end_date: string;
  end_time: string | null;
  clients: {
    full_name: string | null;
  } | null;
  cars: {
    plate: string | null;
    make: string | null;
    model: string | null;
    year: number | null;
  } | null;
}

function formatDateTime(date?: string | null, time?: string | null) {
  if (!date) return "-";
  return `${date}${time ? ` ${time}` : ""}`;
}

function formatVehicle(car: ReplacementContractSummary["cars"]) {
  if (!car) return "Vehicle not found";
  return [car.plate, [car.make, car.model].filter(Boolean).join(" "), car.year ? `(${car.year})` : ""]
    .filter(Boolean)
    .join(" ");
}

const ReplaceVehicle = () => {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  const [contract, setContract] = useState<ReplacementContractSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadContract = async () => {
      if (!contractId) {
        setError("Missing contract ID.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      const { data, error: fetchError } = await supabase
        .from("contracts")
        .select("id, car_id, start_date, start_time, end_date, end_time, clients(full_name), cars(plate, make, model, year)")
        .eq("id", contractId)
        .maybeSingle();

      if (cancelled) return;
      if (fetchError) {
        setError(fetchError.message);
        setContract(null);
      } else {
        setContract(data as ReplacementContractSummary | null);
      }
      setLoading(false);
    };

    loadContract();

    return () => {
      cancelled = true;
    };
  }, [contractId]);

  const contractSummary = useMemo(() => {
    if (!contract) return undefined;
    return {
      contractNumber: contract.id.slice(0, 8).toUpperCase(),
      clientName: contract.clients?.full_name || "Client not found",
      currentVehicle: formatVehicle(contract.cars),
      rentalPeriod: `${formatDateTime(contract.start_date, contract.start_time)} to ${formatDateTime(contract.end_date, contract.end_time)}`,
    };
  }, [contract]);

  const goBackToContract = () => {
    if (contractId) {
      navigate(`/contracts/${contractId}`);
    } else {
      navigate("/contracts");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F1117] px-4 text-sm text-white/60">
        Loading replacement workflow...
      </div>
    );
  }

  if (error || !contract || !contractId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0F1117] px-4 text-center text-white">
        <div>
          <h1 className="text-lg font-semibold">Replacement workflow unavailable</h1>
          <p className="mt-2 text-sm text-white/60">{error || "Contract was not found."}</p>
        </div>
        <Button type="button" className="min-h-11 bg-[#4f6ef7] text-white hover:bg-[#4f6ef7]/90" onClick={goBackToContract}>
          Back to contract
        </Button>
      </div>
    );
  }

  return (
    <ReplaceVehicleModal
      contractId={contractId}
      currentCarId={contract.car_id}
      contractStartDate={contract.start_date}
      isOpen
      onClose={goBackToContract}
      onSuccess={() => undefined}
      presentation="page"
      contractSummary={contractSummary}
    />
  );
};

export default ReplaceVehicle;
