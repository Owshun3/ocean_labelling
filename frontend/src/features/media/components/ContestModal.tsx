import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

interface Props {
	visible: boolean;
	count: number;
	submitting: boolean;
	onCancel: () => void;
	onConfirm: (message: string) => void;
}

export const ContestModal: React.FC<Props> = ({ visible, count, submitting, onCancel, onConfirm }) => {
	const [message, setMessage] = useState('');

	useEffect(() => { if (visible) setMessage(''); }, [visible]);

	const trimmed = message.trim();
	const canSubmit = trimmed.length > 0 && !submitting;

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
			<View style={styles.backdrop}>
				<View style={styles.card}>
					<Text style={styles.title}>Contester le rejet</Text>
					<Text style={styles.subtitle}>
						{count} média{count > 1 ? 's' : ''} rejeté{count > 1 ? 's' : ''} concerné{count > 1 ? 's' : ''}
					</Text>

					<Text style={styles.fieldLabel}>Message (obligatoire)</Text>
					<TextInput
						value={message}
						onChangeText={setMessage}
						placeholder="Explique pourquoi tu estimes que ce rejet est incorrect…"
						placeholderTextColor={COLORS.text.placeholder}
						multiline
						style={styles.textArea}
						editable={!submitting}
					/>

					<View style={styles.actions}>
						<Pressable
							onPress={onCancel}
							disabled={submitting}
							style={[styles.actionBtn, styles.cancelBtn, submitting && styles.btnDisabled]}
						>
							<Text style={[styles.actionBtnText, { color: COLORS.text.primary }]}>Annuler</Text>
						</Pressable>
						<Pressable
							onPress={() => canSubmit && onConfirm(trimmed)}
							disabled={!canSubmit}
							style={[styles.actionBtn, styles.confirmBtn, !canSubmit && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>Envoyer la contestation</Text>
						</Pressable>
					</View>
				</View>
			</View>
		</Modal>
	);
};

const styles = StyleSheet.create({
	backdrop: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		alignItems: 'center',
		justifyContent: 'center',
		padding: SPACING.lg,
	},
	card: {
		width: '100%',
		maxWidth: 520,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		padding: SPACING.lg,
	},
	title: { ...TYPOGRAPHY.h2, marginBottom: SPACING.xs },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginBottom: SPACING.md },

	fieldLabel: { fontSize: 12, color: COLORS.text.secondary, marginTop: SPACING.sm, marginBottom: SPACING.xs, fontWeight: '600' },
	textArea: {
		borderWidth: 1,
		borderColor: COLORS.border,
		borderRadius: 6,
		paddingHorizontal: SPACING.sm,
		paddingVertical: SPACING.sm,
		fontSize: 13,
		color: COLORS.text.primary,
		backgroundColor: COLORS.background.main,
		minHeight: 100,
		textAlignVertical: 'top',
	},

	actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
	actionBtn: {
		flex: 1,
		paddingHorizontal: SPACING.md,
		paddingVertical: SPACING.sm,
		borderRadius: 6,
		alignItems: 'center',
	},
	cancelBtn: { backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	confirmBtn: { backgroundColor: COLORS.primary },
	btnDisabled: { opacity: 0.5 },
	actionBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 14 },
});
