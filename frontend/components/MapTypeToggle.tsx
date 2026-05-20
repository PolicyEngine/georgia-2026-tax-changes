'use client';

// The South Carolina 2026 tax changes dashboard uses an SC-only card grid, so a
// geographic/hex map-type toggle is no longer meaningful. This stub is kept
// only to preserve the import path used by legacy callers; it renders nothing.

interface Props {
  mapType?: 'geographic' | 'hex';
  onChange?: (type: 'geographic' | 'hex') => void;
}

export default function MapTypeToggle(_props: Props) {
  void _props;
  return null;
}
