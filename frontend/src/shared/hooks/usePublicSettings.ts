import { useEffect, useState } from 'react';
import {
	PublicSettings,
	getPublicSettings,
	refreshPublicSettings,
	subscribePublicSettings,
} from '@/services/api/publicSettings';

const REFRESH_INTERVAL_MS = 30_000;

export function usePublicSettings(): PublicSettings {
	const [settings, setSettings] = useState<PublicSettings>(getPublicSettings());

	useEffect(() => {
		const unsubscribe = subscribePublicSettings(setSettings);
		void refreshPublicSettings();
		const id = setInterval(() => { void refreshPublicSettings(); }, REFRESH_INTERVAL_MS);
		return () => {
			unsubscribe();
			clearInterval(id);
		};
	}, []);

	return settings;
}
