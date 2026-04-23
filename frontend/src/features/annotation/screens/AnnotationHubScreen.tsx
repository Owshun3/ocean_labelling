import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';

export const AnnotationHubScreen: React.FC = () => {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>Studio d'Annotation</Text>
			<Text style={styles.subtitle}>Sélectionnez une tâche pour lancer l'interface native CVAT.</Text>
		</View>
	);
};

const styles = StyleSheet.create({
	container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
	title: { ...TYPOGRAPHY.h1 },
	subtitle: { ...TYPOGRAPHY.body, color: COLORS.text.secondary },
});