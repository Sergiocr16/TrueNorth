import { ImageResponse } from 'next/og';

/**
 * PWA icons, drawn from the brand compass rather than shipped as binaries, so
 * the mark has one source of truth. `/icons/192` and `/icons/512` are the plain
 * icons; adding `m` (`/icons/512m`) returns the maskable variant, which keeps
 * the mark inside the central 80 % safe area on a full-bleed ground.
 */

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [{ size: '192' }, { size: '512' }, { size: '192m' }, { size: '512m' }];
}

const INK = '#171D2E';
const ACCENT = '#8C9BF5';
const RING = '#495472';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: raw } = await params;
  const maskable = raw.endsWith('m');
  const size = Number.parseInt(raw, 10);

  if (!Number.isFinite(size) || size < 16 || size > 1024) {
    return new Response('Not found', { status: 404 });
  }

  // Maskable icons must survive a circular crop, so the mark shrinks to 80 %.
  const scale = maskable ? 0.62 : 0.78;
  const markSize = Math.round(size * scale);

  return new ImageResponse(
    (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: INK,
        }}
      >
        <svg width={markSize} height={markSize} viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="29" fill="none" stroke={RING} strokeWidth="2.5" />
          <circle cx="32" cy="32" r="3" fill="#EDEFF7" />
          <polygon points="32,6 37,32 32,30 27,32" fill={ACCENT} />
          <polygon points="32,58 37,32 32,34 27,32" fill={RING} />
          <polygon points="6,32 32,27 30,32 32,37" fill={RING} />
          <polygon points="58,32 32,27 34,32 32,37" fill={RING} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
