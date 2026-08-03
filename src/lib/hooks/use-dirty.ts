import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Melacak apakah ada perubahan yang belum disimpan.
 *
 * Pemakaian:
 *   const { dirty, markSaved, resetBaseline } = useDirty({ name, email }, !loading);
 *   <button disabled={!dirty || saving}>Simpan</button>
 *   // setelah save sukses: markSaved()
 *
 * @param value  state form saat ini (object/primitive apa pun yang JSON-serializable)
 * @param ready  set false selama data awal masih loading agar baseline
 *               diambil dari data yang sudah termuat, bukan state kosong.
 */
export function useDirty<T>(value: T, ready = true) {
  const serialize = (v: T) => {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  };

  const current = serialize(value);
  const currentRef = useRef(current);
  currentRef.current = current;

  const [baseline, setBaseline] = useState<string | null>(ready ? current : null);

  useEffect(() => {
    if (ready) setBaseline((b) => (b === null ? currentRef.current : b));
    else setBaseline(null);
  }, [ready]);

  const markSaved = useCallback(() => {
    setBaseline(currentRef.current);
  }, []);

  /** Paksa baseline mengikuti nilai terbaru (mis. setelah reload data dari server). */
  const resetBaseline = useCallback(() => {
    setBaseline(currentRef.current);
  }, []);

  const dirty = baseline !== null && baseline !== current;

  return { dirty, markSaved, resetBaseline };
}
