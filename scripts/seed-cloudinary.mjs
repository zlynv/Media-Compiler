// One-off: upload deterministic demo seed assets to Cloudinary.
// Usage: $env:CLOUDINARY_URL="<url-from-env>"; node scripts/seed-cloudinary.mjs
// Prints public_id + real metadata as JSON. Never prints secrets.
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({ secure: true });

const SEEDS = [
  { key: "asset_clean", seed: "mc-clean", w: 1920, h: 1280, publicId: "media-compiler/product-studio-clean" },
  { key: "asset_fixable", seed: "mc-master", w: 1920, h: 1280, publicId: "media-compiler/product-master" },
  { key: "asset_unrepairable", seed: "mc-poster", w: 1600, h: 1200, publicId: "media-compiler/poster-7" },
];

const out = [];
for (const s of SEEDS) {
  const src = `https://picsum.photos/seed/${s.seed}/${s.w}/${s.h}`;
  const res = await fetch(src);
  if (!res.ok) throw new Error(`download failed for ${s.key}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const uploaded = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: s.publicId, tags: ["media-compiler", "seed"], overwrite: true },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    stream.end(buf);
  });
  out.push({
    key: s.key,
    publicId: uploaded.public_id,
    secureUrl: uploaded.secure_url,
    width: uploaded.width,
    height: uploaded.height,
    bytes: uploaded.bytes,
    format: uploaded.format,
  });
}
console.log(JSON.stringify(out, null, 2));
