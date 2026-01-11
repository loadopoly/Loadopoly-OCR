import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, Circle, RefreshCw, Smartphone, WifiOff, ZoomIn, ZoomOut } from 'lucide-react';
import { announce } from '../lib/accessibility';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  isOnline?: boolean;
  zoomEnabled?: boolean;
}

export default function CameraCapture({ onCapture, isOnline = true, zoomEnabled = true }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [zoom, setZoom] = useState(1);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1, step: 0.1 });

  useEffect(() => {
    return () => {
      // Cleanup on unmount
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
        } as any).catch(err => console.error("Failed to apply zoom", err));
      }
    }
  }, [zoom, stream, zoomSupported]);

  const startCamera = async () => {
    setIsOpen(true);
    announce('Camera opened. Focus on the document or item.');
    try {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { 
            facingMode: facingMode,
            width: { ideal: 1920 },
            height: { ideal: 1080 }
        },
        audio: false
      });
      
      const videoTrack = newStream.getVideoTracks()[0];
      const capabilities = videoTrack.getCapabilities() as any;
      if (capabilities.zoom) {
          setZoomSupported(true);
          setZoomRange({
              min: capabilities.zoom.min,
              max: capabilities.zoom.max,
              step: capabilities.zoom.step
          });
          // Set to current zoom or default to min
          const currentZoom = (videoTrack.getConstraints() as any).zoom || capabilities.zoom.min;
          setZoom(currentZoom);
      } else {
          setZoomSupported(false);
      }

      setStream(newStream);
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
        videoRef.current.play();
      }
    } catch (err) {
      console.error("Camera failed", err);
      alert("Could not access camera. Please allow permissions.");
      setIsOpen(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsOpen(false);
    announce('Camera closed.');
  };

  const switchCamera = async () => {
      const newMode = facingMode === 'environment' ? 'user' : 'environment';
      setFacingMode(newMode);
      announce(`Switched to ${newMode === 'user' ? 'front' : 'back'} camera`);
      // Determine if we need to restart immediately
      if (isOpen) {
          // Small timeout to allow state to update
          setTimeout(() => {
             if(videoRef.current) {
                 // The useEffect dependency on facingMode isn't here, so we manually restart
                 // But actually, it's cleaner to just restart the stream flow
                 // Let's brute force restart:
                 if (stream) stream.getTracks().forEach(t => t.stop());
                 navigator.mediaDevices.getUserMedia({
                    video: { facingMode: newMode },
                    audio: false
                 }).then(s => {
                     const track = s.getVideoTracks()[0];
                     const caps = track.getCapabilities() as any;
                     if (caps.zoom) {
                        setZoomSupported(true);
                        setZoomRange({
                            min: caps.zoom.min,
                            max: caps.zoom.max,
                            step: caps.zoom.step
                        });
                        setZoom(caps.zoom.min);
                     } else {
                        setZoomSupported(false);
                     }
                     setStream(s);
                     if (videoRef.current) {
                        videoRef.current.srcObject = s;
                        videoRef.current.play();
                     }
                 });
             }
          }, 100);
      }
  };

  const takePhoto = () => {
    if (!videoRef.current) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
        if (facingMode === 'user') {
            // Mirror selfie
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(videoRef.current, 0, 0);
        
        canvas.toBlob(blob => {
            if (blob) {
                const file = new File([blob], `cam_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
                announce('Photo taken and processing.');
                onCapture(file);
                stopCamera();
            }
        }, 'image/jpeg', 0.9);
    }
  };

  if (!isOpen) {
    return (
        <button 
            onClick={startCamera}
            aria-label="Open camera to capture image"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-all"
        >
            <Camera size={18} aria-hidden="true" />
            <span className="hidden md:inline">Instant Capture</span>
        </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-modal="true" aria-label="Camera Interface">
      {/* Header */}
      <div className="p-4 flex justify-between items-center bg-black/50 absolute top-0 left-0 right-0 z-10">
         <div className="flex flex-col">
             <div className="text-white font-bold flex items-center gap-2">
                 <Smartphone size={20} aria-hidden="true" /> Camera Mode
             </div>
             {!isOnline && (
                 <div className="flex items-center gap-1 text-red-400 text-[10px] font-bold uppercase mt-0.5">
                     <WifiOff size={10} /> Offline Mode
                 </div>
             )}
         </div>
         <button onClick={stopCamera} aria-label="Close camera" className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20">
             <X size={24} aria-hidden="true" />
         </button>
      </div>

      {/* Video Preview */}
      <div className="flex-1 relative flex items-center justify-center bg-black">
         <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            className={`max-h-full max-w-full object-contain ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
         />
      </div>

      {/* Zoom Controls */}
      {zoomSupported && zoomEnabled && (
          <div className="px-8 py-4 bg-black/40 backdrop-blur-md flex items-center gap-4">
              <ZoomOut size={20} className="text-white opacity-60" />
              <input 
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step={zoomRange.step}
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="flex-1 accent-primary-500 h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer"
                aria-label="Camera Zoom"
              />
              <ZoomIn size={20} className="text-white opacity-60" />
              <span className="text-white text-xs font-mono w-8">{zoom.toFixed(1)}x</span>
          </div>
      )}

      {/* Controls */}
      <div className="h-32 bg-slate-900 flex items-center justify-around pb-6 pt-4">
          <button onClick={switchCamera} aria-label="Switch camera" className="p-4 rounded-full bg-slate-800 text-white hover:bg-slate-700">
             <RefreshCw size={24} aria-hidden="true" />
          </button>
          
          <button 
            onClick={takePhoto}
            aria-label="Take Photo"
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/10 active:scale-95 transition-transform"
          >
              <div className="w-16 h-16 bg-white rounded-full"></div>
          </button>
          
          <div className="w-12"></div> {/* Spacer for alignment */}
      </div>
    </div>
  );
}