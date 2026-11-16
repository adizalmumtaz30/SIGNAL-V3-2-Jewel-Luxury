import type { AppState } from '../../types';
import type {
  DocumentIntakeDraft,
  DocumentRecord,
  FieldProvenance,
  SourceSnapshotEntry,
  TemplateSnapshot,
} from '../types';
import type { DocumentTemplate } from '../templates/types';
import { getIntakeSchemaForTemplate, resolveSystemAutoData, validateIntakeForm } from './schemaRegistry';
import type { IntakeFormValues, SaveIntakeDraftResult } from './types';

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function createInitialIntakeFormValues(
  template: DocumentTemplate,
  state: AppState,
  existingDraft?: DocumentIntakeDraft | null
): IntakeFormValues {
  if (existingDraft) {
    return {
      ...deepClone(existingDraft.fieldValues),
      documentTitle: existingDraft.title,
      documentDate: existingDraft.documentDate,
    };
  }

  const schema = getIntakeSchemaForTemplate(template);
  const autoData = resolveSystemAutoData(state);
  const initial: IntakeFormValues = {
    documentTitle: '',
    documentDate: getTodayIsoDate(),
  };

  for (const ctrl of schema.controls) {
    if (ctrl.controlType === 'teacher_multi_select') {
      initial[ctrl.key] = [];
    } else if (ctrl.controlType === 'date_range') {
      initial[ctrl.startKey ?? `${ctrl.key}_mulai`] = '';
      initial[ctrl.endKey ?? `${ctrl.key}_selesai`] = '';
    } else if (ctrl.controlType === 'select') {
      if (ctrl.key === 'tampilkan_kop') {
        initial[ctrl.key] = 'Ya';
      } else {
        initial[ctrl.key] = '';
      }
    } else if (ctrl.controlType === 'schedule_version') {
      // Auto-select latest valid official ScheduleVersion when required (user can still inspect/switch)
      initial[ctrl.key] =
        ctrl.required && autoData.verifiedScheduleVersions.length > 0
          ? autoData.verifiedScheduleVersions[0].id
          : '';
    } else if (ctrl.controlType === 'auto_system') {
      // AUTO_SYSTEM values are resolved cleanly as snapshots on save rather than mutable text inputs
      initial[ctrl.key] = ctrl.autoSourceKey ?? 'auto';
    } else {
      initial[ctrl.key] = '';
    }
  }

  return initial;
}

export function deriveDocumentMetadata(
  template: DocumentTemplate,
  values: IntakeFormValues,
  state: AppState
): {
  title: string;
  subject: string;
  documentDate: string;
  counterpartName?: string;
  relatedTeacherIds: string[];
  scheduleVersionId: string | null;
} {
  const schema = getIntakeSchemaForTemplate(template);
  const manualTitle = typeof values.documentTitle === 'string' ? values.documentTitle.trim() : '';

  const candidateHeading =
    (typeof values.nama_kegiatan === 'string' && values.nama_kegiatan.trim()) ||
    (typeof values.judul_dokumen === 'string' && values.judul_dokumen.trim()) ||
    (typeof values.perihal === 'string' && values.perihal.trim()) ||
    (typeof values.nama_kepanitiaan === 'string' && values.nama_kepanitiaan.trim()) ||
    (typeof values.jenis_ujian === 'string' && values.jenis_ujian.trim()) ||
    (typeof values.judul_rapat === 'string' && values.judul_rapat.trim()) ||
    (typeof values.hal_nota === 'string' && values.hal_nota.trim()) ||
    (typeof values.topik === 'string' && values.topik.trim()) ||
    '';

  const title = manualTitle || (candidateHeading ? `${template.name}: ${candidateHeading}` : template.name);

  const subject =
    (typeof values.perihal === 'string' && values.perihal.trim()) ||
    (typeof values.agenda === 'string' && values.agenda.trim()) ||
    (typeof values.agenda_rapat === 'string' && values.agenda_rapat.trim()) ||
    (typeof values.nama_kegiatan === 'string' && values.nama_kegiatan.trim()) ||
    (typeof values.keperluan === 'string' && values.keperluan.trim()) ||
    (typeof values.uraian_tugas === 'string' && values.uraian_tugas.trim()) ||
    template.purpose;

  const counterpartName =
    (typeof values.penyelenggara === 'string' && values.penyelenggara.trim()) ||
    (typeof values.instansi_tujuan === 'string' && values.instansi_tujuan.trim()) ||
    (typeof values.tempat_tujuan === 'string' && values.tempat_tujuan.trim()) ||
    (typeof values.kepada === 'string' && values.kepada.trim()) ||
    (typeof values.pihak_tujuan === 'string' && values.pihak_tujuan.trim()) ||
    (typeof values.penerima === 'string' && values.penerima.trim()) ||
    (typeof values.instansi_mitra === 'string' && values.instansi_mitra.trim()) ||
    (typeof values.narasumber === 'string' && values.narasumber.trim()) ||
    undefined;

  const relatedTeacherSet = new Set<string>();
  const validActiveIds = new Set(state.teachers.filter((t) => t.isActive).map((t) => t.id));
  const allTeacherIds = new Set(state.teachers.map((t) => t.id));

  for (const ctrl of schema.controls) {
    if (ctrl.controlType === 'teacher_multi_select') {
      const arr = Array.isArray(values[ctrl.key]) ? (values[ctrl.key] as unknown[]) : [];
      for (const id of arr) {
        if (typeof id === 'string' && (validActiveIds.has(id) || allTeacherIds.has(id))) {
          relatedTeacherSet.add(id);
        }
      }
    } else if (ctrl.controlType === 'teacher_single_select') {
      const rawId = values[ctrl.key];
      const id = typeof rawId === 'string' ? rawId.trim() : '';
      if (id && (validActiveIds.has(id) || allTeacherIds.has(id))) {
        relatedTeacherSet.add(id);
      }
    }
  }

  const rawDate = typeof values.documentDate === 'string' ? values.documentDate.trim() : '';
  const documentDate = rawDate || getTodayIsoDate();

  const scheduleVersionId =
    typeof values.schedule_version_id === 'string' && values.schedule_version_id.trim()
      ? values.schedule_version_id.trim()
      : null;

  return {
    title,
    subject,
    documentDate,
    counterpartName,
    relatedTeacherIds: Array.from(relatedTeacherSet),
    scheduleVersionId,
  };
}

