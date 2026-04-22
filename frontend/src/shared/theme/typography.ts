import { TextStyle } from 'react-native';

export const TYPOGRAPHY: Record<string, TextStyle> = {
  title: {
    fontSize: 28,
    fontWeight: '700',
    fontFamily: 'Roboto',
    lineHeight: 34,
  },
  h1: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Roboto',
    lineHeight: 28,
  },
  h2: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'Roboto',
    lineHeight: 24,
  },
  body: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'Roboto',
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Roboto',
    lineHeight: 16,
  }
} as const;