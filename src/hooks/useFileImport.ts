/**
 * useFileImport — File import hook (file processing + drag-and-drop + Cmd+O)
 *
 * Handles:
 * - File selection and processing (HTML, MHTML)
 * - Drag-and-drop overlay with nested element handling
 * - Cmd+O / Ctrl+O keyboard shortcut to open file picker
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CSVRow } from '../types/csv-fields';
import { parseYandexSearchResults, parseMhtmlStreamingAsync } from '../utils/index';

const MAX_FILE_SIZE_MB = 50;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

export interface FileImportResult {
  rows: CSVRow[];
  query: string;
  htmlForBuild: string;
  wizards: unknown[];
}

export interface UseFileImportOptions {
  /** Set false during processing to disable shortcuts and drops */
  enabled: boolean;
  /** Called when a file is successfully parsed */
  onFileProcessed: (data: FileImportResult) => void;
  /** Called when file processing fails */
  onError: () => void;
}

export interface UseFileImportReturn {
  showFileDrop: boolean;
  setShowFileDrop: (show: boolean) => void;
  isDragging: boolean;
  dragHandlers: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  handleFileSelect: (files: FileList) => void;
}

export function useFileImport({
  enabled,
  onFileProcessed,
  onError,
}: UseFileImportOptions): UseFileImportReturn {
  const [showFileDrop, setShowFileDrop] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  // Stable refs for callbacks
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onFileProcessedRef = useRef(onFileProcessed);
  onFileProcessedRef.current = onFileProcessed;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // File processing
  const handleFileSelect = useCallback(async (files: FileList) => {
    if (!files || files.length === 0) return;

    setShowFileDrop(false);

    const file = files[0];

    if (file.size > MAX_FILE_SIZE_BYTES) {
      console.error(`File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB (max ${MAX_FILE_SIZE_MB} MB)`);
      onErrorRef.current();
      return;
    }

    try {
      let rows: CSVRow[] = [];
      let htmlForBuild = '';
      let fileWizards: unknown[] = [];

      if (file.name.endsWith('.mhtml') || file.name.endsWith('.mht')) {
        const text = await file.text();
        const mhtmlResult = await parseMhtmlStreamingAsync(text, {});
        const htmlContent = mhtmlResult.html;
        if (!htmlContent) throw new Error('Failed to extract HTML from MHTML');
        htmlForBuild = htmlContent;

        const result = parseYandexSearchResults(htmlContent, mhtmlResult.fullMhtml);
        if (result.error) throw new Error(result.error);

        rows = result.rows;
        fileWizards = result.wizards || [];
      } else if (file.name.endsWith('.html') || file.name.endsWith('.htm')) {
        const text = await file.text();
        htmlForBuild = text;

        const result = parseYandexSearchResults(text, text);
        if (result.error) throw new Error(result.error);

        rows = result.rows;
        fileWizards = result.wizards || [];
      } else {
        throw new Error('Only HTML and MHTML files are supported');
      }

      if (rows.length === 0) {
        throw new Error('No data found for import');
      }

      const query = rows[0]?.['#query'] || file.name.replace(/\.(m?html?)$/i, '');

      onFileProcessedRef.current({
        rows,
        query,
        htmlForBuild,
        wizards: fileWizards,
      });
    } catch (error) {
      console.error('File processing error:', error);
      onErrorRef.current();
    }
  }, []);

  // Drag handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files') && enabledRef.current) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files && files.length > 0 && enabledRef.current) {
        handleFileSelect(files);
      }
    },
    [handleFileSelect]
  );

  // Cmd+O / Ctrl+O keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault();
        if (enabledRef.current) {
          setShowFileDrop(true);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    showFileDrop,
    setShowFileDrop,
    isDragging,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
    handleFileSelect,
  };
}
