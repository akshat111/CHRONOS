/**
 * Cache Middleware
 * 
 * Simple in-memory caching for expensive API endpoints.
 * Reduces database load and improves response times in production.
 */

class SimpleCache {
    constructor() {
        this.cache = new Map();
    }

    /**
     * Get cached value if not expired
     */
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

    /**
     * Set cache value with TTL (time to live)
     */
    set(key, data, ttlMs) {
        this.cache.set(key, {
            data,
            expiresAt: Date.now() + ttlMs
        });
    }

    /**
     * Clear specific key
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Clear all cache
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Get cache size
     */
    size() {
        return this.cache.size;
    }

    /**
     * Clean expired entries
     */
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

/**
 * Cache middleware factory
 * 
 * @param {number} ttlSeconds - Time to live in seconds
 * @param {function} keyGenerator - Optional function to generate cache key from req
 */
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

/**
 * Clear cache for specific pattern
 */
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
