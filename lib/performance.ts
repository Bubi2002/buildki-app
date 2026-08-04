/**
 * protoKI – Performance Optimierung
 * 
 * Utilities for:
 * - Image compression before storage
 * - Lazy loading helpers
 * - AsyncStorage batch operations
 * - Memory management
 * - Cache invalidation
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImageManipulator from "expo-image-manipulator";

// ─── Image Compression ───────────────────────────────────────────────────────

export interface CompressionOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
  format?: "jpeg" | "png";
}

const DEFAULT_COMPRESSION: CompressionOptions = {
  maxWidth: 1920,
  maxHeight: 1920,
  quality: 0.7,
  format: "jpeg",
};

/**
 * Compress an image for storage/upload
 * Reduces file size by 60-80% while maintaining visual quality
 */
export async function compressImage(
  uri: string,
  options: CompressionOptions = {}
): Promise<{ uri: string; width: number; height: number }> {
  const opts = { ...DEFAULT_COMPRESSION, ...options };

  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: opts.maxWidth, height: opts.maxHeight } }],
      {
        compress: opts.quality,
        format: opts.format === "png"
          ? ImageManipulator.SaveFormat.PNG
          : ImageManipulator.SaveFormat.JPEG,
      }
    );

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  } catch (error) {
    // If compression fails, return original
    console.warn("[Performance] Image compression failed, using original:", error);
    return { uri, width: 0, height: 0 };
  }
}

/**
 * Compress image for thumbnail (small preview)
 */
export async function createThumbnail(uri: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 200, height: 200 } }],
      { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri;
  }
}

// ─── AsyncStorage Batch Operations ───────────────────────────────────────────

/**
 * Batch get multiple keys at once (faster than individual gets)
 */
export async function batchGet<T>(keys: string[]): Promise<Map<string, T>> {
  const result = new Map<string, T>();
  try {
    const pairs = await AsyncStorage.multiGet(keys);
    for (const [key, value] of pairs) {
      if (value) {
        try {
          result.set(key, JSON.parse(value));
        } catch {
          // Skip malformed entries
        }
      }
    }
  } catch (error) {
    console.error("[Performance] Batch get failed:", error);
  }
  return result;
}

/**
 * Batch set multiple key-value pairs at once
 */
export async function batchSet(entries: [string, any][]): Promise<void> {
  try {
    const pairs: [string, string][] = entries.map(([key, value]) => [
      key,
      JSON.stringify(value),
    ]);
    await AsyncStorage.multiSet(pairs);
  } catch (error) {
    console.error("[Performance] Batch set failed:", error);
  }
}

// ─── Cache Management ────────────────────────────────────────────────────────

const CACHE_PREFIX = "cache_";
const CACHE_INDEX_KEY = "cache_index";

interface CacheEntry {
  key: string;
  expiresAt: number;
  size: number;
}

/**
 * Set a cached value with TTL
 */
export async function cacheSet(key: string, value: any, ttlMs: number = 3600000): Promise<void> {
  const cacheKey = `${CACHE_PREFIX}${key}`;
  const data = JSON.stringify(value);
  
  await AsyncStorage.setItem(cacheKey, data);
  
  // Update cache index (drop any prior entry for this key so it isn't duplicated)
  const index = (await getCacheIndex()).filter((e) => e.key !== cacheKey);
  index.push({
    key: cacheKey,
    expiresAt: Date.now() + ttlMs,
    size: data.length,
  });
  await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(index));
}

/**
 * Get a cached value (returns null if expired)
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const cacheKey = `${CACHE_PREFIX}${key}`;
  
  try {
    const index = await getCacheIndex();
    const entry = index.find(e => e.key === cacheKey);
    
    if (!entry || entry.expiresAt < Date.now()) {
      // Expired or not found
      await AsyncStorage.removeItem(cacheKey);
      return null;
    }
    
    const data = await AsyncStorage.getItem(cacheKey);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

/**
 * Clear expired cache entries
 */
export async function clearExpiredCache(): Promise<number> {
  const index = await getCacheIndex();
  const now = Date.now();
  const expired = index.filter(e => e.expiresAt < now);
  
  if (expired.length > 0) {
    const keys = expired.map(e => e.key);
    await AsyncStorage.multiRemove(keys);
    
    const remaining = index.filter(e => e.expiresAt >= now);
    await AsyncStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(remaining));
  }
  
  return expired.length;
}

/**
 * Get total cache size in bytes
 */
export async function getCacheSize(): Promise<number> {
  const index = await getCacheIndex();
  return index.reduce((sum, entry) => sum + entry.size, 0);
}

/**
 * Clear all cache
 */
export async function clearAllCache(): Promise<void> {
  const index = await getCacheIndex();
  const keys = index.map(e => e.key);
  if (keys.length > 0) {
    await AsyncStorage.multiRemove(keys);
  }
  await AsyncStorage.removeItem(CACHE_INDEX_KEY);
}

async function getCacheIndex(): Promise<CacheEntry[]> {
  try {
    const data = await AsyncStorage.getItem(CACHE_INDEX_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

// ─── Storage Size Monitoring ─────────────────────────────────────────────────

/**
 * Get approximate total AsyncStorage usage
 */
export async function getStorageUsage(): Promise<{
  totalKeys: number;
  estimatedSizeBytes: number;
  largestKeys: { key: string; size: number }[];
}> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const pairs = await AsyncStorage.multiGet(allKeys as string[]);
    
    let totalSize = 0;
    const keySizes: { key: string; size: number }[] = [];
    
    for (const [key, value] of pairs) {
      const size = (value || "").length * 2; // UTF-16 approximate
      totalSize += size;
      keySizes.push({ key, size });
    }
    
    keySizes.sort((a, b) => b.size - a.size);
    
    return {
      totalKeys: allKeys.length,
      estimatedSizeBytes: totalSize,
      largestKeys: keySizes.slice(0, 10),
    };
  } catch {
    return { totalKeys: 0, estimatedSizeBytes: 0, largestKeys: [] };
  }
}

// ─── Debounce & Throttle ─────────────────────────────────────────────────────

/**
 * Debounce function for search inputs, auto-save, etc.
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function for scroll handlers, frequent updates
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

// ─── Pagination Helper ───────────────────────────────────────────────────────

/**
 * Paginate an array for FlatList performance
 */
export function paginate<T>(items: T[], page: number, pageSize: number = 20): {
  data: T[];
  hasMore: boolean;
  totalPages: number;
} {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  return {
    data: items.slice(start, end),
    hasMore: end < items.length,
    totalPages: Math.ceil(items.length / pageSize),
  };
}
