"use client";

import React from "react";

export type Column<T> = {
  key: keyof T | string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right";
  muted?: boolean;
};

type RowActions<T> = {
  primaryText: string;
  secondaryText?: string;
  onPrimary: (row: T) => void;
  onSecondary?: (row: T) => void;
  showIf?: (row: T) => boolean;
};

export default function DataTable<T extends { id: string }>({
  rows,
  columns,
  actions,
}: {
  rows: T[];
  columns: Column<T>[];
  actions?: RowActions<T>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-white/60">
            {columns.map((c) => (
              <th
                key={String(c.key)}
                className={`py-3 px-3 font-semibold text-xs uppercase tracking-wide ${
                  c.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {c.header}
              </th>
            ))}
            {actions && <th className="py-3 px-3 text-right text-xs">Action</th>}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length + (actions ? 1 : 0)}
                className="py-10 text-center text-white/45"
              >
                No data
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const showAction = actions?.showIf ? actions.showIf(r) : true;

              return (
                <tr
                  key={r.id}
                  className="border-t border-white/10 hover:bg-white/[0.03] transition"
                >
                  {columns.map((c) => (
                    <td
                      key={String(c.key)}
                      className={`py-3 px-3 ${
                        c.align === "right" ? "text-right" : "text-left"
                      } ${c.muted ? "text-white/60" : "text-white/90"}`}
                    >
                      {c.render
                        ? c.render(r)
                        : String((r as Record<string, unknown>)[String(c.key)] ?? "")}
                    </td>
                  ))}

                  {actions && (
                    <td className="py-3 px-3 text-right">
                      {showAction ? (
                        <div className="flex justify-end gap-2">
                          {actions.secondaryText && actions.onSecondary && (
                            <button
                              onClick={() => actions.onSecondary?.(r)}
                              className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/80 hover:bg-white/[0.06] active:scale-[.98] transition"
                            >
                              {actions.secondaryText}
                            </button>
                          )}
                          <button
                            onClick={() => actions.onPrimary(r)}
                            className="rounded-xl bg-[#F7B500] px-3 py-2 text-xs font-semibold text-black hover:brightness-110 active:scale-[.98] transition"
                          >
                            {actions.primaryText}
                          </button>
                        </div>
                      ) : (
                        <span className="text-white/30 text-xs">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
