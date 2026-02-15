export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  company_name?: string;
}

export interface AuthResponse {
  message: string;
  customer: Customer;
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface SignupResponse {
  message: string;
  customer: Customer;
}

export interface VerifyEmailResponse {
  success: boolean;
  message: string;
  email: string;
}

export interface Customer {
  id: string;
  email: string;
  company_name: string | null;
  api_key: string;
  status: 'pending_verification' | 'active' | 'suspended' | 'deleted';
  email_verified: boolean;
  created_at: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface ResendVerificationResponse {
  message: string;
  retryAfter?: string;
}
