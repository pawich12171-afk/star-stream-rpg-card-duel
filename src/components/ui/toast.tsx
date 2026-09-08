import * as React from 'react';

export type ToastActionElement = React.ReactElement;

export type ToastProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  variant?: 'default' | 'destructive';
  className?: string;
};