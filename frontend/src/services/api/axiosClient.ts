import axios from 'axios';
import { APP_CONFIG } from '../../core/config/appConfig';

export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL, 
  timeout: APP_CONFIG.NETWORK.DEFAULT_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

apiClient.interceptors.request.use(
  async (config) => {
    const token = process.env.EXPO_PUBLIC_CVAT_TOKEN;

    if (config.headers && token) {
      config.headers.Authorization = `Token ${token}`;
    }

    return config;
  }
);