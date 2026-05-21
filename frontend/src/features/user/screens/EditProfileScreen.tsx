import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { AppApiService, UpdateProfilePayload, UserProfile } from '@/services/api/AppApiService';
import { getUserProfile, saveUserProfile } from '@/services/api/authStorage';
import { BackButton } from '@/shared/components/BackButton';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

function daysUntil(dateIso: string | null): number | null {
	if (!dateIso) return null;
	const ms = new Date(dateIso).getTime() - Date.now();
	if (ms <= 0) return 0;
	return Math.ceil(ms / 86400_000);
}

export const EditProfileScreen: React.FC = () => {
	const router = useRouter();
	const service = useMemo(() => new AppApiService(), []);

	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError]     = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const [username,  setUsername]  = useState('');
	const [firstName, setFirstName] = useState('');
	const [lastName,  setLastName]  = useState('');
	const [email,     setEmail]     = useState('');

	useEffect(() => {
		service.getMyProfile()
			.then((p) => {
				setProfile(p);
				setUsername(p.username);
				setFirstName(p.first_name);
				setLastName(p.last_name);
				setEmail(p.email);
			})
			.catch((err) => {
				const detail = err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.';
				setError(typeof detail === 'string' ? detail : JSON.stringify(detail));
			})
			.finally(() => setLoading(false));
	}, [service]);

	const canChangeUsername = !profile?.username_next_change_at || Date.now() >= new Date(profile.username_next_change_at).getTime();
	const usernameCooldownDays = canChangeUsername ? null : daysUntil(profile?.username_next_change_at ?? null);

	const onSubmit = useCallback(async () => {
		if (!profile || submitting) return;
		const payload: UpdateProfilePayload = {};
		if (firstName !== profile.first_name) payload.first_name = firstName.trim();
		if (lastName  !== profile.last_name)  payload.last_name  = lastName.trim();
		if (email     !== profile.email)      payload.email      = email.trim();
		if (canChangeUsername && username.trim() && username.trim() !== profile.username) {
			payload.username = username.trim();
		}
		if (Object.keys(payload).length === 0) {
			toast.info('Aucune modification à enregistrer.');
			return;
		}
		setSubmitting(true);
		try {
			const updated = await service.updateMyProfile(payload);
			if (payload.username) {
				const stored = getUserProfile();
				if (stored) saveUserProfile({ ...stored, username: updated.username });
			}
			toast.success('Informations enregistrées.');
			router.replace('/(main)/profile' as Href);
		} catch (err: any) {
			const detail = err?.response?.data?.error ?? err?.message ?? 'Modification impossible.';
			toast.error(typeof detail === 'string' ? detail : JSON.stringify(detail));
		} finally {
			setSubmitting(false);
		}
	}, [profile, submitting, firstName, lastName, email, username, canChangeUsername, service, router]);

	if (loading) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}
	if (error || !profile) {
		return <View style={styles.center}><Text style={styles.errorText}>Erreur : {error ?? 'profil indisponible'}</Text></View>;
	}

	return (
		<View style={[styles.container, styles.content]}>
			<Text style={styles.title}>Modifier mes informations</Text>

			<View style={styles.card}>
				<FormField label="Identifiant" value={username} onChange={setUsername}
				           editable={canChangeUsername && !submitting}
				           hint={canChangeUsername
				             ? 'Changement possible une fois tous les 30 jours.'
				             : `Prochain changement dans ${usernameCooldownDays} jour${(usernameCooldownDays ?? 0) > 1 ? 's' : ''}.`} />
				<FormField label="Prénom" value={firstName} onChange={setFirstName} editable={!submitting} />
				<FormField label="Nom"    value={lastName}  onChange={setLastName}  editable={!submitting} />
				<FormField label="Email"  value={email}     onChange={setEmail}     editable={!submitting} keyboardType="email-address" />

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
	keyboardType?: any;
}

const FormField: React.FC<FieldProps> = ({ label, value, editable, onChange, hint, keyboardType }) => (
	<View style={styles.field}>
		<Text style={styles.fieldLabel}>{label}</Text>
		<TextInput
			value={value}
			onChangeText={onChange}
			editable={editable}
			keyboardType={keyboardType}
			autoCapitalize="none"
			style={[styles.input, !editable && styles.inputDisabled]}
		/>
		{hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
	</View>
);

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },

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
	input: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.main,
	},
	inputDisabled: { backgroundColor: COLORS.background.imagePlaceholder, color: COLORS.text.secondary },

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
