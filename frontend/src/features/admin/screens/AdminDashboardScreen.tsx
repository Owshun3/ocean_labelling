import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet, Href } from 'react-native';
import { AdminService, DashboardSummary } from '@/services/api/AdminService';
import { AdminCard, AdminCardSeverity } from '@/features/admin/components/AdminCard';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

function fmtBytes(b: number | null): string {
	if (b === null || !Number.isFinite(b)) return '—';
	if (b >= 1024 * 1024 * 1024) return `${(b / (1024 ** 3)).toFixed(1)} Go`;
	if (b >= 1024 * 1024)        return `${Math.round(b / (1024 ** 2))} Mo`;
	if (b >= 1024)               return `${Math.round(b / 1024)} Ko`;
	return `${b} o`;
}

export const AdminDashboardScreen: React.FC = () => {
	const service = useMemo(() => new AdminService(), []);
	const [summary, setSummary] = useState<DashboardSummary | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError]     = useState<string | null>(null);

	useEffect(() => {
		service.getDashboardSummary()
			.then(setSummary)
			.catch((err) => setError(err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.'))
			.finally(() => setLoading(false));
	}, [service]);

	if (loading) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}

	const requestsTotal = summary?.requests?.total ?? summary?.contestations.total ?? 0;
	const contestSev: AdminCardSeverity = requestsTotal > 0 ? 'warning' : 'success';
	const curationSev: AdminCardSeverity = (summary?.curation.media_awaiting ?? 0) > 0 ? 'info' : 'neutral';
	const banSev: AdminCardSeverity = (summary?.accounts.active_bans ?? 0) > 0 ? 'warning' : 'success';

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<Text style={styles.title}>Tableau de bord administrateur</Text>
			{error ? <Text style={styles.error}>Données partielles : {error}</Text> : null}

			<View style={styles.grid}>
				<AdminCard
					title="Comptes utilisateurs"
					href={'/(main)/admin/accounts' as Href}
					icon="people"
					kpiValue={summary?.accounts.active_sessions ?? 0}
					kpiLabel="utilisateur(s) connecté(s)"
					description={`${summary?.accounts.active_bans ?? 0} compte(s) banni(s) actuellement`}
					severity={banSev}
				/>

				<AdminCard
					title="Santé plateforme"
					href={'/(main)/admin/health' as Href}
					icon="pulse"
					description="État des services, ressources disponibles, taux d'utilisation"
					severity="neutral"
				/>

				<AdminCard
					title="Requêtes"
					href={'/(main)/admin/requests' as Href}
					icon="alert-circle"
					kpiValue={requestsTotal}
					kpiLabel="en attente"
					description={`Contestations : ${summary?.requests?.contestations ?? summary?.contestations.total ?? 0} · Fiches d'espèces : ${summary?.requests?.species_edits ?? 0} · Accès chercheurs : ${summary?.requests?.chercheur_exports ?? 0}`}
					severity={contestSev}
				/>

				<AdminCard
					title="Logs d'activité"
					href={'/(main)/admin/activity' as Href}
					icon="time"
					description="Historique des actions admin, bannissements, validations"
					severity="neutral"
				/>

				<AdminCard
					title="Paramètres système"
					href={'/(main)/admin/settings' as Href}
					icon="settings"
					description={`Taille max upload : ${fmtBytes(summary?.settings.upload_max_bytes ?? null)}`}
					severity="neutral"
				/>

				<AdminCard
					title="Assignation curation"
					href={'/(main)/admin/curation' as Href}
					icon="git-network"
					kpiValue={summary?.curation.media_awaiting ?? 0}
					kpiLabel="média(s) en attente"
					description="Distribution des batches aux curators"
					severity={curationSev}
				/>

				<AdminCard
					title="Export des données"
					href={'/(main)/admin/export' as Href}
					icon="cloud-download"
					description="Datumaro, filtres par espèce, tag, utilisateur"
					severity="neutral"
				/>

				<AdminCard
					title="Tags d'espèces"
					href={'/(main)/admin/species-tags' as Href}
					icon="pricetags"
					description="Taxonomie obligatoire/exclusive utilisée par le curator et l'export"
					severity="neutral"
				/>
			</View>
		</ScrollView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },

	title: { ...TYPOGRAPHY.h1, marginBottom: SPACING.md },
	error: { ...TYPOGRAPHY.body, color: COLORS.warning, marginBottom: SPACING.sm, fontStyle: 'italic' },

	grid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: SPACING.md,
	},
});
