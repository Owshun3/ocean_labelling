import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import { SpeciesService, type Species } from '@/services/api/SpeciesService';
import type { ProposalSpecies } from '@/services/api/CuratorService';

interface Props {
	onPick:   (species: ProposalSpecies) => void;
	onBack:   () => void;
	onCancel: () => void;
}

const DEBOUNCE_MS = 300;

export const KnownSpeciesPicker: React.FC<Props> = ({ onPick, onBack, onCancel }) => {
	const service = useMemo(() => new SpeciesService(), []);
	const [query, setQuery]   = useState('');
	const [results, setResults] = useState<Species[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError]   = useState<string | null>(null);
	const debRef = useRef<any>(null);

	useEffect(() => {
		if (debRef.current) clearTimeout(debRef.current);
		const q = query.trim();
		if (q.length === 0) { setResults([]); setLoading(false); return; }
		setLoading(true);
		debRef.current = setTimeout(async () => {
			try {
				const list = await service.search(q, 15);
				setResults(list);
				setError(null);
			} catch (err: any) {
				setError(err?.response?.data?.error ?? err?.message ?? 'Recherche impossible.');
				setResults([]);
			} finally {
				setLoading(false);
			}
		}, DEBOUNCE_MS);
		return () => { if (debRef.current) clearTimeout(debRef.current); };
	}, [query, service]);

	const handlePick = (s: Species) => {
		const ps: ProposalSpecies = {
			id: s.id,
			name: s.name,
			scientific_name: s.scientific_name ?? null,
			usage_name:      s.usage_name      ?? null,
			polynesian_name: s.polynesian_name ?? null,
			tags:            s.tags ?? [],
			status:          s.status,
		};
		onPick(ps);
	};

	return (
		<View style={styles.col}>
			<View style={styles.headerRow}>
				<View style={{ flex: 1 }}>
					<Text style={styles.title}>Espèce connue</Text>
					<Text style={styles.subtitle}>Recherche dans la base par nom scientifique, d'usage ou polynésien.</Text>
				</View>
				<Pressable onPress={onCancel} hitSlop={6} style={styles.closeBtn}>
					<Text style={styles.closeBtnText}>✕</Text>
				</Pressable>
			</View>

			<TextInput
				value={query}
				onChangeText={setQuery}
				placeholder="ex : chelonia, tortue, honu…"
				placeholderTextColor={COLORS.text.placeholder}
				style={styles.input}
				autoFocus
				autoCapitalize="none"
			/>

			{loading ? (
				<View style={styles.loadingRow}><ActivityIndicator size="small" color={COLORS.primary} /></View>
			) : null}

			{error ? <Text style={styles.errorText}>{error}</Text> : null}

			{!loading && query.trim().length > 0 && results.length === 0 && !error ? (
				<Text style={styles.emptyText}>Aucune espèce trouvée pour « {query.trim()} ».</Text>
			) : null}

			<View style={styles.resultList}>
				{results.map((s) => (
					<Pressable
						key={s.id}
						onPress={() => handlePick(s)}
						style={({ hovered }: any) => [styles.resultRow, hovered && styles.resultRowHover]}
					>
						<View style={styles.resultBody}>
							<Text style={styles.resultMain} numberOfLines={1}>
								{s.scientific_name ?? s.name ?? '—'}
							</Text>
							<Text style={styles.resultSub} numberOfLines={1}>
								{[s.usage_name, s.polynesian_name].filter(Boolean).join(' · ') || '—'}
							</Text>
							{s.tags && s.tags.length > 0 ? (
								<Text style={styles.resultTags} numberOfLines={1}>{s.tags.join(' · ')}</Text>
							) : null}
						</View>
						<StatusBadge status={s.status} />
					</Pressable>
				))}
			</View>

			<View style={styles.footer}>
				<Pressable onPress={onBack} style={[styles.btnNeutral, { flex: 1 }]}>
					<Text style={styles.btnNeutralText}>← Retour</Text>
				</Pressable>
				<Pressable onPress={onCancel} style={[styles.btnNeutral, { flex: 1 }]}>
					<Text style={styles.btnNeutralText}>Annuler</Text>
				</Pressable>
			</View>
		</View>
	);
};

const StatusBadge: React.FC<{ status: Species['status'] }> = ({ status }) => {
	if (status === 'approved') {
		return <View style={[styles.badge, styles.badgeCertified]}><Text style={styles.badgeText}>Certifiée</Text></View>;
	}
	return <View style={[styles.badge, styles.badgePending]}><Text style={styles.badgeText}>En attente</Text></View>;
};

const styles = StyleSheet.create({
	col: { gap: SPACING.md, padding: SPACING.md },
	headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
	title: { ...TYPOGRAPHY.h2, fontSize: 16 },
	subtitle: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, fontStyle: 'italic' },
	closeBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
	closeBtnText: { fontSize: 14, color: COLORS.text.secondary, fontWeight: '700' },

	input: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 6,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		fontSize: 13, color: COLORS.text.primary, backgroundColor: COLORS.background.card,
	},

	loadingRow: { alignItems: 'center', paddingVertical: SPACING.sm },
	errorText: { fontSize: 11, color: COLORS.danger, fontStyle: 'italic' },
	emptyText: { fontSize: 12, color: COLORS.text.placeholder, fontStyle: 'italic', textAlign: 'center', padding: SPACING.sm },

	resultList: { gap: 6, maxHeight: 360 },
	resultRow: {
		flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
		paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
		borderRadius: 6, borderWidth: 1, borderColor: COLORS.border,
		backgroundColor: COLORS.background.card,
	},
	resultRowHover: { borderColor: COLORS.primary, backgroundColor: `${COLORS.primary}11` },
	resultBody: { flex: 1, gap: 2 },
	resultMain: { fontSize: 13, color: COLORS.text.primary, fontWeight: '600' },
	resultSub:  { fontSize: 11, color: COLORS.text.secondary, fontStyle: 'italic' },
	resultTags: { fontSize: 10, color: COLORS.text.placeholder, marginTop: 2 },

	badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
	badgeCertified: { backgroundColor: COLORS.status.validated },
	badgePending:   { backgroundColor: COLORS.warning },
	badgeText: { color: COLORS.text.inverse, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },

	footer: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
	btnNeutral: {
		paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
		borderRadius: 6, backgroundColor: COLORS.text.secondary,
		alignItems: 'center', justifyContent: 'center',
	},
	btnNeutralText: { color: COLORS.text.inverse, fontWeight: '700', fontSize: 13, textAlign: 'center' },
});
