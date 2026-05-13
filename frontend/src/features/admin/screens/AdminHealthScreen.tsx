import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { AdminService, HealthReport } from '@/services/api/AdminService';
import { toast } from '@/shared/toast/Toast';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

const AUTO_REFRESH_MS = 15_000;

function fmtBytes(b: number | null): string {
	if (b === null || !Number.isFinite(b)) return '—';
	if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} Go`;
	if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} Mo`;
	if (b >= 1024)      return `${Math.round(b / 1024)} Ko`;
	return `${b} o`;
}

function fmtDuration(s: number): string {
	if (s < 60) return `${s} s`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m} min`;
	const h = Math.floor(m / 60);
	const rem = m % 60;
	if (h < 24) return rem ? `${h} h ${rem} min` : `${h} h`;
	const d = Math.floor(h / 24);
	return `${d} j ${h % 24} h`;
}

function fmtPct(used: number | null, total: number | null): string {
	if (used === null || total === null || total === 0) return '—';
	return `${Math.round((used / total) * 100)}%`;
}

function colorForPct(pct: number | null): string {
	if (pct === null) return COLORS.text.secondary;
	if (pct < 70)   return '#16a34a';
	if (pct <= 100) return '#f59e0b';
	return COLORS.danger;
}

function loadPct(load: number | null, cpus: number): number | null {
	if (load === null || cpus === 0) return null;
	return Math.round((load / cpus) * 100);
}

export const AdminHealthScreen: React.FC = () => {
	const service = useMemo(() => new AdminService(), []);
	const [report, setReport] = useState<HealthReport | null>(null);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);

	const fetchOnce = useCallback(async (manual = false) => {
		if (manual) setRefreshing(true);
		try {
			const r = await service.getHealth();
			setReport(r);
		} catch (err: any) {
			if (manual) toast.error(err?.response?.data?.error ?? err?.message ?? 'Chargement impossible.');
		} finally {
			if (manual) setRefreshing(false);
			setLoading(false);
		}
	}, [service]);

	useEffect(() => {
		fetchOnce(false);
		const id = setInterval(() => fetchOnce(false), AUTO_REFRESH_MS);
		return () => clearInterval(id);
	}, [fetchOnce]);

	if (loading || !report) {
		return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
	}

	const downCount = report.services.filter((s) => s.status === 'down').length;
	const memUsed = report.system.mem_total_bytes !== null && report.system.mem_available_bytes !== null
		? report.system.mem_total_bytes - report.system.mem_available_bytes
		: null;

	return (
		<ScrollView style={styles.container} contentContainerStyle={styles.content}>
			<View style={styles.header}>
				<View style={{ flex: 1 }}>
					<Text style={styles.title}>Santé plateforme</Text>
					<Text style={styles.subtitle}>
						Dernière vérification : {new Date(report.checked_at).toLocaleTimeString('fr-FR')} ·
						sondage en {report.probe_duration_ms} ms ·
						{downCount === 0 ? ' tous services OK' : ` ${downCount} service(s) en panne`}
					</Text>
				</View>
				<Pressable
					onPress={() => fetchOnce(true)}
					disabled={refreshing}
					style={[styles.refreshBtn, refreshing && styles.refreshBtnDisabled]}
				>
					<Text style={styles.refreshText}>{refreshing ? 'Sondage…' : '↻ Rafraîchir'}</Text>
				</Pressable>
			</View>

			<Text style={styles.sectionLabel}>Services</Text>
			<View style={styles.grid}>
				{report.services.map((s) => (
					<View key={s.id} style={[styles.serviceCard, s.status === 'down' && styles.serviceCardDown]}>
						<View style={styles.serviceHeader}>
							<View style={[styles.dot, { backgroundColor: s.status === 'ok' ? '#16a34a' : COLORS.danger }]} />
							<Text style={styles.serviceName}>{s.name}</Text>
						</View>
						<Text style={styles.serviceLatency}>{s.latency_ms} ms</Text>
						{s.detail ? <Text style={styles.serviceDetail}>{s.detail}</Text> : null}
					</View>
				))}
			</View>

			<View style={styles.row}>
				<View style={styles.statCard}>
					<Text style={styles.statTitle}>Process app-api</Text>
					<Text style={styles.statLine}>Uptime : <Text style={styles.bold}>{fmtDuration(report.process.uptime_seconds)}</Text></Text>
					<Text style={styles.statLine}>Node : {report.process.node_version}</Text>
					<Text style={styles.statLine}>RSS : {fmtBytes(report.process.rss_bytes)}</Text>
					<Text style={styles.statLine}>Heap : {fmtBytes(report.process.heap_used_bytes)}</Text>
				</View>

				<View style={styles.statCard}>
					<Text style={styles.statTitle}>Système (host)</Text>
					{(() => {
						const memPctNum = memUsed !== null && report.system.mem_total_bytes ? (memUsed / report.system.mem_total_bytes) * 100 : null;
						return (
							<Text style={styles.statLine}>
								Mémoire : <Text style={styles.bold}>{fmtBytes(memUsed)} / {fmtBytes(report.system.mem_total_bytes)}</Text>{' '}
								<Text style={{ color: colorForPct(memPctNum), fontWeight: '700' }}>
									{fmtPct(memUsed, report.system.mem_total_bytes)}
								</Text>
							</Text>
						);
					})()}
					{(() => {
						const cpus = report.system.cpu_count;
						const p1  = loadPct(report.system.loadavg_1m,  cpus);
						const p5  = loadPct(report.system.loadavg_5m,  cpus);
						const p15 = loadPct(report.system.loadavg_15m, cpus);
						return (
							<>
								<Text style={styles.statLine}>
									CPU ({cpus} cœur{cpus > 1 ? 's' : ''}) :{' '}
									<Text style={{ color: colorForPct(p1),  fontWeight: '700' }}>{p1  ?? '—'}%</Text>{' '}
									<Text style={styles.statSubdued}>1 min</Text>{' · '}
									<Text style={{ color: colorForPct(p5),  fontWeight: '700' }}>{p5  ?? '—'}%</Text>{' '}
									<Text style={styles.statSubdued}>5 min</Text>{' · '}
									<Text style={{ color: colorForPct(p15), fontWeight: '700' }}>{p15 ?? '—'}%</Text>{' '}
									<Text style={styles.statSubdued}>15 min</Text>
								</Text>
								<Text style={styles.statSubdued}>
									(load brute : {report.system.loadavg_1m ?? '—'} / {report.system.loadavg_5m ?? '—'} / {report.system.loadavg_15m ?? '—'})
								</Text>
							</>
						);
					})()}
				</View>

				<View style={styles.statCard}>
					<Text style={styles.statTitle}>Stockage</Text>
					<Text style={styles.statLine}>Postgres app-api : <Text style={styles.bold}>{fmtBytes(report.storage.postgres_db_bytes)}</Text></Text>
					<Text style={styles.statLine}>Sessions actives : <Text style={styles.bold}>{report.sessions.active ?? '—'}</Text></Text>
				</View>
			</View>

			<View style={styles.legend}>
				<Text style={styles.legendTitle}>Comment lire cette page</Text>
				<Text style={styles.legendLine}>
					<Text style={styles.bold}>Services</Text> : chaque sonde teste la connectivité réseau et mesure la latence aller-retour. Une pastille verte signifie joignable, rouge signifie injoignable (le détail donne le code d'erreur, ex. ECONNREFUSED, timeout).
				</Text>
				<Text style={styles.legendLine}>
					<Text style={styles.bold}>CPU</Text> : pourcentage de la capacité totale (load Unix ÷ nombre de cœurs, ramené en %). Les trois fenêtres 1/5/15 min indiquent la tendance : si la 1 min est plus élevée que la 15 min, la charge monte ; l'inverse, elle redescend.
				</Text>
				<Text style={styles.legendLine}>
					<Text style={styles.bold}>Code couleur</Text> :
					{' '}<Text style={{ color: '#16a34a', fontWeight: '700' }}>vert &lt; 70 %</Text> marge confortable,
					{' '}<Text style={{ color: '#f59e0b', fontWeight: '700' }}>orange 70–100 %</Text> proche de la saturation,
					{' '}<Text style={{ color: COLORS.danger, fontWeight: '700' }}>rouge &gt; 100 %</Text> processus en file d'attente (surcharge).
				</Text>
				<Text style={styles.legendLine}>
					<Text style={styles.bold}>Mémoire</Text> : « utilisée / totale » telle que vue par le host (calculée à partir de MemAvailable, ce qui inclut le cache réutilisable).
				</Text>
				<Text style={styles.legendLine}>
					<Text style={styles.bold}>Auto-refresh</Text> : la page se réactualise silencieusement toutes les 15 secondes. Bouton « Rafraîchir » pour forcer.
				</Text>
			</View>
		</ScrollView>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1 },
	content: { padding: SPACING.lg, paddingBottom: SPACING.xl * 2, gap: SPACING.md },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

	header: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginTop: 2 },
	refreshBtn: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 6, backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	refreshBtnDisabled: { opacity: 0.5 },
	refreshText: { ...TYPOGRAPHY.body, fontSize: 12, fontWeight: '600', color: COLORS.text.primary },

	sectionLabel: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginTop: SPACING.md },

	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
	serviceCard: {
		backgroundColor: COLORS.background.card,
		borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
		paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
		minWidth: 200, flex: 1, gap: 2,
	},
	serviceCardDown: { borderColor: COLORS.danger, backgroundColor: `${COLORS.danger}11` },
	serviceHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
	dot: { width: 10, height: 10, borderRadius: 5 },
	serviceName: { ...TYPOGRAPHY.body, fontSize: 13, fontWeight: '600', color: COLORS.text.primary, flex: 1 },
	serviceLatency: { fontSize: 11, color: COLORS.text.secondary, fontVariant: ['tabular-nums'] },
	serviceDetail: { fontSize: 11, color: COLORS.text.placeholder, fontStyle: 'italic' },

	row: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
	statCard: {
		backgroundColor: COLORS.background.card,
		borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
		padding: SPACING.md,
		minWidth: 260, flex: 1, gap: 4,
	},
	statTitle: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
	statLine: { fontSize: 13, color: COLORS.text.primary },
	statSubdued: { fontSize: 11, color: COLORS.text.placeholder, fontStyle: 'italic' },
	bold: { fontWeight: '700' },

	legend: {
		marginTop: SPACING.md,
		padding: SPACING.md,
		backgroundColor: COLORS.background.card,
		borderRadius: 10,
		borderWidth: 1,
		borderColor: COLORS.border,
		gap: SPACING.sm,
	},
	legendTitle: { fontSize: 12, color: COLORS.text.secondary, fontWeight: '700', textTransform: 'uppercase' },
	legendLine: { fontSize: 12, color: COLORS.text.primary, lineHeight: 18 },
});
