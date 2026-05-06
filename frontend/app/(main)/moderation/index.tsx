import { Redirect } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { ModerationQueueScreen } from '@/features/moderation/screens/ModerationQueueScreen';

const ALLOWED = ['admin', 'moderator'];

export default function ModerationIndexRoute() {
	const profile = getUserProfile();
	if (!profile || !ALLOWED.includes(profile.appRole)) return <Redirect href="/(main)" />;
	return <ModerationQueueScreen />;
}
