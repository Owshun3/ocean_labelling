import React, { useState } from 'react';
import { View, Platform, StyleSheet, StyleProp, ViewStyle, ImageStyle } from 'react-native';
import type { AxiosInstance } from 'axios';
import { AuthenticatedImage } from './AuthenticatedImage';
import { BboxOverlay } from './BboxOverlay';

interface ImageWithBboxProps {
	url: string;
	client?: AxiosInstance;
	bboxPoints: number[] | null;
	/** Dimensions de l'image (pour scaler la bbox). Si null, lit via onNaturalSize. */
	initialWidth?: number | null;
	initialHeight?: number | null;
	/** Style du conteneur (taille notamment). Le composant fixe lui-même `position`. */
	containerStyle?: StyleProp<ViewStyle>;
	imageStyle?: StyleProp<ImageStyle>;
	/** Sur web, déclencheur de double-clic (zoom-in cursor + handler). */
	onDoubleClickWeb?: () => void;
}

/**
 * Image authentifiée affichée en `contain`, avec un rectangle bbox superposé.
 * Récupère les dimensions naturelles via `onNaturalSize` si elles ne sont pas fournies.
 * Gère le double-clic sur web pour ouvrir un viewer haute résolution.
 */
export function ImageWithBbox({
	url, client, bboxPoints,
	initialWidth, initialHeight,
	containerStyle, imageStyle,
	onDoubleClickWeb,
}: ImageWithBboxProps) {
	const [natural, setNatural] = useState<{ width: number; height: number } | null>(
		initialWidth && initialHeight ? { width: initialWidth, height: initialHeight } : null,
	);

	const overlay = bboxPoints && natural ? (
		<BboxOverlay points={bboxPoints} imageWidth={natural.width} imageHeight={natural.height} />
	) : null;

	const image = (
		<AuthenticatedImage
			url={url}
			client={client}
			style={[styles.image, imageStyle]}
			resizeMode="contain"
			onNaturalSize={natural ? undefined : (w, h) => setNatural({ width: w, height: h })}
		/>
	);

	if (onDoubleClickWeb && Platform.OS === 'web') {
		return (
			// @ts-ignore — onDoubleClick est un handler DOM natif sur RN Web
			<div
				onDoubleClick={(e: any) => { e.stopPropagation(); onDoubleClickWeb(); }}
				style={webDoubleClickStyle}
			>
				{image}
				{overlay}
			</div>
		);
	}

	return (
		<View style={[styles.container, containerStyle]}>
			{image}
			{overlay}
		</View>
	);
}

const webDoubleClickStyle = {
	width: '100%', height: '100%',
	position: 'relative', cursor: 'zoom-in',
} as any;

const styles = StyleSheet.create({
	container: { width: '100%', height: '100%', position: 'relative' },
	image: { width: '100%', height: '100%' },
});
