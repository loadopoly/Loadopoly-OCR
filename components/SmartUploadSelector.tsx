import React from 'react';
import { Package, FileText, Mountain } from 'lucide-react';
import { ScanType, SCAN_TYPE_CONFIG } from '../types';

interface SmartUploadSelectorProps {
  onTypeSelected: (type: ScanType) => void;
}

export default function SmartUploadSelector({ onTypeSelected }: SmartUploadSelectorProps) {
  const options = [
    { type: ScanType.ITEM, ...SCAN_TYPE_CONFIG[ScanType.ITEM], desc: 'Coins, tools, clothing, objects' },
    { type: ScanType.DOCUMENT, ...SCAN_TYPE_CONFIG[ScanType.DOCUMENT], desc: 'Letters, books, maps, certificates' },
    { type: ScanType.SCENERY, ...SCAN_TYPE_CONFIG[ScanType.SCENERY], desc: 'Buildings, landscapes, street views' },
  ];

  return (
    <div className="max-w-4xl mx-auto py-8">
      <h2 className="text-2xl font-bold text-white mb-2 text-center">
        What are you scanning today?
      </h2>
      <p className="text-slate-400 text-center mb-8">
        Select a category to optimize the AI extraction pipeline.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {options.map(opt => (
          <button
            key={opt.type}
            onClick={() => onTypeSelected(opt.type)}
            className={`group relative bg-slate-900/50 backdrop-blur border-2 border-slate-700 hover:border-${opt.color}-500 rounded-2xl p-8 transition-all hover:scale-105 hover:bg-slate-800 text-left`}
          >
            <div className={`p-4 w-fit rounded-xl bg-${opt.color}-900/30 mb-4 border border-${opt.color}-900/50`}>
              <opt.icon size={32} className={`text-${opt.color}-400`} />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{opt.label}</h3>
            <p className="text-sm text-slate-400">{opt.desc}</p>
            
            {/* Hover Glow Effect */}
            <div className={`absolute inset-0 rounded-2xl ring-2 ring-transparent group-hover:ring-${opt.color}-500/20 transition-all pointer-events-none`} />
          </button>
        ))}
      </div>
    </div>
  );
}