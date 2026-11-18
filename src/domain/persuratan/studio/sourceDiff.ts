import type { AppState } from '../../types';
import type { DocumentIntakeDraft, SourceSnapshotEntry } from '../types';
import { resolveSystemAutoData } from '../intake/schemaRegistry';

export interface SourceDiffItem {
  id: string;
  sourceKey: string;
  categoryLabel: string;
  fieldLabel: string;
  snapshotValue: string;
  liveValue: string;
  status: 'CHANGED' | 'UNCHANGED' | 'SOURCE_MISSING';
}

export interface SourceDiffReport {
  checkedAt: string;
  hasChanges: boolean;
  changedCount: number;
  items: SourceDiffItem[];
  changedSourceKeys: string[];
}

function deepClone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

function displayText(val: unknown): string {
  if (val === null || val === undefined) return '—';
  const s = String(val).trim();
  return s.length > 0 ? s : '—';
}

/**
 * Membandingkan snapshot sumber beku (dari S03) dengan Data Master / Settings / ScheduleVersion
 * hidup saat ini secara murni read-only tanpa mengubah naskah S04 yang telah ditulis pengguna.
 */
export function compareDraftSnapshotsWithLiveState(
  draft: DocumentIntakeDraft,
  state: AppState,
  checkedAt: string = new Date().toISOString()
): SourceDiffReport {
  const autoData = resolveSystemAutoData(state);
  const items: SourceDiffItem[] = [];
  const changedKeys = new Set<string>();

  // 1. Perbandingan Identitas Madrasah & Penandatangan
  const kopSnap = (draft.sourceSnapshots ?? []).find(
    (s) => s.sourceKey === 'settings.madrasah_identity_signatory'
  );
  if (kopSnap && kopSnap.capturedValue && typeof kopSnap.capturedValue === 'object') {
    const snapVal = kopSnap.capturedValue as Record<string, unknown>;
    const kopPairs: Array<[string, string, unknown, unknown]> = [
      ['schoolName', 'Nama Madrasah', snapVal.schoolName, autoData.kop.schoolName],
      ['academicYear', 'Tahun Ajaran', snapVal.academicYear, autoData.kop.academicYear],
      ['semester', 'Semester', snapVal.semester, autoData.kop.semester],
      ['signatoryTitle', 'Jabatan Penandatangan', snapVal.signatoryTitle, autoData.kop.signatoryTitle],
      ['signatoryName', 'Nama Penandatangan', snapVal.signatoryName, autoData.kop.signatoryName],
      ['signatoryNip', 'NIP Penandatangan', snapVal.signatoryNip, autoData.kop.signatoryNip],
      ['address', 'Alamat Madrasah', snapVal.address, autoData.kop.address],
      ['city', 'Kota / Titimangsa', snapVal.city, autoData.kop.city],
    ];

    for (const [fieldKey, label, sVal, lVal] of kopPairs) {
      const snapStr = displayText(sVal);
      const liveStr = displayText(lVal);
      const isChanged = snapStr !== liveStr;
      if (isChanged) {
        changedKeys.add('settings.madrasah_identity_signatory');
      }
      items.push({
        id: `kop-${fieldKey}`,
        sourceKey: 'settings.madrasah_identity_signatory',
        categoryLabel: 'Identitas & Kop Madrasah',
        fieldLabel: label,
        snapshotValue: snapStr,
        liveValue: liveStr,
        status: isChanged ? 'CHANGED' : 'UNCHANGED',
      });
    }
  }

  // 2. Perbandingan Data Guru Terpilih
  const teacherSnap = (draft.sourceSnapshots ?? []).find(
    (s) => s.sourceKey === 'master.teachers.selected'
  );
  if (teacherSnap && Array.isArray(teacherSnap.capturedValue)) {
    const liveTeachersById = new Map(state.teachers.map((t) => [t.id, t]));
    for (const entry of teacherSnap.capturedValue as Array<Record<string, unknown>>) {
      const id = typeof entry.id === 'string' ? entry.id : '';
      const snapSummary = `${displayText(entry.name)} (${displayText(entry.code)}${
        entry.roleTitle ? ` · ${entry.roleTitle}` : ''
      })`;
      const live = liveTeachersById.get(id);
      if (!live) {
        changedKeys.add('master.teachers.selected');
        items.push({
          id: `teacher-${id}`,
          sourceKey: 'master.teachers.selected',
          categoryLabel: 'Data Master Guru',
          fieldLabel: `Guru ID ${id}`,
          snapshotValue: snapSummary,
          liveValue: 'Tidak ditemukan di Data Master saat ini',
          status: 'SOURCE_MISSING',
        });
      } else {
        const liveSummary = `${displayText(live.name)} (${displayText(live.code)}${
          live.roleTitle ? ` · ${live.roleTitle}` : ''
        })`;
        const isChanged = snapSummary !== liveSummary || !live.isActive;
        if (isChanged) {
          changedKeys.add('master.teachers.selected');
        }
        items.push({
          id: `teacher-${id}`,
          sourceKey: 'master.teachers.selected',
          categoryLabel: 'Data Master Guru',
          fieldLabel: `Personel (${live.code})`,
          snapshotValue: snapSummary,
          liveValue: live.isActive ? liveSummary : `${liveSummary} [Nonaktif]`,
          status: isChanged ? 'CHANGED' : 'UNCHANGED',
        });
      }
    }
  }

  // 3. Perbandingan Versi Jadwal Resmi (ScheduleVersion)
  const schedSnap = (draft.sourceSnapshots ?? []).find(
    (s) => s.sourceKey === 'history.schedule_version'
  );
  if (schedSnap && schedSnap.capturedValue && typeof schedSnap.capturedValue === 'object') {
    const snapVer = schedSnap.capturedValue as Record<string, unknown>;
    const boundId = typeof snapVer.id === 'string' ? snapVer.id : '';
    const liveMatched = autoData.verifiedScheduleVersions.find((v) => v.id === boundId);
    const latestOfficial = autoData.verifiedScheduleVersions[0];

    if (!liveMatched) {
      changedKeys.add('history.schedule_version');
      items.push({
        id: 'schedule-bound',
        sourceKey: 'history.schedule_version',
        categoryLabel: 'Versi Jadwal Resmi',
        fieldLabel: 'ScheduleVersion Terikat',
        snapshotValue: `v${displayText(snapVer.versionNumber)} (${displayText(snapVer.fingerprint)})`,
        liveValue: latestOfficial
          ? `Versi asal tidak aktif; terbaru resmi: v${latestOfficial.versionNumber} (${latestOfficial.fingerprint})`
          : 'Tidak ada ScheduleVersion resmi terverifikasi saat ini',
        status: 'SOURCE_MISSING',
      });
    } else if (latestOfficial && latestOfficial.id !== liveMatched.id) {
      changedKeys.add('history.schedule_version');
      items.push({
        id: 'schedule-newer',
        sourceKey: 'history.schedule_version',
        categoryLabel: 'Versi Jadwal Resmi',
        fieldLabel: 'Versi Jadwal Terbit Terbaru',
        snapshotValue: `v${liveMatched.versionNumber} · ${liveMatched.label} (${liveMatched.fingerprint})`,
        liveValue: `Tersedia versi lebih baru: v${latestOfficial.versionNumber} · ${latestOfficial.label} (${latestOfficial.fingerprint})`,
        status: 'CHANGED',
      });
    } else {
      items.push({
        id: 'schedule-bound',
        sourceKey: 'history.schedule_version',
        categoryLabel: 'Versi Jadwal Resmi',
        fieldLabel: 'ScheduleVersion Terikat',
        snapshotValue: `v${liveMatched.versionNumber} (${liveMatched.fingerprint})`,
        liveValue: `v${liveMatched.versionNumber} (${liveMatched.fingerprint})`,
        status: 'UNCHANGED',
      });
    }
  }

  const changedCount = items.filter((i) => i.status !== 'UNCHANGED').length;

  return {
    checkedAt,
    hasChanges: changedCount > 0,
    changedCount,
    items,
    changedSourceKeys: Array.from(changedKeys),
  };
}

