# Railway Deployment Guide - CHRONOS

## Railway क्या है?
Railway एक cloud platform है जहाँ आप long-running Node.js apps deploy कर सकते हैं। Vercel के मुक़ाबले यहाँ:
- ✅ Background workers चल सकते हैं
- ✅ Jobs automatically execute होंगे
- ✅ MongoDB connection stable रहेगा
- ✅ $5 free credit हर month

## Deployment Steps

### 1. Railway Account बनाएं
1. https://railway.app पर जाएं
2. **Login with GitHub** करें
3. Free tier select करें

### 2. Backend Deploy करें

#### Option A: GitHub से Deploy (Recommended)
1. Railway Dashboard → **New Project**
2. **Deploy from GitHub repo** चुनें
3. `akshat111/CHRONOS` repository select करें
4. **Add variables:**
   ```
   MONGODB_URI=mongodb+srv://kakshat111_db_user:15876521@chronos.8tbkopx.mongodb.net/chronos?retryWrites=true&w=majority&appName=CHRONOS
   JWT_SECRET=chronos_secret_key_2024
   JWT_EXPIRES_IN=7d
   FRONTEND_URL=http://localhost:3000
   NODE_ENV=production
   PORT=5000
   ```
5. **Settings** → **Root Directory** = `backend`
6. **Deploy**

#### Railway Deploy होने के बाद:
1. **Settings** → **Networking** → **Generate Domain**
2. Backend URL copy करें (jaise: `chronos-backend-production.up.railway.app`)

### 3. Frontend Deploy करें (Vercel पर)

1. Vercel Dashboard → **New Project**
2. `akshat111/CHRONOS` import करें
3. **Settings:**
   - Root Directory: `frontend`
   - Framework: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. **Environment Variables:**
   ```
   VITE_API_URL=https://your-railway-backend-url.railway.app
   ```
   (Railway से मिला हुआ URL डालें)
5. **Deploy**

### 4. CORS Update करें

1. **Railway Backend** → **Variables** tab
2. `FRONTEND_URL` edit करें:
   ```
   FRONTEND_URL=https://your-vercel-frontend.vercel.app
   ```
3. Save करते ही automatic redeploy होगा

## Testing

1. Frontend URL खोलें
2. Signup करें
3. Job create करें
4. Dashboard check करें - job **automatically execute** होगा! 🎉

## Railway के Fayde

✅ **WorkerService काम करेगी** - Jobs automatically चलेंगे  
✅ **Scheduled jobs execute** होंगे  
✅ **Logs real-time** दिखेंगे  
✅ **Free tier** - $5/month credit  
✅ **Easy deployment** - GitHub connect करके

## Cost

- Free tier: $5 credit/month
- Usually enough for small projects
- Only pay if you exceed free tier

## Troubleshooting

**MongoDB Connection Failed:**
- Railway dashboard → Logs देखें
- `MONGODB_URI` check करें

**Jobs Not Running:**
- Logs में `[WorkerService] Started` दिखना चाहिए
- `DISABLE_WORKER` variable नहीं होना चाहिए

**CORS Error:**
- `FRONTEND_URL` में exact Vercel URL डालें
- `https://` include करें

## अगला Step

Railway पर deploy करके बताएं! Main help करूंगा अगर कोई issue आये 🚀
