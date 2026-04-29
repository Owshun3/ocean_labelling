import axios from 'axios';
import { Platform } from 'react-native';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

const appApiClient = axios.create({ baseURL: APP_API_BASE });

appApiClient.interceptors.request.use((config) => {
	const token = Platform.OS === 'web'
		? (typeof window !== 'undefined' ? localStorage.getItem('cvat_token') : null)
		: null;
	if (token) config.headers.Authorization = `Token ${token}`;
	return config;
});

export type AppRole = 'admin' | 'curator' | 'moderator' | 'annotator' | 'guest';

export interface UserWithRole {
	id: number;
	username: string;
	email: string;
	first_name: string;
	last_name: string;
	is_superuser: boolean;
	is_active: boolean;
	date_joined: string | null;
	role: AppRole;
}

export class AppApiService {
	async getMyRole(): Promise<{ id: number; role: AppRole }> {
		const resp = await appApiClient.get<{ id: number; role: AppRole }>('/users/me');
		return resp.data;
	}

	async listUsers(): Promise<UserWithRole[]> {
		const resp = await appApiClient.get<{ results: UserWithRole[] }>('/users');
		return resp.data.results;
	}

	async setUserRole(userId: number, role: AppRole): Promise<void> {
		await appApiClient.patch(`/users/${userId}/role`, { role });
	}

	async recordUpload(cvat_task_id: number, batch_name: string, file_count: number): Promise<void> {
		await appApiClient.post('/upload-history', { cvat_task_id, batch_name, file_count });
	}
}
