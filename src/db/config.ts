import { Dialect, Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const configs = {
  username: process.env.DB_USERNAME as string,
  password: process.env.DB_PASSWORD as string,
  database: process.env.DB_NAME as string,
  host: process.env.DB_HOST as string,
  dialect: process.env.DB_DIALECT as Dialect,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  timezone: process.env.TIME_ZONE,
};

export const sequelize = new Sequelize(
  configs.database,
  configs.username,
  configs.password,
  {
    host: configs.host,
    dialect: configs.dialect,
    port: configs.port,
    timezone: "Asia/Tehran",
    dialectOptions: {
      timezone: "local",
      // fail faster if DB doesn't respond
      connectTimeout: 10000,
    },
    pool: {
      max: 10, // Maximum connections in the pool
      min: 0, // Minimum connections in the pool // IMPORTANT: don't keep idle connections open
      acquire: 50000, // Wait up to 50 seconds to acquire a connection
      idle: 20000, // Close idle connections after 20 seconds
    },
    logging: false,
  }
);

