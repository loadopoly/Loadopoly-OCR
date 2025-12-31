import React, { useRef, useState } from 'react';
import { Camera, FolderOpen, Upload, X } from 'lucide-react';
import { announce } from '../lib/accessibility';

interface BatchImporterProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing?: boolean;
}

export default function BatchImporter({ onFilesSelected, isProcessing }: BatchImporterProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);

  // 1. Live Camera Capture
  const startCamera = async () => {
    try {
      announce('Opening camera.');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setIsCameraOpen(true);
      
      // Allow DOM to update before attaching stream
      setTimeout(() => {
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err) {
      console.error(err);
      alert('Camera access denied or unavailable');
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    canvas.toBlob(blob => {
      if (blob) {
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        announce('Photo captured.');
        onFilesSelected([file]);
        stopCamera();
      }
    }, 'image/jpeg', 0.95);
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsCameraOpen(false);
    announce('Camera closed.');
  };

  // 2. Handle file/folder selection
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(file =>
      file.type.startsWith('image/') || file.name.match(/\.(jpe?g|png|webp|heic)$/i)
    );
    if (imageFiles.length > 0) {
      announce(`${imageFiles.length} files selected for processing.`);
      onFilesSelected(imageFiles);
    } else {
        announce('No valid image files selected.');
    }
    
    // Reset inputs
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  return (
    <div className="space-y-4 w-full">
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 mb-4">
          <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
              <FolderOpen size={16} className="text-primary-500" />
              Pro Tip: Batch Ingestion
          </h4>
          <p className="text-xs text-slate-400 leading-relaxed">
              You can select multiple files or an entire folder. For best results with Gemini OCR, ensure documents are flat and well-lit.
          </p>
      </div>

      {/* Live Camera Button */}
      <button
        onClick={startCamera}
        disabled={isProcessing}
        aria-label="Take Photo with Camera"
        className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-medium shadow-lg disabled:opacity-50 transition-all active:scale-[0.98]"
      >
        <Camera size={24} aria-hidden="true" />
        Take Photo with Camera
      </button>

      {/* Camera Preview Modal */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-label="Camera">
          <button onClick={stopCamera} aria-label="Close Camera" className="absolute top-4 right-4 z-10 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md">
            <X size={24} aria-hidden="true" />
          </button>
          <div className="flex-1 flex items-center justify-center overflow-hidden">
             <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
          </div>
          <div className="p-8 flex justify-center bg-black/50 backdrop-blur-sm absolute bottom-0 left-0 right-0">
             <button
                onClick={capturePhoto}
                aria-label="Capture Photo"
                className="w-20 h-20 bg-white rounded-full shadow-[0_0_20px_rgba(255,255,255,0.5)] border-4 border-slate-200 active:scale-90 transition-transform"
                title="Capture"
             />
          </div>
        </div>
      )}

      <div className="w-full">
        {/* Single Upload Button for Files & Folders */}
        <label 
            className="flex flex-col items-center justify-center gap-4 px-6 py-12 bg-slate-800/50 hover:bg-slate-700/50 rounded-xl border-2 border-dashed border-primary-500/50 hover:border-primary-500 cursor-pointer transition-all group"
            role="button"
            aria-label="Upload documents or folders"
            tabIndex={0}
            onKeyDown={(e) => { if(e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        >
          <div className="p-4 bg-primary-500/10 rounded-full group-hover:scale-110 transition-transform">
            <Upload size={40} className="text-primary-400 group-hover:text-primary-300" aria-hidden="true" />
          </div>
          <div className="text-center">
            <span className="text-lg font-bold text-white block">Upload Documents</span>
            <span className="text-sm text-slate-400">Select files or an entire folder for LLM categorization</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            // @ts-ignore
            webkitdirectory=""
            // @ts-ignore
            directory=""
            accept="image/*,.heic,.heif,application/pdf"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            tabIndex={-1}
          />
        </label>
      </div>

      <p className="text-xs text-slate-500 text-center">
        Works on iOS, Android, Desktop & PWA. <br/>Supports recursive folder structures.
      </p>
    </div>
  );
}