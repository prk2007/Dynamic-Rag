import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { API_ENDPOINTS, ROUTES } from '../../utils/constants';
import api from '../../services/api';
import toast from 'react-hot-toast';

export const UploadPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<'file' | 'url'>('file');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      if (!title) {
        setTitle(e.dataTransfer.files[0].name);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      if (!title) {
        setTitle(e.target.files[0].name);
      }
    }
  };

  const handleFileUpload = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    if (title) formData.append('title', title);

    try {
      await api.post(API_ENDPOINTS.DOCUMENTS.UPLOAD, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      toast.success('Document uploaded successfully and queued for processing');
      navigate(ROUTES.DOCUMENTS);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.response?.data?.message || 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const handleUrlUpload = async () => {
    if (!url) {
      toast.error('Please enter a URL');
      return;
    }

    setUploading(true);

    try {
      await api.post(API_ENDPOINTS.DOCUMENTS.UPLOAD_URL, {
        url,
        title: title || undefined,
      });
      toast.success('URL queued for processing');
      navigate(ROUTES.DOCUMENTS);
    } catch (error: any) {
      console.error('URL upload error:', error);
      toast.error(error.message || 'Failed to process URL');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadMode === 'file') {
      handleFileUpload();
    } else {
      handleUrlUpload();
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Upload Document</h1>
        <p className="mt-1 text-sm text-gray-600">
          Add documents to your knowledge base for semantic search
        </p>
      </div>

      {/* Upload Mode Toggle */}
      <div className="flex space-x-2 border-b border-gray-200">
        <button
          onClick={() => setUploadMode('file')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            uploadMode === 'file'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          File Upload
        </button>
        <button
          onClick={() => setUploadMode('url')}
          className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
            uploadMode === 'url'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          From URL
        </button>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <div className="space-y-6">
            {uploadMode === 'file' ? (
              <>
                {/* File Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Document File
                  </label>
                  <div
                    className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                      dragActive
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileChange}
                      accept=".pdf,.txt,.html,.htm,.md,.markdown"
                      className="hidden"
                    />

                    {file ? (
                      <div className="space-y-2">
                        <svg
                          className="mx-auto h-12 w-12 text-green-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="text-sm font-medium text-gray-900">{file.name}</p>
                        <p className="text-xs text-gray-500">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </p>
                        <button
                          type="button"
                          onClick={() => setFile(null)}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <svg
                          className="mx-auto h-12 w-12 text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                          />
                        </svg>
                        <div className="text-sm text-gray-600">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="font-medium text-primary-600 hover:text-primary-500"
                          >
                            Click to upload
                          </button>{' '}
                          or drag and drop
                        </div>
                        <p className="text-xs text-gray-500">
                          PDF, TXT, HTML, or MD (max 50MB)
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* URL Upload */}
                <Input
                  label="Document URL"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/document"
                  required
                  helperText="Enter the URL of a web page or document to process"
                />
              </>
            )}

            {/* Title */}
            <Input
              label="Title (optional)"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Custom title for this document"
            />

            {/* Info Box */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex">
                <svg
                  className="h-5 w-5 text-blue-400 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    Processing Information
                  </h3>
                  <div className="mt-2 text-sm text-blue-700">
                    <ul className="list-disc list-inside space-y-1">
                      <li>Your document will be processed in the background</li>
                      <li>Text will be chunked and embedded for semantic search</li>
                      <li>Processing time depends on document size (typically 2-30 seconds)</li>
                      <li>You can monitor the status from the Documents page</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end space-x-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(ROUTES.DOCUMENTS)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={uploading || (uploadMode === 'file' && !file)}>
                {uploading ? 'Uploading...' : 'Upload & Process'}
              </Button>
            </div>
          </div>
        </Card>
      </form>
    </div>
  );
};
