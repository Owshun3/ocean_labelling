import React, { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { usePublicSettings } from '@/shared/hooks/usePublicSettings';

interface Props {
	visible: boolean;
	onAccept: () => void;
	onCancel: () => void;
	submitting?: boolean;
}

export const UploadConsentModal: React.FC<Props> = ({ visible, onAccept, onCancel, submitting }) => {
	const [checked, setChecked] = useState(false);
	const settings = usePublicSettings();
	const platformName = settings['platform.name'] || 'la plateforme';

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
			<View style={styles.backdrop}>
				<View style={styles.card}>
					<Text style={styles.title}>Avant ton premier téléversement</Text>
					<Text style={styles.subtitle}>
						Merci de lire attentivement ce message. Ton consentement est nécessaire pour participer.
					</Text>

					<ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
						<Section title="Finalité scientifique">
							Les médias et annotations que tu téléverses sur {platformName} alimentent un jeu de données
							de recherche sur la biodiversité polynésienne. Ils peuvent être consultés par d'autres
							annotateurs, validés par des curators, et exportés à des fins scientifiques par des
							chercheurs accrédités.
						</Section>

						<Section title="Données collectées">
							- Le binaire de l'image ou vidéo (les métadonnées EXIF, dont la position GPS, sont retirées
							  côté navigateur avant l'envoi pour les images).
							{'\n'}- Les coordonnées GPS et la date de prise de vue extraites de l'EXIF sont conservées
							  séparément en base de données.
							{'\n'}- Le contenu visuel reste lisible par les annotateurs habilités.
						</Section>

						<Section title="Confidentialité des coordonnées">
							Les coordonnées GPS et la date de prise de vue ne sont jamais exposées aux autres annotateurs,
							quelle que soit l'espèce concernée. Elles restent réservées aux modérateurs, curators et
							administrateurs, et aux chercheurs accrédités via les exports approuvés. Cette règle protège
							notamment les espèces sensibles contre le braconnage.
						</Section>

						<Section title="Partage et exports">
							Les annotations validées par un curator peuvent être incluses dans des exports de jeux de
							données au format Datumaro, demandés par des chercheurs et approuvés par l'administrateur.
							Aucun export public anonyme n'est diffusé sans validation.
						</Section>

						<Section title="Droits RGPD">
							Tu peux à tout moment demander l'accès, la rectification ou la suppression de tes données
							personnelles auprès de l'administrateur de la plateforme. Pour plus de détails, consulte
							la politique de confidentialité accessible depuis le pied de page.
						</Section>
					</ScrollView>

					<Pressable style={styles.checkboxRow} onPress={() => setChecked((v) => !v)}>
						<View style={[styles.checkbox, checked && styles.checkboxChecked]}>
							{checked ? <Ionicons name="checkmark" size={14} color={COLORS.text.inverse} /> : null}
						</View>
						<Text style={styles.checkboxLabel}>
							J'ai lu, compris et j'accepte les conditions ci-dessus.
						</Text>
					</Pressable>

					<View style={styles.actions}>
						<Pressable
							onPress={onCancel}
							disabled={submitting}
							style={[styles.btn, styles.btnGhost, submitting && styles.btnDisabled]}
						>
							<Text style={styles.btnGhostText}>Retour</Text>
						</Pressable>
						<Pressable
							onPress={onAccept}
							disabled={!checked || submitting}
							style={[styles.btn, styles.btnPrimary, (!checked || submitting) && styles.btnDisabled]}
						>
							<Text style={styles.btnPrimaryText}>{submitting ? 'Enregistrement…' : 'Accepter et continuer'}</Text>
						</Pressable>
					</View>
				</View>
			</View>
		</Modal>
	);
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
	<View style={styles.section}>
		<Text style={styles.sectionTitle}>{title}</Text>
		<Text style={styles.sectionBody}>{children}</Text>
	</View>
);

const styles = StyleSheet.create({
	backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: SPACING.md },
	card: {
		backgroundColor: COLORS.background.card,
		borderRadius: 12,
		borderWidth: 1, borderColor: COLORS.border,
		padding: SPACING.lg,
		maxWidth: 640, width: '100%',
		maxHeight: '90%',
		gap: SPACING.md,
	},
	title: { ...TYPOGRAPHY.title, fontSize: 24, lineHeight: 30 },
	subtitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },

	body: { maxHeight: 360, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border },
	bodyContent: { padding: SPACING.sm, gap: SPACING.md },
	section: { gap: 4 },
	sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
	sectionBody: { ...TYPOGRAPHY.body, color: COLORS.text.primary, lineHeight: 20 },

	checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
	checkbox: {
		width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.main, alignItems: 'center', justifyContent: 'center', marginTop: 2,
	},
	checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	checkboxLabel: { ...TYPOGRAPHY.body, color: COLORS.text.primary, flex: 1, lineHeight: 20 },

	actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm },
	btn: { paddingVertical: 10, paddingHorizontal: SPACING.md, borderRadius: 8, alignItems: 'center', minWidth: 140 },
	btnGhost: { backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	btnGhostText: { color: COLORS.text.primary, fontWeight: '600' },
	btnPrimary: { backgroundColor: COLORS.primary },
	btnPrimaryText: { color: COLORS.text.inverse, fontWeight: '700' },
	btnDisabled: { opacity: 0.4 },
});
