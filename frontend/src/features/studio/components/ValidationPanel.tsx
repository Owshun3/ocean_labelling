import React from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
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
	onSaveShape: (id: string) => void;
	onValidate: () => void;
}

export const ValidationPanel: React.FC<Props> = ({
	shapes, selectedShape, submitting, onUpdateShape, onSaveShape, onValidate,
}) => {
	const hasShapes      = shapes.length > 0;
	const savedCount     = shapes.filter((s) => s.status === 'saved').length;
	const missingCount   = shapes.length - savedCount;
	const canValidate    = hasShapes && missingCount === 0 && !submitting;

	const canSaveSelected = !!selectedShape?.speciesName && selectedShape.status !== 'saved';

	return (
		<View style={styles.col}>
			<ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
				<Text style={styles.colTitle}>Espèce</Text>

				{!hasShapes ? (
					<View style={styles.emptyState}>
						<Text style={styles.emptyText}>Trace au moins une boîte pour renseigner une espèce.</Text>
					</View>
				) : !selectedShape ? (
					<View style={styles.emptyState}>
						<Text style={styles.emptyText}>Sélectionne une boîte dans la liste à gauche, ou clique dessus sur l'image en mode Select (V).</Text>
					</View>
				) : (
					<>
						<View style={styles.statusRow}>
							<View style={[styles.dot, { backgroundColor: selectedShape.status === 'saved' ? COLORS.status.validated : selectedShape.speciesName ? COLORS.warning : COLORS.text.placeholder }]} />
							<Text style={styles.statusText}>
								{selectedShape.status === 'saved'
									? 'Espèce enregistrée pour cette boîte.'
									: selectedShape.speciesName
										? 'Espèce choisie. Clique sur « Enregistrer » pour la verrouiller.'
										: 'Choisis une espèce dans le champ ci-dessous.'}
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
							onPress={() => onSaveShape(selectedShape.id)}
							disabled={!canSaveSelected}
							style={({ hovered, pressed }: any) => [
								styles.saveBtn,
								selectedShape.status === 'saved' && styles.saveBtnDone,
								!canSaveSelected && selectedShape.status !== 'saved' && styles.btnDisabled,
								(hovered || pressed) && canSaveSelected && styles.btnActive,
							]}
						>
							<Text style={[styles.saveBtnText, selectedShape.status === 'saved' && styles.saveBtnTextDone]}>
								{selectedShape.status === 'saved' ? '✓ Enregistrée' : 'Enregistrer cette boîte'}
							</Text>
						</Pressable>
					</>
				)}
			</ScrollView>

			<View style={styles.footer}>
				<View style={styles.progressRow}>
					<View style={[styles.dot, { backgroundColor: canValidate ? COLORS.status.validated : COLORS.text.placeholder, marginTop: 0 }]} />
					<Text style={styles.progressText}>
						{hasShapes
							? `${savedCount} / ${shapes.length} boîte${shapes.length > 1 ? 's' : ''} enregistrée${savedCount > 1 ? 's' : ''}`
							: 'Aucune boîte tracée.'}
					</Text>
				</View>
				<Pressable
					onPress={onValidate}
					disabled={!canValidate}
					style={({ hovered, pressed }: any) => [
						styles.validateBtn,
						!canValidate && styles.btnDisabled,
						(hovered || pressed) && canValidate && styles.btnActive,
					]}
				>
					<Text style={styles.validateBtnText}>
						{submitting ? 'Envoi en cours…' : 'Valider tout'}
					</Text>
				</Pressable>
			</View>
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
		overflow: 'hidden',
	},
	scroll: { flex: 1 },
	scrollContent: { padding: SPACING.md, gap: SPACING.sm, paddingBottom: SPACING.md },
	colTitle: { ...TYPOGRAPHY.h2, fontSize: 16 },

	emptyState: {
		alignItems: 'center', justifyContent: 'center',
		borderWidth: 1, borderColor: COLORS.border,
		borderRadius: 8, padding: SPACING.md,
		minHeight: 80,
		backgroundColor: COLORS.background.main,
	},
	emptyText: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic', textAlign: 'center', lineHeight: 17 },

	statusRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 4 },
	dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
	statusText: { fontSize: 12, color: COLORS.text.primary, flex: 1, lineHeight: 17 },

	fieldLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginTop: SPACING.sm },

	textArea: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main,
		minHeight: 60, textAlignVertical: 'top',
	},

	saveBtn: {
		marginTop: SPACING.md,
		paddingVertical: 12,
		paddingHorizontal: SPACING.md,
		borderRadius: 8,
		backgroundColor: COLORS.success,
		alignItems: 'center',
	},
	saveBtnDone: { backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.status.validated },
	saveBtnText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },
	saveBtnTextDone: { color: COLORS.status.validated },

	footer: {
		borderTopWidth: 1, borderTopColor: COLORS.border,
		backgroundColor: COLORS.background.main,
		padding: SPACING.md,
		gap: SPACING.sm,
	},
	progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
	progressText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '600', flex: 1 },

	validateBtn: {
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: COLORS.primary,
		alignItems: 'center',
	},
	validateBtnText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 14, letterSpacing: 0.2 },

	btnDisabled: { opacity: 0.4 },
	btnActive: { opacity: 0.85 },
});
