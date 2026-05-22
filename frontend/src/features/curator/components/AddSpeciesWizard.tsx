import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import { KnownSpeciesPicker } from './KnownSpeciesPicker';
import type { ProposalSpecies } from '@/services/api/CuratorService';

type WizardMode = 'unknown' | 'known';

interface Props {
	onCreateNewSpecies: () => void;
	onPickKnownSpecies: (species: ProposalSpecies) => void;
	onCancel: () => void;
}

export const AddSpeciesWizard: React.FC<Props> = ({ onCreateNewSpecies, onPickKnownSpecies, onCancel }) => {
	const [mode, setMode] = useState<WizardMode>('known');
	const [step, setStep] = useState<0 | 1>(0);

	if (step === 1 && mode === 'known') {
		return (
			<KnownSpeciesPicker
				onPick={onPickKnownSpecies}
				onBack={() => setStep(0)}
				onCancel={onCancel}
			/>
		);
	}

	const handleNext = () => {
		if (mode === 'known') {
			setStep(1);
		} else {
			onCreateNewSpecies();
		}
	};

	return (
		<View style={styles.col}>
			<View style={styles.headerRow}>
				<View style={{ flex: 1 }}>
					<Text style={styles.title}>Ajouter une espèce</Text>
					<Text style={styles.subtitle}>Choisis le type d'ajout.</Text>
				</View>
				<Pressable onPress={onCancel} hitSlop={6} style={styles.closeBtn}>
					<Text style={styles.closeBtnText}>✕</Text>
				</Pressable>
			</View>

			<RadioRow
				selected={mode === 'known'}
				onSelect={() => setMode('known')}
				label="Espèce déjà connue"
				hint="Cherche dans la base et importe une espèce existante (certifiée ou en attente)."
			/>
			<RadioRow
				selected={mode === 'unknown'}
				onSelect={() => setMode('unknown')}
				label="Nouvelle espèce"
				hint="Crée une fiche vide. Tu la rempliras dans le panneau qui apparaîtra, comme pour les espèces proposées."
			/>

			<View style={styles.footer}>
				<Pressable onPress={onCancel} style={[styles.btnNeutral, { flex: 1 }]}>
					<Text style={styles.btnNeutralText}>Annuler</Text>
				</Pressable>
				<Pressable onPress={handleNext} style={[styles.btnPrimary, { flex: 1 }]}>
					<Text style={styles.btnPrimaryText}>
						{mode === 'known' ? 'Suivant →' : 'Créer la fiche'}
					</Text>
				</Pressable>
			</View>
		</View>
	);
};

const RadioRow: React.FC<{ selected: boolean; onSelect: () => void; label: string; hint: string }> = ({
	selected, onSelect, label, hint,
}) => (
	<Pressable onPress={onSelect} style={[styles.radioRow, selected && styles.radioRowActive]}>
		<View style={[styles.radioCircle, selected && styles.radioCircleActive]}>
			{selected ? <View style={styles.radioDot} /> : null}
		</View>
		<View style={styles.radioBody}>
			<Text style={[styles.radioLabel, selected && styles.radioLabelActive]}>{label}</Text>
			<Text style={styles.radioHint}>{hint}</Text>
		</View>
	</Pressable>
);

const styles = StyleSheet.create({
	col: { gap: SPACING.md, padding: SPACING.md },
	headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
	title: { ...TYPOGRAPHY.h2, fontSize: 16 },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic' },
	closeBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
	closeBtnText: { fontSize: 14, color: COLORS.text.secondary, fontWeight: '700' },

	radioRow: {
		flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.card,
	},
	radioRowActive: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}11` },

	radioCircle: {
		width: 18, height: 18, borderRadius: 9,
		borderWidth: 2, borderColor: COLORS.border,
		alignItems: 'center', justifyContent: 'center',
		marginTop: 2,
	},
	radioCircleActive: { borderColor: COLORS.primary },
	radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },

	radioBody: { flex: 1, gap: 2 },
	radioLabel: { fontSize: 13, color: COLORS.text.primary, fontWeight: '700' },
	radioLabelActive: { color: COLORS.primary },
	radioHint: { fontSize: 11, color: COLORS.text.secondary, lineHeight: 15 },

	footer: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },

	btnPrimary: {
		paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
		borderRadius: 6, backgroundColor: COLORS.primary,
		alignItems: 'center', justifyContent: 'center',
	},
	btnPrimaryText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 13, textAlign: 'center' },

	btnNeutral: {
		paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
		borderRadius: 6, backgroundColor: COLORS.text.secondary,
		alignItems: 'center', justifyContent: 'center',
	},
	btnNeutralText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 13, textAlign: 'center' },
});
