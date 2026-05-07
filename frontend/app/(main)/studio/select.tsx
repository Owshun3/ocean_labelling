import { Redirect } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { StudioSelectScreen } from '@/features/studio/screens/StudioSelectScreen';

export default function StudioSelectRoute() {
	const profile = getUserProfile();
	if (!profile || profile.appRole === 'guest') return <Redirect href="/(main)" />;
	return <StudioSelectScreen />;
}
