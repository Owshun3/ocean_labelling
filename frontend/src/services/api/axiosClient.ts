import axios from 'axios';

import { APP_API_BASE } from './runtimeUrls';

export const apiClient = axios.create({
	baseURL: `${APP_API_BASE}/cvat`,
	withCredentials: true,
	headers: {
		'Accept': 'application/vnd.cvat+json, application/json, text/plain, */*',
	},
});

import { attachBanInterceptor } from './banInterceptor';
attachBanInterceptor(apiClient);
