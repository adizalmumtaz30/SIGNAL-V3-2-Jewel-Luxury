import type { AppSettings } from './types';

/**
 * Official letterhead asset uploaded by the madrasah (3264 x 798 PNG).
 * Referenced directly from `/public/assets/aistudio/...`.
 */
export const OFFICIAL_KOP_ASSET_PATH =
  '/assets/aistudio/336186599-KOP_MTS_TERBARU_82f9023d.png';

/**
 * Pixel-exact crop bounding box of the pentagonal madrasah emblem inside OFFICIAL_KOP_ASSET_PATH.
 */
export const OFFICIAL_KOP_EMBLEM_CROP = {
  x: 56,
  y: 28,
  width: 618,
  height: 602,
} as const;

export const OFFICIAL_KOP_ASPECT_RATIO = 3264 / 798;

export type KopRenderMode = 'structured' | 'image';

/**
 * Single Source of Truth for the official madrasah identity & letterhead template.
 * Matches the uploaded MTs Daruttafsir Al-Husaini letterhead verbatim.
 */
export const DEFAULT_MADRASAH_IDENTITY = {
  schoolName: 'MADRASAH TSANAWIYAH (MTs) DARUTTAFSIR AL-HUSAINI',
  ministry: 'Yayasan Pondok Pesantren Daruttafsir Al-husaini',
  regionalOffice: 'Akte No. 06 Tanggal 15 April Tahun 2021 Notaris : Dani Ardiati, S.H',
  legalDecree: 'Keputusan Menkumham RI No. AHU-0013850.AH.01.12.Tahun 2021',
  nsm: '121232760023',
  npsn: '20279680',
  accreditation: 'TERAKREDITASI B',
  address: 'Parungkulon RT.04/06 Kel. Durenmekar , Kec. Bojongsari Kota Depok',
  city: 'Depok',
  postalCode: '',
  phone: '(0251) 8612107',
  email: '',
  website: '',
  kopMode: 'structured' as KopRenderMode,
  kopImageUrl: OFFICIAL_KOP_ASSET_PATH,
} as const;

export interface KopIdentityOverrideInput {
  schoolName?: string;
  ministry?: string;
  regionalOffice?: string;
  legalDecree?: string;
  nsm?: string;
  npsn?: string;
  accreditation?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  kopMode?: KopRenderMode;
  kopImageUrl?: string;
}

export interface ResolvedKopRenderData {
  schoolName: string;
  titleLine1: string;
  titleLine2: string;
  foundationLine: string;
  notaryLine: string;
  decreeLine: string;
  registryLine: string;
  accreditationLine: string;
  addressBandLine: string;
  nsm: string;
  npsn: string;
  address: string;
  city: string;
  postalCode: string;
  phone: string;
  email: string;
  website: string;
  logoUrl?: string;
  kopMode: KopRenderMode;
  kopImageUrl: string;
}

/**
 * Splits a full madrasah title into 2 balanced serif lines mirroring the official letterhead:
 * e.g. "MADRASAH TSANAWIYAH (MTs) DARUTTAFSIR AL-HUSAINI"
 * -> ["MADRASAH TSANAWIYAH (MTs)", "DARUTTAFSIR AL-HUSAINI"]
 */
export function splitSchoolTitleForKop(rawSchoolName: string): [string, string] {
  const clean = (rawSchoolName ?? '').trim();
  if (!clean) {
    return ['MADRASAH TSANAWIYAH (MTs)', 'DARUTTAFSIR AL-HUSAINI'];
  }

  const mtsParenMatch = /^(MADRASAH\s+TSANAWIYAH\s*\(MTs\))\s+(.+)$/i.exec(clean);
  if (mtsParenMatch) {
    return [mtsParenMatch[1].replace(/\(mts\)/i, '(MTs)'), mtsParenMatch[2].trim().toUpperCase()];
  }

  const mtsPlainMatch = /^(MADRASAH\s+TSANAWIYAH)\s+(.+)$/i.exec(clean);
  if (mtsPlainMatch) {
    return [mtsPlainMatch[1].toUpperCase(), mtsPlainMatch[2].trim().toUpperCase()];
  }

  const shortMtsMatch = /^(MTsN?|MTs)\s+(.+)$/i.exec(clean);
  if (shortMtsMatch && clean.length > 24) {
    return ['MADRASAH TSANAWIYAH (MTs)', shortMtsMatch[2].trim().toUpperCase()];
  }

  return [clean.toUpperCase(), ''];
}

/**
 * Formats NSM & NPSN line matching the official letterhead ("NSM : 121232760023 NPSN 20279680").
 */
