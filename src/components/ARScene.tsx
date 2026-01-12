import React, { useEffect, useRef, useState } from 'react';
import { Camera, Zap, ScanLine, MapPin, ArrowRight, Layers, WifiOff, ZoomIn, ZoomOut } from 'lucide-react';
import ARSafetyWarning from './ARSafetyWarning';

interface ARSceneProps {
  onCapture: (file: File) => void;
  onFinishSession?: () => void;
  sessionCount: number;
  isOnline?: boolean;
  zoomEnabled?: boolean;
}

export default function ARScene({ onCapture, onFinishSession, sessionCount, isOnline = true, zoomEnabled = true }: ARSceneProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [flash, setFlash] = useState(false);
  const [scanning, setScanning] = useState(true);
  const [simulatedNodes, setSimulatedNodes] = useState<{id: number, x: number, y: number, label: string}[]>([]);
  const [zoom, setZoom] = useState(1);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1, step: 0.1 });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [showSafetyWarning, setShowSafetyWarning] = useState(true);

  useEffect(() => {
    if (showSafetyWarning) return;

    // 1. Request camera + AR session
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    }).then(newStream => {
      setStream(newStream);
      
      const track = newStream.getVideoTracks()[0];
      const caps = track.getCapabilities() as any;
      if (caps.zoom) {
          setZoomSupported(true);
          setZoomRange({
              min: caps.zoom.min,
              max: caps.zoom.max,
              step: caps.zoom.step
          });
          setZoom(caps.zoom.min);
      }

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
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
        // We'll handle cleanup in a separate effect or just here if we don't depend on stream
    };
  }, [showSafetyWarning]);

  useEffect(() => {
    return () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
    };
  }, [stream]);

  useEffect(() => {
      if (stream && zoomSupported) {
          const track = stream.getVideoTracks()[0];
          if (track) {
              track.applyConstraints({
                  advanced: [{ zoom: zoom }]
              } as any).catch(err => console.error("Failed to apply zoom in AR", err));
          }
      }
  }, [zoom, stream, zoomSupported]);

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
      {showSafetyWarning && <ARSafetyWarning onAccept={() => setShowSafetyWarning(false)} />}
      
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
             {isOnline ? 'Analyzing environment for nodes... Tap shutter to capture.' : 'Offline Mode: Captures will be processed when online.'}
         </p>
         {!isOnline && (
             <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-red-400 text-[10px] font-bold uppercase tracking-wider">
                 <WifiOff size={10} /> Offline Capture Enabled
             </div>
         )}
      </div>

      {/* Session Counter & Process Button */}
      <div className="absolute top-6 right-6 z-20 flex flex-col gap-3 items-end">
          <div className="bg-primary-600/90 text-white px-4 py-2 rounded-full font-mono text-sm border border-primary-400/50 shadow-lg flex items-center gap-2 pointer-events-none">
              <Zap size={14} className="text-yellow-300" />
              <span>Collected: {sessionCount}</span>
          </div>
          
          {sessionCount > 0 && onFinishSession && (
              <button 
                onClick={onFinishSession}
                className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-full font-bold text-sm shadow-xl flex items-center gap-2 animate-in slide-in-from-right-10 transition-transform active:scale-95"
              >
                 <span>Process {sessionCount} Captures</span>
                 <ArrowRight size={16} />
              </button>
          )}
      </div>

      {/* Zoom Controls Overlay */}
      {zoomSupported && zoomEnabled && (
        <div className="absolute bottom-44 left-1/2 -translate-x-1/2 w-64 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full flex items-center gap-3 z-20">
            <ZoomOut size={16} className="text-white opacity-60" />
            <input 
              type="range"
              min={zoomRange.min}
              max={zoomRange.max}
              step={zoomRange.step}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-primary-500 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
              aria-label="AR Zoom"
            />
            <ZoomIn size={16} className="text-white opacity-60" />
            <span className="text-white text-[10px] font-mono w-6">{zoom.toFixed(1)}x</span>
        </div>
      )}

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