import React, { useEffect, useRef } from 'react';

export default function ARScene({ onFrame }: { onFrame: (imageBitmap: ImageBitmap) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // 1. Request camera + AR session (works on Ray-Ban Meta, Quest, Vision Pro, Android)
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: 1280, height: 720 }
    }).then(stream => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    }).catch(err => {
        console.error("Camera access denied or failed:", err);
    });

    // 2. Every frame → send to Gemini for real-time OCR + bundling
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1280; 
    canvas.height = 720;

    let animationFrameId: number;

    const sendFrame = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA && ctx) {
        ctx.drawImage(videoRef.current, 0, 0, 1280, 720);
        // Create bitmap and send up
        createImageBitmap(canvas).then(bitmap => {
            onFrame(bitmap);
        });
      }
      animationFrameId = requestAnimationFrame(sendFrame);
    };
    
    // Start loop
    sendFrame();

    return () => {
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
    };
  }, [onFrame]);

  return (
    <div className="relative w-full h-full bg-black">
      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
      <div className="absolute top-0 left-0 right-0 p-8 text-center bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
         <p className="text-xl font-bold text-white drop-shadow-md">AR Mode Active</p>
         <p className="text-sm text-slate-300">Point at historical markers or documents</p>
      </div>
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white text-center pointer-events-none">
         <div className="w-16 h-16 border-2 border-white/50 rounded-full animate-pulse flex items-center justify-center">
            <div className="w-12 h-12 bg-white/20 rounded-full"></div>
         </div>
         <p className="mt-2 text-sm font-mono text-emerald-400">SCANNING...</p>
      </div>
      <div className="absolute inset-0 border-[30px] border-white/5 pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-48 border-2 border-primary-500/50 rounded-lg pointer-events-none">
         <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-primary-500"></div>
         <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-primary-500"></div>
         <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-primary-500"></div>
         <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-primary-500"></div>
      </div>
    </div>
  );
}