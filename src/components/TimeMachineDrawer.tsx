import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  RotateCcw,
  Star,
  Download,
  Upload,
  Plus,
  Trash2,
  X,
  HardDrive,
  Calendar,
  AlertTriangle,
} from 'lucide-react';
import type { AppState } from '../domain/types';
import {
  type StateSnapshot,
  getSnapshots,
  createSnapshot,
  toggleStarSnapshot,
  deleteSnapshot,
  restoreSnapshot,
  exportSignalFile,
  parseSignalFile,
  getStorageEstimate,
} from '../storage/snapshotEngine';

interface TimeMachineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentState: AppState;
  onStateRestored: (newState: AppState) => void;
  onNotify: (message: string, kind?: 'success' | 'warning' | 'error' | 'info') => void;
}

export const TimeMachineDrawer: React.FC<TimeMachineDrawerProps> = ({
  isOpen,
  onClose,
  currentState,
  onStateRestored,
  onNotify,
}) => {
  const [snapshots, setSnapshots] = useState<StateSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [storageInfo, setStorageInfo] = useState({ usageMb: '1.2', quotaMb: '500', percent: 1 });
  const [newLabel, setNewLabel] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const list = await getSnapshots();
      setSnapshots(list);
      const est = await getStorageEstimate();
      setStorageInfo(est);
    } catch (e) {
      console.error('Failed to load snapshots:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel.trim()) return;
    try {
      await createSnapshot(currentState, newLabel.trim(), 'manual_milestone', true);
      setNewLabel('');
      setIsCreating(false);
      onNotify('Titik tonggak baru berhasil disimpan dan diamankan!', 'success');
      loadData();
    } catch (err) {
      onNotify('Gagal menyimpan titik tonggak.', 'error');
    }
  };

  const handleToggleStar = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const nowStarred = await toggleStarSnapshot(id);
      setSnapshots((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isStarred: nowStarred } : s))
      );
      onNotify(
        nowStarred
          ? 'Snapshot dibintangi (kebal dari auto-purge).'
          : 'Bintang dihapus dari snapshot.',
        'info'
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSnapshot(id);
      setSnapshots((prev) => prev.filter((s) => s.id !== id));
      onNotify('Snapshot berhasil dihapus dari arsip lokal.', 'info');
    } catch (err) {
      console.error(err);
    }
  };

  const executeRestore = async (id: string) => {
    try {
      const restored = await restoreSnapshot(currentState, id);
      if (restored) {
        onStateRestored(restored);
        setConfirmRestoreId(null);
        onNotify('Data madrasah berhasil dipulihkan dari titik snapshot!', 'success');
        onClose();
      }
    } catch (err) {
      onNotify('Gagal memulihkan data dari snapshot.', 'error');
    }
  };

  const handleExportFile = async () => {
    try {
      await exportSignalFile(currentState);
      onNotify('Berkas cadangan .signal berhasil diunduh.', 'success');
    } catch (err) {
      onNotify('Gagal mengekspor berkas cadangan.', 'error');
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseSignalFile(file);
      // Create safety snapshot before restoring imported file
      await createSnapshot(currentState, `Pra-Impor Berkas: ${file.name}`, 'pre_rollback', true);
      onStateRestored(parsed);
      onNotify(`Berhasil memulihkan madrasah dari berkas "${file.name}"!`, 'success');
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Berkas tidak valid';
      onNotify(msg, 'error');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const formatTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const starredSnapshots = snapshots.filter((s) => s.isStarred);
  const autoSnapshots = snapshots.filter((s) => !s.isStarred);

  if (!isOpen) return null;

  return (
    <div className="s5-drawer-overlay" onClick={onClose}>
      <div
        className="s5-drawer-panel"
        style={{ width: '480px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="s5-drawer-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(197, 160, 89, 0.15)',
                border: '1px solid #C5A059',
                display: 'grid',
                placeItems: 'center',
                color: '#8E7035',
              }}
            >
              <Clock size={16} />
            </div>
            <div>
              <strong style={{ fontSize: '14.5px', color: '#0B2923', display: 'block' }}>
                Time Machine Vault
              </strong>
              <small style={{ fontSize: '11px', color: '#687E77' }}>
                Titik Pemulihan &amp; Ketahanan Data
              </small>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#687E77',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
            }}
            aria-label="Tutup Time Machine"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="s5-drawer-body">
          {/* Storage Health Ribbon */}
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '9px',
              background: '#F0F4F1',
              border: '0.75px solid #CCD8D2',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '11.5px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#124037' }}>
              <HardDrive size={15} />
              <span>
                <strong>{storageInfo.usageMb} MB</strong> terpakai dari {storageInfo.quotaMb} MB
              </span>
            </div>
            <span
              style={{
                padding: '2px 8px',
                borderRadius: '12px',
                background: '#E8F5EE',
                color: '#1B5E43',
                fontWeight: 600,
                fontSize: '11px',
              }}
            >
              STATUS AMAN
            </span>
          </div>

          {/* Action Ribbon: New Milestone + Export .signal + Import */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button
              onClick={() => setIsCreating(!isCreating)}
              style={{
                flex: 1,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px 12px',
                borderRadius: '8px',
                background: '#124037',
                color: '#FFFFFF',
                border: 'none',
                fontWeight: 600,
                fontSize: '11.5px',
                cursor: 'pointer',
              }}
            >
              <Plus size={14} />
              <span>Titik Baru</span>
            </button>
            <button
              onClick={handleExportFile}
              title="Unduh Berkas Cadangan Terenkripsi .signal"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '8px 12px',
                borderRadius: '8px',
                background: '#FFFFFF',
                border: '0.75px solid #C5A059',
                color: '#8E7035',
                fontWeight: 600,
                fontSize: '11.5px',
                cursor: 'pointer',
              }}
            >
              <Download size={14} />
              <span>Ekspor .signal</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Pulihkan dari Berkas .signal atau .json"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '8px 12px',
                borderRadius: '8px',
                background: '#FFFFFF',
                border: '0.75px solid #CCD8D2',
                color: '#3B504A',
                fontWeight: 600,
                fontSize: '11.5px',
                cursor: 'pointer',
              }}
            >
              <Upload size={14} />
              <span>Impor</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".signal,.json"
              style={{ display: 'none' }}
            />
          </div>

          {/* Form Create Milestone */}
          {isCreating && (
            <form
              onSubmit={handleCreateMilestone}
              style={{
                padding: '12px',
                borderRadius: '9px',
                background: '#F8FAF7',
                border: '1px solid #124037',
                marginBottom: '18px',
              }}
            >
              <label
                style={{
                  display: 'block',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#0B2923',
                  marginBottom: '6px',
                }}
              >
                Label Titik Tonggak (Milestone)
              </label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Misal: Baseline Awal Tahun Ajaran 2026/2027"
                autoFocus
                style={{
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  border: '1px solid #CCD8D2',
                  fontSize: '12px',
                  marginBottom: '10px',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: '0.75px solid #CCD8D2',
                    background: '#FFFFFF',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#124037',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Simpan Titik
                </button>
              </div>
            </form>
          )}

          {/* Section 1: Starred Milestones */}
          {starredSnapshots.length > 0 && (
            <div style={{ marginBottom: '22px' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  letterSpacing: '0.07em',
                  color: '#8E7035',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <Star size={12} fill="#C5A059" color="#C5A059" />
                <span>Titik Tonggak Permanen ({starredSnapshots.length})</span>
              </div>
              {starredSnapshots.map((snap) => renderSnapshotCard(snap))}
            </div>
          )}

          {/* Section 2: Recent Auto-Snapshots */}
          <div>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.07em',
                color: '#526861',
                textTransform: 'uppercase',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Clock size={12} />
              <span>Snapshot Otomatis ({autoSnapshots.length})</span>
            </div>
            {loading && (
              <div style={{ textAlign: 'center', padding: '20px 10px', color: '#687E77', fontSize: '12px' }}>
                Memuat riwayat snapshot vault...
              </div>
            )}
            {!loading && autoSnapshots.length === 0 && starredSnapshots.length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '30px 10px',
                  color: '#687E77',
                  fontSize: '12px',
                }}
              >
                Belum ada snapshot tersimpan. Snapshot akan dibuat otomatis saat Anda menyusun jadwal.
              </div>
            )}
            {autoSnapshots.map((snap) => renderSnapshotCard(snap))}
          </div>
        </div>

        {/* Footer */}
        <div className="s5-drawer-footer">
          <button
            onClick={onClose}
            style={{
              padding: '7px 16px',
              borderRadius: '7px',
              border: '0.75px solid #CCD8D2',
              background: '#FFFFFF',
              color: '#3B504A',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Tutup (Esc)
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Restore */}
      {confirmRestoreId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 350,
            padding: '16px',
          }}
          onClick={() => setConfirmRestoreId(null)}
        >
          <div
            style={{
              width: '420px',
              background: '#FFFFFF',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginBottom: '12px',
                color: '#8F2D24',
              }}
            >
              <AlertTriangle size={20} />
              <strong style={{ fontSize: '15px' }}>Konfirmasi Pemulihan Data</strong>
            </div>
            <p style={{ fontSize: '12.5px', color: '#3B504A', lineHeight: 1.5, marginBottom: '16px' }}>
              Anda akan memulihkan data madrasah ke titik snapshot ini. Sistem akan secara otomatis
              membuat salinan keselamatan dari kondisi saat ini, sehingga tindakan ini aman dan dapat
              dibatalkan kembali.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setConfirmRestoreId(null)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '7px',
                  border: '0.75px solid #CCD8D2',
                  background: '#FFFFFF',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Batal
              </button>
              <button
                onClick={() => executeRestore(confirmRestoreId)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '7px',
                  border: 'none',
                  background: '#124037',
                  color: '#FFFFFF',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Ya, Pulihkan Sekarang
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderSnapshotCard(snap: StateSnapshot) {
    return (
      <div key={snap.id} className={`s5-snapshot-card ${snap.isStarred ? 'starred' : ''}`}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '8px',
            marginBottom: '4px',
          }}
        >
          <div>
            <strong
              style={{
                fontSize: '13px',
                color: '#0F201C',
                display: 'block',
                lineHeight: 1.3,
              }}
            >
              {snap.label}
            </strong>
            <small
              style={{
                fontSize: '11px',
                color: '#526861',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                marginTop: '2px',
              }}
            >
              <Calendar size={11} /> {formatTimestamp(snap.timestamp)}
            </small>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={(e) => handleToggleStar(snap.id, e)}
              title={snap.isStarred ? 'Hapus Bintang' : 'Tandai Bintang (Kebal Purge)'}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: snap.isStarred ? '#C5A059' : '#A1B2AC',
                padding: '4px',
              }}
            >
              <Star size={15} fill={snap.isStarred ? '#C5A059' : 'none'} />
            </button>
            <button
              onClick={(e) => handleDelete(snap.id, e)}
              title="Hapus Snapshot Ini"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#A1B2AC',
                padding: '4px',
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        <div
          style={{
            fontSize: '11px',
            color: '#3B504A',
            marginBottom: '10px',
            lineHeight: 1.4,
          }}
        >
          {snap.diffSummary?.description}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => setConfirmRestoreId(snap.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '6px',
              border: '0.75px solid #CCD8D2',
              background: '#FFFFFF',
              color: '#124037',
              fontSize: '11px',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.14s ease',
            }}
          >
            <RotateCcw size={12} />
            <span>Pulihkan Titik Ini</span>
          </button>
        </div>
      </div>
    );
  }
};
