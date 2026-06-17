#!/usr/bin/env node

import { createConnection } from "node:net";
import os from "node:os";
import path from "node:path";

const socketPath =
  process.env.LOCAL_CUA_APP_SOCKET ||
  path.join(os.tmpdir(), `local-computer-use-${process.getuid()}.sock`);

const socket = createConnection(socketPath);

socket.once("connect", () => {
  process.stdin.pipe(socket);
  socket.pipe(process.stdout);
});

socket.once("error", (error) => {
  console.error(
    [
      `Unable to connect to Local Computer Use app host at ${socketPath}.`,
      "Open the Local Computer Use Dev Manager app or run `npm run start:app-host`, then retry.",
      error.message,
    ].join("\n"),
  );
  process.exit(1);
});

socket.once("close", () => {
  process.stdin.unpipe(socket);
});
