import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Calendar, Clock, MessageCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import RenewContractDialog from "@/components/RenewContractDialog";

interface ContractWithDetails {
  id: string;
  end_date: string;
  rate_type: string;
  rate_amount: number;
  status: string;
  client: {
    full_name: string;
    phone: string;
  };
  car: {
    plate: string;
  };
}

const ExpiringContracts = () => {
  const [openContractId, setOpenContractId] = useState<string | null>(null);
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
          rate_amount,
          status,
          client:clients (
            full_name,
            phone
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

  const getRenewalBadge = (endDate: string) => {
    const todayStr = new Date().toISOString().split("T")[0];
    if (endDate === todayStr) {
      return (
        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600">
          Today
        </span>
      );
    }

    return (
      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        This week
      </span>
    );
  };

  const getWhatsAppUrl = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    return `https://wa.me/${digits}`;
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
          className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-foreground/15"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Link
                to={`/contracts/${contract.id}`}
                className="truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
              >
                {contract.client.full_name}
              </Link>
              {getRenewalBadge(contract.end_date)}
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 px-2 text-xs"
              asChild
            >
              <a href={getWhatsAppUrl(contract.client.phone)} target="_blank" rel="noreferrer">
                <MessageCircle className="h-3.5 w-3.5" />
                WA
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 px-2 text-xs"
              onClick={() => setOpenContractId(contract.id)}
            >
              <RotateCw className="h-3.5 w-3.5" />
              Renew
            </Button>
            <RenewContractDialog
              contractId={contract.id}
              clientName={contract.client.full_name}
              clientPhone={contract.client.phone}
              carPlate={contract.car.plate}
              currentEndDate={contract.end_date}
              rateType={contract.rate_type}
              rateAmount={contract.rate_amount}
              open={openContractId === contract.id}
              onOpenChange={(open) => {
                if (!open) setOpenContractId(null);
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default ExpiringContracts;
