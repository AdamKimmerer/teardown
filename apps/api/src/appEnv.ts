// What middleware puts on the Hono context for route handlers to read.
export type AppEnv = {
  Variables: {
    userId: string;
  };
};