export function buildSourceSnapshots(
  template: DocumentTemplate,
  values: IntakeFormValues,
  state: AppState,
  capturedAt: string
): SourceSnapshotEntry[] {
  const autoData = resolveSystemAutoData(state);
  const schema = getIntakeSchemaForTemplate(template);
  const snapshots: SourceSnapshotEntry[] = [];

  // 1. Snapshot Kop Surat & Penandatangan dari Pengaturan Madrasah
  snapshots.push({
    sourceKey: 'settings.madrasah_identity_signatory',
    sourceLabel: 'Identitas Madrasah & Pejabat Penandatangan',
    provenance: 'AUTO_SYSTEM',
    sourceIdentity: `${state.settings.academicYear}-${state.settings.semester}`,
    capturedValue: deepClone({
      schoolName: autoData.kop.schoolName || null,
      ministry: autoData.kop.ministry || null,
      regionalOffice: autoData.kop.regionalOffice || null,
      address: autoData.kop.address || null,
      city: autoData.kop.city || null,
      academicYear: autoData.kop.academicYear || null,
      semester: autoData.kop.semester || null,
      signatoryTitle: autoData.kop.signatoryTitle,
      signatoryName: autoData.kop.signatoryName || null,
      signatoryNip: autoData.kop.signatoryNip || null,
    }),
    capturedAt,
    isDemoData: autoData.isDemoData,
    status: autoData.kop.isComplete ? 'VERIFIED' : 'MISSING',
  });

  // 2. Snapshot Guru Terpilih (tanpa live-binding ke Data Master; nama, kode, jabatan dibekukan)
  const meta = deriveDocumentMetadata(template, values, state);
  if (meta.relatedTeacherIds.length > 0) {
    const teacherById = new Map(state.teachers.map((t) => [t.id, t]));
    const capturedTeachers = meta.relatedTeacherIds.map((id) => {
      const t = teacherById.get(id);
      return t
        ? {
            id: t.id,
            code: t.code,
            name: t.name,
            roleTitle: t.roleTitle ?? null,
          }
        : { id, code: null, name: id, roleTitle: null };
    });
    snapshots.push({
      sourceKey: 'master.teachers.selected',
      sourceLabel: 'Data Master Guru Terpilih',
      provenance: 'OPERATOR_INPUT',
      sourceIdentity: meta.relatedTeacherIds.join(','),
      capturedValue: deepClone(capturedTeachers),
      capturedAt,
      isDemoData: autoData.isDemoData,
      status: 'VERIFIED',
    });
  }

  // 3. Snapshot ScheduleVersion resmi terverifikasi jika dipilih/dibutuhkan
  if (meta.scheduleVersionId) {
    const ver = autoData.verifiedScheduleVersions.find((v) => v.id === meta.scheduleVersionId);
    snapshots.push({
      sourceKey: 'history.schedule_version',
      sourceLabel: 'Versi Jadwal Terbit Resmi (ScheduleVersion)',
      provenance: schema.controls.some((c) => c.key === 'daftar_beban_jp')
        ? 'AUTO_SYSTEM'
        : 'OPERATOR_INPUT',
      sourceIdentity: ver ? `${ver.id}@${ver.fingerprint}` : meta.scheduleVersionId,
      capturedValue: ver ? deepClone(ver) : null,
      capturedAt,
      isDemoData: autoData.isDemoData,
      status: ver ? 'VERIFIED' : 'MISSING',
    });
  }

  // 4. Snapshot Kelas / Mapel jika template memakai referensi master kelas/mapel
  if (typeof values.kelas_id === 'string' && values.kelas_id.trim()) {
    const cls = state.classes.find((c) => c.id === values.kelas_id);
    snapshots.push({
      sourceKey: 'master.classes.selected',
      sourceLabel: 'Data Master Kelas / Rombel',
      provenance: 'OPERATOR_INPUT',
      sourceIdentity: cls?.id ?? values.kelas_id,
      capturedValue: cls ? deepClone({ id: cls.id, name: cls.name, level: cls.level }) : values.kelas_id,
      capturedAt,
      isDemoData: autoData.isDemoData,
      status: cls ? 'VERIFIED' : 'UNVERIFIED',
    });
  }

  if (typeof values.mapel === 'string' && values.mapel.trim()) {
    const subj = state.subjects.find((s) => s.id === values.mapel);
    snapshots.push({
      sourceKey: 'master.subjects.selected',
      sourceLabel: 'Data Master Mata Pelajaran',
      provenance: 'OPERATOR_INPUT',
      sourceIdentity: subj?.id ?? values.mapel,
      capturedValue: subj ? deepClone({ id: subj.id, code: subj.code, name: subj.name }) : values.mapel,
      capturedAt,
      isDemoData: autoData.isDemoData,
      status: subj ? 'VERIFIED' : 'UNVERIFIED',
    });
  }

  return snapshots;
}

