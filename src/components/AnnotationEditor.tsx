import React, { useState } from 'react';
import { X, Save, AlertCircle, Tag, FileText, MapPin } from 'lucide-react';
import { DigitalAsset, HistoricalDocumentMetadata } from '../types';

interface AnnotationEditorProps {
  asset: DigitalAsset;
  onSave: (updatedAsset: DigitalAsset) => void;
  onClose: () => void;
}

export default function AnnotationEditor({ asset, onSave, onClose }: AnnotationEditorProps) {
  const [formData, setFormData] = useState<Partial<HistoricalDocumentMetadata>>(asset.sqlRecord || {});
  const [isSaving, setIsSaving] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedAsset: DigitalAsset = {
        ...asset,
        sqlRecord: {
          ...asset.sqlRecord!,
          ...formData,
          IS_USER_ANNOTATED: true,
          LAST_MODIFIED: new Date().toISOString(),
          PRESERVATION_EVENTS: [
            ...(asset.sqlRecord?.PRESERVATION_EVENTS || []),
            { 
              eventType: "USER_ANNOTATION", 
              timestamp: new Date().toISOString(), 
              agent: "HUMAN_USER", 
              outcome: "SUCCESS" as const
            }
          ]
        }
      };
      onSave(updatedAsset);
      onClose();
    } catch (err) {
      console.error("Failed to save annotations:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Tag className="text-primary-500" size={20} />
              Edit Annotations
            </h3>
            <p className="text-xs text-slate-500 mt-1 font-mono">Asset ID: {asset.id}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex gap-6">
            <div className="w-1/3">
              <img src={asset.imageUrl} className="w-full aspect-square object-cover rounded-lg border border-slate-800 shadow-inner" alt="Preview" />
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-[10px] text-amber-500 font-bold uppercase flex items-center gap-1 mb-1">
                  <AlertCircle size={10} /> User Override
                </p>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Manual changes will be flagged in the global corpus as user-verified data.
                </p>
              </div>
            </div>

            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 ml-1">Document Title</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                  <input 
                    type="text" 
                    name="DOCUMENT_TITLE"
                    value={formData.DOCUMENT_TITLE || ''}
                    onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:border-primary-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 ml-1">Description</label>
                <textarea 
                  name="DOCUMENT_DESCRIPTION"
                  value={formData.DOCUMENT_DESCRIPTION || ''}
                  onChange={handleChange}
                  rows={4}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-sm text-white focus:border-primary-500 outline-none transition-all resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 ml-1">NLP Category</label>
                  <input 
                    type="text" 
                    name="NLP_NODE_CATEGORIZATION"
                    value={formData.NLP_NODE_CATEGORIZATION || ''}
                    onChange={handleChange}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-sm text-white focus:border-primary-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 ml-1">GIS Zone</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={14} />
                    <input 
                      type="text" 
                      name="LOCAL_GIS_ZONE"
                      value={formData.LOCAL_GIS_ZONE || ''}
                      onChange={handleChange}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 pl-10 pr-4 text-sm text-white focus:border-primary-500 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 ml-1">Rights Statement</label>
                <select 
                  name="RIGHTS_STATEMENT"
                  value={formData.RIGHTS_STATEMENT || ''}
                  onChange={handleChange}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2 px-3 text-sm text-white focus:border-primary-500 outline-none transition-all"
                >
                  <option value="Public Domain">Public Domain</option>
                  <option value="Copyrighted">Copyrighted</option>
                  <option value="Fair Use">Fair Use</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-800 bg-slate-950/50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-lg flex items-center gap-2 transition-all active:scale-95"
          >
            {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full" /> : <Save size={18} />}
            Save & Resync
          </button>
        </div>
      </div>
    </div>
  );
}
