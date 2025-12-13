import React, { useEffect, useRef, useState } from 'react';
import { Camera, Zap, ScanLine, MapPin } from 'lucide-react';

interface ARSceneProps {
  onCapture: (file: File) => void;
  sessionCount: number;
}

export default function ARScene({ onCapture, sessionCount }: ARSceneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [flash, setFlash] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [simulatedNodes, setSimulatedNodes] = useState<{id: number, x: number, y: number, label: string}[]>([]);

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

    // Simulate finding AR nodes nearby
    const interval = setInterval(() => {
        if(Math.random() > 0.7) {
            setSimulatedNodes(prev => [
                ...prev.slice(-4), // Keep last 4
                {
                    id: Date.now(),
                    x: Math.random() * 80 + 10, // 10-90%
                    y: Math.random() * 80 + 10,
                    label: Math.random() > 0.5 ? "Data Point" : "Artifact"
                }
            ]);
        }
    }, 2000);

    return () => {
        clearInterval(interval);
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
    <div className="relative w-full h-full bg-black overflow-hidden">
      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
      
      {/* Flash Overlay */}
      <div className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-150 ${flash ? 'opacity-50' : 'opacity-0'}`}></div>

      {/* AR Overlays (Simulated) */}
      {simulatedNodes.map(node => (
          <div 
            key={node.id}
            className="absolute flex flex-col items-center animate-in zoom-in duration-500"
            style={{ top: `${node.y}%`, left: `${node.x}%` }}
          >
             <div className="w-4 h-4 border-2 border-emerald-400 rounded-full animate-ping absolute"></div>
             <div className="w-2 h-2 bg-emerald-500 rounded-full mb-1"></div>
             <div className="bg-black/50 text-emerald-300 text-[10px] px-2 py-0.5 rounded backdrop-blur-sm border border-emerald-500/30">
                 {node.label}
             </div>
          </div>
      ))}

      {/* Scanning Grid Animation */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(0,255,100,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,100,0.1)_1px,transparent_1px)] bg-[size:50px_50px]"></div>
      <div className="absolute inset-0 pointer-events-none opacity-10 animate-pulse bg-gradient-to-b from-transparent via-emerald-500/10 to-transparent"></div>

      <div className="absolute top-0 left-0 right-0 p-8 text-center bg-gradient-to-b from-black/80 to-transparent pointer-events-none z-10">
         <p className="text-xl font-bold text-white drop-shadow-md flex items-center justify-center gap-2">
            <ScanLine className="animate-pulse text-emerald-400" /> AR Scanner Active
         </p>
         <p className="text-sm text-slate-300 mt-1">
             Analyzing environment for nodes... Tap shutter to capture.
         </p>
      </div>

      {/* Session Counter Badge */}
      <div className="absolute top-6 right-6 pointer-events-none z-10">
          <div className="bg-primary-600/90 text-white px-4 py-2 rounded-full font-mono text-sm border border-primary-400/50 shadow-lg flex items-center gap-2">
              <Zap size={14} className="text-yellow-300" />
              <span>Collected: {sessionCount}</span>
          </div>
      </div>

      {/* Shutter Controls */}
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center pb-8 z-10">
         <button 
            onClick={handleCapture}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/10 active:scale-95 transition-transform hover:bg-white/20 shadow-[0_0_20px_rgba(255,255,255,0.3)] group"
            aria-label="Capture AR Photo"
         >
            <div className="w-16 h-16 bg-white rounded-full group-hover:scale-90 transition-transform"></div>
         </button>
      </div>
      
      {/* Target Reticle */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-48 border border-white/20 rounded-lg pointer-events-none">
         <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-primary-500"></div>
         <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-primary-500"></div>
         <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-primary-500"></div>
         <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-primary-500"></div>
         <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-primary-500/50 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
      </div>
    </div>
  );
}