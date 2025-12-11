import React from 'react';
import { Package, FileText, Mountain } from 'lucide-react';
import { ScanType, SCAN_TYPE_CONFIG } from '../types';
import { announce } from '../lib/accessibility';

interface SmartUploadSelectorProps {
  onTypeSelected: (type: ScanType) => void;
}

export default function SmartUploadSelector({ onTypeSelected }: SmartUploadSelectorProps) {
  const options = [
    { type: ScanType.ITEM, ...SCAN_TYPE_CONFIG[ScanType.ITEM], desc: 'Physical objects, artifacts, tools, coins, clothing' },
    { type: ScanType.DOCUMENT, ...SCAN_TYPE_CONFIG[ScanType.DOCUMENT], desc: 'Letters, books, maps, certificates, newspapers' },
    { type: ScanType.SCENERY, ...SCAN_TYPE_CONFIG[ScanType.SCENERY], desc: 'Buildings, landscapes, street views, nature scenes' },
  ];

  const handleSelect = (type: ScanType, label: string) => {
    announce(`Selected ${label}. Loading camera options.`);
    onTypeSelected(type);
  };

  return (
    <div className="max-w-6xl mx-auto py-8" role="region" aria-label="Choose scan type">
      <h2 className="text-2xl font-bold text-white mb-2 text-center">
        What are you scanning today?
      </h2>
      <p className="text-slate-400 text-center mb-8">
        Select a category to optimize the AI extraction pipeline.
      </p>
      
      <div role="list" className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {options.map(opt => (
          <button
            key={opt.type}
            role="listitem"
            aria-label={`Select ${opt.label}. ${opt.desc}`}
            onClick={() => handleSelect(opt.type, opt.label)}
            className={`group relative bg-slate-900/50 backdrop-blur border-4 border-slate-700 hover:border-${opt.color}-500 focus:outline-none focus:ring-4 focus:ring-${opt.color}-500/50 rounded-2xl p-10 transition-all hover:scale-105 text-left`}
          >
            <div className={`p-4 w-fit rounded-xl bg-${opt.color}-900/30 mb-6 border border-${opt.color}-900/50`} aria-hidden="true">
              <opt.icon size={64} className={`text-${opt.color}-400`} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-3">{opt.label}</h3>
            <p className="text-slate-300 text-sm leading-relaxed">{opt.desc}</p>
            
            {/* Hover Glow Effect */}
            <div className={`absolute inset-0 rounded-2xl ring-2 ring-transparent group-hover:ring-${opt.color}-500/20 transition-all pointer-events-none`} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}