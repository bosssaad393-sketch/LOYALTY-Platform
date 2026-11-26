/**
 * Shrinks a photo in the owner's browser before it is sent, cut from the centre: a 640 px square for a menu item, or
 * 600 x 800 (upright) for a gift, which is shown behind the arch of the guest's card. WebP where the browser can make
 * it, JPEG otherwise. Keeps uploads small on venue wifi.
 */
export async function shrinkPhoto(file: File, shape: "square" | "tall" = "square"): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const ratio = shape === "tall" ? 3 / 4 : 1; // width / height
  const cutH = Math.min(bitmap.height, bitmap.width / ratio);
  const cutW = cutH * ratio;
  const outH = Math.min(shape === "tall" ? 800 : 640, Math.round(cutH));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(outH * ratio);
  canvas.height = outH;
  canvas.getContext("2d")!.drawImage(bitmap, (bitmap.width - cutW) / 2, (bitmap.height - cutH) / 2, cutW, cutH, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL("image/webp", 0.8);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.82);
}
