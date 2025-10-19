import { ReactNode } from 'react';
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string | ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
}

const alertConfig = {
  success: {
    icon: CheckCircleIcon,
    bgColor: 'bg-green-50',
    textColor: 'text-green-800',
    iconColor: 'text-green-400',
    borderColor: 'border-green-200',
  },
  error: {
    icon: XCircleIcon,
    bgColor: 'bg-red-50',
    textColor: 'text-red-800',
    iconColor: 'text-red-400',
    borderColor: 'border-red-200',
  },
  warning: {
    icon: ExclamationTriangleIcon,
    bgColor: 'bg-yellow-50',
    textColor: 'text-yellow-800',
    iconColor: 'text-yellow-400',
    borderColor: 'border-yellow-200',
  },
  info: {
    icon: InformationCircleIcon,
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-800',
    iconColor: 'text-blue-400',
    borderColor: 'border-blue-200',
  },
};

export const Alert = ({
  type,
  title,
  message,
  dismissible = false,
  onDismiss,
}: AlertProps) => {
  const config = alertConfig[type];
  const Icon = config.icon;

  return (
    <div
      className={clsx(
        'rounded-lg border p-4',
        config.bgColor,
        config.borderColor
      )}
    >
      <div className="flex">
        <div className="flex-shrink-0">
          <Icon className={clsx('h-5 w-5', config.iconColor)} />
        </div>
        <div className="ml-3 flex-1">
          {title && (
            <h3 className={clsx('text-sm font-medium', config.textColor)}>
              {title}
            </h3>
          )}
          <div className={clsx('text-sm', config.textColor, title && 'mt-1')}>
            {message}
          </div>
        </div>
        {dismissible && onDismiss && (
          <div className="ml-auto pl-3">
            <button
              onClick={onDismiss}
              className={clsx(
                'inline-flex rounded-md p-1.5 focus:outline-none focus:ring-2 focus:ring-offset-2',
                config.textColor,
                'hover:bg-opacity-20 hover:bg-gray-500'
              )}
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
