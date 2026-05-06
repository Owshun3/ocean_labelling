import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Button, Pressable, Alert, Platform } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { CvatMediaService } from '@/services/api/CvatMediaService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { ImageLightbox } from '@/shared/components/images/ImageLightbox';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

export const MediaListScreen: React.FC = () => {
	const [tasks, setTasks] = useState<any[]>([]);
	const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
	const router = useRouter();
	const service = new CvatMediaService();

	const loadTasks = async () => {
		const data = await service.getTasks({ ownedByMe: true });
		setTasks(data);
	};

	useEffect(() => {
		loadTasks();
	}, []);

	const handleDelete = (taskId: number, taskName: string) => {
		const doDelete = async () => {
			try {
				await service.deleteTask(taskId);
				setTasks((prev) => prev.filter((t) => t.id !== taskId));
			} catch {
				Alert.alert('Erreur', 'Impossible de supprimer ce média.');
			}
		};

		if (Platform.OS === 'web') {
			if (window.confirm(`Supprimer "${taskName}" ? Cette action est irréversible.`)) {
				doDelete();
			}
		} else {
			Alert.alert(
				'Supprimer le média',
				`Supprimer "${taskName}" ? Cette action est irréversible.`,
				[
					{ text: 'Annuler', style: 'cancel' },
					{ text: 'Supprimer', style: 'destructive', onPress: doDelete },
				]
			);
		}
	};

	return (
		<View style={styles.container}>
			<View style={styles.header}>
				<Text style={styles.title}>Mes Médias</Text>
				<Button
					title="+ Nouveau Dépôt"
					onPress={() => router.push('/(main)/upload' as Href)}
					color={COLORS.primary}
				/>
			</View>

			<FlatList
				data={tasks}
				keyExtractor={(item) => item.id.toString()}
				ListEmptyComponent={
					<View style={styles.emptyState}>
						<Text style={styles.emptyText}>Aucun média trouvé.</Text>
					</View>
				}
				renderItem={({ item }) => {
					const previewUrl = `/tasks/${item.id}/preview`;
					return (
						<View style={styles.taskCard}>
							<Pressable onPress={() => setLightboxUrl(previewUrl)}>
								<AuthenticatedImage url={previewUrl} style={styles.thumbnail} />
							</Pressable>
							<View style={styles.info}>
								<Text style={TYPOGRAPHY.body}>{item.name}</Text>
								<View style={[styles.badge, { backgroundColor: COLORS.status.pending }]}>
									<Text style={styles.badgeText}>NON VALIDÉ</Text>
								</View>
							</View>
							<Pressable
								style={styles.deleteButton}
								onPress={() => handleDelete(item.id, item.name)}
							>
								<Text style={styles.deleteText}>✕</Text>
							</Pressable>
						</View>
					);
				}}
			/>

			<ImageLightbox
				isVisible={lightboxUrl !== null}
				imageUrl={lightboxUrl}
				onClose={() => setLightboxUrl(null)}
			/>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.lg },
	header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xl },
	title: { ...TYPOGRAPHY.h1 },
	emptyState: { padding: SPACING.xl, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed', borderRadius: 8 },
	emptyText: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
	taskCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background.card, padding: SPACING.md, borderRadius: 8, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
	thumbnail: { width: 60, height: 60, borderRadius: 4 },
	info: { flex: 1, marginLeft: SPACING.md, justifyContent: 'center' },
	badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4 },
	badgeText: { ...TYPOGRAPHY.badge, color: COLORS.text.inverse },
	deleteButton: { padding: SPACING.sm, marginLeft: SPACING.sm },
	deleteText: { color: COLORS.status.error, fontSize: 16, fontWeight: 'bold' },
});
