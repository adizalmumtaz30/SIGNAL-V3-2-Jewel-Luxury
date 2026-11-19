/**
 * Madrasah Logo & Official Letterhead Asset Utilities
 * Extracts the exact pentagonal emblem from the uploaded MTs Daruttafsir Al-Husaini Kop Surat
 * and provides high-resolution banner preloading & custom upload processing.
 */
import {
  OFFICIAL_KOP_ASSET_PATH,
  OFFICIAL_KOP_EMBLEM_CROP,
} from '../domain/kopIdentity';

export const COMMON_TEACHER_POSITIONS = [
  'Guru Mapel',
  'Waka Bidang Kurikulum',
  'Waka Bidang Kesiswaan',
  'Waka Bidang Humas',
  'Waka Sarana & Prasarana',
  'Kepala Madrasah',
  'Guru BK / Konseling',
  'Pembina OSIS',
  'Kepala Laboratorium IPA',
  'Kepala Laboratorium Komputer',
  'Kepala Perpustakaan',
  'Koordinator Keagamaan & Tahfiz',
  'Koordinator Ekstrakurikuler',
  'Wali Kelas VII-A',
  'Wali Kelas VII-B',
  'Wali Kelas VIII-A',
  'Wali Kelas VIII-B',
  'Wali Kelas IX-A',
  'Wali Kelas IX-B',
] as const;

let cachedFallbackEmblem: string | null = null;
let cachedUploadedEmblem: string | null = null;
let cachedUploadedBanner: string | null = null;
let preloadPromise: Promise<void> | null = null;
const assetListeners = new Set<() => void>();

function notifyAssetListeners() {
  for (const fn of assetListeners) {
    try {
      fn();
    } catch {
      // ignore subscriber errors
    }
  }
}

/**
 * Subscribe to official letterhead/emblem asset readiness so React previews refresh automatically.
 */
export function subscribeOfficialKopAssets(listener: () => void): () => void {
  assetListeners.add(listener);
  return () => {
    assetListeners.delete(listener);
  };
}

/**
 * Loads `/assets/aistudio/336186599-KOP_MTS_TERBARU_82f9023d.png` in browser and caches:
 * 1. Cropped pentagonal emblem PNG Data URL (for structured Kop & Studio logo insert)
 * 2. Scaled full-width Kop banner PNG Data URL (for image-mode Kop PDF export)
 */
export function preloadOfficialKopAssets(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  if (cachedUploadedEmblem && cachedUploadedBanner) {
    return Promise.resolve();
  }
  if (preloadPromise) return preloadPromise;

  preloadPromise = new Promise<void>((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          // 1. Crop exact pentagonal crest from left side of uploaded Kop Surat
          const emblemCanvas = document.createElement('canvas');
          emblemCanvas.width = 320;
          emblemCanvas.height = 312;
          const eCtx = emblemCanvas.getContext('2d');
          if (eCtx) {
            eCtx.clearRect(0, 0, emblemCanvas.width, emblemCanvas.height);
            eCtx.drawImage(
              img,
              OFFICIAL_KOP_EMBLEM_CROP.x,
              OFFICIAL_KOP_EMBLEM_CROP.y,
              OFFICIAL_KOP_EMBLEM_CROP.width,
              OFFICIAL_KOP_EMBLEM_CROP.height,
              0,
              0,
              emblemCanvas.width,
              emblemCanvas.height
            );
            cachedUploadedEmblem = emblemCanvas.toDataURL('image/png');
          }

          // 2. Cache crisp banner image for jsPDF full-banner mode
          const maxBannerW = 1600;
          const natW = img.naturalWidth || 3264;
          const natH = img.naturalHeight || 798;
          const scale = Math.min(1, maxBannerW / natW);
          const bw = Math.round(natW * scale);
          const bh = Math.round(natH * scale);
          const bannerCanvas = document.createElement('canvas');
          bannerCanvas.width = bw;
          bannerCanvas.height = bh;
          const bCtx = bannerCanvas.getContext('2d');
          if (bCtx) {
            bCtx.fillStyle = '#ffffff';
            bCtx.fillRect(0, 0, bw, bh);
            bCtx.drawImage(img, 0, 0, bw, bh);
            cachedUploadedBanner = bannerCanvas.toDataURL('image/png');
          }

          notifyAssetListeners();
        } catch (err) {
          console.warn('Could not extract official Kop emblem/banner:', err);
        }
        resolve();
      };
      img.onerror = () => {
        resolve();
      };
      img.src = OFFICIAL_KOP_ASSET_PATH;
    } catch {
      resolve();
    }
  });

  return preloadPromise;
}

