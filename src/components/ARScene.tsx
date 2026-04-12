import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Zap, ScanLine, MapPin, ArrowRight, Layers, WifiOff, ZoomIn, ZoomOut, CameraOff, Bluetooth, Timer, Glasses, Volume2, VolumeX, Eye } from 'lucide-react';
import ARSafetyWarning from './ARSafetyWarning';

// Web Bluetooth API type shims (not in default TS lib)
declare global {
  interface Navigator {
    bluetooth?: {
      requestDevice(options: any): Promise<any>;
    };
  }
}

interface ARSceneProps {
  onCapture: (file: File) => void;
  onFinishSession?: () => void;
  sessionCount: number;
  isOnline?: boolean;
  zoomEnabled?: boolean;
}

/** Supported BLE AR glasses service UUID (common across Xreal/RayNeo/Vuzix HID profile) */
const AR_GLASSES_SERVICE_UUID = '000018f0-0000-1000-8000-00805f9b34fb';
const AR_GLASSES_CHAR_UUID = '00002af1-0000-1000-8000-00805f9b34fb';

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

  // BLE AR Glasses state
  const [bleDevice, setBleDevice] = useState<any>(null);
  const [bleStatus, setBleStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [bleDeviceName, setBleDeviceName] = useState('');

  // Auto-capture mode (hands-free for field work)
  const [autoCaptureEnabled, setAutoCaptureEnabled] = useState(false);
  const [autoCaptureInterval, setAutoCaptureInterval] = useState(5); // seconds
  const autoCaptureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoCaptureCountdown, setAutoCaptureCountdown] = useState(0);

  // Audio feedback for hands-free use (glasses users can't see the screen)
  const [audioFeedback, setAudioFeedback] = useState(true);

  // Document detection hint (movement stabilization)
  const [isStable, setIsStable] = useState(true);
  const lastCaptureTimeRef = useRef(0);

  // GPS tracking for field sessions
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [captureLocations, setCaptureLocations] = useState<Array<{ lat: number; lng: number; timestamp: number }>>([]);

  // Ref tracks the stream independently so cleanup works even if unmount
  // races with the getUserMedia promise resolution.
  const streamRef = useRef<MediaStream | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    if (showSafetyWarning) return;
    unmountedRef.current = false;

    // 1. Request camera + AR session
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    }).then(newStream => {
      // If component unmounted while we were awaiting permission, stop immediately
      if (unmountedRef.current) {
        newStream.getTracks().forEach(track => track.stop());
        return;
      }
      streamRef.current = newStream;
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
        if (unmountedRef.current) return;
        console.error("Camera access denied or failed:", err);
        const name = (err as DOMException)?.name;
        if (name === 'NotAllowedError') {
          setCameraError('Camera permission was denied. Please allow camera access in your browser settings and reload.');
        } else if (name === 'NotFoundError') {
          setCameraError('No camera found on this device.');
        } else if (name === 'NotReadableError') {
          setCameraError('Camera is in use by another application.');
        } else {
          setCameraError(`Camera could not be started: ${(err as Error).message || 'Unknown error'}`);
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
        unmountedRef.current = true;
        clearInterval(interval);
        // Stop stream via ref (handles race where stream resolved after unmount)
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
    };
  }, [showSafetyWarning]);

  // Sync ref when stream state changes (for zoom/other effects)
  useEffect(() => {
    streamRef.current = stream;
  }, [stream]);

  // Handle app background/resume: the OS kills camera tracks when the app is
  // hidden. On resume the video element shows a black frame (looks like a blank
  // screen). We stop the dead stream on hide and reinitialise it on resume.
  useEffect(() => {
    if (showSafetyWarning) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        // Proactively release camera — the OS may have already killed it
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
          setStream(null);
        }
      } else if (document.visibilityState === 'visible') {
        // Reinitialise camera on resume
        if (unmountedRef.current) return;
        setCameraError(null);
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        }).then(newStream => {
          if (unmountedRef.current) { newStream.getTracks().forEach(t => t.stop()); return; }
          streamRef.current = newStream;
          setStream(newStream);
          const track = newStream.getVideoTracks()[0];
          const caps = track.getCapabilities() as any;
          if (caps.zoom) {
            setZoomSupported(true);
            setZoomRange({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step });
            setZoom(caps.zoom.min);
          }
          if (videoRef.current) {
            videoRef.current.srcObject = newStream;
            videoRef.current.play();
          }
        }).catch(err => {
          if (unmountedRef.current) return;
          setCameraError(`Camera could not restart: ${(err as Error).message || 'Unknown error'}`);
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [showSafetyWarning]);

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

  // --- GPS Tracking for field sessions ---
  useEffect(() => {
    if (showSafetyWarning) return;
    if (!navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!unmountedRef.current) {
          setCurrentLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        }
      },
      () => {}, // Silently ignore GPS errors
      { enableHighAccuracy: true, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [showSafetyWarning]);

  // --- BLE AR Glasses Connection ---
  const connectBleGlasses = useCallback(async () => {
    setBleStatus('connecting');
    try {
      if (!navigator.bluetooth) {
        throw new Error('Web Bluetooth not supported. Use Chrome or Edge.');
      }

      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ services: [AR_GLASSES_SERVICE_UUID] }],
        optionalServices: ['battery_service'],
      });

      setBleDeviceName(device.name || 'AR Glasses');
      setBleDevice(device);

      const server = await device.gatt?.connect();
      const service = await server?.getPrimaryService(AR_GLASSES_SERVICE_UUID);
      const char = await service?.getCharacteristic(AR_GLASSES_CHAR_UUID);

      if (char) {
        // Listen for BLE-triggered captures (hardware button press on glasses)  
        char.addEventListener('characteristicvaluechanged', (e: any) => {
          const value = new Uint8Array(e.target.value.buffer);
          
          // Check if this is a button-press signal (single byte > 0) or image data
          if (value.length <= 4) {
            // Button press — trigger capture from the phone's camera feed
            handleCapture();
            if (audioFeedback) playBeep('capture');
          } else {
            // Image data from glasses' built-in camera
            const blob = new Blob([value], { type: 'image/jpeg' });
            const file = new File([blob], `BLE_Glasses_${Date.now()}.jpg`, { type: 'image/jpeg' });
            onCapture(file);
            if (audioFeedback) playBeep('capture');
          }
        });

        await char.startNotifications();
      }

      setBleStatus('connected');
      if (audioFeedback) playBeep('connected');

      // Handle disconnection
      device.addEventListener('gattserverdisconnected', () => {
        if (!unmountedRef.current) {
          setBleStatus('disconnected');
          setBleDevice(null);
          if (audioFeedback) playBeep('disconnected');
        }
      });
    } catch (err: any) {
      console.error('BLE glasses connection failed:', err);
      setBleStatus('disconnected');
      setBleDevice(null);
    }
  }, [audioFeedback, onCapture]);

  // --- Audio feedback for hands-free use ---
  const playBeep = useCallback((type: 'capture' | 'connected' | 'disconnected' | 'autocapture') => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      switch (type) {
        case 'capture':
          osc.frequency.value = 880; // A5 — short high beep
          gain.gain.value = 0.15;
          osc.start();
          osc.stop(ctx.currentTime + 0.08);
          break;
        case 'connected':
          osc.frequency.value = 660; // ascending tone
          gain.gain.value = 0.1;
          osc.start();
          osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1);
          osc.stop(ctx.currentTime + 0.2);
          break;
        case 'disconnected':
          osc.frequency.value = 440;
          gain.gain.value = 0.1;
          osc.start();
          osc.frequency.setValueAtTime(330, ctx.currentTime + 0.1);
          osc.stop(ctx.currentTime + 0.2);
          break;
        case 'autocapture':
          osc.frequency.value = 1200; // quick tick
          gain.gain.value = 0.08;
          osc.start();
          osc.stop(ctx.currentTime + 0.04);
          break;
      }
    } catch {
      // Silently fail — audio is non-critical
    }
  }, []);

  // --- Auto-capture timer (hands-free field scanning) ---
  useEffect(() => {
    if (!autoCaptureEnabled || showSafetyWarning) {
      if (autoCaptureTimerRef.current) {
        clearInterval(autoCaptureTimerRef.current);
        autoCaptureTimerRef.current = null;
      }
      setAutoCaptureCountdown(0);
      return;
    }

    let countdown = autoCaptureInterval;
    setAutoCaptureCountdown(countdown);

    autoCaptureTimerRef.current = setInterval(() => {
      countdown--;
      setAutoCaptureCountdown(countdown);

      if (countdown <= 0) {
        handleCapture();
        if (audioFeedback) playBeep('autocapture');
        
        // Log GPS for this capture
        if (currentLocation) {
          setCaptureLocations(prev => [...prev, { ...currentLocation, timestamp: Date.now() }]);
        }

        countdown = autoCaptureInterval;
        setAutoCaptureCountdown(countdown);
      }
    }, 1000);

    return () => {
      if (autoCaptureTimerRef.current) {
        clearInterval(autoCaptureTimerRef.current);
        autoCaptureTimerRef.current = null;
      }
    };
  }, [autoCaptureEnabled, autoCaptureInterval, showSafetyWarning, audioFeedback, currentLocation]);

  // Cleanup BLE on unmount
  useEffect(() => {
    return () => {
      if (bleDevice?.gatt?.connected) {
        bleDevice.gatt.disconnect();
      }
    };
  }, [bleDevice]);

  const handleCapture = useCallback(() => {
      if (videoRef.current) {
          // Visual Flash Effect
          setFlash(true);
          setTimeout(() => setFlash(false), 150);
          if (audioFeedback) playBeep('capture');

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
                      lastCaptureTimeRef.current = Date.now();
                      
                      // Track GPS for this capture
                      if (currentLocation) {
                        setCaptureLocations(prev => [...prev, { ...currentLocation, timestamp: Date.now() }]);
                      }
                  }
              }, 'image/jpeg', 0.95);
          }
      }
  }, [onCapture, audioFeedback, playBeep, currentLocation]);

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      {showSafetyWarning && <ARSafetyWarning onAccept={() => setShowSafetyWarning(false)} />}
      
      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />

      {/* Camera Error State */}
      {cameraError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/95 z-30 p-8 text-center" role="alert">
          <CameraOff size={48} className="text-red-400 mb-4" />
          <p className="text-lg font-semibold text-white mb-2">Camera Unavailable</p>
          <p className="text-sm text-slate-400 max-w-sm mb-6">{cameraError}</p>
          <button
            onClick={() => { setCameraError(null); setShowSafetyWarning(true); }}
            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
      
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

      {/* === Field Tools Panel (left side) === */}
      <div className="absolute top-6 left-6 z-20 flex flex-col gap-2">
          {/* BLE AR Glasses Connection */}
          <button
            onClick={bleStatus === 'connected' ? () => { bleDevice?.gatt?.disconnect(); setBleStatus('disconnected'); } : connectBleGlasses}
            className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium backdrop-blur-md border shadow-lg transition-all ${
              bleStatus === 'connected'
                ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
                : bleStatus === 'connecting'
                  ? 'bg-amber-500/20 border-amber-400/40 text-amber-300 animate-pulse'
                  : 'bg-black/40 border-white/20 text-white/80 hover:bg-black/60'
            }`}
          >
            {bleStatus === 'connected' ? <Glasses size={14} /> : <Bluetooth size={14} />}
            {bleStatus === 'connected' ? bleDeviceName : bleStatus === 'connecting' ? 'Pairing...' : 'AR Glasses'}
          </button>

          {/* Auto-Capture Toggle */}
          <button
            onClick={() => setAutoCaptureEnabled(!autoCaptureEnabled)}
            className={`flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium backdrop-blur-md border shadow-lg transition-all ${
              autoCaptureEnabled
                ? 'bg-amber-500/20 border-amber-400/40 text-amber-300'
                : 'bg-black/40 border-white/20 text-white/80 hover:bg-black/60'
            }`}
          >
            <Timer size={14} />
            {autoCaptureEnabled ? `Auto: ${autoCaptureCountdown}s` : 'Auto-Capture'}
          </button>

          {/* Auto-capture interval selector (shown when enabled) */}
          {autoCaptureEnabled && (
            <div className="flex items-center gap-1 px-2 py-1 bg-black/40 backdrop-blur-md rounded-full border border-white/10">
              {[3, 5, 10, 15].map(sec => (
                <button
                  key={sec}
                  onClick={() => setAutoCaptureInterval(sec)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-colors ${
                    autoCaptureInterval === sec ? 'bg-amber-500/30 text-amber-300' : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {sec}s
                </button>
              ))}
            </div>
          )}

          {/* Audio Feedback Toggle */}
          <button
            onClick={() => setAudioFeedback(!audioFeedback)}
            className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium bg-black/40 backdrop-blur-md border border-white/20 text-white/80 hover:bg-black/60 shadow-lg transition-all"
          >
            {audioFeedback ? <Volume2 size={14} /> : <VolumeX size={14} />}
            {audioFeedback ? 'Audio On' : 'Audio Off'}
          </button>

          {/* GPS Location Indicator */}
          {currentLocation && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-[10px] text-white/60 font-mono pointer-events-none">
              <MapPin size={10} className="text-emerald-400" />
              {currentLocation.lat.toFixed(4)}, {currentLocation.lng.toFixed(4)}
            </div>
          )}

          {/* Capture Locations Count */}
          {captureLocations.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/40 backdrop-blur-md rounded-full border border-white/10 text-[10px] text-white/60 pointer-events-none">
              <Eye size={10} className="text-primary-400" />
              {captureLocations.length} GPS-tagged
            </div>
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
         {/* Auto-capture countdown ring */}
         {autoCaptureEnabled && (
           <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 bg-amber-500/20 backdrop-blur-md rounded-full border border-amber-400/30 text-amber-300 text-xs font-mono">
             <Timer size={12} />
             Next in {autoCaptureCountdown}s
           </div>
         )}
         <button 
            onClick={handleCapture}
            className={`w-20 h-20 rounded-full border-4 border-white flex items-center justify-center bg-white/10 active:scale-95 transition-transform hover:bg-white/20 shadow-[0_0_20px_rgba(255,255,255,0.3)] group ${autoCaptureEnabled ? 'ring-2 ring-amber-400/50 ring-offset-2 ring-offset-black/50' : ''}`}
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
