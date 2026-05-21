import React from 'react';
import { Modal, View, StyleSheet, Pressable, Text } from 'react-native';
import { AuthenticatedImage } from './AuthenticatedImage';
import { COLORS } from '@/shared/theme/colors';
import { SPACING } from '@/shared/theme/spacing';

interface ImageLightboxProps {
    isVisible: boolean;
    imageUrl: string | null;
    onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({ isVisible, imageUrl, onClose }) => {
    return (
        <Modal visible={isVisible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.overlay} onPress={onClose}>
                <View style={styles.container}>
                    {imageUrl && (
                        <AuthenticatedImage
                            url={imageUrl}
                            style={styles.fullImage}
                            resizeMode="contain"
                        />
                    )}
                    <Pressable style={styles.closeButton} onPress={onClose}>
                        <Text style={styles.closeText}>Fermer</Text>
                    </Pressable>
                </View>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: COLORS.overlay, justifyContent: 'center', alignItems: 'center' },
    container: { width: '90%', height: '80%', justifyContent: 'center' },
    fullImage: { width: '100%', height: '100%', resizeMode: 'contain' },
    closeButton: { position: 'absolute', top: SPACING.md, right: SPACING.md, backgroundColor: COLORS.background.card, padding: SPACING.sm, borderRadius: 4 },
    closeText: { fontWeight: 'bold' }
});