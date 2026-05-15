import React from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { SpeciesTriFieldForm, SpeciesTriValue } from './SpeciesTriFieldForm';
import { ImageMetadata } from './ImageMetadata';
import type { ProposalsPayload } from '@/services/api/CuratorService';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

interface Props {
	speciesValue: SpeciesTriValue;
	comment: string;
	canCertify: boolean;
	submitting: boolean;
	disabledHint: string | null;
	metadata: ProposalsPayload['metadata'];
	task:     ProposalsPayload['task'];
	canTypeSpecies: boolean;
	speciesApproved: boolean;
	speciesApprovedName: string | null;
	speciesApprovedId?: number | null;
	onSpeciesChange: (v: SpeciesTriValue) => void;
	onCommentChange: (s: string) => void;
	onCertify:       () => void;
}

export const CuratorSidebarRight: React.FC<Props> = ({
	speciesValue, comment, canCertify, submitting, disabledHint,
	metadata, task, canTypeSpecies, speciesApproved, speciesApprovedName, speciesApprovedId,
	onSpeciesChange, onCommentChange, onCertify,
}) => {
	const router = useRouter();
	return (
	<View style={styles.col}>
		<View style={[styles.block, styles.speciesBlock]}>
			<View style={styles.headingRow}>
				<Text style={styles.heading}>Espèce</Text>
				{speciesApprovedId ? (
					<Pressable onPress={() => router.push(`/(main)/species/${speciesApprovedId}` as Href)}>
						<Text style={styles.fichLink}>Voir la fiche ↗</Text>
					</Pressable>
				) : null}
			</View>
			{speciesApproved ? (
				<View style={styles.lockBanner}>
					<Text style={styles.lockBannerText}>
						« {speciesApprovedName ?? 'espèce'} » est déjà validée — les noms ci-dessous ne sont pas modifiables.
					</Text>
				</View>
			) : null}
			<SpeciesTriFieldForm
				value={speciesValue}
				disabled={submitting || !canTypeSpecies}
				onChange={onSpeciesChange}
			/>
		</View>

		<View style={styles.block}>
			<Text style={styles.heading}>Commentaire curator</Text>
			<TextInput
				value={comment}
				onChangeText={onCommentChange}
				placeholder="Note interne, justification, etc."
				placeholderTextColor={COLORS.text.placeholder}
				multiline
				editable={!submitting}
				style={styles.textarea}
				maxLength={500}
			/>
		</View>

		<View style={styles.block}>
			<ImageMetadata metadata={metadata} task={task} />
		</View>

		<View style={styles.certifyWrap}>
			<Pressable
				onPress={onCertify}
				disabled={!canCertify || submitting}
				style={[styles.certifyBtn, (!canCertify || submitting) && styles.certifyBtnDisabled]}
			>
				<Text style={styles.certifyBtnText}>
					{submitting ? 'Enregistrement…' : 'Certifier'}
				</Text>
			</Pressable>
			{!canCertify && disabledHint ? (
				<Text style={styles.disabledHint}>{disabledHint}</Text>
			) : null}
		</View>
	</View>
	);
};

const styles = StyleSheet.create({
	col: {
		width: 320,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.md,
		gap: SPACING.md,
	},
	block: { gap: SPACING.xs },
	speciesBlock: { position: 'relative', zIndex: 100 },
	headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
	heading: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	fichLink: { fontSize: 11, color: COLORS.primary, fontWeight: '700', textDecorationLine: 'underline' },

	textarea: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main,
		minHeight: 70, textAlignVertical: 'top',
	},

	lockBanner: {
		flexDirection: 'column', gap: 4,
		paddingHorizontal: SPACING.sm, paddingVertical: 6,
		borderRadius: 6,
		borderLeftWidth: 3, borderLeftColor: COLORS.success,
		backgroundColor: `${COLORS.success}11`,
		marginBottom: SPACING.xs,
	},
	lockBannerText:   { fontSize: 11, color: COLORS.text.primary },

	certifyWrap: { marginTop: 'auto', gap: SPACING.xs },
	certifyBtn: {
		paddingVertical: SPACING.sm + 2, borderRadius: 6,
		backgroundColor: COLORS.success, alignItems: 'center',
	},
	certifyBtnDisabled: { opacity: 0.45 },
	certifyBtnText: { color: COLORS.text.inverse, fontSize: 14, fontWeight: '700' },
	disabledHint: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic', textAlign: 'center' },
});
