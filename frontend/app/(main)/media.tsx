import { Redirect } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { MediaListScreen } from '@/features/media/screens/MediaListScreen';

export default function MediaRoute() {
	const profile = getUserProfile();
	if (!profile || profile.appRole === 'guest') return <Redirect href="/(main)" />;
	return <MediaListScreen />;
}
