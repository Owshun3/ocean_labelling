import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { toast } from '@/shared/toast/Toast';
import { SpeciesService, Species } from '@/services/api/SpeciesService';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

const DEBOUNCE_MS = 250;
const CATALOG_LIMIT = 100;

export const CuratorSpeciesCatalogScreen: React.FC = () => {
	const router = useRouter();
	const service = useMemo(() => new SpeciesService(), []);
	const [query, setQuery]     = useState('');
	const [results, setResults] = useState<Species[]>([]);
	const [loading, setLoading] = useState(true);
	const debRef = useRef<any>(null);

	const fetchList = useCallback(async (q: string) => {
		setLoading(true);
		try {
			setResults(await service.search(q.trim(), CATALOG_LIMIT));
		} catch (err: any) {
			toast.error(err?.response?.data?.error || err?.message || 'Recherche impossible.');
			setResults([]);
		} finally {
			setLoading(false);
		}
	}, [service]);

	// Chargement initial : tout (jusqu'à 100 fiches alphabétiquement)
	useEffect(() => { fetchList(''); }, [fetchList]);

	// Recherche live : debounce 250 ms
	useEffect(() => {
		if (debRef.current) clearTimeout(debRef.current);
		debRef.current = setTimeout(() => fetchList(query), DEBOUNCE_MS);
		return () => { if (debRef.current) clearTimeout(debRef.current); };
	}, [query, fetchList]);

	const total = results.length;
	const reachedCap = total >= CATALOG_LIMIT;

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Pressable onPress={() => router.replace('/(main)/curator' as Href)} style={styles.backBtn}>
					<Text style={styles.backBtnText}>← Curation</Text>
				</Pressable>
				<View style={{ flex: 1 }}>
					<Text style={styles.title}>Catalogue des espèces</Text>
					<Text style={styles.subtitle}>
						Toutes les fiches d'espèces. Édition directe sur la fiche détaillée — toute modification est tracée et l'admin peut annuler.
					</Text>
				</View>
			</View>

			<View style={styles.searchBox}>
				<TextInput
					value={query}
					onChangeText={setQuery}
					placeholder="Rechercher par nom scientifique, usage, polynésien ou étiquette…"
					placeholderTextColor={COLORS.text.placeholder}
					style={styles.searchInput}
					autoCapitalize="none"
					autoCorrect={false}
				/>
				{loading ? <ActivityIndicator color={COLORS.primary} style={styles.searchSpinner} /> : null}
			</View>

			<View style={styles.statsRow}>
				<Text style={styles.statsText}>
					{total} fiche{total > 1 ? 's' : ''} {query.trim() ? 'correspondante(s)' : 'au total'}
					{reachedCap ? ` (limité aux ${CATALOG_LIMIT} premiers — affine la recherche)` : ''}
				</Text>
			</View>

			{!loading && total === 0 ? (
				<View style={styles.empty}>
					<Text style={styles.emptyTitle}>Aucune fiche trouvée</Text>
					<Text style={styles.emptyText}>
						{query.trim() ? 'Essaie une autre orthographe ou un nom partiel.' : 'Aucune espèce n\'a encore été enregistrée dans le catalogue.'}
					</Text>
				</View>
			) : (
				<ScrollView contentContainerStyle={styles.grid}>
					{results.map((s) => (
						<Pressable
							key={s.id}
							onPress={() => router.push(`/(main)/species/${s.id}` as Href)}
							style={({ hovered }: any) => [styles.card, hovered && styles.cardHover]}
						>
							<View style={styles.cardHeader}>
								<Text style={styles.cardScientific} numberOfLines={2}>
									{s.scientific_name || s.usage_name || s.name}
								</Text>
								{s.status === 'pending' ? (
									<View style={styles.pendingBadge}>
										<Text style={styles.pendingBadgeText}>En attente</Text>
									</View>
								) : null}
							</View>
							<View style={styles.cardSubRow}>
								{s.usage_name && s.usage_name !== s.scientific_name ? (
									<Text style={styles.cardSubName}>{s.usage_name}</Text>
								) : null}
								{s.polynesian_name ? (
									<Text style={styles.cardPolyName}>{s.polynesian_name}</Text>
								) : null}
							</View>
							{s.tags && s.tags.length > 0 ? (
								<View style={styles.tagsRow}>
									{s.tags.slice(0, 4).map((t) => (
										<View key={t} style={styles.tagChip}>
											<Text style={styles.tagChipText}>{t}</Text>
										</View>
									))}
									{s.tags.length > 4 ? (
										<Text style={styles.tagsOverflow}>+{s.tags.length - 4}</Text>
									) : null}
								</View>
							) : null}
							{s.description ? (
								<Text style={styles.cardDescription} numberOfLines={2}>{s.description}</Text>
							) : null}
						</Pressable>
					))}
				</ScrollView>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg, gap: SPACING.md },

	header: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
	backBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs, borderRadius: 6, backgroundColor: COLORS.background.card, borderWidth: 1, borderColor: COLORS.border },
	backBtnText: { ...TYPOGRAPHY.caption, color: COLORS.text.primary, fontWeight: '600' },
	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, marginTop: 2 },

	searchBox: { position: 'relative' },
	searchInput: {
		borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
		paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
		fontSize: 14, color: COLORS.text.primary, backgroundColor: COLORS.background.card,
	},
	searchSpinner: { position: 'absolute', right: SPACING.md, top: '50%', marginTop: -10 },

	statsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
	statsText: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },

	empty: { padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm, backgroundColor: COLORS.background.card, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' as any },
	emptyTitle: { ...TYPOGRAPHY.h2 },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, textAlign: 'center' },

	grid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, paddingBottom: SPACING.xl },
	card: {
		width: 280, padding: SPACING.md, gap: 6,
		backgroundColor: COLORS.background.card, borderRadius: 8,
		borderWidth: 1, borderColor: COLORS.border,
	},
	cardHover: { borderColor: COLORS.primary, backgroundColor: COLORS.background.main },
	cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs },
	cardScientific: { ...TYPOGRAPHY.h2, fontSize: 15, flex: 1, fontStyle: 'italic' },
	pendingBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: COLORS.warning },
	pendingBadgeText: { fontSize: 10, color: COLORS.text.inverse, fontWeight: '700', textTransform: 'uppercase' },

	cardSubRow: { flexDirection: 'row', alignItems: 'baseline', gap: SPACING.xs, flexWrap: 'wrap' },
	cardSubName: { ...TYPOGRAPHY.body, fontSize: 13, color: COLORS.text.primary, fontWeight: '600' },
	cardPolyName: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary },

	tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, alignItems: 'center' },
	tagChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: COLORS.background.main, borderWidth: 1, borderColor: COLORS.border },
	tagChipText: { fontSize: 10, color: COLORS.text.primary, fontWeight: '600' },
	tagsOverflow: { fontSize: 10, color: COLORS.text.secondary, fontStyle: 'italic' },

	cardDescription: { ...TYPOGRAPHY.caption, color: COLORS.text.secondary, marginTop: 4, lineHeight: 17 },
});
