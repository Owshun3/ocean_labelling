import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import type { FilterField, FilterSortState, SortOption } from './types';
import { FieldControl } from './FieldControl';
import { filterStyles as styles } from './styles';
import { COLORS } from '@/shared/theme/colors';

interface FilterSortBarProps {
	filters: FilterField[];
	sorts: SortOption[];
	value: FilterSortState;
	onChange: (next: FilterSortState) => void;
	totalCount?: number;
	resultCount?: number;
	/** Clé du filtre `text` à exposer toujours visible dans la barre principale. */
	searchKey?: string;
	/**
	 * État par défaut (filtres + tri) auquel le bouton « Réinitialiser tout »
	 * remettra l'écran. Quand `value` diffère de `defaultState`, le bouton
	 * apparaît dans la barre du haut.
	 */
	defaultState?: FilterSortState;
}

type OpenPanel = 'filters' | 'sort' | null;

/**
 * Barre filtres/tris réutilisable en accordéon.
 * - Recherche (si `searchKey` correspond à un filtre text) toujours visible.
 * - Bouton « Filtres (N) » déplie un panneau avec tous les autres champs.
 * - Bouton « Trier : X ↑↓ » déplie une radio-list + boutons asc/desc explicites.
 *
 * Les panneaux sont mutuellement exclusifs (un clic ferme l'autre).
 */
export function FilterSortBar({
	filters, sorts, value, onChange,
	totalCount, resultCount, searchKey, defaultState,
}: FilterSortBarProps) {
	const [openPanel, setOpenPanel] = useState<OpenPanel>(null);

	const canReset = !!defaultState && !isSameState(value, defaultState);
	const handleResetAll = () => { if (defaultState) onChange(defaultState); };

	const searchField = useMemo(
		() => filters.find((f): f is Extract<FilterField, { kind: 'text' }> => f.key === searchKey && f.kind === 'text'),
		[filters, searchKey],
	);
	const panelFilters = useMemo(
		() => filters.filter((f) => f.key !== searchKey),
		[filters, searchKey],
	);

	const setFilterValue = (key: string, next: any) =>
		onChange({ ...value, filters: { ...value.filters, [key]: next } });

	const activeFilterCount = countActiveFilters(filters, value.filters);
	const sortSummary = buildSortSummary(value.sort, sorts);
	const togglePanel = (panel: OpenPanel) =>
		setOpenPanel((prev) => (prev === panel ? null : panel));

	return (
		<View style={styles.container}>
			<View style={styles.topBar}>
				{searchField ? (
					<SearchInput
						value={(value.filters?.[searchField.key] as string) ?? ''}
						placeholder={searchField.placeholder}
						onChange={(t) => setFilterValue(searchField.key, t)}
					/>
				) : null}

				{panelFilters.length > 0 ? (
					<FiltersToggle
						count={activeFilterCount}
						open={openPanel === 'filters'}
						onToggle={() => togglePanel('filters')}
					/>
				) : null}

				{sorts.length > 0 ? (
					<SortToggle
						summary={sortSummary}
						open={openPanel === 'sort'}
						onToggle={() => togglePanel('sort')}
					/>
				) : null}

				{canReset ? (
					<Pressable onPress={handleResetAll} style={styles.clearBtn}>
						<Text style={styles.clearBtnText}>↺ Réinitialiser</Text>
					</Pressable>
				) : null}

				{resultCount !== undefined && totalCount !== undefined ? (
					<Text style={styles.countText}>{resultCount} / {totalCount}</Text>
				) : null}
			</View>

			{openPanel === 'filters' ? (
				<FiltersPanel
					filters={panelFilters}
					value={value.filters}
					onChangeField={setFilterValue}
				/>
			) : null}

			{openPanel === 'sort' ? (
				<SortPanel sorts={sorts} value={value.sort} onChange={(s) => onChange({ ...value, sort: s })} />
			) : null}
		</View>
	);
}

function SearchInput({ value, placeholder, onChange }: { value: string; placeholder?: string; onChange: (t: string) => void }) {
	return (
		<View style={styles.searchWrap}>
			<Text style={styles.searchIcon}>🔍</Text>
			<TextInput
				style={styles.searchInput}
				value={value}
				onChangeText={onChange}
				placeholder={placeholder}
				placeholderTextColor={COLORS.text.placeholder}
			/>
		</View>
	);
}

