import fs from 'node:fs/promises';
import path from 'node:path';

export const pathExists = async target => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

export const ensureDir = async dir => {
  await fs.mkdir(dir, { recursive: true });
};

export const readJsonFile = async (filePath, fallback = null) => {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
};

export const writeJsonFile = async (filePath, data) => {
  await ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tempPath, filePath);
};

export const safeJoin = (rootDir, ...parts) => {
  const root = path.resolve(rootDir);
  const target = path.resolve(root, ...parts);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path escapes root directory: ${target}`);
  }
  return target;
};
