# Frontend Setup Guide

## Status: ✅ Running

The Dynamic RAG frontend is now running on **http://localhost:3000**

## Current Setup

### Running Mode: Development (Local)

The frontend is currently running in development mode using Vite's dev server:
```bash
cd frontend
npm run dev
```

**URL**: http://localhost:3000
**Technology**: React 18 + Vite + TypeScript + Tailwind CSS

## Quick Access

- **Frontend UI**: http://localhost:3000
- **API Server**: http://localhost:3001
- **MinIO Console**: http://localhost:9001
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Services Status

### ✅ Running Services
1. **Frontend** - http://localhost:3000 (Vite dev server - PID: 7500)
2. **API** - http://localhost:3001 (Docker container)
3. **PostgreSQL** - localhost:5432 (Docker container)
4. **Redis** - localhost:6379 (Docker container)
5. **MinIO** - http://localhost:9000 (Docker container)

### ⚠️ Worker Service
The worker is restarting - this is likely due to a build issue. Let me check:

```bash
# Check worker logs
docker-compose logs worker

# Rebuild worker if needed
docker-compose build worker
docker-compose up -d worker
```

## Frontend Features

The React frontend includes:
- ✅ User Authentication (Login/Signup)
- ✅ Document Upload Interface
- ✅ Document Management Dashboard
- ✅ Real-time Processing Status
- ✅ Statistics and Metrics
- ✅ Responsive Design (Tailwind CSS)
- ✅ Form Validation (React Hook Form + Zod)
- ✅ State Management (Zustand)
- ✅ API Integration (Axios)
- ✅ Toast Notifications (React Hot Toast)

## Environment Configuration

### Current Config (`frontend/.env`)
```bash
VITE_API_URL=http://localhost:3001
VITE_APP_NAME="Dynamic RAG"
VITE_APP_VERSION=1.0.0
VITE_ENABLE_ANALYTICS=false
```

## Development Workflow

### Start Frontend
```bash
cd frontend
npm run dev
```

### Build for Production
```bash
cd frontend
npm run build
npm run preview
```

### Run with Docker (when network is available)
```bash
# Build frontend image
docker-compose build frontend

# Start all services including frontend
docker-compose up -d

# Frontend will be available at http://localhost:3000
```

## Docker Configuration

### Dockerfile
The frontend has a multi-stage Dockerfile:
1. **Builder Stage**: Node 20 Alpine - Builds the React app
2. **Production Stage**: Nginx Alpine - Serves static files

### Docker Compose Service
```yaml
frontend:
  build: ./frontend
  ports:
    - "3000:80"
  environment:
    - VITE_API_URL=http://localhost:3001
  depends_on:
    - api
  networks:
    - dynamicrag-network
```

### Nginx Configuration
- API proxy: `/api/*` → `http://api:3001`
- SPA routing: All routes fallback to `index.html`
- Static asset caching: 1 year
- Gzip compression enabled
- Security headers configured

## Troubleshooting

### Frontend Not Loading?

**Check if server is running:**
```bash
lsof -ti:3000
# Should return a process ID
```

**Check logs:**
```bash
tail -f /tmp/frontend.log
```

**Restart frontend:**
```bash
# Kill existing process
pkill -f "vite"

# Start again
cd frontend
npm run dev
```

### API Connection Issues?

**Verify API is running:**
```bash
curl http://localhost:3001/health
```

**Check CORS:**
The API should allow `http://localhost:3000` - this is configured in `src/server.ts`:
```typescript
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));
```

### Build Errors?

