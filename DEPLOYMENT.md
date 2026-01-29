# Vercel Deployment Guide

## Prerequisites
- GitHub account with CHRONOS repo
- Vercel account (free tier works)
- MongoDB Atlas cluster running

## Step 1: Deploy Backend

1. **Go to Vercel Dashboard** → New Project
2. **Import** `akshat111/CHRONOS` repository
3. **Configure Project:**
   - Framework Preset: Other
   - Root Directory: `backend`
   - Build Command: (leave empty)
   - Output Directory: (leave empty)
4. **Add Environment Variables:**
   ```
   MONGODB_URI=mongodb+srv://kakshat111_db_user:15876521@chronos.8tbkopx.mongodb.net/chronos?retryWrites=true&w=majority&appName=CHRONOS
   JWT_SECRET=chronos_secret_key_2024
   JWT_EXPIRES_IN=7d
   FRONTEND_URL=https://your-frontend.vercel.app
   NODE_ENV=production
   ```
5. **Deploy** and copy the backend URL

## Step 2: Deploy Frontend

1. **Vercel Dashboard** → New Project
2. **Import** same `akshat111/CHRONOS` repository again
3. **Configure Project:**
   - Framework Preset: Vite
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. **Add Environment Variables:**
   ```
   VITE_API_URL=https://your-backend.vercel.app
   ```
   (Replace with actual backend URL from Step 1)
5. **Deploy**

## Step 3: Update CORS

1. Go to Backend project in Vercel
2. **Settings** → **Environment Variables**
3. **Edit** `FRONTEND_URL` to your actual frontend URL:
   ```
   FRONTEND_URL=https://your-frontend.vercel.app
   ```
4. **Redeploy** backend (Deployments tab → Three dots → Redeploy)

## Testing

1. Visit your frontend URL
2. Sign up for an account
3. Create a test job
4. Check dashboard for stats
5. Verify job execution in logs

## Troubleshooting

**CORS Errors:**
- Verify `FRONTEND_URL` in backend matches your frontend domain
- Ensure both URLs use `https://`

**API Connection Failed:**
- Check `VITE_API_URL` in frontend settings
- Ensure backend is deployed and running

**MongoDB Connection:**
- Verify `MONGODB_URI` has correct credentials
- Check Atlas network access allows Vercel IPs (0.0.0.0/0)

## Important Notes

⚠️ Your `.env` file is currently in GitHub - anyone can see your MongoDB password. After deployment, consider:
1. Rotating MongoDB password
2. Using Vercel environment variables only
3. Removing `.env` from repo and adding to `.gitignore`
