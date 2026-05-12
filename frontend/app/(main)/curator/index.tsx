import { Redirect } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { CuratorHubScreen } from '@/features/curator/screens/CuratorHubScreen';

const ALLOWED_ROLES = ['admin', 'moderator', 'curator', 'chercheur'];

export default function CuratorRoute() {
	const profile = getUserProfile();
	const role = profile?.appRole ?? '';
	if (!profile || !ALLOWED_ROLES.includes(role)) {
		return <Redirect href="/(main)" />;
	}
	return <CuratorHubScreen />;
}