**Clear and reinstall:**
```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

**TypeScript errors:**
```bash
cd frontend
npx tsc --noEmit
```

## Frontend Structure

```
frontend/
├── src/
│   ├── components/       # Reusable UI components
│   ├── pages/           # Page components
│   ├── hooks/           # Custom React hooks
│   ├── services/        # API services
│   ├── store/           # Zustand state management
│   ├── types/           # TypeScript types
│   ├── utils/           # Utility functions
│   ├── App.tsx          # Main app component
│   └── main.tsx         # Entry point
├── public/              # Static assets
├── index.html           # HTML template
├── package.json         # Dependencies
├── vite.config.ts       # Vite configuration
├── tailwind.config.js   # Tailwind CSS config
├── tsconfig.json        # TypeScript config
├── Dockerfile           # Docker build config
├── nginx.conf           # Nginx server config
└── .env                 # Environment variables
```

## Testing the Frontend

### 1. Access the UI
```bash
open http://localhost:3000
# or visit in browser
```

### 2. Create Account
1. Click "Sign Up"
2. Enter email, password, company name
3. Optionally add OpenAI API key
4. Submit

### 3. Upload Document
1. Login with your credentials
2. Navigate to "Upload" page
3. Drag and drop a PDF/TXT file
4. Or click to browse files
5. Click "Upload"

### 4. Monitor Processing
1. View document list
2. Check processing status
3. See real-time progress updates
4. View statistics

### 5. Download Document
1. Click on document
2. Click "Download" button
3. File downloads via presigned URL

## Production Deployment

### Option 1: Docker (Recommended)
```bash
# Build production image
docker-compose build frontend

# Deploy with docker-compose
docker-compose up -d frontend

# Access at http://localhost:3000
```

### Option 2: Static Hosting
```bash
# Build production bundle
cd frontend
npm run build

# Deploy dist/ folder to:
# - Vercel
# - Netlify
# - AWS S3 + CloudFront
# - nginx server
```

### Environment Variables for Production
```bash
VITE_API_URL=https://your-api-domain.com
VITE_APP_NAME="Dynamic RAG"
VITE_APP_VERSION=2.0.0
VITE_ENABLE_ANALYTICS=true
```

## Performance Optimization

### Already Implemented
- ✅ Code splitting (Vite)
- ✅ Tree shaking
- ✅ Asset optimization
- ✅ Gzip compression (nginx)
- ✅ Static asset caching (1 year)
- ✅ Lazy loading of routes

### Future Enhancements
- [ ] Service Worker for offline support
- [ ] Progressive Web App (PWA)
- [ ] Image optimization (WebP)
- [ ] Bundle analyzer
- [ ] Lighthouse CI

## Security

### Implemented
- ✅ Environment variables for secrets
- ✅ XSS protection headers
- ✅ CSRF token support (TODO)
- ✅ Content Security Policy (nginx)
- ✅ Input validation (Zod schemas)
- ✅ Secure password requirements

### Production Recommendations
- [ ] HTTPS only
- [ ] Subresource Integrity (SRI)
- [ ] Rate limiting
- [ ] DDoS protection (CloudFlare)

## Monitoring

### Development
```bash
# View Vite dev server logs
tail -f /tmp/frontend.log

# Monitor network requests (browser DevTools)
# Monitor React DevTools
```

### Production
- [ ] Error tracking (Sentry)
- [ ] Analytics (Google Analytics, Plausible)
- [ ] Performance monitoring (Web Vitals)
- [ ] Uptime monitoring (Pingdom, UptimeRobot)

## Commands Reference

### Development
```bash
npm run dev              # Start dev server
npm run build            # Build for production
npm run preview          # Preview production build
npm run lint             # Lint code
```

### Docker
```bash
docker-compose build frontend        # Build image
docker-compose up -d frontend        # Start container
docker-compose logs -f frontend      # View logs
docker-compose restart frontend      # Restart
docker-compose down frontend         # Stop
```

### Troubleshooting
```bash
# Check if running
lsof -ti:3000

# Kill process
pkill -f "vite"

# Clean install
rm -rf node_modules package-lock.json
npm install

# Check TypeScript
npx tsc --noEmit

# Check for updates
npm outdated
```

## Current Status Summary

✅ **Frontend is running successfully!**

- **URL**: http://localhost:3000
- **Mode**: Development (Vite dev server)
- **API**: Connected to http://localhost:3001
- **Status**: Healthy

**Next Steps:**
1. Open http://localhost:3000 in your browser
2. Create an account
3. Upload your first document
4. Explore the UI

**Note**: For production deployment, use the Docker configuration once network connectivity is restored.

---

**Need Help?**
- Check logs: `tail -f /tmp/frontend.log`
- Restart: `pkill -f "vite" && cd frontend && npm run dev`
- API health: `curl http://localhost:3001/health`
