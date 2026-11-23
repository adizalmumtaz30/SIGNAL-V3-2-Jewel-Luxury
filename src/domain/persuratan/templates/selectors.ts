import { SYSTEM_DOCUMENT_TEMPLATES, TEMPLATE_CATEGORIES } from './registry';
import type {
  DocumentTemplate,
  TemplateCategory,
  TemplateCollection,
  TemplateFilterCriteria,
  TemplatePreferences,
} from './types';

export const DEFAULT_TEMPLATE_PREFERENCES: TemplatePreferences = {
  favoriteTemplateIds: [],
  recentTemplates: [],
  selectedTemplateId: null,
};

export const DEFAULT_TEMPLATE_FILTERS: TemplateFilterCriteria = {
  category: 'ALL',
  collection: 'ALL',
  searchQuery: '',
};

export const MAX_RECENT_TEMPLATES = 10;

export const TEMPLATE_COLLECTION_TABS: Array<{ id: TemplateCollection; label: string }> = [
  { id: 'ALL', label: 'Semua' },
  { id: 'FAVORITES', label: 'Favorit' },
  { id: 'RECENT', label: 'Terakhir Dipakai' },
  { id: 'MADRASAH', label: 'Template Madrasah' },
  { id: 'SYSTEM', label: 'Template Bawaan' },
];

export const VALID_TEMPLATE_CATEGORIES = new Set<TemplateCategory>(
  TEMPLATE_CATEGORIES.map((c) => c.id)
);

/**
 * Merges read-only SYSTEM templates with persisted MADRASAH/USER clones without mutating SYSTEM items.
 */
export function collectAllTemplates(customTemplates: DocumentTemplate[] = []): DocumentTemplate[] {
  const seenIds = new Set<string>(SYSTEM_DOCUMENT_TEMPLATES.map((t) => t.id));
  const safeCustom = customTemplates.filter(
    (item) => item && typeof item.id === 'string' && !seenIds.has(item.id) && item.source !== 'SYSTEM'
  );
  return [...SYSTEM_DOCUMENT_TEMPLATES, ...safeCustom];
}

/**
 * Normalizes TemplatePreferences and drops broken/deleted template IDs while capping recent history to 10 items.
 */
export function sanitizeTemplatePreferences(
  prefs: Partial<TemplatePreferences> | undefined | null,
  availableTemplates: readonly DocumentTemplate[]
): TemplatePreferences {
  const validIds = new Set(availableTemplates.map((t) => t.id));

  const favSeen = new Set<string>();
  const favoriteTemplateIds: string[] = [];
  if (Array.isArray(prefs?.favoriteTemplateIds)) {
    for (const id of prefs.favoriteTemplateIds) {
      if (typeof id === 'string' && validIds.has(id) && !favSeen.has(id)) {
        favSeen.add(id);
        favoriteTemplateIds.push(id);
      }
    }
  }

  const recentSeen = new Set<string>();
  const rawRecent = Array.isArray(prefs?.recentTemplates) ? prefs.recentTemplates : [];
  const sortedRecent = [...rawRecent].sort((a, b) => {
    const tA = Date.parse(a?.usedAt ?? '') || 0;
    const tB = Date.parse(b?.usedAt ?? '') || 0;
    return tB - tA;
  });

  const recentTemplates: Array<{ templateId: string; usedAt: string }> = [];
  for (const item of sortedRecent) {
    if (
      item &&
      typeof item.templateId === 'string' &&
      validIds.has(item.templateId) &&
      typeof item.usedAt === 'string' &&
      !recentSeen.has(item.templateId)
    ) {
      recentSeen.add(item.templateId);
      recentTemplates.push({ templateId: item.templateId, usedAt: item.usedAt });
      if (recentTemplates.length >= MAX_RECENT_TEMPLATES) break;
    }
  }

  const selectedTemplateId =
    typeof prefs?.selectedTemplateId === 'string' && validIds.has(prefs.selectedTemplateId)
      ? prefs.selectedTemplateId
      : null;

  return {
    favoriteTemplateIds,
    recentTemplates,
    selectedTemplateId,
  };
}

export function toggleFavoriteTemplate(
  prefs: TemplatePreferences,
  templateId: string,
  availableTemplates: readonly DocumentTemplate[]
): TemplatePreferences {
  const sanitized = sanitizeTemplatePreferences(prefs, availableTemplates);
  if (!availableTemplates.some((t) => t.id === templateId)) {
    return sanitized;
  }

  const exists = sanitized.favoriteTemplateIds.includes(templateId);
  const nextFavorites = exists
    ? sanitized.favoriteTemplateIds.filter((id) => id !== templateId)
    : [...sanitized.favoriteTemplateIds, templateId];

  return {
    ...sanitized,
    favoriteTemplateIds: nextFavorites,
  };
}

export function recordRecentTemplateUsage(
  prefs: TemplatePreferences,
  templateId: string,
  availableTemplates: readonly DocumentTemplate[],
  timestamp: string = new Date().toISOString()
): TemplatePreferences {
  const sanitized = sanitizeTemplatePreferences(prefs, availableTemplates);
  if (!availableTemplates.some((t) => t.id === templateId)) {
    return sanitized;
  }

  const nextRecent = [
    { templateId, usedAt: timestamp },
    ...sanitized.recentTemplates.filter((entry) => entry.templateId !== templateId),
  ].slice(0, MAX_RECENT_TEMPLATES);

  return {
    ...sanitized,
    recentTemplates: nextRecent,
  };
}

