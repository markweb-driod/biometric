import { useState, useEffect, useCallback } from 'react';

export interface MediaDeviceInfo {
  deviceId: string;
  label: string;
}

interface DeviceSelectorProps {
  kind: 'videoinput' | 'audioinput';
  selectedDeviceId: string;
  onSelect: (deviceId: string) => void;
  disabled?: boolean;
}

export function DeviceSelector({
  kind,
  selectedDeviceId,
  onSelect,
  disabled,
}: DeviceSelectorProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const filtered = all
        .filter((d) => d.kind === kind && d.deviceId)
        .map((d, i) => ({
          deviceId: d.deviceId,
          label:
            d.label ||
            `${kind === 'videoinput' ? 'Camera' : 'Input'} ${i + 1}`,
        }));
      setDevices(filtered);
    } catch {
      setDevices([]);
    }
  }, [kind]);

  useEffect(() => {
    refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () =>
      navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [refresh]);

  // Auto-select the first available device when nothing is selected yet.
  useEffect(() => {
    if (!selectedDeviceId && devices.length > 0 && devices[0].deviceId) {
      onSelect(devices[0].deviceId);
    }
  }, [devices, selectedDeviceId, onSelect]);

  const selected = devices.find((d) => d.deviceId === selectedDeviceId);
  // Before camera permission is granted, enumerateDevices() returns no entries.
  // Show a helpful default label rather than "No devices found" which looks like a failure.
  const label =
    selected?.label ??
    (devices.length > 0
      ? 'Select device…'
      : 'Default camera');

  const icon =
    kind === 'videoinput' ? <CameraIcon /> : <FingerprintDeviceIcon />;

  return (
    <div className={`device-selector ${open ? 'device-selector--open' : ''}`}>
      <button
        type="button"
        className="device-selector-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
      >
        <span className="device-selector-icon">{icon}</span>
        <span className="device-selector-label">{label}</span>
        <ChevronIcon />
      </button>

      {open && devices.length > 0 && (
        <ul className="device-selector-menu">
          {devices.map((d) => (
            <li key={d.deviceId}>
              <button
                type="button"
                className={`device-selector-option ${
                  d.deviceId === selectedDeviceId
                    ? 'device-selector-option--active'
                    : ''
                }`}
                onClick={() => {
                  onSelect(d.deviceId);
                  setOpen(false);
                }}
              >
                {d.deviceId === selectedDeviceId && <CheckIcon />}
                <span>{d.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && <div className="device-selector-backdrop" onClick={() => setOpen(false)} />}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function FingerprintDeviceIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M12 10a2 2 0 00-2 2c0 .7-.07 1.6-.18 2.5" />
      <path d="M14 12.5c0 1.2 0 3-.5 4.5" />
      <path d="M9.5 11a4 4 0 017 2.5" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="device-selector-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
