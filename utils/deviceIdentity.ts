/**
 * Identidade do aparelho a partir do User-Agent / Client Hints.
 * Usado no login, heartbeat e na lista de dispositivos conectados.
 */

export type DeviceKind = 'smartphone' | 'tablet' | 'desktop' | 'outro';

export type DeviceIdentity = {
  platform: DeviceKind;
  osName: string;
  deviceModel: string;
};

function cleanModel(raw: string): string {
  return raw
    .replace(/\s+Build\/.*$/i, '')
    .replace(/\s+AppleWebKit.*$/i, '')
    .replace(/^;\s*/, '')
    .trim();
}

/** Classifica tipo de tela pelo UA. */
export function deviceKindFromUserAgent(ua: string): DeviceKind {
  const u = ua || '';
  if (/iPhone|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(u)) return 'smartphone';
  if (/Android/i.test(u) && /Mobile/i.test(u)) return 'smartphone';
  if (/iPad/i.test(u)) return 'tablet';
  if (/Android/i.test(u) && !/Mobile/i.test(u)) return 'tablet';
  if (/Macintosh|Windows NT|Linux|CrOS/i.test(u)) return 'desktop';
  return 'outro';
}

/** Extrai sistema operacional e modelo a partir do User-Agent. */
export function parseDeviceIdentityFromUserAgent(ua: string): DeviceIdentity {
  const u = ua || '';
  const platform = deviceKindFromUserAgent(u);

  let osName = 'Sistema desconhecido';
  if (/Windows NT 10\.0/i.test(u)) osName = 'Windows 10/11';
  else if (/Windows NT 6\.3/i.test(u)) osName = 'Windows 8.1';
  else if (/Windows NT 6\.1/i.test(u)) osName = 'Windows 7';
  else if (/Windows NT/i.test(u)) osName = 'Windows';
  else if (/CrOS/i.test(u)) osName = 'Chrome OS';
  else if (/Android\s+(\d+(?:\.\d+)?)/i.test(u)) {
    const m = u.match(/Android\s+(\d+(?:\.\d+)?)/i);
    osName = m ? `Android ${m[1]}` : 'Android';
  } else if (/iPhone|iPad|iPod/i.test(u)) {
    const m = u.match(/OS\s+(\d+[._]\d+(?:[._]\d+)?)/i);
    const ver = m ? m[1].replace(/_/g, '.') : '';
    // iPadOS reporta como Mac em alguns casos; no UA clássico ainda aparece "iPad".
    osName = /iPad/i.test(u) ? (ver ? `iPadOS ${ver}` : 'iPadOS') : ver ? `iOS ${ver}` : 'iOS';
  } else if (/Mac OS X\s+(\d+[._]\d+(?:[._]\d+)?)/i.test(u)) {
    const m = u.match(/Mac OS X\s+(\d+[._]\d+(?:[._]\d+)?)/i);
    osName = m ? `macOS ${m[1].replace(/_/g, '.')}` : 'macOS';
  } else if (/Linux/i.test(u)) {
    osName = 'Linux';
  }

  let deviceModel = '';
  if (/iPhone/i.test(u)) deviceModel = 'iPhone';
  else if (/iPad/i.test(u)) deviceModel = 'iPad';
  else if (/iPod/i.test(u)) deviceModel = 'iPod';
  else if (/Android/i.test(u)) {
    // Ex.: (Linux; Android 14; Pixel 8) ou (Linux; Android 13; SM-S911B)
    const m = u.match(/Android\s+[^;]*;\s*([^);]+)\)/i) || u.match(/Android\s+[^;]*;\s*([^;)]+)/i);
    if (m) {
      let candidate = cleanModel(m[1]);
      // Descarta tokens genéricos do UA.
      if (
        !candidate ||
        /^(wv|Mobile|U|Linux|en-[a-z]{2}|pt-[a-z]{2}|K)$/i.test(candidate) ||
        /^[a-z]{2}(-[a-z]{2})?$/i.test(candidate)
      ) {
        candidate = '';
      }
      deviceModel = candidate;
    }
    if (!deviceModel) deviceModel = platform === 'tablet' ? 'Tablet Android' : 'Android';
  } else if (/Macintosh|Mac OS X/i.test(u)) {
    deviceModel = 'Mac';
  } else if (/Windows NT/i.test(u)) {
    deviceModel = 'PC Windows';
  } else if (/CrOS/i.test(u)) {
    deviceModel = 'Chromebook';
  } else if (/Linux/i.test(u)) {
    deviceModel = 'PC Linux';
  } else {
    deviceModel = platform === 'smartphone' ? 'Smartphone' : platform === 'tablet' ? 'Tablet' : 'Computador';
  }

  return { platform, osName, deviceModel };
}

