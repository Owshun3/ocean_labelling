import { Redirect, useLocalSearchParams } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { ModerationUserScreen } from '@/features/moderation/screens/ModerationUserScreen';

const ALLOWED = ['admin', 'moderator'];

export default function ModerationUserRoute() {
	const profile = getUserProfile();
	if (!profile || !ALLOWED.includes(profile.appRole)) return <Redirect href="/(main)" />;

	const params = useLocalSearchParams<{ userId: string }>();
	const userId = Number(params.userId);
	if (!Number.isFinite(userId)) return <Redirect href="/(main)/moderation" />;

	return <ModerationUserScreen userId={userId} />;
}
