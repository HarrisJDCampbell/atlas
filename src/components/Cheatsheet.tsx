// The ? overlay. Same source as docs/CHEATSHEET.md, so the two never drift.
import sheet from "../cheatsheet.json";

export default function Cheatsheet({ close }: { close: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-black/60 py-[6vh] backdrop-blur-sm" onMouseDown={close}>
      <div className="rise w-[960px] max-w-[94vw]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h1 className="label text-ink-2">{sheet.title}</h1>
          <button onClick={close} className="kbd">esc</button>
        </div>
        <div className="columns-2 gap-3">
          {sheet.sections.map((s) => (
            <section key={s.title} className="hud mb-3 break-inside-avoid p-3.5">
              <div className="label mb-2">{s.title}</div>
              {s.rows.map(([k, v]) => (
                <div key={k} className="flex gap-3 border-t border-line py-1.5 first:border-0">
                  <span className="selectable w-[44%] shrink-0 break-words font-mono text-[11.5px] text-ink">{k}</span>
                  <span className="text-[12px] text-ink-2">{v}</span>
                </div>
              ))}
            </section>
          ))}
        </div>
        <p className="font-mono text-[10.5px] text-ink-4">Also in ~/Developer/interview-prep/CHEATSHEET.md · edit src/cheatsheet.json to change it</p>
      </div>
    </div>
  );
}
