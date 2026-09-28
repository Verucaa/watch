import { clearRecent, useFavs, useRecent } from "../lib/store.js";
import { store } from "../lib/kv.js";
import { Section } from "../lib/card.jsx";
import { Icon, Empty, toast } from "../lib/ui.jsx";

export default function List() {
    const favs = useFavs();
    const recent = useRecent();
    const kb = (store.bytes() / 1024).toFixed(0);

    return (
        <div className="wrap grid gap-8 py-6">
            <div>
                <p className="eyebrow">Koleksi</p>
                <h1 className="font-title text-[clamp(24px,6vw,40px)]">Daftar Saya</h1>
                <p className="mt-1 text-xs text-mist">
                    Cache lokal {kb} KB · {store.keys().length} entri
                </p>
            </div>

            {recent.length ? (
                <section>
                    <div className="mb-3.5 flex items-end justify-between gap-3">
                        <h2 className="font-title text-lg">Riwayat Tonton</h2>
                        <button
                            type="button"
                            className="btn btn-icon"
                            title="Hapus riwayat"
                            aria-label="Hapus riwayat"
                            onClick={() => {
                                clearRecent();
                                toast("Riwayat dihapus", "ok");
                            }}
                        >
                            <Icon name="trash" className="h-[19px] w-[19px]" />
                        </button>
                    </div>
                    <Section items={recent} mode="rail" />
                </section>
            ) : null}

            {favs.length ? <Section eyebrow="Favorit" title="Disimpan" items={favs} mode="rail" /> : null}

            {!favs.length && !recent.length ? <Empty title="Belum ada apa-apa" sub="Tekan ikon hati pada judul untuk menyimpannya." /> : null}

            <div>
                <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                        store.clear();
                        toast("Cache dibersihkan", "ok");
                    }}
                >
                    <Icon name="trash" />Bersihkan cache
                </button>
            </div>
        </div>
    );
}
