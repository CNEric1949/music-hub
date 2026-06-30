export const coverResult = (url, { source, sourceType, provider, fallback = false, raw = null } = {}) => ({
  url: normalizeCoverUrl(url),
  source,
  sourceType,
  provider,
  fallback,
  raw
});

export const normalizeCoverUrl = url => {
  if (!url) return '';
  const text = String(url).trim();
  if (!text) return '';
  if (text.startsWith('//')) return `https:${text}`;
  return text;
};

export const coverFailure = (stage, error) => ({
  stage,
  message: error?.message || String(error)
});

export const firstCover = (...items) => items.find(item => item?.url);
