
import React from 'react';
import StatusBadge from './StatusBadge';


const ContractDetail: React.FC = () => {
  const navItems = [
    { name: 'Dashboard', active: false },
    { name: 'Fleet', active: false },
    { name: 'Contracts', active: true },
    { name: 'Clients', active: false },
    { name: 'Fines & Salik', active: false },
    { name: 'Payments', active: false },
    { name: 'Reports', active: false },
    { name: 'Settings', active: false },
  ];

  const tabs = [
    { name: 'Overview', active: true, badge: null },
    { name: 'Financials', active: false, badge: '5' },
    { name: 'Documents', active: false, badge: null },
    { name: 'Timeline & Notes', active: false, badge: null },
  ];

  return (
    <div className="flex h-screen bg-[#0f1117] text-[#e8edf5] font-dm-sans">
      {/* Left Sidebar */}
      <aside className="w-[220px] h-screen bg-[#161b27] border-r border-[#252d3d] flex flex-col">
        {/* Logo Area */}
        <div className="p-6 border-b border-[#252d3d]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-[#3b82f6] rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold text-lg">FleetDesk</h1>
              <p className="text-xs text-[#6b7a99]">UAE Rentals</p>
            </div>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <button
              key={item.name}
              className={`w-full px-6 py-3 hover-nav transition-all ${
                item.active ? 'bg-[#1c2333] border-l-4 border-[#3b82f6] text-[#3b82f6]' : 'text-[#e8edf5]'
              }`}
            >
              {item.name}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-6 border-t border-[#252d3d]">
          <p className="text-sm text-[#6b7a99]">muzafirvat@gmail.com</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-[#161b27] border-b border-[#252d3d] flex items-center justify-between px-6">
          {/* Left Section */}
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-[#1c2333] rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-[#e8edf5]">Contracts</span>
            <span className="text-[#6b7a99]">/</span>
            <span className="font-mono text-sm">CTR-A34B8DE2</span>
            <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">Completed</span>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            <button className="px-4 py-2 text-[#e8edf5] hover:bg-[#1c2333] rounded-lg transition-colors">
              Invoice
            </button>
            <button className="px-4 py-2 bg-[#3b82f6] text-white hover:bg-[#2563eb] rounded-lg transition-colors">
              Edit
            </button>
            <button className="p-2 hover:bg-[#1c2333] rounded-lg transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Tabs Row */}
        <div className="bg-[#161b27] border-b border-[#252d3d] px-6">
          <div className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.name}
                className={`py-3 border-b-2 transition-colors flex items-center gap-2 ${
                  tab.active
                    ? 'border-[#3b82f6] text-[#3b82f6]'
                    : 'border-transparent text-[#6b7a99] hover:text-[#e8edf5]'
                }`}
              >
                {tab.name}
                {tab.badge && (
                  <span className="px-2 py-0.5 bg-[#1c2333] text-xs rounded-full">{tab.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="flex-1 grid grid-cols-[1fr_280px] gap-6 p-6 overflow-hidden">
          {/* Left Column */}
          <div className="space-y-4 overflow-y-auto custom-scrollbar">
            {/* CARD 1 — Client */}
            <div className="bg-[#161b27] rounded-lg border border-[#252d3d] p-6 animate-fadeUp hover-card" style={{ animationDelay: '50ms' }}>
              <div className="flex justify-between items-center mb-4">
                <span className="text-xs uppercase tracking-wider text-[#6b7a99]">CLIENT</span>
                <a href="#" className="text-xs text-[#3b82f6] hover:underline">View profile →</a>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold">
                  MA
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-[#e8edf5]">Maxim Akopov</h3>
                  <p className="text-sm text-[#6b7a99]">Tourist · Russia 🇷🇺</p>
                  <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                      <p className="text-xs text-[#6b7a99]">Phone</p>
                      <p className="text-sm font-ibm-plex-mono">+79150131048</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#6b7a99]">Email</p>
                      <p className="text-sm text-[#6b7a99]">—</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#6b7a99]">Passport</p>
                      <p className="text-sm font-ibm-plex-mono">763237275</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#6b7a99]">Client type</p>
                      <p className="text-sm">Tourist</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 2 — Vehicle */}
            <div className="bg-[#161b27] rounded-lg border border-[#252d3d] p-6 animate-fadeUp hover-card" style={{ animationDelay: '100ms' }}>
              <div className="mb-4">
                <span className="text-xs uppercase tracking-wider text-[#6b7a99]">VEHICLE</span>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-[#6b7a99]">Make/Model</p>
                  <p className="text-sm">Mazda 3</p>
                </div>
                <div>
                  <p className="text-xs text-[#6b7a99]">Year</p>
                  <p className="text-sm">2021</p>
                </div>
                <div>
                  <p className="text-xs text-[#6b7a99]">Plate</p>
                  <p className="text-sm font-ibm-plex-mono">AJM B 98128</p>
                </div>
                <div>
                  <p className="text-xs text-[#6b7a99]">Fuel level</p>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <div className="w-3 h-3 bg-amber-500 rounded-sm"></div>
                      <div className="w-3 h-3 bg-[#252d3d] rounded-sm"></div>
                      <div className="w-3 h-3 bg-[#252d3d] rounded-sm"></div>
                      <div className="w-3 h-3 bg-[#252d3d] rounded-sm"></div>
                    </div>
                    <span className="text-sm">Quarter</span>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-[#6b7a99]">Initial mileage</p>
                  <p className="text-sm">0 km</p>
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-[#252d3d]">
                <div className="flex items-center gap-3">
                  <span className="text-sm">09 Apr</span>
                  <div className="w-2 h-2 bg-[#3b82f6] rounded-full"></div>
                  <div className="flex-1 h-0.5 bg-[#3b82f6]"></div>
                  <div className="w-2 h-2 bg-[#3b82f6] rounded-full"></div>
                  <span className="text-sm">12 Apr</span>
                  <StatusBadge status="completed">Completed</StatusBadge>
                </div>
              </div>
            </div>

            {/* CARD 3 — Financial Snapshot */}
            <div className="bg-[#161b27] rounded-lg border border-[#252d3d] animate-fadeUp hover-card" style={{ animationDelay: '150ms' }}>
              <div className="p-4">
                <span className="text-xs uppercase tracking-wider text-[#6b7a99]">FINANCIAL SNAPSHOT</span>
              </div>
              <div className="grid grid-cols-4 divide-x divide-[#252d3d]">
                <div className="p-4 text-center">
                  <p className="text-xs text-[#6b7a99] mb-1">Total charges</p>
                  <p className="text-lg font-semibold font-ibm-plex-mono text-[#e8edf5]">980 AED</p>
                </div>
                <div className="p-4 text-center bg-green-500/10">
                  <p className="text-xs text-[#6b7a99] mb-1">Paid</p>
                  <p className="text-lg font-semibold font-ibm-plex-mono text-[#22c55e]">200 AED</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-xs text-[#6b7a99] mb-1">Deposit held</p>
                  <p className="text-lg font-semibold font-ibm-plex-mono text-[#6b7a99]">1000 AED</p>
                </div>
                <div className="p-4 text-center bg-red-500/10">
                  <p className="text-xs text-[#6b7a99] mb-1">Client owes</p>
                  <p className="text-lg font-semibold font-ibm-plex-mono text-[#ef4444]">780 AED</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-4 overflow-y-auto custom-scrollbar">
            {/* WIDGET 1 — Outstanding Payment */}
            <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] rounded-lg p-4 animate-fadeUp" style={{ animationDelay: '50ms' }}>
              <p className="text-xs uppercase tracking-wider text-red-400 mb-2">CLIENT OWES</p>
              <p className="text-2xl font-bold font-ibm-plex-mono text-red-500 mb-4">AED 780</p>
              <button className="w-full bg-[#ef4444] text-white py-2.5 px-3 rounded-lg hover:bg-[#dc2626] transition-colors text-sm">
                + Record Payment
              </button>
            </div>

            {/* WIDGET 2 — Actions */}
            <div className="bg-[#161b27] border border-[#252d3d] rounded-lg p-4 animate-fadeUp" style={{ animationDelay: '100ms' }}>
              <p className="text-xs uppercase tracking-wider text-[#6b7a99] mb-3">ACTIONS</p>
              <div className="space-y-1.5">
                <button className="w-full bg-[#1c2333] border border-[#252d3d] rounded-lg px-3 py-2 text-left hover-action transition-all flex items-center gap-3">
                  <span className="text-lg">📅</span>
                  <span className="text-sm">Extend Rental</span>
                </button>
                <button className="w-full bg-[#1c2333] border border-[#252d3d] rounded-lg px-3 py-2 text-left hover-action transition-all flex items-center gap-3">
                  <span className="text-lg">⬇</span>
                  <span className="text-sm">Download Invoice</span>
                </button>
                <button className="w-full bg-[#1c2333] border border-[#252d3d] rounded-lg px-3 py-2 text-left hover-action transition-all flex items-center gap-3">
                  <span className="text-lg">✏️</span>
                  <span className="text-sm">Edit Contract</span>
                </button>
                <button className="w-full bg-[#1c2333] border border-[#252d3d] rounded-lg px-3 py-2 text-left hover-action transition-all flex items-center gap-3 text-[#6b7a99]">
                  <span className="text-lg">✕</span>
                  <span className="text-sm">Close Contract</span>
                </button>
              </div>
            </div>

            {/* WIDGET 3 — Rental Period */}
            <div className="bg-[#161b27] border border-[#252d3d] rounded-lg animate-fadeUp" style={{ animationDelay: '150ms' }}>
              <div className="p-4">
                <p className="text-xs uppercase tracking-wider text-[#6b7a99]">RENTAL PERIOD</p>
              </div>
              <div className="grid grid-cols-2 divide-x divide-[#252d3d] min-w-0">
                <div className="p-4 text-center">
                  <p className="text-xs text-[#6b7a99] mb-1">START</p>
                  <p className="text-lg font-semibold">09 Apr</p>
                  <p className="text-xs text-[#6b7a99]">2026</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-xs text-[#6b7a99] mb-1">END</p>
                  <p className="text-lg font-semibold">12 Apr</p>
                  <p className="text-xs text-[#6b7a99]">2026</p>
                </div>
              </div>
              <div className="px-4 py-3.5 space-y-2 border-t border-[#252d3d]">
                <div className="flex justify-between text-sm">
                  <span className="text-[#6b7a99]">Duration:</span>
                  <span>3 days</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#6b7a99]">Daily rate:</span>
                  <span>AED 160</span>
                </div>
                <div className="border-t border-[#252d3d] my-2"></div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#6b7a99]">Deposit held:</span>
                  <span className="text-[#6b7a99] font-ibm-plex-mono">AED 1 000</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractDetail;