export function formatKopRegistryLine(nsm?: string, npsn?: string): string {
  const cleanNsm = (nsm ?? '').trim();
  const cleanNpsn = (npsn ?? '').trim();
  const parts: string[] = [];
  if (cleanNsm) parts.push(`NSM : ${cleanNsm}`);
  if (cleanNpsn) parts.push(`NPSN ${cleanNpsn}`);
  return parts.join(' ');
}

/**
 * Formats the framed bottom address band matching the official letterhead:
 * "Alamat : Parungkulon RT.04/06 Kel. Durenmekar , Kec. Bojongsari Kota Depok (0251) 8612107"
 */
export function formatKopAddressLine(params: {
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
}): string {
  const addr = (params.address ?? '').trim();
  const city = (params.city ?? '').trim();
  const postal = (params.postalCode ?? '').trim();
  const phone = (params.phone ?? '').trim();
  const email = (params.email ?? '').trim();
  const website = (params.website ?? '').trim();

  let location = addr;
  if (city && !addr.toLowerCase().includes(city.toLowerCase())) {
    location = location ? `${location}, ${city}` : city;
  }
  if (postal && !location.includes(postal)) {
    location = location ? `${location} ${postal}` : postal;
  }

  const chunks: string[] = [];
  if (location) {
    chunks.push(/^alamat\s*:/i.test(location) ? location : `Alamat : ${location}`);
  }
  if (phone) {
    chunks.push(phone);
  }
  if (email) {
    chunks.push(`Email: ${email}`);
  }
  if (website) {
    chunks.push(website);
  }

  return chunks.join(' ');
}

/**
 * Resolves unified letterhead data from AppSettings with optional per-export overrides.
 */
export function resolveEffectiveKopData(
  settings?: Partial<AppSettings> | null,
  overrides?: KopIdentityOverrideInput | null
): ResolvedKopRenderData {
  const s = settings ?? {};
  const o = overrides ?? {};

  const pick = (
    overrideVal: string | undefined,
    settingVal: string | undefined,
    fallback: string
  ): string => {
    if (overrideVal !== undefined) return overrideVal.trim();
    if (settingVal !== undefined) return settingVal.trim();
    return fallback;
  };

  const schoolName = pick(o.schoolName, s.schoolName, DEFAULT_MADRASAH_IDENTITY.schoolName);
  const foundationLine = pick(o.ministry, s.ministry, DEFAULT_MADRASAH_IDENTITY.ministry);
  const notaryLine = pick(
    o.regionalOffice,
    s.regionalOffice,
    DEFAULT_MADRASAH_IDENTITY.regionalOffice
  );
  const decreeLine = pick(o.legalDecree, s.legalDecree, DEFAULT_MADRASAH_IDENTITY.legalDecree);
  const nsm = pick(o.nsm, s.nsm, DEFAULT_MADRASAH_IDENTITY.nsm);
  const npsn = pick(o.npsn, s.npsn, DEFAULT_MADRASAH_IDENTITY.npsn);
  const accreditationLine = pick(
    o.accreditation,
    s.accreditation,
    DEFAULT_MADRASAH_IDENTITY.accreditation
  );
  const address = pick(o.address, s.address, DEFAULT_MADRASAH_IDENTITY.address);
  const city = pick(o.city, s.city, DEFAULT_MADRASAH_IDENTITY.city);
  const postalCode = pick(o.postalCode, s.postalCode, DEFAULT_MADRASAH_IDENTITY.postalCode);
  const phone = pick(o.phone, s.phone, DEFAULT_MADRASAH_IDENTITY.phone);
  const email = pick(o.email, s.email, DEFAULT_MADRASAH_IDENTITY.email);
  const website = pick(o.website, s.website, DEFAULT_MADRASAH_IDENTITY.website);

  const [titleLine1, titleLine2] = splitSchoolTitleForKop(schoolName);
  const registryLine = formatKopRegistryLine(nsm, npsn);
  const addressBandLine = formatKopAddressLine({
    address,
    city,
    postalCode,
    phone,
    email,
    website,
  });

  const kopMode: KopRenderMode =
    o.kopMode ?? (s.kopMode === 'image' ? 'image' : 'structured');
  const kopImageUrl =
    (o.kopImageUrl ?? s.kopImageUrl)?.trim() || OFFICIAL_KOP_ASSET_PATH;
  const logoUrl = (o.logoUrl ?? s.logoUrl)?.trim() || undefined;

  return {
    schoolName,
    titleLine1,
    titleLine2,
    foundationLine,
    notaryLine,
    decreeLine,
    registryLine,
    accreditationLine,
    addressBandLine,
    nsm,
    npsn,
    address,
    city,
    postalCode,
    phone,
    email,
    website,
    logoUrl,
    kopMode,
    kopImageUrl,
  };
}
