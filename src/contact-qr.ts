import qrcode from 'qrcode-generator';

export type ContactQr = { value: string; size: number; bars: { x: number; y: number; width: number }[] };

// Input is the canonical saved contact from emergencyCallTarget, never a URL or dial code.
export function contactQrValue(number: string, consent: boolean): string | null {
  // Some scanners forward the literal URI scheme to the dialer (TEL becomes 835).
  // A number-only payload cannot introduce keypad letters; scanner Call/Copy UI varies.
  return consent && /^\+[1-9]\d{6,14}$/.test(number) ? number : null;
}

export function createContactQr(number: string, consent: boolean): ContactQr | null {
  const value = contactQrValue(number, consent);
  if (!value) return null;
  const qr = qrcode(0, 'M');
  qr.addData(value, 'Byte'); qr.make();
  const count = qr.getModuleCount(), bars: ContactQr['bars'] = [];
  // Merge adjacent dark modules; native Views avoid a new SVG/native image dependency.
  // Four white modules on every edge form the quiet zone. Never decorate or mirror the QR.
  for (let y = 0; y < count; y++) {
    let x = 0;
    while (x < count) {
      if (!qr.isDark(y, x)) { x++; continue; }
      const start = x++;
      while (x < count && qr.isDark(y, x)) x++;
      bars.push({ x: start + 4, y: y + 4, width: x - start });
    }
  }
  return { value, size: count + 8, bars };
}
