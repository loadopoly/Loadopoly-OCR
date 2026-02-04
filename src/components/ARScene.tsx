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
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [zoomWarning, setZoomWarning] = useState<string | null>(null);
  const [isHighRes, setIsHighRes] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchActive, setTorchActive] = useState(false);

  useEffect(() => {
    if (showSafetyWarning) return;

    // Check for secure context (required for getUserMedia)
    if (!window.isSecureContext) {
      setCameraError('Camera requires HTTPS. Please access this page over a secure connection.');
      return;
    }

    // Check if getUserMedia is available
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera API not available in this browser.');
      return;
    }

    // 1. Request camera + AR session with high-res constraints for Pro hardware
    navigator.mediaDevices.getUserMedia({
      video: { 
        facingMode: 'environment', 
        width: { ideal: 3840, max: 7680 }, 
        height: { ideal: 2160, max: 4320 },
        frameRate: { ideal: 60 }
      }
    }).then(newStream => {
      setStream(newStream);
      setCameraError(null);
      
      const track = newStream.getVideoTracks()[0];
      const caps = track.getCapabilities() as any;
      const settings = track.getSettings();

      // Check for High Resolution (4K or higher)
      if (settings.width && settings.width >= 3840) {
        setIsHighRes(true);
      }

      // Hardware features for Pixel 10 Pro / High-end devices
      const advancedConstraints: any = {};
      
      if (caps.focusMode?.includes('continuous')) advancedConstraints.focusMode = 'continuous';
      if (caps.whiteBalanceMode?.includes('continuous')) advancedConstraints.whiteBalanceMode = 'continuous';
      if (caps.exposureMode?.includes('continuous')) advancedConstraints.exposureMode = 'continuous';
      
      if (caps.zoom) {
          setZoomSupported(true);
          setZoomRange({
              min: caps.zoom.min,
              max: caps.zoom.max,
              step: caps.zoom.step
          });
          setZoom(settings.zoom || caps.zoom.min);
      }

      if (caps.torch) {
          setTorchSupported(true);
      }

      // Apply hardware optimizations if available
      if (Object.keys(advancedConstraints).length > 0) {
          track.applyConstraints({ advanced: [advancedConstraints] } as any)
            .catch(e => console.warn("[ARScene] Hardware optimization constraints failed:", e));
      }

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play();
      }
    }).catch(err => {
        console.error("Camera access denied or failed:", err);
        if (err.name === 'NotAllowedError') {
          setCameraError('Camera access denied. Please allow camera permissions in your browser settings.');
        } else if (err.name === 'NotFoundError') {
          setCameraError('No camera found. Please connect a camera and try again.');
        } else if (err.name === 'NotReadableError') {
          setCameraError('Camera is in use by another application. Please close other apps using the camera.');
        } else {
          setCameraError(`Camera error: ${err.message || 'Unknown error'}`);
        }
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
            // Explicitly stop all tracks to release camera
            stream.getTracks().forEach(track => {
                track.stop();
                console.log(`[ARScene] Stopped track: ${track.kind}`);
            });
        }
        // Clear video element to release resources
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        // Clear any warnings
        setCameraError(null);
        setZoomWarning(null);
    };
  }, [stream]);

  useEffect(() => {
      if (stream && zoomSupported) {
          const track = stream.getVideoTracks()[0];
          if (track) {
              track.applyConstraints({
                  advanced: [{ zoom: zoom }]
              } as any).catch(err => {
                  console.error("Failed to apply zoom in AR", err);
                  // Surface zoom failure to user with auto-dismiss
                  setZoomWarning("Zoom not supported on this device. Continuing without zoom.");
                  setTimeout(() => setZoomWarning(null), 5000);
              });
          }
      }
  }, [zoom, stream, zoomSupported]);

  useEffect(() => {
    if (stream && torchSupported) {
        const track = stream.getVideoTracks()[0];
        if (track) {
            track.applyConstraints({
                advanced: [{ torch: torchActive }]
            } as any).catch(err => console.error("Failed to toggle torch", err));
        }
    }
  }, [torchActive, stream, torchSupported]);

  const toggleTorch = () => {
      setTorchActive(prev => !prev);
  };

  const handleCapture = async () => {
      if (videoRef.current && stream) {
          // Visual Flash Effect
          setFlash(true);
          setTimeout(() => setFlash(false), 150);

          const track = stream.getVideoTracks()[0];
          
          // Use ImageCapture API if available for "Pro" quality (full sensor resolution)
          if ('ImageCapture' in window) {
              try {
                  const imageCapture = new (window as any).ImageCapture(track);
                  const blob = await imageCapture.takePhoto();
                  const file = new File([blob], `AR_Pro_Session_${Date.now()}.jpg`, { type: 'image/jpeg' });
                  onCapture(file);
                  return;
              } catch (err) {
                  console.warn("ImageCapture photo failed, falling back to canvas capture", err);
              }
          }

          // Fallback to highest quality Canvas capture
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
              }, 'image/jpeg', 0.98); // High quality JPEG
          }
      }
  };

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {showSafetyWarning && <ARSafetyWarning onAccept={() => setShowSafetyWarning(false)} />}
      
      {/* Zoom Warning Toast */}
      {zoomWarning && (
        <div className="absolute top-4 left-4 right-4 bg-yellow-500/90 backdrop-blur-sm text-white px-4 py-2 rounded-lg text-sm z-50 flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
          <ZoomOut size={16} />
          {zoomWarning}
        </div>
      )}
      
      {/* Camera Error Display */}
      {cameraError && !showSafetyWarning && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/95 z-50">
          <div className="text-center p-8 max-w-md">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <Camera className="w-8 h-8 text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Camera Unavailable</h3>
            <p className="text-slate-400 text-sm mb-4">{cameraError}</p>
            <button 
              onClick={() => {
                setCameraError(null);
                setShowSafetyWarning(true);
              }}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )}
      
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
            {isHighRes && (
              <span className="ml-2 px-2 py-0.5 bg-blue-500 rounded text-[10px] uppercase tracking-tighter shadow-lg animate-in zoom-in">Ultra 4K+</span>
            )}
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
                className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-3 rounded-full font-bold text-sm shadow-xl flex items-center gap-2 animate-in slide-in-from-right-10 transition-transform active:scale-95 pointer-events-auto"
              >
                 <span>Process {sessionCount} Captures</span>
                 <ArrowRight size={16} />
              </button>
          )}

          {torchSupported && (
              <button 
                onClick={toggleTorch}
                className={`p-3 rounded-full shadow-lg transition-all animate-in slide-in-from-right-5 pointer-events-auto ${torchActive ? 'bg-yellow-400 text-black' : 'bg-black/40 text-white border border-white/20 backdrop-blur-md'}`}
                title="Toggle Flash"
              >
                 <Zap size={20} className={torchActive ? 'fill-current' : ''} />
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