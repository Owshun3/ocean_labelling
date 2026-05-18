import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { MediaEntity } from '@/core/types/media';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

export interface MediaCardProps {
    readonly media: MediaEntity;
}

export const MediaCard: React.FC<MediaCardProps> = ({ media }) => {
    const getStatusColor = () => {
        switch (media.status) {
        case 'CERTIFIED': return COLORS.success;
        case 'MODERATED': return COLORS.primary;
        case 'REJECTED': return COLORS.danger;
        default: return COLORS.warning;
        }
    };

  return (
    <View style={styles.container}>
        <Image 
            source={{ uri: media.uri }} 
            style={styles.image} 
            resizeMode="cover"
        />
        <View style={styles.infoContainer}>
            <Text style={styles.idText}>ID: {media.id}</Text>
            <Text style={[styles.statusText, { color: getStatusColor() }]}>
            {media.status}
            </Text>
        </View>
    </View>
  );
};

const styles = StyleSheet.create({
    container: {
        padding: SPACING.md,
        marginVertical: SPACING.sm,
        backgroundColor: COLORS.background.card,
        borderRadius: 8,
        boxShadow: '0 0 4px rgba(0, 0, 0, 0.1)',
        elevation: 2,
    },
    image: {
        width: '100%',
        height: 200,
        borderRadius: 4,
        backgroundColor: COLORS.background.imagePlaceholder,
    },
    infoContainer: {
        marginTop: SPACING.sm,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    idText: {
        ...TYPOGRAPHY.caption,
        color: COLORS.text.secondary,
    },
    statusText: {
        ...TYPOGRAPHY.h2,
        textTransform: 'uppercase',
    }
});