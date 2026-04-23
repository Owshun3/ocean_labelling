import axios from 'axios';
import { Platform } from 'react-native';
import { CvatAuthService } from './CvatAuthService';

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
		const authService = new CvatAuthService();
		const token = await authService.getToken();

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