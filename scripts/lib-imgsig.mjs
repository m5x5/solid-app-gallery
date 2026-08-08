// Perceptual image signature (average hash) + Hamming distance, for de-duping
// near-identical screenshots and caching their vision tags across re-captures.
import sharp from "sharp";

const SIDE = 16; // 16x16 grayscale => 256-bit hash

// Returns a 256-char "01" string average-hash for an image buffer.
export async function aHash(buffer) {
  const { data } = await sharp(buffer)
    .greyscale()
    .resize(SIDE, SIDE, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const avg = sum / data.length;
  let bits = "";
  for (let i = 0; i < data.length; i++) bits += data[i] >= avg ? "1" : "0";
  return bits;
}

// Number of differing bits between two equal-length hash strings.
export function hamming(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

// Convert any image buffer to webp at the given path.
export async function toWebp(buffer, outPath, quality = 80) {
  await sharp(buffer).webp({ quality }).toFile(outPath);
}