/**
 * Computes real category counts from active templates in the current collection scope or full active registry.
 */
export function computeCategoryCounts(
  templates: readonly DocumentTemplate[]
): Record<'ALL' | TemplateCategory, number> {
  const counts: Record<'ALL' | TemplateCategory, number> = {
    ALL: 0,
    PENUGASAN: 0,
    KORESPONDENSI: 0,
    KETERANGAN: 0,
    BERITA_ACARA: 0,
    NOTULA_LAPORAN: 0,
    ADMINISTRASI: 0,
  };

  for (const tpl of templates) {
    if (tpl.status !== 'ACTIVE') continue;
    counts.ALL += 1;
    if (counts[tpl.category] !== undefined) {
      counts[tpl.category] += 1;
    }
  }
  return counts;
}

export function computeCollectionCounts(
  templates: readonly DocumentTemplate[],
  prefs: TemplatePreferences
): Record<TemplateCollection, number> {
  const active = templates.filter((t) => t.status === 'ACTIVE');
  const activeIds = new Set(active.map((t) => t.id));
  return {
    ALL: active.length,
    FAVORITES: prefs.favoriteTemplateIds.filter((id) => activeIds.has(id)).length,
    RECENT: prefs.recentTemplates.filter((r) => activeIds.has(r.templateId)).length,
    MADRASAH: active.filter((t) => t.source === 'MADRASAH' || t.source === 'USER').length,
    SYSTEM: active.filter((t) => t.source === 'SYSTEM').length,
  };
}

export function filterTemplates(
  templates: readonly DocumentTemplate[],
  criteria: TemplateFilterCriteria,
  prefs: TemplatePreferences
): DocumentTemplate[] {
  const q = criteria.searchQuery.trim().toLowerCase();
  const recentOrder = new Map<string, number>();
  prefs.recentTemplates.forEach((entry, idx) => {
    recentOrder.set(entry.templateId, idx);
  });
  const favSet = new Set(prefs.favoriteTemplateIds);

  const filtered = templates.filter((tpl) => {
    if (tpl.status !== 'ACTIVE') return false;

    if (criteria.category !== 'ALL' && tpl.category !== criteria.category) {
      return false;
    }

    if (criteria.collection === 'FAVORITES' && !favSet.has(tpl.id)) {
      return false;
    }
    if (criteria.collection === 'RECENT' && !recentOrder.has(tpl.id)) {
      return false;
    }
    if (criteria.collection === 'MADRASAH' && tpl.source !== 'MADRASAH' && tpl.source !== 'USER') {
      return false;
    }
    if (criteria.collection === 'SYSTEM' && tpl.source !== 'SYSTEM') {
      return false;
    }

    if (q) {
      const catMeta = TEMPLATE_CATEGORIES.find((c) => c.id === tpl.category);
      const haystack = [
        tpl.code,
        tpl.name,
        tpl.description,
        tpl.purpose,
        catMeta?.label ?? tpl.category,
        catMeta?.shortLabel ?? '',
        ...tpl.autoDataSources,
        ...tpl.requiredInputs,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });

  if (criteria.collection === 'RECENT') {
    return [...filtered].sort(
      (a, b) => (recentOrder.get(a.id) ?? 999) - (recentOrder.get(b.id) ?? 999)
    );
  }

  return [...filtered].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === 'MADRASAH' ? -1 : b.source === 'MADRASAH' ? 1 : 0;
    }
    return a.catalogOrder - b.catalogOrder;
  });
}

/**
 * Clones a read-only SYSTEM template (or existing MADRASAH template) into an independent MADRASAH copy.
 * Never mutates the original template.
 */
export function cloneTemplateToMadrasah(
  sourceTemplate: DocumentTemplate,
  customName: string,
  existingCustomTemplates: readonly DocumentTemplate[] = [],
  timestamp: string = new Date().toISOString()
): DocumentTemplate {
  const trimmedName = customName.trim();
  if (!trimmedName) {
    throw new Error('Nama salinan template tidak boleh kosong.');
  }

  const deepCloned = JSON.parse(JSON.stringify(sourceTemplate)) as DocumentTemplate;
  const suffixIndex = existingCustomTemplates.length + 1;
  const uniqueRandom = Math.random().toString(36).slice(2, 6).toUpperCase();
  const baseCode = sourceTemplate.code.replace(/^MAD-/, '');

  return {
    ...deepCloned,
    id: `MAD-${sourceTemplate.id.replace(/^SYS-/, '')}-${Date.now().toString(36)}-${uniqueRandom}`,
    code: `MAD-${baseCode}-${String(suffixIndex).padStart(2, '0')}`,
    catalogOrder: 100 + suffixIndex,
    name: trimmedName,
    source: 'MADRASAH',
    isReadOnly: false,
    version: '1.0.0',
    status: 'ACTIVE',
    sourceTemplateId: sourceTemplate.id,
    sourceTemplateVersion: sourceTemplate.version,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
