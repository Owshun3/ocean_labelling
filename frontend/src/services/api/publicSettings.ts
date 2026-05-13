import axios from 'axios';

const APP_API_BASE = process.env.EXPO_PUBLIC_APP_API_URL || 'http://localhost:8888/app-api';

export interface PublicSettings {
	'platform.name': string;
	'platform.welcome_message': string;
	'platform.contact_email': string;
	'platform.contact_phone': string;
	'platform.contact_hours': string;
	'platform.contact_address': string;
	'platform.maintenance_mode': boolean;
	'platform.maintenance_message': string;
	'platform.public_registration': boolean;
}

const DEFAULTS: PublicSettings = {
	'platform.name':                    'Ocean Labelling',
	'platform.welcome_message':         'Bienvenue.',
	'platform.contact_email':           '',
	'platform.contact_phone':           '',
	'platform.contact_hours':           '',
	'platform.contact_address':         '',
	'platform.maintenance_mode':        false,
	'platform.maintenance_message':     'Maintenance en cours, merci de revenir plus tard.',
	'platform.public_registration':     true,
};

let cache: PublicSettings = { ...DEFAULTS };
let lastFetchedAt = 0;
const listeners = new Set<(s: PublicSettings) => void>();

export async function refreshPublicSettings(): Promise<PublicSettings> {
	try {
		const resp = await axios.get<Partial<PublicSettings>>(`${APP_API_BASE}/settings/public`);
		const next: PublicSettings = { ...DEFAULTS, ...resp.data };
		const changed = JSON.stringify(cache) !== JSON.stringify(next);
		cache = next;
		lastFetchedAt = Date.now();
		if (changed) listeners.forEach((cb) => cb(cache));
		return cache;
	} catch {
		return cache;
	}
}

export function getPublicSettings(): PublicSettings {
	return cache;
}

export function lastPublicSettingsFetch(): number {
	return lastFetchedAt;
}

export function subscribePublicSettings(cb: (s: PublicSettings) => void): () => void {
	listeners.add(cb);
	return () => { listeners.delete(cb); };
}
