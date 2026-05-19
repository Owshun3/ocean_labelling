import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SpeciesTagGroup } from '@/services/api/SpeciesTagService';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

interface Props {
	groups:    SpeciesTagGroup[];
	tags:      string[];
	disabled?: boolean;
	onChange:  (tags: string[]) => void;
}

// Rend une section par groupe : radio si exclusif, multi-chips sinon.
// Pour les groupes is_required, ajoute un astérisque rouge.
export const SpeciesTagPicker: React.FC<Props> = ({ groups, tags, disabled, onChange }) => {
	const selected = new Set(tags);

	const toggle = (value: string, group: SpeciesTagGroup) => {
		if (disabled) return;
		if (group.is_exclusive) {
			// Radio : retirer toutes les autres valeurs du groupe + toggle celle-ci.
			const otherValues = group.definitions.map((d) => d.value).filter((v) => v !== value);
			const next = tags.filter((t) => !otherValues.includes(t));
			if (selected.has(value)) {
				// Re-cliquer désélectionne SAUF si le groupe est requis (laisser au moins la sélection).
				if (group.is_required) return;
				onChange(next.filter((t) => t !== value));
			} else {
				onChange([...next, value]);
			}
		} else {
			// Multi : toggle simple.
			if (selected.has(value)) onChange(tags.filter((t) => t !== value));
			else                     onChange([...tags, value]);
		}
	};

	if (groups.length === 0) {
		return <Text style={styles.empty}>Aucun tag configuré — demande à l'admin.</Text>;
	}

	return (
		<View style={styles.wrap}>
			{groups.map((g) => {
				const visibleDefs = g.definitions.filter((d) => !d.archived_at);
				if (visibleDefs.length === 0) return null;
				return (
					<View key={g.id} style={styles.groupBlock}>
						<View style={styles.groupHeader}>
							<Text style={styles.groupLabel}>
								{g.label}
								{g.is_required ? <Text style={styles.required}> *</Text> : null}
							</Text>
							<Text style={styles.groupMeta}>
								{g.is_exclusive ? 'choix unique' : 'choix multiple'}
							</Text>
						</View>
						<View style={styles.chipRow}>
							{visibleDefs.map((d) => {
								const isSel = selected.has(d.value);
								return (
									<Pressable
										key={d.id}
										onPress={() => toggle(d.value, g)}
										disabled={disabled}
										style={[
											styles.chip,
											isSel && styles.chipActive,
											disabled && styles.chipDisabled,
										]}
									>
										<Text style={[styles.chipText, isSel && styles.chipTextActive]}>
											{d.label}
										</Text>
									</Pressable>
								);
							})}
						</View>
					</View>
				);
			})}
		</View>
	);
};

const styles = StyleSheet.create({
	wrap: { gap: SPACING.sm },
	groupBlock: { gap: 4 },
	groupHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
	groupLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	required: { color: COLORS.danger, fontWeight: '700' },
	groupMeta: { fontSize: 10, color: COLORS.text.placeholder, fontStyle: 'italic' },
	chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
	chip: {
		paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: 999,
		backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border,
	},
	chipActive:   { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	chipDisabled: { opacity: 0.5 },
	chipText:        { fontSize: 12, color: COLORS.text.primary, fontWeight: '600' },
	chipTextActive:  { color: COLORS.text.inverse },
	empty: { ...{ fontStyle: 'italic' }, fontSize: 12, color: COLORS.text.placeholder, padding: SPACING.sm },
});
