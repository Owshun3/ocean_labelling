import React, { useEffect, useState } from 'react';
import { Image, ActivityIndicator, View, StyleSheet, ImageStyle, StyleProp, Platform } from 'react-native';
import { AxiosInstance } from 'axios';
import { apiClient } from '@/services/api/axiosClient';
import { COLORS } from '@/shared/theme/colors';

interface AuthenticatedImageProps {
	url: string | null;
	style?: StyleProp<ImageStyle>;
	resizeMode?: 'contain' | 'cover' | 'stretch' | 'center' | 'repeat';
	client?: AxiosInstance;
	onNaturalSize?: (width: number, height: number) => void;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
	const bytes = new Uint8Array(buf);
	let binary = '';
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const slice = bytes.subarray(i, i + chunkSize);
		binary += String.fromCharCode.apply(null, Array.from(slice) as unknown as number[]);
	}
	return globalThis.btoa(binary);
}

export const AuthenticatedImage: React.FC<AuthenticatedImageProps> = ({ url, style, resizeMode = 'cover', client, onNaturalSize }) => {
	const fetcher = client ?? apiClient;
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState(false);
	const [imageDataUri, setImageDataUri] = useState<string | null>(null);

	useEffect(() => {
		if (!url) {
			setError(true);
			setIsLoading(false);
			return;
		}

		let isMounted = true;
		setIsLoading(true);
		setError(false);

		const fetchImage = async () => {
			try {
				const response = await fetcher.get(url, { responseType: 'arraybuffer' });
				if (!isMounted) return;
				const mime = (response.headers?.['content-type'] as string | undefined) || 'image/jpeg';
				const dataUri = `data:${mime};base64,${arrayBufferToBase64(response.data as ArrayBuffer)}`;
				setImageDataUri(dataUri);
				setIsLoading(false);
				if (onNaturalSize) {
					// Image.getSize sur RN Web peut être capricieux avec les data-URIs.
					// Sur web on passe par un HTMLImageElement natif (toujours fiable).
					if (Platform.OS === 'web' && typeof window !== 'undefined') {
						const probe = new window.Image();
						probe.onload = () => {
							if (isMounted && probe.naturalWidth > 0 && probe.naturalHeight > 0) {
								onNaturalSize(probe.naturalWidth, probe.naturalHeight);
							}
						};
						probe.src = dataUri;
					} else {
						Image.getSize(
							dataUri,
							(w, h) => { if (isMounted && w > 0 && h > 0) onNaturalSize(w, h); },
							() => {},
						);
					}
				}
			} catch (err) {
				if (isMounted) {
					console.error("Failed to load authenticated image", err);
					setError(true);
					setIsLoading(false);
				}
			}
		};

		fetchImage();

		return () => {
			isMounted = false;
		};
	}, [url]);

	if (isLoading) {
		return (
			<View style={[styles.fallback, style]}>
				<ActivityIndicator size="small" color={COLORS.primary} />
			</View>
		);
	}

	if (error || !imageDataUri) {
		return (
			<View style={[styles.fallback, style]}>
			</View>
		);
	}

	return <Image source={{ uri: imageDataUri }} style={style} resizeMode={resizeMode} />;
};

const styles = StyleSheet.create({
	fallback: {
		backgroundColor: COLORS.text.secondary,
		justifyContent: 'center',
		alignItems: 'center',
		borderRadius: 4,
	},
});
