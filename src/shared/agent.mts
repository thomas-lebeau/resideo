import { Agent } from "undici";

export const agent = new Agent({
  connect: {
    rejectUnauthorized: false,
  },
});
