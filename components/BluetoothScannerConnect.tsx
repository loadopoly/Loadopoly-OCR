import React, { useState } from 'react';
import { Bluetooth, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';

export default function BluetoothScannerConnect() {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'connected'>('idle');
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const connect = async () => {
    setStatus('scanning');
    setError(null);
    try {
      // @ts-ignore - Web Bluetooth API type definition might be missing in some setups
      if (!navigator.bluetooth) {
        throw new Error("Web Bluetooth is not supported in this browser. Try Chrome or Edge.");
      }

      // @ts-ignore
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }], // Common scanner service UUID
        optionalServices: ['battery_service']
      });

      setDeviceName(device.name || 'Scanner');
      setStatus('connected');

      const server = await device.gatt?.connect();
      const service = await server?.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const char = await service?.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      if (char) {
        char.addEventListener('characteristicvaluechanged', (e: any) => {
          const blob = new Blob([e.target.value.buffer]);
          const file = new File([blob], `bt_scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
          // Dispatch global event for App.tsx to handle ingestion
          window.dispatchEvent(new CustomEvent('geograph-new-file', { detail: file }));
        });

        await char.startNotifications();
      }
    } catch (err: any) {
      console.error(err);
      setStatus('idle');
      setError(err.message || 'Bluetooth pairing failed');
    }
  };

  return (
    <div>
      {status === 'idle' && (
        <button 
          onClick={connect} 
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium"
        >
          <Bluetooth size={16} />
          Pair Bluetooth Scanner
        </button>
      )}
      
      {status === 'scanning' && (
        <div className="flex items-center gap-2 text-amber-400 text-sm">
           <RefreshCw size={16} className="animate-spin" />
           Scanning for devices...
        </div>
      )}

      {status === 'connected' && (
        <div className="flex items-center gap-2 text-emerald-400 text-sm">
           <CheckCircle size={16} />
           Connected to {deviceName}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-xs mt-2">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      
      <p className="text-[10px] text-slate-500 mt-2">
        Requires a BLE-enabled scanner advertising service UUID 0x18F0.
      </p>
    </div>
  );
}