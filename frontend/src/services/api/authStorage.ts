import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface StoredUserProfile {
	id: number;
	username: string;
	is_superuser: boolean;
	is_staff: boolean;
	appRole: string;
	hasSeenWelcome: boolean;
	hasAcceptedUploadTerms: boolean;
}

// Profil "invité" (guest) : aucune session backend, aucun cookie, aucune donnée
// personnelle stockée. Existe uniquement côté client pour gate les routes vers
// la landing page.
export const GUEST_PROFILE: StoredUserProfile = {
	id: 0,
	username: 'Invité',
	is_superuser: false,
	is_staff: false,
	appRole: 'guest',
	hasSeenWelcome: true,
	hasAcceptedUploadTerms: false,
};

export function startGuestSession(): void {
	saveUserProfile(GUEST_PROFILE);
	markSessionAlive();
}

const USER_PROFILE_KEY = 'cvat_user_profile';
const SESSION_ALIVE_KEY = 'ocean_session_alive';

// Storage abstraction — sync localStorage on web, async SecureStore on mobile.
// Profile/session-alive flag are non-sensitive: profile is only for nav role-gating,
// session-alive is a boolean. The actual auth state lives in the HttpOnly cookie
// and the `app_sessions` Postgres table — nothing sensitive ever touches the device.
// Cookies on mobile are handled by the native HTTP layer (NSURLSession / OkHttp),
// transparent to axios as long as `withCredentials: true` is set.

function setItem(key: string, value: string): void {
	if (Platform.OS === 'web') {
		if (typeof window !== 'undefined') localStorage.setItem(key, value);
		return;
	}
	SecureStore.setItemAsync(key, value).catch(() => {});
}

function getItemSync(key: string): string | null {
	if (Platform.OS === 'web') {
		return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
	}
	return null;
}

async function getItemAsync(key: string): Promise<string | null> {
	if (Platform.OS === 'web') {
		return typeof window !== 'undefined' ? localStorage.getItem(key) : null;
	}
	try { return await SecureStore.getItemAsync(key); } catch { return null; }
}

function removeItem(key: string): void {
	if (Platform.OS === 'web') {
		if (typeof window !== 'undefined') localStorage.removeItem(key);
		return;
	}
	SecureStore.deleteItemAsync(key).catch(() => {});
}

export function saveUserProfile(profile: StoredUserProfile): void {
	setItem(USER_PROFILE_KEY, JSON.stringify(profile));
}

export function getUserProfile(): StoredUserProfile | null {
	const raw = getItemSync(USER_PROFILE_KEY);
	if (!raw) return null;
	try { return JSON.parse(raw) as StoredUserProfile; } catch { return null; }
}

export async function getUserProfileAsync(): Promise<StoredUserProfile | null> {
	const raw = await getItemAsync(USER_PROFILE_KEY);
	if (!raw) return null;
	try { return JSON.parse(raw) as StoredUserProfile; } catch { return null; }
}

export function clearUserProfile(): void {
	removeItem(USER_PROFILE_KEY);
}

export function markSessionAlive(): void {
	setItem(SESSION_ALIVE_KEY, String(Date.now()));
}

export function isSessionAlive(): boolean {
	return getItemSync(SESSION_ALIVE_KEY) !== null;
}

export async function isSessionAliveAsync(): Promise<boolean> {
	return (await getItemAsync(SESSION_ALIVE_KEY)) !== null;
}

export function clearSessionAlive(): void {
	removeItem(SESSION_ALIVE_KEY);
}
