import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AppApiService } from '@/services/api/AppApiService';
import { BackButton } from '@/shared/components/BackButton';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

export const ChangePasswordScreen: React.FC = () => {
	const router = useRouter();
	const service = useMemo(() => new AppApiService(), []);

	const [oldPassword, setOldPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [submitting, setSubmitting] = useState(false);

	const onSubmit = useCallback(async () => {
		if (submitting) return;
		if (!oldPassword || !newPassword || !confirmPassword) {
			toast.error('Tous les champs sont obligatoires.');
			return;
		}
		if (newPassword !== confirmPassword) {
			toast.error('Les deux nouveaux mots de passe ne correspondent pas.');
			return;
		}
		if (newPassword.length < 8) {
			toast.error('Le nouveau mot de passe doit contenir au moins 8 caractères.');
			return;
		}
		setSubmitting(true);
		try {
			await service.changeMyPassword({
				old_password: oldPassword,
				new_password: newPassword,
				confirm_password: confirmPassword,
			});
			toast.success('Mot de passe modifié.');
			router.replace('/(main)/profile' as Href);
		} catch (err: any) {
			const detail = err?.response?.data?.error ?? err?.message ?? 'Modification impossible.';
			toast.error(typeof detail === 'string' ? detail : JSON.stringify(detail));
		} finally {
			setSubmitting(false);
		}
	}, [submitting, oldPassword, newPassword, confirmPassword, service, router]);

	return (
		<View style={[styles.container, styles.content]}>
			<Text style={styles.title}>Modifier mon mot de passe</Text>

			<View style={styles.card}>
				<PasswordField label="Mot de passe actuel" value={oldPassword} onChange={setOldPassword} editable={!submitting} />
				<PasswordField label="Nouveau mot de passe" value={newPassword} onChange={setNewPassword} editable={!submitting}
				               hint="8 caractères minimum." />
				<PasswordField label="Confirmer le nouveau mot de passe" value={confirmPassword} onChange={setConfirmPassword} editable={!submitting} />

				<Pressable
					onPress={onSubmit}
					disabled={submitting}
					style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
				>
					<Text style={styles.submitBtnText}>{submitting ? 'Enregistrement…' : 'Enregistrer'}</Text>
				</Pressable>
			</View>

			<View style={styles.footer}>
				<BackButton href={'/(main)/profile' as Href} />
			</View>
		</View>
	);
};

interface FieldProps {
	label: string;
	value: string;
	editable: boolean;
	onChange: (v: string) => void;
	hint?: string;
}

const PasswordField: React.FC<FieldProps> = ({ label, value, editable, onChange, hint }) => {
	const [visible, setVisible] = useState(false);
	return (
		<View style={styles.field}>
			<Text style={styles.fieldLabel}>{label}</Text>
			<View style={styles.passwordRow}>
				<TextInput
					value={value}
					onChangeText={onChange}
					editable={editable}
					secureTextEntry={!visible}
					autoCapitalize="none"
					style={[styles.input, styles.inputWithIcon, !editable && styles.inputDisabled]}
				/>
				<Pressable onPress={() => setVisible(v => !v)} style={styles.eyeButton} disabled={!editable}>
					<Ionicons name={visible ? 'eye-off' : 'eye'} size={20} color={COLORS.text.secondary} />
				</Pressable>
			</View>
			{hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },

	title: { ...TYPOGRAPHY.h1, marginBottom: SPACING.md },

	card: {
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.md,
		gap: SPACING.md,
		maxWidth: 500,
	},

	field: { gap: 4 },
	fieldLabel: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	fieldHint:  { fontSize: 11, color: COLORS.text.placeholder, fontStyle: 'italic' },
	passwordRow: { flexDirection: 'row', alignItems: 'center' },
	input: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main,
		flex: 1,
	},
	inputWithIcon: { paddingRight: 40 },
	inputDisabled: { backgroundColor: COLORS.background.imagePlaceholder, color: COLORS.text.secondary },
	eyeButton: {
		position: 'absolute', right: 8, height: '100%',
		paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center',
	},

	submitBtn: {
		marginTop: SPACING.sm,
		paddingVertical: SPACING.sm,
		borderRadius: 6,
		backgroundColor: COLORS.primary,
		alignItems: 'center',
	},
	submitBtnDisabled: { opacity: 0.5 },
	submitBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 13 },

	footer: { marginTop: SPACING.lg },
});
