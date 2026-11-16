import { useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Database,
  FileText,
  Info,
  Paperclip,
  Save,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import type { AppState } from '../../domain/types';
import type { DocumentIntakeDraft } from '../../domain/persuratan/types';
import type { DocumentTemplate } from '../../domain/persuratan/templates/types';
import { getCategoryLabel } from '../../domain/persuratan/templates/registry';
import { formatVersionDateTime } from '../../domain/scheduleSources';
import {
  getControlDomId,
  getIntakeSchemaForTemplate,
  resolveSystemAutoData,
  validateIntakeForm,
} from '../../domain/persuratan/intake/schemaRegistry';
import {
  createInitialIntakeFormValues,
  saveIntakeDraftToState,
} from '../../domain/persuratan/intake/draftEngine';
import type {
  IntakeControlDefinition,
  IntakeFormValues,
  IntakeValidationError,
} from '../../domain/persuratan/intake/types';
import './DocumentIntakeForm.css';

export interface DocumentIntakeFormProps {
  state: AppState;
  template: DocumentTemplate;
  existingDraft?: DocumentIntakeDraft | null;
  storageError?: string | null;
  onRetryStorage?: () => void;
  onSaveDraft: (
    nextState: AppState,
    savedDraft: DocumentIntakeDraft,
    isUpdate: boolean
  ) => void;
  onOpenStudio?: (draftId: string) => void;
  onBackToTemplates: () => void;
  onOpenCenter: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
}

export function DocumentIntakeForm({
  state,
  template,
  existingDraft = null,
  storageError = null,
  onRetryStorage,
  onSaveDraft,
  onOpenStudio,
  onBackToTemplates,
  onOpenCenter,
  onDirtyChange,
  onNotify,
}: DocumentIntakeFormProps) {
  const schema = useMemo(() => getIntakeSchemaForTemplate(template), [template]);
  const autoData = useMemo(() => resolveSystemAutoData(state), [state]);

  const [values, setValues] = useState<IntakeFormValues>(() =>
    createInitialIntakeFormValues(template, state, existingDraft)
  );
  const [teacherSearchByField, setTeacherSearchByField] = useState<Record<string, string>>({});
  const [submittedOnce, setSubmittedOnce] = useState<boolean>(false);
  const [validationErrors, setValidationErrors] = useState<IntakeValidationError[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(existingDraft?.id ?? null);
  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(
    existingDraft?.documentId ?? null
  );
  const [savedBanner, setSavedBanner] = useState<{
    draftId: string;
    documentId: string;
    updatedAt: string;
    isUpdate: boolean;
  } | null>(
    existingDraft
      ? {
          draftId: existingDraft.id,
          documentId: existingDraft.documentId,
          updatedAt: existingDraft.updatedAt,
          isUpdate: true,
        }
      : null
  );

  const errorSummaryRef = useRef<HTMLDivElement | null>(null);

  const activeTeachers = useMemo(
    () => state.teachers.filter((t) => t.isActive),
    [state.teachers]
  );
  const activeClasses = useMemo(
    () => state.classes.filter((c) => c.isActive),
    [state.classes]
  );
  const activeSubjects = useMemo(
    () => state.subjects.filter((s) => s.isActive),
    [state.subjects]
  );
  const teacherById = useMemo(
    () => new Map(state.teachers.map((t) => [t.id, t])),
    [state.teachers]
  );

  const markDirty = (nextValues: IntakeFormValues) => {
    setValues(nextValues);
    if (!isDirty) {
      setIsDirty(true);
      onDirtyChange?.(true);
    }
    if (submittedOnce) {
      const recheck = validateIntakeForm(template, nextValues, state);
      setValidationErrors(recheck.errors);
      setFieldErrors(recheck.fieldErrors);
    }
  };

  const setFieldValue = (key: string, nextVal: unknown) => {
    markDirty({
      ...values,
      [key]: nextVal,
    });
  };

  const toggleTeacherInMultiSelect = (fieldKey: string, teacherId: string) => {
    const current = Array.isArray(values[fieldKey])
      ? (values[fieldKey] as string[])
      : [];
    const exists = current.includes(teacherId);
    const next = exists
      ? current.filter((id) => id !== teacherId)
      : [...current, teacherId];
    setFieldValue(fieldKey, next);
  };

  // Compute completeness summary for Right Panel ("Sumber Data")
  const completenessStats = useMemo(() => {
    const requiredControls = schema.controls.filter((c) => {
      if (c.controlType === 'auto_system') {
        if (schema.baseTemplateId === 'SYS-TPL-30' && values.tampilkan_kop === 'Tidak') {
          return false;
        }
        return c.required;
      }
      return c.required;
    });

    const validationCheck = validateIntakeForm(template, values, state);
    const missingCount = requiredControls.filter(
      (c) => Boolean(validationCheck.fieldErrors[c.key])
    ).length;

    return {
      totalRequired: requiredControls.length,
      completedRequired: Math.max(0, requiredControls.length - missingCount),
      allRequiredValid: validationCheck.valid,
    };
  }, [schema, template, values, state]);

  // Selected teachers summary across all teacher fields in current form
  const selectedParticipants = useMemo(() => {
    const ids = new Set<string>();
    for (const ctrl of schema.controls) {
      if (ctrl.controlType === 'teacher_multi_select') {
        const arr = Array.isArray(values[ctrl.key]) ? (values[ctrl.key] as unknown[]) : [];
        for (const id of arr) {
          if (typeof id === 'string' && id) ids.add(id);
        }
      } else if (ctrl.controlType === 'teacher_single_select') {
        const rawVal = values[ctrl.key];
        const val = typeof rawVal === 'string' ? rawVal : '';
        if (val) ids.add(val);
      }
    }
    return Array.from(ids)
      .map((id) => teacherById.get(id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
  }, [schema.controls, values, teacherById]);

  const selectedScheduleVersion = useMemo(() => {
    const verId = typeof values.schedule_version_id === 'string' ? values.schedule_version_id : '';
    return autoData.verifiedScheduleVersions.find((v) => v.id === verId) ?? null;
  }, [autoData.verifiedScheduleVersions, values.schedule_version_id]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmittedOnce(true);

    const check = validateIntakeForm(template, values, state);
    setValidationErrors(check.errors);
    setFieldErrors(check.fieldErrors);

    if (!check.valid) {
      onNotify?.(
        `Periksa ${check.errors.length} isian yang wajib diperbaiki sebelum menyimpan draft.`,
        'warning'
      );
      setTimeout(() => errorSummaryRef.current?.focus(), 0);
      return;
    }

    const result = saveIntakeDraftToState(state, template, values, {
      existingDraftId: activeDraftId,
      existingDocumentId: activeDocumentId,
    });

    setActiveDraftId(result.draft.id);
    setActiveDocumentId(result.documentRecord.id);
    setIsDirty(false);
    onDirtyChange?.(false);
    setSavedBanner({
      draftId: result.draft.id,
      documentId: result.documentRecord.id,
      updatedAt: result.draft.updatedAt,
      isUpdate: result.isUpdate,
    });
    onSaveDraft(result.state, result.draft, result.isUpdate);
    onNotify?.(
      result.isUpdate
        ? `Draft data awal (${result.documentRecord.id}) berhasil diperbarui secara lokal.`
        : `Draft intake berhasil disimpan secara lokal (${result.documentRecord.id}).`,
      'success'
    );
  };

  const focusField = (fieldId: string) => {
    const el = document.getElementById(fieldId);
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const renderControl = (ctrl: IntakeControlDefinition) => {
    const domId = getControlDomId(ctrl.key);
    const errorMsg = fieldErrors[ctrl.key];
    const errId = `${domId}-err`;
    const isFullWidth =
      ctrl.controlType === 'textarea' ||
      ctrl.controlType === 'teacher_multi_select' ||
      ctrl.controlType === 'date_range' ||
      ctrl.controlType === 'schedule_version' ||
      ctrl.controlType === 'auto_system';

    if (ctrl.controlType === 'teacher_multi_select') {
      const selectedIds = Array.isArray(values[ctrl.key]) ? (values[ctrl.key] as string[]) : [];
      const searchQ = (teacherSearchByField[ctrl.key] ?? '').trim().toLowerCase();
      const filteredActive = activeTeachers.filter((t) => {
        if (!searchQ) return true;
        // Pencarian hanya memakai nama, kode, jabatan — tidak mengekspos NIP
        const hay = `${t.name} ${t.code} ${t.roleTitle ?? ''}`.toLowerCase();
        return hay.includes(searchQ);
      });

      return (
        <div key={ctrl.key} className="s03-field is-full">
          <label htmlFor={`${domId}-search`} className="s03-label">
            <span>
              {ctrl.label}
              {ctrl.required && <span className="s03-req" aria-hidden="true">*</span>}
            </span>
            <span className="s03-opt-tag s5-tnum">
              {selectedIds.length} guru dipilih
            </span>
          </label>

          <div
            id={domId}
            tabIndex={-1}
            className={`s03-picker-box ${errorMsg ? 'is-invalid' : ''}`}
            aria-describedby={errorMsg ? errId : undefined}
          >
            <div className="s03-picker-toolbar">
              <div className="s03-picker-search-wrap">
                <Search size={14} className="s03-picker-search-icon" aria-hidden="true" />
                <input
                  id={`${domId}-search`}
                  type="search"
                  className="s03-picker-search"
                  placeholder="Cari nama, kode, atau jabatan guru aktif…"
                  value={teacherSearchByField[ctrl.key] ?? ''}
                  onChange={(e) =>
                    setTeacherSearchByField((prev) => ({ ...prev, [ctrl.key]: e.target.value }))
                  }
                />
              </div>
              {activeTeachers.length > 0 && (
                <>
                  <button
                    type="button"
                    className="s03-mini-btn"
                    onClick={() =>
                      setFieldValue(
                        ctrl.key,
                        activeTeachers.map((t) => t.id)
                      )
                    }
                  >
                    Pilih Semua Aktif ({activeTeachers.length})
                  </button>
                  {selectedIds.length > 0 && (
                    <button
                      type="button"
                      className="s03-mini-btn"
                      onClick={() => setFieldValue(ctrl.key, [])}
                    >
                      Kosongkan
                    </button>
                  )}
                </>
              )}
            </div>

            {selectedIds.length > 0 && (
              <div className="s03-chip-row" aria-label="Peserta terpilih">
                {selectedIds.map((id) => {
                  const t = teacherById.get(id);
                  const displayName = t ? `${t.name}${!t.isActive ? ' (Nonaktif)' : ''}` : id;
                  return (
                    <span key={id} className="s03-teacher-chip">
                      <span>{displayName}</span>
                      <button
                        type="button"
                        className="s03-chip-remove"
                        aria-label={`Hapus ${displayName} dari daftar peserta`}
                        onClick={() => toggleTeacherInMultiSelect(ctrl.key, id)}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {activeTeachers.length === 0 ? (
              <div className="s03-helper" style={{ padding: '6px 2px', color: '#8f2219', fontWeight: 600 }}>
                Belum ada guru aktif pada Data Master. Tambahkan guru aktif di menu Data Master sebelum memilih peserta.
              </div>
            ) : filteredActive.length === 0 ? (
              <div className="s03-helper" style={{ padding: '6px 2px' }}>
                Tidak ada guru aktif yang cocok dengan pencarian tersebut.
              </div>
            ) : (
              <div className="s03-teacher-list" role="group" aria-label={ctrl.label}>
                {filteredActive.map((teacher) => {
                  const checked = selectedIds.includes(teacher.id);
                  return (
                    <label
                      key={teacher.id}
                      className={`s03-teacher-option ${checked ? 'is-checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTeacherInMultiSelect(ctrl.key, teacher.id)}
                      />
                      <div>
                        <span className="s03-teacher-name">{teacher.name}</span>
                        <span className="s03-teacher-meta">
                          {teacher.code}
                          {teacher.roleTitle ? ` · ${teacher.roleTitle}` : ''}
                        </span>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {ctrl.helperText && <div className="s03-helper">{ctrl.helperText}</div>}
          {errorMsg && (
            <div id={errId} className="s03-field-error" role="alert">
              <AlertCircle size={13} aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      );
    }

    if (ctrl.controlType === 'date_range') {
      const startKey = ctrl.startKey ?? `${ctrl.key}_mulai`;
      const endKey = ctrl.endKey ?? `${ctrl.key}_selesai`;
      const startId = getControlDomId(startKey);
      const endId = getControlDomId(endKey);
      const rawStart = values[startKey];
      const rawEnd = values[endKey];
      const startVal = typeof rawStart === 'string' ? rawStart : '';
      const endVal = typeof rawEnd === 'string' ? rawEnd : '';

      return (
        <div key={ctrl.key} className="s03-field is-full">
          <div className="s03-label">
            <span>
              {ctrl.label}
              {ctrl.required && <span className="s03-req" aria-hidden="true">*</span>}
            </span>
          </div>
          <div className="s03-date-range-grid">
            <div className="s03-field">
              <label htmlFor={startId} className="s03-helper" style={{ fontWeight: 700, color: '#173630' }}>
                {ctrl.startLabel ?? 'Tanggal Mulai'}
              </label>
              <input
                id={startId}
                type="date"
                className={`s03-input ${errorMsg ? 'is-invalid' : ''}`}
                aria-invalid={Boolean(errorMsg)}
                aria-describedby={errorMsg ? errId : undefined}
                value={startVal}
                onChange={(e) => setFieldValue(startKey, e.target.value)}
              />
            </div>
            <div className="s03-field">
              <label htmlFor={endId} className="s03-helper" style={{ fontWeight: 700, color: '#173630' }}>
                {ctrl.endLabel ?? 'Tanggal Selesai'}
              </label>
              <input
                id={endId}
                type="date"
                className={`s03-input ${errorMsg ? 'is-invalid' : ''}`}
                aria-invalid={Boolean(errorMsg)}
                aria-describedby={errorMsg ? errId : undefined}
                value={endVal}
                onChange={(e) => setFieldValue(endKey, e.target.value)}
              />
            </div>
          </div>
          {ctrl.helperText && <div className="s03-helper">{ctrl.helperText}</div>}
          {errorMsg && (
            <div id={errId} className="s03-field-error" role="alert">
              <AlertCircle size={13} aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      );
    }

    if (ctrl.controlType === 'schedule_version') {
      const rawSelectedId = values[ctrl.key];
      const selectedId = typeof rawSelectedId === 'string' ? rawSelectedId : '';
      return (
        <div key={ctrl.key} className="s03-field is-full">
          <label htmlFor={domId} className="s03-label">
            <span>
              {ctrl.label}
              {ctrl.required && <span className="s03-req" aria-hidden="true">*</span>}
            </span>
            {!ctrl.required && <span className="s03-opt-tag">Opsional</span>}
          </label>
          <select
            id={domId}
            className={`s03-select ${errorMsg ? 'is-invalid' : ''}`}
            aria-invalid={Boolean(errorMsg)}
            aria-describedby={errorMsg ? errId : undefined}
            value={selectedId}
            onChange={(e) => setFieldValue(ctrl.key, e.target.value)}
          >
            <option value="">
              {autoData.verifiedScheduleVersions.length === 0
                ? '— Belum ada ScheduleVersion terbit yang sah —'
                : ctrl.required
                ? '— Pilih ScheduleVersion Resmi Terverifikasi —'
                : '— Tanpa rujukan versi jadwal —'}
            </option>
            {autoData.verifiedScheduleVersions.map((ver) => (
              <option key={ver.id} value={ver.id}>
                v{ver.versionNumber} · {ver.label} ({ver.academicYearText} · {ver.semesterText} · {ver.entryCount} slot)
              </option>
            ))}
          </select>

          {autoData.hasLooseActiveScheduleWithoutVersion && (
            <div className="s03-helper" style={{ color: '#6b4914', fontWeight: 600 }}>
              Catatan: Terdapat jadwal kerja aktif tanpa ScheduleVersion resmi di riwayat publikasi. Sesuai aturan audit, jadwal kerja dan draft belum dapat dipilih sebagai dasar SK.
            </div>
          )}
          {autoData.invalidScheduleVersionCount > 0 && (
            <div className="s03-helper" style={{ color: '#8f2219', fontWeight: 600 }}>
              {autoData.invalidScheduleVersionCount} versi jadwal di riwayat gagal verifikasi fingerprint/jumlah entri sehingga disembunyikan dari dasar SK resmi.
            </div>
          )}
          {ctrl.helperText && <div className="s03-helper">{ctrl.helperText}</div>}
          {errorMsg && (
            <div id={errId} className="s03-field-error" role="alert">
              <AlertCircle size={13} aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      );
    }

    if (ctrl.controlType === 'auto_system') {
      if (ctrl.autoSourceKey === 'schedule_workload') {
        return (
          <div key={ctrl.key} className="s03-field is-full">
            <div className="s03-label">
              <span>{ctrl.label}</span>
              <span className="s03-opt-tag">Otomatis Sistem</span>
            </div>
            <div className="s03-auto-box">
              {selectedScheduleVersion ? (
                <>
                  <div>
                    <strong>Sumber Terverifikasi:</strong> {selectedScheduleVersion.label} (ID:{' '}
                    <code>{selectedScheduleVersion.id}</code> · Fingerprint:{' '}
                    <code>{selectedScheduleVersion.fingerprint}</code>)
                  </div>
                  <div className="s5-tnum">
                    <strong>Periode Tercatat:</strong> {selectedScheduleVersion.academicYearText} ·{' '}
                    {selectedScheduleVersion.semesterText} · Terbit{' '}
                    {formatVersionDateTime(selectedScheduleVersion.createdAt)} ·{' '}
                    {selectedScheduleVersion.teacherWorkloads.length} guru ber-JP
                  </div>
                </>
              ) : (
                <div style={{ color: '#8f2219', fontWeight: 600 }}>
                  Belum ada ScheduleVersion terverifikasi yang dipilih. Pilih versi jadwal resmi di atas terlebih dahulu.
                </div>
              )}
            </div>
            {errorMsg && (
              <div id={errId} className="s03-field-error" role="alert">
                <AlertCircle size={13} aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        );
      }

      const kopIncluded = !(schema.baseTemplateId === 'SYS-TPL-30' && values.tampilkan_kop === 'Tidak');
      return (
        <div key={ctrl.key} className="s03-field is-full">
          <div className="s03-label">
            <span>{ctrl.label}</span>
            <span className="s03-opt-tag">Otomatis dari Pengaturan</span>
          </div>
          <div className="s03-auto-box">
            {!kopIncluded ? (
              <div>
                Opsi <strong>Tanpa Kop Surat</strong> dipilih. Kop Surat Madrasah tidak akan disertakan pada draft awal dokumen bebas.
              </div>
            ) : (
              <>
                <div>
                  <strong>Madrasah / Kop:</strong>{' '}
                  {autoData.kop.hasSchoolIdentity
                    ? `${autoData.kop.schoolName}${autoData.kop.ministry ? ` · ${autoData.kop.ministry}` : ''}`
                    : 'Belum tersedia — lengkapi Nama Madrasah di Pengaturan'}
                </div>
                <div>
                  <strong>Pejabat Penandatangan:</strong>{' '}
                  {autoData.kop.hasSignatory
                    ? `${autoData.kop.signatoryTitle}: ${autoData.kop.signatoryName}${
                        autoData.kop.signatoryNip ? ` (NIP/NPK ${autoData.kop.signatoryNip})` : ''
                      }`
                    : 'Belum tersedia — lengkapi Nama Kepala Madrasah / Penandatangan di Pengaturan'}
                </div>
              </>
            )}
            {ctrl.helperText && <div className="s03-helper">{ctrl.helperText}</div>}
          </div>
          {errorMsg && (
            <div id={errId} className="s03-field-error" role="alert">
              <AlertCircle size={13} aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      );
    }

    if (ctrl.controlType === 'teacher_single_select') {
      const rawVal = values[ctrl.key];
      const val = typeof rawVal === 'string' ? rawVal : '';
      return (
        <div key={ctrl.key} className="s03-field">
          <label htmlFor={domId} className="s03-label">
            <span>
              {ctrl.label}
              {ctrl.required && <span className="s03-req" aria-hidden="true">*</span>}
            </span>
            {!ctrl.required && <span className="s03-opt-tag">Opsional</span>}
          </label>
          <select
            id={domId}
            className={`s03-select ${errorMsg ? 'is-invalid' : ''}`}
            aria-invalid={Boolean(errorMsg)}
            aria-describedby={errorMsg ? errId : undefined}
            value={val}
            onChange={(e) => setFieldValue(ctrl.key, e.target.value)}
          >
            <option value="">
              {activeTeachers.length === 0
                ? '— Belum ada guru aktif di Data Master —'
                : '— Pilih Pendidik Aktif —'}
            </option>
            {activeTeachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.code}{t.roleTitle ? ` · ${t.roleTitle}` : ''})
              </option>
            ))}
          </select>
          {errorMsg && (
            <div id={errId} className="s03-field-error" role="alert">
              <AlertCircle size={13} aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      );
    }

    if (ctrl.controlType === 'class_single_select') {
      const rawVal = values[ctrl.key];
      const val = typeof rawVal === 'string' ? rawVal : '';
      return (
        <div key={ctrl.key} className="s03-field">
          <label htmlFor={domId} className="s03-label">
            <span>
              {ctrl.label}
              {ctrl.required && <span className="s03-req" aria-hidden="true">*</span>}
            </span>
          </label>
          {activeClasses.length > 0 ? (
            <select
              id={domId}
              className={`s03-select ${errorMsg ? 'is-invalid' : ''}`}
              aria-invalid={Boolean(errorMsg)}
              aria-describedby={errorMsg ? errId : undefined}
              value={val}
              onChange={(e) => setFieldValue(ctrl.key, e.target.value)}
            >
              <option value="">— Pilih Kelas / Rombel —</option>
              {activeClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  Kelas {c.name} (Tingkat {c.level})
                </option>
              ))}
            </select>
          ) : (
            <input
              id={domId}
              type="text"
              className={`s03-input ${errorMsg ? 'is-invalid' : ''}`}
              aria-invalid={Boolean(errorMsg)}
              aria-describedby={errorMsg ? errId : undefined}
              placeholder="Contoh: VII-A"
              value={val}
              onChange={(e) => setFieldValue(ctrl.key, e.target.value)}
            />
          )}
          {errorMsg && (
            <div id={errId} className="s03-field-error" role="alert">
              <AlertCircle size={13} aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      );
    }

    if (ctrl.controlType === 'subject_single_select') {
      const rawVal = values[ctrl.key];
      const val = typeof rawVal === 'string' ? rawVal : '';
      return (
        <div key={ctrl.key} className="s03-field">
          <label htmlFor={domId} className="s03-label">
            <span>
              {ctrl.label}
              {ctrl.required && <span className="s03-req" aria-hidden="true">*</span>}
            </span>
          </label>
          {activeSubjects.length > 0 ? (
            <select
              id={domId}
              className={`s03-select ${errorMsg ? 'is-invalid' : ''}`}
              aria-invalid={Boolean(errorMsg)}
              aria-describedby={errorMsg ? errId : undefined}
              value={val}
              onChange={(e) => setFieldValue(ctrl.key, e.target.value)}
            >
              <option value="">— Pilih Mata Pelajaran —</option>
              {activeSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          ) : (
            <input
              id={domId}
              type="text"
              className={`s03-input ${errorMsg ? 'is-invalid' : ''}`}
              aria-invalid={Boolean(errorMsg)}
              aria-describedby={errorMsg ? errId : undefined}
              placeholder="Contoh: Matematika"
              value={val}
              onChange={(e) => setFieldValue(ctrl.key, e.target.value)}
            />
          )}
          {errorMsg && (
            <div id={errId} className="s03-field-error" role="alert">
              <AlertCircle size={13} aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      );
    }

    if (ctrl.controlType === 'select') {
      const rawVal = values[ctrl.key];
      const val = typeof rawVal === 'string' ? rawVal : '';
      return (
        <div key={ctrl.key} className="s03-field">
          <label htmlFor={domId} className="s03-label">
            <span>
              {ctrl.label}
              {ctrl.required && <span className="s03-req" aria-hidden="true">*</span>}
            </span>
            {!ctrl.required && <span className="s03-opt-tag">Opsional</span>}
          </label>
          <select
            id={domId}
            className={`s03-select ${errorMsg ? 'is-invalid' : ''}`}
            aria-invalid={Boolean(errorMsg)}
            aria-describedby={errorMsg ? errId : undefined}
            value={val}
            onChange={(e) => setFieldValue(ctrl.key, e.target.value)}
          >
            <option value="">— Pilih —</option>
            {(ctrl.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errorMsg && (
            <div id={errId} className="s03-field-error" role="alert">
              <AlertCircle size={13} aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      );
    }

    if (ctrl.controlType === 'textarea') {
      const rawVal = values[ctrl.key];
      const val = typeof rawVal === 'string' ? rawVal : '';
      return (
        <div key={ctrl.key} className="s03-field is-full">
          <label htmlFor={domId} className="s03-label">
            <span>
              {ctrl.label}
              {ctrl.required && <span className="s03-req" aria-hidden="true">*</span>}
            </span>
            {!ctrl.required && <span className="s03-opt-tag">Opsional</span>}
          </label>
          <textarea
            id={domId}
            className={`s03-textarea ${errorMsg ? 'is-invalid' : ''}`}
            aria-invalid={Boolean(errorMsg)}
            aria-describedby={errorMsg ? errId : undefined}
            placeholder={ctrl.placeholder}
            value={val}
            onChange={(e) => setFieldValue(ctrl.key, e.target.value)}
          />
          {ctrl.helperText && <div className="s03-helper">{ctrl.helperText}</div>}
          {errorMsg && (
            <div id={errId} className="s03-field-error" role="alert">
              <AlertCircle size={13} aria-hidden="true" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>
      );
    }

    const inputType =
      ctrl.controlType === 'date' ? 'date' : ctrl.controlType === 'number' ? 'number' : 'text';
    const strVal =
      values[ctrl.key] === undefined || values[ctrl.key] === null ? '' : String(values[ctrl.key]);

    return (
      <div key={ctrl.key} className={`s03-field ${isFullWidth ? 'is-full' : ''}`}>
        <label htmlFor={domId} className="s03-label">
          <span>
            {ctrl.label}
            {ctrl.required && <span className="s03-req" aria-hidden="true">*</span>}
          </span>
          {!ctrl.required && <span className="s03-opt-tag">Opsional</span>}
        </label>
        <input
          id={domId}
          type={inputType}
          className={`s03-input ${errorMsg ? 'is-invalid' : ''}`}
          aria-invalid={Boolean(errorMsg)}
          aria-describedby={errorMsg ? errId : undefined}
          placeholder={ctrl.placeholder}
          value={strVal}
          onChange={(e) => setFieldValue(ctrl.key, e.target.value)}
        />
        {ctrl.helperText && <div className="s03-helper">{ctrl.helperText}</div>}
        {errorMsg && (
          <div id={errId} className="s03-field-error" role="alert">
            <AlertCircle size={13} aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>
    );
  };

  const isMadrasahTpl = template.source === 'MADRASAH' || template.source === 'USER';

  return (
    <section className="s03-page" aria-label="Form Data Awal Dokumen S03">
      {/* Header (48px target) */}
      <header className="s03-header">
        <div>
          <nav className="s03-breadcrumb" aria-label="Jejak navigasi Persuratan">
            <button type="button" className="s03-breadcrumb-btn" onClick={onOpenCenter}>
              Persuratan &amp; Arsip
            </button>
            <span aria-hidden="true">/</span>
            <button type="button" className="s03-breadcrumb-btn" onClick={onBackToTemplates}>
              Galeri Template
            </button>
            <span aria-hidden="true">/</span>
            <span>Form Data Awal (S03)</span>
          </nav>

          <div className="s03-title-row">
            <h1 className="s03-title">{template.name}</h1>
          </div>
          <p className="s03-subtitle">
            Lengkapi hanya data kontekstual yang belum diketahui sistem sebelum naskah masuk ke Document Studio.
          </p>
        </div>

        <div className="s03-template-badges">
          <span className="s03-badge" style={{ fontFamily: 'var(--font-mono)' }}>
            {template.code} · v{template.version}
          </span>
          <span className="s03-badge">{getCategoryLabel(template.category)}</span>
          <span className={`s03-badge ${isMadrasahTpl ? '' : 'is-gold'}`}>
            {isMadrasahTpl ? 'Template Madrasah' : 'Bawaan SIGNAL (Baca-Saja)'}
          </span>
        </div>
      </header>

      {/* Step Indicator (44px target) */}
      <div className="s03-stepper" aria-label="Tahapan penyiapan dokumen">
        <ol className="s03-step-list">
          <li className="s03-step-item is-done">
            <span className="s03-step-num">1</span>
            <span>Pusat Persuratan (S01)</span>
          </li>
          <span aria-hidden="true" style={{ color: '#9ab0a8' }}>→</span>
          <li className="s03-step-item is-done">
            <span className="s03-step-num">2</span>
            <span>Galeri Template (S02)</span>
          </li>
          <span aria-hidden="true" style={{ color: '#9ab0a8' }}>→</span>
          <li className="s03-step-item is-active" aria-current="step">
            <span className="s03-step-num">3</span>
            <span>Form Data Awal (S03)</span>
          </li>
          <span aria-hidden="true" style={{ color: '#9ab0a8' }}>→</span>
          <li className="s03-step-item is-future">
            <span className="s03-step-num">4</span>
            <span>Document Studio (S04 · Tahap 6)</span>
          </li>
        </ol>
      </div>

      {/* Storage Error Alert */}
      {storageError && (
        <div className="s03-banner is-error" role="alert">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            <div>
              <strong>Penyimpanan lokal tidak tersedia</strong>
              <div>{storageError}</div>
            </div>
          </div>
          {onRetryStorage && (
            <button type="button" className="s03-mini-btn" onClick={onRetryStorage}>
              Coba Simpan Ulang
            </button>
          )}
        </div>
      )}

      {/* Honest Saved Confirmation Banner */}
      {savedBanner && (
        <div className="s03-banner is-success" role="status">
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <CheckCircle2 size={18} style={{ color: '#124037', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            <div>
              <strong>
                Draft intake berhasil disimpan secara lokal dengan ID dokumen{' '}
                <code>{savedBanner.documentId}</code>
              </strong>
              <div>
                ID Draft S03: <code>{savedBanner.draftId}</code> · Status dokumen:{' '}
                <strong>Draft (Belum Bernomor)</strong> · Snapshot data sumber dibekukan agar tidak berubah otomatis saat Data Master diperbarui.{' '}
                {onOpenStudio
                  ? 'Siap dilanjutkan ke Document Studio (S04) untuk penyuntingan naskah.'
                  : 'Siap dilanjutkan di Document Studio (S04).'}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                {onOpenStudio && (
                  <button
                    type="button"
                    className="s03-mini-btn"
                    style={{
                      background: '#0f4c3a',
                      color: '#ffffff',
                      borderColor: '#0b3c2e',
                    }}
                    onClick={() => onOpenStudio(savedBanner.draftId)}
                  >
                    <FileText size={13} aria-hidden="true" />
                    <span>Buka Document Studio (S04)</span>
                  </button>
                )}
                <button type="button" className="s03-mini-btn" onClick={onOpenCenter}>
                  <FileText size={13} aria-hidden="true" />
                  <span>Lihat di Pusat Persuratan (S01)</span>
                </button>
                <button type="button" className="s03-mini-btn" onClick={onBackToTemplates}>
                  <ArrowLeft size={13} aria-hidden="true" />
                  <span>Kembali ke Galeri Template (S02)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Validation Error Summary */}
      {validationErrors.length > 0 && (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          className="s03-banner is-error"
          role="alert"
          aria-labelledby="s03-error-summary-title"
        >
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', width: '100%' }}>
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            <div>
              <strong id="s03-error-summary-title">
                Terdapat {validationErrors.length} isian yang perlu diperbaiki sebelum menyimpan draft:
              </strong>
              <ul className="s03-error-summary-list">
                {validationErrors.map((err) => (
                  <li key={`${err.fieldKey}-${err.fieldId}`}>
                    <button
                      type="button"
                      className="s03-error-jump-btn"
                      onClick={() => focusField(err.fieldId)}
                    >
                      {err.label}: {err.message}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Main 2-Column Content (792px form + 324px right panel) */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="s03-layout-grid">
          {/* LEFT: Main Form (792px) */}
          <div className="s03-form-card">
            <div className="s03-section-head">
              <div>
                <h2 className="s03-section-title">Identitas Ringkas &amp; Isian Konteks Template</h2>
                <div className="s03-section-sub">{template.purpose}</div>
              </div>
              <span className="s03-opt-tag s5-tnum">
                {template.initialPageSettings.paperSize.toUpperCase()} ·{' '}
                {template.initialPageSettings.orientation === 'portrait' ? 'Portrait' : 'Landscape'}
              </span>
            </div>

            {template.legalNotice && (
              <div className="s03-banner is-warning" role="note" style={{ padding: '10px 13px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <Info size={16} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
                  <div>
                    <strong>Catatan Tata Naskah &amp; Kewenangan:</strong> {template.legalNotice}
                  </div>
                </div>
              </div>
            )}

            <div className="s03-fields-grid">
              {/* Metadata Dasar Dokumen (S01 linkage) */}
              <div className="s03-field">
                <label htmlFor={getControlDomId('documentTitle')} className="s03-label">
                  <span>Judul Dokumen di Arsip S01</span>
                  <span className="s03-opt-tag">Opsional (Auto)</span>
                </label>
                <input
                  id={getControlDomId('documentTitle')}
                  type="text"
                  className="s03-input"
                  placeholder={`Kosongkan untuk otomatis (${template.name})`}
                  value={typeof values.documentTitle === 'string' ? values.documentTitle : ''}
                  onChange={(e) => setFieldValue('documentTitle', e.target.value)}
                />
                <div className="s03-helper">
                  Bila dikosongkan, judul dibuat otomatis dari nama template dan konteks utama.
                </div>
              </div>

              <div className="s03-field">
                <label htmlFor={getControlDomId('documentDate')} className="s03-label">
                  <span>
                    Tanggal Dokumen <span className="s03-req" aria-hidden="true">*</span>
                  </span>
                </label>
                <input
                  id={getControlDomId('documentDate')}
                  type="date"
                  className={`s03-input ${fieldErrors.documentDate ? 'is-invalid' : ''}`}
                  aria-invalid={Boolean(fieldErrors.documentDate)}
                  aria-describedby={fieldErrors.documentDate ? `${getControlDomId('documentDate')}-err` : undefined}
                  value={typeof values.documentDate === 'string' ? values.documentDate : ''}
                  onChange={(e) => setFieldValue('documentDate', e.target.value)}
                />
                {fieldErrors.documentDate && (
                  <div id={`${getControlDomId('documentDate')}-err`} className="s03-field-error" role="alert">
                    <AlertCircle size={13} aria-hidden="true" />
                    <span>{fieldErrors.documentDate}</span>
                  </div>
                )}
              </div>

              {/* Dynamic Template-Specific Controls */}
              {schema.controls.map((ctrl) => renderControl(ctrl))}
            </div>

            {schema.supportsAttachmentNotice && (
              <div className="s03-attachment-box" role="note">
                <Paperclip size={16} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
                <div>
                  <strong>Lampiran Undangan / Berkas Pendukung (PDF/JPG/PNG — Belum Aktif di Tahap 4):</strong>{' '}
                  {schema.attachmentNoticeText}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Panel Sumber Data (324px) */}
          <aside className="s03-panel-col" aria-label="Panel Sumber Data Sistem">
            <div className="s03-side-card">
              <h2 className="s03-side-heading">
                <Database size={14} aria-hidden="true" />
                <span>Sumber Data Sistem</span>
              </h2>

              {autoData.isDemoData && (
                <div className="s03-status-pill is-demo" role="note">
                  <Info size={13} aria-hidden="true" />
                  <span>Dataset Demo Aktif</span>
                </div>
              )}

              <dl className="s03-dl">
                <div className="s03-dl-item">
                  <dt>Identitas Madrasah</dt>
                  <dd>
                    {autoData.kop.hasSchoolIdentity
                      ? autoData.kop.schoolName
                      : 'Belum tersedia (lengkapi di Pengaturan)'}
                  </dd>
                  {autoData.kop.address && (
                    <dd style={{ fontWeight: 400, fontSize: '11.5px', color: '#4c625c' }}>
                      {autoData.kop.address}
                    </dd>
                  )}
                </div>

                <div className="s03-dl-item">
                  <dt>Tahun Ajaran &amp; Semester</dt>
                  <dd>
                    {autoData.kop.academicYear || '—'} ({autoData.kop.semester || '—'})
                  </dd>
                </div>

                <div className="s03-dl-item">
                  <dt>Pejabat Penandatangan</dt>
                  <dd>
                    {autoData.kop.hasSignatory ? (
                      <>
                        {autoData.kop.signatoryTitle}: {autoData.kop.signatoryName}
                      </>
                    ) : (
                      'Belum tersedia'
                    )}
                  </dd>
                  {autoData.kop.hasSignatory && (
                    <dd style={{ fontWeight: 400, fontSize: '11.5px', color: '#4c625c' }}>
                      {autoData.kop.signatoryNip
                        ? `NIP/NPK ${autoData.kop.signatoryNip}`
                        : 'NIP/NPK belum diisi'}
                    </dd>
                  )}
                </div>

                <div className="s03-dl-item">
                  <dt>Status Sumber Otomatis</dt>
                  <dd>
                    <span className={`s03-status-pill ${autoData.kop.isComplete ? 'is-ok' : 'is-missing'}`}>
                      {autoData.kop.isComplete ? (
                        <ShieldCheck size={13} aria-hidden="true" />
                      ) : (
                        <AlertTriangle size={13} aria-hidden="true" />
                      )}
                      <span>
                        {autoData.kop.isComplete
                          ? 'Identitas & Penandatangan Siap'
                          : 'Perlu Dilengkapi di Pengaturan'}
                      </span>
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="s03-side-card">
              <h2 className="s03-side-heading">
                <Users size={14} aria-hidden="true" />
                <span>Ringkasan Peserta &amp; Konteks</span>
              </h2>

              <dl className="s03-dl">
                <div className="s03-dl-item">
                  <dt>Data Master Guru</dt>
                  <dd className="s5-tnum">
                    {autoData.activeTeachersCount} guru aktif
                    {autoData.inactiveTeachersCount > 0
                      ? ` · ${autoData.inactiveTeachersCount} nonaktif`
                      : ''}
                  </dd>
                </div>

                <div className="s03-dl-item">
                  <dt>Peserta / Pendidik Terpilih</dt>
                  {selectedParticipants.length === 0 ? (
                    <dd style={{ fontWeight: 400, color: '#5b716b' }}>
                      Belum ada guru dipilih pada form.
                    </dd>
                  ) : (
                    <dd>
                      <span className="s5-tnum">{selectedParticipants.length} peserta dipilih:</span>
                      <ul style={{ margin: '4px 0 0', paddingLeft: '16px', fontWeight: 500, fontSize: '12px' }}>
                        {selectedParticipants.slice(0, 8).map((t) => (
                          <li key={t.id}>
                            {t.name}
                            {t.roleTitle ? ` (${t.roleTitle})` : ''}
                          </li>
                        ))}
                        {selectedParticipants.length > 8 && (
                          <li>… dan {selectedParticipants.length - 8} guru lainnya</li>
                        )}
                      </ul>
                    </dd>
                  )}
                </div>

                <div className="s03-dl-item">
                  <dt>Catatan Penugasan Aktif (Konteks)</dt>
                  <dd className="s5-tnum" style={{ fontWeight: 500 }}>
                    {autoData.activeAssignmentsCount} catatan penugasan aktif di workspace
                  </dd>
                </div>

                {selectedScheduleVersion && (
                  <div className="s03-dl-item">
                    <dt>ScheduleVersion Terpilih</dt>
                    <dd style={{ fontSize: '12px' }}>
                      v{selectedScheduleVersion.versionNumber} · {selectedScheduleVersion.academicYearText} (
                      {selectedScheduleVersion.semesterText})
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="s03-side-card">
              <h2 className="s03-side-heading">
                <Building2 size={14} aria-hidden="true" />
                <span>Status Kelengkapan S03</span>
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12.25px' }}>
                <div className="s5-tnum">
                  <strong>
                    {completenessStats.completedRequired} dari {completenessStats.totalRequired}
                  </strong>{' '}
                  kelompok data wajib terpenuhi
                </div>
                <div>
                  <span
                    className={`s03-status-pill ${
                      completenessStats.allRequiredValid ? 'is-ok' : 'is-demo'
                    }`}
                  >
                    {completenessStats.allRequiredValid ? (
                      <CheckCircle2 size={13} aria-hidden="true" />
                    ) : (
                      <Calendar size={13} aria-hidden="true" />
                    )}
                    <span>
                      {completenessStats.allRequiredValid
                        ? 'Siap Disimpan sebagai Draft'
                        : 'Masih Ada Isian Wajib'}
                    </span>
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#546b65', lineHeight: 1.45 }}>
                  Saat disimpan, nilai sumber disalin menjadi snapshot tetap agar konsisten dengan arsip surat meski Data Master berubah di kemudian hari.
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Sticky Bottom Action Bar (64px) */}
        <div className="s03-action-bar">
          <div className="s03-action-meta">
            <span
              className={`s03-status-pill ${
                isDirty ? 'is-demo' : savedBanner ? 'is-ok' : 'is-demo'
              }`}
            >
              {isDirty ? (
                <AlertCircle size={13} aria-hidden="true" />
              ) : savedBanner ? (
                <CheckCircle2 size={13} aria-hidden="true" />
              ) : (
                <Info size={13} aria-hidden="true" />
              )}
              <span>
                {isDirty
                  ? 'Perubahan belum disimpan'
                  : savedBanner
                  ? 'Draft tersimpan lokal'
                  : 'Pengisian Data Awal'}
              </span>
            </span>
            <span>
              Nomor surat resmi &amp; finalisasi PDF tidak dilakukan di S03 (menunggu S04/S05).
            </span>
          </div>

          <div className="s03-action-buttons">
            <button
              type="button"
              className="s03-btn-secondary"
              onClick={onBackToTemplates}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Kembali ke Template</span>
            </button>
            {savedBanner && onOpenStudio && (
              <button
                type="button"
                className="s03-btn-secondary"
                onClick={() => onOpenStudio(savedBanner.draftId)}
              >
                <FileText size={15} aria-hidden="true" />
                <span>Buka Document Studio (S04)</span>
              </button>
            )}
            <button type="submit" className="s03-btn-primary">
              <Save size={15} aria-hidden="true" />
              <span>Simpan sebagai Draft</span>
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
