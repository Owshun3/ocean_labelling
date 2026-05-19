import axios from 'axios';

import { APP_API_BASE } from './runtimeUrls';

export type RankId = 'debutant' | 'bronze' | 'argent' | 'or' | 'platine';

export interface PublicSettings {
	'platform.name': string;
	'platform.logo_filename': string;
	'platform.help_video_filename': string;
	'platform.welcome_message': string;
	'platform.contact_email': string;
	'platform.contact_phone': string;
	'platform.contact_hours': string;
	'platform.contact_address': string;
	'platform.maintenance_mode': boolean;
	'platform.maintenance_message': string;
	'platform.public_registration': boolean;
	'rank.debutant.label': string; 'rank.debutant.color': string;
	'rank.bronze.label':   string; 'rank.bronze.color':   string;
	'rank.argent.label':   string; 'rank.argent.color':   string;
	'rank.or.label':       string; 'rank.or.color':       string;
	'rank.platine.label':  string; 'rank.platine.color':  string;
}

const DEFAULTS: PublicSettings = {
	'platform.name':                    'Ora te Fenua',
	'platform.logo_filename':           '',
	'platform.help_video_filename':     '',
	'platform.welcome_message':         'Bienvenue.',
	'platform.contact_email':           '',
	'platform.contact_phone':           '',
	'platform.contact_hours':           '',
	'platform.contact_address':         '',
	'platform.maintenance_mode':        false,
	'platform.maintenance_message':     'Maintenance en cours, merci de revenir plus tard.',
	'platform.public_registration':     true,
	'rank.debutant.label': 'Débutant', 'rank.debutant.color': '#9ca3af',
	'rank.bronze.label':   'Bronze',   'rank.bronze.color':   '#cd7f32',
	'rank.argent.label':   'Argent',   'rank.argent.color':   '#c0c0c0',
	'rank.or.label':       'Or',       'rank.or.color':       '#f59e0b',
	'rank.platine.label':  'Platine',  'rank.platine.color':  '#06b6d4',
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
