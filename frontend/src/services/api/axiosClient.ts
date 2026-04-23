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
	baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080/api',
	withCredentials: true,
	xsrfCookieName: 'csrftoken',
	xsrfHeaderName: 'X-CSRFToken',
	headers: {
		'Accept': 'application/vnd.cvat+json, application/json, text/plain, */*',
		'Content-Type': 'application/json',
	},
});

apiClient.interceptors.request.use(
	async (config) => {
		const token = await getLocalToken();

		if (config.headers) {
			if (token) {
				config.headers.Authorization = `Token ${token}`;
			}

			if (Platform.OS === 'web' && typeof document !== 'undefined') {
				const match = document.cookie.match(new RegExp('(^|;\\s*)(csrftoken)=([^;]*)'));
				const csrfToken = match ? decodeURIComponent(match[3]) : null;
				
				if (csrfToken) {
					config.headers['X-CSRFToken'] = csrfToken;
				}
			}
		}

		return config;
	},
	(error) => {
		return Promise.reject(error);
	}
);