import { canOpenInBrowser } from './sanitize';

/** Saves a blob as a file in the browser's downloads. */
export const saveBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/**
 * Opens a PDF, image or text file in a new tab; any other type is downloaded instead (an HTML or SVG file
 * opened from a blob: address would run as part of this site, with the user's login).
 */
export const openOrSaveBlob = (blob: Blob, fileName: string) => {
    if (!canOpenInBrowser(blob.type)) {
        saveBlob(blob, fileName);
        return;
    }
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
};
