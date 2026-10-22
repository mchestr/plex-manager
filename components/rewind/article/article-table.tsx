import type { PageTable } from "@/lib/rewind/registry"

const cell = "border-b border-current/40 py-1.5 pr-3 text-left align-top [overflow-wrap:anywhere]"

/** An article table (P5.12): its caption, scoped column headers and a row header per row. */
export function ArticleTable({ table }: { table: PageTable }) {
  return (
    <table className="w-full table-fixed border-collapse" data-testid="rewind-article-table">
      <caption className="pb-2 text-left italic">{table.caption}</caption>
      <thead>
        <tr>
          {table.columns.map((column) => (
            <th key={column} scope="col" className={`${cell} font-display font-semibold`}>
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, r) => (
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
}