// Kick off background preload immediately in browser environments
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  void preloadOfficialKopAssets();
}

/**
 * Returns the cached PNG Data URL of the full uploaded Kop Surat banner (if loaded in browser).
 */
export function getOfficialKopBannerDataUrl(customKopImageUrl?: string): string {
  if (customKopImageUrl && /^data:image\//i.test(customKopImageUrl)) {
    return customKopImageUrl;
  }
  return cachedUploadedBanner ?? '';
}

/**
 * Draws a crisp pentagonal Madrasah fallback emblem if the uploaded PNG hasn't finished decoding yet.
 */
function buildFallbackPentagonalEmblem(): string {
  if (cachedFallbackEmblem) return cachedFallbackEmblem;
  if (typeof document === 'undefined') return '';

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    const cx = 120;

    // Pentagonal green crest matching MTs Daruttafsir Al-Husaini silhouette
    ctx.beginPath();
    ctx.moveTo(cx, 16);
    ctx.lineTo(220, 86);
    ctx.lineTo(186, 218);
    ctx.lineTo(54, 218);
    ctx.lineTo(20, 86);
    ctx.closePath();
    ctx.fillStyle = '#00e600';
    ctx.fill();
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Inner border
    ctx.beginPath();
    ctx.moveTo(cx, 28);
    ctx.lineTo(208, 92);
    ctx.lineTo(178, 208);
    ctx.lineTo(62, 208);
    ctx.lineTo(32, 92);
    ctx.closePath();
    ctx.strokeStyle = '#0f3d1e';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Top golden star
    ctx.fillStyle = '#ffea00';
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 18 : 8;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      const px = cx + r * Math.cos(angle);
      const py = 56 + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Open yellow book in center
    ctx.fillStyle = '#ffea00';
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, 94);
    ctx.quadraticCurveTo(cx - 20, 86, cx - 34, 94);
    ctx.lineTo(cx - 34, 134);
    ctx.quadraticCurveTo(cx - 20, 126, cx, 134);
    ctx.quadraticCurveTo(cx + 20, 126, cx + 34, 134);
    ctx.lineTo(cx + 34, 94);
    ctx.quadraticCurveTo(cx + 20, 86, cx, 94);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Label
    ctx.fillStyle = '#0a0a0a';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MADRASAH TSANAWIYAH', cx, 158);
    ctx.font = 'bold 9.5px sans-serif';
    ctx.fillText('DARUTTAFSIR AL-HUSAINI', cx, 188);

    cachedFallbackEmblem = canvas.toDataURL('image/png');
    return cachedFallbackEmblem || '';
  } catch (err) {
    console.error('Failed to create fallback madrasah emblem:', err);
    return '';
  }
}

/**
 * Returns the official MTs Daruttafsir Al-Husaini emblem as a PNG Data URL.
 * Prefers the exact cropped crest from the uploaded Kop Surat once loaded.
 */
export function getDefaultMadrasahLogo(): string {
  if (cachedUploadedEmblem) return cachedUploadedEmblem;
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    void preloadOfficialKopAssets();
  }
  return buildFallbackPentagonalEmblem();
}

/**
 * Process uploaded logo image file into an optimized PNG data URL (max 320x320).
 */
export async function processLogoUpload(file: File): Promise<string> {
  return processImageUploadWithMaxDim(file, 320, false);
}

/**
 * Process uploaded full letterhead banner image into an optimized PNG data URL (max width 1600px).
 */
export async function processKopBannerUpload(file: File): Promise<string> {
  return processImageUploadWithMaxDim(file, 1600, true);
}

async function processImageUploadWithMaxDim(
  file: File,
  maxDim: number,
  fillWhiteBg: boolean
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File yang dipilih bukan berkas gambar.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak dapat dimuat.'));
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(reader.result as string);
            return;
          }

          if (fillWhiteBg) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
          } else {
            ctx.clearRect(0, 0, width, height);
          }
          ctx.drawImage(img, 0, 0, width, height);
          const pngDataUrl = canvas.toDataURL('image/png');
          resolve(pngDataUrl);
        } catch {
          resolve(reader.result as string);
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
