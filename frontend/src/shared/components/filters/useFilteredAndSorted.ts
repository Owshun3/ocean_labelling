import { useMemo } from 'react';
import type {
	FilterField, SortOption, FilterSortState, FieldExtractors,
} from './types';

/**
 * Applique en mémoire les filtres + le tri définis par le schéma sur une liste typée.
 *
 * Chaque clé du schéma doit avoir un extractor correspondant (`extractors[key]`)
 * qui renvoie la valeur à comparer côté item. Les filtres ignorent silencieusement
 * une clé sans extractor (utile pour les filtres conditionnels ou en construction).
 *
 * Le filtrage est non-destructif : si l'état du filtre est vide/null/undefined,
 * il ne contraint pas la liste.
 *
 * Le tri est stable (relativement à l'ordre d'entrée) grâce à un tie-breaker sur l'index.
 */
export function useFilteredAndSorted<T>(
	items: T[],
	filters: FilterField[],
	sorts: SortOption[],
	value: FilterSortState,
	extractors: FieldExtractors<T>,
): T[] {
	return useMemo(() => {
		// 1. Filter pass
		let result = items.filter((item) => {
			for (const field of filters) {
				const raw = value.filters?.[field.key];
				if (raw === undefined || raw === null || raw === '') continue;
				const extractor = extractors[field.key];
				if (!extractor) continue;
				const itemValue = extractor(item);
				if (!matchesFilter(field, raw, itemValue)) return false;
			}
			return true;
		});

		// 2. Sort pass
		if (value.sort && sorts.some((s) => s.key === value.sort!.key)) {
			const { key, direction } = value.sort;
			const extractor = extractors[key];
			if (extractor) {
				const mult = direction === 'desc' ? -1 : 1;
				const indexed = result.map((item, i) => ({ item, i }));
				indexed.sort((a, b) => {
					const aValue = extractor(a.item);
					const bValue = extractor(b.item);
					const cmp = compareValues(aValue, bValue);
					return cmp !== 0 ? cmp * mult : a.i - b.i;
				});
				result = indexed.map((x) => x.item);
			}
		}

		return result;
	}, [items, filters, sorts, value, extractors]);
}

function matchesFilter(field: FilterField, raw: any, itemValue: unknown): boolean {
	switch (field.kind) {
		case 'text': {
			const q = String(raw).trim().toLowerCase();
			if (!q) return true;
			return String(itemValue ?? '').toLowerCase().includes(q);
		}
		case 'chips': {
			const selected: string[] = Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : [];
			if (selected.length === 0) return true;
			// Si l'item porte une liste de valeurs (ex: tags d'espèce) → match si
			// au moins une valeur de l'item est dans la sélection (OR / union).
			if (Array.isArray(itemValue)) {
				return selected.some((v) => itemValue.includes(v));
			}
			return selected.includes(String(itemValue ?? ''));
		}
		case 'date-range': {
			const { from, to } = (raw || {}) as { from?: string; to?: string };
			if (!from && !to) return true;
			const ts = toTimestamp(itemValue);
			if (ts === null) return false;
			if (from) {
				const fromTs = Date.parse(from);
				if (Number.isFinite(fromTs) && ts < fromTs) return false;
			}
			if (to) {
				// inclusif sur la journée : ajoute 24h
				const toTs = Date.parse(to);
				if (Number.isFinite(toTs) && ts > toTs + 86_400_000) return false;
			}
			return true;
		}
		case 'bool': {
			if (raw === null || raw === undefined) return true;
			return Boolean(itemValue) === Boolean(raw);
		}
		case 'number-range': {
			const { min, max } = (raw || {}) as { min?: number; max?: number };
			const n = Number(itemValue);
			if (!Number.isFinite(n)) return false;
			if (min !== undefined && n < min) return false;
			if (max !== undefined && n > max) return false;
			return true;
		}
		default:
			return true;
	}
}

function compareValues(a: unknown, b: unknown): number {
	// null/undefined toujours après les valeurs définies (en ordre asc).
	const aN = a === null || a === undefined;
	const bN = b === null || b === undefined;
	if (aN && bN) return 0;
	if (aN) return 1;
	if (bN) return -1;
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	const at = toTimestamp(a);
	const bt = toTimestamp(b);
	if (at !== null && bt !== null) return at - bt;
	return String(a).localeCompare(String(b), 'fr', { sensitivity: 'base', numeric: true });
}

function toTimestamp(v: unknown): number | null {
	if (typeof v === 'number' && Number.isFinite(v)) return v;
	if (typeof v === 'string') {
		const t = Date.parse(v);
		return Number.isFinite(t) ? t : null;
	}
	if (v instanceof Date) return v.getTime();
	return null;
}
