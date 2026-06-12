import { Children } from 'react'

export default function TableRows({ isLoading, colSpan, emptyMessage, children }) {
  const hasRows = Children.count(children) > 0

  if (isLoading) {
    return (
      <tbody>
        <tr>
          <td colSpan={colSpan} className="table-state">
            <span className="spinner" aria-label="Loading table data" role="status" />
            <span>Loading...</span>
          </td>
        </tr>
      </tbody>
    )
  }

  return (
    <tbody>
      {hasRows ? children : <tr><td className="table-state" colSpan={colSpan}>{emptyMessage}</td></tr>}
    </tbody>
  )
}
