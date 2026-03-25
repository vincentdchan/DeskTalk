import { useEffect, useRef, useState } from 'react';
import type { ThemePreferences } from '../theme';
import { loadMiniAppModule } from '../miniapp-runtime';
import type { MiniAppFrontendModule } from '../miniapp-runtime';

interface MiniAppThemeUpdateDetail {
  windowId: string;
  miniAppId: string;
  theme: {
    accentColor: string;
    mode: 'light' | 'dark';
  };
}

function MiniAppLoadError({ miniAppId, message }: { miniAppId: string; message: string }) {
  return (
    <div style={{ padding: 24, color: 'var(--dt-text-muted)' }}>
      <h3>{miniAppId}</h3>
      <p>{message}</p>
    </div>
  );
}

export function MiniAppWindow({
  miniAppId,
  windowId,
  args,
  themePreferences,
}: {
  miniAppId: string;
  windowId: string;
  args?: Record<string, unknown>;
  themePreferences: ThemePreferences;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const modRef = useRef<MiniAppFrontendModule | null>(null);
  const activationRef = useRef<{ deactivate(): void } | null>(null);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent<MiniAppThemeUpdateDetail>('desktalk:theme-update', {
        detail: {
          windowId,
          miniAppId,
          theme: {
            accentColor: themePreferences.accentColor,
            mode: themePreferences.theme,
          },
        },
      }),
    );
  }, [miniAppId, themePreferences.accentColor, themePreferences.theme, windowId]);

  useEffect(() => {
    let cancelled = false;

    void loadMiniAppModule(miniAppId)
      .then((loadedMod) => {
        if (!cancelled && containerRef.current) {
          modRef.current = loadedMod;
          activationRef.current = loadedMod.activate({
            root: containerRef.current,
            miniAppId,
            windowId,
            args,
            theme: {
              accentColor: themePreferences.accentColor,
              mode: themePreferences.theme,
            },
          } as import('@desktalk/sdk').MiniAppFrontendContext);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError((err as Error).message);
        }
      });

    return () => {
      cancelled = true;
      const activation = activationRef.current;
      activationRef.current = null;
      modRef.current = null;
      if (activation) {
        queueMicrotask(() => {
          activation.deactivate();
        });
      }
    };
  }, [args, miniAppId, windowId]);

  if (error) {
    return <MiniAppLoadError miniAppId={miniAppId} message={error} />;
  }

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}