export function buildTemplateSnapshot(template: DocumentTemplate, capturedAt: string): TemplateSnapshot {
  return deepClone({
    templateId: template.id,
    code: template.code,
    name: template.name,
    category: template.category,
    documentKind: template.documentKind,
    version: template.version,
    source: template.source,
    sourceTemplateId: template.sourceTemplateId ?? null,
    sourceTemplateVersion: template.sourceTemplateVersion ?? null,
    initialPageSettings: template.initialPageSettings,
    documentHeader: template.documentHeader,
    capturedAt,
  });
}

function generateStableIntakeIds(): { draftId: string; documentId: string } {
  const token = `${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  return {
    draftId: `INTK-${token}`,
    documentId: `DOC-${token}`,
  };
}

export interface SaveIntakeDraftOptions {
  existingDraftId?: string | null;
  existingDocumentId?: string | null;
  timestamp?: string;
}

/**
 * Memvalidasi Form Data Awal S03 lalu menyimpan DocumentIntakeDraft (snapshot sumber & template)
 * serta DocumentRecord berstatus DRAFT ke AppState tanpa memutasi template asal atau Data Master.
 * Mendukung upsert idempoten berbasis draftId stabil agar edit ulang tidak membuat duplikat.
 */
export function saveIntakeDraftToState(
  state: AppState,
  template: DocumentTemplate,
  values: IntakeFormValues,
  options?: SaveIntakeDraftOptions
): SaveIntakeDraftResult {
  const validation = validateIntakeForm(template, values, state);
  if (!validation.valid) {
    throw new Error(validation.errors[0]?.message ?? 'Data Form Awal S03 belum valid.');
  }

  const now = options?.timestamp ?? new Date().toISOString();
  const existingDrafts = Array.isArray(state.intakeDrafts) ? state.intakeDrafts : [];
  const existingDocs = Array.isArray(state.documents) ? state.documents : [];

  const matchedDraft = options?.existingDraftId
    ? existingDrafts.find((d) => d.id === options.existingDraftId)
    : undefined;

  const generated = generateStableIntakeIds();
  const draftId = matchedDraft?.id ?? options?.existingDraftId ?? generated.draftId;
  const documentId =
    matchedDraft?.documentId ?? options?.existingDocumentId ?? generated.documentId;

  const matchedDoc = existingDocs.find((d) => d.id === documentId);
  const isUpdate = Boolean(matchedDraft);

  const schema = getIntakeSchemaForTemplate(template);
  const meta = deriveDocumentMetadata(template, values, state);
  const sourceSnapshots = buildSourceSnapshots(template, values, state, now);
  const templateSnapshot = buildTemplateSnapshot(template, now);

  const cleanFieldValues: Record<string, unknown> = {};
  const fieldProvenance: Record<string, FieldProvenance> = {};

  for (const ctrl of schema.controls) {
    if (ctrl.controlType === 'date_range') {
      const startKey = ctrl.startKey ?? `${ctrl.key}_mulai`;
      const endKey = ctrl.endKey ?? `${ctrl.key}_selesai`;
      cleanFieldValues[startKey] =
        typeof values[startKey] === 'string' ? values[startKey].trim() : '';
      cleanFieldValues[endKey] =
        typeof values[endKey] === 'string' ? values[endKey].trim() : '';
      fieldProvenance[startKey] = ctrl.provenance;
      fieldProvenance[endKey] = ctrl.provenance;
      continue;
    }
    if (ctrl.controlType === 'auto_system') {
      const matchingSnap = sourceSnapshots.find((s) =>
        ctrl.autoSourceKey === 'schedule_workload'
          ? s.sourceKey === 'history.schedule_version'
          : s.sourceKey === 'settings.madrasah_identity_signatory'
      );
      cleanFieldValues[ctrl.key] = deepClone(matchingSnap?.capturedValue ?? null);
      fieldProvenance[ctrl.key] = 'AUTO_SYSTEM';
      continue;
    }
    cleanFieldValues[ctrl.key] = deepClone(values[ctrl.key] ?? '');
    fieldProvenance[ctrl.key] = ctrl.provenance;
  }

  const matchedScheduleVer = meta.scheduleVersionId
    ? validation.resolvedAutoData.verifiedScheduleVersions.find(
        (v) => v.id === meta.scheduleVersionId
      )
    : undefined;

  const draft: DocumentIntakeDraft = {
    id: draftId,
    documentId,
    templateId: template.id,
    templateVersion: template.version,
    intakeStatus: 'READY_FOR_EDITOR',
    title: meta.title,
    subject: meta.subject,
    documentDate: meta.documentDate,
    counterpartName: meta.counterpartName,
    relatedTeacherIds: [...meta.relatedTeacherIds],
    scheduleVersionId: meta.scheduleVersionId,
    scheduleVersionFingerprint: matchedScheduleVer?.fingerprint ?? null,
    fieldValues: cleanFieldValues,
    fieldProvenance,
    templateSnapshot,
    sourceSnapshots,
    createdAt: matchedDraft?.createdAt ?? now,
    updatedAt: now,
  };

  const documentRecord: DocumentRecord = {
    id: documentId,
    direction: 'OUTGOING',
    documentType: template.documentKind,
    documentNumber: matchedDoc?.documentNumber ?? null,
    title: meta.title,
    subject: meta.subject,
    documentDate: meta.documentDate,
    counterpartName: meta.counterpartName,
    status: 'DRAFT',
    relatedTeacherIds: [...meta.relatedTeacherIds],
    tags: Array.from(
      new Set([
        ...(matchedDoc?.tags ?? []),
        template.code,
        'Context-S03',
      ])
    ),
    createdAt: matchedDoc?.createdAt ?? now,
    updatedAt: now,
    archivedAt: null,
    intakeDraftId: draft.id,
    templateId: template.id,
    templateVersion: template.version,
    scheduleVersionId: meta.scheduleVersionId,
  };

  const nextIntakeDrafts = matchedDraft
    ? existingDrafts.map((d) => (d.id === draft.id ? draft : d))
    : [draft, ...existingDrafts];

  const nextDocuments = matchedDoc
    ? existingDocs.map((d) => (d.id === documentRecord.id ? documentRecord : d))
    : [documentRecord, ...existingDocs];

  const nextState: AppState = {
    ...state,
    documents: nextDocuments,
    intakeDrafts: nextIntakeDrafts,
  };

  return {
    state: nextState,
    draft,
    documentRecord,
    isUpdate,
    template,
    sourceSnapshots,
  };
}
