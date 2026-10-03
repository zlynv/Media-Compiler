// One-off: upload the brand logo to Cloudinary.
// Usage: $env:CLOUDINARY_URL="<url-from-env>"; node scripts/upload-logo.mjs <local-file>
// Prints public_id + metadata as JSON. Never prints secrets.
import { readFileSync } from "node:fs";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({ secure: true });

const file = process.argv[2];
if (!file) throw new Error("pass a local file path");

const buf = readFileSync(file);
const uploaded = await new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { public_id: "media-compiler/brand/logo", tags: ["media-compiler", "brand"], overwrite: true },
    (err, result) => (err ? reject(err) : resolve(result)),
  );
  stream.end(buf);
});
console.log(
  JSON.stringify(
    {
      publicId: uploaded.public_id,
      secureUrl: uploaded.secure_url,
      width: uploaded.width,
      height: uploaded.height,
      bytes: uploaded.bytes,
      format: uploaded.format,
    },
    null,
    2,
  ),
);
