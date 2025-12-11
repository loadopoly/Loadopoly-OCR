import React, { useRef } from 'react';
import { FolderInput, UploadCloud } from 'lucide-react';

interface FolderImporterProps {
  onImport: (files: File[]) => void;
  isProcessing: boolean;
}

export default function FolderImporter({ onImport, isProcessing }: FolderImporterProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList = Array.from(e.target.files);
      // Filter out system files if needed, or just pass all
      const validFiles = fileList.filter(f => f.name !== '.DS_Store' && f.type); 
      onImport(validFiles);
      
      // Reset input
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <button 
        onClick={() => inputRef.current?.click()}
        disabled={isProcessing}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-all disabled:opacity-50"
        title="Import entire folder structure"
      >
        <FolderInput size={18} className="text-amber-500" />
        <span className="hidden md:inline">Batch Folder</span>
      </button>
      
      <input
        type="file"
        ref={inputRef}
        className="hidden"
        // @ts-ignore - webkitdirectory is standard in modern browsers but missing in some TS defs
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleChange}
      />
    </>
  );
}