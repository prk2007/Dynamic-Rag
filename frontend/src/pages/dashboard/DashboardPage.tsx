import { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { Card } from '../../components/ui/Card';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { ROUTES, API_ENDPOINTS } from '../../utils/constants';
import api from '../../services/api';

interface UsageSummary {
  documents: number;
  search_query: number;
  api_call: number;
  [key: string]: number;
}

export const DashboardPage = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState<UsageSummary>({ documents: 0, search_query: 0, api_call: 0 });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get(API_ENDPOINTS.USAGE.SUMMARY);
        setStats(response.data);
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, []);

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back{user.company_name ? `, ${user.company_name}` : ''}!
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Here's what's happening with your account today.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-primary-100 rounded-md p-3">
              <svg
                className="h-6 w-6 text-primary-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Documents</p>
              <p className="text-2xl font-semibold text-gray-900">{loadingStats ? '...' : stats.documents}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-green-100 rounded-md p-3">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Searches</p>
              <p className="text-2xl font-semibold text-gray-900">{loadingStats ? '...' : stats.search_query}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center">
            <div className="flex-shrink-0 bg-yellow-100 rounded-md p-3">
              <svg
                className="h-6 w-6 text-yellow-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">API Calls</p>
              <p className="text-2xl font-semibold text-gray-900">{loadingStats ? '...' : stats.api_call}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Account Information */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Account Information
        </h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <dt className="text-sm font-medium text-gray-500">Email</dt>
            <dd className="mt-1 text-sm text-gray-900">{user.email}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="mt-1">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                {user.status}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Company</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {user.company_name || 'Not specified'}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Member since</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {format(new Date(user.created_at), 'MMMM d, yyyy')}
            </dd>
          </div>
        </dl>
      </Card>

      {/* Quick Actions */}
      <Card>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => navigate(ROUTES.DOCUMENTS_UPLOAD)}
            className="text-left p-4 border border-gray-200 rounded-lg hover:border-primary-500 hover:shadow transition-all"
          >
            <div className="font-medium text-gray-900">Upload Documents</div>
            <div className="mt-1 text-sm text-gray-500">
              Add documents to your knowledge base
            </div>
          </button>
          <button
            onClick={() => navigate(ROUTES.API_KEYS)}
            className="text-left p-4 border border-gray-200 rounded-lg hover:border-primary-500 hover:shadow transition-all"
          >
            <div className="font-medium text-gray-900">View API Keys</div>
            <div className="mt-1 text-sm text-gray-500">
              Manage your API authentication
            </div>
          </button>
        </div>
      </Card>
    </div>
  );
};
