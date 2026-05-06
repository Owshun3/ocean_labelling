import { Redirect, useLocalSearchParams } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { ModerationMediaScreen } from '@/features/moderation/screens/ModerationMediaScreen';

const ALLOWED = ['admin', 'moderator'];

export default function ModerationMediaRoute() {
	const profile = getUserProfile();
	if (!profile || !ALLOWED.includes(profile.appRole)) return <Redirect href="/(main)" />;

	const params = useLocalSearchParams<{ userId: string; taskId: string }>();
	const userId = Number(params.userId);
	const taskId = Number(params.taskId);
	if (!Number.isFinite(userId) || !Number.isFinite(taskId)) return <Redirect href="/(main)/moderation" />;

	return <ModerationMediaScreen userId={userId} taskId={taskId} />;
}
