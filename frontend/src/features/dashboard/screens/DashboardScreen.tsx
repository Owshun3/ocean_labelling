import React, { useState } from 'react';
import { View, Text, StyleSheet, Button } from 'react-native';
import { useRouter, Href } from 'expo-router';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';

export const DashboardScreen: React.FC = () => {
	const router = useRouter();
	
	const [userRole] = useState<'user' | 'curator' | 'admin'>('user');

	return (
		<View style={styles.container}>
			<Text style={styles.title}>Tableau de bord</Text>
			<Text style={styles.subtitle}>Que souhaitez-vous accomplir aujourd'hui ?</Text>
			
			<View style={styles.actionGrid}>
				<View style={styles.actionCard}>
					<Text style={styles.cardTitle}>Dépôt</Text>
					<Text style={styles.cardText}>Importez de nouvelles données à annoter.</Text>
					<Button title="Aller vers Mes Médias" onPress={() => router.push('/(main)/media' as Href)} color={COLORS.primary} />
				</View>
				
				<View style={styles.actionCard}>
					<Text style={styles.cardTitle}>Travail</Text>
					<Text style={styles.cardText}>Rejoignez le studio d'annotation.</Text>
					<Button title="Commencer à Annoter" onPress={() => router.push('/(main)/annotate' as Href)} color={COLORS.primary} />
				</View>

				{(userRole === 'admin' || userRole === 'curator') && (
					<View style={[styles.actionCard, styles.privilegedCard]}>
						<Text style={styles.cardTitle}>Validation</Text>
						<Text style={styles.cardText}>Révisez les annotations soumises par les pairs.</Text>
						<Button title="Mode Curateur" onPress={() => console.log('Ouvrir Review')} color="#f59e0b" />
					</View>
				)}


				{userRole === 'admin' && (
					<View style={[styles.actionCard, styles.privilegedCard]}>
						<Text style={styles.cardTitle}>Administration</Text>
						<Text style={styles.cardText}>Gérez les utilisateurs et l'instance CVAT.</Text>
						<Button title="Panneau Admin" onPress={() => console.log('Ouvrir Admin')} color="#ef4444" />
					</View>
				)}
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, padding: SPACING.xl, alignItems: 'center', justifyContent: 'center' },
	title: { ...TYPOGRAPHY.h1, marginBottom: SPACING.sm },
	subtitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary, marginBottom: SPACING.xl },
	actionGrid: { flexDirection: 'row', gap: SPACING.lg, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 1000 },
	actionCard: { backgroundColor: COLORS.background.card, padding: SPACING.lg, borderRadius: 8, width: 300, borderWidth: 1, borderColor: COLORS.border },
	privilegedCard: { borderColor: COLORS.primary, borderStyle: 'dashed' },
	cardTitle: { ...TYPOGRAPHY.h2, marginBottom: SPACING.sm },
	cardText: { ...TYPOGRAPHY.body, marginBottom: SPACING.md, color: COLORS.text.secondary },
});