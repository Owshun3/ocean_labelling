import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { toast } from '@/shared/toast/Toast';
import { useRouter, Href, useFocusEffect } from 'expo-router';
import { AppApiService, UserProfile } from '@/services/api/AppApiService';
import { CvatAuthService } from '@/services/api/CvatAuthService';
import { computeRank } from '@/shared/ranks';
import { BackButton } from '@/shared/components/BackButton';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

function fmtDate(s: string | null): string {
	if (!s) return '—';
	try { return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }); }
	catch { return s; }
}

export const ProfileScreen: React.FC = () => {
	const router = useRouter();
	const service = useMemo(() => new AppApiService(), []);
	const [profile, setProfile] = useState<UserProfile | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError]     = useState<string | null>(null);

	const load = useCallback(() => {
		setLoading(true);
		service.getMyProfile()
			.then(setProfile)
			.catch((err) => setError(err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.'))
			.finally(() => setLoading(false));
	}, [service]);

	useFocusEffect(useCallback(() => { load(); }, [load]));

	const handleLogout = async () => {
		try {
			const authService = new CvatAuthService();
			await authService.logout();
			router.replace('/(auth)/login' as Href);
		} catch {
			toast.error('Déconnexion impossible.');
		}
	};

	if (loading && !profile) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}
	if (error || !profile) {
		return <View style={styles.center}><Text style={styles.errorText}>Erreur : {error ?? 'profil indisponible'}</Text></View>;
	}

	const rank = computeRank(profile.stats.actions_validated_total);

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<Text style={styles.title}>Mon Profil</Text>

			<View style={styles.columns}>
				<View style={styles.col}>
					<Text style={styles.heading}>Mes informations personnelles</Text>

					<InfoRow label="Identifiant" value={profile.username} />
					<InfoRow label="Prénom"      value={profile.first_name || '—'} />
					<InfoRow label="Nom"         value={profile.last_name  || '—'} />
					<InfoRow label="Email"       value={profile.email      || '—'} />
					<InfoRow label="Inscrit le"  value={fmtDate(profile.date_joined)} />
					<InfoRow label="Rôle"        value={profile.role} />

					<View style={styles.rankBlock}>
						<View style={styles.rankHeader}>
							<View style={[styles.rankDot, { backgroundColor: rank.current.color }]} />
							<Text style={styles.rankLabel}>Rang {rank.current.label}</Text>
						</View>
						<View style={styles.rankBar}>
							<View style={[styles.rankBarFill, { width: `${rank.progressPct}%`, backgroundColor: rank.current.color }]} />
						</View>
						<Text style={styles.rankCount}>
							{rank.actions}{rank.next ? ` / ${rank.next.threshold}` : ''} actions validées
						</Text>
						{rank.next ? (
							<Text style={styles.rankNext}>{rank.toNext} action(s) avant {rank.next.label}</Text>
						) : (
							<Text style={styles.rankNext}>Tu es au palier le plus élevé.</Text>
						)}
					</View>

					<View style={styles.actionsBlock}>
						<Pressable
							onPress={() => router.push('/(main)/profile/edit' as Href)}
							style={[styles.actionBtn, styles.primaryBtn]}
						>
							<Text style={styles.primaryBtnText}>Modifier mes informations</Text>
						</Pressable>
						<Pressable
							onPress={() => router.push('/(main)/profile/password' as Href)}
							style={[styles.actionBtn, styles.secondaryBtn]}
						>
							<Text style={styles.secondaryBtnText}>Modifier mon mot de passe</Text>
						</Pressable>
					</View>

					<Pressable onPress={handleLogout} style={[styles.actionBtn, styles.logoutBtn]}>
						<Text style={styles.logoutBtnText}>Se déconnecter</Text>
					</Pressable>
				</View>

				<View style={styles.col}>
					<Text style={styles.heading}>Mes statistiques</Text>

					<View style={styles.kpiRow}>
						<View style={styles.kpi}>
							<Text style={styles.kpiValue}>{profile.stats.annotations_validated}</Text>
							<Text style={styles.kpiLabel}>Annotations validées par curator</Text>
						</View>
						<View style={styles.kpi}>
							<Text style={styles.kpiValue}>{profile.stats.media_uploaded_total}</Text>
							<Text style={styles.kpiLabel}>Médias téléversés au total</Text>
						</View>
					</View>

					<View style={styles.kpiRow}>
						<View style={styles.kpi}>
							<Text style={[styles.kpiValue, { color: COLORS.success }]}>{profile.stats.media_validated}</Text>
							<Text style={styles.kpiLabel}>Médias acceptés en modération</Text>
						</View>
						<View style={styles.kpi}>
							<Text style={[styles.kpiValue, { color: COLORS.danger }]}>{profile.stats.media_rejected}</Text>
							<Text style={styles.kpiLabel}>Médias refusés en modération</Text>
						</View>
					</View>
				</View>
			</View>

			<View style={styles.footer}>
				<BackButton href={'/(main)' as Href} />
			</View>
		</ScrollView>
	);
};

