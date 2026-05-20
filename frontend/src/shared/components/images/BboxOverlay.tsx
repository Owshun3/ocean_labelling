import React from 'react';
import { Platform } from 'react-native';

interface BboxOverlayProps {
	/** Coordonnées bbox dans le référentiel pixel image : [x1, y1, x2, y2]. */
	points: number[];
	/** Dimensions naturelles de l'image (pour mapper le viewBox SVG). */
	imageWidth: number;
	imageHeight: number;
	/** Couleur de bordure (défaut rouge danger). */
	color?: string;
	/** Couleur de remplissage translucide (défaut rouge translucide). */
	fillColor?: string;
}

/**
 * Rectangle SVG superposé à une image, scalé automatiquement via `viewBox` +
 * `preserveAspectRatio="xMidYMid meet"`. À utiliser sur une image affichée en
 * `resizeMode: 'contain'` pour que la géométrie corresponde.
 *
 * Le SVG est positionné `position: absolute` ; le parent doit être positioned.
 *
 * Web only (utilise les éléments SVG natifs du DOM). Sur native, retourne null
 * — à remplacer par react-native-svg si besoin mobile plus tard.
 */
export function BboxOverlay({
	points, imageWidth, imageHeight,
	color = '#dc2626',
	fillColor = 'rgba(220, 38, 38, 0.15)',
}: BboxOverlayProps) {
	if (!points || points.length < 4) return null;
	if (imageWidth <= 0 || imageHeight <= 0) return null;
	if (Platform.OS !== 'web') return null;

	const [x1, y1, x2, y2] = points;
	const rectX = Math.min(x1, x2);
	const rectY = Math.min(y1, y2);
	const rectWidth = Math.abs(x2 - x1);
	const rectHeight = Math.abs(y2 - y1);
	const strokeWidth = Math.max(imageWidth, imageHeight) * 0.004;

	return (
		// @ts-ignore — éléments SVG natifs sur web
		<svg
			viewBox={`0 0 ${imageWidth} ${imageHeight}`}
			preserveAspectRatio="xMidYMid meet"
			style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
		>
			{/* @ts-ignore */}
			<rect
				x={rectX} y={rectY}
				width={rectWidth} height={rectHeight}
				fill={fillColor}
				stroke={color}
				strokeWidth={strokeWidth}
			/>
		</svg>
	);
}
