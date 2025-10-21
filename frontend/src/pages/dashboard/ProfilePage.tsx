import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';
import { EyeIcon, EyeSlashIcon, KeyIcon } from '@heroicons/react/24/outline';

export const ProfilePage = () => {
  const { user } = useAuthStore();
  const [openaiKey, setOpenaiKey] = useState('');
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [keyPreview, setKeyPreview] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchOpenAIKeyStatus();
  }, []);

  const fetchOpenAIKeyStatus = async () => {
    try {
      setIsLoading(true);
      const response = await api.get(API_ENDPOINTS.PROFILE.OPENAI_KEY_STATUS);
      setHasOpenaiKey(response.data.has_openai_key);
      setKeyPreview(response.data.key_preview);
    } catch (error: any) {
      console.error('Failed to fetch OpenAI key status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveOpenAIKey = async () => {
    if (!openaiKey.trim()) {
      toast.error('Please enter an OpenAI API key');
      return;
    }

    if (!openaiKey.startsWith('sk-')) {
      toast.error('Invalid OpenAI API key format. Key should start with "sk-"');
      return;
    }

    try {
      setIsSaving(true);
      await api.put(API_ENDPOINTS.PROFILE.UPDATE_OPENAI_KEY, {
        openai_key: openaiKey,
      });
      toast.success('OpenAI API key saved successfully');
      setOpenaiKey('');
      setShowKey(false);
      await fetchOpenAIKeyStatus();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to save OpenAI API key');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveOpenAIKey = async () => {
    if (!confirm('Are you sure you want to remove your OpenAI API key? Document processing will fail without a key.')) {
      return;
    }

    try {
      setIsSaving(true);
      await api.delete(API_ENDPOINTS.PROFILE.UPDATE_OPENAI_KEY);
      toast.success('OpenAI API key removed');
      setOpenaiKey('');
      await fetchOpenAIKeyStatus();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to remove OpenAI API key');
    } finally {
      setIsSaving(false);
    }
  };

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

      {/* OpenAI API Key */}
      <Card>
        <div className="flex items-center gap-2 mb-6">
          <KeyIcon className="h-5 w-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">
            OpenAI API Key
          </h2>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Your OpenAI API key is used to generate embeddings for document processing.
            The key is stored securely and encrypted in our database.
          </p>

          {hasOpenaiKey ? (
            <div className="border border-green-200 rounded-lg p-4 bg-green-50">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-green-900">
                    API Key Configured
                  </p>
                  <p className="text-sm text-green-700 mt-1 font-mono">
                    {keyPreview || '••••••••'}
                  </p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Active
                </span>
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? 'Hide' : 'Update'} Key
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={handleRemoveOpenAIKey}
                  disabled={isSaving}
                >
                  Remove Key
                </Button>
              </div>
            </div>
          ) : (
            <div className="border border-yellow-200 rounded-lg p-4 bg-yellow-50">
              <p className="text-sm font-medium text-yellow-900">
                No API Key Configured
              </p>
              <p className="text-sm text-yellow-700 mt-1">
                Document processing will fail without an OpenAI API key. Please add your key below.
              </p>
            </div>
          )}

          {(!hasOpenaiKey || showKey) && (
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <div>
                <label htmlFor="openai-key" className="block text-sm font-medium text-gray-700">
                  OpenAI API Key
                </label>
                <div className="mt-1 relative">
                  <Input
                    id="openai-key"
                    type={showKey ? 'text' : 'password'}
                    placeholder="sk-..."
                    value={openaiKey}
                    onChange={(e) => setOpenaiKey(e.target.value)}
                    disabled={isSaving}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? (
                      <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Get your API key from{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary-600 hover:text-primary-500"
                  >
                    OpenAI Platform
                  </a>
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveOpenAIKey}
                  disabled={isSaving || !openaiKey}
                  loading={isSaving}
                >
                  {hasOpenaiKey ? 'Update' : 'Save'} API Key
                </Button>
                {hasOpenaiKey && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowKey(false);
                      setOpenaiKey('');
                    }}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
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
              onClick={() => toast('MFA coming soon in Phase 1.6!')}
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
