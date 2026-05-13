import axios from 'axios';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

export const apiClient = axios.create({
	baseURL: `${APP_API_BASE}/cvat`,
	withCredentials: true,
	headers: {
		'Accept': 'application/vnd.cvat+json, application/json, text/plain, */*',
	},
});

import { attachBanInterceptor } from './banInterceptor';
attachBanInterceptor(apiClient);
