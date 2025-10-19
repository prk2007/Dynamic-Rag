import { useAuthStore } from '../../store/authStore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export const ProfilePage = () => {
  const { user } = useAuthStore();

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your account settings and preferences
        </p>
      </div>

      {/* Profile Information */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-6">
          Profile Information
        </h2>
        <dl className="space-y-6">
          <div>
            <dt className="text-sm font-medium text-gray-500">Email Address</dt>
            <dd className="mt-1 flex items-center justify-between">
              <span className="text-sm text-gray-900">{user.email}</span>
              {user.email_verified && (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Verified
                </span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Company Name</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {user.company_name || 'Not specified'}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Account Status</dt>
            <dd className="mt-1">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                user.status === 'active'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-yellow-100 text-yellow-800'
              }`}>
                {user.status}
              </span>
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Member Since</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {format(new Date(user.created_at), 'MMMM d, yyyy')}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Account ID</dt>
            <dd className="mt-1 text-sm text-gray-500 font-mono">{user.id}</dd>
          </div>
        </dl>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <Button
            variant="outline"
            onClick={() => toast.error('Feature coming soon!')}
          >
            Edit Profile
          </Button>
        </div>
      </Card>

      {/* Security Settings */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-6">
          Security Settings
        </h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Password</p>
              <p className="text-sm text-gray-500">
                Last changed: Never
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => toast.error('Feature coming soon!')}
            >
              Change Password
            </Button>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Two-Factor Authentication
              </p>
              <p className="text-sm text-gray-500">
                Add an extra layer of security to your account
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => toast.info('MFA coming soon in Phase 1.6!')}
            >
              Enable
            </Button>
          </div>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card>
        <h2 className="text-lg font-semibold text-red-600 mb-6">
          Danger Zone
        </h2>
        <div className="space-y-4">
          <div className="border border-red-200 rounded-lg p-4 bg-red-50">
            <h3 className="text-sm font-medium text-red-900 mb-2">
              Delete Account
            </h3>
            <p className="text-sm text-red-700 mb-4">
              Once you delete your account, there is no going back. Please be certain.
            </p>
            <Button
              variant="danger"
              onClick={() => toast.error('Feature coming soon!')}
            >
              Delete Account
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
