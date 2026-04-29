import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const getLocalToken = async (): Promise<string | null> => {
	if (Platform.OS === 'web') {
		return typeof window !== 'undefined' ? localStorage.getItem('cvat_token') : null;
	}
	return await SecureStore.getItemAsync('cvat_token');
};

export const apiClient = axios.create({
	baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000/api',
	withCredentials: true,
	headers: {
		'Accept': 'application/vnd.cvat+json, application/json, text/plain, */*',
	},
});

apiClient.interceptors.request.use(
	async (config) => {
		const token = await getLocalToken();

		if (config.headers && token) {
			config.headers.Authorization = `Token ${token}`;
		}

		return config;
	},
	(error) => {
		return Promise.reject(error);
	}
);