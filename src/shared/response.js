export const ok = data => ({ ok: true, data });

export const partialOk = (data, warnings = []) => ({
  ok: true,
  data,
  warnings
});
