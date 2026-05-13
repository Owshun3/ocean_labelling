import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, TextInput, StyleSheet } from 'react-native';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

type BanUnit = 'hours' | 'days' | 'weeks' | 'months';
type BanMode = 'temp' | 'perm';

const UNIT_TO_DAYS: Record<BanUnit, number> = {
	hours:  1 / 24,
	days:   1,
	weeks:  7,
	months: 30,
};

const UNIT_LABELS: Record<BanUnit, string> = {
	hours:  'heures',
	days:   'jours',
	weeks:  'semaines',
	months: 'mois',
};

interface Props {
	visible: boolean;
	userLabel: string;
	submitting: boolean;
	onCancel: () => void;
	onConfirm: (durationDays: number | null, reason: string) => void;
}

export const BanModal: React.FC<Props> = ({ visible, userLabel, submitting, onCancel, onConfirm }) => {
	const [mode, setMode] = useState<BanMode>('temp');
	const [unit, setUnit] = useState<BanUnit>('days');
	const [value, setValue] = useState('7');
	const [reason, setReason] = useState('');

	useEffect(() => {
		if (visible) {
			setMode('temp');
			setUnit('days');
			setValue('7');
			setReason('');
		}
	}, [visible]);

	const submit = () => {
		if (mode === 'perm') return onConfirm(null, reason);
		const n = Number(value);
		if (!Number.isFinite(n) || n <= 0) {
			toast.error('Durée invalide — indique une valeur strictement positive.');
			return;
		}
		const days = n * UNIT_TO_DAYS[unit];
		onConfirm(days, reason);
	};

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
			<View style={styles.backdrop}>
				<View style={styles.card}>
					<Text style={styles.title}>Bannir « {userLabel} »</Text>

					<View style={styles.modeRow}>
						<Pressable
							onPress={() => setMode('temp')}
							style={[styles.pill, mode === 'temp' && styles.pillActive]}
						>
							<Text style={[styles.pillText, mode === 'temp' && styles.pillTextActive]}>Pour une durée</Text>
						</Pressable>
						<Pressable
							onPress={() => setMode('perm')}
							style={[styles.pill, mode === 'perm' && styles.pillActive]}
						>
							<Text style={[styles.pillText, mode === 'perm' && styles.pillTextActive]}>Définitivement</Text>
						</Pressable>
					</View>

					{mode === 'temp' && (
						<>
							<Text style={styles.fieldLabel}>Durée</Text>
							<View style={styles.durationRow}>
								<TextInput
									value={value}
									onChangeText={setValue}
									keyboardType="numeric"
									style={[styles.input, styles.durationValue]}
									editable={!submitting}
								/>
								<View style={styles.unitRow}>
									{(Object.keys(UNIT_LABELS) as BanUnit[]).map((u) => (
										<Pressable
											key={u}
											onPress={() => setUnit(u)}
											style={[styles.unitPill, unit === u && styles.unitPillActive]}
										>
											<Text style={[styles.unitText, unit === u && styles.unitTextActive]}>
												{UNIT_LABELS[u]}
											</Text>
										</Pressable>
									))}
								</View>
							</View>
						</>
					)}

					<Text style={styles.fieldLabel}>Motif (optionnel)</Text>
					<TextInput
						value={reason}
						onChangeText={setReason}
						placeholder="Ex : spam répété, contenu choquant…"
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
							onPress={submit}
							disabled={submitting}
							style={[styles.actionBtn, styles.banBtn, submitting && styles.btnDisabled]}
						>
							<Text style={styles.actionBtnText}>Confirmer le bannissement</Text>
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
	title: { ...TYPOGRAPHY.h2, marginBottom: SPACING.md },

	modeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
	pill: {
		flex: 1,
		paddingVertical: SPACING.sm,
		alignItems: 'center',
		borderRadius: 6,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	pillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	pillText: { fontSize: 13, color: COLORS.text.primary, fontWeight: '500' },
	pillTextActive: { color: COLORS.text.inverse },

	fieldLabel: { fontSize: 12, color: COLORS.text.secondary, marginTop: SPACING.md, marginBottom: SPACING.xs, fontWeight: '600' },

	durationRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
	durationValue: { width: 90 },
	unitRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
	unitPill: {
		paddingHorizontal: SPACING.sm,
		paddingVertical: 8,
		borderRadius: 6,
		borderWidth: 1,
		borderColor: COLORS.border,
		backgroundColor: COLORS.background.main,
	},
	unitPillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
	unitText: { fontSize: 12, color: COLORS.text.primary, fontWeight: '500' },
	unitTextActive: { color: COLORS.text.inverse },

	input: {
		borderWidth: 1,
		borderColor: COLORS.border,
		borderRadius: 6,
		paddingHorizontal: SPACING.sm,
		paddingVertical: SPACING.sm,
		fontSize: 14,
		color: COLORS.text.primary,
		backgroundColor: COLORS.background.main,
	},
	textArea: {
		borderWidth: 1,
		borderColor: COLORS.border,
		borderRadius: 6,
		paddingHorizontal: SPACING.sm,
		paddingVertical: SPACING.sm,
		fontSize: 13,
		color: COLORS.text.primary,
		backgroundColor: COLORS.background.main,
		minHeight: 70,
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
	banBtn: { backgroundColor: COLORS.danger },
	btnDisabled: { opacity: 0.5 },
	actionBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 14 },
});
