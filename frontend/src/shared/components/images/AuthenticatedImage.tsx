import React, { useEffect, useState } from 'react';
import { Image, ActivityIndicator, View, StyleSheet, ImageStyle, StyleProp } from 'react-native';
import { AxiosInstance } from 'axios';
import { apiClient } from '@/services/api/axiosClient';
import { COLORS } from '@/shared/theme/colors';

interface AuthenticatedImageProps {
	url: string | null;
	style?: StyleProp<ImageStyle>;
	resizeMode?: 'contain' | 'cover' | 'stretch' | 'center' | 'repeat';
	client?: AxiosInstance;
}

export const AuthenticatedImage: React.FC<AuthenticatedImageProps> = ({ url, style, resizeMode = 'cover', client }) => {
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
				const response = await fetcher.get(url, { responseType: 'blob' });
				
				const reader = new FileReader();
				reader.onloadend = () => {
					if (isMounted) {
						setImageDataUri(reader.result as string);
						setIsLoading(false);
					}
				};
				reader.readAsDataURL(response.data);
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