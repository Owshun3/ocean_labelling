import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const AUTH_TOKEN_KEY = 'cvat_token';
const CSRF_TOKEN_KEY = 'cvat_csrf_token';

async function setStoredValue(key: string, value: string): Promise<void> {
	if (Platform.OS === 'web') {
		localStorage.setItem(key, value);
		return;
	}

	await SecureStore.setItemAsync(key, value);
}

async function getStoredValue(key: string): Promise<string | null> {
	if (Platform.OS === 'web') {
		return localStorage.getItem(key);
	}

	return SecureStore.getItemAsync(key);
}

async function deleteStoredValue(key: string): Promise<void> {
	if (Platform.OS === 'web') {
		localStorage.removeItem(key);
		return;
	}

	await SecureStore.deleteItemAsync(key);
}

function extractCsrfTokenFromCookieHeader(cookieHeader: string): string | null {
	const match = cookieHeader.match(/(?:^|[;,]\s*)csrftoken=([^;,\s]+)/i);
	return match?.[1] ?? null;
}

export async function saveAuthToken(token: string): Promise<void> {
	await setStoredValue(AUTH_TOKEN_KEY, token);
}

export async function getAuthToken(): Promise<string | null> {
	return getStoredValue(AUTH_TOKEN_KEY);
}

export async function clearAuthToken(): Promise<void> {
	await deleteStoredValue(AUTH_TOKEN_KEY);
}

export async function saveCsrfToken(token: string): Promise<void> {
	await setStoredValue(CSRF_TOKEN_KEY, token);
}

export async function getCsrfToken(): Promise<string | null> {
	return getStoredValue(CSRF_TOKEN_KEY);
}

export async function clearCsrfToken(): Promise<void> {
	await deleteStoredValue(CSRF_TOKEN_KEY);
}

// ─── User profile (web-only, used for nav role-gating) ───────────────────────

export interface StoredUserProfile {
	id: number;
	username: string;
	is_superuser: boolean;
	is_staff: boolean;
	appRole: string;
}

const USER_PROFILE_KEY = 'cvat_user_profile';

export function saveUserProfile(profile: StoredUserProfile): void {
	if (typeof window !== 'undefined') {
		localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
	}
}

export function getUserProfile(): StoredUserProfile | null {
	if (typeof window !== 'undefined') {
		const raw = localStorage.getItem(USER_PROFILE_KEY);
		try { return raw ? JSON.parse(raw) : null; } catch { return null; }
	}
	return null;
}

export function clearUserProfile(): void {
	if (typeof window !== 'undefined') {
		localStorage.removeItem(USER_PROFILE_KEY);
	}
}

export function extractCsrfTokenFromHeaders(
	headers: Record<string, unknown> | undefined
): string | null {
	if (!headers) {
		return null;
	}

	const directHeader = headers['x-csrftoken'] ?? headers['X-CSRFToken'];
	if (typeof directHeader === 'string' && directHeader.length > 0) {
		return directHeader;
	}

	const rawCookieHeader = headers['set-cookie'] ?? headers['Set-Cookie'];
	if (typeof rawCookieHeader === 'string') {
		return extractCsrfTokenFromCookieHeader(rawCookieHeader);
	}

	if (Array.isArray(rawCookieHeader)) {
		for (const value of rawCookieHeader) {
			if (typeof value !== 'string') {
				continue;
			}

			const token = extractCsrfTokenFromCookieHeader(value);
			if (token) {
				return token;
			}
		}
	}

	return null;
}
