import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import { StudioShape } from '../types';
import { SpeciesAutocomplete } from './SpeciesAutocomplete';

interface Props {
	shapes: StudioShape[];
	selectedShape: StudioShape | null;
	submitting: boolean;
	onUpdateShape: (id: string, patch: Partial<StudioShape>) => void;
	onValidate: () => void;
}

export const ValidationPanel: React.FC<Props> = ({
	shapes, selectedShape, submitting, onUpdateShape, onValidate,
}) => {
	const hasShapes      = shapes.length > 0;
	const allHaveSpecies = hasShapes && shapes.every((s) => !!s.speciesName);
	const allSaved       = hasShapes && shapes.every((s) => s.status === 'saved');
	const canValidate    = hasShapes && allHaveSpecies && !submitting;

	if (!hasShapes) {
		return (
			<View style={styles.col}>
				<Text style={styles.colTitle}>Validation</Text>
				<View style={styles.emptyState}>
					<Text style={styles.emptyText}>Tracez d'abord un rectangle.</Text>
				</View>
			</View>
		);
	}

	if (!selectedShape) {
		return (
			<View style={styles.col}>
				<Text style={styles.colTitle}>Validation</Text>
				<Text style={styles.metaText}>Sélectionne le rectangle pour éditer son espèce.</Text>
				<View style={styles.statusRow}>
					<View style={[styles.dot, { backgroundColor: allHaveSpecies ? COLORS.status.validated : COLORS.warning }]} />
					<Text style={styles.statusText}>
						{allHaveSpecies
							? 'Toutes les espèces sont définies.'
							: `${shapes.filter((s) => !s.speciesName).length} sans espèce`}
					</Text>
				</View>
				<Pressable
					onPress={onValidate}
					disabled={!canValidate}
					style={[styles.validateBtn, !canValidate && styles.btnDisabled]}
				>
					<Text style={styles.validateBtnText}>
						{submitting ? 'Sauvegarde…' : allSaved ? 'Annotation sauvegardée ✓' : "Valider l'annotation"}
					</Text>
				</Pressable>
			</View>
		);
	}

	return (
		<View style={styles.col}>
			<Text style={styles.colTitle}>Validation</Text>

			<View style={styles.statusRow}>
				<View style={[styles.dot, { backgroundColor: selectedShape.status === 'saved' ? COLORS.status.validated : COLORS.warning }]} />
				<Text style={styles.statusText}>
					{selectedShape.status === 'saved' ? 'Sauvegardé' : 'Non sauvegardé'}
				</Text>
			</View>

			<Text style={styles.fieldLabel}>Espèce</Text>
			<SpeciesAutocomplete
				value={selectedShape.speciesName ? { id: selectedShape.speciesId, name: selectedShape.speciesName } : null}
				onPick={(picked) =>
					onUpdateShape(selectedShape.id, {
						speciesId:   picked.id,
						speciesName: picked.name,
						status:      'unsaved',
					})
				}
			/>

			<Text style={styles.fieldLabel}>Commentaire (optionnel)</Text>
			<TextInput
				value={selectedShape.comment ?? ''}
				onChangeText={(t) => onUpdateShape(selectedShape.id, { comment: t, status: 'unsaved' })}
				placeholder="Note pour le curator…"
				placeholderTextColor={COLORS.text.placeholder}
				multiline
				style={styles.textArea}
			/>

			<Pressable
				onPress={onValidate}
				disabled={!canValidate}
				style={[styles.validateBtn, !canValidate && styles.btnDisabled]}
			>
				<Text style={styles.validateBtnText}>
					{submitting
						? 'Sauvegarde…'
						: !allHaveSpecies
							? "Choisir l'espèce"
							: allSaved
								? 'Annotation sauvegardée ✓'
								: "Valider l'annotation"}
				</Text>
			</Pressable>
		</View>
	);
};

const styles = StyleSheet.create({
	col: {
		width: 300,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.md,
		gap: SPACING.sm,
	},
	colTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },
	metaText: { fontSize: 12, color: COLORS.text.secondary },

	emptyState: {
		flex: 1, alignItems: 'center', justifyContent: 'center',
		borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
		borderRadius: 8, padding: SPACING.md,
	},
	emptyText: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic' },

	statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
	dot: { width: 8, height: 8, borderRadius: 4 },
	statusText: { fontSize: 12, color: COLORS.text.primary },

	fieldLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginTop: SPACING.sm },

	textArea: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main,
		minHeight: 70, textAlignVertical: 'top',
	},

	validateBtn: {
		marginTop: SPACING.md,
		paddingVertical: SPACING.sm,
		borderRadius: 6,
		backgroundColor: COLORS.primary,
		alignItems: 'center',
	},
	btnDisabled: { opacity: 0.4 },
	validateBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 13 },

});
