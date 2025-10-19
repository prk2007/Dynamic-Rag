export interface ApiError {
  error: string;
  message: string;
  errors?: string[];
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}
