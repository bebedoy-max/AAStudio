import JSZip from "jszip";

export type ZipFileEntry = {
  url: string;
  filename: string;
};

/**
 * Fetch a list of remote files and download them as a single .zip archive.
 * Files that fail to fetch are skipped so one broken URL never kills the export.
 */
export async function downloadFilesAsZip(
  files: ZipFileEntry[],
  zipName: string,
): Promise<void> {
  if (!files.length) return;

  const zip = new JSZip();
  let added = 0;

  await Promise.all(
    files.map(async (file, index) => {
      try {
        const res = await fetch(file.url);
        if (!res.ok) return;
        const blob = await res.blob();
        const name = file.filename || `file-${index + 1}`;
        zip.file(name, blob);
        added += 1;
      } catch {
        // skip unreachable file
      }
    }),
  );

  if (added === 0) return;

  const blob = await zip.generateAsync({ type: "blob" });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = zipName.toLowerCase().endsWith(".zip") ? zipName : `${zipName}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
}

export default downloadFilesAsZip;
