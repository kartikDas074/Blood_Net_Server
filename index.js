const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
dotenv.config();

const app = express();
const PORT = process.env.PORT;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get("/", (req, res) => {
  res.send("Hello World!");
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