const InfoRow: React.FC<{ label: string; value: string; compact?: boolean }> = ({ label, value, compact }) => (
	<View style={[styles.infoRow, compact && styles.infoRowCompact]}>
		<Text style={styles.infoLabel}>{label}</Text>
		<Text style={styles.infoValue}>{value}</Text>
	</View>
);

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
	errorText: { ...TYPOGRAPHY.body, color: COLORS.danger },

	title: { ...TYPOGRAPHY.h1, marginBottom: SPACING.md },

	columns: { flexDirection: 'row', gap: SPACING.md, alignItems: 'flex-start' },
	col: {
		flex: 1,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		padding: SPACING.md,
		gap: SPACING.sm,
	},

	heading: { ...TYPOGRAPHY.h2, fontSize: 16, marginBottom: SPACING.xs },

	infoRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.sm, paddingVertical: 4 },
	infoRowCompact: { paddingVertical: 2 },
	infoLabel: { fontSize: 12, color: COLORS.text.secondary, width: 140 },
	infoValue: { fontSize: 13, color: COLORS.text.primary, fontWeight: '500', flex: 1 },

	rankBlock: {
		marginTop: SPACING.md,
		padding: SPACING.sm,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		gap: 4,
	},
	rankHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	rankDot:    { width: 10, height: 10, borderRadius: 5 },
	rankLabel:  { fontSize: 14, fontWeight: '700', color: COLORS.text.primary },
	rankBar:    { height: 6, backgroundColor: COLORS.background.main, borderRadius: 3, overflow: 'hidden', marginTop: 4 },
	rankBarFill: { height: 6, borderRadius: 3 },
	rankCount:  { fontSize: 12, color: COLORS.text.primary, marginTop: 2 },
	rankNext:   { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },

	actionsBlock: { marginTop: SPACING.md, gap: SPACING.xs },
	actionBtn: { paddingVertical: SPACING.sm, borderRadius: 6, alignItems: 'center' },
	primaryBtn: { backgroundColor: COLORS.primary },
	primaryBtnText: { color: COLORS.text.inverse, fontWeight: '600', fontSize: 13 },
	secondaryBtn: { backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	secondaryBtnText: { color: COLORS.text.primary, fontWeight: '600', fontSize: 13 },

	logoutBtn: {
		marginTop: SPACING.md,
		paddingVertical: SPACING.sm,
		borderRadius: 6,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: COLORS.danger,
		backgroundColor: COLORS.background.main,
	},
	logoutBtnText: { color: COLORS.danger, fontWeight: '600', fontSize: 13 },

	kpiRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
	kpi: {
		flex: 1,
		paddingVertical: SPACING.md,
		paddingHorizontal: SPACING.sm,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: COLORS.border,
		alignItems: 'center',
		gap: 4,
	},
	kpiValue: { fontSize: 24, fontWeight: '700', color: COLORS.primary },
	kpiLabel: { fontSize: 11, color: COLORS.text.secondary, textAlign: 'center' },

	statSubBlock: { gap: 2, marginTop: SPACING.sm },
	statSubHeading: { fontSize: 11, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },

	footer: { marginTop: SPACING.lg },
});
