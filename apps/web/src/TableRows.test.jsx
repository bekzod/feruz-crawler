import { expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TableRows from "./TableRows.jsx";

test("renders a full-width loading spinner row while table data is loading", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      "table",
      null,
      React.createElement(
        TableRows,
        { isLoading: true, colSpan: 4, emptyMessage: "No rows." },
        React.createElement("tr", null, React.createElement("td", null, "loaded"))
      )
    )
  );

  expect(html).toContain('colSpan="4"');
  expect(html).toContain('role="status"');
  expect(html).toContain('aria-label="Loading table data"');
  expect(html).toContain("Loading...");
  expect(html).not.toContain("loaded");
  expect(html).not.toContain("No rows.");
});
