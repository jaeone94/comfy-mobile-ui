import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const EXTENSION_DIR = path.join(PROJECT_ROOT, 'comfy-mobile-ui-api-extension');
const WEB_TARGET_DIR = path.join(EXTENSION_DIR, 'web');
const DEPLOY_DIR = path.join(PROJECT_ROOT, 'deploy');
const TEMP_DIR = path.join(PROJECT_ROOT, 'temp_deploy');

console.log('🚀 Starting Advanced Deployment Process...');

/**
 * Utility to copy folder recursively
 */
function copyFolderSync(from, to) {
    if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(element => {
        const fromPath = path.join(from, element);
        const toPath = path.join(to, element);
        const stat = fs.lstatSync(fromPath);
        if (stat.isFile()) {
            fs.copyFileSync(fromPath, toPath);
        } else if (stat.isDirectory()) {
            copyFolderSync(fromPath, toPath);
        }
    });
}

try {
    // 1. Verify dist exists
    if (!fs.existsSync(DIST_DIR)) {
        console.error('❌ Error: dist directory not found. Run "npm run build" first.');
        process.exit(1);
    }

    // 2. Sync Frontend to Extension (web)
    console.log(`📦 Syncing Frontend build to ${WEB_TARGET_DIR}...`);
    if (fs.existsSync(WEB_TARGET_DIR)) {
        fs.rmSync(WEB_TARGET_DIR, { recursive: true, force: true });
    }
    copyFolderSync(DIST_DIR, WEB_TARGET_DIR);

    // 3. Parse Version from Extension
    const versionFile = path.join(EXTENSION_DIR, 'version.json');
    if (!fs.existsSync(versionFile)) {
        throw new Error('version.json not found in extension directory');
    }
    const versionData = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
    const version = versionData.version || 'unknown';
    console.log(`🏷️  Detected Version: v${version}`);

    // 4. Prepare Temp Structure for Zipping
    // Structure: temp_deploy/comfy-mobile-ui-api-extension/...
    console.log('🏗️  Preparing packaging structure...');
    if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    const innerTempDir = path.join(TEMP_DIR, 'comfy-mobile-ui-api-extension');
    fs.mkdirSync(innerTempDir, { recursive: true });

    // Copy everything from extension dir to temp (excluding git/backups)
    const exclude = ['.git', '__pycache__', '.update_staging', 'watchdog.log', 'comfyui_output.log'];
    fs.readdirSync(EXTENSION_DIR).forEach(item => {
        if (!exclude.includes(item)) {
            const src = path.join(EXTENSION_DIR, item);
            const dest = path.join(innerTempDir, item);
            if (fs.lstatSync(src).isDirectory()) {
                copyFolderSync(src, dest);
            } else {
                fs.copyFileSync(src, dest);
            }
        }
    });

    // 5. Create Deployment Directory
    if (!fs.existsSync(DEPLOY_DIR)) fs.mkdirSync(DEPLOY_DIR, { recursive: true });

    // 6. Zip using tar (available in modern Windows, more robust than Compress-Archive)
    const finalZipName = `comfy-mobile-ui-api-extension-v${version}.zip`;
    const zipPath = path.join(DEPLOY_DIR, finalZipName);

    console.log(`🗜️  Compressing into ${finalZipName}... using tar`);

    // Remove existing zip if any
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    // tar Command: -a (auto-zip), -c (create), -f (file), -C (change dir to temp)
    const tarCommand = `tar -a -c -f "${zipPath}" -C "${TEMP_DIR}" "comfy-mobile-ui-api-extension"`;
    execSync(tarCommand, { stdio: 'inherit' });

    // 7. Generate SHA256 Hash
    console.log('🛡️  Generating SHA256 hash...');
    const fileBuffer = fs.readFileSync(zipPath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const hex = hashSum.digest('hex');
    const hashPath = `${zipPath}.sha256`;
    fs.writeFileSync(hashPath, hex);
    console.log(`📄 Hash saved to: ${path.basename(hashPath)}`);

    // 8. Cleanup
    console.log('🧹 Cleaning up temporary files...');
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });

    console.log(`\n✅ SUCCESSFULLY DEPLOYED: ${zipPath}`);
} catch (err) {
    console.error('❌ Deployment failed:', err);
    // Cleanup on failure
    if (fs.existsSync(TEMP_DIR)) fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    process.exit(1);
}
