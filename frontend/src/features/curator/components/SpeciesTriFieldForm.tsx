import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Species, SpeciesService, SpeciesSearchField } from '@/services/api/SpeciesService';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

export interface SpeciesTriValue {
	scientific_name: string;
	usage_name: string;
	polynesian_name: string;
}

interface Props {
	value: SpeciesTriValue;
	disabled?: boolean;
	onChange: (v: SpeciesTriValue) => void;
}

const FIELD_LABELS: Record<SpeciesSearchField, string> = {
	scientific: 'Nom scientifique',
	usage:      'Nom d\'usage',
	polynesian: 'Nom polynésien',
};

const FIELD_PLACEHOLDERS: Record<SpeciesSearchField, string> = {
	scientific: 'Chelonia mydas',
	usage:      'tortue verte',
	polynesian: 'honu',
};

const DEBOUNCE_MS = 300;

export const SpeciesTriFieldForm: React.FC<Props> = ({ value, disabled, onChange }) => {
	return (
		<View style={styles.wrap}>
			<FieldRow rowIndex={0} field="scientific" value={value.scientific_name}
			          disabled={disabled} onPick={(s) => onChange(speciesToValue(s, value))}
			          onChangeText={(t) => onChange({ ...value, scientific_name: t })} />
			<FieldRow rowIndex={1} field="usage" value={value.usage_name}
			          disabled={disabled} onPick={(s) => onChange(speciesToValue(s, value))}
			          onChangeText={(t) => onChange({ ...value, usage_name: t })} />
			<FieldRow rowIndex={2} field="polynesian" value={value.polynesian_name}
			          disabled={disabled} onPick={(s) => onChange(speciesToValue(s, value))}
			          onChangeText={(t) => onChange({ ...value, polynesian_name: t })} />
		</View>
	);
};

function speciesToValue(s: Species, fallback: SpeciesTriValue): SpeciesTriValue {
	return {
		scientific_name: s.scientific_name ?? fallback.scientific_name,
		usage_name:      s.usage_name      ?? fallback.usage_name,
		polynesian_name: s.polynesian_name ?? fallback.polynesian_name,
	};
}

interface FieldProps {
	rowIndex: number;
	field: SpeciesSearchField;
	value: string;
	disabled?: boolean;
	onChangeText: (t: string) => void;
	onPick: (s: Species) => void;
}

const FieldRow: React.FC<FieldProps> = ({ rowIndex, field, value, disabled, onChangeText, onPick }) => {
	const service = useMemo(() => new SpeciesService(), []);
	const [results, setResults] = useState<Species[]>([]);
	const [open, setOpen] = useState(false);
	const debRef = useRef<any>(null);

	useEffect(() => {
		if (debRef.current) clearTimeout(debRef.current);
		const trimmed = value.trim();
		if (!open || trimmed.length === 0) { setResults([]); return; }
		debRef.current = setTimeout(async () => {
			try { setResults(await service.searchByField(field, trimmed)); }
			catch { setResults([]); }
		}, DEBOUNCE_MS);
		return () => { if (debRef.current) clearTimeout(debRef.current); };
	}, [value, open, field, service]);

	// zIndex décroissant par ligne (top = au-dessus). Boost massif quand le
	// dropdown est ouvert pour passer au-dessus des frères et conteneurs.
	const rowZ = (open ? 1000 : 10) - rowIndex;
	return (
		<View style={[styles.field, { zIndex: rowZ }]}>
			<Text style={styles.label}>{FIELD_LABELS[field]}</Text>
			<View style={styles.inputWrap}>
				<TextInput
					value={value}
					onChangeText={(t) => { onChangeText(t); setOpen(true); }}
					onFocus={() => setOpen(true)}
					onBlur={() => setTimeout(() => setOpen(false), 150)}
					placeholder={FIELD_PLACEHOLDERS[field]}
					placeholderTextColor={COLORS.text.placeholder}
					style={styles.input}
					editable={!disabled}
					autoCapitalize="none"
				/>
				{open && results.length > 0 ? (
					<View style={styles.dropdown}>
						{results.map((s) => (
							<Pressable
								key={s.id}
								onPress={() => { onPick(s); setOpen(false); }}
								style={({ hovered }: any) => [styles.item, hovered && styles.itemHover]}
							>
								<Text style={styles.itemMain}>{s.scientific_name ?? s.name}</Text>
								<Text style={styles.itemSub}>
									{[s.usage_name, s.polynesian_name].filter(Boolean).join(' · ') || '—'}
								</Text>
							</Pressable>
						))}
					</View>
				) : null}
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	wrap:  { gap: SPACING.sm, position: 'relative' },
	field: { position: 'relative' },
	label: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 2 },
	inputWrap: { position: 'relative', zIndex: 10 },
	input: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main,
	},
	dropdown: {
		position: 'absolute', top: '100%', left: 0, right: 0,
		marginTop: 4, backgroundColor: COLORS.background.card,
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		zIndex: 1000, maxHeight: 220, overflow: 'hidden',
	},
	item: { paddingHorizontal: SPACING.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border },
	itemHover: { backgroundColor: COLORS.background.main },
	itemMain:  { fontSize: 13, color: COLORS.text.primary, fontWeight: '500' },
	itemSub:   { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic', marginTop: 2 },
});
