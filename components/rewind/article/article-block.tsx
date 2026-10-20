import type { ArticleBlock, ArticleText } from "@/lib/rewind/article/blocks"

/** Article text: tokens as tabular numbers that never wrap, titles in italics in their own direction. */
export function ArticleTextView({ text }: { text: ArticleText }) {
  return text.map((segment, i) => {
    if (segment.kind === "text") return segment.text
    if (segment.kind === "title") {
      return (
        <i key={i} dir="auto">
          {segment.text}
        </i>
      )
    }
    return (
      <span key={i} className="tok font-display whitespace-nowrap tabular-nums" dir="auto">
        {segment.text}
      </span>
    )
  })
}

const cell = "border-b border-current/40 py-1.5 pr-3 text-left align-top [overflow-wrap:anywhere]"

/**
 * One article block (P5.12). Every block is static HTML: a page's headline is
 * an `h3` under its section's `h2`, tables keep their captions and scoped
 * headers, and graphics are their summary text.
 */
export function ArticleBlockView({ block }: { block: ArticleBlock }) {
  switch (block.kind) {
    case "heading":
      return (
        <h3 className="font-lead text-2xl leading-tight">
          <ArticleTextView text={block.text} />
        </h3>
      )
    case "paragraph":
      return (
        <p>
          <ArticleTextView text={block.text} />
        </p>
      )
    case "factRow":
      return (
        <ul className="flex flex-wrap gap-x-6 gap-y-2" data-testid="rewind-article-facts">
          {block.items.map((item) => (
            <li key={`${item.value} ${item.label}`}>
              <span className="font-display text-xl font-bold tabular-nums">{item.value}</span> {item.label}
            </li>
          ))}
        </ul>
      )
    case "rankedList":
      return (
        <div>
          <p className="font-display font-semibold">{block.label}</p>
          <ol className="mt-1 flex flex-col gap-1">
            {block.items.map((item) => (
              <li key={item.rank} value={item.rank} className="flex gap-3">
                <span className="font-display tabular-nums" aria-hidden>
                  {String(item.rank).padStart(2, "0")}
                </span>
                <span>
                  <span dir="auto">{item.title}</span>
                  {item.detail && <>, {item.detail}</>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )
    case "table":
      return (
        <table className="w-full table-fixed border-collapse" data-testid="rewind-article-table">
          <caption className="pb-2 text-left italic">{block.table.caption}</caption>
          <thead>
            <tr>
              {block.table.columns.map((column) => (
                <th key={column} scope="col" className={`${cell} font-display font-semibold`}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.table.rows.map((row, r) => (
              <tr key={r}>
                {row.map((value, c) =>
                  c === 0 ? (
                    <th key={c} scope="row" className={`${cell} font-normal`}>
                      {value}
                    </th>
                  ) : (
                    <td key={c} className={`${cell} tabular-nums`} dir="auto">
                      {value}
                    </td>
                  )
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case "definitionList":
      return (
        <div>
          {block.label && <p className="font-display font-semibold">{block.label}</p>}
          <dl className="mt-1 flex flex-col gap-2" data-testid="rewind-article-dl">
            {block.entries.map((entry) => (
              <div key={entry.term}>
                <dt className="font-display font-semibold">{entry.term}</dt>
                <dd>
                  <ArticleTextView text={entry.detail} />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )
    case "figure":
      return <p data-testid="rewind-article-figure">{block.summary}</p>
    case "note":
      return (
        <p className="italic">
          <ArticleTextView text={block.text} />
        </p>
      )
  }
}
