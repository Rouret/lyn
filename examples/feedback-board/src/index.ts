import { createApp } from "./app";

// TODO(lyn): env variables can't have defaults, so PORT is read by hand.
const port = Number(Bun.env.PORT ?? 3000);

await createApp().listen(port);
