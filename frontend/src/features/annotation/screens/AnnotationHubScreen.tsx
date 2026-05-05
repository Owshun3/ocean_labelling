import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, Button, Alert } from 'react-native';
import { CvatMediaService } from '@/services/api/CvatMediaService';
import { AuthenticatedImage } from '@/shared/components/images/AuthenticatedImage';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';
import { TYPOGRAPHY } from '@/shared/theme/typography';

export const AnnotationHubScreen: React.FC = () => {
    const [images, setImages] = useState<any[]>([]);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const mediaService = new CvatMediaService();

    useEffect(() => {
        const fetchImages = async () => {
            const data = await mediaService.getTasks();
            setImages(data);
        };
        fetchImages();
    }, []);

    const handleAnnotate = async () => {
        if (!selectedId) return;
        setIsProcessing(true);
        try {
            const [jobId, self] = await Promise.all([
                mediaService.getFirstJobId(selectedId),
                mediaService.getSelf(),
            ]);

            await mediaService.ensureJobEditable(jobId);
            await mediaService.assignJob(jobId, self.id);

            const cvatUiUrl = process.env.EXPO_PUBLIC_CVAT_UI_URL || 'http://localhost:8080';
            const returnUrl = encodeURIComponent(window.location.href);
            window.open(`${cvatUiUrl}/tasks/${selectedId}/jobs/${jobId}?appReturn=${returnUrl}`, '_blank');
        } catch (error) {
            Alert.alert('Erreur', "Impossible de charger le studio d'annotation.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Mes Images à Annoter</Text>
            <FlatList
                data={images}
                numColumns={3}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                    <Pressable
                        style={[styles.card, selectedId === item.id && styles.selectedCard]}
                        onPress={() => setSelectedId(item.id)}
                    >
                        <AuthenticatedImage
                            url={`/tasks/${item.id}/preview`}
                            style={styles.thumbnail}
                        />
                        <Text numberOfLines={1} style={styles.imageName}>{item.name}</Text>
                    </Pressable>
                )}
            />
            {selectedId && (
                <View style={styles.footer}>
                    <Button
                        title={isProcessing ? 'Chargement...' : "Lancer l'Annotation"}
                        onPress={handleAnnotate}
                        disabled={isProcessing}
                    />
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, padding: SPACING.md },
    title: { ...TYPOGRAPHY.h1, marginBottom: SPACING.lg },
    card: { flex: 1/10, margin: SPACING.xs, padding: SPACING.sm, backgroundColor: COLORS.background.card, borderRadius: 8, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
    selectedCard: { borderColor: COLORS.primary },
    thumbnail: { width: '100%', aspectRatio: 1, borderRadius: 4 },
    imageName: { ...TYPOGRAPHY.caption, marginTop: SPACING.xs },
    footer: { padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.border },
});
