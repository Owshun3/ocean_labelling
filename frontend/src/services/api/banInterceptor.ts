import { AxiosInstance } from 'axios';
import { Platform } from 'react-native';
import { clearAuthToken, clearUserProfile } from './authStorage';

const BAN_SESSION_KEY = 'ocean_ban_info';
const LOGIN_PATH = '/login';

export interface BanSessionInfo {
	reason: string | null;
	expires_at: string | null;
	banned_at: string | null;
}

export function attachBanInterceptor(client: AxiosInstance): void {
	client.interceptors.response.use(
		(resp) => resp,
		async (error) => {
			const status  = error?.response?.status;
			const errKey  = error?.response?.data?.error;
			const isBan   = status === 403 && errKey === 'Compte banni';
			if (isBan && Platform.OS === 'web' && typeof window !== 'undefined') {
				try {
					sessionStorage.setItem(BAN_SESSION_KEY, JSON.stringify({
						reason:     error.response.data.reason     ?? null,
						expires_at: error.response.data.expires_at ?? null,
						banned_at:  error.response.data.banned_at  ?? null,
					}));
				} catch {}
				try { await clearAuthToken(); } catch {}
				clearUserProfile();
				if (window.location.pathname !== LOGIN_PATH) {
					window.location.href = LOGIN_PATH;
				}
			}
			return Promise.reject(error);
		}
	);
}

export function consumeBanInfo(): BanSessionInfo | null {
	if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(BAN_SESSION_KEY);
		if (!raw) return null;
		sessionStorage.removeItem(BAN_SESSION_KEY);
		return JSON.parse(raw) as BanSessionInfo;
	} catch {
		return null;
	}
}

export function formatRemaining(expiresAt: string | null): string {
	if (!expiresAt) return 'permanent';
	const ms = new Date(expiresAt).getTime() - Date.now();
	if (ms <= 0) return 'expiré';
	const totalMinutes = Math.floor(ms / 60_000);
	if (totalMinutes < 1) return 'moins d\'une minute';
	if (totalMinutes < 60) return `${totalMinutes} min`;
	const totalHours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (totalHours < 24) return minutes > 0 ? `${totalHours} h ${minutes} min` : `${totalHours} h`;
	const days = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	return hours > 0 ? `${days} j ${hours} h` : `${days} j`;
}
