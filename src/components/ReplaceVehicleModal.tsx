import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import { SupabaseClient } from "@supabase/supabase-js";
import { findVehicleContractOverlap, formatContractOverlapMessage } from "@/lib/contractOverlap";

// Define the interface to support the missing contract_vehicles table
interface ExtendedDatabase extends Database {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      contract_vehicles: {
        Row: {
          id: string;
          contract_id: string;
          car_id: string;
          started_at: string;
          ended_at: string | null;
          owner_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          contract_id: string;
          car_id: string;
          started_at: string;
          ended_at?: string | null;
          owner_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          contract_id?: string;
          car_id?: string;
          started_at?: string;
          ended_at?: string | null;
          owner_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
  };
}

interface ReplaceVehicleModalProps {
  contractId: string;
  currentCarId: string;
  contractStartDate: string; // ISO date string
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Car {
  id: string;
  plate: string;
  make: string;
  model: string;
  year: number;
}

interface ContractPeriod {
  id: string;
  end_date: string;
  end_time: string | null;
}

function splitDatetimeLocal(value: string) {
  return {
    date: value.slice(0, 10),
    time: value.slice(11, 16),
  };
}

export const ReplaceVehicleModal: React.FC<ReplaceVehicleModalProps> = ({
  contractId,
  currentCarId,
  contractStartDate,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { toast } = useToast();
  
  const [availableCars, setAvailableCars] = useState<Car[]>([]);
  const [loadingCars, setLoadingCars] = useState(false);
  const [currentCar, setCurrentCar] = useState<Car | null>(null);
  const [loadingCurrentCar, setLoadingCurrentCar] = useState(false);
  const [selectedNewCarId, setSelectedNewCarId] = useState<string>("");
  
  const [handoverTime, setHandoverTime] = useState<string>("");
  const [pickupTime, setPickupTime] = useState<string>("");
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Helper to format a Date object into local datetime-local string (YYYY-MM-DDTHH:MM)
  const formatDatetimeLocal = (date: Date) => {
    const pad = (num: number) => String(num).padStart(2, "0");
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  };

  // Reset values when modal opens
  useEffect(() => {
    if (isOpen) {
      const now = new Date();
      const formatted = formatDatetimeLocal(now);
      setHandoverTime(formatted);
      setPickupTime(formatted);
      setSelectedNewCarId("");
      setCurrentCar(null);
      
      const fetchModalData = async () => {
        setLoadingCars(true);
        setLoadingCurrentCar(true);
        try {
          const [availableRes, currentRes] = await Promise.all([
            supabase
              .from("cars")
              .select("id, plate, make, model, year")
              .eq("status", "Available")
              .order("plate"),
            supabase
              .from("cars")
              .select("id, plate, make, model, year")
              .eq("id", currentCarId)
              .maybeSingle()
          ]);

          if (availableRes.error) throw availableRes.error;
          setAvailableCars((availableRes.data as Car[]) || []);

          if (currentRes.error) throw currentRes.error;
          setCurrentCar(currentRes.data as Car | null);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("Error fetching modal data:", err);
          toast({
            title: "Error",
            description: `Failed to load vehicles data: ${message}`,
            variant: "destructive",
          });
        } finally {
          setLoadingCars(false);
          setLoadingCurrentCar(false);
        }
      };

      fetchModalData();
    }
  }, [isOpen, currentCarId, toast]);

  // Sync handover time with pickup time
  const handleHandoverTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setHandoverTime(value);
    setPickupTime(value); // Auto-sync Section 2 with Section 1
  };

  const handleConfirm = async () => {
    if (!selectedNewCarId) return;

    setConfirmLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No authenticated user session found");
      const userId = user.id;

      // Cast supabase client to ExtendedDatabase to handle contract_vehicles
      const extendedDb = supabase as unknown as SupabaseClient<ExtendedDatabase>;

      const pickup = splitDatetimeLocal(pickupTime);
      const { data: contractPeriod, error: contractPeriodError } = await extendedDb
        .from("contracts")
        .select("id, end_date, end_time")
        .eq("id", contractId)
        .single();
      if (contractPeriodError) throw contractPeriodError;

      const conflict = await findVehicleContractOverlap(extendedDb, {
        carId: selectedNewCarId,
        startDate: pickup.date,
        startTime: pickup.time,
        endDate: (contractPeriod as ContractPeriod).end_date,
        endTime: (contractPeriod as ContractPeriod).end_time,
        excludeContractId: contractId,
      });
      if (conflict) {
        toast({
          title: "Vehicle unavailable",
          description: formatContractOverlapMessage(conflict),
          variant: "destructive",
        });
        setConfirmLoading(false);
        return;
      }

      // a. Insert a row into contract_vehicles table for old car end
      const { error: errOldVehicle } = await extendedDb
        .from("contract_vehicles")
        .insert({
          contract_id: contractId,
          car_id: currentCarId,
          started_at: new Date(contractStartDate).toISOString(),
          ended_at: new Date(handoverTime).toISOString(),
          owner_id: userId,
        });
      if (errOldVehicle) throw errOldVehicle;

      // b. Update contracts table: set car_id = selectedNewCarId where id = contractId
      const { error: errContract } = await extendedDb
        .from("contracts")
        .update({ car_id: selectedNewCarId })
        .eq("id", contractId);
      if (errContract) throw errContract;

      // c. Update old car in cars table: set status = 'Available' where id = currentCarId
      const { error: errOldCar } = await extendedDb
        .from("cars")
        .update({ status: "Available" })
        .eq("id", currentCarId);
      if (errOldCar) throw errOldCar;

      // d. Update new car in cars table: set status = 'Rented' where id = selectedNewCarId
      const { error: errNewCar } = await extendedDb
        .from("cars")
        .update({ status: "Rented" })
        .eq("id", selectedNewCarId);
      if (errNewCar) throw errNewCar;

      // e. Insert a row into contract_vehicles table for new car start
      const { error: errNewVehicle } = await extendedDb
        .from("contract_vehicles")
        .insert({
          contract_id: contractId,
          car_id: selectedNewCarId,
          started_at: new Date(pickupTime).toISOString(),
          ended_at: null,
          owner_id: userId,
        });
      if (errNewVehicle) throw errNewVehicle;

      toast({
        title: "Vehicle Replaced",
        description: "Vehicle replacement recorded successfully.",
      });

      onSuccess();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Replacement transaction failed:", err);
      toast({
        title: "Replacement Failed",
        description: `Failed to replace vehicle: ${message}`,
        variant: "destructive",
      });
    } finally {
      setConfirmLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl bg-[#0F1117] border-white/10 text-white p-6 rounded-lg shadow-xl font-dm-sans">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold tracking-tight text-white">
            Replace Vehicle Mid-Contract
          </DialogTitle>
          <DialogDescription className="text-sm text-white/60">
            Record the handover of the current vehicle and assign the new vehicle to Contract:{" "}
            <span className="font-ibm-plex-mono text-white bg-white/5 px-1.5 py-0.5 rounded text-xs">
              {contractId.slice(0, 8).toUpperCase()}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-4 border-t border-b border-white/10 py-6">
          {/* Section 1 — Current Vehicle End */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white/90 border-b border-white/5 pb-2">
              Section 1 — Current Vehicle End
            </h3>
            
            <div className="space-y-2">
              <Label className="text-xs text-white/50 uppercase tracking-wider">
                Current Vehicle
              </Label>
              <div className="font-ibm-plex-mono bg-[#1a1a1a] border border-white/10 rounded-md px-3 py-2 text-sm text-white/70">
                {loadingCurrentCar ? (
                  <span className="text-xs text-white/40 italic">Loading vehicle info...</span>
                ) : currentCar ? (
                  `${currentCar.plate} — ${currentCar.make} ${currentCar.model} (${currentCar.year})`
                ) : (
                  currentCarId.slice(0, 8).toUpperCase()
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="handover-time" className="text-xs text-white/50 uppercase tracking-wider">
                Hand-over date & time
              </Label>
              <Input
                id="handover-time"
                type="datetime-local"
                value={handoverTime}
                onChange={handleHandoverTimeChange}
                className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          {/* Section 2 — New Vehicle */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-white/90 border-b border-white/5 pb-2">
              Section 2 — New Vehicle
            </h3>

            <div className="space-y-2">
              <Label className="text-xs text-white/50 uppercase tracking-wider">
                Available Vehicles
              </Label>
              {loadingCars ? (
                <div className="text-xs text-white/60 italic py-2">Loading available fleet...</div>
              ) : availableCars.length === 0 ? (
                <div className="text-xs text-destructive italic py-2">No available cars found in fleet.</div>
              ) : (
                <Select value={selectedNewCarId} onValueChange={setSelectedNewCarId}>
                  <SelectTrigger className="w-full bg-[#1a1a1a] border-white/10 text-white focus:ring-0 focus:ring-offset-0">
                    <SelectValue placeholder="Select new vehicle" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111111] border-white/10 text-white max-h-56">
                    {availableCars.map((car) => (
                      <SelectItem 
                        key={car.id} 
                        value={car.id}
                        className="focus:bg-[#1a1a1a] focus:text-white"
                      >
                        <span className="font-ibm-plex-mono mr-2">{car.plate}</span> — {car.make} {car.model} ({car.year})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="pickup-time" className="text-xs text-white/50 uppercase tracking-wider">
                Pickup date & time
              </Label>
              <Input
                id="pickup-time"
                type="datetime-local"
                value={pickupTime}
                onChange={(e) => setPickupTime(e.target.value)}
                className="font-ibm-plex-mono bg-[#1a1a1a] border-white/10 text-white focus-visible:ring-blue-500 focus-visible:ring-offset-0"
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} className="text-white/60 hover:text-white hover:bg-white/5">
            Cancel
          </Button>
          <Button
            disabled={!selectedNewCarId || confirmLoading}
            onClick={handleConfirm}
            className="bg-[#4f6ef7] hover:bg-[#4f6ef7]/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {confirmLoading ? "Replacing..." : "Confirm Replacement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
