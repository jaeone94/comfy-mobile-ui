/**
 * API Key Storage Service - Secure storage for API keys using IndexedDB
 * 
 * Features:
 * - Encrypted storage (basic obfuscation)
 * - Multiple provider support (Civitai, HuggingFace, etc.)
 * - Secure retrieval and validation
 */

const DB_NAME = 'ComfyMobileUI';
const DB_VERSION = 3; // Match IndexedDBWorkflowService version
const API_KEYS_STORE = 'apiKeys';

export interface ApiKeyData {
  provider: string; // 'civitai', 'huggingface', etc.
  keyValue: string; // The actual API key (will be obfuscated)
  displayName?: string; // User-friendly name
  createdAt: string;
  lastUsed?: string;
  isActive: boolean;
}

interface StoredApiKey extends ApiKeyData {
  id: string;
}

class ApiKeyStorageService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB connection with API keys store
   */
  private async init(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;
        
        // Create workflows store if it doesn't exist (for backward compatibility with IndexedDBWorkflowService)
        if (!db.objectStoreNames.contains('workflows')) {
          const workflowStore = db.createObjectStore('workflows', { keyPath: 'id' });
          workflowStore.createIndex('name', 'name', { unique: false });
          workflowStore.createIndex('createdAt', 'createdAt', { unique: false });
          workflowStore.createIndex('modifiedAt', 'modifiedAt', { unique: false });
          workflowStore.createIndex('author', 'author', { unique: false });
          workflowStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
          workflowStore.createIndex('sortOrder', 'sortOrder', { unique: false });
          console.log('✅ Created workflows object store with all indexes');
        } else if (oldVersion < 3) {
          // Upgrade existing workflows store to version 3 if needed
          const transaction = (event.target as IDBOpenDBRequest).transaction!;
          const workflowStore = transaction.objectStore('workflows');
          
          if (!workflowStore.indexNames.contains('sortOrder')) {
            workflowStore.createIndex('sortOrder', 'sortOrder', { unique: false });
            console.log('✅ Added sortOrder index to existing workflows store');
          }
          if (!workflowStore.indexNames.contains('modifiedAt')) {
            workflowStore.createIndex('modifiedAt', 'modifiedAt', { unique: false });
            console.log('✅ Added modifiedAt index to workflows store');
          }
          if (!workflowStore.indexNames.contains('author')) {
            workflowStore.createIndex('author', 'author', { unique: false });
            console.log('✅ Added author index to workflows store');
          }
          if (!workflowStore.indexNames.contains('tags')) {
            workflowStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
            console.log('✅ Added tags index to workflows store');
          }
        }

        // Create API keys store if it doesn't exist
        if (!db.objectStoreNames.contains(API_KEYS_STORE)) {
          const apiKeyStore = db.createObjectStore(API_KEYS_STORE, { keyPath: 'id' });
          apiKeyStore.createIndex('provider', 'provider', { unique: false });
          apiKeyStore.createIndex('isActive', 'isActive', { unique: false });
          console.log('✅ Created apiKeys object store with indexes');
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
    });

    return this.initPromise;
  }

  /**
   * Simple obfuscation for API keys (not encryption, but better than plain text)
   */
  private obfuscate(text: string): string {
    return btoa(text.split('').reverse().join(''));
  }

  /**
   * Deobfuscate API keys
   */
  private deobfuscate(obfuscated: string): string {
    try {
      return atob(obfuscated).split('').reverse().join('');
    } catch {
      return obfuscated; // Fallback for non-obfuscated keys
    }
  }

  /**
   * Store an API key
   */
  async storeApiKey(provider: string, keyValue: string, displayName?: string): Promise<boolean> {
    try {
      await this.init();
      if (!this.db) throw new Error('Database not initialized');

      // Deactivate existing keys for this provider
      await this.deactivateProvider(provider);

      const apiKey: StoredApiKey = {
        id: `${provider}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        provider,
        keyValue: this.obfuscate(keyValue),
        displayName: displayName || `${provider} API Key`,
        createdAt: new Date().toISOString(),
        isActive: true
      };

      const transaction = this.db.transaction([API_KEYS_STORE], 'readwrite');
      const store = transaction.objectStore(API_KEYS_STORE);
      
      return new Promise((resolve, reject) => {
        const request = store.add(apiKey);
        
        request.onsuccess = () => {
          console.log(`✅ API key stored for provider: ${provider}`);
          resolve(true);
        };
        
        request.onerror = () => {
          console.error('❌ Failed to store API key:', request.error);
          reject(false);
        };
      });

    } catch (error) {
      console.error('❌ Error storing API key:', error);
      return false;
    }
  }

  /**
   * Retrieve an API key for a provider
   */
  async getApiKey(provider: string): Promise<string | null> {
    try {
      await this.init();
      if (!this.db) throw new Error('Database not initialized');

      const transaction = this.db.transaction([API_KEYS_STORE], 'readonly');
      const store = transaction.objectStore(API_KEYS_STORE);
      const index = store.index('provider');

      return new Promise((resolve, reject) => {
        const request = index.getAll(provider);
        
        request.onsuccess = () => {
          const keys = request.result as StoredApiKey[];
          const activeKey = keys.find(key => key.isActive);
          
          if (activeKey) {
            // Update last used timestamp
            this.updateLastUsed(activeKey.id);
            resolve(this.deobfuscate(activeKey.keyValue));
          } else {
            resolve(null);
          }
        };
        
        request.onerror = () => {
          console.error('❌ Failed to retrieve API key:', request.error);
          reject(null);
        };
      });

    } catch (error) {
      console.error('❌ Error retrieving API key:', error);
      return null;
    }
  }

  /**
   * Get all stored API keys (without the actual key values)
   */
  async getAllApiKeys(): Promise<Omit<StoredApiKey, 'keyValue'>[]> {
    try {
      await this.init();
      if (!this.db) throw new Error('Database not initialized');

      const transaction = this.db.transaction([API_KEYS_STORE], 'readonly');
      const store = transaction.objectStore(API_KEYS_STORE);

      return new Promise((resolve, reject) => {
        const request = store.getAll();
        
        request.onsuccess = () => {
          const keys = request.result as StoredApiKey[];
          // Remove actual key values for security
          const safeKeys = keys.map(({ keyValue, ...rest }) => {
            const actualKey = this.deobfuscate(keyValue);
            return {
              ...rest,
              maskedKey: actualKey.length > 8
                ? `${actualKey.substring(0, 4)}••••${actualKey.substring(actualKey.length - 4)}`
                : '••••••••'
            };
          });
          resolve(safeKeys);
        };
        
        request.onerror = () => {
          console.error('❌ Failed to retrieve API keys:', request.error);
          reject([]);
        };
      });

    } catch (error) {
      console.error('❌ Error retrieving all API keys:', error);
      return [];
    }
  }

  /**
   * Delete an API key
   */
  async deleteApiKey(keyId: string): Promise<boolean> {
    try {
      await this.init();
      if (!this.db) throw new Error('Database not initialized');

      const transaction = this.db.transaction([API_KEYS_STORE], 'readwrite');
      const store = transaction.objectStore(API_KEYS_STORE);

      return new Promise((resolve, reject) => {
        const request = store.delete(keyId);
        
        request.onsuccess = () => {
          console.log(`✅ API key deleted: ${keyId}`);
          resolve(true);
        };
        
        request.onerror = () => {
          console.error('❌ Failed to delete API key:', request.error);
          reject(false);
        };
      });

    } catch (error) {
      console.error('❌ Error deleting API key:', error);
      return false;
    }
  }

  /**
   * Deactivate all API keys for a provider (used when adding new key)
   */
  private async deactivateProvider(provider: string): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction([API_KEYS_STORE], 'readwrite');
    const store = transaction.objectStore(API_KEYS_STORE);
    const index = store.index('provider');

    return new Promise((resolve) => {
      const request = index.getAll(provider);
      
      request.onsuccess = () => {
        const keys = request.result as StoredApiKey[];
        let updateCount = 0;
        
        if (keys.length === 0) {
          resolve();
          return;
        }

        keys.forEach(key => {
          if (key.isActive) {
            key.isActive = false;
            const updateRequest = store.put(key);
            updateRequest.onsuccess = () => {
              updateCount++;
              if (updateCount === keys.filter(k => k.isActive).length) {
                resolve();
              }
            };
          }
        });
        
        if (keys.filter(k => k.isActive).length === 0) {
          resolve();
        }
      };
      
      request.onerror = () => {
        resolve(); // Continue even if deactivation fails
      };
    });
  }

  /**
   * Update last used timestamp
   */
  private async updateLastUsed(keyId: string): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction([API_KEYS_STORE], 'readwrite');
    const store = transaction.objectStore(API_KEYS_STORE);

    const getRequest = store.get(keyId);
    getRequest.onsuccess = () => {
      const key = getRequest.result as StoredApiKey;
      if (key) {
        key.lastUsed = new Date().toISOString();
        store.put(key);
      }
    };
  }

  /**
   * Test if an API key is valid (basic format check)
   */
  validateApiKey(provider: string, keyValue: string): boolean {
    switch (provider.toLowerCase()) {
      case 'civitai':
        // Civitai API keys are typically 32+ character hex strings
        return /^[a-f0-9]{32,}$/i.test(keyValue);
      case 'huggingface':
        // HuggingFace tokens start with 'hf_'
        return keyValue.startsWith('hf_') && keyValue.length > 10;
      case 'groq':
        // Groq secret keys start with 'gsk_'
        return /^gsk_[A-Za-z0-9_-]{16,}$/.test(keyValue);
      case 'deepl':
        // DeepL Free keys end in ':fx'; Pro keys use the same base format without it.
        return /^[A-Za-z0-9_-]{20,}(?::fx)?$/.test(keyValue);
      default:
        // Generic validation - at least 8 characters
        return keyValue.length >= 8;
    }
  }
}

// Create singleton instance
export const apiKeyStorage = new ApiKeyStorageService();

// Export commonly used functions
export const storeApiKey = (provider: string, keyValue: string, displayName?: string) => 
  apiKeyStorage.storeApiKey(provider, keyValue, displayName);

export const getApiKey = (provider: string) => 
  apiKeyStorage.getApiKey(provider);

export const getAllApiKeys = () => 
  apiKeyStorage.getAllApiKeys();

export const deleteApiKey = (keyId: string) => 
  apiKeyStorage.deleteApiKey(keyId);

export const validateApiKey = (provider: string, keyValue: string) => 
  apiKeyStorage.validateApiKey(provider, keyValue);
