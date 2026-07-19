import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { MessageCircle, Calendar, DollarSign } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const buildRentalExtensionLabel = (periodStart: string, periodEnd: string) =>
  `Rental Extension: ${periodStart} - ${periodEnd}`;

interface RenewContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  clientName: string;
  clientPhone: string;
  carPlate: string;
  currentEndDate: string;
  rateType: string;
  rateAmount: number;
}

const RenewContractDialog = ({
  open,
  onOpenChange,
  contractId,
  clientName,
  clientPhone,
  carPlate,
  currentEndDate,
  rateType,
  rateAmount,
}: RenewContractDialogProps) => {
  const [newEndDate, setNewEndDate] = useState("");
  const [paymentAmount, setPaymentAmount] = useState(String(rateAmount));
  const [isSubmitting, setIsSubmitting] = useState(false);

  const formatDateForDisplay = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const openWhatsApp = (message: string) => {
    const url = `https://wa.me/${clientPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  const handleEnglishWhatsApp = () => {
    const message = `Hi ${clientName}, your rental contract for ${carPlate} expires on ${formatDateForDisplay(currentEndDate)}. Would you like to extend?`;
    openWhatsApp(message);
  };

  const handleRussianWhatsApp = () => {
    const message = `Здравствуйте ${clientName}, ваш договор аренды на ${carPlate} истекает ${formatDateForDisplay(currentEndDate)}. Хотите продлить?`;
    openWhatsApp(message);
  };

  const handleConfirmRenewal = async () => {
    if (!newEndDate) {
      toast.error("Please select a new end date");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: latestExtension, error: latestExtensionError } = await (supabase as any)
        .from("contract_fees")
        .select("extension_end")
        .eq("contract_id", contractId)
        .not("extension_start", "is", null)
        .not("extension_end", "is", null)
        .order("extension_end", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestExtensionError) throw latestExtensionError;

      const extensionStart = latestExtension?.extension_end ?? currentEndDate;

      if (newEndDate <= extensionStart) {
        toast.error("New end date must be later than the current rental period");
        return;
      }

      const amount = Number(paymentAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        toast.error("Enter a valid extension amount");
        return;
      }

      const { data: existingExtension, error: existingExtensionError } = await (supabase as any)
        .from("contract_fees")
        .select("id")
        .eq("contract_id", contractId)
        .eq("extension_start", extensionStart)
        .eq("extension_end", newEndDate)
        .maybeSingle();

      if (existingExtensionError) throw existingExtensionError;
      if (existingExtension?.id) {
        toast.info("This extension period already exists");
        onOpenChange(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) throw new Error("Could not confirm current user");

      const { error: contractUpdateError } = await supabase
        .from("contracts")
        .update({ end_date: newEndDate } as never)
        .eq("id", contractId);

      if (contractUpdateError) throw contractUpdateError;

      const { error } = await (supabase as any)
        .from("contract_fees")
        .insert({
          contract_id: contractId,
          category: "other",
          label: buildRentalExtensionLabel(extensionStart, newEndDate),
          amount,
          extension_start: extensionStart,
          extension_end: newEndDate,
          owner_id: userId,
        });

      if (error) throw error;

      toast.success("Contract extension saved");
      onOpenChange(false);
      
      // Reset form
      setNewEndDate("");
      setPaymentAmount(String(rateAmount));
    } catch (error) {
      console.error("Error renewing contract:", error);
      toast.error("Failed to renew contract");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renew Contract</DialogTitle>
          <DialogDescription>
            Renew the rental contract for {clientName} ({carPlate})
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="newEndDate" className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              New End Date
            </Label>
            <Input
              id="newEndDate"
              type="date"
              value={newEndDate}
              onChange={(e) => setNewEndDate(e.target.value)}
              min={new Date(currentEndDate).toISOString().split("T")[0]}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentAmount" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Payment Amount (AED)
            </Label>
            <Input
              id="paymentAmount"
              type="number"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Contact Client via WhatsApp</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleEnglishWhatsApp}
                className="flex-1"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Ask client (EN)
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRussianWhatsApp}
                className="flex-1"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Ask client (RU)
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirmRenewal}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Renewing..." : "Confirm Renewal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RenewContractDialog;
