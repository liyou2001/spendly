import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { type } from '@/theme';

export type TextVariant = keyof typeof type;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
}

/** Text in one of the theme's type styles. Use this instead of react-native's Text. */
export function Text({ variant = 'body', style, ...props }: TextProps) {
  return <RNText style={[type[variant], style]} {...props} />;
}
