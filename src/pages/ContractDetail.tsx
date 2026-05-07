import { ContractDetailLayout } from "@/components/ContractDetailLayout";
import { TabsContent } from "@/components/ui/tabs";
import { Link } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ContractDetail = () => {
  // Base layout shell for the Contract Detail page
  // Contract ID and status are hardcoded for the shell as per requirements
  return (
    <ContractDetailLayout
      contractId="A34B8DE2"
      contractStatus="Completed"
      financialsCount={5}
    >
      <TabsContent value="overview" className="mt-4 space-y-3">
        <div className="space-y-4">
          {/* CARD 1 - CLIENT */}
          <div className="rounded-lg border border-[#252d3d] bg-[#161b27] animate-fade-up animate-delay-100">
            <header className="flex items-center justify-between border-b border-[#252d3d] px-4 py-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7a99]">CLIENT</h3>
              <a href="#" className="text-[11px] text-[#3b82f6] hover:underline">View profile →</a>
            </header>
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#3b82f6] to-indigo-500 flex items-center justify-center text-white text-sm font-semibold">MA</div>
                <div>
                  <p className="text-sm font-medium">Maxim Akopov</p>
                  <p className="text-xs text-[#6b7a99]">Tourist · Russia 🇷🇺</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4 mt-4">
                <div className="flex flex-col gap-0.5 py-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-[#6b7a99]/80">Phone</span>
                  <span className="text-sm font-medium text-[#e8edf5]">+79150131048</span>
                </div>
                <div className="flex flex-col gap-0.5 py-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-[#6b7a99]/80">Email</span>
                  <span className="text-sm font-medium text-[#6b7a99]">—</span>
                </div>
                <div className="flex flex-col gap-0.5 py-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-[#6b7a99]/80">Passport</span>
                  <span className="font-mono text-sm font-medium text-[#e8edf5]">763237275</span>
                </div>
                <div className="flex flex-col gap-0.5 py-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-[#6b7a99]/80">Client type</span>
                  <span className="text-sm font-medium text-[#e8edf5]">Tourist</span>
                </div>
              </div>
            </div>
          </div>

          {/* CARD 2 - VEHICLE */}
          <div className="rounded-lg border border-[#252d3d] bg-[#161b27] animate-fade-up animate-delay-200">
            <header className="flex items-center justify-between border-b border-[#252d3d] px-4 py-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7a99]">VEHICLE</h3>
            </header>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-x-4">
                <div className="flex flex-col gap-0.5 py-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-[#6b7a99]/80">Make/Model</span>
                  <span className="text-sm font-medium text-[#e8edf5]">Mazda 3</span>
                </div>
                <div className="flex flex-col gap-0.5 py-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-[#6b7a99]/80">Year</span>
                  <span className="text-sm font-medium text-[#e8edf5]">2021</span>
                </div>
                <div className="flex flex-col gap-0.5 py-1.5">
                  <span className="text-[11px] uppercase tracking-wide text-[#6b7a99]/80">Plate</span>
                  <span className="font-mono text-sm font-medium text-[#e8edf5]">AJM B 98128</span>
                </div>
                <div className="flex flex-col gap-0.5 py-1.5 col-span-1">
                  <span className="text-[11px] uppercase tracking-wide text-[#6b7a99]/80">Fuel level</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm font-medium text-[#e8edf5]">Quarter</span>
                    <div className="flex gap-0.5">
                      <div className="h-2 w-3 rounded-sm bg-amber-500"></div>
                      <div className="h-2 w-3 rounded-sm bg-[#252d3d]"></div>
                      <div className="h-2 w-3 rounded-sm bg-[#252d3d]"></div>
                      <div className="h-2 w-3 rounded-sm bg-[#252d3d]"></div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 py-1.5 col-span-2">
                  <span className="text-[11px] uppercase tracking-wide text-[#6b7a99]/80">Initial mileage</span>
                  <span className="text-sm font-medium text-[#e8edf5]">0 km</span>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-2">
                <span className="text-xs text-[#6b7a99]">09 Apr</span>
                <div className="h-2 w-2 rounded-full bg-[#3b82f6] flex-shrink-0"></div>
                <div className="flex-1 h-px bg-[#252d3d]"></div>
                <div className="h-2 w-2 rounded-full bg-[#3b82f6] flex-shrink-0"></div>
                <span className="text-xs text-[#6b7a99]">12 Apr</span>
                <span className="inline-flex items-center rounded-md border border-[#252d3d] px-2 py-0.5 text-[11px] font-medium bg-tint-green text-tint-green-foreground ml-2">Completed</span>
              </div>
            </div>
          </div>

          {/* CARD 3 - FINANCIAL SNAPSHOT */}
          <div className="rounded-lg border border-[#252d3d] bg-[#161b27] animate-fade-up animate-delay-300">
            <header className="flex items-center justify-between border-b border-[#252d3d] px-4 py-2.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7a99]">FINANCIAL SNAPSHOT</h3>
            </header>
            <div className="grid grid-cols-4 divide-x divide-[#252d3d]">
              <div className="flex flex-col items-center justify-center p-4">
                <span className="text-[10px] uppercase tracking-wide text-[#6b7a99]">Total charges</span>
                <span className="font-mono text-base font-semibold text-white mt-1">980 AED</span>
              </div>
              <div className="flex flex-col items-center justify-center p-4 bg-[#22c55e]/10">
                <span className="text-[10px] uppercase tracking-wide text-[#6b7a99]">Paid</span>
                <span className="font-mono text-base font-semibold text-[#22c55e] mt-1">200 AED</span>
              </div>
              <div className="flex flex-col items-center justify-center p-4">
                <span className="text-[10px] uppercase tracking-wide text-[#6b7a99]">Deposit held</span>
                <span className="font-mono text-base font-semibold text-[#6b7a99] mt-1">1000 AED</span>
              </div>
              <div className="flex flex-col items-center justify-center p-4 bg-[#ef4444]/10">
                <span className="text-[10px] uppercase tracking-wide text-[#6b7a99]">Client owes</span>
                <span className="font-mono text-base font-semibold text-[#ef4444] mt-1">780 AED</span>
              </div>
            </div>
          </div>
        </div>
      </TabsContent>
      <TabsContent value="financials" className="mt-4 space-y-3">
        <div className="h-96 w-full bg-[#1c2333] flex items-center justify-center rounded-lg">
          FINANCIALS CONTENT
        </div>
      </TabsContent>
      <TabsContent value="documents" className="mt-4 space-y-3">
        <div className="h-96 w-full bg-[#1c2333] flex items-center justify-center rounded-lg">
          DOCUMENTS CONTENT
        </div>
      </TabsContent>
      <TabsContent value="timeline" className="mt-4 space-y-3">
        <div className="h-96 w-full bg-[#1c2333] flex items-center justify-center rounded-lg">
          TIMELINE & NOTES CONTENT
        </div>
      </TabsContent>
    </ContractDetailLayout>
  );
};

export default ContractDetail;
