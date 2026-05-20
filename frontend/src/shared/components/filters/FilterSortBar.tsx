import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform } from 'react-native';
import type { FilterField, FilterSortState, SortOption } from './types';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

interface Props {
	filters: FilterField[];
	sorts: SortOption[];
	value: FilterSortState;
	onChange: (next: FilterSortState) => void;
	totalCount?: number;
	resultCount?: number;
	// Clé du filtre `text` à exposer en barre principale (toujours visible).
	// Si absent, tous les filtres sont dans le panneau dépliable.
	searchKey?: string;
}

type Panel = 'filters' | 'sort' | null;

export const FilterSortBar: React.FC<Props> = ({
	filters, sorts, value, onChange, totalCount, resultCount, searchKey,
}) => {
	const [openPanel, setOpenPanel] = useState<Panel>(null);

	const searchField = useMemo(
		() => filters.find((f) => f.key === searchKey && f.kind === 'text'),
		[filters, searchKey],
	);
	const otherFilters = useMemo(
		() => filters.filter((f) => f.key !== searchKey),
		[filters, searchKey],
	);

	const setFilter = (key: string, v: any) =>
		onChange({ ...value, filters: { ...value.filters, [key]: v } });

	const clearFilters = () =>
		onChange({ filters: {}, sort: value.sort });

	const activeFilterCount = useMemo(() => filters.reduce((acc, f) => {
		const v = value.filters?.[f.key];
		if (v === undefined || v === null || v === '') return acc;
		if (Array.isArray(v) && v.length === 0) return acc;
		if (typeof v === 'object' && Object.keys(v).every((k) => (v as any)[k] === undefined)) return acc;
		return acc + 1;
	}, 0), [filters, value.filters]);

	const sortLabel = useMemo(() => {
		if (!value.sort) return 'Aucun';
		const s = sorts.find((s) => s.key === value.sort!.key);
		const arrow = value.sort.direction === 'asc' ? '↑' : '↓';
		return s ? `${s.label} ${arrow}` : `${value.sort.key} ${arrow}`;
	}, [value.sort, sorts]);

	return (
		<View style={styles.container}>
			<View style={styles.topBar}>
				{searchField ? (
					<View style={styles.searchWrap}>
						<Text style={styles.searchIcon}>🔍</Text>
						<TextInput
							style={styles.searchInput}
							value={(value.filters?.[searchField.key] as string) ?? ''}
							onChangeText={(t) => setFilter(searchField.key, t)}
							placeholder={searchField.kind === 'text' ? searchField.placeholder : ''}
							placeholderTextColor={COLORS.text.placeholder}
						/>
					</View>
				) : null}

				{otherFilters.length > 0 ? (
					<Pressable
						onPress={() => setOpenPanel(openPanel === 'filters' ? null : 'filters')}
						style={[styles.summaryBtn, openPanel === 'filters' && styles.summaryBtnOn]}
					>
						<Text style={styles.summaryBtnLabel}>Filtres</Text>
						{activeFilterCount > 0 ? (
							<View style={styles.badge}>
								<Text style={styles.badgeText}>{activeFilterCount}</Text>
							</View>
						) : null}
						<Text style={styles.caret}>{openPanel === 'filters' ? '▴' : '▾'}</Text>
					</Pressable>
				) : null}

				{sorts.length > 0 ? (
					<Pressable
						onPress={() => setOpenPanel(openPanel === 'sort' ? null : 'sort')}
						style={[styles.summaryBtn, openPanel === 'sort' && styles.summaryBtnOn]}
					>
						<Text style={styles.summaryBtnLabelMuted}>Trier :</Text>
						<Text style={styles.summaryBtnLabel}>{sortLabel}</Text>
						<Text style={styles.caret}>{openPanel === 'sort' ? '▴' : '▾'}</Text>
					</Pressable>
				) : null}

				{resultCount !== undefined && totalCount !== undefined ? (
					<Text style={styles.countText}>{resultCount} / {totalCount}</Text>
				) : null}
			</View>

			{openPanel === 'filters' ? (
				<View style={styles.panel}>
					<View style={styles.panelFields}>
						{otherFilters.map((field) => (
							<FieldControl
								key={field.key}
								field={field}
								value={value.filters?.[field.key]}
								onChange={(v) => setFilter(field.key, v)}
							/>
						))}
					</View>
					{activeFilterCount > 0 ? (
						<View style={styles.panelActions}>
							<Pressable onPress={clearFilters} style={styles.clearBtn}>
								<Text style={styles.clearBtnText}>✕ Réinitialiser ({activeFilterCount})</Text>
							</Pressable>
						</View>
					) : null}
				</View>
			) : null}

			{openPanel === 'sort' ? (
				<View style={styles.panel}>
					<View style={styles.sortLayout}>
						<View style={styles.sortCriteria}>
							<Text style={styles.fieldLabel}>Critère</Text>
							<View style={styles.radioList}>
								{sorts.map((s) => {
									const isOn = value.sort?.key === s.key;
									return (
										<Pressable
											key={s.key}
											onPress={() => onChange({
												...value,
												sort: { key: s.key, direction: value.sort?.direction ?? s.defaultDirection ?? 'asc' },
											})}
											style={styles.radioRow}
										>
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
								<Pressable
									onPress={() => value.sort && onChange({ ...value, sort: { ...value.sort, direction: 'asc' } })}
									disabled={!value.sort}
									style={[styles.dirBtn, value.sort?.direction === 'asc' && styles.dirBtnOn]}
								>
									<Text style={[styles.dirBtnText, value.sort?.direction === 'asc' && styles.dirBtnTextOn]}>↑ Croissant</Text>
								</Pressable>
								<Pressable
									onPress={() => value.sort && onChange({ ...value, sort: { ...value.sort, direction: 'desc' } })}
									disabled={!value.sort}
									style={[styles.dirBtn, value.sort?.direction === 'desc' && styles.dirBtnOn]}
								>
									<Text style={[styles.dirBtnText, value.sort?.direction === 'desc' && styles.dirBtnTextOn]}>↓ Décroissant</Text>
								</Pressable>
							</View>
						</View>
					</View>
				</View>
			) : null}
		</View>
	);
};

const FieldControl: React.FC<{ field: FilterField; value: any; onChange: (v: any) => void }> = ({ field, value, onChange }) => {
	switch (field.kind) {
		case 'text':
			return (
				<View style={styles.field}>
					<Text style={styles.fieldLabel}>{field.label}</Text>
					<TextInput
						style={styles.textInput}
						value={value ?? ''}
						onChangeText={onChange}
						placeholder={field.placeholder}
						placeholderTextColor={COLORS.text.placeholder}
					/>
				</View>
			);
		case 'chips': {
			const selected: string[] = Array.isArray(value) ? value : [];
			const toggle = (v: string) => {
				if (field.multi) {
					onChange(selected.includes(v) ? selected.filter((s) => s !== v) : [...selected, v]);
				} else {
					onChange(selected.includes(v) ? [] : [v]);
				}
			};
			return (
				<View style={styles.field}>
					<Text style={styles.fieldLabel}>{field.label}</Text>
					<View style={styles.chipsRow}>
						{field.options.map((opt) => {
							const isOn = selected.includes(opt.value);
							return (
								<Pressable
									key={opt.value}
									onPress={() => toggle(opt.value)}
									style={[styles.chip, isOn && styles.chipOn]}
								>
									<Text style={[styles.chipText, isOn && styles.chipTextOn]}>{opt.label}</Text>
								</Pressable>
							);
						})}
					</View>
				</View>
			);
		}
		case 'bool': {
			const v: boolean | null = value === true || value === false ? value : null;
			const set = (next: boolean | null) => onChange(next);
			return (
				<View style={styles.field}>
					<Text style={styles.fieldLabel}>{field.label}</Text>
					<View style={styles.chipsRow}>
						<Pressable onPress={() => set(null)} style={[styles.chip, v === null && styles.chipOn]}>
							<Text style={[styles.chipText, v === null && styles.chipTextOn]}>Tous</Text>
						</Pressable>
						<Pressable onPress={() => set(true)} style={[styles.chip, v === true && styles.chipOn]}>
							<Text style={[styles.chipText, v === true && styles.chipTextOn]}>{field.trueLabel ?? 'Oui'}</Text>
						</Pressable>
						<Pressable onPress={() => set(false)} style={[styles.chip, v === false && styles.chipOn]}>
							<Text style={[styles.chipText, v === false && styles.chipTextOn]}>{field.falseLabel ?? 'Non'}</Text>
						</Pressable>
					</View>
				</View>
			);
		}
		case 'date-range': {
			const { from, to } = (value || {}) as { from?: string; to?: string };
			if (Platform.OS !== 'web') {
				return (
					<View style={styles.field}>
						<Text style={styles.fieldLabel}>{field.label}</Text>
						<Text style={styles.muted}>Disponible sur web uniquement.</Text>
					</View>
				);
			}
			return (
				<View style={styles.field}>
					<Text style={styles.fieldLabel}>{field.label}</Text>
					<View style={styles.dateRow}>
						{/* @ts-ignore */}
						<input
							type="date"
							value={from ?? ''}
							onChange={(e: any) => onChange({ from: e.target.value || undefined, to })}
							style={dateInputStyle}
						/>
						<Text style={styles.dateSep}>→</Text>
						{/* @ts-ignore */}
						<input
							type="date"
							value={to ?? ''}
							onChange={(e: any) => onChange({ from, to: e.target.value || undefined })}
							style={dateInputStyle}
						/>
					</View>
				</View>
			);
		}
		case 'number-range': {
			const { min, max } = (value || {}) as { min?: number; max?: number };
			return (
				<View style={styles.field}>
					<Text style={styles.fieldLabel}>{field.label}</Text>
					<View style={styles.dateRow}>
						<TextInput
							style={[styles.textInput, { width: 80 }]}
							value={min !== undefined ? String(min) : ''}
							onChangeText={(t) => {
								const n = t.trim() === '' ? undefined : Number(t);
								onChange({ min: Number.isFinite(n) ? n : undefined, max });
							}}
							keyboardType="numeric"
						/>
						<Text style={styles.dateSep}>→</Text>
						<TextInput
							style={[styles.textInput, { width: 80 }]}
							value={max !== undefined ? String(max) : ''}
							onChangeText={(t) => {
								const n = t.trim() === '' ? undefined : Number(t);
								onChange({ min, max: Number.isFinite(n) ? n : undefined });
							}}
							keyboardType="numeric"
						/>
					</View>
				</View>
			);
		}
		default:
			return null;
	}
};

const dateInputStyle = {
	borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
	padding: 6, fontSize: 13,
	backgroundColor: COLORS.background.main, color: COLORS.text.primary,
} as any;

const styles = StyleSheet.create({
	container: {
		backgroundColor: COLORS.background.card,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		marginBottom: SPACING.sm,
		overflow: 'hidden',
	},
	topBar: {
		flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
		padding: SPACING.sm, flexWrap: 'wrap',
	},
	searchWrap: {
		flex: 1, minWidth: 180,
		flexDirection: 'row', alignItems: 'center',
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm,
		backgroundColor: COLORS.background.main,
	},
	searchIcon: { fontSize: 14, color: COLORS.text.placeholder, marginRight: 6 },
	searchInput: {
		flex: 1, ...TYPOGRAPHY.body, fontSize: 13,
		paddingVertical: 6, color: COLORS.text.primary,
	},

	summaryBtn: {
		flexDirection: 'row', alignItems: 'center', gap: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: 6,
		borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	summaryBtnOn: { borderColor: COLORS.primary, backgroundColor: COLORS.background.card },
	summaryBtnLabel: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600' },
	summaryBtnLabelMuted: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '600' },
	caret: { fontSize: 10, color: COLORS.text.secondary },
	badge: {
		minWidth: 18, height: 18, borderRadius: 9,
		paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
		backgroundColor: COLORS.primary,
	},
	badgeText: { fontSize: 10, color: COLORS.text.inverse, fontWeight: '700' },
	countText: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '600', marginLeft: 'auto' },

	panel: {
		paddingHorizontal: SPACING.sm,
		paddingBottom: SPACING.sm,
		borderTopWidth: 1, borderTopColor: COLORS.border,
		gap: SPACING.sm,
		paddingTop: SPACING.sm,
	},
	panelFields: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, alignItems: 'flex-start' },
	panelActions: { flexDirection: 'row', justifyContent: 'flex-end' },

	field: { gap: 4, minWidth: 140 },
	fieldLabel: { fontSize: 10, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
	textInput: {
		...TYPOGRAPHY.body, fontSize: 13,
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: 6,
		backgroundColor: COLORS.background.main, color: COLORS.text.primary,
		minWidth: 160,
	},

	chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
	chip: {
		paddingHorizontal: SPACING.sm, paddingVertical: 4,
		borderRadius: 99, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	chipText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '500' },
	chipTextOn: { color: COLORS.text.inverse, fontWeight: '700' },

	dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
	dateSep: { color: COLORS.text.placeholder, fontSize: 13 },
	muted: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic' },

	sortLayout: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.lg },
	sortCriteria: { gap: 4, minWidth: 200 },
	sortDirection: { gap: 4, minWidth: 180 },
	radioList: { gap: 4 },
	radioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
	radioDot: {
		width: 14, height: 14, borderRadius: 7,
		borderWidth: 2, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	radioDotOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
	radioLabel: { fontSize: 13, color: COLORS.text.primary },
	radioLabelOn: { fontWeight: '700' },

	dirButtons: { flexDirection: 'row', gap: 4 },
	dirBtn: {
		paddingHorizontal: SPACING.sm, paddingVertical: 6,
		borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	dirBtnOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	dirBtnText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	dirBtnTextOn: { color: COLORS.text.inverse },

	clearBtn: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 6, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	clearBtnText: { fontSize: 11, color: COLORS.text.primary, fontWeight: '600' },
});
