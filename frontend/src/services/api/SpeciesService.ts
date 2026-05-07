import axios from 'axios';
import { Platform } from 'react-native';
import { attachBanInterceptor } from './banInterceptor';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

const speciesClient = axios.create({ baseURL: `${APP_API_BASE}/species` });

speciesClient.interceptors.request.use((config) => {
	const token = Platform.OS === 'web'
		? (typeof window !== 'undefined' ? localStorage.getItem('cvat_token') : null)
		: null;
	if (token) config.headers.Authorization = `Token ${token}`;
	return config;
});

attachBanInterceptor(speciesClient);

export type SpeciesStatus = 'pending' | 'approved' | 'rejected';

export interface Species {
	id: number;
	name: string;
	status: SpeciesStatus;
	usage_count: number;
}

export class SpeciesService {
	async search(prefix: string): Promise<Species[]> {
		const resp = await speciesClient.get<{ results: Species[] }>('/', { params: { q: prefix } });
		return resp.data.results;
	}

	async create(name: string): Promise<Species> {
		const resp = await speciesClient.post<Species>('/', { name });
		return resp.data;
	}

	async incrementUsage(id: number): Promise<void> {
		await speciesClient.post(`/${id}/increment-usage`);
	}
}
