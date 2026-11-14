import { useState, useRef, useEffect } from 'react';
import { Info, HelpCircle, X } from 'lucide-react';

interface InfoNoticeProps {
  text: string;
  label?: string;
  variant?: 'info' | 'help' | 'exclamation';
  size?: number;
}

export function InfoNotice({
  text,
  label = 'Informasi & Petunjuk',
  variant = 'info',
  size = 12,
}: InfoNoticeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Choose icon based on variant: default to sleek Info icon
  const renderIcon = () => {
    if (variant === 'help') {
      return <HelpCircle size={size} strokeWidth={1.75} />;
    }
    // Default or 'info' / legacy 'exclamation' mapping to modern clean Info icon
    return <Info size={size} strokeWidth={1.75} />;
  };

  return (
    <span
      ref={containerRef}
      className="info-notice-root"
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        verticalAlign: 'middle',
        marginLeft: '6px',
      }}
    >
      <button
        type="button"
        className="info-notice-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        title="Lihat detail dan informasi petunjuk"
        aria-label="Informasi dan petunjuk"
        aria-expanded={isOpen}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '19px',
          height: '19px',
          borderRadius: '50%',
          border: isOpen ? '1px solid #1a3f3b' : '1px solid rgba(23, 54, 55, 0.16)',
          background: isOpen ? '#1a3f3b' : 'rgba(23, 54, 55, 0.04)',
          color: isOpen ? '#ffffff' : '#4d6961',
          cursor: 'pointer',
          padding: 0,
          transition: 'all 0.15s ease-in-out',
          opacity: isOpen ? 1 : 0.82,
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.background = 'rgba(23, 54, 55, 0.09)';
            e.currentTarget.style.borderColor = 'rgba(23, 54, 55, 0.28)';
            e.currentTarget.style.color = '#1a3f3b';
            e.currentTarget.style.opacity = '1';
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.background = 'rgba(23, 54, 55, 0.04)';
            e.currentTarget.style.borderColor = 'rgba(23, 54, 55, 0.16)';
            e.currentTarget.style.color = '#4d6961';
            e.currentTarget.style.opacity = '0.82';
          }
        }}
      >
        {renderIcon()}
      </button>

      {isOpen && (
        <div
          role="tooltip"
          className="info-notice-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 7px)',
            left: '0',
            zIndex: 100,
            width: '320px',
            maxWidth: 'calc(100vw - 32px)',
            background: '#ffffff',
            borderRadius: '10px',
            padding: '12px 14px',
            boxShadow: '0 8px 24px -4px rgba(18, 45, 43, 0.18), 0 0 0 1px rgba(23, 54, 55, 0.1)',
            fontSize: '12.5px',
            lineHeight: 1.5,
            color: '#1a3331',
            textAlign: 'left',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '7px',
              borderBottom: '1px solid #edf2ef',
              paddingBottom: '5px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Info size={13} color="#24635e" strokeWidth={1.8} />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#24635e',
                }}
              >
                {label}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#657d76',
                padding: '2px',
                display: 'grid',
                placeItems: 'center',
                borderRadius: '4px',
              }}
              aria-label="Tutup petunjuk"
            >
              <X size={14} />
            </button>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: '12.5px',
              lineHeight: 1.55,
              color: '#2d4743',
              fontWeight: 450,
            }}
          >
            {text}
          </p>
        </div>
      )}
    </span>
  );
}
