import { ReactNode, useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAuth } from '../../hooks/useAuth';
import {
  HomeIcon,
  KeyIcon,
  UserCircleIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  DocumentTextIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { ROUTES, APP_NAME } from '../../utils/constants';
import clsx from 'clsx';

interface DashboardLayoutProps {
  children: ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: ROUTES.DASHBOARD, icon: HomeIcon },
  { name: 'Documents', href: ROUTES.DOCUMENTS, icon: DocumentTextIcon },
  { name: 'Profile', href: ROUTES.PROFILE, icon: UserCircleIcon },
  { name: 'API Keys', href: ROUTES.API_KEYS, icon: KeyIcon },
];

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-gray-600 bg-opacity-75"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative flex w-full max-w-xs flex-1 flex-col bg-white">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <button
                type="button"
                className="ml-1 flex h-10 w-10 items-center justify-center rounded-full"
                onClick={() => setSidebarOpen(false)}
              >
                <XMarkIcon className="h-6 w-6 text-white" />
              </button>
            </div>
            {/* Mobile sidebar content */}
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="flex-shrink-0 flex items-center px-4">
                <h1 className="text-xl font-bold text-primary-600">{APP_NAME}</h1>
              </div>
              <nav className="mt-8 px-2 space-y-1">
                {navigation.map((item) => (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    className={({ isActive }) =>
                      clsx(
                        isActive
                          ? 'bg-primary-50 text-primary-600'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                        'group flex items-center px-2 py-2 text-base font-medium rounded-md'
                      )
                    }
                    onClick={() => setSidebarOpen(false)}
                  >
                    {({ isActive }) => (
                      <>
                        <item.icon
                          className={clsx(
                            isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-500',
                            'mr-4 h-6 w-6'
                          )}
                        />
                        {item.name}
                      </>
                    )}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex min-h-0 flex-1 flex-col border-r border-gray-200 bg-white">
          <div className="flex flex-1 flex-col overflow-y-auto pt-5 pb-4">
            <div className="flex flex-shrink-0 items-center px-4">
              <h1 className="text-xl font-bold text-primary-600">{APP_NAME}</h1>
            </div>
            <nav className="mt-8 flex-1 space-y-1 px-2">
              {navigation.map((item) => (
                <NavLink
                  key={item.name}
                  to={item.href}
                  className={({ isActive }) =>
                    clsx(
                      isActive
                        ? 'bg-primary-50 text-primary-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                      'group flex items-center px-2 py-2 text-sm font-medium rounded-md'
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={clsx(
                          isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-500',
                          'mr-3 h-6 w-6'
                        )}
                      />
                      {item.name}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex flex-shrink-0 border-t border-gray-200 p-4">
            <div className="group block w-full flex-shrink-0">
              <div className="flex items-center">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">
                    {user.company_name || user.email}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
                <button
                  onClick={logout}
                  className="ml-3 p-2 text-gray-400 hover:text-gray-500"
                  title="Sign out"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col flex-1">
        {/* Top bar - Mobile and Desktop */}
        <div className="sticky top-0 z-10 flex h-16 flex-shrink-0 bg-white shadow">
          {/* Mobile menu button */}
          <button
            type="button"
            className="border-r border-gray-200 px-4 text-gray-500 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Bars3Icon className="h-6 w-6" />
          </button>

          {/* Top bar content */}
          <div className="flex flex-1 justify-between px-4 lg:px-6">
            <div className="flex flex-1 items-center lg:hidden">
              <h1 className="text-lg font-semibold text-gray-900">{APP_NAME}</h1>
            </div>

            {/* Desktop: Empty space or search bar can go here */}
            <div className="hidden lg:flex lg:flex-1 lg:items-center">
              {/* Future: Add search bar or breadcrumbs here */}
            </div>

            {/* User menu - Both mobile and desktop */}
            <div className="flex items-center">
              {/* Profile dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  className="flex items-center gap-x-2 rounded-full bg-white px-3 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                >
                  <div className="flex items-center gap-x-2">
                    <div className="h-8 w-8 rounded-full bg-primary-600 flex items-center justify-center">
                      <span className="text-sm font-medium text-white">
                        {(user.company_name || user.email).charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="hidden lg:block text-sm font-medium text-gray-700">
                      {user.company_name || user.email.split('@')[0]}
                    </span>
                    <ChevronDownIcon
                      className={clsx(
                        'h-5 w-5 text-gray-400 transition-transform',
                        profileDropdownOpen && 'transform rotate-180'
                      )}
                    />
                  </div>
                </button>

                {/* Dropdown menu */}
                {profileDropdownOpen && (
                  <div className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                    <div className="py-1">
                      {/* User info */}
                      <div className="px-4 py-3 border-b border-gray-200">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {user.company_name || 'User'}
                        </p>
                        <p className="text-sm text-gray-500 truncate">{user.email}</p>
                      </div>

                      {/* Menu items */}
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          navigate(ROUTES.PROFILE);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                      >
                        <UserCircleIcon className="h-5 w-5 mr-3 text-gray-400" />
                        Profile Settings
                      </button>

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          navigate(ROUTES.API_KEYS);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center"
                      >
                        <KeyIcon className="h-5 w-5 mr-3 text-gray-400" />
                        API Keys
                      </button>

                      <div className="border-t border-gray-200"></div>

                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          logout();
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50 flex items-center"
                      >
                        <ArrowRightOnRectangleIcon className="h-5 w-5 mr-3 text-red-600" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <main className="flex-1">
          <div className="py-6">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
};