function FiltersToggle({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
	return (
		<Pressable onPress={onToggle} style={[styles.summaryBtn, open && styles.summaryBtnOn]}>
			<Text style={styles.summaryBtnLabel}>Filtres</Text>
			{count > 0 ? (
				<View style={styles.badge}><Text style={styles.badgeText}>{count}</Text></View>
			) : null}
			<Text style={styles.caret}>{open ? '▴' : '▾'}</Text>
		</Pressable>
	);
}

function SortToggle({ summary, open, onToggle }: { summary: string; open: boolean; onToggle: () => void }) {
	return (
		<Pressable onPress={onToggle} style={[styles.summaryBtn, open && styles.summaryBtnOn]}>
			<Text style={styles.summaryBtnLabelMuted}>Trier :</Text>
			<Text style={styles.summaryBtnLabel}>{summary}</Text>
			<Text style={styles.caret}>{open ? '▴' : '▾'}</Text>
		</Pressable>
	);
}

function FiltersPanel({ filters, value, onChangeField }: {
	filters: FilterField[];
	value: Record<string, any> | undefined;
	onChangeField: (key: string, v: any) => void;
}) {
	return (
		<View style={styles.panel}>
			<View style={styles.panelFields}>
				{filters.map((field) => (
					<FieldControl
						key={field.key}
						field={field}
						value={value?.[field.key]}
						onChange={(v) => onChangeField(field.key, v)}
					/>
				))}
			</View>
		</View>
	);
}

function SortPanel({ sorts, value, onChange }: {
	sorts: SortOption[];
	value: { key: string; direction: 'asc' | 'desc' } | null;
	onChange: (s: { key: string; direction: 'asc' | 'desc' } | null) => void;
}) {
	const selectCriterion = (s: SortOption) => onChange({
		key: s.key,
		direction: value?.direction ?? s.defaultDirection ?? 'asc',
	});
	const selectDirection = (direction: 'asc' | 'desc') => {
		if (value) onChange({ ...value, direction });
	};

	return (
		<View style={styles.panel}>
			<View style={styles.sortLayout}>
				<View style={styles.sortCriteria}>
					<Text style={styles.fieldLabel}>Critère</Text>
					<View style={styles.radioList}>
						{sorts.map((s) => {
							const isOn = value?.key === s.key;
							return (
								<Pressable key={s.key} onPress={() => selectCriterion(s)} style={styles.radioRow}>
									<View style={[styles.radioDot, isOn && styles.radioDotOn]} />
									<Text style={[styles.radioLabel, isOn && styles.radioLabelOn]}>{s.label}</Text>
								</Pressable>
							);
						})}
					</View>
				</View>
				<View style={styles.sortDirection}>
					<Text style={styles.fieldLabel}>Direction</Text>
					<View style={styles.dirButtons}>
						<DirectionButton label="↑ Croissant" active={value?.direction === 'asc'} disabled={!value} onPress={() => selectDirection('asc')} />
						<DirectionButton label="↓ Décroissant" active={value?.direction === 'desc'} disabled={!value} onPress={() => selectDirection('desc')} />
					</View>
				</View>
			</View>
		</View>
	);
}

function DirectionButton({ label, active, disabled, onPress }: { label: string; active: boolean; disabled: boolean; onPress: () => void }) {
	return (
		<Pressable onPress={onPress} disabled={disabled} style={[styles.dirBtn, active && styles.dirBtnOn]}>
			<Text style={[styles.dirBtnText, active && styles.dirBtnTextOn]}>{label}</Text>
		</Pressable>
	);
}

function countActiveFilters(filters: FilterField[], values: Record<string, any> | undefined): number {
	if (!values) return 0;
	return filters.reduce((count, field) => {
		const v = values[field.key];
		if (v === undefined || v === null || v === '') return count;
		if (Array.isArray(v) && v.length === 0) return count;
		if (typeof v === 'object' && Object.keys(v).every((k) => (v as any)[k] === undefined)) return count;
		return count + 1;
	}, 0);
}

function buildSortSummary(sort: FilterSortState['sort'], sorts: SortOption[]): string {
	if (!sort) return 'Aucun';
	const option = sorts.find((s) => s.key === sort.key);
	const arrow = sort.direction === 'asc' ? '↑' : '↓';
	return option ? `${option.label} ${arrow}` : `${sort.key} ${arrow}`;
}

function isSameState(a: FilterSortState, b: FilterSortState): boolean {
	if (a.sort?.key !== b.sort?.key || a.sort?.direction !== b.sort?.direction) return false;
	const aKeys = Object.keys(a.filters || {}).filter((k) => !isEmptyFilterValue(a.filters[k]));
	const bKeys = Object.keys(b.filters || {}).filter((k) => !isEmptyFilterValue(b.filters[k]));
	if (aKeys.length !== bKeys.length) return false;
	for (const k of aKeys) {
		if (JSON.stringify(a.filters[k]) !== JSON.stringify(b.filters[k])) return false;
	}
	return true;
}

function isEmptyFilterValue(v: any): boolean {
	if (v === undefined || v === null || v === '') return true;
	if (Array.isArray(v)) return v.length === 0;
	if (typeof v === 'object') return Object.keys(v).every((k) => v[k] === undefined);
	return false;
}
