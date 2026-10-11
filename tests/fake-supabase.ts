/** A tiny in-memory stand-in for the parts of supabase-js the server code uses. */
type Row = Record<string, unknown>;

export class FakeDb {
  tables = new Map<string, Row[]>();
  private counter = 0;
  rows(table: string) {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }
  nextId() {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, "0")}`;
  }
  from(table: string) {
    return new Query(this, table);
  }
}

class Query implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private filters: [string, unknown][] = [];
  private nulls: string[] = [];
  private action: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row | Row[] | null = null;
  private onConflict: string[] = [];
  private limitN = Infinity;
  private orderCol: [string, boolean] | null = null;
  private wantsOne = false;
  private columns = "*";
  constructor(
    private db: FakeDb,
    private table: string,
  ) {}
  select(columns = "*") {
    this.columns = columns;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.action = "insert";
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[], options: { onConflict: string }) {
    this.action = "upsert";
    this.payload = payload;
    this.onConflict = options.onConflict.split(",");
    return this;
  }
  update(payload: Row) {
    this.action = "update";
    this.payload = payload;
    return this;
  }
  delete() {
    this.action = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  is(column: string, value: null) {
    if (value === null) this.nulls.push(column);
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.orderCol = [column, options?.ascending !== false];
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.wantsOne = true;
    return this;
  }
  maybeSingle() {
    this.wantsOne = true;
    return this;
  }
  private matches(row: Row) {
    return this.filters.every(([c, v]) => row[c] === v) && this.nulls.every((c) => row[c] == null);
  }
  private defaults(row: Row): Row {
    return { id: this.db.nextId(), created_at: new Date().toISOString(), ...row };
  }
  private run() {
    const rows = this.db.rows(this.table);
    let out: Row[] = [];
    if (this.action === "insert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      for (const item of list) {
        const row = this.defaults(item);
        rows.push(row);
        out.push(row);
      }
    } else if (this.action === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      for (const item of list) {
        const existing = rows.find((row) => this.onConflict.every((c) => row[c] === item[c]));
        if (existing) {
          Object.assign(existing, item);
          out.push(existing);
        } else {
          const row = this.defaults(item);
          rows.push(row);
          out.push(row);
        }
      }
    } else if (this.action === "update") {
      for (const row of rows)
        if (this.matches(row)) {
          Object.assign(row, this.payload);
          out.push(row);
        }
    } else if (this.action === "delete") {
      const keep = rows.filter((row) => !this.matches(row));
      this.db.tables.set(this.table, keep);
    } else {
      out = rows.filter((row) => this.matches(row));
    }
    if (this.orderCol) {
      const [col, asc] = this.orderCol;
      out = [...out].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    out = out.slice(0, this.limitN);
    return { data: this.wantsOne ? (out[0] ?? null) : out, error: null };
  }
  then<T1, T2>(
    onfulfilled?:
      | ((value: { data: unknown; error: { message: string } | null }) => T1 | PromiseLike<T1>)
      | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ) {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}
