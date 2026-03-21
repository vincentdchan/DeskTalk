import React, { useEffect, useState } from 'react';
import { useCommand, useEvent } from '@desktalk/sdk';
import type { HtmlPreviewFile, PreviewActionState } from '../types';
import { HtmlViewport } from './HtmlViewport';
import { PreviewToolbar } from './PreviewToolbar';
import { matchesPreviewFilePath } from '../preview-paths';
import styles from '../PreviewApp.module.css';

interface HtmlPreviewPaneProps {
  initialPath?: string;
  onActionStateChange: (state: PreviewActionState) => void;
}

export function HtmlPreviewPane({ initialPath, onActionStateChange }: HtmlPreviewPaneProps) {
  const [htmlFile, setHtmlFile] = useState<HtmlPreviewFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openHtmlFile = useCommand<{ path: string }, HtmlPreviewFile>('preview.open-html');

  useEvent<{ filePath: string; content: string }>('preview.file-changed', (data) => {
    if (!matchesPreviewFilePath(data.filePath, htmlFile?.path ?? initialPath)) {
      return;
    }

    setHtmlFile((currentFile) =>
      currentFile
        ? {
            ...currentFile,
            content: data.content,
          }
        : currentFile,
    );
  });

  useEffect(() => {
    if (!initialPath) {
      return;
    }

    openHtmlFile({ path: initialPath })
      .then(setHtmlFile)
      .catch((err) => setError(String(err)));
  }, [initialPath, openHtmlFile]);

  useEffect(() => {
    onActionStateChange({
      mode: 'html',
      streaming: false,
      file: htmlFile
        ? {
            name: htmlFile.name,
            path: htmlFile.path,
            kind: 'html',
          }
        : null,
    });
  }, [htmlFile, onActionStateChange]);

  if (htmlFile) {
    return (
      <>
        <PreviewToolbar filename={htmlFile.name} mode="html" />
        <HtmlViewport html={htmlFile.content} />
      </>
    );
  }

  if (error) {
    return (
      <div className={styles.errorState}>
        <span className={styles.errorIcon}>{'\u26A0'}</span>
        <span>{error}</span>
      </div>
    );
  }

  return <div className={styles.emptyState}>Loading HTML...</div>;
}
