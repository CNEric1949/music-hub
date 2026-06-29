export const normalizeKeyword = (...parts) => parts
  .filter(part => part != null && String(part).trim())
  .map(part => String(part).trim())
  .join(' ');

export const formatPlayTime = seconds => {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return '00:00';
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const parseIntervalSeconds = interval => {
  if (!interval) return 0;
  if (typeof interval === 'number') return interval;
  const parts = String(interval).split(':').map(part => Number(part));
  if (parts.some(part => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
};

export const filterCompareText = value => String(value ?? '')
  .replace(/\s|'|\.|,|，|&|"|、|\(|\)|（|）|`|~|-|<|>|\||\/|\]|\[|!|！/g, '')
  .toLowerCase();

export const splitSingers = singer => String(singer ?? '')
  .split(/、|&|;|；|\/|,|，|\|/)
  .map(part => part.trim())
  .filter(Boolean)
  .sort((a, b) => a.localeCompare(b))
  .join('、');

export const sanitizeFileName = name => String(name || 'download')
  .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 180) || 'download';

export const extForQuality = quality => {
  switch (quality) {
    case 'flac':
    case 'flac24bit':
      return 'flac';
    case 'wav':
      return 'wav';
    case 'ape':
      return 'ape';
    default:
      return 'mp3';
  }
};
