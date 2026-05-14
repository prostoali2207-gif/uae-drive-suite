import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Calendar, Clock } from "lucide-react";

interface ContractWithDetails {
  id: string;
  end_date: string;
  rate_type: string;
  status: string;
  client: {
    full_name: string;
  };
  car: {
    plate: string;
  };
}

const ExpiringContracts = () => {
  const [contracts, setContracts] = useState<ContractWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExpiringContracts();
  }, []);

  const fetchExpiringContracts = async () => {
    try {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      const threeDaysFromNowISO = threeDaysFromNow.toISOString();

      const { data, error } = await supabase
        .from("contracts")
        .select(`
          id,
          end_date,
          rate_type,
          status,
          client:clients (
            full_name
          ),
          car:cars (
            plate
          )
        `)
        .gte("end_date", new Date().toISOString().split("T")[0])
        .lte("end_date", threeDaysFromNowISO.split("T")[0])
        .in("status", ["Active", "Expiring Soon"])
        .order("end_date", { ascending: true });

      if (error) throw error;
      setContracts(data || []);
    } catch (error) {
      console.error("Error fetching expiring contracts:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getBadge = (rateType: string) => {
    if (rateType === "Daily") {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-500/20 text-amber-400 border border-amber-500/30">
          Expires soon
        </span>
      );
    }
    if (rateType === "Monthly") {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
          Month ending
        </span>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  if (contracts.length === 0) {
    return (
      <div className="p-4">
        <div className="text-sm text-gray-500">No expiring contracts in the next 3 days</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {contracts.map((contract) => (
        <div
          key={contract.id}
          className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-gray-900 truncate">
                {contract.client.full_name}
              </span>
              {getBadge(contract.rate_type)}
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                <span className="font-mono">{contract.car.plate}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{formatDate(contract.end_date)}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ExpiringContracts;
