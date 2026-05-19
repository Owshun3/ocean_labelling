import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, StyleSheet, Platform } from 'react-native';
import { AppRole } from '@/services/api/AppApiService';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const ASSIGNABLE_ROLES: { value: AppRole; label: string }[] = [
	{ value: 'annotator', label: 'Annotateur' },
	{ value: 'chercheur', label: 'Chercheur' },
	{ value: 'curator',   label: 'Curateur' },
	{ value: 'moderator', label: 'Modérateur' },
];

interface CreateAccountInput {
	username: string;
	password: string;
	email: string;
	first_name: string;
	last_name: string;
	role: AppRole;
}

interface Props {
	visible: boolean;
	submitting: boolean;
	onCancel: () => void;
	onConfirm: (input: CreateAccountInput) => Promise<void>;
}

export const CreateAccountModal: React.FC<Props> = ({ visible, submitting, onCancel, onConfirm }) => {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [email, setEmail]       = useState('');
	const [firstName, setFirstName] = useState('');
	const [lastName, setLastName]   = useState('');
	const [role, setRole]         = useState<AppRole>('annotator');

	useEffect(() => {
		if (visible) {
			setUsername(''); setPassword(''); setEmail('');
			setFirstName(''); setLastName(''); setRole('annotator');
		}
	}, [visible]);

	const canSubmit = !!username && password.length >= 8 && /\S+@\S+\.\S+/.test(email) && !submitting;

	const submit = async () => {
		if (!canSubmit) return;
		await onConfirm({
			username: username.trim(), password, email: email.trim(),
			first_name: firstName.trim(), last_name: lastName.trim(),
			role,
		});
	};

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
			<View style={styles.backdrop}>
				<View style={styles.card}>
					<Text style={styles.title}>Créer un compte</Text>
					<Text style={styles.subtitle}>
						Le compte est créé directement avec son rôle. Le mot de passe ne pourra être réinitialisé que par l'utilisateur lui-même via son profil.
					</Text>

					<Field label="Identifiant (login)" value={username} onChange={setUsername} autoCapitalize="none" />
					<Field label="Email"               value={email}    onChange={setEmail}    autoCapitalize="none" />
					<Field label="Prénom (optionnel)"  value={firstName} onChange={setFirstName} />
					<Field label="Nom (optionnel)"     value={lastName}  onChange={setLastName} />
					<Field label="Mot de passe (≥ 8 caractères)" value={password} onChange={setPassword} secure />

					<Text style={styles.fieldLabel}>Rôle</Text>
					{Platform.OS === 'web' ? (
						// @ts-ignore RN-Web : select natif HTML
						<select
							value={role}
							onChange={(e: any) => setRole(e.target.value as AppRole)}
							disabled={submitting}
							style={selectStyle as any}
						>
							{ASSIGNABLE_ROLES.map((r) => (
								<option key={r.value} value={r.value}>{r.label}</option>
							))}
						</select>
					) : (
						<Text>(Web only)</Text>
					)}
					<Text style={styles.helperText}>
						Le rôle « administrateur » n'est pas attribuable depuis l'UI — il découle du statut superuser CVAT.
					</Text>

					<View style={styles.actions}>
						<Pressable onPress={onCancel} disabled={submitting} style={[styles.btn, styles.btnGhost, submitting && styles.btnDisabled]}>
							<Text style={styles.btnGhostText}>Annuler</Text>
						</Pressable>
						<Pressable onPress={submit} disabled={!canSubmit} style={[styles.btn, styles.btnPrimary, !canSubmit && styles.btnDisabled]}>
							<Text style={styles.btnPrimaryText}>{submitting ? 'Création…' : 'Créer le compte'}</Text>
						</Pressable>
					</View>
				</View>
			</View>
		</Modal>
	);
};

interface FieldProps {
	label:    string;
	value:    string;
	onChange: (v: string) => void;
	secure?:  boolean;
	autoCapitalize?: 'none' | 'sentences';
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, secure, autoCapitalize }) => (
	<View style={styles.fieldBlock}>
		<Text style={styles.fieldLabel}>{label}</Text>
		<TextInput
			value={value}
			onChangeText={onChange}
			secureTextEntry={secure}
			autoCapitalize={autoCapitalize}
			autoCorrect={false}
			style={styles.input}
		/>
	</View>
);

const selectStyle = {
	padding: '8px 10px',
	borderRadius: 6,
	border: `1px solid ${COLORS.border}`,
	backgroundColor: COLORS.background.main,
	color: COLORS.text.primary,
	fontSize: 13,
	width: '100%',
};

const styles = StyleSheet.create({
	backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: SPACING.lg },
	card: { width: '100%', maxWidth: 480, backgroundColor: COLORS.background.card, borderRadius: 10, padding: SPACING.lg, gap: SPACING.xs },
	title: { ...TYPOGRAPHY.h2, marginBottom: SPACING.xs },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginBottom: SPACING.md },
	fieldBlock: { gap: 2 },
	fieldLabel: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '600', marginTop: SPACING.xs },
	input: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main,
	},
	helperText: { ...TYPOGRAPHY.caption, color: COLORS.text.placeholder, fontStyle: 'italic', marginTop: 2 },
	actions: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
	btn: { flex: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, alignItems: 'center' },
	btnPrimary: { backgroundColor: COLORS.primary },
	btnPrimaryText: { color: COLORS.text.inverse, fontWeight: '700' },
	btnGhost: { backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	btnGhostText: { color: COLORS.text.primary, fontWeight: '600' },
	btnDisabled: { opacity: 0.5 },
});
