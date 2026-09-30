// Multipart filenames arrive latin1-decoded.
//
// busboy decodes the `filename` parameter of Content-Disposition with no
// declared charset, so it reads the raw UTF-8 bytes one byte at a time. A
// Vietnamese name like "TĐ BÁO CÁO.xlsx" therefore reaches the app as
// "TÄ BÁO CÃ¡O.xlsx" — the diacritics are gone, not merely mis-rendered.
//
// That is not cosmetic here: doc-type detection is driven entirely by the
// filename ("shop" → shop_drawing, "TĐ" → construction_schedule, "báo cáo" →
// daily_report). Every Vietnamese-named workbook — which is to say all of the
// real demo sheets — classified as `unknown` and was rejected.
//
// multer 1.4.5 hardcodes `Busboy({ headers, limits, preservePath })` and
// exposes no `defParamCharset`, so this cannot be configured away. Recover the
// original text by re-encoding the latin1 string back to its bytes and reading
// those as UTF-8.
//
// Safety: a pure-ASCII name is unchanged; a name that was genuinely sent as
// latin1 does not round-trip into valid UTF-8 and is left alone. The U+FFFD
// check is what distinguishes the two.
export function decodeUploadName(name) {
  if (typeof name !== 'string' || !name) return name;
  // Fast path: pure ASCII cannot be mangled.
  if (!/[^\x00-\x7F]/.test(name)) return name;
  let recovered;
  try {
    recovered = Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
  // A replacement character means those bytes were not valid UTF-8, so the
  // sender really did mean latin1. Keep the original.
  if (recovered.includes('�')) return name;
  return recovered;
}

// Wraps a multer middleware so every parsed name is repaired after parsing.
// Doing it here rather than at each use site means a new upload route cannot
// forget it — the failure mode is silent, so it must not be per-call-site.
//
// Returns a multer-shaped object (callable, plus .single/.array/.fields/.none)
// so existing call sites such as `upload.array('photos', 20)` keep working
// unchanged while every method returns repaired middleware.
export function decodeUploadNames(multerInstance) {
  const wrap = (mw) => (req, res, next) => mw(req, res, (err) => {
    if (!err) {
      if (req.file) {
        req.file.originalname = decodeUploadName(req.file.originalname);
        if (req.file.originalname !== req.file.filename) {
          req.file.filename = req.file.originalname;
        }
      }
      if (Array.isArray(req.files)) {
        for (const f of req.files) {
          f.originalname = decodeUploadName(f.originalname);
          if (f.originalname !== f.filename) f.filename = f.originalname;
        }
      }
      // Folder uploads send the relative path as a form field; it carries the
      // same Vietnamese names.
      if (typeof req.body?.relative_path === 'string') {
        req.body.relative_path = decodeUploadName(req.body.relative_path);
      }
    }
    next(err);
  });

  const out = wrap(multerInstance);
  for (const method of ['single', 'array', 'fields', 'none']) {
    if (typeof multerInstance[method] === 'function') {
      out[method] = (...args) => wrap(multerInstance[method](...args));
    }
  }
  return out;
}
