import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Calendar, Clock, MessageCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import RenewContractDialog from "@/components/RenewContractDialog";
import { cn } from "@/lib/utils";

interface ContractWithDetails {
  id: string;
  end_date: string;
  rate_type: string;
  rate_amount: number;
  status: string;
  balance_due?: number;
  client: {
    full_name: string;
    phone: string;
  };
  car: {
    plate: string;
  };
}

type RenewalFilter = "today" | "tomorrow" | "week";

interface ExpiringContractsProps {
  filter?: RenewalFilter;
}

const formatAED = (amount: number) => `AED ${amount.toLocaleString("en-AE")}`;

const toDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);

  return nextDate;
};

const ExpiringContracts = ({ filter = "today" }: ExpiringContractsProps) => {
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

      const contractIds = (data || []).map((contract) => contract.id);
      let balanceByContract: Record<string, number> = {};

      if (contractIds.length > 0) {
        const { data: balancesData, error: balancesError } = await (supabase as any)
          .from("contract_balances")
          .select("contract_id, balance_due")
          .in("contract_id", contractIds);

        if (balancesError) throw balancesError;

        balanceByContract = Object.fromEntries(
          (balancesData || []).map((balance: { contract_id: string; balance_due: number | string | null }) => [
            balance.contract_id,
            Number(balance.balance_due || 0),
          ]),
        );
      }

      setContracts(
        (data || []).map((contract) => ({
          ...contract,
          balance_due: balanceByContract[contract.id] ?? 0,
        })),
      );
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

  const getFinancialBadge = (contract: ContractWithDetails) => {
    const balanceDue = Math.max(0, Number(contract.balance_due || 0));
    const isOverdue = contract.end_date < new Date().toISOString().split("T")[0];

    if (balanceDue <= 0) {
      return {
        label: "Paid",
        className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-500",
      };
    }

    if (isOverdue) {
      return {
        label: `Overdue ${formatAED(balanceDue)}`,
        className: "border-red-500/25 bg-red-500/10 text-red-500",
      };
    }

    return {
      label: `${formatAED(balanceDue)} due`,
      className: "border-amber-500/25 bg-amber-500/10 text-amber-500",
    };
  };

  const getWhatsAppUrl = (phone: string) => {
    const digits = phone.replace(/\D/g, "");
    return `https://wa.me/${digits}`;
  };

  const todayStr = toDateString(new Date());
  const tomorrowStr = toDateString(addDays(new Date(), 1));
  const weekStr = toDateString(addDays(new Date(), 7));
  const filteredContracts = contracts.filter((contract) => {
    if (filter === "today") return contract.end_date === todayStr;
    if (filter === "tomorrow") return contract.end_date === tomorrowStr;

    return contract.end_date >= todayStr && contract.end_date <= weekStr;
  });

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  if (filteredContracts.length === 0) {
    return (
      <div className="p-4">
        <div className="text-sm text-gray-500">No renewals for this period</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filteredContracts.map((contract) => {
        const financialBadge = getFinancialBadge(contract);

        return (
          <div
            key={contract.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 transition-colors hover:border-foreground/15"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1.5">
                <Link
                  to={`/contracts/${contract.id}`}
                  className="min-w-0 truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
                >
                  {contract.client.full_name}
                </Link>
                {getRenewalBadge(contract.end_date)}
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                    financialBadge.className,
                  )}
                >
                  {financialBadge.label}
                </span>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span className="font-mono">{contract.car.plate}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
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
        );
      })}
    </div>
  );
};

export default ExpiringContracts;
