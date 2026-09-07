import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type FtfMotionProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  rotation?: number;
  enter?: boolean;
};
