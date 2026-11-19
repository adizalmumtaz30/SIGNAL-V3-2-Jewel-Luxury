import { useEffect, useState } from 'react';
import type { AppSettings } from '../domain/types';
import {
  OFFICIAL_KOP_ASSET_PATH,
  resolveEffectiveKopData,
  type KopIdentityOverrideInput,
} from '../domain/kopIdentity';
import {
  getDefaultMadrasahLogo,
  preloadOfficialKopAssets,
  subscribeOfficialKopAssets,
} from '../utils/madrasahLogo';
import './OfficialKopSuratPreview.css';

export interface OfficialKopSuratPreviewProps {
  settings?: Partial<AppSettings> | null;
  overrides?: KopIdentityOverrideInput | null;
  variant?: 'full' | 'compact' | 'mini';
  className?: string;
}

/**
 * Reusable official letterhead preview mirroring the uploaded MTs Daruttafsir Al-Husaini Kop Surat.
 * Supports both live-editable Structured Mode (using the exact uploaded pentagonal crest + Times serif hierarchy + framed address bar)
 * and pixel-exact Image Banner Mode.
 */
export function OfficialKopSuratPreview({
  settings,
  overrides,
  variant = 'full',
  className = '',
}: OfficialKopSuratPreviewProps) {
  const [, setAssetTick] = useState(0);

  useEffect(() => {
    void preloadOfficialKopAssets();
    return subscribeOfficialKopAssets(() => {
      setAssetTick((n) => n + 1);
    });
  }, []);

  const kop = resolveEffectiveKopData(settings, overrides);

  if (kop.kopMode === 'image') {
    return (
      <div
        className={`oks-root is-${variant} is-image-mode ${className}`.trim()}
        data-kop-mode="image"
      >
        <img
          src={kop.kopImageUrl || OFFICIAL_KOP_ASSET_PATH}
          alt={`Kop Surat ${kop.schoolName}`}
          className="oks-banner-img"
        />
      </div>
    );
  }

  const emblemSrc = kop.logoUrl || getDefaultMadrasahLogo();

  return (
    <div
      className={`oks-root is-${variant} is-structured-mode ${className}`.trim()}
      data-kop-mode="structured"
    >
      <div className="oks-header-row">
        <div className="oks-emblem-col">
          {emblemSrc ? (
            <img
              src={emblemSrc}
              alt={`Lambang ${kop.schoolName}`}
              className="oks-emblem-img"
            />
          ) : (
            <div className="oks-emblem-crop-wrap" aria-hidden="true">
              <img
                src={OFFICIAL_KOP_ASSET_PATH}
                alt=""
                className="oks-emblem-crop-fallback"
              />
            </div>
          )}
        </div>

        <div className="oks-text-col">
          <div className="oks-title-line">{kop.titleLine1}</div>
          {kop.titleLine2 && <div className="oks-title-line">{kop.titleLine2}</div>}
          {kop.foundationLine && (
            <div className="oks-foundation-line">{kop.foundationLine}</div>
          )}
          {kop.notaryLine && <div className="oks-legal-line">{kop.notaryLine}</div>}
          {kop.decreeLine && <div className="oks-legal-line">{kop.decreeLine}</div>}
          {kop.registryLine && (
            <div className="oks-registry-line s5-tnum">{kop.registryLine}</div>
          )}
          {kop.accreditationLine && (
            <div className="oks-accreditation-line">{kop.accreditationLine}</div>
          )}
        </div>
      </div>

      {kop.addressBandLine && (
        <div className="oks-address-band">{kop.addressBandLine}</div>
      )}
    </div>
  );
}
