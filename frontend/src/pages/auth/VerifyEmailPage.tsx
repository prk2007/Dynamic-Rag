import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/Spinner';
import { ROUTES } from '../../utils/constants';

export const VerifyEmailPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { verifyEmail } = useAuth();

  const [isVerifying, setIsVerifying] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const hasVerified = useRef(false);

  useEffect(() => {
    // Prevent duplicate verification attempts (React StrictMode runs effects twice)
    if (hasVerified.current) {
      return;
    }

    const token = searchParams.get('token');

    if (!token) {
      setError('Invalid verification link');
      setIsVerifying(false);
      return;
    }

    const verify = async () => {
      hasVerified.current = true;

      try {
        const response = await verifyEmail(token);
        setEmail(response.email);
        setIsSuccess(true);

        // Redirect to login after 3 seconds
        setTimeout(() => {
          navigate(ROUTES.LOGIN);
        }, 3000);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Verification failed');
      } finally {
        setIsVerifying(false);
      }
    };

    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Spinner size="lg" />
          <p className="mt-4 text-gray-600">Verifying your email...</p>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
        <div className="max-w-md w-full space-y-8 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 p-3">
              <CheckCircleIcon className="h-16 w-16 text-green-600" />
            </div>
          </div>

          <div>
            <h2 className="text-3xl font-extrabold text-gray-900">
              Email verified!
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              Your email <span className="font-medium">{email}</span> has been successfully verified.
            </p>
          </div>

          <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
            <div className="text-sm text-gray-600 space-y-2">
              <p className="font-medium text-gray-900">Your account is now active!</p>
              <p>You can now sign in and start using Dynamic RAG.</p>
            </div>

            <Button
              fullWidth
              onClick={() => navigate(ROUTES.LOGIN)}
            >
              Continue to sign in
            </Button>
          </div>

          <p className="text-sm text-gray-500">
            Redirecting to sign in page in 3 seconds...
          </p>
        </div>
      </div>
    );
  }

  // Error state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div className="flex justify-center">
          <div className="rounded-full bg-red-100 p-3">
            <XCircleIcon className="h-16 w-16 text-red-600" />
          </div>
        </div>

        <div>
          <h2 className="text-3xl font-extrabold text-gray-900">
            Verification failed
          </h2>
          <p className="mt-2 text-sm text-gray-600">{error}</p>
        </div>

        <div className="bg-white p-6 rounded-lg border border-gray-200 space-y-4">
          <div className="text-sm text-gray-600">
            <p>The verification link may have expired or is invalid.</p>
            <p className="mt-2">Please request a new verification email.</p>
          </div>

          <Link to={ROUTES.VERIFICATION_PENDING}>
            <Button fullWidth>
              Request new verification email
            </Button>
          </Link>
        </div>

        <Link
          to={ROUTES.LOGIN}
          className="text-sm font-medium text-primary-600 hover:text-primary-500"
        >
          Back to sign in
        </Link>
      </div>
    </div>
  );
};
