
const dns = require("node:dns");

dns.setServers(["8.8.8.8", "8.8.4.4"]);

const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri);

let db;

const connectDB = async () => {
  try {
    await client.connect();

    db = client.db(process.env.DB_NAME);

    console.log("MongoDB connected successfully!");
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
};

const getDB = () => {
  return db;
};

module.exports = { connectDB, getDB };
