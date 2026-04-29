import React, { useState } from 'react';
import { Redirect } from 'expo-router';
import { getUserProfile } from '@/services/api/authStorage';
import { CuratorHubScreen } from '@/features/curator/screens/CuratorHubScreen';
import { CuratorTaskScreen } from '@/features/curator/screens/CuratorTaskScreen';
import { CuratorTask } from '@/services/api/CuratorService';

const ALLOWED_ROLES = ['admin', 'moderator', 'curator'];

export default function CuratorRoute() {
  const [selectedTask, setSelectedTask] = useState<CuratorTask | null>(null);

  const profile = getUserProfile();
  const role = profile?.appRole ?? '';

  if (!profile || !ALLOWED_ROLES.includes(role)) {
    return <Redirect href="/(main)" />;
  }

  if (selectedTask) {
    return (
      <CuratorTaskScreen
        task={selectedTask}
        onBack={() => setSelectedTask(null)}
      />
    );
  }

  return <CuratorHubScreen onSelectTask={setSelectedTask} />;
}
