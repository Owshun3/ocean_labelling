import React from 'react';
import { Redirect } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { UploadScreen } from '@/features/media/screens/UploadScreens';

export default function UploadRoute() {
	const profile = getUserProfile();
	if (!profile || profile.appRole === 'guest') return <Redirect href="/(main)" />;
	return <UploadScreen />;
}