export type DeviceClientInfoPayload = {
  platform?: string;
  osName?: string;
  deviceModel?: string;
  userAgent?: string;
};

/** Coleta identidade no navegador (síncrono + Client Hints quando disponível). */
export async function collectDeviceClientInfo(): Promise<DeviceClientInfoPayload> {
  if (typeof navigator === 'undefined') {
    return {};
  }
  const ua = navigator.userAgent || '';
  const parsed = parseDeviceIdentityFromUserAgent(ua);
  let osName = parsed.osName;
  let deviceModel = parsed.deviceModel;
  let platform: string = parsed.platform;

  try {
    const uaData = (
      navigator as Navigator & {
        userAgentData?: {
          mobile?: boolean;
          platform?: string;
          getHighEntropyValues?: (hints: string[]) => Promise<{
            model?: string;
            platform?: string;
            platformVersion?: string;
            mobile?: boolean;
          }>;
        };
      }
    ).userAgentData;

    if (uaData?.getHighEntropyValues) {
      const high = await uaData.getHighEntropyValues(['model', 'platformVersion', 'platform']);
      const hintPlatform = (high.platform || uaData.platform || '').trim();
      const hintVersion = (high.platformVersion || '').trim();
      const hintModel = (high.model || '').trim();

      if (hintPlatform) {
        const platLower = hintPlatform.toLowerCase();
        if (platLower === 'android') {
          osName = hintVersion ? `Android ${hintVersion.split('.')[0]}` : 'Android';
        } else if (platLower === 'windows') {
          // Client Hints: platformVersion 15.x ≈ Windows 11, 10.x ≈ Windows 10
          const major = Number.parseInt(hintVersion.split('.')[0] || '', 10);
          if (major >= 13) osName = 'Windows 11';
          else if (major >= 1) osName = 'Windows 10';
          else osName = 'Windows';
        } else if (platLower === 'macos') {
          osName = hintVersion ? `macOS ${hintVersion}` : 'macOS';
        } else if (platLower === 'chrome os' || platLower === 'chromeos') {
          osName = 'Chrome OS';
        } else if (platLower === 'linux') {
          osName = 'Linux';
        } else {
          osName = hintVersion ? `${hintPlatform} ${hintVersion}` : hintPlatform;
        }
      }
      if (hintModel) {
        deviceModel = hintModel;
      }
      if (typeof high.mobile === 'boolean') {
        if (high.mobile && platform === 'desktop') platform = 'smartphone';
      }
    } else if (uaData?.platform) {
      // Sem high-entropy: ainda refina o SO pela plataforma declarada.
      const p = uaData.platform.trim();
      if (p && osName === 'Sistema desconhecido') osName = p;
    }
  } catch {
    /* Client Hints indisponível / bloqueado */
  }

  return {
    platform,
    osName: osName.slice(0, 80),
    deviceModel: deviceModel.slice(0, 120),
    userAgent: ua.slice(0, 512),
  };
}

export function formatDeviceIdentityLine(info: {
  deviceModel?: string | null;
  osName?: string | null;
  platform?: string | null;
}): string {
  const model = (info.deviceModel || '').trim();
  const os = (info.osName || '').trim();
  if (model && os) return `${model} · ${os}`;
  if (model) return model;
  if (os) return os;
  const p = (info.platform || '').toLowerCase();
  if (p === 'smartphone') return 'Smartphone';
  if (p === 'tablet') return 'Tablet';
  if (p === 'desktop') return 'PC';
  return 'Dispositivo';
}
