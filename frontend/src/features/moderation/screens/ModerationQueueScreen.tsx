import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { ModerationService, ModerationQueueEntry } from '@/services/api/ModerationService';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

export const ModerationQueueScreen: React.FC = () => {
	const [entries, setEntries] = useState<ModerationQueueEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const router = useRouter();
	const service = new ModerationService();

	const load = async () => {
		setLoading(true);
		try {
			const data = await service.getQueue();
			setEntries(data);
		} catch (err: any) {
			Alert.alert('Erreur', err?.message || 'Impossible de charger la file de modération.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); }, []);

	const formatRelativeDate = (iso: string) => {
		const d = new Date(iso);
		const now = Date.now();
		const diffMs = now - d.getTime();
		const diffMin = Math.floor(diffMs / 60000);
		if (diffMin < 60) return `il y a ${diffMin} min`;
		const diffH = Math.floor(diffMin / 60);
		if (diffH < 24) return `il y a ${diffH} h`;
		const diffD = Math.floor(diffH / 24);
		return `il y a ${diffD} j`;
	};

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>File de modération</Text>
				<Text style={styles.subtitle}>
					{entries.length === 0
						? 'Aucun utilisateur avec des médias à valider.'
						: `${entries.length} utilisateur(s) en attente`}
				</Text>
			</View>

			{loading ? (
				<ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
			) : (
				<FlatList
					data={entries}
					keyExtractor={(item) => String(item.uploader_id)}
					ListEmptyComponent={
						<View style={styles.emptyState}>
							<Text style={styles.emptyText}>Aucun média en attente.</Text>
						</View>
					}
					renderItem={({ item }) => (
						<View style={styles.row}>
							<View style={styles.rowMain}>
								<Text style={styles.username}>
									{item.username ? `${item.username}#${item.uploader_id}` : `#${item.uploader_id}`}
								</Text>
								<Text style={styles.meta}>
									{item.pending_count} média(s) · plus ancien {formatRelativeDate(item.oldest)}
								</Text>
							</View>
							<Pressable
								style={styles.detailsBtn}
								onPress={() => router.push(`/(main)/moderation/${item.uploader_id}` as Href)}
							>
								<Text style={styles.detailsText}>Détails ›</Text>
							</Pressable>
						</View>
					)}
				/>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg },
	header: { marginBottom: SPACING.lg },
	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, marginTop: SPACING.xs },
	emptyState: {
		padding: SPACING.xl,
		alignItems: 'center',
		borderWidth: 1,
		borderColor: COLORS.border,
		borderStyle: 'dashed',
		borderRadius: 8,
	},
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: COLORS.background.card,
		padding: SPACING.md,
		borderRadius: 8,
		marginBottom: SPACING.md,
		borderWidth: 1,
		borderColor: COLORS.border,
	},
	rowMain: { flex: 1 },
	username: { ...TYPOGRAPHY.body, fontWeight: '600' },
	meta: { fontSize: 13, color: COLORS.text.secondary, marginTop: 2 },
	detailsBtn: {
		paddingHorizontal: SPACING.md,
		paddingVertical: SPACING.sm,
		borderRadius: 6,
		backgroundColor: COLORS.primary,
	},
	detailsText: { color: COLORS.text.inverse, fontWeight: '600' },
});
