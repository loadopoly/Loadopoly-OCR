import React, { useEffect, useRef, useState } from 'react';
import { Camera, Zap } from 'lucide-react';

interface ARSceneProps {
  onCapture: (file: File) => void;
  sessionCount: number;
}

export default function ARScene({ onCapture, sessionCount }: ARSceneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    // 1. Request camera + AR session
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    }).then(stream => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    }).catch(err => {
        console.error("Camera access denied or failed:", err);
    });

    return () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
    };
  }, []);

  const handleCapture = () => {
      if (videoRef.current) {
          // Visual Flash Effect
          setFlash(true);
          setTimeout(() => setFlash(false), 150);

          const canvas = document.createElement('canvas');
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
              ctx.drawImage(videoRef.current, 0, 0);
              canvas.toBlob((blob) => {
                  if (blob) {
                      const file = new File([blob], `AR_Session_${Date.now()}.jpg`, { type: 'image/jpeg' });
                      onCapture(file);
                  }
              }, 'image/jpeg', 0.95);
          }
      }
  };

  return (
    <div className="relative w-full h-full bg-black">
      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
      
      {/* Flash Overlay */}
      <div className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 ${flash ? 'opacity-50' : 'opacity-0'}`}></div>

      <div className="absolute top-0 left-0 right-0 p-8 text-center bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
         <p className="text-xl font-bold text-white drop-shadow-md">AR Session Active</p>
         <p className="text-sm text-slate-300">Tap shutter to collect artifacts. Bundling occurs on exit.</p>
      </div>

      {/* Session Counter Badge */}
      <div className="absolute top-6 right-6 pointer-events-none">
          <div className="bg-primary-600/90 text-white px-4 py-2 rounded-full font-mono text-sm border border-primary-400/50 shadow-lg flex items-center gap-2">
              <Zap size={14} className="text-yellow-300" />
              <span>Session: {sessionCount}</span>
          </div>
      </div>

      {/* Shutter Controls */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center pb-8">
         <button 
            onClick={handleCapture}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/10 active:scale-95 transition-transform hover:bg-white/20 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
            aria-label="Capture AR Photo"
         >
            <div className="w-16 h-16 bg-white rounded-full"></div>
         </button>
      </div>
      
      {/* Target Reticle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-48 border-2 border-primary-500/30 rounded-lg pointer-events-none">
         <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-primary-500"></div>
         <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary-500"></div>
         <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary-500"></div>
         <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-primary-500"></div>
      </div>
    </div>
  );
}