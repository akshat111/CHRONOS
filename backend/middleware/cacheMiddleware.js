class SimpleCache {
    constructor() {
        this.cache = new Map();
    }
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        const now = Date.now();
        if (now > item.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return item.data;
    }
    set(key, data, ttlMs) {
        this.cache.set(key, {
            data,
            expiresAt: Date.now() + ttlMs
        });
    }
    delete(key) {
        this.cache.delete(key);
    }
    clear() {
        this.cache.clear();
    }
    size() {
        return this.cache.size;
    }
    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiresAt) {
                this.cache.delete(key);
            }
        }
    }
}

// Create singleton instance
const cache = new SimpleCache();

// Cleanup expired entries every 5 minutes
setInterval(() => {
    cache.cleanup();
}, 300000);

const cacheMiddleware = (ttlSeconds = 30, keyGenerator = null) => {
    return (req, res, next) => {
        // Generate cache key
        const cacheKey = keyGenerator
            ? keyGenerator(req)
            : `${req.method}:${req.originalUrl}`;

        // Try to get from cache
        const cachedData = cache.get(cacheKey);
        if (cachedData) {
            // Add cache hit header
            res.set('X-Cache', 'HIT');
            return res.json(cachedData);
        }

        // Cache miss - store original res.json
        const originalJson = res.json.bind(res);

        // Override res.json to cache the response
        res.json = (data) => {
            // Only cache successful responses
            if (res.statusCode >= 200 && res.statusCode < 300) {
                cache.set(cacheKey, data, ttlSeconds * 1000);
            }

            // Add cache miss header
            res.set('X-Cache', 'MISS');
            return originalJson(data);
        };

        next();
    };
};

const clearCache = (pattern) => {
    if (pattern) {
        for (const key of cache.cache.keys()) {
            if (key.includes(pattern)) {
                cache.delete(key);
            }
        }
    } else {
        cache.clear();
    }
};

module.exports = {
    cache,
    cacheMiddleware,
    clearCache
};
