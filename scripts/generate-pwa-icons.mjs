#!/usr/bin/env node
/**
 * Gera os ícones do aplicativo instalável (PWA) a partir de public/logo.png (512x512, fundo transparente).
 *   node scripts/generate-pwa-icons.mjs
 * Usa o `sharp`, que já vem com o Next.js. Saída em public/icons/:
 *   icon-192.png, icon-512.png          — ícone comum (logo sobre o fundo escuro da marca, #111820)
 *   icon-maskable-512.png               — "maskable": logo dentro da zona segura (o Android recorta em círculo/arredondado)
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";

const BACKGROUND = "#111820";
mkdirSync("public/icons", { recursive: true });

async function icon(size, logoRatio, file) {
  const logoSize = Math.round(size * logoRatio);
  const logo = await sharp("public/logo.png").resize(logoSize, logoSize, { fit: "contain" }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: logo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(file);
  console.log("gerado", file, `${size}x${size}`);
}

await icon(192, 0.8, "public/icons/icon-192.png");
await icon(512, 0.8, "public/icons/icon-512.png");
await icon(512, 0.58, "public/icons/icon-maskable-512.png");
