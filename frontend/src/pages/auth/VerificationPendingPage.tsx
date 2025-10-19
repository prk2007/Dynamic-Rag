import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { EnvelopeIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ROUTES, APP_NAME } from '../../utils/constants';

export const VerificationPendingPage = () => {
  const location = useLocation();
  const { resendVerification } = useAuth();
  const email = location.state?.email || '';

  const [isResending, setIsResending] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleResend = async () => {
    if (!email) return;

    setError('');
    setShowSuccess(false);
    setIsResending(true);

    try {
      await resendVerification(email);
      setShowSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to resend verification email');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="rounded-full bg-primary-100 p-3">
            <EnvelopeIcon className="h-12 w-12 text-primary-600" />
          </div>
        </div>

        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Check your email
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            We've sent a verification link to
          </p>
          {email && (
            <p className="mt-1 text-sm font-medium text-gray-900">
              {email}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="space-y-6">
          {showSuccess && (
            <Alert
              type="success"
              message="Verification email sent successfully! Please check your inbox."
              dismissible
              onDismiss={() => setShowSuccess(false)}
            />
          )}

          {error && (
            <Alert
              type="error"
              message={error}
              dismissible
              onDismiss={() => setError('')}
            />
          )}

          <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
            <div className="space-y-2 text-sm text-gray-600">
              <p className="flex items-start">
                <span className="font-semibold text-gray-900 mr-2">1.</span>
                <span>Click the verification link in the email</span>
              </p>
              <p className="flex items-start">
                <span className="font-semibold text-gray-900 mr-2">2.</span>
                <span>Your account will be activated</span>
              </p>
              <p className="flex items-start">
                <span className="font-semibold text-gray-900 mr-2">3.</span>
                <span>Sign in to access your dashboard</span>
              </p>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Didn't receive the email? Check your spam folder or
              </p>
              <Button
                variant="outline"
                fullWidth
                className="mt-2"
                loading={isResending}
                disabled={isResending || !email}
                onClick={handleResend}
              >
                Resend verification email
              </Button>
            </div>
          </div>

          <div className="text-center">
            <Link
              to={ROUTES.LOGIN}
              className="text-sm font-medium text-primary-600 hover:text-primary-500"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
