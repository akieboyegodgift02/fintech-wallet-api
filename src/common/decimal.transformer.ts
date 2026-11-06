/**
 * Postgres returns DECIMAL columns as strings (e.g. "750.50").
 * This converts them to real numbers when reading from the database.
 */
export const decimalTransformer = {
  to: (value?: number) => value,
  from: (value?: string | null) =>
    value === null || value === undefined ? value : parseFloat(value),
};