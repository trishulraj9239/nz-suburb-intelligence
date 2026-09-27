"use client";

/**
 * TRI-127 — a ~256 px aerial thumbnail centred on the pin, built from four
 * LINZ basemap tiles at z18 (the same CC BY 4.0 service and public key the
 * map already uses). Nothing is proxied or stored. The caption names the
 * aerial layer and its capture years so a 2024 photo is never read as today.
 */

const KEY = process.env.NEXT_PUBLIC_LINZ_API_KEY;
const Z = 18;
const TILE = 256;
const SIZE = 256;

function tileXY(lng: number, lat: number) {
  const n = 2 ** Z;
  const x = ((lng + 180) / 360) * n;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

export function AerialThumb({ lng, lat, caption }: { lng: number; lat: number; caption: string }) {
  if (!KEY) return null;
  const { x, y } = tileXY(lng, lat);
  // Place a 2×2 tile mosaic so the pin lands at the centre of the viewport.
  const x0 = Math.floor(x - 0.5);
  const y0 = Math.floor(y - 0.5);
  const left = SIZE / 2 - (x - x0) * TILE;
  const top = SIZE / 2 - (y - y0) * TILE;
  const tiles = [
    [x0, y0],
    [x0 + 1, y0],
    [x0, y0 + 1],
    [x0 + 1, y0 + 1],
  ];
  return (
    <figure className="m-0" data-testid="aerial-thumb">
      <div className="relative overflow-hidden rounded border border-hairline" style={{ width: SIZE, height: SIZE, maxWidth: "100%" }}>
        {tiles.map(([tx, ty]) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${tx}-${ty}`}
            alt=""
            aria-hidden
            src={`https://basemaps.linz.govt.nz/v1/tiles/aerial/WebMercatorQuad/${Z}/${tx}/${ty}.webp?api=${KEY}`}
            width={TILE}
            height={TILE}
            loading="lazy"
            className="absolute max-w-none"
            style={{ left: left + (tx - x0) * TILE, top: top + (ty - y0) * TILE }}
          />
        ))}
        <span
          aria-hidden
          className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-harbour shadow"
          style={{ left: SIZE / 2, top: SIZE / 2 }}
        />
      </div>
      <figcaption className="mt-1 font-mono text-[10px] leading-snug text-ink/50">{caption}</figcaption>
    </figure>
  );
}
