'use client';

import { useState, useEffect, useRef } from 'react';
import { Smartphone, Plus, Trash2, Clock, Wifi, Monitor, Copy, Check } from 'lucide-react';
import QRCode from 'qrcode';

export type DeviceType = 'WEB' | 'MOBILE' | 'DESKTOP';

export interface Device {
  id: string;
  name: string;
  type: DeviceType;
  lastSeen: Date;
}

interface DevicesManagerProps {
  devices: Device[];
  currentDeviceId?: string;
  onRevoke: (deviceId: string) => Promise<void>;
  onLinkNew: () => Promise<{ linkingSecret: string; expiresAt: Date }>;
}

export function DevicesManager({
  devices,
  currentDeviceId,
  onRevoke,
  onLinkNew,
}: DevicesManagerProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingData, setLinkingData] = useState<{ secret: string; expiresAt: Date } | null>(null);

  // Get device icon based on type
  const getDeviceIcon = (type: DeviceType) => {
    switch (type) {
      case 'WEB':
        return Monitor;
      case 'MOBILE':
        return Smartphone;
      case 'DESKTOP':
        return Monitor;
      default:
        return Smartphone;
    }
  };

  // Get device label
  const getDeviceLabel = (type: DeviceType) => {
    switch (type) {
      case 'WEB':
        return 'Web';
      case 'MOBILE':
        return 'Mobile';
      case 'DESKTOP':
        return 'Desktop';
      default:
        return type;
    }
  };

  // Initiate linking
  const handleLinkNew = async () => {
    try {
      setLoading('linking');
      const { linkingSecret, expiresAt } = await onLinkNew();
      setLinkingData({ secret: linkingSecret, expiresAt });
      setShowLinkModal(true);
    } catch (error) {
      console.error('[DevicesManager] Failed to initiate linking:', error);
    } finally {
      setLoading(null);
    }
  };

  // Revoke device
  const handleRevoke = async (deviceId: string, deviceName: string) => {
    if (!confirm(`Êtes-vous sûr de vouloir révoquer "${deviceName}" ?`)) {
      return;
    }

    try {
      setLoading(deviceId);
      await onRevoke(deviceId);
    } catch (error) {
      console.error('[DevicesManager] Failed to revoke device:', error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Smartphone className="w-5 h-5" />
          Mes appareils
        </h3>
        <button
          onClick={handleLinkNew}
          disabled={loading === 'linking'}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Lier un appareil
        </button>
      </div>

      {/* Devices list */}
      <div className="space-y-2">
        {devices.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            Aucun appareil trouvé
          </p>
        ) : (
          devices.map((device) => {
            const DeviceIcon = getDeviceIcon(device.type);
            const isCurrentDevice = device.id === currentDeviceId;

            return (
              <div
                key={device.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="flex items-center gap-3 flex-1">
                  <DeviceIcon className="w-6 h-6 text-blue-600" />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{device.name}</span>
                      {isCurrentDevice && (
                        <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400 px-2 py-0.5 rounded">
                          Cet appareil
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                      <Clock className="w-3 h-3" />
                      Vu il y a {formatLastSeen(device.lastSeen)}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {!isCurrentDevice && (
                  <button
                    onClick={() => handleRevoke(device.id, device.name)}
                    disabled={loading === device.id}
                    className="p-2 ml-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                    title="Révoquer cet appareil"
                  >
                    {loading === device.id ? (
                      <div className="w-4 h-4 border-2 border-red-300 border-t-red-600 rounded-full animate-spin"></div>
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Linking Modal */}
      {showLinkModal && linkingData && (
        <LinkingModal
          linkingSecret={linkingData.secret}
          expiresAt={linkingData.expiresAt}
          onClose={() => {
            setShowLinkModal(false);
            setLinkingData(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Format last seen time
 */
function formatLastSeen(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (hours === 0) return 'quelques minutes';
  if (hours === 1) return '1 heure';
  if (hours < 24) return `${hours} heures`;
  if (days === 1) return '1 jour';
  return `${days} jours`;
}

/**
 * Linking Modal Component - Shows QR code for new device to scan
 */
interface LinkingModalProps {
  linkingSecret: string;
  expiresAt: Date;
  onClose: () => void;
}

function LinkingModal({ linkingSecret, expiresAt, onClose }: LinkingModalProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const diff = expiresAt.getTime() - now.getTime();
      setTimeLeft(Math.max(0, Math.ceil(diff / 1000)));
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  // Generate QR Code
  useEffect(() => {
    const generateQRCode = async () => {
      try {
        const qrData = {
          secret: linkingSecret,
          userId: 'current-user-id', // Will be replaced by actual userId
          timestamp: new Date().toISOString(),
        };

        const qrString = JSON.stringify(qrData);
        
        // Generate QR code as data URL
        const url = await QRCode.toDataURL(qrString, {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        });

        setQrCodeUrl(url);

        // Also render to canvas if needed
        if (canvasRef.current) {
          await QRCode.toCanvas(canvasRef.current, qrString, {
            errorCorrectionLevel: 'H',
            width: 300,
            margin: 2,
          });
        }
      } catch (error) {
        console.error('[LinkingModal] Failed to generate QR code:', error);
      }
    };

    generateQRCode();
  }, [linkingSecret]);

  // Copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(linkingSecret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('[LinkingModal] Failed to copy:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-white dark:bg-gray-900 rounded-lg shadow-2xl p-6">
        <h2 className="text-xl font-semibold mb-4 text-center">
          Lier un nouvel appareil
        </h2>

        {/* QR Code Display */}
        <div className="flex justify-center mb-4">
          {qrCodeUrl ? (
            <div className="relative">
              <img
                src={qrCodeUrl}
                alt="QR Code for device linking"
                className="w-64 h-64 border-2 border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-white"
              />
              <div className="absolute -top-2 -right-2 bg-green-500 text-white px-2 py-1 text-xs rounded-full">
                Prêt
              </div>
            </div>
          ) : (
            <div className="w-64 h-64 bg-gray-100 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">Génération du QR code...</p>
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mb-4">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            📱 Scannez ce code QR depuis votre nouvel appareil pour le lier à votre compte.
          </p>
        </div>

        {/* Secret for manual entry */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            Ou entrez manuellement :
          </label>
          <div className="flex gap-2">
            <code className="flex-1 px-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded font-mono text-xs break-all text-gray-900 dark:text-gray-100">
              {linkingSecret}
            </code>
            <button
              onClick={handleCopy}
              className="px-3 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded transition-colors flex items-center gap-1"
              title="Copier le code"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-600" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Expiration timer */}
        <div className="text-center mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Code expire dans : 
            <span className={`font-semibold ml-1 ${timeLeft < 60 ? 'text-red-600' : 'text-green-600'}`}>
              {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
            </span>
          </p>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 font-medium transition-colors"
        >
          Fermer
        </button>

        {/* Canvas for fallback (hidden) */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
