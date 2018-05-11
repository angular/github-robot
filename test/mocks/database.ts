export class MockDatabaseHost {
  values = new Map<string, any>();

  database() {
    return {
      ref: (path: string) => {
        return {
          once: (_: string) => {
            return Promise.resolve({
              val: () => this.values.get(path)
            });
          },
          set: (value: any) => {
            this.values.set(path, value);
          },
          then: (fct: Function) => fct(this.values.get(path))
        };
      }
    };
  }
}
