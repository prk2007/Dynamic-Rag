import { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { ClipboardIcon, KeyIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export const ApiKeysPage = () => {
  const { user } = useAuthStore();
  const [showKey, setShowKey] = useState(false);

  if (!user) return null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(user.api_key);
    toast.success('API key copied to clipboard!');
  };

  const maskApiKey = (key: string) => {
    if (!key) return '';
    return key.slice(0, 8) + '••••••••••••••••••••' + key.slice(-8);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">API Keys</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage your API authentication keys for Dynamic RAG
        </p>
      </div>

      {/* Security Alert */}
      <Alert
        type="warning"
        title="Keep your API key secure"
        message="Never share your API key publicly or commit it to version control. Treat it like a password."
      />

      {/* API Key Card */}
      <Card>
        <div className="space-y-6">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <div className="flex items-center justify-center h-12 w-12 rounded-md bg-primary-100">
                <KeyIcon className="h-6 w-6 text-primary-600" />
              </div>
            </div>
            <div className="ml-4 flex-1">
              <h3 className="text-lg font-medium text-gray-900">Your API Key</h3>
              <p className="mt-1 text-sm text-gray-500">
                Use this key to authenticate API requests to Dynamic RAG
              </p>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex items-center justify-between">
              <code className="text-sm font-mono text-gray-900 break-all">
                {showKey ? user.api_key : maskApiKey(user.api_key)}
              </code>
            </div>
          </div>

          <div className="flex space-x-3">
            <Button
              variant="outline"
              onClick={() => setShowKey(!showKey)}
            >
              {showKey ? 'Hide' : 'Show'} API Key
            </Button>
            <Button
              variant="primary"
              onClick={copyToClipboard}
            >
              <ClipboardIcon className="h-5 w-5 mr-2" />
              Copy to Clipboard
            </Button>
          </div>
        </div>
      </Card>

      {/* Usage Information */}
      <Card>
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          How to use your API key
        </h3>
        <div className="space-y-4 text-sm text-gray-600">
          <div>
            <p className="font-medium text-gray-900 mb-2">Authentication Header</p>
            <div className="bg-gray-900 p-4 rounded-lg overflow-x-auto">
              <code className="text-green-400 text-xs">
                Authorization: Bearer YOUR_API_KEY
              </code>
            </div>
          </div>

          <div>
            <p className="font-medium text-gray-900 mb-2">Example cURL Request</p>
            <div className="bg-gray-900 p-4 rounded-lg overflow-x-auto">
              <code className="text-green-400 text-xs whitespace-pre">
                {`curl -X GET http://localhost:3001/api/auth/me \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`}
              </code>
            </div>
          </div>

          <div>
            <p className="font-medium text-gray-900 mb-2">Example JavaScript</p>
            <div className="bg-gray-900 p-4 rounded-lg overflow-x-auto">
              <code className="text-green-400 text-xs whitespace-pre">
                {`const response = await fetch('http://localhost:3001/api/auth/me', {
  headers: {
    'Authorization': 'Bearer YOUR_API_KEY',
    'Content-Type': 'application/json'
  }
});`}
              </code>
            </div>
          </div>
        </div>
      </Card>

      {/* Regenerate Section */}
      <Card>
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Regenerate API Key
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              If you believe your API key has been compromised, you can regenerate it.
              This will invalidate the old key immediately.
            </p>
          </div>
          <Button
            variant="danger"
            onClick={() => toast.error('Feature coming soon!')}
          >
            Regenerate API Key
          </Button>
        </div>
      </Card>
    </div>
  );
};
