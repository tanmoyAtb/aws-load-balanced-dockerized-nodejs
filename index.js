const express = require("express");
require("dotenv").config();

const PORT = 8000;
const APP_NAME = process.env.APP_NAME;

const app = express();

app.listen(PORT, () => {
  console.log(`Hello from ${APP_NAME}!`);
});
