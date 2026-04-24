import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Button } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { CvatMediaService } from '@/services/api/CvatMediaService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

export const MediaListScreen: React.FC = () => {
	const [tasks, setTasks] = useState<any[]>([]);
	const router = useRouter();

	useEffect(() => {
		const fetch = async () => {
			const service = new CvatMediaService();
			const data = await service.getTasks();
			setTasks(data);
		};
		fetch();
	}, []);

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
					const thumbnailUrl = `/tasks/${item.id}/data/0/preview`;

					return (
						<View style={styles.taskCard}>
							<AuthenticatedImage 
								url={thumbnailUrl} 
								style={styles.thumbnail} 
							/>
							<View style={styles.info}>
								<Text style={TYPOGRAPHY.body}>{item.name}</Text>
								<View style={[styles.badge, { backgroundColor: COLORS.status.pending }]}>
									<Text style={styles.badgeText}>NON VALIDÉ</Text>
								</View>
							</View>
						</View>
					);
				}}
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
	taskCard: { flexDirection: 'row', backgroundColor: COLORS.background.card, padding: SPACING.md, borderRadius: 8, marginBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
	thumbnail: { width: 60, height: 60, borderRadius: 4 },
	info: { marginLeft: SPACING.md, justifyContent: 'center' },
	badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start', marginTop: 4 },
	badgeText: { ...TYPOGRAPHY.badge, color: COLORS.text.inverse }
});