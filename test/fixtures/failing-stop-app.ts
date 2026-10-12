import { Lyn } from "#lyn/index";
import { TEST_LYN_CONFIG } from "test/constantsTest";

const app = new Lyn(TEST_LYN_CONFIG).get("/", () => "ok");
const stop = app.stop.bind(app);
app.stop = async () => {
  await stop();
  throw new Error("select * from users where password = 'hunter2'");
};

await app.listen();
console.log("ready");
