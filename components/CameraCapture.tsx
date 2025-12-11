import React, { useRef, useState, useEffect } from 'react';
import { Camera, X, Circle, RefreshCw, Smartphone } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
}

export default function CameraCapture({ onCapture }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const startCamera = async () => {
    setIsOpen(true);
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
  };

  const switchCamera = async () => {
      const newMode = facingMode === 'environment' ? 'user' : 'environment';
      setFacingMode(newMode);
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
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-all"
        >
            <Camera size={18} />
            <span className="hidden md:inline">Instant Capture</span>
        </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="p-4 flex justify-between items-center bg-black/50 absolute top-0 left-0 right-0 z-10">
         <div className="text-white font-bold flex items-center gap-2">
             <Smartphone size={20} /> Camera Mode
         </div>
         <button onClick={stopCamera} className="p-2 bg-white/10 rounded-full text-white hover:bg-white/20">
             <X size={24} />
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

      {/* Controls */}
      <div className="h-32 bg-slate-900 flex items-center justify-around pb-6 pt-4">
          <button onClick={switchCamera} className="p-4 rounded-full bg-slate-800 text-white hover:bg-slate-700">
             <RefreshCw size={24} />
          </button>
          
          <button 
            onClick={takePhoto}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/10 active:scale-95 transition-transform"
          >
              <div className="w-16 h-16 bg-white rounded-full"></div>
          </button>
          
          <div className="w-12"></div> {/* Spacer for alignment */}
      </div>
    </div>
  );
}