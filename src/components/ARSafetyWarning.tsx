import React from 'react';
import { AlertTriangle, ShieldCheck, Eye, Users } from 'lucide-react';

interface ARSafetyWarningProps {
  onAccept: () => void;
}

export default function ARSafetyWarning({ onAccept }: ARSafetyWarningProps) {
  return (
    <div className="fixed inset-0 z-[110] bg-black/95 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 w-full max-w-md rounded-2xl border border-slate-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-amber-500/10 p-6 border-b border-amber-500/20 flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="text-amber-500" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-white">AR Safety Warning</h2>
          <p className="text-amber-200/70 text-sm mt-1">Please review before continuing</p>
        </div>

        <div className="p-8 space-y-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
              <Eye className="text-emerald-400" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white">Awareness of Surroundings</h3>
              <p className="text-sm text-slate-400 mt-1">
                Be aware of your physical surroundings at all times. Do not use AR while walking, driving, or in potentially hazardous areas.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Users className="text-blue-400" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white">Parental Supervision</h3>
              <p className="text-sm text-slate-400 mt-1">
                Younger users should be supervised by a parent or guardian while using augmented reality features.
              </p>
            </div>
          </div>

          <div className="pt-4">
             <button
               onClick={onAccept}
               className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-emerald-900/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
             >
               <ShieldCheck size={22} />
               I Understand & Agree
             </button>
             <p className="text-center text-[10px] text-slate-500 mt-4 leading-tight">
               By continuing, you acknowledge the risks of using Augmented Reality and agree to stay safe.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