/**
 * Memperbarui snapshot sumber yang DIPILIH secara eksplisit pada draft S03/S04
 * TANPA menimpa konten teks yang telah disunting pengguna pada `draft.studio.content`.
 */
export function adoptSelectedSourceUpdatesToDraft(
  state: AppState,
  draftId: string,
  sourceKeys: string[],
  timestamp: string = new Date().toISOString()
): { state: AppState; draft: DocumentIntakeDraft; updatedKeys: string[] } {
  const drafts = state.intakeDrafts ?? [];
  const targetDraft = drafts.find((d) => d.id === draftId);
  if (!targetDraft) {
    throw new Error('Draft dokumen tidak ditemukan untuk pembaruan snapshot sumber.');
  }

  const selectedSet = new Set(sourceKeys);
  const autoData = resolveSystemAutoData(state);
  const updatedKeys: string[] = [];
  let nextScheduleVersionId = targetDraft.scheduleVersionId ?? null;
  let nextScheduleVersionFingerprint = targetDraft.scheduleVersionFingerprint ?? null;

  const nextSnapshots: SourceSnapshotEntry[] = targetDraft.sourceSnapshots.map((snap) => {
    if (!selectedSet.has(snap.sourceKey)) {
      return snap;
    }

    if (snap.sourceKey === 'settings.madrasah_identity_signatory') {
      updatedKeys.push(snap.sourceKey);
      return {
        ...snap,
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
        capturedAt: timestamp,
        isDemoData: autoData.isDemoData,
        status: autoData.kop.isComplete ? 'VERIFIED' : 'MISSING',
      };
    }

    if (snap.sourceKey === 'master.teachers.selected') {
      updatedKeys.push(snap.sourceKey);
      const liveById = new Map(state.teachers.map((t) => [t.id, t]));
      const nextTeachers = targetDraft.relatedTeacherIds.map((id) => {
        const t = liveById.get(id);
        return t
          ? { id: t.id, code: t.code, name: t.name, roleTitle: t.roleTitle ?? null }
          : { id, code: null, name: id, roleTitle: null };
      });
      return {
        ...snap,
        capturedValue: deepClone(nextTeachers),
        capturedAt: timestamp,
        isDemoData: autoData.isDemoData,
        status: 'VERIFIED',
      };
    }

    if (snap.sourceKey === 'history.schedule_version' && autoData.verifiedScheduleVersions.length > 0) {
      const latest = autoData.verifiedScheduleVersions[0];
      updatedKeys.push(snap.sourceKey);
      nextScheduleVersionId = latest.id;
      nextScheduleVersionFingerprint = latest.fingerprint;
      return {
        ...snap,
        sourceIdentity: `${latest.id}@${latest.fingerprint}`,
        capturedValue: deepClone(latest),
        capturedAt: timestamp,
        isDemoData: autoData.isDemoData,
        status: 'VERIFIED',
      };
    }

    return snap;
  });

  const nextDraft: DocumentIntakeDraft = {
    ...targetDraft,
    scheduleVersionId: nextScheduleVersionId,
    scheduleVersionFingerprint: nextScheduleVersionFingerprint,
    sourceSnapshots: nextSnapshots,
    updatedAt: timestamp,
  };

  const nextState: AppState = {
    ...state,
    intakeDrafts: drafts.map((d) => (d.id === draftId ? nextDraft : d)),
    documents: (state.documents ?? []).map((doc) =>
      doc.id === nextDraft.documentId
        ? {
            ...doc,
            scheduleVersionId: nextScheduleVersionId,
            updatedAt: timestamp,
          }
        : doc
    ),
  };

  return {
    state: nextState,
    draft: nextDraft,
    updatedKeys,
  };
}
