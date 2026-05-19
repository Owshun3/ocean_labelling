import { Redirect } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { CuratorSpeciesCatalogScreen } from '@/features/curator/screens/CuratorSpeciesCatalogScreen';

const CURATOR_ROLES = new Set(['admin', 'moderator', 'curator', 'chercheur']);

export default function CuratorSpeciesCatalogRoute() {
	const profile = getUserProfile();
	if (!profile || !CURATOR_ROLES.has(profile.appRole)) {
		return <Redirect href="/(main)" />;
	}
	return <CuratorSpeciesCatalogScreen />;
}
