import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMediaQueue } from '@/hooks/useMediaQueue';
import { MediaCard } from '@/shared/components/ui/MediaCard';
import { COLORS } from '@/shared/theme/colors';
import { TYPOGRAPHY } from '@/shared/theme/typography';
import { SPACING } from '@/shared/theme/spacing';
import { MediaEntity } from '@/core/types/media';

export const UserDashboardScreen: React.FC = () => {
    const { state, refreshMedia } = useMediaQueue();

    if (state.isLoading) {
        return (
            <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    if (state.error) {
        return (
            <View style={styles.centerContainer}>
                <Text style={[TYPOGRAPHY.h2, { color: COLORS.danger }]}>{state.error}</Text>
            </View>
        );
    }

    return (
		<SafeAreaView style={styles.container}>
			<Text style={styles.headerTitle}>Mes Médias</Text>
			<FlatList 
				data={state.data || []}
				keyExtractor={(item) => item.id}
				renderItem={({ item }) => <MediaCard media={item} />}
			/>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background.main,
        paddingHorizontal: SPACING.md,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: COLORS.background.main,
    },
        headerTitle: {
        ...TYPOGRAPHY.h1,
        color: COLORS.text.primary,
        marginVertical: SPACING.lg,
    }
});