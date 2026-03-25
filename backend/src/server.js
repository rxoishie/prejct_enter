const app = require("./app");
const env = require("./config/env");

app.listen(env.port, () => {
  console.log(`SmartIrri backend running on port ${env.port}`);
});
